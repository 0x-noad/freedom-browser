/**
 * Coverage for the bounded/retried `npm ci` wrapper the
 * `.github/actions/install-node-deps` composite action runs (#379).
 *
 * The behaviours that matter are the ones a green CI run never exercises: an
 * attempt that never returns, a retry that has to clean up after it, and the
 * step-level budget that keeps three attempts from outliving the job's
 * timeout-minutes. They are driven here through an injected runner, plus one
 * real-process test for the part no fake can prove — that a timed-out attempt
 * takes its grandchildren down with it.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_ATTEMPTS,
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  DEFAULT_TOTAL_TIMEOUT_MS,
  electronCacheDir,
  installWithRetries,
  resolveBudget,
  spawnBounded,
} = require('./npm-ci-hardening');

/** Injected runner returning a scripted sequence of attempt outcomes. */
function scriptedRunner(outcomes, { clock } = {}) {
  const calls = [];
  const run = async (options) => {
    calls.push(options);
    const outcome = outcomes[calls.length - 1];
    if (!outcome) {
      throw new Error(`unexpected attempt ${calls.length}`);
    }
    if (clock) {
      // A timed-out attempt burns its whole bound; anything else is quick.
      clock.advance(outcome.timedOut ? options.timeoutMs : outcome.elapsedMs || 1000);
    }
    return { code: outcome.code ?? null, timedOut: Boolean(outcome.timedOut) };
  };
  return { run, calls };
}

function fakeClock(start = 1_000_000) {
  let value = start;
  return {
    now: () => value,
    advance: (ms) => {
      value += ms;
    },
  };
}

describe('npm-ci-hardening install loop', () => {
  test('a first-attempt success runs npm ci once and asks for no cleanup', async () => {
    const clock = fakeClock();
    const { run, calls } = scriptedRunner([{ code: 0 }], { clock });
    const clean = jest.fn();

    const result = await installWithRetries({ run, clean, now: clock.now });

    expect(result).toEqual({ ok: true, attemptsUsed: 1, reason: '' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: 'npm', args: ['ci'] });
    expect(clean).not.toHaveBeenCalled();
  });

  test('ignoreScripts is passed through to npm', async () => {
    const clock = fakeClock();
    const { run, calls } = scriptedRunner([{ code: 0 }], { clock });

    await installWithRetries({ ignoreScripts: true, run, clean: jest.fn(), now: clock.now });

    expect(calls[0].args).toEqual(['ci', '--ignore-scripts']);
  });

  test('a stalled attempt is retried after node_modules is cleaned', async () => {
    const clock = fakeClock();
    const { run, calls } = scriptedRunner([{ timedOut: true }, { code: 0 }], { clock });
    const clean = jest.fn();

    const result = await installWithRetries({
      run,
      clean,
      now: clock.now,
      attemptTimeoutMs: 60_000,
      totalBudgetMs: 600_000,
      cwd: '/repo',
    });

    expect(result).toMatchObject({ ok: true, attemptsUsed: 2 });
    expect(calls).toHaveLength(2);
    expect(clean).toHaveBeenCalledTimes(1);
    expect(clean).toHaveBeenCalledWith('/repo');
  });

  test('a non-zero exit is retried too', async () => {
    const clock = fakeClock();
    const { run, calls } = scriptedRunner([{ code: 1 }, { code: 1 }, { code: 0 }], { clock });

    const result = await installWithRetries({ run, clean: jest.fn(), now: clock.now });

    expect(result).toMatchObject({ ok: true, attemptsUsed: 3 });
    expect(calls).toHaveLength(3);
  });

  test('three failed attempts fail the step rather than hanging', async () => {
    const clock = fakeClock();
    const { run, calls } = scriptedRunner([{ code: 1 }, { code: 1 }, { code: 1 }], { clock });

    const result = await installWithRetries({ run, clean: jest.fn(), now: clock.now });

    expect(result.ok).toBe(false);
    expect(result.attemptsUsed).toBe(3);
    expect(result.reason).toMatch(/failed after 3 attempts/);
    expect(calls).toHaveLength(3);
  });

  // The retry loop is only useful if the whole of it still fits inside the
  // job's timeout-minutes: three unbounded 420s attempts would add up to 21
  // minutes, and most jobs in ci.yml cap themselves at 15. The step budget is
  // what turns that into a reported failure instead of a cancellation.
  test('the step budget caps a later attempt rather than starting a full one', async () => {
    const clock = fakeClock();
    const { run, calls } = scriptedRunner([{ timedOut: true }, { timedOut: true }], { clock });

    const result = await installWithRetries({
      run,
      clean: jest.fn(),
      now: clock.now,
      attempts: 3,
      attemptTimeoutMs: 420_000,
      totalBudgetMs: 600_000,
    });

    expect(calls.map((call) => call.timeoutMs)).toEqual([420_000, 180_000]);
    expect(result.ok).toBe(false);
    // Third attempt never starts: 0s of the 600s budget is left for it.
    expect(result.attemptsUsed).toBe(2);
    expect(result.reason).toMatch(/ran out of its 600s budget after 2 attempts/);
  });

  test('the defaults keep the whole step inside the smallest job cap', () => {
    // ci.yml's tightest `timeout-minutes` is 15; checkout + setup-node + the
    // apt legs run before this one.
    expect(DEFAULT_ATTEMPTS * DEFAULT_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(DEFAULT_TOTAL_TIMEOUT_MS);
    expect(DEFAULT_TOTAL_TIMEOUT_MS).toBeLessThan(15 * 60 * 1000);
    // ...and still leave room for the slowest healthy install observed on a
    // Windows runner (251s on run 35150253743).
    expect(DEFAULT_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(251_000);
  });
});

describe('npm-ci-hardening budget resolution', () => {
  test('defaults apply when nothing is set', () => {
    expect(resolveBudget({})).toEqual({
      attempts: DEFAULT_ATTEMPTS,
      attemptTimeoutMs: DEFAULT_ATTEMPT_TIMEOUT_MS,
      totalBudgetMs: DEFAULT_TOTAL_TIMEOUT_MS,
    });
  });

  test('environment overrides are read in seconds', () => {
    expect(
      resolveBudget({
        FREEDOM_CI_NPM_ATTEMPTS: '2',
        FREEDOM_CI_NPM_ATTEMPT_TIMEOUT: '30',
        FREEDOM_CI_NPM_TOTAL_TIMEOUT: '90',
      })
    ).toEqual({ attempts: 2, attemptTimeoutMs: 30_000, totalBudgetMs: 90_000 });
  });

  test('a nonsense override falls back to the default instead of disabling the bound', () => {
    expect(resolveBudget({ FREEDOM_CI_NPM_ATTEMPT_TIMEOUT: '0' }).attemptTimeoutMs).toBe(
      DEFAULT_ATTEMPT_TIMEOUT_MS
    );
    expect(resolveBudget({ FREEDOM_CI_NPM_ATTEMPTS: 'lots' }).attempts).toBe(DEFAULT_ATTEMPTS);
    expect(resolveBudget({ FREEDOM_CI_NPM_TOTAL_TIMEOUT: ' ' }).totalBudgetMs).toBe(
      DEFAULT_TOTAL_TIMEOUT_MS
    );
  });
});

describe('npm-ci-hardening Electron cache directory', () => {
  // These have to match `env-paths('electron', { suffix: '' }).cache`, which is
  // what `@electron/get` v5 defaults its cache root to — a wrong path here is
  // a silently useless `actions/cache` entry, not a failure.
  test('linux', () => {
    expect(electronCacheDir({ platform: 'linux', env: {}, homedir: '/home/runner' })).toBe(
      '/home/runner/.cache/electron'
    );
  });

  test('linux honours XDG_CACHE_HOME', () => {
    expect(
      electronCacheDir({ platform: 'linux', env: { XDG_CACHE_HOME: '/xdg' }, homedir: '/home/runner' })
    ).toBe('/xdg/electron');
  });

  test('macOS', () => {
    expect(electronCacheDir({ platform: 'darwin', env: {}, homedir: '/Users/runner' })).toBe(
      '/Users/runner/Library/Caches/electron'
    );
  });

  test('windows', () => {
    expect(
      electronCacheDir({
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:\\Users\\runneradmin\\AppData\\Local' },
        homedir: 'C:\\Users\\runneradmin',
      })
    ).toBe(path.join('C:\\Users\\runneradmin\\AppData\\Local', 'electron', 'Cache'));
  });
});

// POSIX only: the Windows leg kills through `taskkill /T`, which has no
// equivalent to assert here.
const describeTree = process.platform === 'win32' ? describe.skip : describe;

describeTree('npm-ci-hardening process bound', () => {
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  const waitUntilGone = async (pid, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!alive(pid)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  };

  test('a command that never returns is killed at the bound, along with its children', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-ci-hardening-'));
    const pidFile = path.join(dir, 'grandchild.pid');
    let grandchildPid = null;

    try {
      // Stand-in for `npm ci`: a process whose *child* is the one that stalls,
      // the shape the Electron postinstall download has. Signalling only the
      // command we started would leave that child running.
      const child = `
        const fs = require('fs');
        const child_process = require('child_process');
        const grandchild = child_process.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        fs.writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid));
        setInterval(() => {}, 1000);
      `;

      const started = Date.now();
      const result = await spawnBounded({
        command: process.execPath,
        args: ['-e', child],
        cwd: dir,
        timeoutMs: 1500,
      });
      const elapsed = Date.now() - started;

      expect(result.timedOut).toBe(true);
      expect(result.code).not.toBe(0);
      // Bounded, not hung: the 30s SIGKILL grace is the only slack.
      expect(elapsed).toBeLessThan(30_000);

      grandchildPid = Number(fs.readFileSync(pidFile, 'utf8'));
      expect(Number.isInteger(grandchildPid)).toBe(true);
      await expect(waitUntilGone(grandchildPid)).resolves.toBe(true);
    } finally {
      if (grandchildPid && alive(grandchildPid)) {
        try {
          process.kill(grandchildPid, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test('a command that exits cleanly inside the bound reports success', async () => {
    const result = await spawnBounded({
      command: process.execPath,
      args: ['-e', 'process.exit(0)'],
      cwd: os.tmpdir(),
      timeoutMs: 20_000,
    });

    expect(result).toEqual({ code: 0, timedOut: false });
  }, 30_000);

  test('a command that fails inside the bound reports its exit code', async () => {
    const result = await spawnBounded({
      command: process.execPath,
      args: ['-e', 'process.exit(7)'],
      cwd: os.tmpdir(),
      timeoutMs: 20_000,
    });

    expect(result).toEqual({ code: 7, timedOut: false });
  }, 30_000);
});
