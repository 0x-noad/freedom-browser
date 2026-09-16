// Official, checksum-pinned Myotis release addons. No local native patch/build.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const release = require('./myotis-release.json');
const PINNED_RELEASE_TAG = release.releaseTag;
const OUTPUT_DIR = path.join(__dirname, '..', 'myotis-bin');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function selectedTargets(requested = '') {
  const targets = release.targets.filter((target) => !requested || target.runtime === requested);
  if (!targets.length) throw new Error(`Unsupported Myotis target: ${requested}`);
  return targets;
}

function verifyBytes(target, bytes) {
  if (sha256(bytes) !== target.sha256) throw new Error('checkpoint-addon checksum mismatch');
}

// Pre-signing packaging check: the committed release hashes authorize the bytes,
// not a sidecar supplied alongside a locally built or downloaded addon.
function validateInstalledAddon(directory) {
  try {
    const target = release.targets.find((entry) => entry.dir === path.basename(directory));
    if (!target) return 'unsupported Myotis target';
    verifyBytes(target, fs.readFileSync(path.join(directory, 'myotis-node.node')));
    return null;
  } catch (error) {
    return error.code === 'ENOENT' ? 'missing official Myotis addon' : error.message;
  }
}

async function download(url, redirects = 0) {
  if (new URL(url).protocol !== 'https:' || redirects > 5) throw new Error('Invalid Myotis download redirect');
  const response = await fetch(url, {
    redirect: 'manual', signal: AbortSignal.timeout(60000),
    headers: { 'User-Agent': 'Freedom-Myotis-Downloader' },
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) throw new Error('Missing Myotis download redirect');
    return download(new URL(location, url).href, redirects + 1);
  }
  if (!response.ok) throw new Error(`Myotis download returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('Myotis download exceeds the 32 MiB limit');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function fetchAsset(asset) {
  const url = `https://github.com/${release.repository}/releases/download/${release.releaseTag}/${asset}`;
  for (let attempt = 1; ; attempt++) {
    try { return await download(url); } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`Myotis download attempt ${attempt} failed; retrying`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

async function main() {
  for (const key of ['MYOTIS_REPO', 'MYOTIS_RELEASE_TAG']) {
    if (process.env[key]) throw new Error(`${key} overrides are incompatible with the pinned official release`);
  }
  const targets = selectedTargets(process.env.MYOTIS_DOWNLOAD_TARGET);
  const sums = await fetchAsset('myotis-node.SHA256SUMS');
  if (sha256(sums) !== release.checksumsSha256) throw new Error('Myotis release checksum manifest mismatch');
  for (const target of targets) {
    const bytes = await fetchAsset(target.asset);
    verifyBytes(target, bytes);
    const directory = path.join(OUTPUT_DIR, target.dir);
    fs.mkdirSync(directory, { recursive: true });
    const candidate = path.join(directory, `myotis-node.candidate-${crypto.randomUUID()}.node`);
    fs.writeFileSync(candidate, bytes, { flag: 'wx' });
    if (target.runtime === `${process.platform}-${process.arch}`) {
      execFileSync(process.execPath, [path.join(__dirname, 'verify-myotis-checkpoint-addon.js'), candidate], {
        stdio: 'inherit', timeout: 30000,
      });
    }
    const installed = path.join(directory, 'myotis-node.node');
    if (fs.existsSync(installed)) fs.renameSync(installed, `${installed}.previous-${crypto.randomUUID()}`);
    fs.renameSync(candidate, installed);
    console.log(`Installed official Myotis ${release.releaseTag} (${target.runtime})`);
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`fetch-myotis failed: ${error.message}`);
  process.exitCode = 1;
});
module.exports = { PINNED_RELEASE_TAG, release, sha256, selectedTargets, verifyBytes, validateInstalledAddon, download, main };
