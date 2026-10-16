import type { Plugin } from 'obsidian';
import type { LoadedPluginData, PluginData } from '../../domain/plugin-data';
import type { PluginDataStore } from '../../ports/PluginDataStore';
import { parsePluginData } from '../../settings';

export class ObsidianPluginDataStore implements PluginDataStore {
	constructor(private plugin: Plugin) {}

	async load(): Promise<LoadedPluginData> {
		return parsePluginData(await this.plugin.loadData());
	}

	async save(data: PluginData): Promise<void> {
		await this.plugin.saveData(data);
	}
}
