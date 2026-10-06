/**
 * scripts/ci/hang-watchdog.sh (#544): a command that finishes keeps its own
 * exit status; one that outlives the deadline is reported (process table plus
 * a stack of every process in its tree) and killed — the whole tree, not just
 * the top process — with status 124.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'hang-watchdog.sh');
const maybe = process.platform === 'win32' ? describe.skip : describe;

function watchdog(args, timeout = 30_000) {
  return spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', timeout });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

maybe('hang-watchdog.sh', () => {
  test('passes a finished command through, exit status and output included', () => {
    const result = watchdog(['10', 'bash', '-c', 'echo done; exit 3']);
    expect(result.status).toBe(3);
    expect(result.stdout).toBe('done\n');
  });

  test('a command past the deadline is diagnosed, killed with its children, and fails 124', () => {
    // The child records its own pid and its grandchild's, then hangs.
    const result = watchdog(['2', 'bash', '-c', 'sleep 300 & echo "pids $$ $!"; wait']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(124);
    expect(result.stdout).toMatch(/::error title=hang-watchdog::.*still running after 2s/);
    expect(result.stdout).toMatch(/hang-watchdog: process table/);
    const [, parent, child] = result.stdout.match(/pids (\d+) (\d+)/);
    expect(result.stdout).toContain(`hang-watchdog: stack of pid ${parent} `);
    expect(result.stdout).toContain(`hang-watchdog: stack of pid ${child} `);
    expect(alive(Number(parent))).toBe(false);
    expect(alive(Number(child))).toBe(false);
  });

  test('rejects a missing or non-numeric deadline', () => {
    expect(watchdog(['soon', 'true']).status).toBe(2);
    expect(watchdog(['10']).status).toBe(2);
  });
});
