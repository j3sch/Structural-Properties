import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isActiveMarkdownFileRef } from '../src/adapters/obsidian/eventFilters';

describe('file-open filtering', () => {
	it('accepts only the active Markdown file', () => {
		assert.equal(isActiveMarkdownFileRef(null, null), false);
		assert.equal(
			isActiveMarkdownFileRef({ path: 'image.png', extension: 'png' }, { path: 'image.png' }),
			false,
		);
		assert.equal(
			isActiveMarkdownFileRef({ path: 'embed.md', extension: 'md' }, { path: 'active.md' }),
			false,
		);
		assert.equal(
			isActiveMarkdownFileRef({ path: 'active.md', extension: 'md' }, { path: 'active.md' }),
			true,
		);
	});
});
