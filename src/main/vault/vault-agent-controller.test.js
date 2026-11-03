/**
 * The Agent's vault boundary: the translation layer, and the input contract.
 *
 * The rules about what may be read are tested against the real engine in
 * data-vault-agent-read.test.js. What matters here is that this class adds
 * none of its own — it must pass the caller's origin and pointers through
 * untouched, because the vault resolves an origin itself and anything
 * normalized on the way would be laundered past that.
 */

const { VaultAgentController } = require('./vault-agent-controller');
const { validateOperationInput } = require('../automation/contract/operations');
const { OPERATIONS } = require('../automation/contract/operations');

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

describe('the vault_read_shared input contract', () => {
  const read = (input) => validateOperationInput(OPERATIONS.VAULT_READ_SHARED, input);

  test('accepts an origin and pointers', () => {
    expect(read({ origin: 'https://a.example', paths: ['/shared/x', '/shared/y'] })).toEqual({
      origin: 'https://a.example',
      paths: ['/shared/x', '/shared/y'],
    });
  });

  test('drops anything else the caller sends', () => {
    expect(
      read({ origin: 'https://a.example', paths: ['/shared/x'], namespace: 'web:other' })
    ).toEqual({
      origin: 'https://a.example',
      paths: ['/shared/x'],
    });
  });

  test('requires an origin', () => {
    expect(() => read({ paths: ['/shared/x'] })).toThrow();
  });

  test('requires at least one pointer, rather than reading everything', () => {
    expect(() => read({ origin: 'https://a.example', paths: [] })).toThrow(/non-empty/);
  });

  test('refuses more pointers than one read may name', () => {
    const paths = Array.from({ length: 33 }, (_, i) => `/shared/p${i}`);
    expect(() => read({ origin: 'https://a.example', paths })).toThrow(/at most 32/);
  });

  test('refuses something that is not a pointer', () => {
    expect(() => read({ origin: 'https://a.example', paths: ['shared/x'] })).toThrow(
      /JSON pointer/
    );
    expect(() => read({ origin: 'https://a.example', paths: [42] })).toThrow();
  });
});
