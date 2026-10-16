import type { LinkStyle } from '../domain/rules';

export interface LinkGenerator {
	resolveLink(value: string, sourcePath: string): string | null;
	generateLink(
		targetPath: string,
		sourcePath: string,
		style: LinkStyle,
		alias?: string,
	): string;
}
