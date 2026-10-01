/**
 * The publish setup screen's own routing: which view a readiness state
 * shows, and how the pay step hands over to the Send screen and back.
 */

const NODE_WALLET = '0x2222222222222222222222222222222222222222';
const OTHER = '0x3333333333333333333333333333333333333333';

class FakeClassList {
  constructor(classes = []) {
    this.set = new Set(classes);
  }
  add(c) {
    this.set.add(c);
  }
  remove(c) {
    this.set.delete(c);
  }
  contains(c) {
    return this.set.has(c);
  }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : force;
    if (on) this.set.add(c);
    else this.set.delete(c);
    return on;
  }
}

class FakeElement {
  constructor(classes = []) {
    this.classList = new FakeClassList(classes);
    this.listeners = {};
    this.children = [];
    this.textContent = '';
    this.disabled = false;
  }
  set innerHTML(value) {
    if (value === '') this.children = [];
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  dispatch(type) {
    (this.listeners[type] || []).forEach((fn) => fn({ type }));
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  appendChild(node) {
    this.children.push(node);
  }
  removeAttribute() {}
  querySelector() {
    return null;
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function readiness(key) {
  return { key, ok: key === 'ready', message: `readiness ${key}` };
}

function payState() {
  return {
    canBuy: true,
    readiness: readiness('needs-storage'),
    plans: [],
    operation: {
      phase: 'awaiting-funds',
      request: { kind: 'buy', planId: 'starter' },
      quote: {
        walletAddress: NODE_WALLET,
        send: { wei: '450000000000000000', display: '0.45' },
      },
    },
  };
}

async function load({ state, openSendResult = { opened: true } }) {
  jest.resetModules();
  jest.useFakeTimers();

  const elements = {};
  global.document = {
    getElementById: (id) => (elements[id] ||= new FakeElement(['hidden'])),
    createElement: () => new FakeElement(),
  };
  const windowListeners = {};
  global.window = {
    addEventListener: (type, fn) => (windowListeners[type] ||= []).push(fn),
    publishSetup: {
      onState: jest.fn(),
      watch: jest.fn().mockResolvedValue(),
      getState: jest.fn().mockResolvedValue(state),
      getPlans: jest.fn().mockResolvedValue({ plans: [] }),
      trackFundingTx: jest.fn().mockResolvedValue(),
      arm: jest.fn(),
      cancel: jest.fn(),
    },
  };

  const identityView = new FakeElement();
  const walletState = { identityView };
  const openSend = jest.fn().mockResolvedValue(openSendResult);
  jest.doMock('./wallet-state.js', () => ({ walletState, registerScreenHider: jest.fn() }));
  jest.doMock('./signature-flight.js', () => ({ refuseSubscreenWhileInFlight: () => false }));
  jest.doMock('./send.js', () => ({ openSend }));
  jest.doMock('./receive.js', () => ({ generateThemedQr: jest.fn().mockResolvedValue(null) }));
  jest.doMock('./stamp-manager.js', () => ({ openStampManager: jest.fn() }));
  jest.doMock('./funding-actions.js', () => ({
    GNOSIS_CHAIN_ID: 100,
    XDAI_TOKEN_KEY: '100:native',
  }));
  jest.doMock('../tabs.js', () => ({ createTab: jest.fn() }));
  jest.doMock('../sidebar.js', () => ({ isVisible: () => true }));

  const mod = await import('./publish-setup.js');
  mod.initPublishSetup();
  const visible = (id) => !elements[id].classList.contains('hidden');
  const emit = (type, detail) => (windowListeners[type] || []).forEach((fn) => fn({ detail }));
  return { mod, elements, identityView, openSend, visible, emit };
}

afterEach(() => {
  for (const name of [
    './wallet-state.js',
    './signature-flight.js',
    './send.js',
    './receive.js',
    './stamp-manager.js',
    './funding-actions.js',
    '../tabs.js',
    '../sidebar.js',
  ]) {
    jest.dontMock(name);
  }
  delete global.document;
  delete global.window;
  jest.useRealTimers();
});

describe('views', () => {
  test.each(['ready', 'storage-pending'])(
    'Buy More Storage from %s shows the plan list',
    async (key) => {
      const { mod, elements, visible } = await load({
        state: { canBuy: true, readiness: readiness(key), plans: [] },
      });
      await mod.openPublishSetup();
      expect(visible('publish-setup-ready')).toBe(true);

      elements['publish-setup-buy-more'].dispatch('click');
      // A pending batch may be one the peers never accept: a new plan must
      // still be reachable, not the node view with no action.
      expect(visible('publish-setup-plans')).toBe(true);
      expect(visible('publish-setup-node')).toBe(false);
      expect(visible('publish-setup-ready')).toBe(false);
    }
  );
});

describe('paying from the Freedom wallet', () => {
  async function openPay(options) {
    const ctx = await load({ state: payState(), ...options });
    await ctx.mod.openPublishSetup();
    expect(ctx.visible('publish-setup-pay')).toBe(true);
    ctx.elements['publish-pay-wallet'].dispatch('click');
    await flush();
    return ctx;
  }

  test('tracks only a transaction that pays the node', async () => {
    const { emit } = await openPay();
    const paid = { chainId: 100, asset: null, to: NODE_WALLET, value: '450000000000000000' };

    emit('wallet:tx-success', { ...paid, hash: '0x01', to: OTHER });
    emit('wallet:tx-success', { ...paid, hash: '0x02', value: '100' });
    emit('wallet:tx-success', { ...paid, hash: '0x03', chainId: 1 });
    emit('wallet:tx-success', { ...paid, hash: '0x04', asset: '0xtoken' });
    expect(window.publishSetup.trackFundingTx).not.toHaveBeenCalled();

    emit('wallet:tx-success', {
      ...paid,
      hash: '0x05',
      to: NODE_WALLET.toUpperCase().replace('0X', '0x'),
    });
    expect(window.publishSetup.trackFundingTx).toHaveBeenCalledWith('0x05');
  });

  test('a transaction outside the pay step is not tracked', async () => {
    const { emit } = await load({ state: payState() });
    emit('wallet:tx-success', {
      hash: '0x01',
      chainId: 100,
      asset: null,
      to: NODE_WALLET,
      value: '450000000000000000',
    });
    expect(window.publishSetup.trackFundingTx).not.toHaveBeenCalled();
  });

  test('comes back after Send closes', async () => {
    const { openSend, visible } = await openPay();
    expect(visible('sidebar-publish-setup')).toBe(false);

    openSend.mock.calls[0][0].onClose({ handedOff: false });
    await jest.advanceTimersByTimeAsync(0);
    expect(visible('sidebar-publish-setup')).toBe(true);
  });

  test('stays away when a Safe send hands the sidebar to its signing board', async () => {
    const { openSend, visible } = await openPay();

    // send.js closes with handedOff, then the board takes the sidebar.
    // The close alone settles it: no timer is left to race the board.
    openSend.mock.calls[0][0].onClose({ handedOff: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(visible('sidebar-publish-setup')).toBe(false);
  });

  test('stays away when another screen took the sidebar before the timer', async () => {
    const { openSend, visible, identityView } = await openPay();

    openSend.mock.calls[0][0].onClose({ handedOff: false });
    identityView.classList.add('hidden');
    await jest.advanceTimersByTimeAsync(0);
    expect(visible('sidebar-publish-setup')).toBe(false);
  });

  test('does not paint over a Safe board that openSend opened instead', async () => {
    const ctx = await load({
      state: payState(),
      openSendResult: { opened: false, reason: 'This Safe already has a transaction waiting.' },
    });
    await ctx.mod.openPublishSetup();
    ctx.openSend.mockImplementation(async () => {
      ctx.identityView.classList.add('hidden'); // the board's open
      return { opened: false, reason: 'This Safe already has a transaction waiting.' };
    });
    ctx.elements['publish-pay-wallet'].dispatch('click');
    await flush();
    expect(ctx.visible('sidebar-publish-setup')).toBe(false);
  });
});
