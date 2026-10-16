export interface TimeoutScheduler {
	set(callback: () => void, delayMs: number): number;
	clear(id: number): void;
}

export class DebouncedPathQueue {
	private paths = new Set<string>();
	private timer: number | null = null;
	private processing = false;
	private stopped = false;

	constructor(
		private process: (paths: string[]) => Promise<void>,
		private getDelayMs: () => number,
		private scheduler: TimeoutScheduler,
	) {}

	enqueue(path: string): void {
		if (this.stopped) return;
		this.paths.add(path);
		this.schedule();
	}

	stop(): void {
		this.stopped = true;
		if (this.timer !== null) this.scheduler.clear(this.timer);
		this.timer = null;
		this.paths.clear();
	}

	private schedule(): void {
		if (this.timer !== null) return;
		this.timer = this.scheduler.set(() => {
			this.timer = null;
			void this.flush();
		}, Math.max(0, this.getDelayMs()));
	}

	private async flush(): Promise<void> {
		if (this.processing) return;
		this.processing = true;
		const paths = [...this.paths];
		this.paths.clear();
		try {
			await this.process(paths);
		} finally {
			this.processing = false;
			if (this.paths.size > 0) this.schedule();
		}
	}
}
