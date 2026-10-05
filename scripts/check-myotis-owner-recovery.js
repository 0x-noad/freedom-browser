// No network or user profiles. Exercise the actual compiled helper and real
// kernel boot identity. A modified fixture witness simulates a previous boot;
// this does NOT reboot the test host or claim a real reboot qualification.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');
const { supervisorPath, MyotisProcess } = require('../src/main/myotis/myotis-process');

async function check() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freedom-owner-recovery-'));
  const id = randomUUID();
  function fixture() {
    const dir = path.join(root, randomUUID()); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '.freedom-myotis-owner'), `v1 active ${id}\n`);
    return dir;
  }
  function run(dir) {
    const result = spawnSync(supervisorPath(), ['--recover-owner', dir, randomUUID()], { timeout: 6000 });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return result.status;
  }
  function previousBoot(dir) {
    const file = path.join(dir, '.freedom-myotis-boot');
    const bytes = fs.readFileSync(file);
    bytes.fill(0, 72, 136);
    bytes.write(process.platform === 'win32' ? '0000000000000001' : randomUUID(), 72);
    fs.writeFileSync(file, bytes);
  }
  const data = fixture();
  assert.equal(run(data), 10, 'old builds arm a reboot witness');
  assert.equal(run(data), 10, 'same boot stays blocked');
  assert.equal(fs.readFileSync(path.join(data, '.freedom-myotis-owner'), 'utf8'), `v1 active ${id}\n`);
  previousBoot(data);
  assert.equal(run(data), 11, 'previous boot allows fresh state, not snapshot resume');
  assert.match(fs.readFileSync(path.join(data, '.freedom-myotis-owner'), 'utf8'), /^v1 rebooted /);
  assert.equal(run(data), 11, 'recovery receipt survives restart before pointer publication');

  const changed = fixture(); assert.equal(run(changed), 10); previousBoot(changed);
  fs.writeFileSync(path.join(changed, '.freedom-myotis-owner'), `v1 active ${randomUUID()}\n`);
  assert.equal(run(changed), 10, 'a different owner cannot borrow the old boot proof');

  const foreign = fixture(); assert.equal(run(foreign), 10); previousBoot(foreign);
  const witness = path.join(foreign, '.freedom-myotis-boot');
  const bytes = fs.readFileSync(witness); bytes[8] ^= 1; fs.writeFileSync(witness, bytes);
  assert.equal(run(foreign), 12, 'a different machine cannot authorize recovery');

  const linked = fixture(); fs.linkSync(path.join(linked, '.freedom-myotis-owner'), path.join(linked, 'other-link'));
  assert.equal(run(linked), 12, 'hard-linked owners remain blocked');

  const running = path.join(root, 'running'); fs.mkdirSync(running);
  fs.mkdirSync(path.join(running, 'data'));
  fs.copyFileSync(path.join(__dirname, 'fixtures/myotis-benign-addon.js'), path.join(running, 'addon.js'));
  fs.writeFileSync(path.join(running, 'fixture.json'), JSON.stringify({ identity: 'freedom-myotis-benign-v1', mode: 'healthy' }));
  const client = new MyotisProcess({ addonPath: path.join(running, 'addon.js'), network: 'mainnet',
    dataDir: path.join(running, 'data'), onStatus() {}, onUnavailable() {}, onExit() {} });
  try {
    assert.equal(await client.startPromise, true, 'benign native child starts');
    assert.equal(run(path.join(running, 'data')), 12, 'live owner is never recovered');
    assert(fs.existsSync(path.join(running, 'data', '.freedom-myotis-boot')), 'new starts record boot identity');
  } finally { assert.equal(await client.stop(), true, 'child and supervisor retire'); }
  assert.equal(run(path.join(running, 'data')), 0, 'ordinary clean retirement still works');
  console.log(`PASS ${process.platform}-${process.arch}: real boot identity, legacy witness, same-boot refusal, simulated previous boot, owner mismatch, foreign host, hardlink, live lock, clean retirement`);
}
if (require.main === module) check().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { check };
