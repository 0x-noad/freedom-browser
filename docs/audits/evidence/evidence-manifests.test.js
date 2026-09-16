/**
 * Guard for the in-repo `SHA256SUMS` trust roots under docs/audits/evidence.
 *
 * Those manifests are what each evidence README tells a verifier to check a
 * download against, so a stale line is indistinguishable from tampering with
 * the evidence set. 511dc4af rewrote all five READMEs under
 * myotis-recovery-integration-2026-09 when the raw captures moved out to
 * alan-artifacts, but left the `README.md` digests pinned to the pre-rewrite
 * bytes — `sha256sum --check` then failed in every one of those directories.
 *
 * Any file a manifest lists that is still in this repo must hash to its
 * recorded digest. Entries for files published out-of-tree are skipped here;
 * those are checked on download, against these same lines.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EVIDENCE_ROOT = __dirname;

function findManifests(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findManifests(full));
    else if (entry.name === 'SHA256SUMS') found.push(full);
  }
  return found;
}

// `<64 hex>  <name>` — the format GNU coreutils' sha256sum writes and reads.
function parseManifest(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
      if (!match) throw new Error(`unparsable SHA256SUMS line: ${line}`);
      return { digest: match[1], name: match[2] };
    });
}

const manifests = findManifests(EVIDENCE_ROOT);

describe('docs/audits/evidence SHA256SUMS trust roots', () => {
  test('at least one manifest is present to check', () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  describe.each(manifests.map((m) => [path.relative(EVIDENCE_ROOT, m), m]))('%s', (_rel, file) => {
    const dir = path.dirname(file);
    const entries = parseManifest(fs.readFileSync(file, 'utf8'));

    test('lists at least one retained file, so the check cannot go vacuous', () => {
      const retained = entries.filter((e) => fs.existsSync(path.join(dir, e.name)));
      expect(retained.length).toBeGreaterThan(0);
    });

    test.each(entries.map((e) => [e.name, e.digest]))(
      '%s matches its recorded digest',
      (name, digest) => {
        const target = path.join(dir, name);
        // Published out-of-tree (alan-artifacts); verified on download instead.
        if (!fs.existsSync(target)) return;

        const actual = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
        expect(actual).toBe(digest);
      }
    );
  });
});
