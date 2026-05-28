# Contributing to Whisker

Thanks for your interest in contributing to **Whisker**! This guide covers the basics.

## Development setup

```bash
git clone https://github.com/pipecat-ai/whisker.git
cd whisker/pipecat
uv sync --group dev
```

The Python package lives in `pipecat/`. The UI lives in `ui/`:

```bash
cd ui
npm install
npm run dev
```

## Workflow

1. **Fork** the repository.
2. **Branch** off `main`: `git checkout -b your-branch-name`.
3. **Make your changes**.
4. **Add a changelog entry** (see below) — every user-facing change needs one.
5. **Test** the Python side (`uv run ruff check . && uv run ruff format`) and rebuild the UI (`npm run build` from `ui/`).
6. **Commit** with a clear message.
7. **Push** and **open a PR** against `main`.

## Changelog entries

We use [towncrier](https://towncrier.readthedocs.io/) with per-PR fragment files so changelog updates don't cause merge conflicts. The release workflow (`.github/workflows/generate-changelog.yml`) assembles them into `CHANGELOG.md` at release time.

### Creating a fragment

Drop a new file in the `changelog/` directory at the repo root, named:

```
<PR_number>.<type>.md
```

Valid types:

- `added.md` — new features
- `changed.md` — changes in existing functionality
- `deprecated.md` — soon-to-be-removed features
- `removed.md` — removed features
- `fixed.md` — bug fixes
- `performance.md` — performance improvements
- `security.md` — security fixes
- `other.md` — other notable changes (dependencies, docs that ship to users, ...)

Write the entry as a Markdown bullet (start with `-`):

`changelog/42.added.md`:

```markdown
- Added `WhiskerHTTPSink` for streaming events to an HTTP webhook.
```

`changelog/42.fixed.md`:

```markdown
- Fixed a race where the snapshot was sent before observers had a chance to register.
```

### Multiple entries in one PR

- **Different types**: separate files — `42.added.md`, `42.fixed.md`.
- **Multiple entries of the same type**: numbered — `42.added.md`, `42.added.2.md`, `42.added.3.md`.
- **Related changes**: nested bullets inside one fragment:

  ```markdown
  - Updated `WhiskerServer` constructor:
    - `batch_size` now accepts bytes only (was sometimes interpreted as messages).
    - `file_name` is keyword-only.
  ```

### Breaking changes

Prefix the bullet with ⚠️:

```markdown
- ⚠️ Renamed `WhiskerServer.create_observer(task=...)` to `create_observer(worker=...)`.
```

### Preview locally

```bash
cd pipecat
uv run towncrier build --draft --version 1.1.0 --date 2026-06-01
```

The draft is printed to stdout; no files are written.

## Skipping a changelog entry

Pure-internal changes — refactors with no behavior change, CI tweaks, test-only additions — don't need a fragment. When in doubt, add one.
