import type {
	FrontmatterSnapshot,
	PlannedChange,
	ProcessorResult,
} from '../domain/changes';
import type { ManagedStateWriter } from '../domain/managed-state';

export interface FrontmatterRepository {
	readFrontmatter(filePath: string): Promise<FrontmatterSnapshot>;
	applyPlannedChanges(
		changes: PlannedChange[],
		managedState: ManagedStateWriter,
		isStillValid?: () => boolean,
	): Promise<ProcessorResult>;
}
