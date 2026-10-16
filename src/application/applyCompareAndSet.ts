import type { PlannedChange } from '../domain/changes';
import { valuesEqual } from '../utils/hash';

/** Mutate only properties that still equal the value observed during planning. */
export function applyCompareAndSet(
	frontmatter: Record<string, unknown>,
	changes: PlannedChange[],
): PlannedChange[] {
	const applied: PlannedChange[] = [];
	for (const change of changes) {
		if (!valuesEqual(frontmatter[change.property], change.oldValue)) continue;
		if (change.action === 'set') {
			frontmatter[change.property] = change.newValue;
			applied.push(change);
		} else if (change.action === 'clear') {
			delete frontmatter[change.property];
			applied.push(change);
		}
	}
	return applied;
}
