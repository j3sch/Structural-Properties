import { Notice, type SettingDefinitionItem } from 'obsidian';
import type { SettingsController } from '../../../application/SettingsController';
import { renderChangeTable } from '../../shared/ChangeTable';

export function buildToolDefinitions(
	controller: SettingsController,
	refresh: () => void,
): SettingDefinitionItem[] {
	return [
		{
			type: 'group',
			heading: 'Test path',
			items: [
				{
					name: 'Sample file path',
					desc: 'Preview the rules and changes for a vault path.',
					aliases: ['preview', 'evaluate rule'],
					render: (setting, group) => {
						let path = '';
						const results = group.listEl.createDiv({
							cls: 'structural-properties-test-result',
						});
						setting
							.addText((text) =>
								text
									.setPlaceholder('path/to/note.md')
									.onChange((value) => (path = value.trim())),
							)
							.addButton((button) =>
								button.setButtonText('Evaluate').onClick(async () => {
									if (!path) return;
									renderChangeTable(results, await controller.previewPath(path));
								}),
							);
						return () => results.remove();
					},
				},
			],
		},
		{
			type: 'group',
			heading: 'Managed state',
			items: [
				{
					name: 'Clean managed state',
					desc: `Remove tracking for missing files. Currently tracking ${controller.getManagedFileCount()} file(s).`,
					action: () => {
						void controller.cleanManagedState().then((removed) => {
							new Notice(`Structural properties: pruned ${removed} stale entries`);
							refresh();
						});
					},
				},
			],
		},
		{
			type: 'group',
			heading: 'Safety',
			items: [
				{
					name: 'Review vault-wide changes',
					desc: 'Vault-wide writes only happen through refresh commands. Run a dry run first.',
				},
			],
		},
	];
}
