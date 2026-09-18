/**
 * True host CPU architecture for binary downloads and checks.
 *
 * `process.arch` reports the architecture of the running Node, not of the
 * machine. On an Apple Silicon Mac an x64 Node — a terminal opened under
 * Rosetta, an x64 Node install, an agent or CI shell — reports `x64`, so
 * `npm run ipfs:download` fetches `darwin-x64` while Electron loads
 * `darwin-arm64`, and the download reports success. `check-binaries.js` then
 * compounds it by reporting against the same wrong arch: "Checking binaries
 * for: mac-x64" on a machine whose app is looking in `ant-bin/mac-arm64/`.
 * (`fetch-ant.js` is immune only because it downloads all five targets.)
 *
 * `FREEDOM_TARGET_ARCH` overrides the detection for scripted setups, matching
 * what `--target` does for a single fetch.
 */

const { spawnSync } = require('child_process');

const ARCH_ENV = 'FREEDOM_TARGET_ARCH';
const SUPPORTED = ['x64', 'arm64'];

/**
 * Is this Mac Apple Silicon, regardless of the Node binary's own architecture?
 * `hw.optional.arm64` describes the hardware and answers the same under Rosetta.
 */
function macIsAppleSilicon(env = process.env) {
  const result = spawnSync('sysctl', ['-n', 'hw.optional.arm64'], {
    encoding: 'utf-8',
    env,
  });
  // A definite answer either way is authoritative — an explicit 0 is an Intel
  // Mac, and no weaker signal should override it.
  if (result.status === 0) return String(result.stdout).trim() === '1';
  // sysctl unavailable: fall back to the arch Node itself was built for. Right
  // on a native arm64 Node, silent on a translated one.
  return process.config?.variables?.host_arch === 'arm64';
}

/**
 * The architecture Electron will actually run as on this machine.
 * @returns {'x64'|'arm64'|string}
 */
function hostArch(env = process.env) {
  const override = (env[ARCH_ENV] || '').trim();
  if (override) {
    if (!SUPPORTED.includes(override)) {
      throw new Error(`${ARCH_ENV} must be one of ${SUPPORTED.join(', ')} (got "${override}")`);
    }
    return override;
  }

  if (process.platform === 'darwin' && process.arch === 'x64' && macIsAppleSilicon(env)) {
    return 'arm64';
  }
  return process.arch;
}

/** `hostArch()` narrowed to the two architectures the build targets. */
function hostArchOrX64(env = process.env) {
  return hostArch(env) === 'arm64' ? 'arm64' : 'x64';
}

module.exports = { hostArch, hostArchOrX64, ARCH_ENV };
