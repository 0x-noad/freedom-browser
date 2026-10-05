# Recovering interrupted Myotis ownership (#418)

The reporter's Linux help dialog shows `Failure: ownership` with the addon
present. It does not identify what interrupted the supervisor. This change
fixes the resulting durable startup block, not a proven original crash cause.

## Exit evidence and recovery

Ordinary shutdown is unchanged: the native supervisor holds the owner file's
kernel lock and writes `retired` only after waiting for its direct child.
A free lock alone cannot prove exit: an orphaned execution child may survive
its supervisor. Neither a missing PID nor elapsed time authorizes recovery.

New supervisor starts also save `.freedom-myotis-boot`, binding the exact
active owner bytes to the local machine and OS boot. This file stays local and
is never logged. Failure to obtain boot evidence does not break otherwise
healthy startup; it disables automatic ownership recovery.

On an ownership failure, a bounded helper invocation takes the **same owner
lock**, checks a local filesystem and regular, unlinked files, then compares
that witness. A live owner, different machine, inaccessible file, unsupported
filesystem or unavailable boot identity stays blocked. No process is signalled.

A missing/invalid/stale witness is recorded for the current owner and current
boot. Freedom asks: **Restart your computer, then reopen Freedom**. This is the
one-time migration path for blocked 0.8.6 profiles: first launch the updated
build so it records the evidence, then restart the computer. Restarting only
Freedom, sleeping, or retrying in the same boot does not qualify.

After a matching prior-boot witness, the helper writes `v1 rebooted <uuid>`
while still holding the owner lock. The original owner bytes remain in the
witness. This receipt allows **replacement only**: the store creates a fresh
bundled generation, preserving all old snapshots and anchors. Only untrusted
peer hints may be inherited. Stale bundled anchors still require the existing
checkpoint quorum plus Colibri verification. A crash between the receipt and
pointer publication remains recoverable without resuming the old snapshot.

## Platform evidence

- Linux: `/etc/machine-id` plus `/proc/sys/kernel/random/boot_id`. Recovery
  accepts a bounded list of local filesystem types, not NFS/CIFS/unknown types.
- macOS: `gethostuuid` plus `kern.bootsessionuuid`, on `MNT_LOCAL` storage.
  The boot session UUID survives sleep/wake/hibernate.
- Windows: the installation's `MachineGuid` plus the kernel System process
  (PID 4) creation time from `NtQuerySystemInformation`. That process's
  creation time is fixed for the lifetime of the kernel; this is **not**
  wall-clock time minus uptime. It follows the Windows boot identification
  approach in the [OCSF CPID specification](https://github.com/ocsf/common-process-id/blob/main/specification.md#windows).
  Network drives and reparse-point owner files are refused. Use Windows
  **Restart**, not merely closing Freedom or sleep/hibernate.

As with the existing retired receipts, hostile software able to rewrite the
user's profile is outside this boundary. Moving a shared profile between live
machines is not supported; a changed machine identity never proves reboot.
No new IPC authority or dependency is introduced: policy stays in the main
process and kernel checks stay in the existing bundled native supervisor.

## Validation

`node scripts/check-myotis-owner-recovery.js` exercises the compiled helper
with real platform boot identities and disposable directories. It covers
legacy witness creation, same-boot refusal, a simulated previous-boot witness,
changed owner bytes, a different machine, hardlinks, a live supervisor lock
and ordinary clean retirement. It starts a benign JS addon, not live Myotis,
and neither reboots the host nor touches user profiles. CI runs it on all five
shipped OS/architecture targets. Simulation is not a physical reboot test.

Unit coverage checks fresh-generation replacement on both chains, interrupted
pointer publication, preservation of old snapshots, unchanged ownership while
reboot is pending, distrust of helper success without a durable receipt,
manager error routing and user-facing reboot guidance.
