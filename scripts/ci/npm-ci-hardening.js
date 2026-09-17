#!/usr/bin/env node

/**
 * Deterministic `npm ci` for CI runners.
 *
 * Why this exists
 * ---------------
 * `npm ci` intermittently hangs forever on GitHub-hosted runners and the only
 * thing that ends it is the job's `timeout-minutes` (#379: seven jobs across
 * four PRs in one week, plus main's own run and an 82-minute arm64 nightly).
 * The step logs nothing before hanging and the runner's cleanup reports
 * `Terminate orphan process: pid (…) (npm ci)`; a rerun always passes, so it
 * is a network stall rather than a dependency problem. `npm ci` has no
 * wall-clock bound of its own: `fetch-timeout` is per-request, and the
 * lifecycle scripts it runs (Electron's postinstall pulls a ~100 MB zip from
 * GitHub releases through `@electron/get`) have no timeout at all.
 *
 * A timeout-minutes cancellation is the worst possible shape for this: the job
 * burns its whole budget, the conclusion reads "cancelled" rather than
 * "failed", and on `main` it turns the branch red without saying why.
 * `scripts/ci/apt-hardening.sh` solved exactly this for apt; this is the npm
 * equivalent, and it is a Node script rather than a shell one because it has
 * to run identically on the Linux, macOS and Windows legs (`timeout(1)` ships
 * on none of the latter two by default).
 *
 * What this does about it
 * -----------------------
 *   * Runs `npm ci` under a per-attempt wall-clock bound and retries it, up to
 *     3 attempts, removing `node_modules` between attempts so a retry is a
 *     clean install rather than a resume of a half-written tree.
 *   * Bounds the *whole* step as well as each attempt. Three unbounded-length
 *     attempts would add up to more than the 15 minutes most jobs in
 *     `.github/workflows/ci.yml` allow themselves, which would put us straight
 *     back to a cancellation; the total budget is what guarantees the step
 *     fails as a real failure, with a message, inside the job's cap.
 *   * Kills the whole process tree on a timeout, not just `npm` itself — the
 *     stall is usually inside a grandchild (the Electron postinstall's
 *     download), which would otherwise survive and keep holding the runner.
 *
 * Sizing (measured, not round numbers)
 * ------------------------------------
 * Across two healthy CI runs (35154835232, 35150253743) the "Install
 * dependencies" step took 7-44s on Linux, 10-75s on macOS and 30-251s on
 * Windows — the slow end being a full `npm ci` whose Electron postinstall
 * downloads the zip. The per-attempt default of 420s is ~1.7x the slowest
 * healthy install observed, and the Electron download cache the composite
 * action restores removes most of what made that install slow in the first
 * place. The 600s total means the step reports a real failure around the
 * 10-minute mark, comfortably inside the smallest job cap (15 minutes) even
 * after checkout, setup-node and the apt legs have taken their share.
 *
 * Usage:
 *   node scripts/ci/npm-ci-hardening.js [--ignore-scripts]
 *
 * Tunables (environment):
 *   FREEDOM_CI_NPM_ATTEMPTS          attempts                (default 3)
 *   FREEDOM_CI_NPM_ATTEMPT_TIMEOUT   seconds per attempt     (default 420)
 *   FREEDOM_CI_NPM_TOTAL_TIMEOUT     seconds for all of them (default 600)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 420_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 600_000;

/** Grace between SIGTERM and SIGKILL for a timed-out attempt. */
const KILL_GRACE_MS = 30_000;

/** A retry that starts with less than this left in the budget cannot finish. */
const MIN_ATTEMPT_MS = 30_000;

const log = (message) => {
  process.stdout.write(`[npm-ci-hardening] ${message}\n`);
};

const warn = (message) => {
  process.stdout.write(`::warning::[npm-ci-hardening] ${message}\n`);
};

const fail = (message) => {
  process.stdout.write(`::error::[npm-ci-hardening] ${message}\n`);
};

/**
 * Read a positive-integer tunable from the environment.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function readPositiveInt(env, name, fallback) {
  const raw = (env[name] ?? '').trim();
  if (raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    warn(`ignoring ${name}=${raw} (expected a positive integer); using ${fallback}`);
    return fallback;
  }
  return value;
}

/**
 * Resolve the attempt/timeout budget from the environment.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ attempts: number, attemptTimeoutMs: number, totalBudgetMs: number }}
 */
function resolveBudget(env = process.env) {
  const attempts = readPositiveInt(env, 'FREEDOM_CI_NPM_ATTEMPTS', DEFAULT_ATTEMPTS);
  const attemptTimeoutMs =
    readPositiveInt(env, 'FREEDOM_CI_NPM_ATTEMPT_TIMEOUT', DEFAULT_ATTEMPT_TIMEOUT_MS / 1000) * 1000;
  const totalBudgetMs =
    readPositiveInt(env, 'FREEDOM_CI_NPM_TOTAL_TIMEOUT', DEFAULT_TOTAL_TIMEOUT_MS / 1000) * 1000;
  return { attempts, attemptTimeoutMs, totalBudgetMs };
}

/**
 * Kill a child and everything it started.
 *
 * `npm ci` is a process tree — the stall we are bounding lives in a grandchild
 * (Electron's postinstall download), so signalling `npm` alone leaves the
 * stalled fetch running and holding the runner. On POSIX the child is spawned
 * detached, which puts it in its own process group we can signal as a unit; on
 * Windows `taskkill /T` walks the tree instead.
 *
 * @param {import('child_process').ChildProcess} child
 * @param {NodeJS.Signals} signal
 */
function killTree(child, signal) {
  if (!child.pid) {
    return;
  }
  if (process.platform === 'win32') {
    const args = ['/pid', String(child.pid), '/T'];
    if (signal === 'SIGKILL') {
      args.push('/F');
    }
    spawn('taskkill', args, { stdio: 'ignore' }).on('error', () => {});
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The group is already gone; nothing to signal.
  }
}

/**
 * Run a command under a wall-clock bound.
 *
 * @param {{ command: string, args: string[], cwd: string, timeoutMs: number, env?: NodeJS.ProcessEnv }} options
 * @returns {Promise<{ code: number|null, timedOut: boolean }>}
 */
function spawnBounded({ command, args, cwd, timeoutMs, env = process.env }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
      // `shell` so `npm` resolves to `npm.cmd` on Windows; `detached` so the
      // POSIX kill above can signal the whole group. The two are mutually
      // exclusive in practice — Windows kills through taskkill /T instead.
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
    });

    let timedOut = false;
    let settled = false;

    const softKill = setTimeout(() => {
      timedOut = true;
      killTree(child, 'SIGTERM');
    }, timeoutMs);
    const hardKill = setTimeout(() => {
      if (timedOut) {
        killTree(child, 'SIGKILL');
      }
    }, timeoutMs + KILL_GRACE_MS);

    const settle = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(softKill);
      clearTimeout(hardKill);
      resolve({ code, timedOut });
    };

    child.on('error', (err) => {
      warn(`could not start ${command}: ${err.message}`);
      settle(null);
    });
    child.on('close', (code) => settle(code));
  });
}

/**
 * Remove `node_modules` so the next attempt installs into a clean tree.
 *
 * A killed `npm ci` leaves a partially written tree behind. `npm ci` does
 * remove `node_modules` itself before installing, but doing it here means the
 * removal is bounded by nothing more than the filesystem, and it keeps the
 * retry honest if the previous attempt died mid-write.
 *
 * @param {string} cwd
 */
function removeNodeModules(cwd) {
  const dir = path.join(cwd, 'node_modules');
  if (!fs.existsSync(dir)) {
    return;
  }
  log('removing the partially installed node_modules before retrying');
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/**
 * Where `@electron/get` keeps the Electron zip it downloads in `postinstall`.
 *
 * This is the single largest thing `npm ci` pulls (~100 MB from GitHub
 * releases, no timeout of its own), so it is the stall source worth caching
 * away entirely. The path is not configurable in this repo — `@electron/get`
 * v5 defaults its cache root to `env-paths('electron', { suffix: '' }).cache`
 * (`node_modules/@electron/get/dist/Cache.js`) — so this mirrors `env-paths`'
 * own rule rather than guessing, and is what the composite action hands to
 * `actions/cache`.
 *
 * @param {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, homedir?: string }} [options]
 * @returns {string}
 */
function electronCacheDir({ platform = process.platform, env = process.env, homedir = os.homedir() } = {}) {
  if (platform === 'darwin') {
    return path.join(homedir, 'Library', 'Caches', 'electron');
  }
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
    return path.join(localAppData, 'electron', 'Cache');
  }
  return path.join(env.XDG_CACHE_HOME || path.join(homedir, '.cache'), 'electron');
}

/**
 * Run `npm ci` with a per-attempt wall-clock bound, retries and a total budget.
 *
 * @param {object} [options]
 * @param {boolean} [options.ignoreScripts] pass `--ignore-scripts` to npm
 * @param {number} [options.attempts]
 * @param {number} [options.attemptTimeoutMs]
 * @param {number} [options.totalBudgetMs]
 * @param {string} [options.cwd]
 * @param {(options: object) => Promise<{ code: number|null, timedOut: boolean }>} [options.run]
 * @param {(cwd: string) => void} [options.clean]
 * @param {() => number} [options.now]
 * @returns {Promise<{ ok: boolean, attemptsUsed: number, reason: string }>}
 */
async function installWithRetries({
  ignoreScripts = false,
  attempts = DEFAULT_ATTEMPTS,
  attemptTimeoutMs = DEFAULT_ATTEMPT_TIMEOUT_MS,
  totalBudgetMs = DEFAULT_TOTAL_TIMEOUT_MS,
  cwd = REPO_ROOT,
  run = spawnBounded,
  clean = removeNodeModules,
  now = Date.now,
} = {}) {
  const args = ignoreScripts ? ['ci', '--ignore-scripts'] : ['ci'];
  const label = `npm ${args.join(' ')}`;
  const startedAt = now();

  log(
    `${label}: up to ${attempts} attempts, ${Math.round(attemptTimeoutMs / 1000)}s per attempt, ` +
      `${Math.round(totalBudgetMs / 1000)}s for the step`
  );

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const remainingMs = totalBudgetMs - (now() - startedAt);
    if (remainingMs < MIN_ATTEMPT_MS) {
      const reason =
        `${label} ran out of its ${Math.round(totalBudgetMs / 1000)}s budget after ` +
        `${attempt - 1} attempts`;
      fail(reason);
      return { ok: false, attemptsUsed: attempt - 1, reason };
    }

    // An attempt never outlives the step's own budget: the point of the bound
    // is that the failure is reported by this script, not by the job's
    // timeout-minutes cancelling everything.
    const boundMs = Math.min(attemptTimeoutMs, remainingMs);
    log(
      `${label}: attempt ${attempt}/${attempts} (bound ${Math.round(boundMs / 1000)}s, ` +
        `${Math.round(remainingMs / 1000)}s left in the step budget)`
    );

    const attemptStartedAt = now();
    const { code, timedOut } = await run({
      command: 'npm',
      args,
      cwd,
      timeoutMs: boundMs,
    });
    const elapsedSeconds = Math.round((now() - attemptStartedAt) / 1000);

    if (!timedOut && code === 0) {
      log(`${label}: succeeded in ${elapsedSeconds}s on attempt ${attempt}`);
      return { ok: true, attemptsUsed: attempt, reason: '' };
    }

    if (timedOut) {
      warn(
        `${label}: no completion within ${Math.round(boundMs / 1000)}s on attempt ${attempt} — ` +
          `the registry or the Electron postinstall download is stalled; killed it and retrying`
      );
    } else {
      warn(`${label}: exited ${code} after ${elapsedSeconds}s on attempt ${attempt}`);
    }

    if (attempt < attempts) {
      clean(cwd);
    }
  }

  const reason = `${label} failed after ${attempts} attempts`;
  fail(
    `${reason}. This is a real failure, not a cancelled job: each attempt was bounded at ` +
      `${Math.round(attemptTimeoutMs / 1000)}s and the step at ${Math.round(totalBudgetMs / 1000)}s. ` +
      `A run of timeouts points at the npm registry or the Electron download; a run of non-zero ` +
      `exits points at the lockfile or a lifecycle script.`
  );
  return { ok: false, attemptsUsed: attempts, reason };
}

module.exports = {
  DEFAULT_ATTEMPTS,
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  DEFAULT_TOTAL_TIMEOUT_MS,
  MIN_ATTEMPT_MS,
  electronCacheDir,
  installWithRetries,
  removeNodeModules,
  resolveBudget,
  spawnBounded,
};

if (require.main === module) {
  // The composite action asks for the cache directory before it installs
  // anything, so the path lives here next to the reason it is that path.
  if (process.argv.includes('--print-electron-cache-dir')) {
    process.stdout.write(`${electronCacheDir()}\n`);
  } else {
    const ignoreScripts = process.argv.includes('--ignore-scripts');
    installWithRetries({ ignoreScripts, ...resolveBudget() })
      .then(({ ok }) => {
        process.exitCode = ok ? 0 : 1;
      })
      .catch((err) => {
        fail(`unexpected error: ${err && err.stack ? err.stack : err}`);
        process.exitCode = 1;
      });
  }
}
