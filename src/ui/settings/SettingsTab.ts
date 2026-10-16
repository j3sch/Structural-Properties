import {
	App,
	Plugin,
	PluginSettingTab,
	type SettingDefinitionItem,
} from 'obsidian';
import type { SettingsController } from '../../application/SettingsController';
import { buildAutomationDefinitions } from './definitions/automationDefinitions';
import { buildDefaultDefinitions } from './definitions/defaultDefinitions';
import { buildPatternDefinitions } from './definitions/patternDefinitions';
import { buildRuleDefinitions } from './definitions/ruleDefinitions';
import { buildToolDefinitions } from './definitions/toolDefinitions';

export class StructuralMetadataSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private controller: SettingsController,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const refresh = (): void => this.update();
		return [
			...buildAutomationDefinitions(),
			...buildDefaultDefinitions(),
			...buildPatternDefinitions(this.controller, refresh),
			...buildRuleDefinitions(this.app, this.controller, refresh),
			...buildToolDefinitions(this.controller, refresh),
		];
	}

	getControlValue(key: string): unknown {
		return this.controller.getControlValue(key);
	}

	setControlValue(key: string, value: unknown): Promise<void> {
		return this.controller.setControlValue(key, value);
	}
}
