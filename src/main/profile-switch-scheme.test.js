const pkg = require('../../package.json');
const {
  PACKAGED_DESKTOP_NAME,
  PROFILE_SWITCH_MIME_TYPE,
  buildProfileSwitchUrl,
  parseProfileSwitchArgv,
  parseProfileSwitchUrl,
  shouldSwitchProfileViaXdgOpen,
  switchProfileViaXdgOpen,
} = require('./profile-switch-scheme');
const { extractLaunchUrls, relaunchArgs } = require('./launch-urls');

describe('x-freedom-profile scheme', () => {
  describe('parseProfileSwitchUrl', () => {
    test('accepts a canonical profile id and nothing else after the colon', () => {
      expect(parseProfileSwitchUrl('x-freedom-profile:work')).toBe('work');
      expect(parseProfileSwitchUrl('x-freedom-profile:default')).toBe('default');
      expect(parseProfileSwitchUrl('x-freedom-profile:my_work-2')).toBe('my_work-2');
      // The scheme is case-insensitive (RFC 3986); the id is not.
      expect(parseProfileSwitchUrl('X-Freedom-Profile:work')).toBe('work');
    });

    test('refuses anything that is not already a canonical id', () => {
      for (const value of [
        'x-freedom-profile:',
        'x-freedom-profile:Work', // sanitizeProfileId would lower-case it
        'x-freedom-profile:-work', // ...and strip the dash
        'x-freedom-profile:work-',
        'x-freedom-profile:..',
        'x-freedom-profile:.',
        'x-freedom-profile:a/b',
        'x-freedom-profile:..%2Fetc',
        'x-freedom-profile:%77ork', // no percent-decoding
        'x-freedom-profile://work',
        'x-freedom-profile:work/',
        'x-freedom-profile:work?x=1',
        'x-freedom-profile:work#x',
        'x-freedom-profile:work https://evil.example',
        'x-freedom-profile:work\n',
        'x-freedom-profile:wörk',
        'x-freedom-profile:https://evil.example',
        'https://evil.example/x-freedom-profile:work',
        'freedom://settings',
        '',
        null,
        undefined,
        42,
      ]) {
        expect([value, parseProfileSwitchUrl(value)]).toEqual([value, null]);
      }
    });
  });

  describe('parseProfileSwitchArgv', () => {
    test('finds the switch among the launch arguments on Linux', () => {
      expect(
        parseProfileSwitchArgv(['/opt/Freedom/freedom', 'x-freedom-profile:work'], {
          platform: 'linux',
        })
      ).toEqual({ id: 'work' });
    });

    test('is inert on macOS and Windows', () => {
      for (const platform of ['darwin', 'win32']) {
        expect(
          parseProfileSwitchArgv(['Freedom', 'x-freedom-profile:work'], { platform })
        ).toBeNull();
      }
    });

    test('an ordinary launch carries no switch', () => {
      expect(
        parseProfileSwitchArgv(['/opt/Freedom/freedom', '--profile=work', 'https://a.example'], {
          platform: 'linux',
        })
      ).toBeNull();
      // argv[0] is the executable, never a switch.
      expect(parseProfileSwitchArgv(['x-freedom-profile:work'], { platform: 'linux' })).toBeNull();
    });

    test('a malformed or repeated switch is a refused one, not an ordinary launch', () => {
      expect(
        parseProfileSwitchArgv(['freedom', 'x-freedom-profile:Work'], { platform: 'linux' })
      ).toEqual({ id: null });
      expect(
        parseProfileSwitchArgv(['freedom', 'x-freedom-profile:work', 'x-freedom-profile:home'], {
          platform: 'linux',
        })
      ).toEqual({ id: null });
    });

    test('the switch is never a link to open', () => {
      expect(extractLaunchUrls(['freedom', 'x-freedom-profile:work'])).toEqual([]);
      // A Settings restart keeps it: it still means the same profile.
      expect(relaunchArgs(['freedom', 'x-freedom-profile:work'])).toEqual([
        'x-freedom-profile:work',
      ]);
    });
  });

  test('buildProfileSwitchUrl writes only canonical ids', () => {
    expect(buildProfileSwitchUrl('work')).toBe('x-freedom-profile:work');
    expect(parseProfileSwitchUrl(buildProfileSwitchUrl('my_work-2'))).toBe('my_work-2');
    expect(() => buildProfileSwitchUrl('Work')).toThrow();
    expect(() => buildProfileSwitchUrl('../x')).toThrow();
    expect(() => buildProfileSwitchUrl('')).toThrow();
  });

  test('is registered as a Linux scheme handler only, for the installed desktop entry', () => {
    expect(pkg.build.linux.mimeTypes).toContain(PROFILE_SWITCH_MIME_TYPE);
    expect(PACKAGED_DESKTOP_NAME).toBe(pkg.desktopName);
    const protocols = [pkg.build.protocols, pkg.build.mac?.protocols, pkg.build.win?.protocols]
      .flat()
      .filter(Boolean);
    expect(JSON.stringify(protocols)).not.toContain('x-freedom-profile');
    expect(JSON.stringify(pkg.build.mac?.extendInfo || {})).not.toContain('x-freedom-profile');
  });

  describe('shouldSwitchProfileViaXdgOpen', () => {
    const waylandPackaged = (overrides = {}) => ({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'wayland' },
      isPackaged: true,
      queryDefaultHandler: jest.fn(async () => 'freedom.desktop'),
      ...overrides,
    });

    test('goes through xdg-open on a packaged Wayland build that handles the scheme', async () => {
      const deps = waylandPackaged();
      await expect(shouldSwitchProfileViaXdgOpen(deps)).resolves.toBe(true);
      expect(deps.queryDefaultHandler).toHaveBeenCalledWith('x-scheme-handler/x-freedom-profile');
      await expect(
        shouldSwitchProfileViaXdgOpen(waylandPackaged({ env: { XDG_SESSION_TYPE: ' Wayland ' } }))
      ).resolves.toBe(true);
    });

    test('never on macOS or Windows, and without asking xdg-mime', async () => {
      for (const platform of ['darwin', 'win32']) {
        const deps = waylandPackaged({ platform });
        await expect(shouldSwitchProfileViaXdgOpen(deps)).resolves.toBe(false);
        expect(deps.queryDefaultHandler).not.toHaveBeenCalled();
      }
    });

    test('not on X11 or an unknown session, where the running profile raises itself', async () => {
      for (const env of [{ XDG_SESSION_TYPE: 'x11' }, { XDG_SESSION_TYPE: '' }, {}]) {
        const deps = waylandPackaged({ env });
        await expect(shouldSwitchProfileViaXdgOpen(deps)).resolves.toBe(false);
        expect(deps.queryDefaultHandler).not.toHaveBeenCalled();
      }
    });

    test('not from a source-tree run, which has no desktop entry', async () => {
      const deps = waylandPackaged({ isPackaged: false });
      await expect(shouldSwitchProfileViaXdgOpen(deps)).resolves.toBe(false);
      expect(deps.queryDefaultHandler).not.toHaveBeenCalled();
    });

    test('not when the scheme is handled by something else, or by nothing', async () => {
      for (const handler of ['', 'freedom-dev.desktop', 'evil.desktop', 'freedom.desktop.bak']) {
        await expect(
          shouldSwitchProfileViaXdgOpen(
            waylandPackaged({ queryDefaultHandler: async () => handler })
          )
        ).resolves.toBe(false);
      }
      await expect(
        shouldSwitchProfileViaXdgOpen(
          waylandPackaged({
            queryDefaultHandler: async () => {
              throw new Error('xdg-mime: not found');
            },
          })
        )
      ).resolves.toBe(false);
    });
  });

  describe('switchProfileViaXdgOpen', () => {
    const deps = (overrides = {}) => ({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'wayland' },
      isPackaged: true,
      queryDefaultHandler: async () => 'freedom.desktop',
      shell: { openExternal: jest.fn(async () => {}) },
      ...overrides,
    });

    test('opens x-freedom-profile:<id> through shell.openExternal', async () => {
      const d = deps();
      await expect(switchProfileViaXdgOpen('work', d)).resolves.toBe(true);
      expect(d.shell.openExternal).toHaveBeenCalledWith('x-freedom-profile:work');
    });

    test('does nothing when the path does not apply', async () => {
      for (const d of [
        deps({ platform: 'darwin' }),
        deps({ platform: 'win32' }),
        deps({ env: { XDG_SESSION_TYPE: 'x11' } }),
        deps({ isPackaged: false }),
        deps({ queryDefaultHandler: async () => 'other.desktop' }),
      ]) {
        await expect(switchProfileViaXdgOpen('work', d)).resolves.toBe(false);
        expect(d.shell.openExternal).not.toHaveBeenCalled();
      }
    });

    test('never builds a URL from a non-canonical id', async () => {
      const d = deps({ queryDefaultHandler: jest.fn(async () => 'freedom.desktop') });
      await expect(switchProfileViaXdgOpen('../work', d)).resolves.toBe(false);
      await expect(switchProfileViaXdgOpen('https://evil.example', d)).resolves.toBe(false);
      expect(d.queryDefaultHandler).not.toHaveBeenCalled();
      expect(d.shell.openExternal).not.toHaveBeenCalled();
    });

    test('reports failure when xdg-open refuses it, so the caller falls back', async () => {
      const d = deps({
        shell: { openExternal: jest.fn(async () => Promise.reject(new Error('no handler'))) },
      });
      await expect(switchProfileViaXdgOpen('work', d)).resolves.toBe(false);
    });
  });
});
