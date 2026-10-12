const { EventEmitter } = require('events');
const {
  createSecondInstanceHandler,
  handOverToRunningProfile,
  listenForProfileRelaunches,
} = require('./profile-instance-handoff');
const { createFirstWindowLinkQueue } = require('./launch-urls');

const SETTINGS_URL = 'freedom://settings/profile';

function makeApp({ lock = true, ready = true } = {}) {
  const app = new EventEmitter();
  app.requestSingleInstanceLock = jest.fn(() => lock);
  app.isReady = jest.fn(() => ready);
  let resolveReady;
  const whenReady = new Promise((resolve) => {
    resolveReady = resolve;
  });
  app.whenReady = jest.fn(() => whenReady);
  app.becomeReady = () => {
    app.isReady.mockReturnValue(true);
    resolveReady();
    return whenReady;
  };
  return app;
}

function readyQueue() {
  const queue = createFirstWindowLinkQueue();
  queue.drainForFirstWindow();
  return queue;
}

describe('profile instance hand-off (Linux single-instance lock, #142)', () => {
  describe('handOverToRunningProfile', () => {
    test('a launch of a running profile hands over when the running process holds the lock', () => {
      const app = makeApp({ lock: false });
      expect(handOverToRunningProfile(app, { platform: 'linux' })).toBe(true);
      expect(app.requestSingleInstanceLock).toHaveBeenCalledTimes(1);
    });

    test('falls back to the file hand-off when nothing holds the lock', () => {
      const app = makeApp({ lock: true });
      expect(handOverToRunningProfile(app, { platform: 'linux' })).toBe(false);
    });

    test('is inert on macOS and Windows', () => {
      for (const platform of ['darwin', 'win32']) {
        const app = makeApp({ lock: false });
        expect(handOverToRunningProfile(app, { platform })).toBe(false);
        expect(app.requestSingleInstanceLock).not.toHaveBeenCalled();
      }
    });
  });

  describe('listenForProfileRelaunches', () => {
    test('takes the lock and listens for second launches on Linux', () => {
      const app = makeApp();
      const focusWindow = jest.fn();
      expect(
        listenForProfileRelaunches(app, {
          platform: 'linux',
          settingsUrl: SETTINGS_URL,
          firstWindowLinks: readyQueue(),
          focusWindow,
        })
      ).toBe(true);
      app.emit('second-instance', {}, ['/opt/Freedom/freedom', '--profile=work']);
      expect(focusWindow).toHaveBeenCalledWith([]);
    });

    test('is inert on macOS and Windows', () => {
      for (const platform of ['darwin', 'win32']) {
        const app = makeApp();
        expect(listenForProfileRelaunches(app, { platform })).toBe(false);
        expect(app.requestSingleInstanceLock).not.toHaveBeenCalled();
        expect(app.listenerCount('second-instance')).toBe(0);
      }
    });

    test('without the lock it does not listen, and says why', () => {
      const app = makeApp({ lock: false });
      const logger = { warn: jest.fn() };
      expect(listenForProfileRelaunches(app, { platform: 'linux', logger })).toBe(false);
      expect(app.listenerCount('second-instance')).toBe(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('second-instance handler', () => {
    function handler(overrides = {}) {
      const app = overrides.app || makeApp();
      const focusWindow = overrides.focusWindow || jest.fn();
      const firstWindowLinks = overrides.firstWindowLinks || readyQueue();
      const logger = { error: jest.fn() };
      return {
        app,
        focusWindow,
        firstWindowLinks,
        logger,
        handle: createSecondInstanceHandler({
          app,
          settingsUrl: SETTINGS_URL,
          firstWindowLinks,
          focusWindow,
          logger,
        }),
      };
    }

    test('a plain relaunch (dock, app grid, terminal) raises the window in the same turn', () => {
      const { handle, focusWindow } = handler();
      handle({}, ['/opt/Freedom/freedom', '--profile=default']);
      // Synchronously: Electron set this launch's activation token just before
      // the event, and the focus must activate with it.
      expect(focusWindow).toHaveBeenCalledWith([]);
    });

    test('an x-freedom-profile switch raises the window and opens nothing', () => {
      const { handle, focusWindow } = handler();
      handle({}, ['/opt/Freedom/freedom', 'x-freedom-profile:work']);
      expect(focusWindow).toHaveBeenCalledWith([]);
    });

    test('opens the links the launch was given, checked like any launch', () => {
      const { handle, focusWindow } = handler();
      handle({}, [
        '/opt/Freedom/freedom',
        '--profile=work',
        'https://example.com/a',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      ]);
      expect(focusWindow).toHaveBeenCalledWith([
        'https://example.com/a',
        'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      ]);
    });

    test('a Profiles-manager launch with --open-settings opens Profile settings only', () => {
      const { handle, focusWindow } = handler();
      handle({}, [
        '/opt/Freedom/freedom',
        '--profile=work',
        '--open-settings',
        'https://a.example',
      ]);
      expect(focusWindow).toHaveBeenCalledWith([SETTINGS_URL]);
    });

    test('while cold-starting, the links go to the first window instead', () => {
      const firstWindowLinks = createFirstWindowLinkQueue();
      const { handle, focusWindow } = handler({ firstWindowLinks });
      handle({}, ['/opt/Freedom/freedom', 'https://example.com/a']);
      handle({}, ['/opt/Freedom/freedom', '--open-settings']);
      expect(focusWindow).not.toHaveBeenCalled();
      expect(firstWindowLinks.drainForFirstWindow()).toEqual([
        'https://example.com/a',
        SETTINGS_URL,
      ]);
    });

    test('waits for ready if the app is not ready yet', async () => {
      const app = makeApp({ ready: false });
      const { handle, focusWindow } = handler({ app });
      handle({}, ['/opt/Freedom/freedom', 'https://example.com/a']);
      expect(focusWindow).not.toHaveBeenCalled();
      await app.becomeReady();
      await Promise.resolve();
      expect(focusWindow).toHaveBeenCalledWith(['https://example.com/a']);
    });

    test('a focus failure is logged, not thrown into Electron', () => {
      const focusWindow = jest.fn(() => {
        throw new Error('window destroyed');
      });
      const { handle, logger } = handler({ focusWindow });
      expect(() => handle({}, ['/opt/Freedom/freedom'])).not.toThrow();
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });
});
