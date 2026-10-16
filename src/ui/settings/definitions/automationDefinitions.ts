import type { SettingDefinitionItem } from 'obsidian';
import { validateDebounce } from '../../../settings';

type AutomationSettingKey =
	| 'automation.updateOnStructuralChanges'
	| 'automation.updateOnFileOpen'
	| 'automation.debounceMs';

export function buildAutomationDefinitions(): SettingDefinitionItem<AutomationSettingKey>[] {
	return [
		{
			type: 'group',
			heading: 'Automatic updates',
			items: [
				{
					name: 'Update after structural changes',
					desc: 'Update Markdown notes after they are created, moved, or renamed.',
					control: {
						type: 'toggle',
						key: 'automation.updateOnStructuralChanges',
						defaultValue: true,
					},
				},
				{
					name: 'Update when opening a note',
					desc: 'Update the active Markdown note, including the note restored at startup.',
					control: {
						type: 'toggle',
						key: 'automation.updateOnFileOpen',
						defaultValue: true,
					},
				},
				{
					name: 'Debounce delay',
					desc: 'Delay before processing a batch of automatic updates, in milliseconds.',
					aliases: ['delay', 'batch processing'],
					control: {
						type: 'number',
						key: 'automation.debounceMs',
						defaultValue: 750,
						min: 0,
						step: 50,
						validate: validateDebounce,
					},
				},
			],
		},
	];
}
