import type { PluginSettings } from '../plugin-data';
import type { ScopeConfig } from '../rules';
import { compileGlob } from '../../utils/glob';
import { getPathSegments } from '../../utils/path';

/**
 * Decides whether a given file path falls within a rule's scope.
 *
 * Checks (in order): markdown-only filter, exclude globs (rule + defaults),
 * include globs, and minimum folder depth below the vault root.
 */
export class ScopeMatcher {
	static matches(
		filePath: string,
		scope: ScopeConfig,
		defaultExcludes: string[],
	): boolean {
		// markdownOnly
		if (scope.markdownOnly && !filePath.toLowerCase().endsWith('.md')) {
			return false;
		}

		// excludes (rule-specific + global defaults)
		for (const pat of scope.exclude) {
			if (compileGlob(pat).test(filePath)) return false;
		}
		for (const pat of defaultExcludes) {
			if (compileGlob(pat).test(filePath)) return false;
		}

		// includes (empty include = match everything that passed the filters)
		if (scope.include.length > 0) {
			let included = false;
			for (const pat of scope.include) {
				if (compileGlob(pat).test(filePath)) {
					included = true;
					break;
				}
			}
			if (!included) return false;
		}

		// minimum folder depth below vault root
		if (scope.minDepthBelowRoot !== undefined && scope.minDepthBelowRoot > 0) {
			const segs = getPathSegments(filePath);
			const depth = segs.length - 1; // folders above the file
			if (depth < scope.minDepthBelowRoot) return false;
		}

		return true;
	}

	/** Convenience wrapper using a full settings object. */
	static matchesSettings(
		filePath: string,
		scope: ScopeConfig,
		settings: PluginSettings,
	): boolean {
		return ScopeMatcher.matches(filePath, scope, settings.excludePatterns);
	}
}
