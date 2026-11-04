/**
 * A model's tool call, all the way to the sealed partition and back.
 *
 * Every layer below is already tested on its own: the tool declarations in
 * pi-browser-tools.test.js, the input contract in operations.test.js, the
 * dispatch in automation-controller.test.js, the rules against the real engine
 * in data-vault-agent-read.test.js. Nothing tested the five of them composed,
 * and that is where this capability can go wrong without any one suite
 * noticing — a tool that is declared but never reaches a controller, an input
 * the adapter reshapes on the way, a refusal that becomes an error instead of
 * a null.
 *
 * It found one: both vault tools were missing `tabMode: 'none'`, so the
 * adapter folded the Agent's current tab into the call and reported the read
 * under THAT page's origin and title. Every suite above passed throughout.
 *
 * Only the model is faked here. The SDK stub hands back the tool definitions
 * so they can be invoked exactly as a tool call invokes them; underneath, the
 * controller, the vault, the keystore and the engine are the real ones.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const ipcHandlers = {};
jest.mock('electron', () => ({
  app: { getPath: jest.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: {
    handle: (channel, handler) => {
      ipcHandlers[channel] = handler;
    },
    on: () => {},
    removeHandler: () => {},
  },
  nativeImage: { createFromBuffer: () => null },
  dialog: { showMessageBox: async () => ({ response: 1 }) },
  webContents: { fromId: () => null },
}));

jest.mock('../vault-timer', () => ({ resetVaultAutoLockTimer: jest.fn() }));

const { OPERATIONS } = require('../../shared/automation-operations');

const OWNER_ORIGIN = 'http://owner.localhost:8799';
const OWNER_NS = 'web:http://owner.localhost:8799';

let tmpDir;
let manager;
let perms;
let tools;
/** Flipped by a test to lock the vault under a live runtime. */
let unlocked;
/** The vault's request for an unlock, which an Agent read must never make. */
let ensureUnlocked;
/** Every tool receipt the adapter emits — what the Agent UI is told happened. */
let outcomes;

/** The one fake: a model SDK that hands the tool definitions straight back. */
function fakeModelSdk() {
  const passthrough = jest.fn((tool) => tool);
  return {
    defineTool: passthrough,
    createAgentSession: jest.fn(),
    createBashTool: jest.fn(),
    createEditTool: jest.fn(),
    createExtensionRuntime: jest.fn(),
    createFindTool: jest.fn(),
    createGrepTool: jest.fn(),
    createLsTool: jest.fn(),
    createReadTool: jest.fn(),
    createWriteTool: jest.fn(),
    ModelRuntime: jest.fn(),
    SessionManager: jest.fn(),
    SettingsManager: jest.fn(),
  };
}

const frame = (origin, webContentsId) => ({
  senderFrame: { url: `${origin}/index.html` },
  sender: { id: webContentsId, isDestroyed: () => false, send: () => {} },
});

async function call(event, method, params = {}) {
  const reply = await manager._onRequest(event, { method, params });
  if (reply.error) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
  return reply.result;
}

/** The site connects and writes, publishing whatever lands under /shared. */
async function ownerWrites(values) {
  const event = frame(OWNER_ORIGIN, 11);
  const session = await call(event, 'vault_connect', {
    requestedScopes: [
      {
        methods: ['vault_getData', 'vault_setData'],
        fields: [
          { path: '/shared', read: true, write: true },
          { path: '/private', read: true, write: true },
        ],
      },
    ],
  });
  await call(event, 'vault_setData', { sessionId: session.sessionId, values });
}

/** What the user does on that site's row in the Data pane. */
const userSwitchesAgentOn = (paths = ['/shared']) =>
  perms.grantAgentRead(OWNER_NS, OWNER_ORIGIN, paths, Date.now());

/** Invoke a tool the way a tool call does, and unwrap the envelope it returns. */
async function toolCall(operation, params = {}) {
  const tool = tools.find((candidate) => candidate.name === operation);
  const result = await tool.execute(`call_${operation}`, params, undefined);
  return JSON.parse(result.content[0].text);
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-agent-integration-'));
  jest.resetModules();
  require('electron').app.getPath.mockReturnValue(tmpDir);
  perms = require('./data-vault-permissions');
  perms._resetCache();
  unlocked = true;
  ensureUnlocked = jest.fn(async () => unlocked);
  outcomes = [];

  const { DataVaultManager } = require('./data-vault-manager');
  manager = new DataVaultManager({
    dataDir: tmpDir,
    isAgentEnabled: () => true,
    identityVault: {
      isUnlocked: () => unlocked,
      getMnemonic: () => 'test test test test test test test test test test test junk',
      ensureUnlocked,
    },
    promptConsent: async (req) => ({
      approved: true,
      grantedMethods: (req.requestedScopes || []).flatMap((s) => s.methods || []),
      grantedFields: (req.requestedScopes || []).flatMap((s) => s.fields || []),
      grantedForeignReads: [],
      writePolicy: 'ask-once-per-session',
    }),
  });

  const { AutomationController } = require('../automation/automation-controller');
  const { VaultAgentController } = require('./vault-agent-controller');
  const { createFreedomBrowserTools } = require('../agent/pi-browser-tools');

  const controller = new AutomationController({
    runtimeId: 'runtime_test',
    contextId: 'context_test',
    tabIdFactory: () => 'tab_1',
    policyController: { authorize: async () => ({ allowed: true }) },
  });
  controller.setVaultController(new VaultAgentController({ getManager: () => manager }));

  tools = await createFreedomBrowserTools({
    sdk: fakeModelSdk(),
    controller,
    // The Agent is sitting on some page, as it always is in a real run.
    tabId: 'tab_elsewhere',
    onToolOutcome: (outcome) => outcomes.push(outcome),
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('a model reading published data end to end', () => {
  test('the value the site published arrives at the tool call', async () => {
    await ownerWrites({ '/shared/displayName': 'ada', '/private/secret': 'nope' });
    userSwitchesAgentOn();

    const envelope = await toolCall(OPERATIONS.VAULT_READ_SHARED, {
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName'],
    });

    expect(envelope).toMatchObject({
      ok: true,
      result: { locked: false, values: { '/shared/displayName': 'ada' } },
    });
  });

  test('the site list names only what the user switched on', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userSwitchesAgentOn();

    const envelope = await toolCall(OPERATIONS.VAULT_LIST_SHARED);

    expect(envelope.result).toMatchObject({
      locked: false,
      sources: [{ origin: OWNER_ORIGIN, paths: ['/shared'] }],
    });
  });

  test('nothing switched on reads as an empty list, not an error', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });

    const envelope = await toolCall(OPERATIONS.VAULT_LIST_SHARED);

    expect(envelope).toMatchObject({ ok: true, result: { locked: false, sources: [] } });
  });
});

describe('what the model cannot get to, through the tools it actually has', () => {
  test('private data is null, exactly as an unwritten pointer is', async () => {
    await ownerWrites({ '/shared/displayName': 'ada', '/private/secret': 'nope' });
    userSwitchesAgentOn();

    const envelope = await toolCall(OPERATIONS.VAULT_READ_SHARED, {
      origin: OWNER_ORIGIN,
      paths: ['/private/secret', '/shared/neverWritten'],
    });

    expect(envelope.result.values).toEqual({
      '/private/secret': null,
      '/shared/neverWritten': null,
    });
    expect(JSON.stringify(envelope)).not.toContain('nope');
  });

  test('a site the user never switched on is null, not a refusal that confirms it', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });

    const envelope = await toolCall(OPERATIONS.VAULT_READ_SHARED, {
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName'],
    });

    // Identical to a site that has no partition at all — compared here rather
    // than asserted apart, because being the SAME answer is the property.
    const unknown = await toolCall(OPERATIONS.VAULT_READ_SHARED, {
      origin: 'http://never-visited.localhost:8799',
      paths: ['/shared/displayName'],
    });

    expect(envelope.result).toEqual(unknown.result);
    expect(envelope.result.values['/shared/displayName']).toBeNull();
  });

  test('switching the read off takes the value away again', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userSwitchesAgentOn();
    manager.setAgentReadEnabled(OWNER_NS, false);

    const envelope = await toolCall(OPERATIONS.VAULT_READ_SHARED, {
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName'],
    });

    expect(envelope.result.values['/shared/displayName']).toBeNull();
  });

  test('there is no tool that writes, publishes or grants anything', () => {
    const vaultTools = tools
      .map((tool) => tool.name)
      .filter((name) => name.startsWith('vault_'));

    expect(vaultTools).toEqual([OPERATIONS.VAULT_LIST_SHARED, OPERATIONS.VAULT_READ_SHARED]);
  });

  test('the Agent cannot grant itself a site the user did not', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });

    // Nothing in the tool surface writes a grant, so the only way through is
    // the owner plane — which is not wired to this controller at all.
    await toolCall(OPERATIONS.VAULT_READ_SHARED, {
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName'],
    });

    expect(perms.getPermission(perms.AGENT_NAMESPACE)).toBeNull();
  });
});

describe('the read is attributed to the vault, not to the page in front', () => {
  /** Put a page behind the Agent, with an origin the adapter will remember. */
  async function agentIsBrowsingSomewhereElse() {
    await toolCall(OPERATIONS.LIST_TABS);
  }

  test('the receipt names no tab, and above all no other site', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userSwitchesAgentOn();
    await agentIsBrowsingSomewhereElse();

    await toolCall(OPERATIONS.VAULT_READ_SHARED, {
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName'],
    });

    // This is what the Agent's activity UI is told the tool did. Before
    // `tabMode: 'none'`, it carried the open page's id, title and origin, so a
    // read of one site was reported under another's name.
    const receipt = outcomes.at(-1);
    expect(receipt).toMatchObject({
      operation: OPERATIONS.VAULT_READ_SHARED,
      status: 'succeeded',
    });
    expect(receipt.tabId).toBeUndefined();
    expect(receipt.pageId).toBeUndefined();
    expect(receipt.origin).toBeUndefined();
    expect(receipt.pageTitle).toBeUndefined();
  });
});

describe('a locked vault', () => {
  test('says so and reads nothing, without asking for an unlock', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userSwitchesAgentOn();
    unlocked = false;

    const envelope = await toolCall(OPERATIONS.VAULT_READ_SHARED, {
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName'],
    });

    expect(envelope.result).toMatchObject({ locked: true, values: {} });
    expect(ensureUnlocked).not.toHaveBeenCalled();
  });
});
