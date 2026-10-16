import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultRegistry } from '../src/resolvers';
import { ResolverRegistry } from '../src/domain/core/ResolverRegistry';
import type { ResolverConfig } from '../src/domain/rules';
import type { ResolverContext } from '../src/domain/resolvers';
import { MockVault, mockLinkGenerator } from './mocks';
import { getParentFolderPath, getBaseName, getFileName } from '../src/utils/path';

const patterns = ['{{folderPath}}/{{folderName}}.md', '{{folderPath}}/index.md'];

function makeCtx(filePath: string, vault: MockVault): ResolverContext {
	return {
		filePath,
		fileName: getBaseName(filePath),
		fileBasename: getFileName(filePath),
		parentFolderPath: getParentFolderPath(filePath),
		vault,
		folderNotePatterns: patterns,
		linkGenerator: mockLinkGenerator,
	};
}

const vault = new MockVault({
	files: [
		'01 Projects/Captzy/Captzy.md',
		'01 Projects/Captzy/note.md',
		'01 Projects/Captzy/sub/note.md',
		'01 Projects/01 Projects.md',
	],
	frontmatter: {
		'01 Projects/Captzy/Captzy.md': { status: 'active', owner: 'me' },
	},
});

describe('ResolverRegistry', () => {
	const registry = createDefaultRegistry();

	it('parent-folder-note finds the containing folder note', async () => {
		const cfg: ResolverConfig = {
			type: 'parent-folder-note',
			folderNoteSelfBehavior: 'parent-folder-note',
		};
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/note.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.targetFilePath, '01 Projects/Captzy/Captzy.md');
	});

	it('parent-folder-note self behavior: self', async () => {
		const cfg: ResolverConfig = {
			type: 'parent-folder-note',
			folderNoteSelfBehavior: 'self',
		};
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/Captzy.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.targetFilePath, '01 Projects/Captzy/Captzy.md');
	});

	it('parent-folder-note self behavior: none', async () => {
		const cfg: ResolverConfig = {
			type: 'parent-folder-note',
			folderNoteSelfBehavior: 'none',
		};
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/Captzy.md', vault));
		assert.equal(res.matched, false);
	});

	it('parent-folder-note self behavior: parent-folder-note goes up', async () => {
		const cfg: ResolverConfig = {
			type: 'parent-folder-note',
			folderNoteSelfBehavior: 'parent-folder-note',
		};
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/Captzy.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.targetFilePath, '01 Projects/01 Projects.md');
	});

	it('ancestor-folder-note resolves level 1 under root', async () => {
		const cfg: ResolverConfig = {
			type: 'ancestor-folder-note',
			root: '01 Projects',
			levelBelowRoot: 1,
		};
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/sub/note.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.targetFilePath, '01 Projects/Captzy/Captzy.md');
	});

	it('ancestor-folder-note does not match a file directly in root', async () => {
		const cfg: ResolverConfig = {
			type: 'ancestor-folder-note',
			root: '01 Projects',
			levelBelowRoot: 1,
		};
		const res = await registry.resolve(cfg, makeCtx('01 Projects/note.md', vault));
		assert.equal(res.matched, false);
	});

	it('nearest-folder-note walks up', async () => {
		const cfg: ResolverConfig = { type: 'nearest-folder-note' };
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/sub/note.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.targetFilePath, '01 Projects/Captzy/Captzy.md');
	});

	it('path-segment returns the current folder name', async () => {
		const cfg: ResolverConfig = { type: 'path-segment', segmentSource: 'current-folder' };
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/note.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.rawValue, 'Captzy');
	});

	it('path-segment from-root index 0', async () => {
		const cfg: ResolverConfig = { type: 'path-segment', segmentSource: 'from-root', segmentIndex: 0 };
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/note.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.rawValue, '01 Projects');
	});

	it('path-regex captures the first segment', async () => {
		const cfg: ResolverConfig = { type: 'path-regex', pattern: '^([^/]+)', outputTemplate: '$1' };
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/note.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.rawValue, '01 Projects');
	});

	it('inherit-property copies a value from the folder note', async () => {
		const cfg: ResolverConfig = {
			type: 'inherit-property',
			sourceProperty: 'status',
			searchMode: 'parent',
		};
		const res = await registry.resolve(cfg, makeCtx('01 Projects/Captzy/note.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.inheritedValue, 'active');
	});

	it('static always matches', async () => {
		const cfg: ResolverConfig = { type: 'static', value: 'inbox' };
		const res = await registry.resolve(cfg, makeCtx('any/note.md', vault));
		assert.equal(res.matched, true);
		assert.equal(res.rawValue, 'inbox');
	});

	it('returns no-match for an unregistered resolver type', async () => {
		const empty = new ResolverRegistry();
		const cfg: ResolverConfig = { type: 'static', value: 'x' };
		const res = await empty.resolve(cfg, makeCtx('a.md', vault));
		assert.equal(res.matched, false);
	});
});
