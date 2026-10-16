import { Notice, Plugin } from 'obsidian';
import { EventController } from './adapters/obsidian/EventController';
import { ObsidianFrontmatterRepository } from './adapters/obsidian/ObsidianFrontmatterRepository';
import { ObsidianLinkGenerator } from './adapters/obsidian/ObsidianLinkGenerator';
import { ObsidianPluginDataStore } from './adapters/obsidian/ObsidianPluginDataStore';
import { ObsidianVaultAccess } from './adapters/obsidian/ObsidianVaultAccess';
import { createPluginServices, type PluginServices } from './application/PluginServices';
import { AutomaticUpdateService } from './application/AutomaticUpdateService';
import { PersistenceCoordinator } from './application/PersistenceCoordinator';
import { SettingsController } from './application/SettingsController';
import { CommandHandlers } from './commands/CommandHandlers';
import { registerCommands } from './commands';
import type { PluginData, PluginSettings } from './domain/plugin-data';
import { ManagedStateStore } from './domain/ManagedStateStore';
import { StructuralMetadataSettingsTab } from './ui/settings/SettingsTab';

export default class StructuralMetadataPlugin extends Plugin {
	settings!: PluginSettings;
	private managedState!: ManagedStateStore;
	private services!: PluginServices;
	private eventController!: EventController;
	private persistence!: PersistenceCoordinator;

	async onload(): Promise<void> {
		const dataStore = new ObsidianPluginDataStore(this);
		const loaded = await dataStore.load();
		this.settings = loaded.data.settings;
		this.managedState = new ManagedStateStore(loaded.data.managedState);
		this.persistence = new PersistenceCoordinator(dataStore, () => this.snapshot());
		await this.persistence.requestSave();
		if (loaded.resetFromV2) {
			new Notice(
				'Structural properties 3 reset the previous settings and rules. Configure the plugin again in settings.',
				10000,
			);
		}

		const vault = new ObsidianVaultAccess(this.app);
		const persist = (): Promise<void> => this.persistence.requestSave();
		this.services = createPluginServices({
			frontmatter: new ObsidianFrontmatterRepository(this.app),
			vault,
			linkGenerator: new ObsidianLinkGenerator(this.app),
			getSettings: () => this.settings,
			managedState: this.managedState,
			persist,
		});

		const commands = new CommandHandlers(this.app, this.services);
		registerCommands(this, commands);
		this.addSettingTab(
			new StructuralMetadataSettingsTab(
				this.app,
				this,
				new SettingsController(() => this.settings, this.services, persist),
			),
		);

		const automaticUpdates = new AutomaticUpdateService(
			this.services.processing,
			this.managedState,
			() => this.settings,
			persist,
			{
				set: (callback, delayMs) => window.setTimeout(callback, delayMs),
				clear: (id) => window.clearTimeout(id),
			},
		);
		this.eventController = new EventController(this, automaticUpdates);
		this.eventController.start();
	}

	onunload(): void {
		this.eventController?.stop();
	}

	private snapshot(): PluginData {
		return {
			schemaVersion: 3,
			settings: this.settings,
			managedState: this.managedState.state,
		};
	}
}
