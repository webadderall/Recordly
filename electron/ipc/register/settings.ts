import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app, ipcMain } from "electron";
import { hideCursor } from "../../cursorHider";
import { closeCountdownWindow, createCountdownWindow, getCountdownWindow } from "../../windows";
import {
	SHORTCUTS_FILE,
	RECORDINGS_SETTINGS_FILE,
	COUNTDOWN_SETTINGS_FILE,
} from "../constants";
import { LINUX_PORTAL_SOURCE_ID } from "../../../src/lib/constants";
import {
	countdownTimer,
	setCountdownTimer,
	countdownCancelled,
	setCountdownCancelled,
	countdownInProgress,
	setCountdownInProgress,
	countdownRemaining,
	setCountdownRemaining,
} from "../state";

const execFileAsync = promisify(execFile);
// Cache the portal probe so repeated renderer requests do not keep spawning D-Bus tools.
let linuxScreenCastPortalAvailablePromise: Promise<boolean> | null = null;
let linuxScreenCastPortalProbeTimestamp: number | null = null;
const LINUX_PORTAL_PROBE_CACHE_TTL_MS = 60000; // 1 minute

/**
 * Normalizes a given window system environment variable into "wayland" or "x11".
 * @param value The raw environment variable value to parse.
 * @returns "wayland" or "x11" if matched, otherwise null.
 */
function normalizeLinuxWindowSystem(value: string | undefined): "wayland" | "x11" | null {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "wayland" || normalized === "x11") {
		return normalized;
	}

	return null;
}

/**
 * Normalizes the different Linux session hints down to the two capture modes we care about.
 * It checks multiple environment variables to determine if the session is Wayland or X11.
 * @returns "wayland" or "x11" if a window system can be determined, otherwise null.
 */
function getLinuxWindowSystem(): "wayland" | "x11" | null {
	return (
		normalizeLinuxWindowSystem(process.env.OZONE_PLATFORM) ??
		normalizeLinuxWindowSystem(process.env.ELECTRON_OZONE_PLATFORM_HINT) ??
		normalizeLinuxWindowSystem(process.env.XDG_SESSION_TYPE) ??
		(process.env.WAYLAND_DISPLAY ? "wayland" : null)
	);
}

/**
 * Return command output when a probe tool is available; otherwise fail quietly and try the next one.
 * @param command The binary command to execute.
 * @param args The arguments to pass to the command.
 * @returns The stdout and stderr concatenated, or null if the command failed or timed out.
 */
async function getOptionalCommandOutput(command: string, args: string[]) {
	try {
		const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
			timeout: 2500,
		});
		return `${stdout}${stderr}`;
	} catch {
		return null;
	}
}

/**
 * A helper that resolves as soon as the first promise in the array succeeds,
 * mimicking Promise.any for environments targeting older ES versions.
 */
function firstSuccess<T>(promises: Promise<T>[]): Promise<T> {
	return new Promise((resolve, reject) => {
		let rejectedCount = 0;
		for (const p of promises) {
			p.then(resolve).catch(() => {
				rejectedCount++;
				if (rejectedCount === promises.length) {
					reject(new Error("All probes failed"));
				}
			});
		}
	});
}

/**
 * Probes the Linux system to determine if the ScreenCast portal is available.
 * On Wayland, we only prefer the portal capture flow if the ScreenCast portal is actually present.
 * Uses `gdbus`, `busctl`, and `dbus-send` in order to introspect the D-Bus interfaces.
 * @returns A promise resolving to true if the portal is available, false otherwise.
 */
async function probeLinuxScreenCastPortal() {
	if (process.platform !== "linux") {
		return false;
	}

	const now = Date.now();
	if (
		linuxScreenCastPortalAvailablePromise &&
		linuxScreenCastPortalProbeTimestamp &&
		now - linuxScreenCastPortalProbeTimestamp < LINUX_PORTAL_PROBE_CACHE_TTL_MS
	) {
		return linuxScreenCastPortalAvailablePromise;
	}

	linuxScreenCastPortalAvailablePromise = (async () => {
		try {
			// Probing multiple introspection tools in parallel to reduce worst-case blocking time.
			// Each probe is capped at 2.5s; the fastest success wins.
			const probeGdbus = async () => {
				const output = await getOptionalCommandOutput("gdbus", [
					"introspect",
					"--session",
					"--dest",
					"org.freedesktop.portal.Desktop",
					"--object-path",
					"/org/freedesktop/portal/desktop",
				]);
				if (output?.includes("org.freedesktop.portal.ScreenCast")) return true;
				throw new Error("portal missing");
			};

			const probeBusctl = async () => {
				const output = await getOptionalCommandOutput("busctl", [
					"--user",
					"introspect",
					"org.freedesktop.portal.Desktop",
					"/org/freedesktop/portal/desktop",
				]);
				if (output?.includes("org.freedesktop.portal.ScreenCast")) return true;
				throw new Error("portal missing");
			};

			const probeDbusSend = async () => {
				const output = await getOptionalCommandOutput("dbus-send", [
					"--session",
					"--dest=org.freedesktop.portal.Desktop",
					"--type=method_call",
					"--print-reply",
					"/org/freedesktop/portal/desktop",
					"org.freedesktop.DBus.Introspectable.Introspect",
				]);
				if (output?.includes("org.freedesktop.portal.ScreenCast")) return true;
				throw new Error("portal missing");
			};

			const result = await firstSuccess([probeGdbus(), probeBusctl(), probeDbusSend()]);
			linuxScreenCastPortalProbeTimestamp = Date.now();
			return result;
		} catch {
			// If all probes fail, we don't cache the result permanently so we can try again later.
			linuxScreenCastPortalAvailablePromise = null;
			linuxScreenCastPortalProbeTimestamp = null;
			return false;
		}
	})();

	return linuxScreenCastPortalAvailablePromise;
}

export function registerSettingsHandlers() {
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('get-platform', () => {
    return process.platform;
  });

	/**
	 * Retrieves the capture capabilities of the current system.
	 * Used primarily to determine whether Linux users can use manual source enumeration
	 * or if they are required to use the system ScreenCast portal (e.g. on Wayland).
	 */
	ipcMain.handle("get-capture-capabilities", async () => {
		if (process.platform !== "linux") {
			return {
				supportsManualSourceSelection: true,
				supportsPortalSourceSelection: false,
				preferredSourceSelectionMode: "manual" as const,
				portalSource: null,
			};
		}

		// Linux sessions can support different capture paths; prefer portal mode only
		// for Wayland sessions where the ScreenCast portal is confirmed available.
		const linuxWindowSystem = getLinuxWindowSystem();
		const screenCastPortalAvailable =
			linuxWindowSystem === "wayland" ? await probeLinuxScreenCastPortal() : false;
		const prefersPortalSelection = linuxWindowSystem === "wayland" && screenCastPortalAvailable;

		return {
			supportsManualSourceSelection: !prefersPortalSelection,
			supportsPortalSourceSelection: prefersPortalSelection,
			preferredSourceSelectionMode: prefersPortalSelection
				? ("portal" as const)
				: ("manual" as const),
			portalSource: prefersPortalSelection
				? {
						id: LINUX_PORTAL_SOURCE_ID,
						name: "Entire screen",
						display_id: "linux-portal",
						thumbnail: null,
						appIcon: null,
						sourceType: "screen" as const,
						appName: null,
						windowTitle: null,
					}
				: null,
		};
	});

  // ---------------------------------------------------------------------------
  // Cursor hiding for the browser-capture fallback.
  // The IPC promise resolves only after the cursor hide attempt completes.
  // ---------------------------------------------------------------------------
  ipcMain.handle('hide-cursor', () => {
    if (process.platform !== 'win32') {
      return { success: true }
    }

    return { success: hideCursor() }
  })

  ipcMain.handle('get-shortcuts', async () => {
    try {
      const data = await fs.readFile(SHORTCUTS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  });

  ipcMain.handle('save-shortcuts', async (_, shortcuts: unknown) => {
    try {
      await fs.writeFile(SHORTCUTS_FILE, JSON.stringify(shortcuts, null, 2), 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('Failed to save shortcuts:', error);
      return { success: false, error: String(error) };
    }
  });

  // ---------------------------------------------------------------------------
  // Countdown timer before recording
  // ---------------------------------------------------------------------------
    ipcMain.handle('get-recording-preferences', async () => {
      try {
        const content = await fs.readFile(RECORDINGS_SETTINGS_FILE, 'utf-8')
        const parsed = JSON.parse(content) as Record<string, unknown>
        return {
          success: true,
          microphoneEnabled: parsed.microphoneEnabled === true,
          microphoneDeviceId: typeof parsed.microphoneDeviceId === 'string' ? parsed.microphoneDeviceId : undefined,
          systemAudioEnabled: parsed.systemAudioEnabled !== false,
        }
      } catch {
        return { success: true, microphoneEnabled: false, microphoneDeviceId: undefined, systemAudioEnabled: true }
      }
    })

    ipcMain.handle('set-recording-preferences', async (_, prefs: { microphoneEnabled?: boolean; microphoneDeviceId?: string; systemAudioEnabled?: boolean }) => {
      try {
        let existing: Record<string, unknown> = {}
        try {
          const content = await fs.readFile(RECORDINGS_SETTINGS_FILE, 'utf-8')
          existing = JSON.parse(content) as Record<string, unknown>
        } catch {
          // file doesn't exist yet
        }
        const merged = { ...existing, ...prefs }
        await fs.writeFile(RECORDINGS_SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8')
        return { success: true }
      } catch (error) {
        console.error('Failed to save recording preferences:', error)
        return { success: false, error: String(error) }
      }
    })

  ipcMain.handle('get-countdown-delay', async () => {
    try {
      const content = await fs.readFile(COUNTDOWN_SETTINGS_FILE, 'utf-8')
      const parsed = JSON.parse(content) as { delay?: number }
      return { success: true, delay: parsed.delay ?? 3 }
    } catch {
      return { success: true, delay: 3 }
    }
  })

  ipcMain.handle('set-countdown-delay', async (_, delay: number) => {
    try {
      await fs.writeFile(COUNTDOWN_SETTINGS_FILE, JSON.stringify({ delay }, null, 2), 'utf-8')
      return { success: true }
    } catch (error) {
      console.error('Failed to save countdown delay:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('start-countdown', async (_, seconds: number) => {
    if (countdownInProgress) {
      return { success: false, error: 'Countdown already in progress' }
    }

    setCountdownInProgress(true)
    setCountdownCancelled(false)
    setCountdownRemaining(seconds)

    const countdownWin = createCountdownWindow()

    if (countdownWin.webContents.isLoadingMainFrame()) {
      await new Promise<void>((resolve) => {
        countdownWin.webContents.once('did-finish-load', () => {
          resolve()
        })
      })
    }

    return new Promise<{ success: boolean; cancelled?: boolean }>((resolve) => {
      let remaining = seconds
      setCountdownRemaining(remaining)

      countdownWin.webContents.send('countdown-tick', remaining)

      setCountdownTimer(setInterval(() => {
        if (countdownCancelled) {
          if (countdownTimer) {
            clearInterval(countdownTimer)
            setCountdownTimer(null)
          }
          closeCountdownWindow()
          setCountdownInProgress(false)
          setCountdownRemaining(null)
          resolve({ success: false, cancelled: true })
          return
        }

        remaining--
        setCountdownRemaining(remaining)

        if (remaining <= 0) {
          if (countdownTimer) {
            clearInterval(countdownTimer)
            setCountdownTimer(null)
          }
          closeCountdownWindow()
          setCountdownInProgress(false)
          setCountdownRemaining(null)
          resolve({ success: true })
        } else {
          const win = getCountdownWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('countdown-tick', remaining)
          }
        }
      }, 1000))
    })
  })

  ipcMain.handle('cancel-countdown', () => {
    setCountdownCancelled(true)
    setCountdownInProgress(false)
    setCountdownRemaining(null)
    if (countdownTimer) {
      clearInterval(countdownTimer)
      setCountdownTimer(null)
    }
    closeCountdownWindow()
    return { success: true }
  })

  ipcMain.handle('get-active-countdown', () => {
    return {
      success: true,
      seconds: countdownInProgress ? countdownRemaining : null,
    }
  })
}
