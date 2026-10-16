import type { FrontmatterSnapshot, PlannedChange } from '../changes';
import type { ManagedStateReader } from '../managed-state';
import type { ResolverContext } from '../resolvers';
import type { PluginSettings } from '../plugin-data';
import type { LinkGenerator } from '../../ports/LinkGenerator';
import type { VaultAccess } from '../../ports/VaultAccess';
import { ScopeMatcher } from './ScopeMatcher';
import { ResolverRegistry } from './ResolverRegistry';
import { Formatter } from './Formatter';
import { DiffEngine } from './DiffEngine';
import {
	getBaseName,
	getFileName,
	getParentFolderPath,
} from '../../utils/path';

/**
 * The RuleEngine ties everything together: for a given file it determines
 * which rules apply (scope + priority ownership), resolves each rule's value,
 * formats it, and runs it through the DiffEngine to produce planned changes.
 *
 * The engine has no side effects; applying the planned changes is the job of
 * the FrontmatterWriter.
 */
export class RuleEngine {
	constructor(
		private registry: ResolverRegistry,
		private formatter: Formatter,
		private diffEngine: DiffEngine,
	) {}

	async planForFile(
		filePath: string,
		currentFrontmatter: FrontmatterSnapshot,
		settings: PluginSettings,
		managedState: ManagedStateReader,
		vault: VaultAccess,
		linkGenerator: LinkGenerator,
	): Promise<PlannedChange[]> {
		const ctx: ResolverContext = {
			filePath,
			fileName: getBaseName(filePath),
			fileBasename: getFileName(filePath),
			parentFolderPath: getParentFolderPath(filePath),
			vault,
			folderNotePatterns: settings.folderNotePatterns,
			linkGenerator,
		};

		// Highest priority first; one rule owns each property.
		const sortedRules = [...settings.rules]
			.filter((r) => r.enabled)
			.sort((a, b) => b.priority - a.priority);

		const claimed = new Set<string>();
		const changes: PlannedChange[] = [];

		for (const rule of sortedRules) {
			if (claimed.has(rule.property)) continue;
			if (
				!ScopeMatcher.matches(
					filePath,
					rule.scope,
					settings.excludePatterns,
				)
			) {
				continue;
			}
			claimed.add(rule.property);

			const result = await this.registry.resolve(rule.resolver, ctx);
			const format =
				rule.format.type === 'wikilink' && rule.format.style === undefined
					? { ...rule.format, style: settings.defaults.linkStyle }
					: rule.format;
			const formatted = this.formatter.format(result, format, ctx);

			const writePolicy = rule.writePolicy ?? settings.defaults.writePolicy;
			const onNoMatch = rule.onNoMatch ?? settings.defaults.onNoMatch;
			const oldValue = currentFrontmatter[rule.property];
			const managed = managedState.getEntry(filePath, rule.property);

			const change = this.diffEngine.compute({
				filePath,
				property: rule.property,
				ruleId: rule.id,
				ruleName: rule.name,
				result,
				formatted,
				oldValue,
				writePolicy,
				onNoMatch,
				managed,
			});

			changes.push(change);
		}

		// Stale cleanup: managed properties whose owning rule no longer covers
		// this file (e.g. the file was moved out of the rule's scope). The
		// owning rule's onNoMatch policy decides whether to clear the value.
		const allRules = settings.rules;
		for (const property of managedState.getPropertiesForFile(filePath)) {
			if (claimed.has(property)) continue;
			const entry = managedState.getEntry(filePath, property);
			if (!entry) continue;
			const ownerRule = allRules.find((r) => r.id === entry.ruleId);
			if (!ownerRule || !ownerRule.enabled) continue;

			const onNoMatch = ownerRule.onNoMatch ?? settings.defaults.onNoMatch;
			const oldValue = currentFrontmatter[property];
			const change = this.diffEngine.compute({
				filePath,
				property,
				ruleId: ownerRule.id,
				ruleName: ownerRule.name,
				result: { matched: false, resultType: 'raw' },
				formatted: undefined,
				oldValue,
				writePolicy: ownerRule.writePolicy ?? settings.defaults.writePolicy,
				onNoMatch,
				managed: entry,
			});
			if (change.action !== 'skip') {
				changes.push(change);
			}
			claimed.add(property);
		}

		return changes;
	}
}
