export type WritePolicy = 'always' | 'empty-only' | 'managed';
export type OnNoMatch = 'ignore' | 'clear-managed';
export type LinkStyle = 'full-path' | 'obsidian-preference';
export type FolderNoteSelfBehavior = 'parent-folder-note' | 'self' | 'none';
export type TextTransform = 'none' | 'lowercase' | 'uppercase';

export interface ScopeConfig {
	include: string[];
	exclude: string[];
	minDepthBelowRoot?: number;
	markdownOnly: boolean;
}

interface FolderNoteResolverOptions {
	folderNoteSelfBehavior?: FolderNoteSelfBehavior;
}

export type ResolverConfig =
	| ({ type: 'parent-folder-note' } & FolderNoteResolverOptions)
	| ({ type: 'nearest-folder-note' } & FolderNoteResolverOptions)
	| ({
			type: 'ancestor-folder-note';
			root: string;
			levelBelowRoot: number;
		} & FolderNoteResolverOptions)
	| {
			type: 'path-segment';
			segmentSource: 'from-root' | 'current-folder';
			segmentIndex?: number;
		}
	| {
			type: 'path-regex';
			pattern: string;
			outputTemplate?: string;
		}
	| ({
			type: 'inherit-property';
			sourceProperty: string;
			searchMode: 'parent' | 'nearest';
		} & FolderNoteResolverOptions)
	| { type: 'static'; value: unknown };

export type ResolverType = ResolverConfig['type'];

export type FormatConfig =
	| {
			type: 'wikilink';
			style?: LinkStyle;
			alias?: string;
			transform?: TextTransform;
		}
	| { type: 'text'; transform?: TextTransform; delimiter?: string }
	| { type: 'list'; delimiter?: string; transform?: TextTransform }
	| { type: 'tag'; transform?: TextTransform }
	| { type: 'boolean' }
	| { type: 'number' };

export type FormatType = FormatConfig['type'];

export interface StructuralRule {
	id: string;
	name: string;
	enabled: boolean;
	priority: number;
	property: string;
	scope: ScopeConfig;
	resolver: ResolverConfig;
	format: FormatConfig;
	writePolicy?: WritePolicy;
	onNoMatch?: OnNoMatch;
}
