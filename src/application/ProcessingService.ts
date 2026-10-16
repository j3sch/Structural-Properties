import type {
	ChangePreview,
	FrontmatterSnapshot,
	PlannedChange,
	ProcessorResult,
} from '../domain/changes';
import type { PluginSettings } from '../domain/plugin-data';
import type { RuleEngine } from '../domain/core/RuleEngine';
import type { FrontmatterRepository } from '../ports/FrontmatterRepository';
import type { LinkGenerator } from '../ports/LinkGenerator';
import type { VaultAccess } from '../ports/VaultAccess';
import type { ManagedStateStore } from '../domain/ManagedStateStore';
import { stableStringify, valuesEqual } from '../utils/hash';
import { expandFolderNotePattern } from '../domain/core/FolderNoteFinder';
import { getParentFolderPath } from '../utils/path';
import { matchGlob } from '../utils/glob';

export class ProcessingService {
	private revision = 0;
	constructor(
		private engine: RuleEngine,
		private frontmatter: FrontmatterRepository,
		private vault: VaultAccess,
		private linkGenerator: LinkGenerator,
		private getSettings: () => PluginSettings,
		private managedState: ManagedStateStore,
		private persist: () => Promise<void>,
		private reportError: (path: string, error: unknown) => void = (path, error) =>
			console.error(`[Structural Properties] Failed to plan "${path}":`, error),
	) {}

	invalidateStructure(): void {
		this.revision++;
	}

	async processPaths(paths: string[]): Promise<ProcessorResult> {
		const revision = this.revision;
		const settings = stableStringify(this.getSettings());
		const planned = await this.planWithErrors(paths);
		return this.applyChanges(planned.changes, planned.errors,
			() => revision === this.revision && settings === stableStringify(this.getSettings()));
	}

	async createPreview(paths: string[]): Promise<ChangePreview> {
		const revision = this.revision;
		const settingsFingerprint = stableStringify(this.getSettings());
		const planned = await this.planWithErrors(paths);
		return { ...planned, revision, settingsFingerprint };
	}

	async applyPreview(preview: ChangePreview): Promise<ProcessorResult> {
		const valid = (): boolean => preview.revision === this.revision &&
			preview.settingsFingerprint === stableStringify(this.getSettings());
		const approved = preview.changes.filter((change) => change.action !== 'skip');
		if (!valid()) return { applied: 0, skipped: approved.length, errors: 0, stale: true };
		// Replanning is validation only. Never apply newly discovered changes.
		const current = await this.planWithErrors([...new Set(approved.map((change) => change.filePath))]);
		const unchanged = approved.filter((change) => current.changes.some((candidate) =>
			candidate.filePath === change.filePath && candidate.property === change.property &&
			candidate.action === change.action && candidate.ruleId === change.ruleId &&
			candidate.writePolicy === change.writePolicy && candidate.onNoMatch === change.onNoMatch &&
			candidate.linkTargetPath === change.linkTargetPath &&
			valuesEqual(candidate.oldValue, change.oldValue) && valuesEqual(candidate.newValue, change.newValue)));
		const result = await this.applyChanges(unchanged, current.errors, valid);
		return { ...result, skipped: result.skipped + approved.length - unchanged.length,
			...(!valid() || unchanged.length !== approved.length ? { stale: true } : {}) };
	}

	private async applyChanges(changes: PlannedChange[], errors: number, valid: () => boolean): Promise<ProcessorResult> {
		const actionable = changes.filter((change) => change.action !== 'skip');
		const skipped = changes.length - actionable.length;
		if (!valid()) return { applied: 0, skipped: changes.length, errors, stale: true };
		if (actionable.length === 0) return { applied: 0, skipped, errors };
		const result = await this.frontmatter.applyPlannedChanges(actionable, this.managedState, valid);
		if (result.applied > 0 || (result.tracked ?? 0) > 0) await this.persist();
		return { ...result, skipped: result.skipped + skipped, errors: result.errors + errors,
			...(!valid() ? { stale: true } : {}) };
	}

	async planPaths(paths: string[]): Promise<PlannedChange[]> {
		return (await this.planWithErrors(paths)).changes;
	}

	private async planWithErrors(
		paths: string[],
	): Promise<{ changes: PlannedChange[]; errors: number }> {
		const settings = this.getSettings();
		const all: PlannedChange[] = [];
		let errors = 0;
		for (const path of paths) {
			if (!this.isProcessable(path, settings)) continue;
			try {
				const current: FrontmatterSnapshot = await this.frontmatter.readFrontmatter(path);
				all.push(
					...(await this.engine.planForFile(
						path,
						current,
						settings,
						this.managedState,
						this.vault,
						this.linkGenerator,
					)),
				);
			} catch (error) {
				errors++;
				this.reportError(path, error);
			}
		}
		return { changes: all, errors };
	}

	getProcessableFilePaths(): string[] {
		const settings = this.getSettings();
		return this.vault
			.getAllMarkdownFilePaths()
			.filter((path) => this.isProcessable(path, settings));
	}

	getProcessableFilePathsInFolder(folderPath: string): string[] {
		const settings = this.getSettings();
		const prefix = folderPath === '' ? '' : `${folderPath}/`;
		return this.vault
			.getAllMarkdownFilePaths()
			.filter(
				(path) =>
					(folderPath === '' || path.startsWith(prefix)) &&
					this.isProcessable(path, settings),
			);
	}

	/** Match configured patterns even after the folder note has disappeared. */
	getFolderNoteAffectedPaths(changedPaths: string[]): string[] {
		const settings = this.getSettings();
		const files = this.vault.getAllMarkdownFilePaths();
		const folders = new Set<string>();
		for (const file of files) {
			let folder = getParentFolderPath(file);
			while (folder) { folders.add(folder); folder = getParentFolderPath(folder); }
		}
		const affectedFolders = [...folders].filter((folder) => settings.folderNotePatterns.some((pattern) =>
			changedPaths.includes(expandFolderNotePattern(pattern, folder))));
		return files.filter((file) => this.isProcessable(file, settings) &&
			affectedFolders.some((folder) => file.startsWith(`${folder}/`)));
	}

	private isProcessable(
		path: string,
		settings: PluginSettings,
	): boolean {
		if (!path.toLowerCase().endsWith('.md') || !this.vault.getFileByPath(path)) return false;
		return !settings.excludePatterns.some((pattern) => matchGlob(path, pattern));
	}
}
