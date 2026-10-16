import type { ManagedEntry } from './managed-state';
import type { OnNoMatch, WritePolicy } from './rules';
import type { ResolverResult } from './resolvers';

export type PlannedAction = 'set' | 'clear' | 'track' | 'skip';
export type ConflictStatus = 'none' | 'user-override' | 'no-match';

export interface FrontmatterSnapshot {
	[property: string]: unknown;
}

export interface PlannedChange {
	filePath: string;
	property: string;
	ruleId: string;
	ruleName: string;
	action: PlannedAction;
	oldValue: unknown;
	newValue: unknown;
	writePolicy: WritePolicy;
	onNoMatch: OnNoMatch;
	conflict: ConflictStatus;
	reason: string;
	linkTargetPath?: string;
}

export interface DiffInput {
	filePath: string;
	property: string;
	ruleId: string;
	ruleName: string;
	result: ResolverResult;
	formatted: unknown;
	oldValue: unknown;
	writePolicy: WritePolicy;
	onNoMatch: OnNoMatch;
	managed: ManagedEntry | null;
	managedMatches?: boolean;
	linkTargetPath?: string;
}

export interface ChangePreview {
	changes: PlannedChange[];
	settingsFingerprint: string;
	revision: number;
	errors: number;
}

export interface ProcessorResult {
	applied: number;
	skipped: number;
	errors: number;
	tracked?: number;
	stale?: boolean;
}
