/**
 * Chequebook Deposit Module
 *
 * Sidebar sub-screen for the node's chequebook deposit: the xBZZ its
 * chequebook holds to pay other nodes for bandwidth, uploads and (on nodes
 * that pay for them, #488) faster downloads. The node keeps it at its target
 * by itself after each storage purchase; when it runs dry, the top-up is paid
 * in xDAI through the publish setup's pay step. That is also the deposit-only
 * path the Nodes tab's Browsing Credit "Top Up Credit" opens: no storage is
 * bought.
 *
 * On an Ant with freedom-hq/ant#126 (the browsing credit service reports
 * `depositAmount`), the user picks how much to add — a preset or their own
 * amount — rather than only refilling to the node's 0.001 xBZZ target. The
 * same xDAI pay step and its guards run either way.
 */

import { walletState, registerScreenHider } from './wallet-state.js';
import { refuseSubscreenWhileInFlight } from './signature-flight.js';
import { openPublishSetup } from './publish-setup.js';
import {
  DEPOSIT_PRESETS,
  DEFAULT_DEPOSIT_XBZZ,
  parseXbzzAmount,
  formatXbzz,
} from './browsing-credit.js';

let depositScreen;
let depositBackBtn;
let currentBzzEl;
let targetBzzEl;
let depositText;
let depositBtn;
let amountSection;
let amountPresets;
let amountInput;
let amountError;
let presetButtons = [];

let isOpen = false;
let setupState = null;
// Whether the node takes a deposit amount (browsingCredit.getState()).
let amountSupported = false;
let selectedPreset = DEFAULT_DEPOSIT_XBZZ;

export function initChequebookDeposit() {
  depositScreen = document.getElementById('sidebar-chequebook-deposit');
  depositBackBtn = document.getElementById('chequebook-deposit-back');
  currentBzzEl = document.getElementById('chequebook-current-bzz');
  targetBzzEl = document.getElementById('chequebook-target-bzz');
  depositText = document.getElementById('chequebook-deposit-text');
  depositBtn = document.getElementById('chequebook-deposit-btn');
  amountSection = document.getElementById('chequebook-amount');
  amountPresets = document.getElementById('chequebook-amount-presets');
  amountInput = document.getElementById('chequebook-amount-input');
  amountError = document.getElementById('chequebook-amount-error');

  presetButtons = DEPOSIT_PRESETS.map((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'safe-preset';
    btn.dataset.xbzz = preset.xbzz;
    const title = document.createElement('span');
    title.className = 'safe-preset-title';
    title.textContent = `${preset.xbzz} xBZZ`;
    const detail = document.createElement('span');
    detail.className = 'safe-preset-detail';
    detail.textContent = preset.detail;
    btn.append(title, detail);
    btn.addEventListener('click', () => {
      selectedPreset = preset.xbzz;
      if (amountInput) amountInput.value = '';
      render();
    });
    amountPresets?.appendChild(btn);
    return btn;
  });
  amountInput?.addEventListener('input', () => render());

  registerScreenHider(() => closeChequebookDeposit());

  depositBackBtn?.addEventListener('click', () => closeChequebookDeposit());
  depositBtn?.addEventListener('click', () => handleTopUp());

  window.publishSetup?.onState((state) => {
    setupState = state;
    if (isOpen) render();
  });
}

export async function openChequebookDeposit() {
  if (refuseSubscreenWhileInFlight('Chequebook deposit screen')) return;

  walletState.identityView?.classList.add('hidden');
  depositScreen?.classList.remove('hidden');
  isOpen = true;
  void window.publishSetup?.watch('chequebook-deposit', true);

  render();
  const [setup, credit] = await Promise.allSettled([
    window.publishSetup?.getState(),
    window.browsingCredit?.getState(),
  ]);
  // A failed setup read is filled in by the push subscription.
  if (setup.status === 'fulfilled' && setup.value) setupState = setup.value;
  amountSupported = credit.status === 'fulfilled' && credit.value?.depositAmount === true;
  if (isOpen) render();
}

/** The amount picked: the typed one when there is one, else the preset. */
function chosenAmount() {
  const typed = amountInput?.value.trim();
  return parseXbzzAmount(typed || selectedPreset);
}

export function closeChequebookDeposit() {
  if (isOpen) void window.publishSetup?.watch('chequebook-deposit', false);
  isOpen = false;
  depositScreen?.classList.add('hidden');
  walletState.identityView?.classList.remove('hidden');
}

function render() {
  const account = setupState?.account;
  const chequebook = account?.chequebook;

  if (currentBzzEl) {
    currentBzzEl.textContent = chequebook?.deposit ? `${chequebook.deposit} xBZZ` : '--';
  }
  if (targetBzzEl) {
    targetBzzEl.textContent = chequebook?.target ? `${chequebook.target} xBZZ` : '--';
  }

  const amountMode =
    amountSupported &&
    Boolean(chequebook) &&
    chequebook.managed !== false &&
    Boolean(setupState?.canBuy);

  let text;
  if (!account) {
    text = 'Checking the deposit…';
  } else if (!chequebook) {
    text =
      'Your node does not have a chequebook yet. Your first storage purchase creates it and funds the deposit.';
  } else if (chequebook.managed === false) {
    text = 'This node manages its chequebook deposit through its own configuration.';
  } else if (chequebook.needsTopUp) {
    text =
      'The deposit is used up, so uploads will stall and downloads use the free tier. Top it up to keep publishing and browsing at full speed; you pay in xDAI, like for storage.';
  } else if (amountMode) {
    text =
      'Add xBZZ to pay peers for faster downloads and for uploads. You pay in xDAI; your node swaps it for xBZZ.';
  } else {
    text = 'The deposit is funded. Your node tops it up by itself when you buy storage.';
  }
  if (depositText) depositText.textContent = text;

  amountSection?.classList.toggle('hidden', !amountMode);
  if (amountMode) {
    const typed = Boolean(amountInput?.value.trim());
    for (const btn of presetButtons) {
      const selected = !typed && btn.dataset.xbzz === selectedPreset;
      btn.classList.toggle('selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    }
    const amount = chosenAmount();
    const error = typed ? amount.error || '' : '';
    if (amountError) {
      amountError.textContent = error;
      amountError.classList.toggle('hidden', !error);
    }
    amountInput?.classList.toggle('error', Boolean(error));
    if (depositBtn) {
      depositBtn.textContent = amount.plur ? `Top Up ${formatXbzz(amount.plur)} xBZZ` : 'Top Up';
      depositBtn.disabled = !amount.plur;
      depositBtn.classList.remove('hidden');
    }
    return;
  }

  const canTopUp =
    Boolean(chequebook?.needsTopUp) && chequebook.managed !== false && setupState?.canBuy;
  if (depositBtn) {
    depositBtn.textContent = 'Top Up Deposit';
    depositBtn.disabled = false;
  }
  depositBtn?.classList.toggle('hidden', !canTopUp);
}

async function handleTopUp() {
  let request = { kind: 'deposit' };
  if (amountSection && !amountSection.classList.contains('hidden')) {
    const amount = chosenAmount();
    if (!amount.plur) return;
    request = { kind: 'deposit', amountPlur: amount.plur };
  }
  if (depositBtn) depositBtn.disabled = true;
  let error = null;
  try {
    const result = await window.publishSetup?.arm(request);
    if (result && !result.ok) error = result.error || 'Could not start the top-up.';
  } catch (err) {
    error = err?.message || 'Could not start the top-up.';
  } finally {
    if (depositBtn) depositBtn.disabled = false;
  }
  closeChequebookDeposit();
  openPublishSetup({ error });
}
