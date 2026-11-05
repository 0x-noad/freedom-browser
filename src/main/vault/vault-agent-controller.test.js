/**
 * The Agent's vault boundary: the translation layer, and the input contract.
 *
 * The rules about what may be read are tested against the real engine in
 * data-vault-agent-read.test.js, and the input contract with every other
 * operation's in automation/contract/operations.test.js. What matters here is
 * that this class adds none of its own — it must pass the caller's origin and
 * pointers through untouched, because the vault resolves an origin itself and
 * anything normalized on the way would be laundered past that.
 */

const { VaultAgentController } = require('./vault-agent-controller');

describe('VaultAgentController', () => {
  test('refuses to exist without a way to reach the manager', () => {
    expect(() => new VaultAgentController({})).toThrow(/getManager/);
  });

  test('reports the capability unavailable when no vault is registered', async () => {
    const controller = new VaultAgentController({ getManager: () => null });

    await expect(
      controller.readShared({ origin: 'https://a.example', paths: ['/shared/x'] })
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
    await expect(controller.listShared()).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
  });

  test('passes the origin and pointers through exactly as given', async () => {
    const agentGetShared = jest.fn(async () => ({ locked: false, values: {} }));
    const controller = new VaultAgentController({
      getManager: () => ({ agentGetShared, agentSharedSources: () => ({}) }),
    });

    // A trailing dot and an uppercase host are the vault's to accept or refuse.
    await controller.readShared({ origin: 'https://A.Example.', paths: ['/shared/x'] });

    expect(agentGetShared).toHaveBeenCalledWith('https://A.Example.', ['/shared/x']);
  });

  test('reads the manager per call, so it never holds a stale one', async () => {
    const first = { agentSharedSources: () => ({ sources: ['first'] }) };
    const second = { agentSharedSources: () => ({ sources: ['second'] }) };
    let current = first;
    const controller = new VaultAgentController({ getManager: () => current });

    expect(await controller.listShared()).toEqual({ sources: ['first'] });
    current = second;
    expect(await controller.listShared()).toEqual({ sources: ['second'] });
  });
});
