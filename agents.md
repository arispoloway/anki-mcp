# Agents Guide — anki-mcp-server

## What This Is

A config-driven MCP server that gives AI agents read/write access to Anki decks via the AnkiConnect plugin. Tools are generated dynamically from presets defined in `config.json` — no code changes needed to add new query tools, change fields, or target different decks. Supports both stdio (local) and HTTP (network/Docker) transports. Anki must be running with AnkiConnect installed.

## Architecture

```
index.ts       → MCP server bootstrap, registers tools from generateAllTools()
tools.ts       → reads config presets, builds Zod schemas + handlers dynamically
helpers.ts     → generic query building, field extraction, pagination, sorting
anki-client.ts → HTTP client for AnkiConnect (localhost:8765)
config.ts      → loads and types config.json
sync.ts        → stale-sync throttle
```

All source is in `src/`. Config lives at `config.json` (copy `config.example.json` to get started).

## Transport

Set `"transport"` in `config.json`:

| Value | Description |
|---|---|
| `"stdio"` | Default. Communicates over stdin/stdout — use for local MCP clients (e.g. Claude Code). |
| `"http"` | Starts an HTTP server on port 8080 (override with `PORT` env var). Serves the MCP Streamable HTTP protocol at `/mcp`. Use for Docker, remote access, or any HTTP-based MCP client. |

## Setup

1. Copy `config.example.json` to `config.json`
2. Edit `config.json` to match your Anki deck names, note types, and fields
3. `bun install && bun start`

### Docker

Set `"transport": "http"` in your `config.json`, then:

```bash
podman build -t anki-mcp-server .
podman run --rm -p 8080:8080 anki-mcp-server
```

The server will be available at `http://localhost:8080/mcp`.

## Config-Driven Presets

Each entry in `config.presets` generates a separate MCP tool. A preset defines:

| Field | Purpose |
|---|---|
| `name` | Tool name (must be unique) |
| `description` | Shown to the model — explain when to use it |
| `baseQuery` | Anki query with optional `${param}` placeholders |
| `noteType` | Anki model name for field lookups |
| `parameters` | Custom tool params interpolated into baseQuery |
| `searchFields` | If non-empty, adds a `search` param that expands to field-level OR search |
| `searchDescription` | Custom description for the search parameter |
| `defaultReturnedFields` | Fields always in the response |
| `optionalReturnedFields` | Fields available via `include` toggles |
| `optionalReturnedTags` | Whether `include.tags` is available |
| `tagFilters` | If non-empty, adds a `tags` enum parameter for filtering |
| `includeSchedulingData` | Fetch card-level interval/ease/lapses/reps |
| `defaultLimit` | Default page size |
| `defaultSort` | Sort applied when none specified |
| `sortOptions` | Allowed sort values |

`noteId` is always implicitly available in `include`.

## Practice Note Configs

Each entry in `config.practiceNotes` generates `create_{name}` and `list_{name}` tools.

| Field | Purpose |
|---|---|
| `name` | Base name for tools (e.g. `"practice_note"` → `create_practice_note`, `list_practice_note`) |
| `deckName` | Target Anki deck (created automatically if missing) |
| `noteType` | Anki note type |
| `description` | Shown to the model for the create tool |
| `fields` | Array of `{ name, description, required }` — maps to note fields |
| `allowedTags` | Tags the model can add/remove on notes in this deck |
| `rejectDuplicates` | Field name to check for global duplicates before adding |
| `defaultTag` | Tag auto-applied to every created note |

## Built-in Tools

These are always generated regardless of config:

- **update_tags** — Add or remove tags on notes by ID. Allowed tags are derived from all `practiceNotes[].allowedTags`.
- **sync** — Trigger an immediate sync with AnkiWeb.

## Adding a New Query Tool

Just add a preset to `config.json` and restart. Example — a tool for notes added today:

```json
{
  "name": "added_today",
  "description": "Notes added to the deck today.",
  "baseQuery": "\"deck:My Deck\" added:1",
  "noteType": "Basic",
  "searchFields": [],
  "defaultReturnedFields": ["Front"],
  "optionalReturnedFields": ["Back"],
  "optionalReturnedTags": true,
  "defaultLimit": 50,
  "defaultSort": "added_desc",
  "sortOptions": ["added_asc", "added_desc"]
}
```

## Common Patterns

### Get note IDs for tag operations
Search with `include: { noteId: true }` before calling `update_tags`.

### Sorting
- `added_asc/added_desc` — by creation date (note IDs are ms timestamps)
- `modified_asc/modified_desc` — by last edit
- `lapses_desc/lapses_asc` — by lapse count (scheduling presets only)
- `ease_asc/ease_desc` — by ease factor (scheduling presets only)

### HTML in fields
Fields may contain HTML tags and comments. The server strips these automatically.

### One note, multiple cards
A note can generate multiple Anki cards. The server deduplicates by note ID.

### Pagination
All search tools support `limit` and `page`. Responses include `total`, `page`, and `hasMore`.

## Prerequisites

- Anki desktop running
- AnkiConnect add-on installed and listening on `localhost:8765`
- Bun

## Development

```bash
bun install
bun start
```

Before committing, make sure tests, formatting, and linting are all clean:

```bash
bun test                        # all tests must pass
bun run --bun biome format --write .  # auto-fix formatting
bun run --bun biome check .     # no errors (the pre-existing noNonNullAssertion warning in index.ts is acceptable)
```

## Gotchas

- **Anki must be open.** If Anki isn't running, all tool calls will fail with connection errors.
- **Duplicate rejection.** Practice note tools with `rejectDuplicates` set will error if a note with the same value already exists.
- **Ease is x1000.** AnkiConnect returns ease as an integer (2500 = 250%). Threshold in config uses divided form (2.0 = 200%).
- **Negative intervals.** Negative `interval` = learning phase (seconds). Positive = review phase (days).
- **Result limits.** Default varies by preset. Pass `limit: 0` for all results, but be mindful of response size.
