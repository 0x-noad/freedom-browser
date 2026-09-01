const { spawnSync } = require('child_process');

jest.mock('child_process', () => ({ spawnSync: jest.fn() }));

const { hostArch, hostArchOrX64, ARCH_ENV } = require('./host-arch');

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const originalArch = Object.getOwnPropertyDescriptor(process, 'arch');

function setHost(platform, arch) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  Object.defineProperty(process, 'arch', { value: arch, configurable: true });
}

function sysctlSays(value) {
  spawnSync.mockReturnValue({ status: 0, stdout: `${value}\n` });
}

describe('host-arch', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    Object.defineProperty(process, 'arch', originalArch);
    jest.clearAllMocks();
  });

  test('reports arm64 for an x64 Node on Apple Silicon', () => {
    setHost('darwin', 'x64');
    sysctlSays('1');

    expect(hostArch({})).toBe('arm64');
    expect(spawnSync).toHaveBeenCalledWith('sysctl', ['-n', 'hw.optional.arm64'], expect.any(Object));
  });

  test('reports x64 for an x64 Node on an Intel Mac', () => {
    setHost('darwin', 'x64');
    sysctlSays('0');

    expect(hostArch({})).toBe('x64');
  });

  test('trusts process.arch when it already reports arm64', () => {
    setHost('darwin', 'arm64');

    expect(hostArch({})).toBe('arm64');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test('does not probe sysctl off macOS', () => {
    setHost('linux', 'x64');

    expect(hostArch({})).toBe('x64');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test('honours the target override for scripted setups', () => {
    setHost('darwin', 'arm64');

    expect(hostArch({ [ARCH_ENV]: 'x64' })).toBe('x64');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test('rejects an override that is not a build target', () => {
    setHost('darwin', 'arm64');

    expect(() => hostArch({ [ARCH_ENV]: 'riscv64' })).toThrow(ARCH_ENV);
  });

  test('narrows an unsupported host arch to x64', () => {
    setHost('linux', 'ppc64');

    expect(hostArchOrX64({})).toBe('x64');
  });
});
