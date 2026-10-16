import type { ManagedState } from './managed-state';
import type {
	LinkStyle,
	OnNoMatch,
	StructuralRule,
	WritePolicy,
} from './rules';

export interface AutomationSettings {
	updateOnStructuralChanges: boolean;
	updateOnFileOpen: boolean;
	debounceMs: number;
}

export interface RuleDefaults {
	writePolicy: WritePolicy;
	onNoMatch: OnNoMatch;
	linkStyle: LinkStyle;
}

export interface PluginSettings {
	automation: AutomationSettings;
	defaults: RuleDefaults;
	excludePatterns: string[];
	folderNotePatterns: string[];
	rules: StructuralRule[];
}

export interface PluginData {
	schemaVersion: 3;
	settings: PluginSettings;
	managedState: ManagedState;
}

export interface LoadedPluginData {
	data: PluginData;
	resetFromV2: boolean;
}
