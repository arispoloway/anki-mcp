# Anki MCP Server

An opinionated, config driven Anki MCP server

## Context

Plenty of MCP servers for Anki already exist, but they tend to be very
light wrappers around the AnkiConnect API. This is great for giving LLMs
full access to Anki, but unfortunately is relatively token-intensive.
For smaller local models, this is especially problematic.

I've found it to be more effective (even for cloud models) to instead
expose a more limited set of tools targeted to specific use cases. In
many ways, models don't even need to be aware that the underlying source
is Anki. They can instead focus on calling a more natural set of tools
without completely overwheliming their context windows.

## Prerequisites

- [Bun](https://bun.sh)
- [Anki](https://apps.ankiweb.net) desktop (must be running while the server is active)
- [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on, listening on `localhost:8765` (the default)

## Setup

```bash
git clone <repo-url>
cd anki-mcp-server
cp config.example.json config.json
bun install
```

Edit `config.json` to point at your Anki decks, note types, and fields. The example config includes a few starter presets you can adapt or replace.

Then start the server:

```bash
bun start
```

## Transport

The server supports two transports, set via the `transport` field in `config.json`:

- **`stdio`** (default) — communicates over stdin/stdout. Use this with local MCP clients like Claude Code.
- **`http`** — starts an HTTP server on port 8080 (override with `PORT` env var), serving the MCP Streamable HTTP protocol at `/mcp`. Use this for Docker, remote access, or HTTP-based MCP clients.

### Docker

Set `"transport": "http"` in `config.json`, then:

```bash
docker build -t anki-mcp-server .
docker run --rm -p 8080:8080 anki-mcp-server
```

Note: AnkiConnect needs to be reachable from within the container. If Anki is running on the host, you may need `--network host` or equivalent.

## Configuration

Tools are generated dynamically from presets in `config.json` — no code changes needed to add new query tools, change fields, or target different decks. See `config.example.json` for the full shape.

Each entry in `presets` becomes a search/query tool. Each entry in `practiceNotes` generates a create and list tool pair. Two built-in tools (`update_tags` and `sync`) are always registered regardless of config.

See [agents.md](agents.md) for detailed documentation on all config fields and tool behavior.

