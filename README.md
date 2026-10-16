# Structural Properties

An [Obsidian](https://obsidian.md) plugin that derives frontmatter properties
declaratively from file paths, folder hierarchy and folder notes. Instead of
hardcoding a vault structure, you configure **rules** such as:

> "If a file is in scope `01 Projects/**`, set the `project` property to the
> ancestor folder note one level below `01 Projects`."

The plugin can update notes automatically when they are created, moved, renamed,
or opened, and provides dry-run and refresh commands so you stay in control of
every write.

## How it works

1. **Scope** — A rule's scope decides which files it applies to (include/exclude
   globs, markdown-only filter, minimum folder depth).
2. **Resolver** — A resolver derives a value from the file's location, e.g. the
   parent folder note, an ancestor folder note, a path segment, a regex capture,
   a property inherited from a folder note, or a static value.
3. **Format** — The resolved value is turned into a YAML-compatible value
   (wikilink, text, list, tag, boolean or number).
4. **Write policy** — The diff engine decides whether to actually write, based on
   the policy and the plugin's managed-state tracking.

### Write policies

| Policy              | Behaviour                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `managed` (default) | Writes when the property is empty or still holds the value the plugin last set. Manual edits are detected as user overrides and left alone. |
| `always`            | Always overwrites when the value differs.                                                                                                   |
| `empty-only`        | Only writes when the property is missing or empty.                                                                                          |

When a rule no longer matches a file (e.g. it was moved out of scope), the
`on-no-match` policy decides what happens:

- `clear-managed` (default) — removes the property if the plugin still manages it.
- `ignore` — leaves the value untouched.

### Folder note detection

Folder notes are detected via configurable patterns using the placeholders
`{{folderPath}}` and `{{folderName}}`. Defaults cover the most common conventions:

- `{{folderPath}}/{{folderName}}.md` — a note inside the folder with the folder's name.
- `{{folderPath}}/index.md` — an `index.md` inside the folder.
- `{{folderPath}}.md` — a note sitting next to the folder with the folder's name.

The plugin is independent of any specific Folder Notes plugin.

### Link format

- `full-path` (default) — wikilinks with the full vault path, e.g.
  `[[01 Projects/Captzy/Captzy]]`.
- `obsidian-preference` — uses Obsidian's `generateMarkdownLink`, which respects
  your app link preferences.

## Commands

All commands appear in the command palette under **Structural Properties**:

- **Refresh current file**
- **Refresh current folder**
- **Refresh entire vault**
- **Dry run current folder**
- **Dry run entire vault**
- **Clean managed state**

Vault-wide writes should be reviewed with a dry run first.

## Automatic updates

Two global triggers control automatic processing:

- **Update after structural changes** processes Markdown notes after creation,
  moving, or renaming.
- **Update when opening a note** processes the active Markdown note, including
  the note restored when Obsidian starts.

Both triggers are enabled by default and share a configurable debounce delay of
750 ms. Disable both to use the plugin only through manual refresh commands.
Trigger settings never disable the manual commands.

## Settings

The settings tab provides:

- **Automatic updates** — structural-change and note-open triggers plus their
  shared debounce delay.
- **Defaults** — default write policy, on-no-match and link style.
- **Patterns** — global exclude patterns and folder-note patterns.
- **Rules** — enable/disable, edit, delete and add rules. Several **presets** are
  available to get started quickly.
- **Test path** — enter a sample vault path to preview which rules match and what
  values would be written.
- **Managed state** — shows how many files are currently tracked and lets you
  prune stale entries.

Settings use Obsidian's declarative settings API, including global settings
search, inline validation and mobile-friendly rule and pattern lists.

## Resolvers

| Resolver               | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `parent-folder-note`   | The folder note of the containing folder.                         |
| `ancestor-folder-note` | The folder note at a configured level below a root folder.        |
| `nearest-folder-note`  | The first folder note found walking up the hierarchy.             |
| `path-segment`         | A path segment (current folder name or an index from the root).   |
| `path-regex`           | Regex captures applied to the file path, with an output template. |
| `inherit-property`     | A property copied from a folder note (parent or nearest).         |
| `static`               | A fixed value.                                                    |

## Privacy

The plugin is fully local and offline. It reads and writes only frontmatter
inside your vault, stores its configuration and managed state in
`.obsidian/plugins/structural-properties/data.json`, and makes no network requests.

## Development

```bash
npm install
npm run dev      # watch build
npm run build    # production build (type-check + bundle)
npm run lint     # eslint
npm test         # unit tests (Node test runner + jiti)
```

Release artifacts are `main.js`, `manifest.json` and `styles.css`. Copy them into
`<Vault>/.obsidian/plugins/structural-properties/`, reload Obsidian and enable the
plugin under **Settings → Community plugins**.

> Requires Obsidian 1.13.0+ (declarative settings and `processFrontMatter`).

Version 3 uses a new canonical settings schema. Existing version 2 configuration,
rules, and managed state are intentionally discarded and immediately replaced
with version 3 defaults when the plugin first loads. A one-time notice reports
that reset. Back up `data.json` before upgrading if you want to reference the old
rule definitions while configuring version 3.

## API documentation

See <https://docs.obsidian.md>.
