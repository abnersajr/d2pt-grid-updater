# Dota 2 Pro Tracker - Grid Updater

**Last update**: 2026-01-16 • Patch 7.40b — see [grids.md](./grids.md)

## What is this?

Automates downloading the three Meta Hero Grid configuration JSONs from Dota2ProTracker and keeps this repo up to date by:

- Downloading the latest three grid files (D2PT Rating, High Winrate, Most Played).
- Naming files with date and patch (example: `..._2025-10-12_p7_39d.json`).
- Appending a row into `grids.md` with links to the freshly downloaded files.
- Updating `last_update.txt` and the "Last update" line in this README.
- Generating and maintaining MD5 hashes for all grid files in `grid_hashes.txt` for content-based identification.
- Running on a schedule via GitHub Actions every 3 hours (or manually via workflow dispatch with optional hash backfilling).

## Features

- Idempotent updates: skips adding a duplicate row when the same date/patch already exists in `grids.md`.
- Force re-download: `-f` or `--force` downloads again even if an entry exists, then syncs README metadata.
- Repair metadata: `-r` or `--repair` updates `last_update.txt` and README from `grids.md` (or from the site if needed) without downloading files.
- Auto modal handling: closes the announcement modal if present during scraping.
- MD5 hash dictionary: maintains `grid_hashes.txt` with content-based MD5 hashes for all grid files, enabling version identification by content rather than filename.

## Prerequisites

- Bun 1.3+.
  - Playwright browser/deps are auto-installed during `bun install`.
- Note: It may work with Node.js, but this repo is set up for Bun commands and lockfiles.

## Setup

- Install dependencies:

```sh
bun install
```

This installs Playwright dependencies and Chromium as part of the postinstall step.

## Usage (locally)

- Run the updater:

```sh
bun run grid-updater.ts
```

- Force re-download even if an entry for the same date/patch exists:

```sh
bun run grid-updater.ts --force
# or
bun run grid-updater.ts -f
```

- Repair only the metadata (no downloads). Syncs `last_update.txt` and README from the first row in `grids.md` if available; otherwise falls back to the latest site info:

```sh
bun run grid-updater.ts --repair
# or
bun run grid-updater.ts -r
```

- Generate or regenerate MD5 hashes for all existing grid files:

```sh
bun run generate-hashes
# or
bun run generate_hashes.ts
```
