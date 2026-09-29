/**
 * Guard: every harness e2e spec runs in CI, or is deliberately left out.
 *
 * CI does not run `playwright test --project=harness` wholesale; each e2e-*
 * job in `.github/workflows/ci.yml` names its own curated list of specs. A
 * spec nobody adds to a list is never run, and its regressions ship green:
 * #319 was exactly that, and by 2026-09-29 twenty-three `test-e2e/*.spec.js`
 * files were in no workflow at all (two of them were failing on `main`).
 *
 * So a spec has to be in one of two places:
 *
 * - referenced by a workflow: `test-e2e/<name>.spec.js` on a non-comment line
 *   of any `.github/workflows/*.yml`, or inside a `package.json` script a
 *   workflow runs with `npm run <script>` (e.g. `test:e2e:screenshots`);
 * - on the not-in-CI list: a `# e2e-not-in-ci: <name>.spec.js — <reason>`
 *   comment line in `ci.yml`, next to the jobs, where a reader of the
 *   workflow sees the gap.
 *
 * Both lists are kept honest in the other direction too: an entry naming a
 * spec that does not exist, or a skipped spec that a job runs after all,
 * fails here, so neither list can go stale.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const workflowDir = path.join(repoRoot, '.github', 'workflows');
const ciPath = path.join(workflowDir, 'ci.yml');
const e2eDir = path.join(repoRoot, 'test-e2e');

const SPEC_REF = /test-e2e\/([A-Za-z0-9_.-]+\.spec\.js)/g;
const SKIP_LINE = /^\s*#\s*e2e-not-in-ci:\s*(\S+)\s*(?:—|--?)\s*(.*)$/;

/** The top-level harness specs; live/, packaged/ and packaged-live/ are other projects. */
const harnessSpecs = () =>
  fs
    .readdirSync(e2eDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.js'))
    .map((entry) => entry.name)
    .sort();

// Whole-line comments carry spec names in prose (and the not-in-CI list
// itself); a reference only counts where the runner would execute it.
const stripComments = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

const specRefsIn = (text) => [...text.matchAll(SPEC_REF)].map((m) => m[1]);

/** spec name → where it is referenced, across every workflow. */
const referencedSpecs = () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts;
  const refs = new Map();
  const add = (spec, where) => {
    if (!refs.has(spec)) refs.set(spec, []);
    refs.get(spec).push(where);
  };
  for (const file of fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f))) {
    const text = stripComments(fs.readFileSync(path.join(workflowDir, file), 'utf8'));
    for (const spec of specRefsIn(text)) add(spec, file);
    for (const [, script] of text.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
      for (const spec of specRefsIn(scripts[script] || ''))
        add(spec, `${file} → npm run ${script}`);
    }
  }
  return refs;
};

/** spec name → reason, from the `# e2e-not-in-ci:` lines in ci.yml. */
const skipList = () => {
  const entries = new Map();
  for (const line of fs.readFileSync(ciPath, 'utf8').split('\n')) {
    const m = line.match(SKIP_LINE);
    if (m) entries.set(m[1], m[2].trim());
  }
  return entries;
};

describe('harness e2e specs in CI', () => {
  it('finds the specs, the workflow references and the skip list it checks', () => {
    // A parser that silently returns nothing would pass every test below.
    expect(harnessSpecs().length).toBeGreaterThan(20);
    expect(referencedSpecs().size).toBeGreaterThan(20);
    expect(referencedSpecs().has('renderer-screenshots.spec.js')).toBe(true); // via npm run
    expect(skipList().size).toBeGreaterThan(0);
  });

  it('runs every spec in some workflow job, or lists why not', () => {
    const refs = referencedSpecs();
    const skips = skipList();
    const unrun = harnessSpecs().filter((spec) => !refs.has(spec) && !skips.has(spec));
    // Add the spec to the e2e-* job in ci.yml that fits its area, or — if it
    // cannot run in CI yet — add a `# e2e-not-in-ci: <spec> — <reason>` line
    // to the list above the e2e jobs in ci.yml.
    expect(unrun).toEqual([]);
  });

  it('gives every skipped spec a reason', () => {
    const vague = [...skipList()].filter(([, reason]) => reason.length < 20).map(([spec]) => spec);
    expect(vague).toEqual([]);
  });

  it('lists only specs that exist', () => {
    const specs = new Set(harnessSpecs());
    expect([...skipList().keys()].filter((spec) => !specs.has(spec))).toEqual([]);
    expect([...referencedSpecs().keys()].filter((spec) => !specs.has(spec))).toEqual([]);
  });

  it('does not list a spec as skipped that a job runs', () => {
    const refs = referencedSpecs();
    const both = [...skipList().keys()].filter((spec) => refs.has(spec));
    // Wired back in: drop its `e2e-not-in-ci:` line.
    expect(both).toEqual([]);
  });
});
