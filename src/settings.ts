import type {
	FormatConfig,
	LinkStyle,
	OnNoMatch,
	ResolverConfig,
	StructuralRule,
	WritePolicy,
} from './domain/rules';
import type { ManagedState } from './domain/managed-state';
import type {
	LoadedPluginData,
	PluginData,
	PluginSettings,
} from './domain/plugin-data';

const WRITE_POLICIES = new Set<WritePolicy>(['always', 'empty-only', 'managed']);
const NO_MATCH_POLICIES = new Set<OnNoMatch>(['ignore', 'clear-managed']);
const LINK_STYLES = new Set<LinkStyle>(['full-path', 'obsidian-preference']);

export function defaultSettings(): PluginSettings {
	return {
		automation: {
			updateOnStructuralChanges: true,
			updateOnFileOpen: true,
			debounceMs: 750,
		},
		defaults: {
			writePolicy: 'managed',
			onNoMatch: 'clear-managed',
			linkStyle: 'full-path',
		},
		excludePatterns: ['templater/**', 'templates/**', '**/*.excalidraw.md'],
		folderNotePatterns: [
			'{{folderPath}}/{{folderName}}.md',
			'{{folderPath}}/index.md',
			'{{folderPath}}.md',
		],
		rules: [],
	};
}

export function defaultPluginData(): PluginData {
	return {
		schemaVersion: 3,
		settings: defaultSettings(),
		managedState: { entries: {} },
	};
}

/** Accept only schema v3. Every other persisted shape intentionally restarts. */
export function parsePluginData(loaded: unknown): LoadedPluginData {
	const defaults = defaultPluginData();
	if (!isRecord(loaded) || loaded.schemaVersion !== 3) {
		return {
			data: defaults,
			resetFromV2: isRecord(loaded) && loaded.schemaVersion === 2,
		};
	}

	const settings = isRecord(loaded.settings) ? loaded.settings : {};
	const automation = isRecord(settings.automation) ? settings.automation : {};
	const ruleDefaults = isRecord(settings.defaults) ? settings.defaults : {};

	return {
		data: {
			schemaVersion: 3,
			settings: {
				automation: {
					updateOnStructuralChanges:
						typeof automation.updateOnStructuralChanges === 'boolean'
							? automation.updateOnStructuralChanges
							: defaults.settings.automation.updateOnStructuralChanges,
					updateOnFileOpen:
						typeof automation.updateOnFileOpen === 'boolean'
							? automation.updateOnFileOpen
							: defaults.settings.automation.updateOnFileOpen,
					debounceMs: validDebounce(automation.debounceMs)
						? automation.debounceMs
						: defaults.settings.automation.debounceMs,
				},
				defaults: {
					writePolicy: isWritePolicy(ruleDefaults.writePolicy)
						? ruleDefaults.writePolicy
						: defaults.settings.defaults.writePolicy,
					onNoMatch: isOnNoMatch(ruleDefaults.onNoMatch)
						? ruleDefaults.onNoMatch
						: defaults.settings.defaults.onNoMatch,
					linkStyle: isLinkStyle(ruleDefaults.linkStyle)
						? ruleDefaults.linkStyle
						: defaults.settings.defaults.linkStyle,
				},
				excludePatterns:
					stringArray(settings.excludePatterns) ?? defaults.settings.excludePatterns,
				folderNotePatterns:
					stringArray(settings.folderNotePatterns) ??
					defaults.settings.folderNotePatterns,
				rules: Array.isArray(settings.rules)
					? settings.rules.filter(isStructuralRule)
					: defaults.settings.rules,
			},
			managedState: isManagedState(loaded.managedState)
				? loaded.managedState
				: defaults.managedState,
		},
		resetFromV2: false,
	};
}

export function validateDebounce(value: number): string | void {
	if (!validDebounce(value)) return 'Enter a number greater than or equal to 0.';
}

export function validateRule(rule: StructuralRule): string[] {
	const errors: string[] = [];
	if (rule.name.trim() === '') errors.push('Rule name is required.');
	if (rule.property.trim() === '') errors.push('Property is required.');
	if (!Number.isFinite(rule.priority)) errors.push('Priority must be a number.');
	if (rule.resolver.type === 'ancestor-folder-note' && rule.resolver.root.trim() === '') {
		errors.push('Ancestor resolver root is required.');
	}
	if (rule.resolver.type === 'path-regex') {
		if (rule.resolver.pattern.trim() === '') {
			errors.push('Regex pattern is required.');
		} else {
			try {
				new RegExp(rule.resolver.pattern);
			} catch {
				errors.push('Regex pattern is invalid.');
			}
		}
	}
	if (
		rule.resolver.type === 'inherit-property' &&
		rule.resolver.sourceProperty.trim() === ''
	) {
		errors.push('Source property is required.');
	}
	return errors;
}

export function generateRuleId(): string {
	return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isStructuralRule(value: unknown): value is StructuralRule {
	if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
		return false;
	}
	if (
		typeof value.enabled !== 'boolean' ||
		typeof value.priority !== 'number' ||
		typeof value.property !== 'string' ||
		!isScope(value.scope) ||
		!isResolver(value.resolver) ||
		!isFormat(value.format)
	) {
		return false;
	}
	if (value.writePolicy !== undefined && !isWritePolicy(value.writePolicy)) return false;
	if (value.onNoMatch !== undefined && !isOnNoMatch(value.onNoMatch)) return false;
	return validateRule(value as unknown as StructuralRule).length === 0;
}

function isScope(value: unknown): boolean {
	return (
		isRecord(value) &&
		stringArray(value.include) !== null &&
		stringArray(value.exclude) !== null &&
		typeof value.markdownOnly === 'boolean' &&
		(value.minDepthBelowRoot === undefined ||
			(typeof value.minDepthBelowRoot === 'number' &&
				Number.isFinite(value.minDepthBelowRoot) &&
				value.minDepthBelowRoot >= 0))
	);
}

function isResolver(value: unknown): value is ResolverConfig {
	if (!isRecord(value) || typeof value.type !== 'string') return false;
	if (!isSelfBehavior(value.folderNoteSelfBehavior)) return false;
	switch (value.type) {
		case 'parent-folder-note':
		case 'nearest-folder-note':
			return true;
		case 'ancestor-folder-note':
			return (
				typeof value.root === 'string' &&
				typeof value.levelBelowRoot === 'number' &&
				Number.isFinite(value.levelBelowRoot) &&
				value.levelBelowRoot >= 1
			);
		case 'path-segment':
			return value.segmentSource === 'from-root' || value.segmentSource === 'current-folder';
		case 'path-regex':
			return typeof value.pattern === 'string';
		case 'inherit-property':
			return (
				typeof value.sourceProperty === 'string' &&
				(value.searchMode === 'parent' || value.searchMode === 'nearest')
			);
		case 'static':
			return 'value' in value;
		default:
			return false;
	}
}

function isFormat(value: unknown): value is FormatConfig {
	if (!isRecord(value) || typeof value.type !== 'string') return false;
	if (!isTransform(value.transform)) return false;
	switch (value.type) {
		case 'wikilink':
			return (
				(value.style === undefined || isLinkStyle(value.style)) &&
				(value.alias === undefined || typeof value.alias === 'string')
			);
		case 'text':
		case 'list':
			return value.delimiter === undefined || typeof value.delimiter === 'string';
		case 'tag':
		case 'boolean':
		case 'number':
			return true;
		default:
			return false;
	}
}

function isManagedState(value: unknown): value is ManagedState {
	if (!isRecord(value) || !isRecord(value.entries)) return false;
	return Object.values(value.entries).every((fileEntry) => {
		if (!isRecord(fileEntry)) return false;
		return Object.entries(fileEntry).every(
			([property, entry]) =>
				isRecord(entry) &&
				entry.property === property &&
				typeof entry.ruleId === 'string' &&
				typeof entry.valueHash === 'string',
		);
	});
}

function isWritePolicy(value: unknown): value is WritePolicy {
	return typeof value === 'string' && WRITE_POLICIES.has(value as WritePolicy);
}

function isOnNoMatch(value: unknown): value is OnNoMatch {
	return typeof value === 'string' && NO_MATCH_POLICIES.has(value as OnNoMatch);
}

function isLinkStyle(value: unknown): value is LinkStyle {
	return typeof value === 'string' && LINK_STYLES.has(value as LinkStyle);
}

function isSelfBehavior(value: unknown): boolean {
	return (
		value === undefined ||
		value === 'parent-folder-note' ||
		value === 'self' ||
		value === 'none'
	);
}

function isTransform(value: unknown): boolean {
	return (
		value === undefined ||
		value === 'none' ||
		value === 'lowercase' ||
		value === 'uppercase'
	);
}

function validDebounce(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function stringArray(value: unknown): string[] | null {
	return Array.isArray(value) && value.every((item) => typeof item === 'string')
		? value
		: null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
