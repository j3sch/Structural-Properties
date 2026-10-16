import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuleEngine } from '../src/domain/core/RuleEngine';
import { Formatter } from '../src/domain/core/Formatter';
import { DiffEngine } from '../src/domain/core/DiffEngine';
import { createDefaultRegistry } from '../src/resolvers';
import { defaultSettings } from '../src/settings';
import { ManagedStateStore } from '../src/domain/ManagedStateStore';
import { hashValue } from '../src/utils/hash';
import { MockVault, mockLinkGenerator } from './mocks';
import type { PluginSettings } from '../src/domain/plugin-data';
import type { StructuralRule } from '../src/domain/rules';

const patterns = ['{{folderPath}}/{{folderName}}.md', '{{folderPath}}/index.md'];

const vault = new MockVault({
	files: [
		'01 Projects/Captzy/Captzy.md',
		'01 Projects/Captzy/note.md',
		'01 Projects/Captzy/sub/note.md',
		'01 Projects/Projects.md',
	],
});

function makeEngine(): RuleEngine {
	return new RuleEngine(
		createDefaultRegistry(),
		new Formatter(mockLinkGenerator),
		new DiffEngine(),
	);
}

function settingsWith(rules: StructuralRule[]): PluginSettings {
	const s = defaultSettings();
	s.folderNotePatterns = patterns;
	s.rules = rules;
	return s;
}

const linkRule: StructuralRule = {
	id: 'link-rule',
	name: 'Link to parent folder note',
	enabled: true,
	priority: 100,
	property: 'link',
	scope: { include: ['**/*.md'], exclude: [], markdownOnly: true },
	resolver: { type: 'parent-folder-note', folderNoteSelfBehavior: 'parent-folder-note' },
	format: { type: 'wikilink', style: 'full-path' },
	writePolicy: 'managed',
	onNoMatch: 'clear-managed',
};

const projectRule: StructuralRule = {
	id: 'project-rule',
	name: 'Project from ancestor folder note',
	enabled: true,
	priority: 100,
	property: 'project',
	scope: { include: ['01 Projects/**'], exclude: [], minDepthBelowRoot: 1, markdownOnly: true },
	resolver: { type: 'ancestor-folder-note', root: '01 Projects', levelBelowRoot: 1 },
	format: { type: 'wikilink', style: 'full-path' },
	writePolicy: 'managed',
	onNoMatch: 'clear-managed',
};

describe('RuleEngine', () => {
	it('plans a link property from the parent folder note', async () => {
		const engine = makeEngine();
		const settings = settingsWith([linkRule]);
		const managed = new ManagedStateStore();
		const changes = await engine.planForFile(
			'01 Projects/Captzy/note.md',
			{},
			settings,
			managed,
			vault,
			mockLinkGenerator,
		);
		const linkChange = changes.find((c) => c.property === 'link');
		assert.ok(linkChange);
		assert.equal(linkChange?.action, 'set');
		assert.equal(linkChange?.newValue, '[[01 Projects/Captzy/Captzy]]');
	});

	it('plans a project property from the ancestor folder note', async () => {
		const engine = makeEngine();
		const settings = settingsWith([projectRule]);
		const managed = new ManagedStateStore();
		const changes = await engine.planForFile(
			'01 Projects/Captzy/sub/note.md',
			{},
			settings,
			managed,
			vault,
			mockLinkGenerator,
		);
		const projectChange = changes.find((c) => c.property === 'project');
		assert.ok(projectChange);
		assert.equal(projectChange?.action, 'set');
		assert.equal(projectChange?.newValue, '[[01 Projects/Captzy/Captzy]]');
	});

	it('clears a stale property when a file is moved out of scope', async () => {
		const engine = makeEngine();
		const settings = settingsWith([projectRule]);
		const managed = new ManagedStateStore();
		// The file previously lived under "01 Projects" and had a managed project value.
		const oldValue = '[[01 Projects/Captzy/Captzy]]';
		managed.recordWrite('Archive/note.md', 'project', 'project-rule', hashValue(oldValue));

		const changes = await engine.planForFile(
			'Archive/note.md',
			{ project: oldValue },
			settings,
			managed,
			vault,
			mockLinkGenerator,
		);
		const projectChange = changes.find((c) => c.property === 'project');
		assert.ok(projectChange);
		assert.equal(projectChange?.action, 'clear');
	});

	it('detects a user override and skips (managed)', async () => {
		const engine = makeEngine();
		const settings = settingsWith([linkRule]);
		const managed = new ManagedStateStore();
		// The managed hash differs from the current value -> user override.
		managed.recordWrite('01 Projects/Captzy/note.md', 'link', 'link-rule', hashValue('original'));

		const changes = await engine.planForFile(
			'01 Projects/Captzy/note.md',
			{ link: 'user-changed-value' },
			settings,
			managed,
			vault,
			mockLinkGenerator,
		);
		const linkChange = changes.find((c) => c.property === 'link');
		assert.ok(linkChange);
		assert.equal(linkChange?.action, 'skip');
		assert.equal(linkChange?.conflict, 'user-override');
	});

	it('respects rule priority: higher priority owns a property', async () => {
		const engine = makeEngine();
		const high: StructuralRule = {
			...linkRule,
			id: 'high',
			priority: 200,
			property: 'shared',
			resolver: { type: 'static', value: 'high-value' },
			format: { type: 'text' },
		};
		const low: StructuralRule = {
			...linkRule,
			id: 'low',
			priority: 50,
			property: 'shared',
			resolver: { type: 'static', value: 'low-value' },
			format: { type: 'text' },
		};
		const settings = settingsWith([low, high]);
		const managed = new ManagedStateStore();
		const changes = await engine.planForFile(
			'01 Projects/Captzy/note.md',
			{},
			settings,
			managed,
			vault,
			mockLinkGenerator,
		);
		const shared = changes.find((c) => c.property === 'shared');
		assert.ok(shared);
		assert.equal(shared?.action, 'set');
		assert.equal(shared?.newValue, 'high-value');
		assert.equal(changes.filter((c) => c.property === 'shared').length, 1);
	});

	it('uses the global link style when a rule does not override it', async () => {
		const engine = makeEngine();
		const settings = defaultSettings();
		settings.folderNotePatterns = patterns;
		settings.defaults.linkStyle = 'obsidian-preference';
		settings.rules = [
			{
				...linkRule,
				format: { type: 'wikilink' },
			},
		];
		const changes = await engine.planForFile(
			'01 Projects/Captzy/note.md',
			{},
			settings,
			new ManagedStateStore(),
			vault,
			mockLinkGenerator,
		);
		assert.equal(changes[0]?.newValue, '[Captzy](01 Projects/Captzy/Captzy.md)');
	});
});


describe('link ownership through renames', () => {
	it('keeps retained associations managed after an automatic rewrite outside the original scope', async () => {
		const managed = new ManagedStateStore();
		const old = '[[01 Projects/Old/Old]]';
		managed.recordWrite('Archive/note.md', 'project', projectRule.id, hashValue(old));
		managed.migrateLinkTargets('01 Projects/Old/Old.md', 'Archive/Old/Old.md');
		const current = '[[Archive/Old/Old]]';
		const changes = await makeEngine().planForFile('Archive/note.md', { project: current },
			settingsWith([{ ...projectRule, onNoMatch: 'ignore' }]), managed, vault, mockLinkGenerator);
		assert.equal(changes[0]?.action, 'track');
		assert.equal(changes[0]?.newValue, current);
		assert.equal(changes[0]?.linkTargetPath, 'Archive/Old/Old.md');
	});

	it('accepts Obsidian rewrites once, but never adopts untracked or manually changed links', async () => {
		const path = '01 Projects/Captzy/note.md';
		const current = '[[01 Projects/Captzy/Captzy]]';
		const managed = new ManagedStateStore();
		managed.recordWrite(path, 'link', linkRule.id, hashValue('[[Old/Old]]'),
			{ value: '[[Old/Old]]', targetPath: 'Old/Old.md' });
		managed.migrateLinkTargets('Old/Old.md', '01 Projects/Captzy/Captzy.md');
		const changes = await makeEngine().planForFile(path, { link: current }, settingsWith([linkRule]), managed, vault, mockLinkGenerator);
		assert.equal(changes[0]?.action, 'track');
		assert.equal(changes[0]?.conflict, 'none');
		const fresh = await makeEngine().planForFile(path, { link: current }, settingsWith([linkRule]), new ManagedStateStore(), vault, mockLinkGenerator);
		assert.equal(fresh[0]?.conflict, 'user-override');
		const manual = await makeEngine().planForFile(path, { link: '[[Manual]]' }, settingsWith([linkRule]), managed, vault, mockLinkGenerator);
		assert.equal(manual[0]?.conflict, 'user-override');
	});
});
