import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ManagedStateStore } from '../src/domain/ManagedStateStore';
import { mockLinkGenerator } from './mocks';
import { hashValue } from '../src/utils/hash';

describe('ManagedStateStore', () => {
	it('records and retrieves entries', () => {
		const store = new ManagedStateStore();
		store.recordWrite('a.md', 'project', 'r1', hashValue('Captzy'));
		const entry = store.getEntry('a.md', 'project');
		assert.ok(entry);
		assert.equal(entry?.ruleId, 'r1');
		assert.equal(entry?.valueHash, hashValue('Captzy'));
	});

	it('clears entries', () => {
		const store = new ManagedStateStore();
		store.recordWrite('a.md', 'project', 'r1', hashValue('x'));
		store.recordClear('a.md', 'project');
		assert.equal(store.getEntry('a.md', 'project'), null);
		assert.equal(store.size, 0);
	});

	it('migrates a single path on rename', () => {
		const store = new ManagedStateStore();
		store.recordWrite('old.md', 'project', 'r1', hashValue('x'));
		store.migratePath('old.md', 'new.md');
		assert.equal(store.getEntry('old.md', 'project'), null);
		assert.ok(store.getEntry('new.md', 'project'));
	});

	it('migrates a prefix on folder rename', () => {
		const store = new ManagedStateStore();
		store.recordWrite('old/sub/a.md', 'project', 'r1', hashValue('x'));
		store.recordWrite('old/sub/b.md', 'project', 'r1', hashValue('y'));
		const migrated = store.migratePrefix('old', 'new');
		assert.equal(migrated, 2);
		assert.ok(store.getEntry('new/sub/a.md', 'project'));
		assert.ok(store.getEntry('new/sub/b.md', 'project'));
		assert.equal(store.getEntry('old/sub/a.md', 'project'), null);
	});

	it('prunes non-existent paths', () => {
		const store = new ManagedStateStore();
		store.recordWrite('a.md', 'project', 'r1', hashValue('x'));
		store.recordWrite('b.md', 'project', 'r1', hashValue('y'));
		const removed = store.prune(new Set(['a.md']));
		assert.equal(removed, 1);
		assert.ok(store.getEntry('a.md', 'project'));
		assert.equal(store.getEntry('b.md', 'project'), null);
	});

	it('removes entries for a deleted rule', () => {
		const store = new ManagedStateStore();
		store.recordWrite('a.md', 'project', 'r1', hashValue('x'));
		store.recordWrite('a.md', 'link', 'r2', hashValue('y'));
		const removed = store.removeRule('r1');
		assert.equal(removed, 1);
		assert.equal(store.getEntry('a.md', 'project'), null);
		assert.ok(store.getEntry('a.md', 'link'));
	});

	it('serializes to a plain state object', () => {
		const store = new ManagedStateStore();
		store.recordWrite('a.md', 'project', 'r1', hashValue('x'));
		const state = store.state;
		assert.ok(state.entries['a.md']?.project);
		// Reconstructing yields the same entries.
		const store2 = new ManagedStateStore(state);
		assert.ok(store2.getEntry('a.md', 'project'));
	});
});


describe('managed link identity', () => {
	it('recognizes known automatic target renames but protects manual targets and aliases', () => {
		const store = new ManagedStateStore();
		const value = '[[Projects/Old/Old|My label]]';
		store.recordWrite('note.md', 'link', 'r', hashValue(value), { value, targetPath: 'Projects/Old/Old.md' });
		assert.equal(store.matchesValue('note.md', 'link', '[[Elsewhere]]', mockLinkGenerator), false);
		store.migrateLinkTargets('Projects/Old', 'Projects/New');
		store.migrateLinkTargets('Projects/New/Old.md', 'Projects/New/New.md');
		assert.equal(store.matchesValue('note.md', 'link', '[[Projects/New/New|My label]]', mockLinkGenerator), true);
		assert.equal(store.matchesValue('note.md', 'link', '[[Projects/New/New|Manual label]]', mockLinkGenerator), false);
		assert.equal(store.matchesValue('note.md', 'link', '[[Elsewhere|My label]]', mockLinkGenerator), false);
		const restored = new ManagedStateStore(store.state);
		assert.equal(restored.matchesValue('note.md', 'link', '[[Projects/New/New|My label]]', mockLinkGenerator), true);
	});

	it('recovers hash-only full-path links after chained renames without adopting unrelated values', () => {
		const store = new ManagedStateStore();
		store.recordWrite('source.md', 'link', 'r', hashValue('[[A/A]]'));
		store.migrateLinkTargets('A', 'B');
		store.migrateLinkTargets('B/A.md', 'B/B.md');
		assert.equal(store.matchesValue('source.md', 'link', '[[B/B]]', mockLinkGenerator), true);
		assert.equal(store.matchesValue('source.md', 'link', '[[B/Other]]', mockLinkGenerator), false);
	});

	it('handles Markdown encoding and protects manual presentation changes without a rename', () => {
		const store = new ManagedStateStore();
		const value = '[Label](A/Old%20Name.md)';
		store.recordWrite('note.md', 'link', 'r', hashValue(value), { value, targetPath: 'A/Old Name.md' });
		const alternate = { ...mockLinkGenerator, resolveLink: () => 'A/Old Name.md' };
		assert.equal(store.matchesValue('note.md', 'link', '[Label](./Old%20Name.md)', alternate), false);
		store.migrateLinkTargets('A/Old Name.md', 'A/New Name.md');
		assert.equal(store.matchesValue('note.md', 'link', '[Label](A/New%20Name.md)', mockLinkGenerator), true);
	});
});

it('preserves managed relative links through source moves and protects later manual changes', () => {
	const store = new ManagedStateStore();
	const value = '[[../Shared]]';
	store.recordWrite('A/note.md', 'project', 'r', hashValue(value), { value, targetPath: 'Shared.md' });
	store.migratePath('A/note.md', 'A/deep/note.md');
	const links = { ...mockLinkGenerator, resolveLink: (link: string) =>
		link === '[[../../Shared]]' ? 'Shared.md' : 'Other.md' };
	assert.equal(store.matchesValue('A/deep/note.md', 'project', '[[../../Shared]]', links), true);
	assert.equal(store.matchesValue('A/deep/note.md', 'project', '[[../Other]]', links), false);
	store.recordWrite('A/deep/note.md', 'project', 'r', hashValue('[[../../Shared]]'),
		{ value: '[[../../Shared]]', targetPath: 'Shared.md' });
	assert.equal(store.matchesValue('A/deep/note.md', 'project', '[[Shared]]',
		{ ...links, resolveLink: () => 'Shared.md' }), false);
});
