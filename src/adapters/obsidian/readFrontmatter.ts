import { getFrontMatterInfo, parseYaml, type App, type TFile } from 'obsidian';
import type { FrontmatterSnapshot } from '../../domain/changes';

/** Read authoritative frontmatter from file content instead of the metadata cache. */
export async function readFrontmatterFromFile(
	app: App,
	file: TFile,
): Promise<FrontmatterSnapshot> {
	const content = await app.vault.cachedRead(file);
	const info = getFrontMatterInfo(content);
	if (!info.exists) return {};
	if (info.frontmatter.trim() === '') return {};

	let parsed: unknown;
	try {
		parsed = parseYaml(info.frontmatter);
	} catch {
		throw new Error(`Invalid YAML frontmatter in "${file.path}".`);
	}
	if (!isRecord(parsed)) {
		throw new Error(`Frontmatter in "${file.path}" must be a YAML object.`);
	}
	return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
