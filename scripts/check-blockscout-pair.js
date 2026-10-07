// Live canary for the router's blockscout source (#529, #596): reads one known
// Bee node wallet's xBZZ Transfer history from rpc.gnosischain.com and from
// Blockscout, the pair Ant's first wallet scan relies on, and fails unless the
// two agree on at least the transfers the wallet is known to have. A Blockscout
// API change makes every pair disagree and silently sends first scans back to
// the window-by-window path (#596), so this runs nightly
// (.github/workflows/blockscout-canary.yml). Read-only, public data.
//
// Usage: node scripts/check-blockscout-pair.js
const {
  ERC20_TRANSFER_TOPIC,
  fetchBlockscoutTransferLogs,
  logIndexFilter,
  logsAgree,
} = require('../src/main/networks/blockscout-logs');

const RPC_URL = 'https://rpc.gnosischain.com';
const XBZZ = '0xdbf3ea6f5bee45c02255b2c26a16f300502f68da';
const DEPLOY_BLOCK = 16_514_506;
// The wallet of src/main/networks/__fixtures__/blockscout-xbzz-transfers.json,
// which had sent 11 xBZZ transfers by 2026-10-07. Its history only grows, so
// fewer means one of the providers lost some, and none would let two
// providers agree on an empty answer.
const WALLET = '0x000000000000000000000000971f31aaeac713b47aa55e50c06409afc1de46b9';
const KNOWN_TRANSFERS = 11;
// Leaves the newest blocks out, as the router does, so a Blockscout a little
// behind the head still agrees.
const TAIL_BLOCKS = 1000;

async function rpc(method, params) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function main() {
  const head = Number.parseInt(await rpc('eth_blockNumber', []), 16);
  const toBlock = head - TAIL_BLOCKS;
  const params = [
    {
      address: XBZZ,
      fromBlock: `0x${DEPLOY_BLOCK.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      topics: [ERC20_TRANSFER_TOPIC, WALLET],
    },
  ];
  const fromRpc = await rpc('eth_getLogs', params);
  const fromBlockscout = await fetchBlockscoutTransferLogs(logIndexFilter(100, params), toBlock, {
    timeoutMs: 30_000,
  });
  console.log(
    `blocks ${DEPLOY_BLOCK}..${toBlock}: ${RPC_URL} ${fromRpc.length} logs, ` +
      `Blockscout ${fromBlockscout.length} transfers`
  );
  if (fromRpc.length < KNOWN_TRANSFERS || fromBlockscout.length < KNOWN_TRANSFERS) {
    throw new Error(`expected at least ${KNOWN_TRANSFERS} transfers from each provider`);
  }
  if (!logsAgree(fromBlockscout, fromRpc)) throw new Error('the two providers disagree');
  console.log('they agree');
}

main().catch((err) => {
  console.error(`Blockscout pair check failed: ${err.message}`);
  process.exitCode = 1;
});
