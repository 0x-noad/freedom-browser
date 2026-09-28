/**
 * Whether the E2E test harness (src/main/test-harness.js: stub protocols,
 * `test:*` IPC, fixture-served content) may be switched on for this process.
 * Every reader of FREEDOM_TEST_MODE goes through here so the rule lives in one
 * place.
 *
 * docs/security-audit-electron.md, O-12: the harness used to follow the
 * `FREEDOM_TEST_MODE=1` env var alone, in shipped builds too. Now:
 *
 *   source tree (`!app.isPackaged`)                     → env var decides
 *   packaged build, env var + a Node inspector attached → on
 *   packaged build otherwise                            → off, always
 *
 * The packaged exception exists for the release smoke tests
 * (test-e2e/packaged, `npm run test:e2e:packaged` in release.yml), which drive
 * the *shipped* binary through the harness. Playwright's `_electron.launch()`
 * always starts the app with `--inspect=0`, and a process with the inspector
 * open already hands anyone who can reach it the whole main process — far more
 * than the harness adds. So the env var alone (a stray export, a launcher
 * script, another program's environment) no longer turns the harness on in a
 * shipped build; only a launch that has already given away the main process
 * does. The inspector check is read once, at startup: attaching one later
 * (`SIGUSR1`) does not switch the harness on.
 */

function inspectorIsOpen() {
  try {
    return typeof require('inspector').url() === 'string';
  } catch {
    return false;
  }
}

/**
 * @param {Object} [options]
 * @param {Object} [options.env]
 * @param {boolean} [options.isPackaged]
 * @param {() => boolean} [options.inspectorOpen]
 */
function isTestModeRequested({
  env = process.env,
  isPackaged = require('electron').app?.isPackaged === true,
  inspectorOpen = inspectorIsOpen,
} = {}) {
  if (env.FREEDOM_TEST_MODE !== '1') return false;
  if (!isPackaged) return true;
  return inspectorOpen() === true;
}

module.exports = { isTestModeRequested };
