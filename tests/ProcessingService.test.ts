import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProcessingService } from '../src/application/ProcessingService';
import { ManagedStateStore } from '../src/domain/ManagedStateStore';
import type { PlannedChange } from '../src/domain/changes';
import type { RuleEngine } from '../src/domain/core/RuleEngine';
import type { FrontmatterRepository } from '../src/ports/FrontmatterRepository';
import { defaultSettings } from '../src/settings';
import { MockVault, mockLinkGenerator } from './mocks';

const change: PlannedChange = {
	filePath: 'notes/a.md',
	property: 'type',
	ruleId: 'r1',
	ruleName: 'Type',
	action: 'set',
	oldValue: undefined,
	newValue: 'note',
	writePolicy: 'managed',
	onNoMatch: 'clear-managed',
	conflict: 'none',
	reason: 'test',
};

describe('ProcessingService', () => {
	it('does not apply or persist an already current note', async () => {
		const settings = defaultSettings();
		let applyCalls = 0;
		let saveCalls = 0;
		const frontmatter: FrontmatterRepository = {
			readFrontmatter: async () => ({ type: 'note' }),
			applyPlannedChanges: async () => {
				applyCalls++;
				return { applied: 0, skipped: 0, errors: 0 };
			},
		};
		const engine = {
			planForFile: async () => [{ ...change, action: 'skip', oldValue: 'note' }],
		} as unknown as RuleEngine;
		const service = new ProcessingService(
			engine,
			frontmatter,
			new MockVault({ files: ['notes/a.md'] }),
			mockLinkGenerator,
			() => settings,
			new ManagedStateStore(),
			async () => {
				saveCalls++;
			},
		);

		const result = await service.processPaths(['notes/a.md']);
		assert.deepEqual(result, { applied: 0, skipped: 1, errors: 0 });
		assert.equal(applyCalls, 0);
		assert.equal(saveCalls, 0);
	});

	it('plans without applying and excludes configured paths', async () => {
		const settings = defaultSettings();
		settings.excludePatterns = ['templates/**'];
		let applied = false;
		const frontmatter: FrontmatterRepository = {
			readFrontmatter: async () => ({}),
			applyPlannedChanges: async () => {
				applied = true;
				return { applied: 1, skipped: 0, errors: 0 };
			},
		};
		const engine = {
			planForFile: async (path: string) => [{ ...change, filePath: path }],
		} as unknown as RuleEngine;
		const vault = new MockVault({ files: ['notes/a.md', 'templates/t.md'] });
		const service = new ProcessingService(
			engine,
			frontmatter,
			vault,
			mockLinkGenerator,
			() => settings,
			new ManagedStateStore(),
			async () => undefined,
			() => undefined,
		);

		const planned = await service.planPaths(['notes/a.md', 'templates/t.md']);
		assert.equal(planned.length, 1);
		assert.equal(applied, false);
	});

	it('continues after one file fails to plan', async () => {
		const settings = defaultSettings();
		const frontmatter: FrontmatterRepository = {
			readFrontmatter: async () => ({}),
			applyPlannedChanges: async (changes) => ({
				applied: changes.length,
				skipped: 0,
				errors: 0,
			}),
		};
		const engine = {
			planForFile: async (path: string) => {
				if (path === 'bad.md') throw new Error('broken');
				return [{ ...change, filePath: path }];
			},
		} as unknown as RuleEngine;
		const service = new ProcessingService(
			engine,
			frontmatter,
			new MockVault({ files: ['bad.md', 'good.md'] }),
			mockLinkGenerator,
			() => settings,
			new ManagedStateStore(),
			async () => undefined,
			() => undefined,
		);

		const result = await service.processPaths(['bad.md', 'good.md']);
		assert.deepEqual(result, { applied: 1, skipped: 0, errors: 1 });
	});

	it('counts invalid frontmatter as an error without applying or persisting', async () => {
		const settings = defaultSettings();
		let applyCalls = 0;
		let saveCalls = 0;
		const frontmatter: FrontmatterRepository = {
			readFrontmatter: async () => {
				throw new Error('Invalid YAML frontmatter');
			},
			applyPlannedChanges: async () => {
				applyCalls++;
				return { applied: 0, skipped: 0, errors: 0 };
			},
		};
		const service = new ProcessingService(
			{ planForFile: async () => [change] } as unknown as RuleEngine,
			frontmatter,
			new MockVault({ files: ['invalid.md'] }),
			mockLinkGenerator,
			() => settings,
			new ManagedStateStore(),
			async () => {
				saveCalls++;
			},
			() => undefined,
		);

		const result = await service.processPaths(['invalid.md']);
		assert.deepEqual(result, { applied: 0, skipped: 0, errors: 1 });
		assert.equal(applyCalls, 0);
		assert.equal(saveCalls, 0);
	});

	it('manual processing remains active when both automatic triggers are disabled', async () => {
		const settings = defaultSettings();
		settings.automation.updateOnStructuralChanges = false;
		settings.automation.updateOnFileOpen = false;
		let saveCalls = 0;
		const service = new ProcessingService(
			{ planForFile: async () => [change] } as unknown as RuleEngine,
			{
				readFrontmatter: async () => ({}),
				applyPlannedChanges: async () => ({ applied: 1, skipped: 0, errors: 0 }),
			},
			new MockVault({ files: ['notes/a.md'] }),
			mockLinkGenerator,
			() => settings,
			new ManagedStateStore(),
			async () => {
				saveCalls++;
			},
		);

		assert.deepEqual(await service.processPaths(['notes/a.md']), {
			applied: 1,
			skipped: 0,
			errors: 0,
		});
		assert.equal(saveCalls, 1);
	});
});
