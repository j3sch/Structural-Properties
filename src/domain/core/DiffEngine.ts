import type { DiffInput, PlannedChange } from '../changes';
import type { ManagedEntry } from '../managed-state';
import type { ResolverResult } from '../resolvers';
import { hashValue, isEmptyValue, valuesEqual } from '../../utils/hash';

/**
 * Computes the planned action for a single rule/file/property combination,
 * taking the write policy, the resolver outcome, and the managed-state entry
 * into account.
 *
 * The DiffEngine never mutates state; it only describes what should happen.
 * Recording/clearing managed hashes is the responsibility of the writer.
 */
export class DiffEngine {
	compute(input: DiffInput): PlannedChange {
		const {
			filePath,
			property,
			ruleId,
			ruleName,
			result,
			formatted,
			oldValue,
			writePolicy,
			onNoMatch,
			managed,
		} = input;

		const base: PlannedChange = {
			filePath,
			property,
			ruleId,
			ruleName,
			action: 'skip',
			oldValue,
			newValue: formatted,
			writePolicy,
			onNoMatch,
			conflict: 'none',
			reason: '',
			...(input.linkTargetPath ? { linkTargetPath: input.linkTargetPath } : {}),
		};

		if (result.matched) {
			return this.computeMatch(base, formatted, oldValue, writePolicy, managed, input.managedMatches);
		}
		return this.computeNoMatch(base, oldValue, onNoMatch, managed, input.managedMatches);
	}

	private computeMatch(
		base: PlannedChange,
		newValue: unknown,
		oldValue: unknown,
		writePolicy: DiffInput['writePolicy'],
		managed: ManagedEntry | null,
		managedMatches = !!managed && hashValue(oldValue) === managed.valueHash,
	): PlannedChange {
		if (writePolicy === 'always') {
			if (valuesEqual(oldValue, newValue)) {
				const tracked = managed?.ruleId === base.ruleId && managed.valueHash === hashValue(oldValue) &&
					(!base.linkTargetPath || (managed.link?.targetPath === base.linkTargetPath && managed.link.value === oldValue && !managed.link.rewriteExpected));
				return { ...base, action: tracked ? 'skip' : 'track', reason: tracked ? 'Already up to date' : 'Register current value (always)' };
			}
			return { ...base, action: 'set', reason: 'Value differs (always)' };
		}

		if (writePolicy === 'empty-only') {
			if (isEmptyValue(oldValue)) {
				return { ...base, action: 'set', reason: 'Property empty (empty-only)' };
			}
			return {
				...base,
				action: 'skip',
				reason: 'Property already set (empty-only)',
			};
		}

		// managed
		if (isEmptyValue(oldValue)) {
			return { ...base, action: 'set', reason: 'Property empty (managed)' };
		}

		if (managed && managedMatches) {
			if (valuesEqual(oldValue, newValue)) {
				const tracked = managed.ruleId === base.ruleId && managed.valueHash === hashValue(oldValue) &&
					(!base.linkTargetPath || (managed.link?.targetPath === base.linkTargetPath && managed.link.value === oldValue && !managed.link.rewriteExpected));
				return { ...base, action: tracked ? 'skip' : 'track', reason: 'Already up to date (managed)' };
			}
			return { ...base, action: 'set', reason: 'Managed value updated' };
		}

		return {
			...base,
			action: 'skip',
			conflict: 'user-override',
			reason: 'User override detected (managed)',
		};
	}

	private computeNoMatch(
		base: PlannedChange,
		oldValue: unknown,
		onNoMatch: DiffInput['onNoMatch'],
		managed: ManagedEntry | null,
		managedMatches = !!managed && hashValue(oldValue) === managed.valueHash,
	): PlannedChange {
		if (onNoMatch === 'ignore') {
			return {
				...base,
				action: 'skip',
				conflict: 'no-match',
				reason: 'No match (ignore)',
			};
		}

		// clear-managed: only remove a value we previously managed
		if (managed && managedMatches) {
			return {
				...base,
				action: 'clear',
				reason: 'No match, clearing managed value',
			};
		}

		return {
			...base,
			action: 'skip',
			conflict: 'no-match',
			reason: 'No match, value not managed',
		};
	}

	/** Build a no-op "skip" change (used for display purposes). */
	static skipFromResult(
		filePath: string,
		property: string,
		ruleId: string,
		ruleName: string,
		result: ResolverResult,
	): PlannedChange {
		return {
			filePath,
			property,
			ruleId,
			ruleName,
			action: 'skip',
			oldValue: undefined,
			newValue: undefined,
			writePolicy: 'managed',
			onNoMatch: 'ignore',
			conflict: result.matched ? 'none' : 'no-match',
			reason: result.matched ? 'No change' : 'No match',
		};
	}
}
