import type { PluginData } from '../domain/plugin-data';
import type { PluginDataStore } from '../ports/PluginDataStore';

/** Serializes and coalesces save requests while always reading a fresh snapshot. */
export class PersistenceCoordinator {
	private requested = false;
	private running: Promise<void> | null = null;

	constructor(
		private dataStore: PluginDataStore,
		private getSnapshot: () => PluginData,
	) {}

	requestSave(): Promise<void> {
		this.requested = true;
		this.running ??= Promise.resolve().then(() => this.drain());
		return this.running;
	}

	private async drain(): Promise<void> {
		try {
			while (this.requested) {
				this.requested = false;
				await this.dataStore.save(this.getSnapshot());
			}
		} finally {
			this.running = null;
		}
	}
}
