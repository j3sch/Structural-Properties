import type { LoadedPluginData, PluginData } from '../domain/plugin-data';

export interface PluginDataStore {
	load(): Promise<LoadedPluginData>;
	save(data: PluginData): Promise<void>;
}
