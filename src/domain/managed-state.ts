import type { LinkGenerator } from '../ports/LinkGenerator';

export interface ManagedEntry {
	ruleId: string;
	property: string;
	valueHash: string;
	/** Last accepted link text and its target, independent of the source path. */
	link?: { value: string; targetPath: string; rewriteExpected?: boolean };
}

export interface ManagedFileEntry {
	[property: string]: ManagedEntry;
}

export interface ManagedState {
	entries: Record<string, ManagedFileEntry>;
}

export interface ManagedStateReader {
	matchesValue(filePath: string, property: string, value: unknown, links: LinkGenerator): boolean;
	getEntry(filePath: string, property: string): ManagedEntry | null;
	getPropertiesForFile(filePath: string): string[];
}

export interface ManagedStateWriter {
	recordWrite(
		filePath: string,
		property: string,
		ruleId: string,
		valueHash: string,
		link?: ManagedEntry['link'],
	): void;
	recordClear(filePath: string, property: string): void;
}
