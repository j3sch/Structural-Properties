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
					await this.processing.processPaths(paths);
				} catch (error) {
					this.reportError('Automatic processing failed', error);
				}
			},
			() => this.getSettings().automation.debounceMs,
			scheduler,
		);
	}

	handleCreated(path: string): void {
		if (this.getSettings().automation.updateOnStructuralChanges) {
			this.queue.enqueue(path);
		}
	}

	handleOpened(path: string): void {
		if (this.getSettings().automation.updateOnFileOpen) {
			this.queue.enqueue(path);
		}
	}

	handleFileRenamed(oldPath: string, newPath: string, isMarkdown: boolean): void {
		if (this.managedState.migratePath(oldPath, newPath)) this.saveMigration();
		if (isMarkdown && this.getSettings().automation.updateOnStructuralChanges) {
			this.queue.enqueue(newPath);
		}
	}

	handleFolderRenamed(oldPath: string, newPath: string, markdownPaths: string[]): void {
		if (this.managedState.migratePrefix(oldPath, newPath) > 0) this.saveMigration();
		if (!this.getSettings().automation.updateOnStructuralChanges) return;
		for (const path of markdownPaths) this.queue.enqueue(path);
	}

	stop(): void {
		this.queue.stop();
	}

	private saveMigration(): void {
		void this.persist().catch((error) => {
			this.reportError('Could not persist a managed-state path migration', error);
		});
	}
}
