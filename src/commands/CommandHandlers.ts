import { App, MarkdownView, Notice, TFile } from 'obsidian';
import type { ProcessorResult } from '../domain/changes';
import type { PluginServices } from '../application/PluginServices';
import { DryRunModal } from '../ui/DryRunModal';

export class CommandHandlers {
	constructor(
		private app: App,
		private services: PluginServices,
	) {}

	async refreshCurrentFile(): Promise<void> {
		const file = this.getActiveFile();
		if (!file) return this.notice('no active file');
		this.reportResult(await this.processPaths([file.path]), 'current file');
	}

	async refreshCurrentFolder(): Promise<void> {
		const file = this.getActiveFile();
		if (!file?.parent) return this.notice('no active file to determine a folder');
		const paths = this.services.processing.getProcessableFilePathsInFolder(file.parent.path);
		if (paths.length === 0) return this.notice('no processable files in this folder');
		new Notice(`Structural properties: refreshing ${paths.length} file(s)…`);
		this.reportResult(await this.processPaths(paths), 'folder');
	}

	async refreshEntireVault(): Promise<void> {
		const paths = this.services.processing.getProcessableFilePaths();
		if (paths.length === 0) return this.notice('no processable files found');
		new Notice(`Structural properties: refreshing ${paths.length} file(s)…`);
		this.reportResult(await this.processPaths(paths), 'vault');
	}

	async dryRunCurrentFolder(): Promise<void> {
		const file = this.getActiveFile();
		if (!file?.parent) return this.notice('no active file to determine a folder');
		await this.runDryRun(
			this.services.processing.getProcessableFilePathsInFolder(file.parent.path),
		);
	}

	async dryRunEntireVault(): Promise<void> {
		await this.runDryRun(this.services.processing.getProcessableFilePaths());
	}

	async cleanManagedState(): Promise<void> {
		const removed = await this.services.maintenance.pruneManagedState();
		new Notice(
			`Structural properties: pruned ${removed} stale managed-state entr${removed === 1 ? 'y' : 'ies'}`,
		);
	}

	async processPaths(paths: string[]): Promise<ProcessorResult> {
		return this.services.processing.processPaths(paths);
	}

	private getActiveFile(): TFile | null {
		return (
			this.app.workspace.getActiveViewOfType(MarkdownView)?.file ??
			this.app.workspace.getActiveFile()
		);
	}

	private async runDryRun(paths: string[]): Promise<void> {
		if (paths.length === 0) return this.notice('no processable files found');
		new Notice(`Structural properties: planning for ${paths.length} file(s)…`);
		const changes = await this.services.processing.planPaths(paths);
		const actionablePaths = [
			...new Set(
				changes
					.filter((change) => change.action === 'set' || change.action === 'clear')
					.map((change) => change.filePath),
			),
		];
		new DryRunModal(this.app, changes, async () => {
			this.reportResult(await this.processPaths(actionablePaths), 'dry run apply');
		}).open();
	}

	private reportResult(result: ProcessorResult, scope: string): void {
		if (result.errors > 0) {
			new Notice(
				`Structural properties (${scope}): ${result.applied} applied, ${result.errors} error(s)`,
				6000,
			);
		} else if (result.applied === 0) {
			new Notice(`Structural properties (${scope}): nothing to change`);
		} else {
			new Notice(`Structural properties (${scope}): ${result.applied} change(s) applied`);
		}
	}

	private notice(message: string): void {
		new Notice(`Structural properties: ${message}`);
	}
}
