import type { PluginSettings } from '../domain/plugin-data';
import type { ManagedStateStore } from '../domain/ManagedStateStore';
import { DebouncedPathQueue, type TimeoutScheduler } from './DebouncedPathQueue';
import type { ProcessingService } from './ProcessingService';

export class AutomaticUpdateService {
	private queue: DebouncedPathQueue;

	constructor(
		private processing: ProcessingService,
		private managedState: ManagedStateStore,
		private getSettings: () => PluginSettings,
		private persist: () => Promise<void>,
		scheduler: TimeoutScheduler,
		private reportError: (context: string, error: unknown) => void = (context, error) =>
			console.error(`[Structural Properties] ${context}:`, error),
	) {
		this.queue = new DebouncedPathQueue(
			async (paths) => {
				try {
					const result = await this.processing.processPaths(paths);
					if (result.stale) for (const path of paths) this.queue.enqueue(path);
				} catch (error) {
					this.reportError('Automatic processing failed', error);
				}
			},
			() => this.getSettings().automation.debounceMs,
			scheduler,
		);
	}

	handleCreated(path: string): void {
		this.processing.invalidateStructure();
		if (this.getSettings().automation.updateOnStructuralChanges) {
			this.queue.enqueue(path);
			this.enqueueFolderDependents([path]);
		}
	}

	handleOpened(path: string): void {
		if (this.getSettings().automation.updateOnFileOpen) {
			this.queue.enqueue(path);
		}
	}

	handleFileRenamed(oldPath: string, newPath: string, isMarkdown: boolean): void {
		this.processing.invalidateStructure();
		const moved = this.managedState.migratePath(oldPath, newPath);
		const references = this.managedState.migrateLinkTargets(oldPath, newPath,
			this.getSettings().rules.filter((rule) => rule.format.type === 'wikilink').map((rule) => rule.property));
		if (moved || references.length > 0) this.saveMigration();
		if (!this.getSettings().automation.updateOnStructuralChanges) return;
		if (isMarkdown) this.queue.enqueue(newPath);
		for (const path of references) this.queue.enqueue(path);
		this.enqueueFolderDependents([oldPath, newPath]);
	}

	handleFolderRenamed(oldPath: string, newPath: string, markdownPaths: string[]): void {
		this.processing.invalidateStructure();
		const moved = this.managedState.migratePrefix(oldPath, newPath);
		const references = this.managedState.migrateLinkTargets(oldPath, newPath,
			this.getSettings().rules.filter((rule) => rule.format.type === 'wikilink').map((rule) => rule.property));
		if (moved > 0 || references.length > 0) this.saveMigration();
		if (!this.getSettings().automation.updateOnStructuralChanges) return;
		for (const path of [...markdownPaths, ...references]) this.queue.enqueue(path);
		// Sibling folder-note patterns may be affected by moving the folder itself.
		this.enqueueFolderDependents([`${oldPath}.md`, `${newPath}.md`]);
	}

	handleDeleted(path: string, folder = false): void {
		this.processing.invalidateStructure();
		if (this.managedState.forgetPath(path, folder)) this.saveMigration();
		if (this.getSettings().automation.updateOnStructuralChanges) {
			this.enqueueFolderDependents([path]);
		}
	}

	handleMetadataChanged(path: string): void {
		const hasInheritance = this.getSettings().rules.some((rule) =>
			rule.enabled && rule.resolver.type === 'inherit-property');
		const dependents = hasInheritance ? this.processing.getFolderNoteAffectedPaths([path]) : [];
		if (dependents.length > 0) this.processing.invalidateStructure();
		if (!this.getSettings().automation.updateOnStructuralChanges) return;
		// A delayed Obsidian link rewrite may arrive after the rename batch.
		if (this.managedState.getPropertiesForFile(path).length > 0) this.queue.enqueue(path);
		for (const dependent of dependents) this.queue.enqueue(dependent);
	}

	private enqueueFolderDependents(paths: string[]): void {
		for (const path of this.processing.getFolderNoteAffectedPaths(paths)) this.queue.enqueue(path);
	}

	stop(): void {
		this.processing.invalidateStructure();
		this.queue.stop();
	}

	private saveMigration(): void {
		void this.persist().catch((error) => {
			this.reportError('Could not persist a managed-state path migration', error);
		});
	}
}
