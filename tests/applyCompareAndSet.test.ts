import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyCompareAndSet } from '../src/application/applyCompareAndSet';
import type { PlannedChange } from '../src/domain/changes';

function change(property: string, oldValue: unknown, newValue: unknown): PlannedChange {
	return {
		filePath: 'note.md',
		property,
		ruleId: 'r1',
		ruleName: 'Rule',
		action: 'set',
		oldValue,
		newValue,
		writePolicy: 'managed',
		onNoMatch: 'clear-managed',
		conflict: 'none',
		reason: 'test',
	};
}

describe('applyCompareAndSet', () => {
	it('skips values changed after planning and returns only applied changes', () => {
		const frontmatter: Record<string, unknown> = { changed: 'by-user', stable: 'old' };
		const changed = change('changed', 'planned-old', 'generated');
		const stable = change('stable', 'old', 'generated');
		const applied = applyCompareAndSet(frontmatter, [changed, stable]);

		assert.equal(frontmatter.changed, 'by-user');
		assert.equal(frontmatter.stable, 'generated');
		assert.deepEqual(applied, [stable]);
	});
});
