import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProcessingService } from '../src/application/ProcessingService';
import { RuleEngine } from '../src/domain/core/RuleEngine';
import { Formatter } from '../src/domain/core/Formatter';
import { DiffEngine } from '../src/domain/core/DiffEngine';
import { createDefaultRegistry } from '../src/resolvers';
import { ManagedStateStore } from '../src/domain/ManagedStateStore';
import { defaultSettings, parsePluginData } from '../src/settings';
import { hashValue } from '../src/utils/hash';
import { applyCompareAndSet } from '../src/application/applyCompareAndSet';
import { MockVault, mockLinkGenerator } from './mocks';
import type { StructuralRule } from '../src/domain/rules';
import type { FrontmatterRepository } from '../src/ports/FrontmatterRepository';

function rule(property: string, value: string): StructuralRule {
	return { id: property, name: property, enabled: true, priority: 100, property,
		scope: { include: ['notes/**'], exclude: [], markdownOnly: true },
		resolver: { type: 'static', value }, format: { type: 'text' },
		writePolicy: 'always', onNoMatch: 'clear-managed' };
}

function harness() {
	const settings = defaultSettings();
	settings.rules = [rule('kind', 'new'), { ...rule('extra', 'added'), writePolicy: 'empty-only' }];
	const fm: Record<string, unknown> = { kind: 'old', extra: 'existing' };
	const managed = new ManagedStateStore();
	let beforeWrite = (): void => undefined;
	let saves = 0;
	const repository: FrontmatterRepository = {
		readFrontmatter: async () => ({ ...fm }),
		applyPlannedChanges: async (changes, state, valid = () => true) => {
			beforeWrite();
			const accepted = valid() ? applyCompareAndSet(fm, changes) : [];
			for (const c of accepted) {
				if (c.action === 'clear') state.recordClear(c.filePath, c.property);
				else state.recordWrite(c.filePath, c.property, c.ruleId, hashValue(c.newValue));
			}
			const tracked = accepted.filter((c) => c.action === 'track').length;
			return { applied: accepted.length - tracked, skipped: changes.length - accepted.length,
				errors: 0, ...(tracked ? { tracked } : {}) };
		},
	};
	const service = new ProcessingService(new RuleEngine(createDefaultRegistry(), new Formatter(mockLinkGenerator), new DiffEngine()),
		repository, new MockVault({ files: ['notes/n.md', 'archive/n.md'] }), mockLinkGenerator,
		() => settings, managed, async () => { saves++; });
	return { settings, fm, managed, service, get saves() { return saves; },
		beforeWrite: (callback: () => void) => { beforeWrite = callback; } };
}

describe('reviewed changes', () => {
	it('applies only the displayed changes, never newly eligible properties', async () => {
		const h = harness();
		const preview = await h.service.createPreview(['notes/n.md']);
		delete h.fm.extra;
		const result = await h.service.applyPreview(preview);
		assert.equal(result.applied, 1);
		assert.equal(h.fm.kind, 'new');
		assert.equal(h.fm.extra, undefined);
	});

	it('preserves manual edits made after previewing or after validation', async () => {
		for (const late of [false, true]) {
			const h = harness();
			const preview = await h.service.createPreview(['notes/n.md']);
			if (late) h.beforeWrite(() => { h.fm.kind = 'manual'; });
			else h.fm.kind = 'manual';
			const result = await h.service.applyPreview(preview);
			assert.equal(result.applied, 0);
			assert.equal(h.fm.kind, 'manual');
		}
	});

	it('rejects changed rules and structural changes, even immediately before writing', async () => {
		for (const event of ['settings', 'structure', 'late structure']) {
			const h = harness();
			const preview = await h.service.createPreview(['notes/n.md']);
			if (event === 'settings') h.settings.rules[0]!.resolver = { type: 'static', value: 'different' };
			else if (event === 'structure') h.service.invalidateStructure();
			else h.beforeWrite(() => h.service.invalidateStructure());
			const result = await h.service.applyPreview(preview);
			assert.equal(result.applied, 0);
			assert.equal(result.stale, true);
			assert.equal(h.fm.kind, 'old');
		}
	});

	it('registers correct always values, then clears them after leaving scope', async () => {
		const h = harness();
		h.fm.kind = 'new';
		const result = await h.service.processPaths(['notes/n.md']);
		assert.equal(result.applied, 0);
		assert.equal(result.tracked, 1);
		assert.equal(h.saves, 1);
		h.managed.migratePath('notes/n.md', 'archive/n.md');
		const cleared = await h.service.processPaths(['archive/n.md']);
		assert.equal(cleared.applied, 1);
		assert.equal(h.fm.kind, undefined);
	});
});

describe('folder note dependencies', () => {
	it('finds affected descendants for every default pattern, including missing and deleted folder notes', () => {
		for (const [pattern, note] of [
			['{{folderPath}}/{{folderName}}.md', 'A/A.md'],
			['{{folderPath}}/index.md', 'A/index.md'],
			['{{folderPath}}.md', 'A.md'],
		]) {
			const h = harness();
			h.settings.folderNotePatterns = [pattern!];
			const service = new ProcessingService({} as RuleEngine, {} as FrontmatterRepository,
				new MockVault({ files: ['A/child.md', 'A/deep/child.md', 'B/child.md'] }), mockLinkGenerator,
				() => h.settings, h.managed, async () => undefined);
			assert.deepEqual(service.getFolderNoteAffectedPaths([note!]), ['A/child.md', 'A/deep/child.md']);
		}
	});

	it('retains settings and hash-only entries when loading extended link state', () => {
		const h = harness();
		h.managed.recordWrite('note.md', 'link', 'r', hashValue('[[A]]'), { value: '[[A]]', targetPath: 'A.md' });
		h.managed.recordWrite('legacy.md', 'kind', 'kind', hashValue('old'));
		const loaded = parsePluginData({ schemaVersion: 3, settings: h.settings, managedState: h.managed.state });
		assert.equal(loaded.data.settings.rules.length, 2);
		assert.equal(loaded.data.managedState.entries['note.md']?.link?.link?.targetPath, 'A.md');
		assert.equal(loaded.data.managedState.entries['legacy.md']?.kind?.valueHash, hashValue('old'));
	});
});
