import type { VaultAccess } from '../ports/VaultAccess';
import type { ManagedStateStore } from '../domain/ManagedStateStore';

export class MaintenanceService {
	constructor(
		private vault: VaultAccess,
		private managedState: ManagedStateStore,
		private persist: () => Promise<void>,
	) {}

	async pruneManagedState(): Promise<number> {
		const existing = new Set(this.vault.getAllMarkdownFilePaths());
		const removed = this.managedState.prune(existing);
		if (removed > 0) await this.persist();
		return removed;
	}

	getManagedFileCount(): number {
		return this.managedState.size;
	}
}
