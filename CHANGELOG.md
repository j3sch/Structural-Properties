# Changelog

## 3.0.0

- Added global automatic-update triggers for structural changes and opening notes.
- Added startup processing for the restored active Markdown note.
- Introduced canonical schema v3 with separate settings and managed state.
- Added serialized persistence, content-based frontmatter reads, and compare-and-set writes.
- Existing schema v2 data is fully reset to v3 defaults; rules, settings, and managed state are not migrated.

## 2.0.0

- Introduced declarative rules, managed-state tracking, dry runs, and schema v2.
