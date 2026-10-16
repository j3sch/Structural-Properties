import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Formatter } from '../src/domain/core/Formatter';
import type { ResolverContext, ResolverResult } from '../src/domain/resolvers';
import { MockVault, mockLinkGenerator } from './mocks';

function ctx(filePath = '01 Projects/Captzy/note.md'): ResolverContext {
	return {
		filePath,
		fileName: 'note.md',
		fileBasename: 'note',
		parentFolderPath: '01 Projects/Captzy',
		vault: new MockVault(),
		folderNotePatterns: [],
		linkGenerator: mockLinkGenerator,
	};
}

describe('Formatter', () => {
	const fmt = new Formatter(mockLinkGenerator);

	it('formats a file ref as a full-path wikilink', () => {
		const result: ResolverResult = {
			matched: true,
			targetFilePath: '01 Projects/Captzy/Captzy.md',
			resultType: 'file-ref',
		};
		assert.equal(
			fmt.format(result, { type: 'wikilink', style: 'full-path' }, ctx()),
			'[[01 Projects/Captzy/Captzy]]',
		);
	});

	it('formats a file ref with an alias', () => {
		const result: ResolverResult = {
			matched: true,
			targetFilePath: '01 Projects/Captzy/Captzy.md',
			resultType: 'file-ref',
		};
		assert.equal(
			fmt.format(result, { type: 'wikilink', style: 'full-path', alias: 'Project' }, ctx()),
			'[[01 Projects/Captzy/Captzy|Project]]',
		);
	});

	it('uses the link generator for obsidian-preference style', () => {
		const result: ResolverResult = {
			matched: true,
			targetFilePath: '01 Projects/Captzy/Captzy.md',
			resultType: 'file-ref',
		};
		const out = fmt.format(result, { type: 'wikilink', style: 'obsidian-preference' }, ctx());
		assert.equal(out, '[Captzy](01 Projects/Captzy/Captzy.md)');
	});

	it('coerces raw values to text with transform', () => {
		const result: ResolverResult = { matched: true, rawValue: 'Captzy', resultType: 'raw' };
		assert.equal(
			fmt.format(result, { type: 'text', transform: 'uppercase' }, ctx()),
			'CAPTZY',
		);
	});

	it('coerces raw values to boolean', () => {
		const r1: ResolverResult = { matched: true, rawValue: 'true', resultType: 'raw' };
		assert.equal(fmt.format(r1, { type: 'boolean' }, ctx()), true);
		const r2: ResolverResult = { matched: true, rawValue: 'no', resultType: 'raw' };
		assert.equal(fmt.format(r2, { type: 'boolean' }, ctx()), false);
	});

	it('coerces raw values to a list', () => {
		const r: ResolverResult = { matched: true, rawValue: 'a, b , c', resultType: 'raw' };
		assert.deepEqual(fmt.format(r, { type: 'list', delimiter: ',' }, ctx()), ['a', 'b', 'c']);
	});

	it('coerces raw values to a tag', () => {
		const r: ResolverResult = { matched: true, rawValue: 'project', resultType: 'raw' };
		assert.equal(fmt.format(r, { type: 'tag' }, ctx()), '#project');
	});

	it('preserves inherited value type', () => {
		const r: ResolverResult = { matched: true, inheritedValue: 42, resultType: 'inherited' };
		assert.equal(fmt.format(r, { type: 'text' }, ctx()), 42);
	});
});
