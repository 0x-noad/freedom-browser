// docs/security-audit-electron.md, O-12: FREEDOM_TEST_MODE=1 used to switch
// the E2E harness (stub protocols, `test:*` IPC) on in shipped builds too.

const fs = require('fs');
const path = require('path');
const { isTestModeRequested } = require('./test-mode');

const ON = { FREEDOM_TEST_MODE: '1' };
const open = () => true;
const closed = () => false;

describe('isTestModeRequested', () => {
  test('the source tree follows the env var', () => {
    expect(isTestModeRequested({ env: ON, isPackaged: false, inspectorOpen: closed })).toBe(true);
    expect(isTestModeRequested({ env: {}, isPackaged: false, inspectorOpen: open })).toBe(false);
    expect(isTestModeRequested({ env: { FREEDOM_TEST_MODE: 'true' }, isPackaged: false })).toBe(
      false
    );
  });

  test('a packaged build ignores the env var on its own', () => {
    expect(isTestModeRequested({ env: ON, isPackaged: true, inspectorOpen: closed })).toBe(false);
  });

  test('a packaged build honours it only under an attached inspector (a Playwright launch)', () => {
    expect(isTestModeRequested({ env: ON, isPackaged: true, inspectorOpen: open })).toBe(true);
    // The inspector alone is not a request for the harness.
    expect(isTestModeRequested({ env: {}, isPackaged: true, inspectorOpen: open })).toBe(false);
  });

  test('a throwing or odd inspector probe counts as closed', () => {
    expect(isTestModeRequested({ env: ON, isPackaged: true, inspectorOpen: () => 'yes' })).toBe(
      false
    );
  });

  // The rule only holds if nothing reads the env var around it.
  test('no main-process module reads FREEDOM_TEST_MODE except test-mode.js', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          entry.name.endsWith('.js') &&
          !entry.name.endsWith('.test.js') &&
          full !== path.join(__dirname, 'test-mode.js')
        ) {
          const code = fs
            .readFileSync(full, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
          // A read: `process.env.FREEDOM_TEST_MODE`, `env['FREEDOM_TEST_MODE']`,
          // `const { FREEDOM_TEST_MODE } = process.env` (a log line naming it
          // is fine).
          const reads =
            /\benv\s*(\.|\[\s*['"`])\s*FREEDOM_TEST_MODE/.test(code) ||
            /FREEDOM_TEST_MODE[^}]*\}\s*=\s*[\w.]*env\b/.test(code);
          if (reads) offenders.push(path.relative(__dirname, full));
        }
      }
    };
    walk(path.join(__dirname, '..'));
    expect(offenders).toEqual([]);
  });
});
