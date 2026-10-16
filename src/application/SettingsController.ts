import type { PlannedChange } from '../domain/changes';
import type {
	LinkStyle,
	OnNoMatch,
	StructuralRule,
	WritePolicy,
} from '../domain/rules';
import type { PluginSettings } from '../domain/plugin-data';
import { validateDebounce } from '../settings';
import type { PluginServices } from './PluginServices';

export class SettingsController {
	constructor(
		private getCurrentSettings: () => PluginSettings,
		private services: PluginServices,
		private persist: () => Promise<void>,
	) {}

	get settings(): PluginSettings {
		return this.getCurrentSettings();
	}

	getControlValue(key: string): unknown {
		switch (key) {
			case 'automation.updateOnStructuralChanges':
				return this.settings.automation.updateOnStructuralChanges;
			case 'automation.updateOnFileOpen':
				return this.settings.automation.updateOnFileOpen;
			case 'automation.debounceMs':
				return this.settings.automation.debounceMs;
			case 'defaults.writePolicy':
				return this.settings.defaults.writePolicy;
			case 'defaults.onNoMatch':
				return this.settings.defaults.onNoMatch;
			case 'defaults.linkStyle':
				return this.settings.defaults.linkStyle;
			default:
				throw new Error(`Unsupported declarative setting key: ${key}`);
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case 'automation.updateOnStructuralChanges':
				if (typeof value !== 'boolean') return;
				this.settings.automation.updateOnStructuralChanges = value;
				break;
			case 'automation.updateOnFileOpen':
				if (typeof value !== 'boolean') return;
				this.settings.automation.updateOnFileOpen = value;
				break;
			case 'automation.debounceMs':
				if (typeof value !== 'number' || validateDebounce(value)) return;
				this.settings.automation.debounceMs = value;
				break;
			case 'defaults.writePolicy':
				this.settings.defaults.writePolicy = value as WritePolicy;
				break;
			case 'defaults.onNoMatch':
				this.settings.defaults.onNoMatch = value as OnNoMatch;
				break;
			case 'defaults.linkStyle':
				this.settings.defaults.linkStyle = value as LinkStyle;
				break;
			default:
				throw new Error(`Unsupported declarative setting key: ${key}`);
		}
		await this.persist();
	}

	async setExcludePatterns(patterns: string[]): Promise<void> {
		this.settings.excludePatterns = patterns;
		await this.persist();
	}

	async setFolderNotePatterns(patterns: string[]): Promise<void> {
		this.settings.folderNotePatterns = patterns;
		await this.persist();
	}

	addRule(rule: StructuralRule): Promise<void> {
		return this.services.rules.addRule(rule);
	}

	updateRule(rule: StructuralRule): Promise<void> {
		return this.services.rules.updateRule(rule);
	}

	setRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
		return this.services.rules.setEnabled(ruleId, enabled);
	}

	deleteRule(ruleId: string): Promise<void> {
		return this.services.rules.deleteRule(ruleId);
	}

	previewPath(path: string): Promise<PlannedChange[]> {
		return this.services.processing.planPaths([path]);
	}

	cleanManagedState(): Promise<number> {
		return this.services.maintenance.pruneManagedState();
	}

	getManagedFileCount(): number {
		return this.services.maintenance.getManagedFileCount();
	}
}
