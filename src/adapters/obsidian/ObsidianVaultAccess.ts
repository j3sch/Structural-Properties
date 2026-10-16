import { App, TFile, TFolder } from 'obsidian';
import type { FileRef, FolderRef, VaultAccess } from '../../ports/VaultAccess';
import { readFrontmatterFromFile } from './readFrontmatter';

export class ObsidianVaultAccess implements VaultAccess {
	constructor(private app: App) {}

	getFileByPath(path: string): FileRef | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		return { path: file.path, basename: file.basename, extension: file.extension };
	}

	getFolderByPath(path: string): FolderRef | null {
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!(folder instanceof TFolder)) return null;
		return { path: folder.path, name: folder.name };
	}

	fileExists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) instanceof TFile;
	}

	async readFrontmatter(path: string): Promise<Record<string, unknown> | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		return readFrontmatterFromFile(this.app, file);
	}

	getAllMarkdownFilePaths(): string[] {
		return this.app.vault.getMarkdownFiles().map((file) => file.path);
	}
}
