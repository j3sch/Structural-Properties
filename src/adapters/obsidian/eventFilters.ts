export interface FileEventRef {
	path: string;
	extension: string;
}

export function isMarkdownFileRef(file: FileEventRef | null): file is FileEventRef {
	return file !== null && file.extension.toLowerCase() === 'md';
}

export function isActiveMarkdownFileRef(
	file: FileEventRef | null,
	activeFile: Pick<FileEventRef, 'path'> | null,
): file is FileEventRef {
	return isMarkdownFileRef(file) && activeFile?.path === file.path;
}
