// Pins the Linux window ↔ desktop-entry association (issue #142).
//
// Electron derives the X11 WM_CLASS and the Wayland app_id from `desktopName`
// in package.json (minus `.desktop`); without it, from a slug of the app name
// ("Freedom" → `freedom`). GNOME links a running window to its launcher entry
// by matching that against the entry's file name / StartupWMClass. Before
// #142 the packaged entry said `StartupWMClass=freedom-browser` while the
// packaged window's WM_CLASS was `freedom` (checked with xprop), so the two
// never matched.
//
// With `desktopName` set and `linux.syncDesktopName: true`, electron-builder
// names the installed entry after desktopName and derives StartupWMClass from
// it, so both sides come from the one value checked here.

const pkg = require('../package.json');

const linux = pkg.build.linux;

describe('Linux desktop entry', () => {
  test('desktopName names the installed .desktop file, which keeps its pre-#142 name', () => {
    // electron-builder installs /usr/share/applications/<executableName>.desktop
    // without syncDesktopName. Keeping desktopName on that same basename means
    // an upgrade doesn't rename the entry out from under existing
    // `xdg-mime default freedom.desktop x-scheme-handler/ipfs` associations.
    expect(pkg.desktopName).toBe(`${linux.executableName}.desktop`);
    expect(linux.syncDesktopName).toBe(true);
  });

  test('StartupWMClass is left for electron-builder to derive from desktopName', () => {
    // A hand-written value is how the two drifted apart in the first place.
    expect(linux.desktop?.entry?.StartupWMClass).toBeUndefined();
    for (const target of ['deb', 'pacman', 'appImage', 'rpm', 'snap']) {
      expect(pkg.build[target]?.desktop?.entry?.StartupWMClass).toBeUndefined();
    }
  });
});
