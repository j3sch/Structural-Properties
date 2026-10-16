import { Plugin, TAbstractFile, TFile, TFolder, Vault } from 'obsidian';
import type { AutomaticUpdateService } from '../../application/AutomaticUpdateService';
import { isActiveMarkdownFileRef, isMarkdownFileRef } from './eventFilters';

export class EventController {
	private started = false;

	constructor(
		private plugin: Plugin,
		private automaticUpdates: AutomaticUpdateService,
	) {}

	start(): void {
		if (this.started) return;
		this.started = true;
		this.plugin.app.workspace.onLayoutReady(() => {
			if (!this.started) return;
			this.registerEvents();
			this.handleFileOpen(this.plugin.app.workspace.getActiveFile());
		});
	}

	stop(): void {
		this.automaticUpdates.stop();
		this.started = false;
	}

	private registerEvents(): void {
		this.plugin.registerEvent(
			this.plugin.app.vault.on('create', (file: TAbstractFile) => {
				if (file instanceof TFile && isMarkdownFileRef(file)) {
					this.automaticUpdates.handleCreated(file.path);
				}
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.vault.on('rename', (file, oldPath) => this.handleRename(file, oldPath)),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('file-open', (file) => this.handleFileOpen(file)),
		);
	}

	private handleRename(file: TAbstractFile, oldPath: string): void {
		if (file instanceof TFile) {
			this.automaticUpdates.handleFileRenamed(
				oldPath,
				file.path,
				isMarkdownFileRef(file),
			);
			return;
		}
		if (file instanceof TFolder) {
			const markdownPaths: string[] = [];
			Vault.recurseChildren(file, (child) => {
				if (child instanceof TFile && isMarkdownFileRef(child)) {
					markdownPaths.push(child.path);
				}
			});
			this.automaticUpdates.handleFolderRenamed(oldPath, file.path, markdownPaths);
		}
	}

	private handleFileOpen(file: TFile | null): void {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!isActiveMarkdownFileRef(file, activeFile)) return;
		this.automaticUpdates.handleOpened(file.path);
	}
}
