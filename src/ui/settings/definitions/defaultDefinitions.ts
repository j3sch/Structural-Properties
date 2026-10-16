import type { SettingDefinitionItem } from 'obsidian';
import { LINK_STYLES, ON_NO_MATCH, WRITE_POLICIES, toRecord } from '../../ruleOptions';

type SettingKey =
	| 'defaults.writePolicy'
	| 'defaults.onNoMatch'
	| 'defaults.linkStyle';

export function buildDefaultDefinitions(): SettingDefinitionItem<SettingKey>[] {
	return [
		{
			type: 'group',
			heading: 'Defaults',
			items: [
				{
					name: 'Default write policy',
					desc: 'Controls when a matching rule may replace an existing value.',
					control: {
						type: 'dropdown',
						key: 'defaults.writePolicy',
						defaultValue: 'managed',
						options: toRecord(WRITE_POLICIES),
					},
				},
				{
					name: 'Default on no match',
					desc: 'Controls what happens when a managed rule no longer matches.',
					control: {
						type: 'dropdown',
						key: 'defaults.onNoMatch',
						defaultValue: 'clear-managed',
						options: toRecord(ON_NO_MATCH),
					},
				},
				{
					name: 'Default link style',
					desc: 'Controls how generated links are written.',
					control: {
						type: 'dropdown',
						key: 'defaults.linkStyle',
						defaultValue: 'full-path',
						options: toRecord(LINK_STYLES),
					},
				},
			],
		},
	];
}
