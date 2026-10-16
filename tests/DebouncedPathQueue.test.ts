import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	DebouncedPathQueue,
	type TimeoutScheduler,
} from '../src/application/DebouncedPathQueue';

class FakeScheduler implements TimeoutScheduler {
	callback: (() => void) | null = null;
	delay = -1;
	cleared = false;

	set(callback: () => void, delayMs: number): number {
		this.callback = callback;
		this.delay = delayMs;
		return 1;
	}

	clear(): void {
		this.cleared = true;
		this.callback = null;
	}

	flush(): void {
		const callback = this.callback;
		this.callback = null;
		callback?.();
	}
}

describe('DebouncedPathQueue', () => {
	it('deduplicates paths into one delayed batch', async () => {
		const scheduler = new FakeScheduler();
		const batches: string[][] = [];
		const queue = new DebouncedPathQueue(
			async (paths) => void batches.push(paths),
			() => 250,
			scheduler,
		);
		queue.enqueue('a.md');
		queue.enqueue('a.md');
		queue.enqueue('b.md');
		assert.equal(scheduler.delay, 250);
		scheduler.flush();
		await Promise.resolve();
		assert.deepEqual(batches, [['a.md', 'b.md']]);
	});

	it('cancels pending work when stopped', () => {
		const scheduler = new FakeScheduler();
		const queue = new DebouncedPathQueue(async () => undefined, () => 1, scheduler);
		queue.enqueue('a.md');
		queue.stop();
		assert.equal(scheduler.cleared, true);
		queue.enqueue('late.md');
		assert.equal(scheduler.callback, null);
	});
});
