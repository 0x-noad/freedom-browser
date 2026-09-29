/**
 * Guard: every harness e2e spec runs in CI, or is deliberately left out.
 *
 * CI does not run `playwright test --project=harness` wholesale; each e2e-*
 * job in `.github/workflows/ci.yml` names its own curated list of specs. A
 * spec nobody adds to a list is never run, and its regressions ship green:
 * #319 was exactly that, and by 2026-09-29 twenty-four `test-e2e/*.spec.js`
 * files were in no workflow at all (two of them were failing on `main`).
 *
 * So a spec has to be in one of two places:
 *
 * - referenced by a workflow: `test-e2e/<path>.spec.js` outside a comment
 *   (whole-line or trailing ` # ...`, including a `#` line inside a folded
 *   `run: >-` block, which the shell sees mid-line) in any
 *   `.github/workflows/*.yml`, or inside a `package.json` script a
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

// `<path>` is relative to test-e2e/ and may name subdirectories.
const SPEC_REF = /test-e2e\/((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.spec\.js)/g;
const SKIP_LINE = /^\s*#\s*e2e-not-in-ci:\s*(\S+)\s*(?:—|--?)\s*(.*)$/;

// Mirrors the harness project's testMatch in playwright.config.js: any
// `.spec.js` under test-e2e/, at any depth, except under a live/, packaged/
// or packaged-live/ directory (those are other projects).
const OTHER_PROJECT_DIRS = new Set(['live', 'packaged', 'packaged-live']);
const isHarnessPath = (rel) =>
  rel.endsWith('.spec.js') &&
  !rel
    .split('/')
    .slice(0, -1)
    .some((d) => OTHER_PROJECT_DIRS.has(d));

/** Every harness spec, as a test-e2e/-relative path (`wallet/x.spec.js` for a subdirectory). */
const harnessSpecs = (dir = e2eDir, prefix = '') =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const rel = prefix + entry.name;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || OTHER_PROJECT_DIRS.has(entry.name)) return [];
        return harnessSpecs(path.join(dir, entry.name), `${rel}/`);
      }
      return entry.isFile() && isHarnessPath(rel) ? [rel] : [];
    })
    .sort();

// Comments carry spec names in prose (and the not-in-CI list itself); a
// reference only counts where the runner would execute it. YAML and shell
// both start a comment at a `#` that begins the line or follows whitespace,
// so a trailing `  # test-e2e/x.spec.js` after a `\` continuation is dropped
// too. (A ` #` inside a quoted string is cut as well; that can only hide a
// reference and fail this guard, never make an unrun spec pass.)
const stripLineComment = (line) => line.replace(/(^|\s)#.*$/, '');

// A block scalar (`run: |`, `run: >-`) is not YAML any more: a `#` line inside
// it is content handed to the shell, not a YAML comment. That is harmless in a
// literal `|` block, where every line stays its own shell line — but a folded
// `>` block joins its lines with spaces first, so one `# note` line in the
// middle of a spec list becomes a shell comment that swallows every spec after
// it, and bash exits 0 having run only the ones before. So a folded block is
// folded the way YAML folds it before comments are cut, and a reference behind
// such a `#` drops out and fails this guard instead of counting as run.
const BLOCK_SCALAR = /^(\s*)(?:-\s+)?([A-Za-z0-9_.-]+):\s*([|>])[-+0-9]*\s*(?:#.*)?$/;

/** YAML folding of a `>` block's lines (block indentation already removed). */
const fold = (lines) => {
  let out = '';
  lines.forEach((line, i) => {
    if (i === 0) {
      out = line;
      return;
    }
    const prev = lines[i - 1];
    // Two adjacent plain (non-empty, not more-indented) lines fold into one;
    // empty and more-indented lines keep their line break.
    const joins = prev !== '' && line !== '' && !/^\s/.test(prev) && !/^\s/.test(line);
    out += (joins ? ' ' : '\n') + line;
  });
  return out;
};

/** Workflow text as the shell sees it: comments gone, folded blocks folded. */
const stripComments = (text) => {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(BLOCK_SCALAR);
    if (!header) {
      out.push(stripLineComment(lines[i]));
      continue;
    }
    out.push(stripLineComment(lines[i]));
    // Content is every following line indented past the key (or empty).
    const keyColumn = lines[i].indexOf(header[2]);
    const body = [];
    while (
      i + 1 < lines.length &&
      (lines[i + 1].trim() === '' || lines[i + 1].search(/\S/) > keyColumn)
    )
      body.push(lines[++i]);
    while (body.length && body[body.length - 1].trim() === '') body.pop();
    const nonEmpty = body.filter((l) => l.trim() !== '');
    const indent = nonEmpty.length ? Math.min(...nonEmpty.map((l) => l.search(/\S/))) : 0;
    const content = body.map((l) => (l.trim() === '' ? '' : l.slice(indent)));
    const shellLines = header[3] === '>' ? fold(content).split('\n') : content;
    out.push(...shellLines.map(stripLineComment));
  }
  return out.join('\n');
};

// live/, packaged/ and packaged-live/ specs are referenced by other jobs; they
// are not this guard's concern.
const specRefsIn = (text) => [...text.matchAll(SPEC_REF)].map((m) => m[1]).filter(isHarnessPath);

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

describe('the guard parsers', () => {
  it('drops whole-line and trailing comments, keeps real references', () => {
    const refs = specRefsIn(
      stripComments(
        [
          '# test-e2e/a.spec.js is prose',
          'run: npx playwright test test-e2e/b.spec.js \\',
          '  test-e2e/c.spec.js \\  # test-e2e/d.spec.js',
          '  key: value # test-e2e/e.spec.js',
          '  url: https://x.test/#test-e2e/f.spec.js',
        ].join('\n')
      )
    );
    expect(refs).toEqual(['b.spec.js', 'c.spec.js', 'f.spec.js']);
  });

  it('folds a `>-` block before cutting comments: specs after a `#` line are not run', () => {
    // The shell sees `... settings.spec.js a.spec.js # note b.spec.js c.spec.js`.
    const folded = specRefsIn(
      stripComments(
        [
          '      - name: Run settings E2E',
          '        run: >-',
          '          xvfb-run -a npm run test:e2e --',
          '          test-e2e/a.spec.js',
          '          # b needs the synthetic checkpoint states',
          '          test-e2e/b.spec.js',
          '          test-e2e/c.spec.js',
          '      - name: next',
          '        run: npx playwright test test-e2e/d.spec.js',
        ].join('\n')
      )
    );
    expect(folded).toEqual(['a.spec.js', 'd.spec.js']);

    // In a literal `|` block the same `#` line is its own shell line and
    // leaves the next command alone.
    const literal = specRefsIn(
      stripComments(
        [
          '        run: |',
          '          npx playwright test test-e2e/a.spec.js',
          '          # b.spec.js runs in the next command',
          '          npx playwright test test-e2e/b.spec.js # test-e2e/c.spec.js',
          '        env:',
          '          X: test-e2e/e.spec.js',
        ].join('\n')
      )
    );
    expect(literal).toEqual(['a.spec.js', 'b.spec.js', 'e.spec.js']);
  });

  it('folds the real e2e-settings job: a comment line there hides the specs after it', () => {
    const ci = fs.readFileSync(ciPath, 'utf8');
    const anchor = '          test-e2e/settings-adblock.spec.js\n';
    expect(ci).toContain(anchor);
    const mutated = ci.replace(anchor, `${anchor}          # myotis-recovery needs checkpoints\n`);
    const refs = new Set(specRefsIn(stripComments(mutated)));
    expect(refs.has('settings-adblock.spec.js')).toBe(true);
    expect(refs.has('myotis-recovery.spec.js')).toBe(false);
    expect(new Set(specRefsIn(stripComments(ci))).has('myotis-recovery.spec.js')).toBe(true);
  });

  it('matches the harness project testMatch, subdirectories included', () => {
    expect(isHarnessPath('tabs.spec.js')).toBe(true);
    expect(isHarnessPath('wallet/new.spec.js')).toBe(true);
    expect(isHarnessPath('a/b/c.spec.js')).toBe(true);
    expect(isHarnessPath('live/adblock.spec.js')).toBe(false);
    expect(isHarnessPath('packaged/launch.spec.js')).toBe(false);
    expect(isHarnessPath('packaged-live/nodes.spec.js')).toBe(false);
    expect(isHarnessPath('wallet/live/x.spec.js')).toBe(false);
    expect(isHarnessPath('fixtures.js')).toBe(false);
    expect(specRefsIn('test-e2e/wallet/new.spec.js test-e2e/live/adblock.spec.js')).toEqual([
      'wallet/new.spec.js',
    ]);
  });

  it('walks subdirectories and skips the other projects', () => {
    const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'e2e-cov-'));
    try {
      for (const rel of [
        'top.spec.js',
        'fixtures.js',
        'wallet/new.spec.js',
        'wallet/deep/more.spec.js',
        'live/a.spec.js',
        'packaged/b.spec.js',
        'packaged-live/c.spec.js',
        'node_modules/pkg/d.spec.js',
      ]) {
        fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), '');
      }
      expect(harnessSpecs(root)).toEqual([
        'top.spec.js',
        'wallet/deep/more.spec.js',
        'wallet/new.spec.js',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('agrees with playwright.config.js on which files the harness project runs', () => {
    // The config's own regex, applied the way Playwright applies it (to the
    // absolute path), must pick exactly the files harnessSpecs() walks.
    const config = fs.readFileSync(path.join(repoRoot, 'playwright.config.js'), 'utf8');
    const m = config.match(/name: 'harness',\s*testMatch: \/(.*)\/,/);
    expect(m).not.toBeNull();
    const testMatch = new RegExp(m[1]);
    const all = [];
    const walk = (dir, prefix) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && e.name !== 'node_modules')
          walk(path.join(dir, e.name), `${prefix}${e.name}/`);
        else if (e.isFile()) all.push(`${prefix}${e.name}`);
      }
    };
    walk(e2eDir, '');
    const byConfig = all.filter((rel) => testMatch.test(`/r/test-e2e/${rel}`)).sort();
    expect(harnessSpecs()).toEqual(byConfig);
  });
});
