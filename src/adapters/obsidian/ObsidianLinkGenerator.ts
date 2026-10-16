import { App, TFile } from 'obsidian';
import type { LinkStyle } from '../../domain/rules';
import { parseNoteLink } from '../../utils/noteLink';
import type { LinkGenerator } from '../../ports/LinkGenerator';

export class ObsidianLinkGenerator implements LinkGenerator {
	constructor(private app: App) {}

	resolveLink(value: string, sourcePath: string): string | null {
		const parsed = parseNoteLink(value);
		if (!parsed) return null;
		return this.app.metadataCache.getFirstLinkpathDest(parsed.path, sourcePath)?.path ?? null;
	}

	generateLink(
		targetPath: string,
		sourcePath: string,
		style: LinkStyle,
		alias?: string,
	): string {
		const target = this.app.vault.getAbstractFileByPath(targetPath);
		if (style === 'obsidian-preference' && target instanceof TFile) {
			return this.app.fileManager.generateMarkdownLink(target, sourcePath, undefined, alias);
		}
		const path = targetPath.replace(/\.md$/i, '');
		return alias ? `[[${path}|${alias}]]` : `[[${path}]]`;
	}
}
