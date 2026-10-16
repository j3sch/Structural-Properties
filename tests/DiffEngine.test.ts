import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DiffEngine } from '../src/domain/core/DiffEngine';
import { hashValue } from '../src/utils/hash';
import type { ResolverResult } from '../src/domain/resolvers';

const diff = new DiffEngine();

const matched = (value: unknown): ResolverResult => ({
	matched: true,
	rawValue: value,
	resultType: 'raw',
});
const noMatch = (): ResolverResult => ({ matched: false, resultType: 'raw' });

describe('DiffEngine', () => {
	it('always: sets differences and registers already correct values', () => {
		const c1 = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: matched('new'), formatted: 'new', oldValue: 'old',
			writePolicy: 'always', onNoMatch: 'ignore', managed: null,
		});
		assert.equal(c1.action, 'set');

		const c2 = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: matched('same'), formatted: 'same', oldValue: 'same',
			writePolicy: 'always', onNoMatch: 'ignore', managed: null,
		});
		assert.equal(c2.action, 'track');
		const c3 = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: matched('same'), formatted: 'same', oldValue: 'same',
			writePolicy: 'always', onNoMatch: 'clear-managed',
			managed: { ruleId: 'r', property: 'p', valueHash: hashValue('same') },
		});
		assert.equal(c3.action, 'skip');
	});

	it('empty-only: sets when empty, skips when set', () => {
		const c1 = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: matched('new'), formatted: 'new', oldValue: undefined,
			writePolicy: 'empty-only', onNoMatch: 'ignore', managed: null,
		});
		assert.equal(c1.action, 'set');

		const c2 = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: matched('new'), formatted: 'new', oldValue: 'existing',
			writePolicy: 'empty-only', onNoMatch: 'ignore', managed: null,
		});
		assert.equal(c2.action, 'skip');
	});

	it('managed: sets when empty', () => {
		const c = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: matched('new'), formatted: 'new', oldValue: undefined,
			writePolicy: 'managed', onNoMatch: 'clear-managed', managed: null,
		});
		assert.equal(c.action, 'set');
	});

	it('managed: updates when value still matches managed hash', () => {
		const oldVal = 'old-managed';
		const c = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: matched('new'), formatted: 'new', oldValue: oldVal,
			writePolicy: 'managed', onNoMatch: 'clear-managed',
			managed: { ruleId: 'r', property: 'p', valueHash: hashValue(oldVal) },
		});
		assert.equal(c.action, 'set');
	});

	it('managed: detects user override', () => {
		const c = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: matched('new'), formatted: 'new', oldValue: 'user-changed',
			writePolicy: 'managed', onNoMatch: 'clear-managed',
			managed: { ruleId: 'r', property: 'p', valueHash: hashValue('original') },
		});
		assert.equal(c.action, 'skip');
		assert.equal(c.conflict, 'user-override');
	});

	it('no-match ignore: skips', () => {
		const c = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: noMatch(), formatted: undefined, oldValue: 'x',
			writePolicy: 'managed', onNoMatch: 'ignore', managed: null,
		});
		assert.equal(c.action, 'skip');
	});

	it('no-match clear-managed: clears when still managed', () => {
		const oldVal = 'managed-val';
		const c = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: noMatch(), formatted: undefined, oldValue: oldVal,
			writePolicy: 'managed', onNoMatch: 'clear-managed',
			managed: { ruleId: 'r', property: 'p', valueHash: hashValue(oldVal) },
		});
		assert.equal(c.action, 'clear');
	});

	it('no-match clear-managed: skips when not managed', () => {
		const c = diff.compute({
			filePath: 'a.md', property: 'p', ruleId: 'r', ruleName: 'R',
			result: noMatch(), formatted: undefined, oldValue: 'user-val',
			writePolicy: 'managed', onNoMatch: 'clear-managed', managed: null,
		});
		assert.equal(c.action, 'skip');
		assert.equal(c.conflict, 'no-match');
	});
});
