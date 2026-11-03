'use strict';

/**
 * Freedom Agent's window onto the data vault (main process).
 *
 * Deliberately thin. Every rule about what the Agent may see lives in
 * `DataVaultManager` — which owner it was approved for, that a read stops at
 * `/shared`, that a refusal is indistinguishable from having no data, that a
 * locked vault raises no sheet. This class exists to translate between the
 * automation contract and those methods, and to hold NOTHING else, so there is
 * only one place the rules can be wrong.
 *
 * It lives beside the vault rather than in `src/main/agent/` because it is the
 * vault's own boundary: the automation layer dispatches to it, as it does to the
 * wallet and node controllers, and knows nothing about partitions.
 *
 * There is no write operation here, and none in the operation set. The Agent
 * cannot change a partition, publish into one, or grant itself anything.
 */

const { AutomationError, ERROR_CODES } = require('../automation/contract/errors');

class VaultAgentController {
  /**
   * @param {object} deps
   * @param {() => object|null} deps.getManager the live DataVaultManager, or
   *   null when the vault is not registered in this build or has not started.
   *   Read per call, not captured, so the Agent is not left holding a manager
   *   from a previous profile.
   */
  constructor({ getManager } = {}) {
    if (typeof getManager !== 'function') {
      throw new TypeError('VaultAgentController requires getManager()');
    }
    this._getManager = getManager;
  }

  /** @private */
  _manager() {
    const manager = this._getManager();
    if (!manager) {
      throw new AutomationError(
        ERROR_CODES.CAPABILITY_UNAVAILABLE,
        'The data vault is unavailable in this runtime'
      );
    }
    return manager;
  }

  /**
   * The sites the user let the Agent read, so it never has to guess an origin.
   *
   * Not an enumeration of the vault: every entry is a site the user themselves
   * pointed the Agent at. A site they hold data for but never approved does not
   * appear here, and `readShared` will not confirm it either.
   */
  async listShared() {
    return this._manager().agentSharedSources();
  }

  /**
   * Read pointers under one owner's `/shared`.
   *
   * `null` for a pointer means: not approved, switched off, outside `/shared`,
   * never written, or no such partition — on purpose, all the same answer.
   */
  async readShared(input) {
    return this._manager().agentGetShared(input.origin, input.paths);
  }
}

module.exports = { VaultAgentController };
