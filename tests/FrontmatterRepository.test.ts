import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ManagedStateStore } from '../src/domain/ManagedStateStore';
import type { PlannedChange } from '../src/domain/changes';

it('never rewrites notes for tracking-only or rejected writes in the Obsidian adapter', async () => {
	// Load the real adapter against a tiny in-memory Obsidian boundary, without a live vault.
	class TFile { constructor(public path: string) {} }
	const bundle = await build({
		entryPoints: [fileURLToPath(new URL('../src/adapters/obsidian/ObsidianFrontmatterRepository.ts', import.meta.url))],
		bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian'],
	});
	const module = { exports: {} };
	runInNewContext(bundle.outputFiles[0]!.text, { module, console, require: () => ({
		TFile, Notice: class {}, parseYaml: JSON.parse,
		getFrontMatterInfo: (content: string) => ({ exists: true, frontmatter: content.slice(4, -4) }),
	}) });
	const { ObsidianFrontmatterRepository } = module.exports as {
		ObsidianFrontmatterRepository: typeof import('../src/adapters/obsidian/ObsidianFrontmatterRepository').ObsidianFrontmatterRepository;
	};
	let fm: Record<string, unknown> = { kind: 'ready' };
	let writes = 0;
	let beforeCallback = (): void => undefined;
	const file = new TFile('note.md');
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => path === file.path ? file : null,
			cachedRead: async () => `---\n${JSON.stringify(fm)}\n---`,
		},
		fileManager: { processFrontMatter: async (_file: TFile, update: (value: Record<string, unknown>) => void) => {
			beforeCallback();
			const next = { ...fm };
			update(next);
			fm = next;
			writes++;
		} },
	};
	const repository = new ObsidianFrontmatterRepository(app as never);
	const managed = new ManagedStateStore();
	const change: PlannedChange = { filePath: 'note.md', property: 'kind', ruleId: 'r', ruleName: 'Rule',
		action: 'track', oldValue: 'ready', newValue: 'ready', writePolicy: 'always',
		onNoMatch: 'clear-managed', conflict: 'none', reason: 'test' };
	assert.equal((await repository.applyPlannedChanges([change], managed)).tracked, 1);
	assert.equal(writes, 0);
	assert.ok(managed.getEntry('note.md', 'kind'));

	beforeCallback = () => { fm.kind = 'manual'; };
	const edited = await repository.applyPlannedChanges([{ ...change, action: 'set', newValue: 'generated' }], managed);
	assert.equal(edited.applied, 0);
	assert.equal(edited.errors, 0);
	assert.equal(fm.kind, 'manual');
	assert.equal(writes, 0);

	fm.kind = 'ready';
	beforeCallback = () => { file.path = 'moved.md'; };
	const moved = await repository.applyPlannedChanges([{ ...change, action: 'set', newValue: 'generated' }], managed);
	assert.equal(moved.applied, 0);
	assert.equal(moved.errors, 0);
	assert.equal(fm.kind, 'ready');
	assert.equal(writes, 0);
});
