# Nightly real-conditions E2E

Issue: [#559](https://github.com/solardev-xyz/freedom-browser/issues/559).

Every night this installs the **published** `nightly` release the way a tester would, on a clean Ubuntu 24.04 desktop and a clean Windows 11 machine. It then runs the `packaged` and `packaged-live` Playwright projects against the installed app.

The `release.yml` smoke jobs test the artifact on a CI runner before it is published, with xvfb, `--no-sandbox` and an extracted AppImage. This tests what people actually download, afterwards:

|                  | CI smoke (`release.yml`) | Real conditions (here)                     |
| ---------------- | ------------------------ | ------------------------------------------ |
| Artifact         | workflow artifact        | published release asset                    |
| Display          | xvfb                     | GNOME on Wayland / Windows desktop session |
| Chromium sandbox | off on Linux             | on                                         |
| AppImage         | extracted                | run as-is (FUSE, AppArmor)                 |
| Windows          | elevated runner          | standard UAC token, Defender on            |
| Machine          | warm runner image        | fresh snapshot of a stock install          |

## How it works

Both VMs are KVM guests on the e2e host, on libvirt's NAT network, so neither can be reached from outside. Each VM has a read-only `golden.qcow2` image. Every run boots a throwaway overlay on top of it, so nothing carries over from one night to the next.

`run-nightly.sh`:

1. Reads `version:` and `commit:` from the `nightly` release notes. It stops here if that version already has a result.
2. Boots both VMs from fresh overlays, in parallel.
3. Ubuntu (`guest/linux-run.sh`, over SSH):
   - `apt install`s the `.deb`, then runs the suites against `/opt/Freedom/freedom`.
   - Runs them again against the `.AppImage` itself.
   - Both legs run inside the auto-logged-in GNOME session.
4. Windows (`guest/windows-run.ps1`):
   - A scheduled task starts the script inside the auto-logged-in desktop session, with a non-elevated token. SSH sessions have no desktop.
   - The script runs the installer with `/S`, then runs the suites against the per-user `Freedom.exe`.
5. Each guest shallow-fetches the release's own commit for the specs, then runs `npm ci --ignore-scripts`.
6. Results are copied back to `/var/lib/freedom-nightly-e2e/runs/<version>/`. That covers `summary.md`, the run logs, the Playwright JSON and HTML reports, and traces.
7. Reporting:
   - On failure, it opens or comments on one `Nightly real-conditions E2E failed` issue (label `nightly`).
   - On a pass, it closes that issue.

No PR code runs on the host. Only published release assets and the commit they were built from are used, so this does not need a self-hosted Actions runner on a public repo.

## Setup (once per host)

You need a bare-metal Linux host with `/dev/kvm`. The user running this needs passwordless `sudo` and membership in the `libvirt` group. You also need `gh` authenticated with access to the repo.

```sh
sudo apt install qemu-system-x86 qemu-utils libvirt-daemon-system libvirt-clients \
  virtinst swtpm swtpm-tools ovmf cloud-image-utils genisoimage jq
sudo usermod -aG libvirt "$USER"   # then log in again
sudo install -d -o "$USER" -g "$USER" /var/lib/freedom-nightly-e2e

scripts/nightly-vm-e2e/provision-ubuntu.sh    # ~15 min
scripts/nightly-vm-e2e/provision-windows.sh   # ~30-45 min
scripts/nightly-vm-e2e/install-timer.sh       # hourly 00:20-11:20 UTC
```

Each guest needs about 8 GB RAM and 4 vCPUs while it runs. The disks take ~10 GB (Ubuntu) and ~25 GB (Windows), plus the per-run overlays.

## Running by hand

```sh
scripts/nightly-vm-e2e/run-nightly.sh --force --no-report        # both VMs
scripts/nightly-vm-e2e/run-nightly.sh --force --no-report --vm ubuntu
journalctl -u freedom-nightly-e2e.service                         # timer runs
```

To watch a guest, use `virsh vncdisplay freedom-e2e-win11`. VNC only listens on 127.0.0.1, so reach it through an SSH tunnel. `virsh screenshot <vm> out.png` also works.

## Maintenance

- **The Windows evaluation licence lasts 90 days from install.** After that, Windows shuts itself down every hour. Re-run `provision-windows.sh` about every 80 days. It rebuilds from scratch, and the newest evaluation ISO also picks up Windows updates.
- **Refresh the Ubuntu golden image** (`provision-ubuntu.sh`) every month or two. Automatic updates are off inside the guests, so a run never fights apt or Windows Update for the machine.
- After changing anything in this directory, re-run `install-timer.sh`. The timer runs a copy in `/var/lib/freedom-nightly-e2e/bin`, not a working checkout.
