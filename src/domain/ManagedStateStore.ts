import type { LinkGenerator } from '../ports/LinkGenerator';
import { hashValue } from '../utils/hash';
import { renamedPath, sameLinkPresentation, undoLinkRename } from '../utils/noteLink';
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
	private renames: { oldPath: string; newPath: string }[] = [];

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

	matchesValue(filePath: string, property: string, value: unknown, links: LinkGenerator): boolean {
		const entry = this.getEntry(filePath, property);
		if (!entry) return false;
		if (hashValue(value) === entry.valueHash) return true;
		if (typeof value !== 'string') return false;
		const target = links.resolveLink(value, filePath);
		if (!target) return false;
		if (entry.link) return entry.link.rewriteExpected === true &&
			target === entry.link.targetPath && sameLinkPresentation(entry.link.value, value);
		let candidate = value;
		let candidateTarget = target;
		for (const rename of [...this.renames].reverse()) {
			const previousTarget = renamedPath(candidateTarget, rename.newPath, rename.oldPath);
			if (previousTarget === candidateTarget) continue;
			candidate = undoLinkRename(candidate, rename.oldPath, rename.newPath);
			candidateTarget = previousTarget;
			if (hashValue(candidate) === entry.valueHash) return true;
		}
		return false;
	}

	/** Move known targets as well as sources; return sources needing re-evaluation. */
	migrateLinkTargets(oldPath: string, newPath: string, linkProperties: string[] = []): string[] {
		if (oldPath === newPath) return [];
		this.renames.push({ oldPath, newPath });
		const affected = new Set<string>();
		for (const [path, properties] of Object.entries(this.entries)) {
			for (const entry of Object.values(properties)) {
				if (!entry.link) {
					if (linkProperties.includes(entry.property)) affected.add(path);
					continue;
				}
				const target = renamedPath(entry.link.targetPath, oldPath, newPath);
				if (target !== entry.link.targetPath) {
					entry.link = { ...entry.link, targetPath: target, rewriteExpected: true };
					affected.add(path);
				}
			}
		}
		return [...affected];
	}

	forgetPath(path: string, folder = false): boolean {
		let removed = false;
		for (const key of Object.keys(this.entries)) {
			if (key === path || (folder && key.startsWith(`${path}/`))) {
				delete this.entries[key];
				removed = true;
			}
		}
		return removed;
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
		link?: ManagedEntry['link'],
	): void {
		if (!this.entries[filePath]) this.entries[filePath] = {};
		this.entries[filePath][property] = { ruleId, property, valueHash, ...(link ? { link: { ...link } } : {}) };
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
			for (const entry of Object.values(fileEntry)) {
				if (entry.link) entry.link = { ...entry.link, rewriteExpected: true };
			}
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
		for (const [path, properties] of Object.entries(this.entries)) {
			if (path === oldPrefix || path.startsWith(`${oldPrefix}/`)) {
				for (const entry of Object.values(properties)) {
					if (entry.link) entry.link = { ...entry.link, rewriteExpected: true };
				}
			}
		}
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
		out[filePath] = Object.fromEntries(Object.entries(fileEntry).map(([property, entry]) =>
			[property, { ...entry, ...(entry.link ? { link: { ...entry.link } } : {}) }],
		));
	}
	return out;
}
