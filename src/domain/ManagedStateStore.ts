import type { ManagedEntry, ManagedFileEntry, ManagedState } from './managed-state';

/**
 * In-memory store of which property values the plugin last wrote, keyed by
 * file path and property. Used by the DiffEngine to detect user overrides and
 * to decide whether a no-match should clear a value.
 *
 * The store is serializable via {@link ManagedStateStore.state} so it can be
 * persisted alongside the plugin settings in data.json.
 */
export class ManagedStateStore {
	private entries: Record<string, ManagedFileEntry>;

	constructor(state?: ManagedState) {
		this.entries = state ? cloneEntries(state.entries) : {};
	}

	get state(): ManagedState {
		return { entries: cloneEntries(this.entries) };
	}

	getEntry(filePath: string, property: string): ManagedEntry | null {
		const fileEntry = this.entries[filePath];
		if (!fileEntry) return null;
		return fileEntry[property] ?? null;
	}

	/** All properties currently managed for a given file. */
	getPropertiesForFile(filePath: string): string[] {
		const fileEntry = this.entries[filePath];
		if (!fileEntry) return [];
		return Object.keys(fileEntry);
	}

	recordWrite(
		filePath: string,
		property: string,
		ruleId: string,
		valueHash: string,
	): void {
		if (!this.entries[filePath]) this.entries[filePath] = {};
		this.entries[filePath][property] = { ruleId, property, valueHash };
	}

	recordClear(filePath: string, property: string): void {
		const fileEntry = this.entries[filePath];
		if (!fileEntry) return;
		delete fileEntry[property];
		if (Object.keys(fileEntry).length === 0) delete this.entries[filePath];
	}

	/** Move all managed entries from `oldPath` to `newPath` (file rename). */
	migratePath(oldPath: string, newPath: string): boolean {
		if (oldPath === newPath) return false;
		const fileEntry = this.entries[oldPath];
		if (fileEntry) {
			this.entries[newPath] = fileEntry;
			delete this.entries[oldPath];
			return true;
		}
		return false;
	}

	/**
	 * Move all managed entries whose path starts with `oldPrefix` to
	 * `newPrefix` (folder rename). Returns the number of migrated entries.
	 */
	migratePrefix(oldPrefix: string, newPrefix: string): number {
		if (oldPrefix === newPrefix) return 0;
		let migrated = 0;
		const oldDir = oldPrefix + '/';
		const newDir = newPrefix + '/';
		for (const filePath of Object.keys(this.entries)) {
			if (filePath === oldPrefix) {
				this.entries[newPrefix] = this.entries[oldPrefix]!;
				delete this.entries[oldPrefix];
				migrated++;
			} else if (filePath.startsWith(oldDir)) {
				const rest = filePath.slice(oldDir.length);
				const newPath = newDir + rest;
				this.entries[newPath] = this.entries[filePath]!;
				delete this.entries[filePath];
				migrated++;
			}
		}
		return migrated;
	}

	/** Remove entries for paths no longer present in the vault. */
	prune(existingPaths: Set<string>): number {
		let removed = 0;
		for (const p of Object.keys(this.entries)) {
			if (!existingPaths.has(p)) {
				delete this.entries[p];
				removed++;
			}
		}
		return removed;
	}

	/** Remove all entries owned by a deleted rule. */
	removeRule(ruleId: string): number {
		let removed = 0;
		for (const filePath of Object.keys(this.entries)) {
			const fileEntry = this.entries[filePath];
			if (!fileEntry) continue;
			for (const property of Object.keys(fileEntry)) {
				const entry = fileEntry[property];
				if (entry && entry.ruleId === ruleId) {
					delete fileEntry[property];
					removed++;
				}
			}
			if (Object.keys(fileEntry).length === 0) delete this.entries[filePath];
		}
		return removed;
	}

	clear(): void {
		this.entries = {};
	}

	/** Number of tracked file entries (for display/reporting). */
	get size(): number {
		return Object.keys(this.entries).length;
	}
}

function cloneEntries(
	entries: Record<string, ManagedFileEntry>,
): Record<string, ManagedFileEntry> {
	const out: Record<string, ManagedFileEntry> = {};
	for (const filePath of Object.keys(entries)) {
		const fileEntry = entries[filePath];
		if (!fileEntry) continue;
		out[filePath] = { ...fileEntry };
	}
	return out;
}
