const fs = require('fs');
const os = require('os');
const path = require('path');

// The installed electron-log's own File class: log-file-flush.js reaches into
// its fields, so a version that renames them has to fail here.
const File = require('electron-log/src/node/transports/file/File');
const NullFile = require('electron-log/src/node/transports/file/NullFile');
const { drainLogFile, flushLogFileSync } = require('./log-file-flush');

let dir;
let logPath;
let file;
let transport;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-file-flush-'));
  logPath = path.join(dir, 'main.log');
  file = new File({ path: logPath, writeAsync: true });
  transport = { getFile: () => file };
  // electron-log's transport reads the size before every write; the first read
  // stats the file, later ones add bytesWritten.
  expect(file.size).toBe(0);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const read = () => (fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '');
const lines = () => read().split(os.EOL).filter(Boolean);
const waitIdle = async () => {
  while (file.hasActiveAsyncWriting || file.asyncWriteQueue.length) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
};

test('electron-log async mode leaves lines queued behind an in-flight write', async () => {
  // The premise the helpers exist for: nothing is on disk synchronously.
  file.writeLine('one');
  file.writeLine('two');
  expect(file.hasActiveAsyncWriting).toBe(true);
  expect(file.asyncWriteQueue).toEqual([`two${os.EOL}`]);
  expect(read()).toBe('');
  await waitIdle();
  expect(lines()).toEqual(['one', 'two']);
});

test('flushLogFileSync writes the queue at once and makes later lines synchronous', async () => {
  file.writeLine('one');
  file.writeLine('two');
  file.writeLine('three');
  flushLogFileSync(transport);
  // 'one' is the in-flight batch, left to finish by itself; the queued lines
  // are already on disk without yielding to the loop.
  expect(read()).toBe(`two${os.EOL}three${os.EOL}`);
  expect(file.asyncWriteQueue).toEqual([]);

  file.writeLine('four');
  expect(read()).toContain(`four${os.EOL}`);

  await waitIdle();
  expect(lines().sort()).toEqual(['four', 'one', 'three', 'two']);
  expect(file.size).toBe(Buffer.byteLength(read()));
});

test('drainLogFile lets the in-flight batch land first, so order is kept', async () => {
  for (let i = 0; i < 50; i += 1) file.writeLine(`line ${i}`);
  await drainLogFile(transport);
  file.writeLine('after drain');
  // Synchronous after the drain: no further awaiting needed.
  expect(lines()).toEqual([...Array.from({ length: 50 }, (_, i) => `line ${i}`), 'after drain']);
  expect(file.hasActiveAsyncWriting).toBe(false);
  expect(file.size).toBe(Buffer.byteLength(read()));
});

test('drainLogFile gives up on a stuck write after its timeout and still flushes', async () => {
  file.hasActiveAsyncWriting = true; // a batch that never completes
  file.asyncWriteQueue = [`queued${os.EOL}`];
  const started = Date.now();
  await drainLogFile(transport, { timeoutMs: 30, pollMs: 5 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  expect(read()).toBe(`queued${os.EOL}`);
  expect(file.writeAsync).toBe(false);
});

test('a failing write is swallowed', () => {
  file.asyncWriteQueue = [`queued${os.EOL}`];
  const fsImpl = {
    writeFileSync: () => {
      throw new Error('EACCES');
    },
  };
  expect(() => flushLogFileSync(transport, { fsImpl })).not.toThrow();
  expect(file.asyncWriteQueue).toEqual([]);
});

test.each([
  ['no transport', undefined],
  [
    'getFile throws',
    {
      getFile: () => {
        throw new Error('no path');
      },
    },
  ],
  ['NullFile', { getFile: () => new NullFile({ path: '/nonexistent/main.log' }) }],
])('%s is a no-op', async (_label, t) => {
  expect(() => flushLogFileSync(t)).not.toThrow();
  await expect(drainLogFile(t)).resolves.toBeUndefined();
});
