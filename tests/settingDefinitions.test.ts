import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SettingDefinitionGroup } from 'obsidian';
import { buildAutomationDefinitions } from '../src/ui/settings/definitions/automationDefinitions';
import { buildDefaultDefinitions } from '../src/ui/settings/definitions/defaultDefinitions';

describe('declarative setting definitions', () => {
	it('exposes stable searchable default settings', () => {
		const automation = buildAutomationDefinitions();
		assert.equal(automation.length, 1);
		const automationGroup = automation[0] as SettingDefinitionGroup;
		assert.equal(automationGroup.heading, 'Automatic updates');
		assert.deepEqual(
			automationGroup.items?.map((item) => item.name),
			[
				'Update after structural changes',
				'Update when opening a note',
				'Debounce delay',
			],
		);

		const definitions = buildDefaultDefinitions();
		assert.equal(definitions.length, 1);
		const group = definitions[0] as SettingDefinitionGroup;
		assert.equal(group.heading, 'Defaults');
		assert.deepEqual(
			group.items?.map((item) => item.name),
			[
				'Default write policy',
				'Default on no match',
				'Default link style',
			],
		);
	});
});
