// task-worker-host (#503): a scripted worker_threads worker drives every
// settle path — answer, reported failure, log, hang, crash, can't start.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('./logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const log = require('./logger');
const {
  createTaskWorkerHost,
  TaskWorkerUnavailable,
  TaskWorkerTimeout,
} = require('./task-worker-host');

let dir;
let host;

// Answers `echo:<value>:<threadId>`, never answers "hang", exits on "crash",
// reports `code` on "fail", and logs on "log".
function scriptedWorker() {
  const file = path.join(dir, 'scripted-worker.js');
  fs.writeFileSync(
    file,
    `const { parentPort, threadId, workerData } = require('node:worker_threads');
     parentPort.on('message', (m) => {
       if (m.value === 'hang') return;
       if (m.value === 'crash') process.exit(3);
       if (m.value === 'fail') {
         parentPort.postMessage({ id: m.id, ok: false, error: 'nope', code: 'E_NOPE' });
         return;
       }
       if (m.value === 'log') parentPort.postMessage({ type: 'log', level: 'error', message: 'hi' });
       parentPort.postMessage({
         id: m.id, ok: true, result: m.op + ':' + m.value + ':' + threadId + ':' + workerData.tag,
       });
     });`
  );
  return file;
}

beforeEach(() => {
  jest.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-worker-host-'));
  host = createTaskWorkerHost({
    name: 'Test',
    workerPath: scriptedWorker(),
    workerData: () => ({ tag: 't' }),
    timeoutMs: 5_000,
  });
});

afterEach(() => {
  host.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('answers a request in the worker, with its workerData', async () => {
  await expect(host.run('echo', { value: 'a' })).resolves.toMatch(/^echo:a:\d+:t$/);
});

test('a reported failure rejects with the message and code, and keeps the worker', async () => {
  const first = await host.run('echo', { value: 'a' });
  const err = await host.run('echo', { value: 'fail' }).catch((e) => e);
  expect(err).not.toBeInstanceOf(TaskWorkerUnavailable);
  expect(err.message).toBe('nope');
  expect(err.code).toBe('E_NOPE');
  const next = await host.run('echo', { value: 'b' });
  expect(next.split(':')[2]).toBe(first.split(':')[2]);
});

test('worker log lines reach the main logger', async () => {
  await host.run('echo', { value: 'log' });
  expect(log.error).toHaveBeenCalledWith('[Test] hi');
});

test('a hung request times out, fails requests queued behind it, and the worker is replaced', async () => {
  host.resetForTest({ timeoutMs: 200 });
  const first = await host.run('echo', { value: 'a' });
  const hung = host.run('echo', { value: 'hang' });
  const queued = host.run('echo', { value: 'hang' });
  queued.catch(() => {});
  await expect(hung).rejects.toBeInstanceOf(TaskWorkerTimeout);
  await expect(queued).rejects.toBeInstanceOf(TaskWorkerTimeout);
  const next = await host.run('echo', { value: 'b' });
  expect(next.split(':')[2]).not.toBe(first.split(':')[2]);
});

test('a worker that dies after answering fails its request as unavailable, then respawns', async () => {
  await host.run('echo', { value: 'a' });
  await expect(host.run('echo', { value: 'crash' })).rejects.toBeInstanceOf(TaskWorkerUnavailable);
  await expect(host.run('echo', { value: 'b' })).resolves.toMatch(/^echo:b/);
});

test('a worker that dies before answering anything is disabled for the session', async () => {
  await expect(host.run('echo', { value: 'crash' })).rejects.toBeInstanceOf(TaskWorkerUnavailable);
  await expect(host.run('echo', { value: 'a' })).rejects.toThrow('worker disabled');
});

test('a worker script that cannot load is disabled for the session', async () => {
  host.resetForTest({ path: path.join(dir, 'missing.js') });
  await expect(host.run('echo', { value: 'a' })).rejects.toBeInstanceOf(TaskWorkerUnavailable);
  await expect(host.run('echo', { value: 'a' })).rejects.toThrow('worker disabled');
  expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('[Test] worker'));
});

test('stopping fails pending requests without the unavailable fallback', async () => {
  const pending = host.run('echo', { value: 'hang' });
  host.stop();
  const err = await pending.catch((e) => e);
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(TaskWorkerUnavailable);
  await expect(host.run('echo', { value: 'a' })).resolves.toMatch(/^echo:a/);
});
