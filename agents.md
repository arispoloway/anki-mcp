# Agents Guide — chinese-anki MCP Server

## What This Is

A config-driven MCP server that gives AI agents read/write access to Anki decks via the AnkiConnect plugin. Tools are generated dynamically from presets defined in `config.json` — no code changes needed to add new query tools, change fields, or target different decks. Anki must be running locally with AnkiConnect installed.

## Architecture

```
index.ts       → MCP server bootstrap, registers tools from generateAllTools()
tools.ts       → reads config presets, builds Zod schemas + handlers dynamically
helpers.ts     → generic query building, field extraction, pagination, sorting
anki-client.ts → HTTP client for AnkiConnect (localhost:8765)
config.ts      → loads and types config.json
sync.ts        → stale-sync throttle
```

All source is in `src/`, compiled output in `dist/`. Config lives at `mcp-server/config.json`.

## Tools

Tools are generated at startup from `config.json`. The current config produces these tools:

### search_notes
General-purpose search. The deck filter is auto-applied — just use the `search` parameter for free-text lookup, or leave it empty to browse.

```
search?: string  — free-text search across Hanzi and English
limit?: number   — results per page (default 50)
page?: number    — page number (default 1)
sort?: enum      — added_asc | added_desc | modified_asc | modified_desc
include?: object — { noteId?, Pinyin?, English?, Notes?, tags? }
```

Returns `{ total, page, hasMore, notes: [{ Hanzi, ...optional fields }] }`.

### recently_learned
Notes first studied in the last N days.

```
days?: number    — lookback window (default 14)
limit?: number
page?: number
sort?: enum
include?: object
```

### struggling_notes
Notes with high lapses (>3) or low ease (<2.0) in review. Returns scheduling stats.

```
limit?: number
page?: number
sort?: enum      — includes lapses_desc, lapses_asc, ease_asc, ease_desc
include?: object
```

Returns notes enriched with `interval`, `ease`, `lapses`, `reps`.

### update_tags
Add or remove tags on notes by ID. Get note IDs first via any search tool with `include: { noteId: true }`.

```
noteIds: number[]
add?: ("word" | "sentence")[]
remove?: ("word" | "sentence")[]
```

### create_practice_note
Create a new note in the GeneratedPractice subdeck.

```
Hanzi: string    — Chinese characters (required)
Pinyin: string   — with tone marks (required)
English: string  — translation (required)
Color?: string
Sound?: string
Include Audio Card?: string
Notes?: string
```

Duplicates within the deck are rejected. Auto-tagged with "generated".

### list_practice_notes
List all practice notes. Returns a flat list of Hanzi strings. No parameters.

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
| `includeSchedulingData` | Fetch card-level interval/ease/lapses/reps |
| `defaultLimit` | Default page size |
| `defaultSort` | Sort applied when none specified |
| `sortOptions` | Allowed sort values |

`noteId` is always implicitly available in `include`.

### Adding a New Query Tool

Just add a preset to `config.json` and restart. Example — a tool for notes added today:

```json
{
  "name": "added_today",
  "description": "Notes added to the deck today.",
  "baseQuery": "\"deck:Chinese\" added:1",
  "noteType": "Chinese (Basic)",
  "searchFields": [],
  "defaultReturnedFields": ["Hanzi", "Pinyin"],
  "optionalReturnedFields": ["English", "Notes"],
  "optionalReturnedTags": true,
  "defaultLimit": 50,
  "defaultSort": "added_desc",
  "sortOptions": ["added_asc", "added_desc"]
}
```

## Data Model

The note type is configured per-preset and per-practice config. The current `Chinese (Basic)` type has:

| Field | Contains |
|---|---|
| Hanzi | Chinese characters |
| Pinyin | Pronunciation (HTML/comments auto-stripped) |
| English | Translation |
| Color | Tone coloring markup |
| Sound | Audio reference |
| Notes | Freeform notes |

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
- Node.js 18+ (uses native `fetch`)

## Development

```bash
cd mcp-server
npm install
npm run build   # tsc
npm start       # node dist/index.js (stdio transport)
```

## Gotchas

- **Anki must be open.** If Anki isn't running, all tool calls will fail with connection errors.
- **Duplicate rejection.** `create_practice_note` will error if a note with the same primary field already exists in the target deck.
- **Ease is x1000.** AnkiConnect returns ease as an integer (2500 = 250%). Threshold in config uses divided form (2.0 = 200%).
- **Negative intervals.** Negative `interval` = learning phase (seconds). Positive = review phase (days).
- **Result limits.** Default varies by preset. Pass `limit: 0` for all results, but be mindful of response size.
