import { App, Notice, TFile } from 'obsidian';
import type {
	FrontmatterSnapshot,
	PlannedChange,
	ProcessorResult,
} from '../../domain/changes';
import type { FrontmatterRepository } from '../../ports/FrontmatterRepository';
import type { ManagedStateWriter } from '../../domain/managed-state';
import { hashValue } from '../../utils/hash';
import { applyCompareAndSet } from '../../application/applyCompareAndSet';
import { readFrontmatterFromFile } from './readFrontmatter';

class SkipFrontmatterWrite extends Error {}

export class ObsidianFrontmatterRepository implements FrontmatterRepository {
	constructor(private app: App) {}

	async applyPlannedChanges(
		changes: PlannedChange[],
		managedState: ManagedStateWriter,
		isStillValid: () => boolean = () => true,
	): Promise<ProcessorResult> {
		let applied = 0;
		let tracked = 0;
		let skipped = 0;
		let errors = 0;
		for (const [filePath, fileChanges] of groupByFile(changes)) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) { skipped += fileChanges.length; continue; }
			const valid = (): boolean => isStillValid() && file.path === filePath &&
				this.app.vault.getAbstractFileByPath(filePath) === file;
			try {
				let accepted: PlannedChange[] = [];
				if (fileChanges.every((change) => change.action === 'track')) {
					// Ownership-only updates must not rewrite YAML or change the note's mtime.
					const current = await readFrontmatterFromFile(this.app, file);
					if (valid()) accepted = applyCompareAndSet(current, fileChanges);
				} else if (valid()) {
					try {
						await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
							if (!valid()) throw new SkipFrontmatterWrite();
							accepted = applyCompareAndSet(frontmatter, fileChanges);
							if (accepted.every((change) => change.action === 'track')) throw new SkipFrontmatterWrite();
						});
					} catch (error) {
						if (!(error instanceof SkipFrontmatterWrite)) throw error;
					}
				}
				if (file.path !== filePath || this.app.vault.getAbstractFileByPath(filePath) !== file) accepted = [];
				for (const change of accepted) {
					if (change.action === 'clear') {
						managedState.recordClear(filePath, change.property);
						applied++;
					} else {
						managedState.recordWrite(filePath, change.property, change.ruleId, hashValue(change.newValue),
							change.linkTargetPath && typeof change.newValue === 'string'
								? { value: change.newValue, targetPath: change.linkTargetPath } : undefined);
						if (change.action === 'track') tracked++;
						else applied++;
					}
				}
				skipped += fileChanges.length - accepted.length;
			} catch (error) {
				errors += fileChanges.length;
				console.error(`[Structural Properties] Failed to update "${filePath}":`, error);
				new Notice(`Structural properties: could not update "${filePath}" (see console)`, 5000);
			}
		}
		return { applied, skipped, errors, ...(tracked > 0 ? { tracked } : {}) };
	}

	async readFrontmatter(filePath: string): Promise<FrontmatterSnapshot> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return {};
		return readFrontmatterFromFile(this.app, file);
	}
}

function groupByFile(changes: PlannedChange[]): Map<string, PlannedChange[]> {
	const grouped = new Map<string, PlannedChange[]>();
	for (const change of changes) {
		const current = grouped.get(change.filePath) ?? [];
		current.push(change);
		grouped.set(change.filePath, current);
	}
	return grouped;
}
