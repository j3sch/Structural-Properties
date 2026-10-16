import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AutomaticUpdateService } from '../src/application/AutomaticUpdateService';
import type { TimeoutScheduler } from '../src/application/DebouncedPathQueue';
import type { ProcessingService } from '../src/application/ProcessingService';
import { ManagedStateStore } from '../src/domain/ManagedStateStore';
import { defaultSettings } from '../src/settings';
import { hashValue } from '../src/utils/hash';

class FakeScheduler implements TimeoutScheduler {
	private callback: (() => void) | null = null;

	set(callback: () => void): number {
		this.callback = callback;
		return 1;
	}

	clear(): void {
		this.callback = null;
	}

	flush(): void {
		const callback = this.callback;
		this.callback = null;
		callback?.();
	}
}

function createHarness() {
	const settings = defaultSettings();
	const managedState = new ManagedStateStore();
	const scheduler = new FakeScheduler();
	const batches: string[][] = [];
	let saves = 0;
	const affected = new Map<string, string[]>();
	let revisions = 0;
	const processing = {
		invalidateStructure: () => { revisions++; },
		getFolderNoteAffectedPaths: (paths: string[]) => paths.flatMap((path) => affected.get(path) ?? []),
		processPaths: async (paths: string[]) => {
			batches.push(paths);
			return { applied: 0, skipped: 0, errors: 0 };
		},
	} as ProcessingService;
	const service = new AutomaticUpdateService(
		processing,
		managedState,
		() => settings,
		async () => {
			saves++;
		},
		scheduler,
	);
	return { settings, managedState, scheduler, batches, get saves() { return saves; }, get revisions() { return revisions; }, affected, service };
}

describe('AutomaticUpdateService', () => {
	it('respects both trigger switches', async () => {
		const harness = createHarness();
		harness.settings.automation.updateOnStructuralChanges = false;
		harness.settings.automation.updateOnFileOpen = false;
		harness.service.handleCreated('created.md');
		harness.service.handleOpened('opened.md');
		harness.scheduler.flush();
		await Promise.resolve();
		assert.deepEqual(harness.batches, []);

		harness.settings.automation.updateOnFileOpen = true;
		harness.service.handleOpened('opened.md');
		harness.scheduler.flush();
		await Promise.resolve();
		assert.deepEqual(harness.batches, [['opened.md']]);
	});

	it('deduplicates create plus open while retaining every distinct opened note', async () => {
		const harness = createHarness();
		harness.service.handleCreated('same.md');
		harness.service.handleOpened('same.md');
		harness.service.handleOpened('other.md');
		harness.scheduler.flush();
		await Promise.resolve();
		assert.deepEqual(harness.batches, [['same.md', 'other.md']]);
	});

	it('always migrates and persists file and folder paths with automation disabled', async () => {
		const harness = createHarness();
		harness.settings.automation.updateOnStructuralChanges = false;
		harness.settings.automation.updateOnFileOpen = false;
		harness.managedState.recordWrite('old.md', 'type', 'r1', hashValue('note'));
		harness.managedState.recordWrite('folder/a.md', 'type', 'r1', hashValue('note'));

		harness.service.handleFileRenamed('old.md', 'new.md', true);
		harness.service.handleFolderRenamed('folder', 'renamed', ['renamed/a.md']);
		await Promise.resolve();

		assert.ok(harness.managedState.getEntry('new.md', 'type'));
		assert.ok(harness.managedState.getEntry('renamed/a.md', 'type'));
		assert.equal(harness.saves, 2);
		harness.scheduler.flush();
		assert.deepEqual(harness.batches, []);
	});
});


describe('folder-note event propagation', () => {
	it('queues both affected trees on creation, move and deletion, including late metadata updates', async () => {
		const h = createHarness();
		h.affected.set('A/A.md', ['A/child.md']);
		h.affected.set('B/B.md', ['B/child.md']);
		h.service.handleCreated('A/A.md');
		h.service.handleFileRenamed('A/A.md', 'B/B.md', true);
		h.service.handleDeleted('B/B.md');
		h.service.handleMetadataChanged('A/A.md');
		h.scheduler.flush();
		await Promise.resolve();
		assert.deepEqual(new Set(h.batches.flat()), new Set(['A/A.md', 'A/child.md', 'B/B.md', 'B/child.md']));
		assert.equal(h.revisions, 3);
	});

	it('rechecks tracked references after target renames and delayed link rewrites', async () => {
		const h = createHarness();
		const value = '[[A/A]]';
		h.managedState.recordWrite('outside.md', 'link', 'r', hashValue(value), { value, targetPath: 'A/A.md' });
		h.service.handleFolderRenamed('A', 'B', ['B/A.md']);
		h.scheduler.flush();
		await Promise.resolve();
		assert.ok(h.batches.flat().includes('outside.md'));
		h.service.handleMetadataChanged('outside.md');
		h.scheduler.flush();
		await Promise.resolve();
		assert.equal(h.batches.at(-1)?.includes('outside.md'), true);
	});
});
