/**
 * The classification and ranking half of scripts/ci/flake-report.js (#535).
 * The `gh` half is a thin loop over the REST API and is exercised by running
 * the script (`node scripts/ci/flake-report.js --days 7 --repo owner/name`).
 */

const { parseArgs, failedStep, causeOf, flakyTestsOf, render } = require('./flake-report');

const failure = (message, title = '') => ({ annotation_level: 'failure', message, title });

describe('failedStep', () => {
  test('a job with no steps never reached a runner', () => {
    expect(failedStep({ steps: [] })).toBe('never started');
  });

  test('names the first failed, cancelled or timed-out step', () => {
    const steps = [
      { name: 'Install dependencies', conclusion: 'success' },
      { name: 'Run E2E', conclusion: 'cancelled' },
      { name: 'Upload', conclusion: 'failure' },
    ];
    expect(failedStep({ steps })).toBe('Run E2E');
  });
});

describe('causeOf', () => {
  test('a Playwright annotation names the test, ahead of the exit-code line', () => {
    const cause = causeOf({
      step: 'Run tabs E2E',
      annotations: [
        failure('Process completed with exit code 1.'),
        failure(
          'Error: boom',
          '[harness] › test-e2e/tabs.spec.js:163:1 › clicking a tab activates it'
        ),
      ],
    });
    expect(cause).toEqual({
      kind: 'test',
      label: '[harness] › test-e2e/tabs.spec.js:163:1 › clicking a tab activates it',
    });
  });

  test('a job no runner acquired is infra, not a hang (#535)', () => {
    const cause = causeOf({
      step: 'never started',
      annotations: [
        failure('The job was not acquired by Runner of type hosted even after multiple attempts'),
      ],
    });
    expect(cause.kind).toBe('infra');
    expect(cause.label).toMatch(/^runner: The job was not acquired by Runner/);
  });

  test('a failed install step is infra', () => {
    const cause = causeOf({
      step: 'Install dependencies',
      annotations: [failure('Process completed with exit code 1.')],
    });
    expect(cause).toEqual({ kind: 'infra', label: 'step: Install dependencies' });
  });

  test('a test step that ran out of time is a hang', () => {
    const cause = causeOf({
      step: 'Run E2E',
      annotations: [
        failure(
          'The job running on runner X has exceeded the maximum execution time of 15 minutes.'
        ),
      ],
    });
    expect(cause.kind).toBe('hang');
  });

  test('otherwise the step and the first non-generic message', () => {
    const cause = causeOf({
      step: 'Run unit tests',
      annotations: [failure('Process completed with exit code 1.'), failure('jest: 1 failed | x')],
    });
    expect(cause).toEqual({ kind: 'unknown', label: 'Run unit tests: jest: 1 failed \\| x' });
  });
});

describe('flakyTestsOf', () => {
  test('keeps test-titled failure annotations, once each', () => {
    const t = '[harness] › test-e2e/a.spec.js:1:1 › a';
    expect(
      flakyTestsOf([
        failure('first try', t),
        failure('second try', t),
        { annotation_level: 'notice', title: '🎭 Playwright Run Summary', message: '1 flaky' },
        { annotation_level: 'warning', title: 'Slow Test', message: 'x took 3m' },
      ])
    ).toEqual([t]);
  });
});

describe('render', () => {
  test('ranks by count and links example runs', () => {
    const md = render({
      days: 7,
      since: '2026-09-28',
      runsScanned: 10,
      flakyRunsScanned: 4,
      retried: [
        {
          kind: 'infra',
          job: 'e2e-x (macos-latest)',
          cause: 'runner: not acquired',
          retry: 'success',
          url: 'u1',
        },
        {
          kind: 'infra',
          job: 'e2e-x (macos-latest)',
          cause: 'runner: not acquired',
          retry: 'success',
          url: 'u2',
        },
        { kind: 'test', job: 'e2e-tabs', cause: 't', retry: 'success', url: 'u3' },
      ],
      flaky: [{ test: 'a | b', job: 'e2e-tabs', url: 'u4' }],
    });
    const rows = md.split('\n').filter((l) => /^\| \d/.test(l));
    expect(rows[0]).toBe(
      '| 2 | infra | `e2e-x (macos-latest)` · runner: not acquired | success | [1](u1) [2](u2) |'
    );
    expect(rows[1]).toBe('| 1 | test | `e2e-tabs` · t | success | [1](u3) |');
    expect(rows[2]).toBe('| 1 | a \\| b | `e2e-tabs` | [1](u4) |');
    expect(md).toContain('only the newest 4 of 10 runs were scanned');
  });

  test('says None. for empty sections', () => {
    const md = render({ days: 7, since: 'x', runsScanned: 0, retried: [], flaky: [] });
    expect(md.match(/^None\.$/gm)).toHaveLength(2);
  });
});

describe('parseArgs', () => {
  test('defaults and validation', () => {
    expect(parseArgs(['--repo', 'o/r'])).toEqual({ days: 7, maxCalls: 700, repo: 'o/r' });
    expect(() => parseArgs(['--repo', 'o/r', '--days', '0'])).toThrow(/--days/);
    expect(() => parseArgs(['--repo', 'o/r', '--max-calls', '-1'])).toThrow(/--max-calls/);
    expect(() => parseArgs(['--repo', 'nope'])).toThrow(/--repo/);
  });
});
