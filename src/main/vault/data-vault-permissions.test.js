/**
 * The data vault's remembered-grant store.
 *
 * Two behaviours here are easy to get wrong and both matter: the record is
 * rebuilt from scratch on every consent, so a field that should persist has to
 * be carried explicitly — and a field that must NOT persist has to be left out
 * of that carrying. `icon` is the first kind, `foreignReads` the second.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

jest.mock('electron', () => ({
  app: { getPath: jest.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: { handle: () => {} },
}));

let tmpDir;
let perms;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-perms-test-'));
  // resetModules first: the mock factory re-runs, so `app` must be taken from
  // the fresh module registry rather than one captured at load time.
  jest.resetModules();
  require('electron').app.getPath.mockReturnValue(tmpDir);
  perms = require('./data-vault-permissions');
  perms._resetCache();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const READER = 'web:reader.example';
const OWNER = 'web:owner.example';
const NOW = 1_760_000_000_000;

function grant(extra = {}) {
  return {
    origin: 'https://reader.example',
    methods: ['vault_getData'],
    fields: [{ path: '/own', read: true, write: true }],
    ...extra,
  };
}

const foreignRead = { namespace: OWNER, origin: 'https://owner.example', paths: ['/shared'] };

describe('foreignReads on a remembered grant', () => {
  test('persists what was granted', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);

    expect(perms.getPermission(READER).foreignReads).toEqual([foreignRead]);
  });

  test('defaults to an empty list, never undefined', () => {
    perms.grantPermission(READER, grant(), NOW);

    // `covers()` iterates this; a missing value would throw rather than decline.
    expect(perms.getPermission(READER).foreignReads).toEqual([]);
  });

  test('is CLEARED by a re-consent that granted none', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);
    perms.grantPermission(READER, grant({ foreignReads: [] }), NOW + 1);

    // The opposite of `icon`: if this inherited, unticking every cross-site row
    // on the sheet would leave the old approval in place.
    expect(perms.getPermission(READER).foreignReads).toEqual([]);
  });

  test('the icon still inherits, so carrying one did not break the other', () => {
    const icon = { dataUri: 'data:image/png;base64,AAA', mime: 'image/png' };
    perms.grantPermission(READER, grant({ icon }), NOW);
    perms.grantPermission(READER, grant(), NOW + 1);

    expect(perms.getPermission(READER).icon).toEqual(icon);
  });

  test('survives a save/load round trip', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);

    perms._resetCache();
    expect(perms.getPermission(READER).foreignReads).toEqual([foreignRead]);
  });
});

describe('setForeignReadEnabled', () => {
  test('turns one read off and KEEPS the entry, paths and all', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);

    expect(perms.setForeignReadEnabled(READER, OWNER, false)).toBe(true);
    // The whole point of the checkbox: the entry survives, so the Data pane
    // can offer it back and the user does not re-approve paths. There is no
    // revoke path to contrast it with — this is the only control.
    expect(perms.getPermission(READER).foreignReads).toEqual([
      { ...foreignRead, enabled: false },
    ]);
  });

  test('turns it back on', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);
    perms.setForeignReadEnabled(READER, OWNER, false);

    expect(perms.setForeignReadEnabled(READER, OWNER, true)).toBe(true);
    expect(perms.getPermission(READER).foreignReads[0].enabled).toBe(true);
  });

  test('an entry with no flag is already on, so turning it on changes nothing', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);

    // Every grant the consent sheet writes, and every one written before the
    // flag existed. Reporting a change would tear down sessions for nothing.
    expect(perms.setForeignReadEnabled(READER, OWNER, true)).toBe(false);
    expect(perms.getPermission(READER).foreignReads).toEqual([foreignRead]);
  });

  test('leaves the other owners alone', () => {
    const other = { namespace: 'web:other.example', origin: 'https://other.example', paths: ['/shared'] };
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead, other] }), NOW);
    perms.setForeignReadEnabled(READER, OWNER, false);

    expect(perms.getPermission(READER).foreignReads[1]).toEqual(other);
  });

  test('reports no change for an unknown reader or owner', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);

    expect(perms.setForeignReadEnabled('web:nobody.example', OWNER, false)).toBe(false);
    expect(perms.setForeignReadEnabled(READER, 'web:nobody.example', false)).toBe(false);
  });

  test('survives a save/load round trip', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);
    perms.setForeignReadEnabled(READER, OWNER, false);

    perms._resetCache();
    expect(perms.getPermission(READER).foreignReads[0].enabled).toBe(false);
  });

  test('a re-consent clears the off flag with the rest of the entry', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);
    perms.setForeignReadEnabled(READER, OWNER, false);
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW + 1);

    // The record is rebuilt from the decision, so what the sheet granted wins.
    expect(perms.getPermission(READER).foreignReads).toEqual([foreignRead]);
  });
});

describe('removeForeignReadsTo', () => {
  test('sweeps every reader of one owner and names them', () => {
    perms.grantPermission(READER, grant({ foreignReads: [foreignRead] }), NOW);
    perms.grantPermission('web:second.example', grant({ foreignReads: [foreignRead] }), NOW);
    perms.grantPermission('web:unrelated.example', grant(), NOW);

    const touched = perms.removeForeignReadsTo(OWNER);

    expect(touched.sort()).toEqual(['web:reader.example', 'web:second.example']);
    expect(perms.getPermission(READER).foreignReads).toEqual([]);
    expect(perms.getPermission('web:second.example').foreignReads).toEqual([]);
  });

  test('leaves a reader of a different owner alone', () => {
    const other = { namespace: 'web:other.example', origin: 'https://other.example', paths: ['/shared'] };
    perms.grantPermission(READER, grant({ foreignReads: [other] }), NOW);

    expect(perms.removeForeignReadsTo(OWNER)).toEqual([]);
    expect(perms.getPermission(READER).foreignReads).toEqual([other]);
  });
});

describe('a record written before cross-origin reads existed', () => {
  test('loads without the field and is treated as none', () => {
    // Written by hand the way the old code would have, with no `foreignReads`.
    const file = path.join(tmpDir, 'vault-permissions.enc');
    const legacy = {
      [READER]: {
        namespace: READER,
        origin: 'https://reader.example',
        appMetadata: {},
        icon: null,
        methods: ['vault_getData'],
        fields: [{ path: '/own', read: true, write: true }],
        writePolicy: 'ask-once-per-session',
        connectedAt: NOW,
        lastUsed: NOW,
      },
    };
    fs.writeFileSync(file, Buffer.concat([Buffer.from('VLT0'), Buffer.from(JSON.stringify(legacy))]));
    perms._resetCache();

    const record = perms.getPermission(READER);
    expect(record.foreignReads).toBeUndefined();
    // `covers()` reads it as [], so the reader simply prompts once.
    const { covers } = require('./data-vault-manager');
    expect(covers(record, ['vault_getData'], [{ path: '/own' }], [])).toBe(true);
    expect(covers(record, ['vault_getData'], [{ path: '/own' }], [foreignRead])).toBe(false);
  });
});

