const fs = require('fs');
const os = require('os');
const path = require('path');
const { release, sha256, selectedTargets, verifyBytes, validateInstalledAddon, download } = require('./fetch-myotis');

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
