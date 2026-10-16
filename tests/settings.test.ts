import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	defaultPluginData,
	parsePluginData,
	validateDebounce,
	validateRule,
} from '../src/settings';
import type { StructuralRule } from '../src/domain/rules';

const validRule: StructuralRule = {
	id: 'rule-1',
	name: 'Project',
	enabled: true,
	priority: 100,
	property: 'project',
	scope: { include: ['**/*.md'], exclude: [], markdownOnly: true },
	resolver: { type: 'path-regex', pattern: '^([^/]+)', outputTemplate: '$1' },
	format: { type: 'text' },
};

describe('settings schema v3', () => {
	it('has the exact canonical default structure', () => {
		assert.deepEqual(defaultPluginData(), {
			schemaVersion: 3,
			settings: {
				automation: {
					updateOnStructuralChanges: true,
					updateOnFileOpen: true,
					debounceMs: 750,
				},
				defaults: {
					writePolicy: 'managed',
					onNoMatch: 'clear-managed',
					linkStyle: 'full-path',
				},
				excludePatterns: ['templater/**', 'templates/**', '**/*.excalidraw.md'],
				folderNotePatterns: [
					'{{folderPath}}/{{folderName}}.md',
					'{{folderPath}}/index.md',
					'{{folderPath}}.md',
				],
				rules: [],
			},
			managedState: { entries: {} },
		});
	});

	it('fully resets v2 data and marks it for a one-time notice', () => {
		const loaded = parsePluginData({
			schemaVersion: 2,
			rules: [validRule],
			managedState: { entries: { 'note.md': {} } },
		});
		assert.deepEqual(loaded.data, defaultPluginData());
		assert.equal(loaded.resetFromV2, true);
	});

	it('fully resets unknown, missing, and non-object data', () => {
		for (const oldData of [{ schemaVersion: 99 }, { rules: [validRule] }, 'old-data']) {
			const loaded = parsePluginData(oldData);
			assert.deepEqual(loaded.data, defaultPluginData());
			assert.equal(loaded.resetFromV2, false);
		}
	});

	it('retains and canonically validates valid v3 values', () => {
		const loaded = parsePluginData({
			schemaVersion: 3,
			settings: {
				automation: {
					updateOnStructuralChanges: false,
					updateOnFileOpen: false,
					debounceMs: 120,
				},
				defaults: {
					writePolicy: 'always',
					onNoMatch: 'ignore',
					linkStyle: 'obsidian-preference',
				},
				excludePatterns: ['private/**'],
				folderNotePatterns: ['{{folderPath}}/index.md'],
				rules: [validRule],
				extra: 'discarded',
			},
			managedState: {
				entries: {
					'note.md': {
						project: { property: 'project', ruleId: 'rule-1', valueHash: 'hash' },
					},
				},
			},
			extra: 'discarded',
		});

		assert.equal(loaded.data.settings.automation.updateOnFileOpen, false);
		assert.equal(loaded.data.settings.defaults.writePolicy, 'always');
		assert.deepEqual(loaded.data.settings.rules, [validRule]);
		assert.deepEqual(loaded.data.managedState.entries['note.md'], {
			project: { property: 'project', ruleId: 'rule-1', valueHash: 'hash' },
		});
		assert.deepEqual(Object.keys(loaded.data), ['schemaVersion', 'settings', 'managedState']);
	});

	it('repairs invalid v3 fields without preserving malformed state', () => {
		const loaded = parsePluginData({
			schemaVersion: 3,
			settings: {
				automation: { debounceMs: -1 },
				defaults: { writePolicy: 'unsafe' },
				rules: [validRule, { id: 'invalid' }],
			},
			managedState: { entries: { 'note.md': { type: { ruleId: 42 } } } },
		});
		assert.equal(loaded.data.settings.automation.debounceMs, 750);
		assert.equal(loaded.data.settings.automation.updateOnFileOpen, true);
		assert.equal(loaded.data.settings.defaults.writePolicy, 'managed');
		assert.deepEqual(loaded.data.settings.rules, [validRule]);
		assert.deepEqual(loaded.data.managedState, { entries: {} });
	});

	it('validates debounce and rule-specific fields', () => {
		assert.equal(validateDebounce(0), undefined);
		assert.match(validateDebounce(-1) ?? '', /greater than or equal/);
		assert.deepEqual(validateRule(validRule), []);
		assert.match(
			validateRule({
				...validRule,
				property: '',
				resolver: { type: 'path-regex', pattern: '[' },
			}).join(' '),
			/Property is required.*Regex pattern is invalid/,
		);
	});
});
