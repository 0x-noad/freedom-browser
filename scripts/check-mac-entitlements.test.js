// The packaged-app entitlements assertion (#370), mutation-tested off a Mac.
//
// `scripts/check-mac-entitlements.js` runs in the macOS smoke job against the
// signature of the app copied out of the `.dmg` and the one out of the
// `-mac.zip`. Whether it *fails* when a key is missing cannot be shown by
// shipping a broken plist — that would ship a release artifact with no camera
// access. So the checks are pure functions over the two plists a signed bundle
// carries, and this suite drives them with the real inputs, then with a copy of
// each input with one key dropped or turned off.
//
// The entitlements a correct build embeds are exactly the bytes of
// config/entitlements.mac.plist (electron-builder hands that file to codesign),
// so it stands in here for what `codesign -d --entitlements :-` prints.

const fs = require('fs');

const {
  ENTITLEMENTS_PATH,
  REQUIRED_ENTITLEMENTS,
  REQUIRED_USAGE_DESCRIPTIONS,
  expectedEntitlementKeys,
  checkEntitlements,
  checkUsageDescriptions,
} = require('./check-mac-entitlements');
const pkg = require('../package.json');

const SIGNED_ENTITLEMENTS = fs.readFileSync(ENTITLEMENTS_PATH, 'utf8');

// The Info.plist of a build made from this package.json: electron-builder
// copies every `mac.extendInfo` key into the bundle's plist verbatim, so the
// values come from there rather than from a literal in this file.
const infoPlistFrom = (extendInfo) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0">',
    '<dict>',
    '  <key>CFBundleName</key>',
    '  <string>Freedom</string>',
    ...Object.entries(extendInfo).flatMap(([key, value]) => [
      `  <key>${key}</key>`,
      typeof value === 'boolean' ? `  <${value}/>` : `  <string>${value}</string>`,
    ]),
    '</dict>',
    '</plist>',
  ].join('\n');

const SIGNED_INFO_PLIST = infoPlistFrom(pkg.build.mac.extendInfo);

// One <key>…</key><true/> pair out of the plist, the way a signing config that
// no longer names the file, or an app signed before the plist was extended,
// would leave it.
const withoutEntitlement = (xml, key) =>
  xml.replace(new RegExp(`\\s*<key>${key.replace(/\./g, '\\.')}</key>\\s*<true\\s*/>`), '');

const withEntitlementDenied = (xml, key) =>
  xml.replace(new RegExp(`(<key>${key.replace(/\./g, '\\.')}</key>\\s*)<true\\s*/>`), '$1<false/>');

describe('the packaged macOS entitlements assertion', () => {
  const expected = expectedEntitlementKeys();

  test('the app a correct build signs passes', () => {
    expect(checkEntitlements(SIGNED_ENTITLEMENTS, expected)).toEqual([]);
    expect(checkUsageDescriptions(SIGNED_INFO_PLIST)).toEqual([]);
  });

  test('every key config/entitlements.mac.plist grants is required', () => {
    expect(expected).toEqual(expect.arrayContaining(REQUIRED_ENTITLEMENTS));
    expect(expected.length).toBeGreaterThanOrEqual(REQUIRED_ENTITLEMENTS.length);
  });

  // The mutation the acceptance criteria asks for, once per expected key: a
  // signed app that dropped it fails, and the message names the key.
  test('a signed app missing one entitlement fails, naming it', () => {
    for (const key of expected) {
      const problems = checkEntitlements(withoutEntitlement(SIGNED_ENTITLEMENTS, key), expected);
      expect(problems).toEqual([`entitlement ${key} is not granted in the signed app`]);
    }
  });

  test.each(REQUIRED_ENTITLEMENTS)('%s granted as <false/> fails too', (key) => {
    expect(checkEntitlements(withEntitlementDenied(SIGNED_ENTITLEMENTS, key), expected)).toEqual([
      `entitlement ${key} is not granted in the signed app`,
    ]);
  });

  // Nothing in the entitlements blob can stand in for these: they are what the
  // TCC prompt says, and they live in the bundle's Info.plist.
  test.each(REQUIRED_USAGE_DESCRIPTIONS)('a missing %s fails', (key) => {
    const { [key]: _dropped, ...rest } = pkg.build.mac.extendInfo;
    expect(checkUsageDescriptions(infoPlistFrom(rest))).toEqual([
      `Info.plist has no non-empty ${key} string`,
    ]);
  });

  test.each(REQUIRED_USAGE_DESCRIPTIONS)('a whitespace-only %s fails', (key) => {
    expect(
      checkUsageDescriptions(infoPlistFrom({ ...pkg.build.mac.extendInfo, [key]: '   ' }))
    ).toEqual([`Info.plist's ${key} is empty`]);
  });

  // The expected set is read from the source plist, so it must not be able to
  // shrink quietly: a plist that no longer grants the media entitlements has to
  // fail here rather than expect nothing of the artifact.
  test.each(REQUIRED_ENTITLEMENTS)(
    'the expected set refuses a source plist that dropped %s',
    (key) => {
      expect(() => expectedEntitlementKeys(withoutEntitlement(SIGNED_ENTITLEMENTS, key))).toThrow(
        new RegExp(`no longer grants ${key.replace(/\./g, '\\.')}`)
      );
    }
  );
});
