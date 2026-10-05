#!/usr/bin/env node
//
// What flaked in CI over the last N days (#535), as Markdown on stdout.
//
// Two sources, both of which outlive the job logs:
//
//   1. Runs `auto-retry.yml` re-ran. Attempt 2's log replaces attempt 1's, so
//      the evidence left is the attempt-1 job list (which job, which step, or
//      no steps at all when no runner ever picked the job up) and each job's
//      check-run annotations.
//   2. Tests Playwright itself retried. `playwright.config.js` adds the
//      `github` reporter on Actions, which writes an error annotation for every
//      test that failed *or* passed only on a retry (`flaky`). A green job that
//      carries such an annotation hid a flake that auto-retry never saw.
//
// Usage:
//   node scripts/ci/flake-report.js [--days 7] [--max-calls 500] [--repo owner/name]
//
// Needs `gh` authenticated with `actions: read` and `checks: read`.
// `.github/workflows/flake-report.yml` runs it weekly into its step summary.

const { execFileSync } = require('child_process');

const WORKFLOWS = ['ci.yml', 'release.yml'];
// A clean Playwright job has exactly one annotation: the github reporter's
// "Playwright Run Summary" notice. Anything above that is worth fetching.
const PLAYWRIGHT_BASELINE_ANNOTATIONS = 1;
// Jobs that run Playwright: every `e2e-*` job, `myotis-native-e2e`, and
// release.yml's `smoke-*` legs. Only these are worth an annotations call.
const PLAYWRIGHT_JOB = /e2e|smoke/i;
// The workflow's GITHUB_TOKEN gets 1,000 REST calls an hour. The retry half
// costs a few calls per re-run run (about 75 a week as of #535, ~300 calls);
// the Playwright half grows with every run, so it alone is capped, newest
// runs first, and the report says when it stopped short.
const DEFAULT_MAX_CALLS = 500;

function parseArgs(argv) {
  const opts = {
    days: 7,
    maxCalls: DEFAULT_MAX_CALLS,
    repo: process.env.GH_REPO || process.env.GITHUB_REPOSITORY || '',
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days') opts.days = Number(argv[++i]);
    else if (argv[i] === '--max-calls') opts.maxCalls = Number(argv[++i]);
    else if (argv[i] === '--repo') opts.repo = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!Number.isFinite(opts.days) || opts.days <= 0)
    throw new Error('--days must be a positive number');
  if (!Number.isInteger(opts.maxCalls) || opts.maxCalls <= 0)
    throw new Error('--max-calls must be a positive integer');
  if (!/^[^/\s]+\/[^/\s]+$/.test(opts.repo))
    throw new Error('--repo owner/name (or GH_REPO) is required');
  return opts;
}

// `gh api --paginate` prints one JSON document per page; with --jq '.x[]' and
// `-c` each element lands on its own line.
let calls = 0;
function ghLines(path, jq) {
  calls++;
  const out = execFileSync('gh', ['api', '--paginate', path, '--jq', jq], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function failedStep(job) {
  if (!job.steps || job.steps.length === 0) return 'never started';
  const step = job.steps.find((s) => ['failure', 'cancelled', 'timed_out'].includes(s.conclusion));
  return step ? step.name : 'unknown step';
}

const FAILED = new Set(['failure', 'cancelled', 'timed_out']);
// ci.yml's `ci-ok` only reports whether the others passed; it fails whenever
// any of them did, so counting it would double every row.
const AGGREGATE_JOBS = new Set(['ci-ok']);

// Short, stable cause for one failed job, from its failed step and its
// failure annotations. Playwright's github reporter titles its annotation with
// the test ("[harness] › test-e2e/x.spec.js:12:3 › describe › title"); GitHub's
// own runner annotations carry the message instead. Order matters: a job its
// concurrency group cancelled says so even when it had started a test step.
function causeOf({ step, annotations }) {
  const failures = annotations.filter((a) => a.annotation_level === 'failure');
  const superseded = failures.find((a) => /higher priority waiting request/.test(a.message));
  if (superseded) return { kind: 'superseded', label: 'cancelled for a newer run' };
  const tests = [...new Set(failures.map((a) => a.title).filter((t) => t && t.includes('›')))];
  if (tests.length) return { kind: 'test', label: tests.join(' ; ') };
  const runner = failures.find((a) =>
    /not acquired by Runner|lost communication|runner .* shutdown/i.test(a.message)
  );
  if (runner) return { kind: 'infra', label: `runner: ${oneLine(runner.message)}` };
  // No steps and no runner message: the run was cancelled while this job was
  // still queued, which is not something the job did.
  if (step === 'never started') return { kind: 'cancelled', label: 'cancelled before it started' };
  // Anchored: "Run find + … + downloads E2E" is a test step, not a download.
  if (/^(install|set up|check ?out|download|restore|cache)\b/i.test(step)) {
    return { kind: 'infra', label: `step: ${step}` };
  }
  const exceeded = failures.find((a) => /exceeded the maximum execution time/i.test(a.message));
  if (exceeded) return { kind: 'hang', label: `${step}: ${oneLine(exceeded.message)}` };
  // The jest job prints `::error::[npm-ci-hardening] …` from that script's own
  // unit tests; outside an install step those are output, not the cause.
  const other = failures.find(
    (a) =>
      !/^Process completed with exit code/.test(a.message) &&
      !/^\[npm-ci-hardening\]/.test(a.message)
  );
  return { kind: 'unknown', label: `${step}${other ? `: ${oneLine(other.message)}` : ''}` };
}

function oneLine(text) {
  return String(text || '')
    .split('\n')[0]
    .replace(/\|/g, '\\|')
    .slice(0, 160);
}

// Tests the github reporter flagged in a job that still ended green: those
// passed on a Playwright retry.
function flakyTestsOf(annotations) {
  return [
    ...new Set(
      annotations
        .filter((a) => a.annotation_level === 'failure' && a.title && a.title.includes('›'))
        .map((a) => a.title)
    ),
  ];
}

function rank(rows, keyOf) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const entry = counts.get(key) || { key, count: 0, examples: [] };
    entry.count++;
    if (entry.examples.length < 3) entry.examples.push(row.url);
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function render({ days, since, runsScanned, retried, flaky, flakyRunsScanned = runsScanned }) {
  const out = [];
  out.push(`## CI flake report — last ${days} day(s), since ${since}`, '');
  out.push(
    `Scanned ${runsScanned} CI/Release run(s). ${retried.length} job(s) failed on attempt 1 of a run ` +
      `that was re-run; ${flaky.length} green job(s) carried a test Playwright passed only on retry.`,
    ''
  );
  if (flakyRunsScanned < runsScanned) {
    out.push(
      `Playwright retries: only the newest ${flakyRunsScanned} of ${runsScanned} runs were scanned ` +
        `(API call budget); re-run locally with a larger \`--max-calls\` for the rest.`,
      ''
    );
  }
  out.push('### Ranked: jobs that needed an auto-retry', '');
  if (retried.length === 0) out.push('None.', '');
  else {
    out.push('| # | Kind | Job · cause | Attempt 2 | Runs |', '|---|---|---|---|---|');
    rank(retried, (r) => `${r.kind}\u0000${r.job}\u0000${r.cause}\u0000${r.retry}`).forEach((e) => {
      const [kind, job, cause, retry] = e.key.split('\u0000');
      out.push(
        `| ${e.count} | ${kind} | \`${job}\` · ${cause} | ${retry} | ${e.examples.map((u, i) => `[${i + 1}](${u})`).join(' ')} |`
      );
    });
    out.push('');
  }
  out.push('### Ranked: tests that passed only on a Playwright retry', '');
  if (flaky.length === 0) out.push('None.', '');
  else {
    out.push('| # | Test | Job | Runs |', '|---|---|---|---|');
    rank(flaky, (r) => `${r.test}\u0000${r.job}`).forEach((e) => {
      const [test, job] = e.key.split('\u0000');
      out.push(
        `| ${e.count} | ${test.replace(/\|/g, '\\|')} | \`${job}\` | ${e.examples.map((u, i) => `[${i + 1}](${u})`).join(' ')} |`
      );
    });
    out.push('');
  }
  return out.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - opts.days * 86_400_000).toISOString().slice(0, 10);
  const repo = `repos/${opts.repo}`;

  const runs = WORKFLOWS.flatMap((wf) =>
    ghLines(
      `${repo}/actions/workflows/${wf}/runs?created=>=${since}&per_page=100`,
      '.workflow_runs[] | {id, run_attempt, check_suite_id, html_url, name, head_branch, conclusion} | tojson'
    )
  );

  const retried = [];
  for (const run of runs.filter((r) => r.run_attempt >= 2)) {
    const first = ghLines(
      `${repo}/actions/runs/${run.id}/attempts/1/jobs?per_page=100`,
      '.jobs[] | tojson'
    );
    const last = ghLines(
      `${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
      '.jobs[] | tojson'
    );
    for (const job of first.filter(
      (j) => FAILED.has(j.conclusion) && !AGGREGATE_JOBS.has(j.name)
    )) {
      const annotations = ghLines(
        `${repo}/check-runs/${job.id}/annotations?per_page=100`,
        '.[] | tojson'
      );
      const step = failedStep(job);
      const cause = causeOf({ step, annotations });
      const again = last.find((j) => j.name === job.name);
      retried.push({
        job: job.name,
        kind: cause.kind,
        cause: cause.label,
        retry: again ? again.conclusion || again.status : 'not re-run',
        url: job.html_url || run.html_url,
      });
    }
  }

  const flaky = [];
  let flakyRunsScanned = 0;
  // Newest first, so a budget cut drops the oldest runs.
  const scanStart = calls;
  for (const run of [...runs].sort((a, b) => b.id - a.id)) {
    if (calls - scanStart >= opts.maxCalls) break;
    flakyRunsScanned++;
    const checks = ghLines(
      `${repo}/check-suites/${run.check_suite_id}/check-runs?per_page=100`,
      '.check_runs[] | {id, name, conclusion, html_url, n: .output.annotations_count} | tojson'
    );
    for (const check of checks.filter(
      (c) =>
        c.conclusion === 'success' &&
        PLAYWRIGHT_JOB.test(c.name) &&
        c.n > PLAYWRIGHT_BASELINE_ANNOTATIONS
    )) {
      const annotations = ghLines(
        `${repo}/check-runs/${check.id}/annotations?per_page=100`,
        '.[] | tojson'
      );
      for (const test of flakyTestsOf(annotations))
        flaky.push({ test, job: check.name, url: check.html_url });
    }
  }

  process.stdout.write(
    render({ days: opts.days, since, runsScanned: runs.length, retried, flaky, flakyRunsScanned }) +
      '\n'
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`flake-report: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { parseArgs, failedStep, causeOf, flakyTestsOf, rank, render };
