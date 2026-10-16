import type {
	FileRef,
	FolderRef,
	VaultAccess,
} from '../src/ports/VaultAccess';
import type { LinkGenerator } from '../src/ports/LinkGenerator';
import type { LinkStyle } from '../src/domain/rules';

/**
 * In-memory implementation of {@link VaultAccess} for unit tests.
 */
export class MockVault implements VaultAccess {
	private files = new Set<string>();
	private folders = new Set<string>();
	private frontmatter = new Map<string, Record<string, unknown>>();

	constructor(
		opts: {
			files?: string[];
			folders?: string[];
			frontmatter?: Record<string, Record<string, unknown>>;
		} = {},
	) {
		for (const f of opts.files ?? []) this.files.add(f);
		for (const f of opts.folders ?? []) this.folders.add(f);
		if (opts.frontmatter) {
			for (const [path, fm] of Object.entries(opts.frontmatter)) {
				this.frontmatter.set(path, fm);
			}
		}
	}

	fileExists(path: string): boolean {
		return this.files.has(path) || this.folders.has(path);
	}

	getFileByPath(path: string): FileRef | null {
		if (!this.files.has(path)) return null;
		const base = path.split('/').pop() ?? path;
		const dot = base.lastIndexOf('.');
		const ext = dot > 0 ? base.slice(dot + 1) : '';
		return { path, basename: base, extension: ext };
	}

	getFolderByPath(path: string): FolderRef | null {
		if (!this.folders.has(path)) return null;
		return { path, name: path.split('/').pop() ?? path };
	}

	async readFrontmatter(
		path: string,
	): Promise<Record<string, unknown> | null> {
		return this.frontmatter.get(path) ?? null;
	}

	getAllMarkdownFilePaths(): string[] {
		return [...this.files].filter((f) => f.endsWith('.md'));
	}
}

/** A link generator that mimics the full-path/obsidian-preference behaviour. */
export const mockLinkGenerator: LinkGenerator = {
	generateLink: (
		targetPath: string,
		_sourcePath: string,
		style: LinkStyle,
		alias?: string,
	): string => {
		if (style === 'obsidian-preference') {
			const name = targetPath.split('/').pop()?.replace(/\.md$/i, '') ?? targetPath;
			return alias ? `[${alias}](${targetPath})` : `[${name}](${targetPath})`;
		}
		const linkPath = targetPath.replace(/\.md$/i, '');
		return alias ? `[[${linkPath}|${alias}]]` : `[[${linkPath}]]`;
	},
};
