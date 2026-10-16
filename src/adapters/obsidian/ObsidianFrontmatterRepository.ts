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

export class ObsidianFrontmatterRepository implements FrontmatterRepository {
	constructor(private app: App) {}

	async applyPlannedChanges(
		changes: PlannedChange[],
		managedState: ManagedStateWriter,
	): Promise<ProcessorResult> {
		const byFile = groupByFile(changes);
		let applied = 0;
		let skipped = 0;
		let errors = 0;

		for (const [filePath, fileChanges] of byFile) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				errors += fileChanges.length;
				continue;
			}
			try {
				const appliedChanges: PlannedChange[] = [];
				await this.app.fileManager.processFrontMatter(
					file,
					(frontmatter: Record<string, unknown>) => {
						appliedChanges.push(...applyCompareAndSet(frontmatter, fileChanges));
					},
				);
				for (const change of appliedChanges) {
					if (change.action === 'set') {
						managedState.recordWrite(
							filePath,
							change.property,
							change.ruleId,
							hashValue(change.newValue),
						);
						applied++;
					} else if (change.action === 'clear') {
						managedState.recordClear(filePath, change.property);
						applied++;
					}
				}
				skipped += fileChanges.length - appliedChanges.length;
			} catch (error) {
				errors += fileChanges.length;
				console.error(`[Structural Properties] Failed to update "${filePath}":`, error);
				new Notice(`Structural properties: could not update "${filePath}" (see console)`, 5000);
			}
		}
		return { applied, skipped, errors };
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
