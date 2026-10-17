/**
 * The page-realm `window.vault` surface.
 *
 * This file is a template string compiled in the page's own world, so nothing
 * typechecks it and nothing else in the repo imports its method names. A rename
 * on one side of the postMessage boundary would be silent — hence the literal
 * assertions, the same shape the IPC policy drift test uses.
 */

const VAULT_INJECT_SOURCE = require('./vault-provider-inject');

describe('the injected provider', () => {
  test('is syntactically valid source', () => {
    expect(() => new Function(VAULT_INJECT_SOURCE)).not.toThrow();
  });

  test('exposes readShared, routed to the method main dispatches on', () => {
    expect(VAULT_INJECT_SOURCE).toContain('readShared:');
    expect(VAULT_INJECT_SOURCE).toContain("'vault_getSharedData'");
  });

  test('passes the owner origin through, since a path list alone cannot name one', () => {
    const call = /readShared: function \(([^)]*)\)[\s\S]{0,200}?vault_getSharedData'[^}]*\}/.exec(
      VAULT_INJECT_SOURCE,
    );
    expect(call).not.toBeNull();
    expect(call[1].split(',').map((s) => s.trim())).toEqual(['sessionId', 'origin', 'paths']);
    expect(call[0]).toContain('origin: origin');
  });

  test('does not offer a cross-origin write or subscribe', () => {
    // Read only is a property of the design, not an omission to be tidied up
    // later: there is no cross-origin write path in the engine at all.
    expect(VAULT_INJECT_SOURCE).not.toMatch(/vault_setSharedData|vault_subscribeShared/);
  });

  test('still exposes the own-partition surface it had', () => {
    for (const method of [
      'vault_connect',
      'vault_getData',
      'vault_setData',
      'vault_patchData',
      'vault_subscribe',
      'vault_unsubscribe',
      'vault_getPermissions',
      'vault_revoke',
      'vault_requestUnlock',
    ]) {
      expect(VAULT_INJECT_SOURCE).toContain(`'${method}'`);
    }
  });
});
