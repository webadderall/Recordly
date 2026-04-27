/**
 * Extension IPC Handlers — Main Process
 *
 * Registers IPC handlers for extension management (discover, install,
 * uninstall, enable/disable) and exposes them to the renderer via preload.
 */

import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { getErrorMessage } from "./errorUtils";
import {
	discoverExtensions,
	getExtension,
	getExtensionsDirectory,
	getRegisteredExtensions,
	installExtensionFromPath,
	setExtensionStatus,
	uninstallExtension,
} from "./extensionLoader";
import {
	downloadAndInstallExtension,
	fetchPendingReviews,
	getMarketplaceExtension,
	searchMarketplace,
	submitExtensionForReview,
	updateReviewStatus,
} from "./extensionMarketplace";
import type { ExtensionInfo, MarketplaceReviewStatus } from "./extensionTypes";

/**
 * Serialize extension info for IPC transfer (strip non-serializable fields).
 */
function serializeExtensionInfo(info: ExtensionInfo) {
	return {
		manifest: info.manifest,
		status: info.status,
		path: info.path,
		error: info.error,
		builtin: info.builtin ?? false,
	};
}

/**
 * Register all extension-related IPC handlers.
 * Call this once during app initialization (in main.ts).
 */
export function registerExtensionIpcHandlers(): void {
	// Discover all extensions (builtin + user-installed)
	ipcMain.handle("extensions:discover", async () => {
		const extensions = await discoverExtensions();
		return extensions.map(serializeExtensionInfo);
	});

	// List currently registered extensions
	ipcMain.handle("extensions:list", () => {
		return getRegisteredExtensions().map(serializeExtensionInfo);
	});

	// Get a specific extension by ID
	ipcMain.handle("extensions:get", (_event, id: string) => {
		const ext = getExtension(id);
		return ext ? serializeExtensionInfo(ext) : null;
	});

	// Enable an extension
	ipcMain.handle("extensions:enable", async (_event, id: string) => {
		return setExtensionStatus(id, "active");
	});

	// Disable an extension
	ipcMain.handle("extensions:disable", async (_event, id: string) => {
		return setExtensionStatus(id, "disabled");
	});

	// Install an extension from a folder picker
	ipcMain.handle("extensions:install-from-folder", async (event) => {
		const window = BrowserWindow.fromWebContents(event.sender);
		const result = await dialog.showOpenDialog(window!, {
			title: "Select Extension Folder",
			properties: ["openDirectory"],
			message: "Select a folder containing a recordly-extension.json manifest",
		});

		if (result.canceled || result.filePaths.length === 0) {
			return { success: false, reason: "cancelled" };
		}

		const info = await installExtensionFromPath(result.filePaths[0]);
		if (!info) {
			return {
				success: false,
				reason: "Invalid extension: missing or invalid recordly-extension.json",
			};
		}

		return { success: true, extension: serializeExtensionInfo(info) };
	});

	// Uninstall an extension
	ipcMain.handle("extensions:uninstall", async (_event, id: string) => {
		const success = await uninstallExtension(id);
		return { success };
	});

	// Get extensions directory path
	ipcMain.handle("extensions:get-directory", () => {
		return getExtensionsDirectory();
	});

	// Open extensions directory in file manager
	ipcMain.handle("extensions:open-directory", async () => {
		const dir = getExtensionsDirectory();
		await shell.openPath(dir);
		return { success: true };
	});

	// ── Marketplace ─────────────────────────────────────────────────────

	// Search/browse marketplace
	ipcMain.handle(
		"extensions:marketplace-search",
		async (
			_event,
			params: {
				query?: string;
				tags?: string[];
				sort?: "popular" | "recent" | "rating";
				page?: number;
				pageSize?: number;
			},
		) => {
			try {
				return await searchMarketplace(params);
			} catch (error: unknown) {
				return {
					extensions: [],
					total: 0,
					page: 1,
					pageSize: 20,
					error: getErrorMessage(error),
				};
			}
		},
	);

	// Get a specific marketplace extension
	ipcMain.handle("extensions:marketplace-get", async (_event, id: string) => {
		return getMarketplaceExtension(id);
	});

	// Download and install a marketplace extension
	ipcMain.handle(
		"extensions:marketplace-install",
		async (_event, extensionId: string, downloadUrl: string) => {
			return downloadAndInstallExtension(extensionId, downloadUrl);
		},
	);

	// Submit an extension for marketplace review
	ipcMain.handle("extensions:marketplace-submit", async (_event, extensionId: string) => {
		return submitExtensionForReview(extensionId);
	});

	// ── Admin Review System ─────────────────────────────────────────────

	// Fetch pending reviews (admin only)
	ipcMain.handle(
		"extensions:reviews-list",
		async (
			_event,
			params: {
				status?: MarketplaceReviewStatus;
				page?: number;
				pageSize?: number;
			},
		) => {
			try {
				return await fetchPendingReviews(params);
			} catch (error: unknown) {
				return { reviews: [], total: 0, error: getErrorMessage(error) };
			}
		},
	);

	// Update review status (admin only)
	ipcMain.handle(
		"extensions:review-update",
		async (_event, reviewId: string, status: MarketplaceReviewStatus, notes?: string) => {
			return updateReviewStatus(reviewId, status, notes);
		},
	);
}
