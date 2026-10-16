import type {
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
import { matchGlob } from '../utils/glob';

export class ProcessingService {
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

	async processPaths(paths: string[]): Promise<ProcessorResult> {
		const planned = await this.planWithErrors(paths);
		const actionable = planned.changes.filter(
			(change) => change.action === 'set' || change.action === 'clear',
		);
		const skipped = planned.changes.length - actionable.length;
		if (actionable.length === 0) {
			return { applied: 0, skipped, errors: planned.errors };
		}
		const result = await this.frontmatter.applyPlannedChanges(
			actionable,
			this.managedState,
		);
		if (result.applied > 0) await this.persist();
		return {
			...result,
			skipped: result.skipped + skipped,
			errors: result.errors + planned.errors,
		};
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

	private isProcessable(
		path: string,
		settings: PluginSettings,
	): boolean {
		if (!path.toLowerCase().endsWith('.md')) return false;
		return !settings.excludePatterns.some((pattern) => matchGlob(path, pattern));
	}
}
