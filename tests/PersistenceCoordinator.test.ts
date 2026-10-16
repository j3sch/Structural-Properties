import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PersistenceCoordinator } from '../src/application/PersistenceCoordinator';
import type { PluginData } from '../src/domain/plugin-data';
import type { PluginDataStore } from '../src/ports/PluginDataStore';
import { defaultPluginData } from '../src/settings';

describe('PersistenceCoordinator', () => {
	it('serializes writes and lets the newest requested snapshot win', async () => {
		const data = defaultPluginData();
		const savedDelays: number[] = [];
		let active = 0;
		let maxActive = 0;
		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const dataStore: PluginDataStore = {
			load: async () => ({ data: defaultPluginData(), resetFromV2: false }),
			save: async (snapshot: PluginData) => {
				active++;
				maxActive = Math.max(maxActive, active);
				savedDelays.push(snapshot.settings.automation.debounceMs);
				if (savedDelays.length === 1) await firstGate;
				active--;
			},
		};
		const coordinator = new PersistenceCoordinator(dataStore, () => structuredClone(data));

		data.settings.automation.debounceMs = 100;
		const first = coordinator.requestSave();
		await Promise.resolve();
		data.settings.automation.debounceMs = 200;
		const second = coordinator.requestSave();
		releaseFirst?.();
		await Promise.all([first, second]);

		assert.equal(maxActive, 1);
		assert.deepEqual(savedDelays, [100, 200]);
	});
});
