# Agents Guide — chinese-anki MCP Server

## What This Is

A small MCP server that gives AI agents read/write access to a Chinese vocabulary Anki deck via the AnkiConnect plugin. It exposes 5 tools over stdio. Anki must be running locally with AnkiConnect installed.

## Architecture

```
index.ts       → MCP server bootstrap, tool registration
tools.ts       → Zod param schemas + handler functions
helpers.ts     → query builders, HTML stripping, compact formatting
anki-client.ts → HTTP client for AnkiConnect (localhost:8765)
config.ts      → loads config.json
```

All source is in `src/`, compiled output in `dist/`. Config lives at `mcp-server/config.json`.

## The 5 Tools

### search_notes
General-purpose search. The deck filter (`deck:Chinese`) is auto-prepended — just pass the query terms.

```
query: string    — Anki search syntax (see below)
limit?: number   — max results (default 50)
sort?: enum      — added_asc | added_desc | modified_asc | modified_desc
include?: object — { noteId?, pinyin?, english?, tags? } toggles
```

Returns `{ total, notes: [{ hanzi, ...optional fields }] }`.

### recently_learned
Notes first studied in the last N days. Wrapper around `introduced:N`.

```
days?: number    — lookback window (default 7)
limit?: number
sort?: enum
include?: object
```

### struggling_notes
Notes with high lapses (>3) or low ease (<2.0) that are in review. Returns scheduling stats.

```
limit?: number
sort?: enum
include?: object
```

Returns notes enriched with `interval`, `ease`, `lapses`, `reps`.

### update_tags
Add or remove tags on notes by ID. You need the note IDs first (get them via `search_notes` with `include: { noteId: true }`).

```
noteIds: number[]
add?: string[]
remove?: string[]
```

### create_practice_note
Create a new note in the `GeneratedPractice` subdeck. Use this for AI-generated sentences.

```
hanzi: string    — Chinese characters
pinyin: string   — with tone marks
english: string  — translation
tags?: string[]  — defaults to ["generated"]
```

Duplicates within the deck are rejected by AnkiConnect.

## Anki Search Syntax Quick Reference

The `search_notes` query accepts standard Anki search syntax:

| Pattern | Meaning |
|---|---|
| `你好` | Match any field |
| `Hanzi:你` | Match specific field |
| `tag:HSK1` | Tag filter |
| `tag:HSK*` | Wildcard tag |
| `-tag:none` | Exclude untagged |
| `is:new` | New cards |
| `is:due` | Due for review |
| `is:review` | In review phase |
| `is:learn` | In learning phase |
| `is:suspended` | Suspended |
| `added:7` | Added in last 7 days |
| `introduced:14` | First studied in last 14 days |
| `rated:3` | Reviewed in last 3 days |
| `prop:lapses>3` | More than 3 lapses |
| `prop:ease<2.0` | Ease below 200% |
| `prop:ivl>=10` | Interval 10+ days |
| `prop:due=0` | Due today |
| `a b` | AND |
| `a or b` | OR |
| `-term` | NOT |
| `(a or b) c` | Grouping |

## Data Model

Each note uses the `Chinese (Basic)` note type with these fields:

| Field | Contains |
|---|---|
| Hanzi | Chinese characters |
| Pinyin | Pronunciation (may contain HTML/comments) |
| English | Translation |
| Color | Tone coloring markup |
| Sound | Audio reference |
| Notes | Freeform notes |

The `include` parameter controls which fields appear in tool output. `hanzi` is always returned. Other fields must be opted in: `pinyin`, `english`, `tags`, `noteId`.

## Common Patterns

### Get note IDs for tag operations
Always search with `include: { noteId: true }` before calling `update_tags`.

### Sorting
- `added_asc/added_desc` — by creation date (note IDs are ms timestamps)
- `modified_asc/modified_desc` — by last edit (requires fetching full note info)

### HTML in fields
Fields may contain HTML tags and comments. The server strips these automatically before returning results — agents receive clean text.

### One note, multiple cards
A single note can generate multiple Anki cards (e.g. recognition + recall). The server deduplicates by note ID, so you always get one result per vocabulary item.

### Generated practice notes
`create_practice_note` creates its subdeck idempotently. The note type must match `Chinese (Basic)` — don't try to use custom fields.

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

The server is launched by a Claude Code MCP host — it communicates over stdin/stdout, not HTTP.

## Gotchas

- **Anki must be open.** If Anki isn't running, all tool calls will fail with connection errors.
- **Deck name is hardcoded in config.** All queries target the `Chinese` deck. There's no way to query other decks through this server.
- **Duplicate rejection.** `create_practice_note` will error if a note with the same Hanzi already exists in the target deck.
- **Ease is x1000.** AnkiConnect returns ease as an integer (e.g. 2500 = 250%). The struggle threshold in config uses the divided form (2.0 = 200%).
- **Negative intervals.** A negative `interval` value means the card is in the learning phase (value is in seconds). Positive means review phase (value is in days).
- **Result limits.** Default max is 50. Pass `limit: 0` or a higher number if you need all results, but be mindful of response size.
