const fs = require('fs');
const os = require('os');
const path = require('path');
const { release, sha256, selectedTargets, verifyBytes, validateInstalledAddon, download, pruneLeftoverAddons } = require('./fetch-myotis');

test('selects official assets for all five targets, including cross-target downloads', () => {
  expect(release.abi).toBe(26);
  expect(selectedTargets()).toHaveLength(5);
  expect(selectedTargets('win32-x64')[0].dir).toBe('win-x64');
  expect(() => selectedTargets('win32-arm64')).toThrow('Unsupported');
});

test('changed addon bytes fail the committed checksum, regardless of local build metadata', () => {
  const bytes = Buffer.from('addon');
  expect(() => verifyBytes({ sha256: sha256(bytes) }, bytes)).not.toThrow();
  expect(() => verifyBytes({ sha256: sha256(bytes) }, Buffer.from('changed'))).toThrow('checksum');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myotis-release-check-'));
  const dir = path.join(root, 'mac-arm64'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'myotis-node.node'), bytes);
  fs.writeFileSync(path.join(dir, 'myotis-build.json'), JSON.stringify({ addonSha256: sha256(bytes) }));
  expect(validateInstalledAddon(dir)).toContain('checksum');
  expect(validateInstalledAddon(path.join(root, 'win-x64'))).toContain('missing');
});

test('removes replaced and abandoned addon copies without touching the installed one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myotis-prune-'));
  const uuid = '9f3b1c2d-4e5a-4b6c-8d7e-0f1a2b3c4d5e';
  const keep = ['myotis-node.node', 'myotis-build.json', 'myotis-node.candidate.node', 'notes.previous-1'];
  const remove = [`myotis-node.candidate-${uuid}.node`, `myotis-node.node.previous-${uuid}`];
  for (const name of [...keep, ...remove]) fs.writeFileSync(path.join(dir, name), 'bytes');
  pruneLeftoverAddons(dir);
  expect(fs.readdirSync(dir).sort()).toEqual(keep.sort());
});

test('refuses HTTP redirects before requesting their content', async () => {
  const mocked = jest.spyOn(global, 'fetch').mockResolvedValue({
    status: 302, headers: new Map([['location', 'http://untrusted.invalid/addon']]),
    body: { cancel: jest.fn() },
  });
  try {
    await expect(download('https://github.com/example')).rejects.toThrow('Invalid Myotis download redirect');
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  } finally { mocked.mockRestore(); }
});
