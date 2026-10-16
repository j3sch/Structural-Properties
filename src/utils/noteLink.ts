import { getFileName } from './path';

/** Parse a single property link; leave surrounding prose and compound values alone. */
export function parseNoteLink(value: string): { path: string; presentation: string } | null {
	const wiki = value.match(/^\[\[([^|#]*)([^]*?)\]\]$/);
	if (wiki) return { path: wiki[1]!, presentation: `wiki:${wiki[2]}` };
	const markdown = value.match(/^\[([^\]]*)\]\(([^]*)\)$/);
	if (!markdown) return null;
	const target = markdown[2]!;
	const anchor = target.indexOf('#');
	try {
		return {
			path: decodeURI(anchor < 0 ? target : target.slice(0, anchor)),
			presentation: `markdown:${markdown[1]}:${anchor < 0 ? '' : target.slice(anchor)}`,
		};
	} catch { return null; }
}

export function sameLinkPresentation(previous: string, current: string): boolean {
	const before = parseNoteLink(previous);
	const after = parseNoteLink(current);
	if (!before || !after) return false;
	if (before.presentation === after.presentation) return true;
	// Obsidian may update the generated Markdown label along with the filename.
	return before.presentation === `markdown:${getFileName(before.path)}:` &&
		after.presentation === `markdown:${getFileName(after.path)}:`;
}

export function renamedPath(path: string, oldPath: string, newPath: string): string {
	if (path === oldPath) return newPath;
	return path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : path;
}

/** Conservative recovery for older hash-only entries after a known rename. */
export function undoLinkRename(value: string, oldPath: string, newPath: string): string {
	const parsed = parseNoteLink(value);
	if (!parsed) return value;
	const extension = parsed.path.toLowerCase().endsWith('.md') ? '.md' : '';
	const oldLink = oldPath.replace(/\.md$/i, '');
	const newLink = newPath.replace(/\.md$/i, '');
	let previous = renamedPath(parsed.path.replace(/\.md$/i, ''), newLink, oldLink) + extension;
	if (previous === parsed.path && !parsed.path.includes('/') && newPath.endsWith('.md') &&
		parsed.path.replace(/\.md$/i, '') === getFileName(newPath)) {
		previous = getFileName(oldPath) + extension;
	}
	if (previous === parsed.path) return value;
	if (value.startsWith('[[')) return `[[${previous}${value.slice(2 + parsed.path.length)}`;
	const open = value.indexOf('](') + 2;
	const rawTarget = value.slice(open, -1);
	const anchor = rawTarget.indexOf('#');
	return value.slice(0, open) + encodeURI(previous) + (anchor < 0 ? '' : rawTarget.slice(anchor)) + ')';
}
