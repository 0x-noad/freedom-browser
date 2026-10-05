const { execFile } = require('child_process');
const { randomUUID } = require('crypto');
const { supervisorPath, childEnvironment } = require('./myotis-process');

// Only the native helper may establish that an old owner belongs to a previous
// boot, under its filesystem lock. No renderer-provided path or shell command.
function recoverOwner(dataDir) {
  return new Promise((resolve, reject) => {
    const fail = (reboot = false) => {
      const error = new Error(reboot ? 'Restart the computer to recover Myotis' : 'Myotis ownership is unconfirmed');
      error.code = reboot ? 'CHECKPOINT_REBOOT_REQUIRED' : 'CHECKPOINT_OWNERSHIP';
      reject(error);
    };
    try {
      execFile(supervisorPath(), ['--recover-owner', dataDir, randomUUID()], {
        env: childEnvironment(), timeout: 5000, maxBuffer: 1024, windowsHide: true,
      }, (error) => {
        if (!error || error.code === 11) resolve();
        else fail(error.code === 10);
      });
    } catch { fail(); }
  });
}

module.exports = { recoverOwner };
