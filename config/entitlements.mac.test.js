// macOS camera/microphone build config (#362).
//
// A hardened-runtime app cannot touch the camera or the microphone without
// `com.apple.security.device.camera` / `.audio-input`: TCC never shows the
// system prompt, denies outright, and the app is not even listed under
// Privacy & Security, so `grantWithOsGate`'s `askForMediaAccess()` comes back
// false and the user has nowhere to fix it. The usage descriptions are what
// that system prompt says — without them macOS shows Electron's generic
// placeholder text instead of a Freedom-specific reason.
//
// Both are pure build config, invisible to every test that runs on this
// (Linux) box and to every unsigned build, so they are easy to drop in a
// refactor. This guards them.

const fs = require('fs');
const path = require('path');
const plist = require('plist');

const ENTITLEMENTS_PATH = path.join(__dirname, 'entitlements.mac.plist');
const pkg = require('../package.json');

describe('macOS media entitlements and usage descriptions', () => {
  const entitlements = plist.parse(fs.readFileSync(ENTITLEMENTS_PATH, 'utf8'));

  test.each(['com.apple.security.device.camera', 'com.apple.security.device.audio-input'])(
    '%s is granted in config/entitlements.mac.plist',
    (key) => {
      expect(entitlements[key]).toBe(true);
    }
  );

  // The same file is used for `entitlements` and `entitlementsInherit`, which
  // is why adding the keys once covers the renderer/GPU helpers that actually
  // open the capture devices.
  test('the file is used for both the app and its inherited helper entitlements', () => {
    expect(pkg.build.mac.entitlements).toBe('config/entitlements.mac.plist');
    expect(pkg.build.mac.entitlementsInherit).toBe('config/entitlements.mac.plist');
    expect(pkg.build.mac.hardenedRuntime).toBe(true);
  });

  test.each(['NSCameraUsageDescription', 'NSMicrophoneUsageDescription'])(
    'mac.extendInfo carries a non-empty %s',
    (key) => {
      const value = pkg.build.mac.extendInfo[key];
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
    }
  );

  test('extendInfo keeps its pre-existing keys', () => {
    expect(pkg.build.mac.extendInfo.LSMultipleInstancesProhibited).toBe(false);
  });
});
