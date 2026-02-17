#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { syncIfStale } from "./sync.js";
import { generateAllTools } from "./tools.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "anki-mcp-server",
    version: "2.0.0",
  });

  for (const tool of generateAllTools()) {
    server.tool(tool.name, tool.description, tool.params, tool.handler);
  }

  return server;
}

// ── Stdio mode (default) ──

async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await syncIfStale().catch(() => {});
}

// ── HTTP mode ──

async function startHttp() {
  const port = parseInt(process.env.PORT ?? "8080", 10);

  // Stateful: one transport per session, kept alive across requests
  const sessions = new Map<
    string,
    { transport: WebStandardStreamableHTTPServerTransport; server: McpServer }
  >();

  Bun.serve({
    port,
    hostname: "0.0.0.0",
    fetch: async (req) => {
      const url = new URL(req.url);
      if (url.pathname !== "/mcp") {
        return new Response("Not found", { status: 404 });
      }

      const sessionId = req.headers.get("mcp-session-id") ?? undefined;

      // Existing session
      if (sessionId && sessions.has(sessionId)) {
        const { transport } = sessions.get(sessionId)!;
        return transport.handleRequest(req);
      }

      // New session (must be an initialize request via POST)
      if (req.method === "POST") {
        const body = await req.json();
        if (isInitializeRequest(body)) {
          const server = createServer();
          const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (sid) => {
              sessions.set(sid, { transport, server });
            },
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              sessions.delete(transport.sessionId);
            }
          };

          await server.connect(transport);
          await syncIfStale().catch(() => {});
          return transport.handleRequest(req, { parsedBody: body });
        }
      }

      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad request: no valid session" },
          id: null,
        },
        { status: 400 },
      );
    },
  });

  console.log(`MCP HTTP server listening on http://0.0.0.0:${port}/mcp`);
}

// ── Entrypoint ──

(config.transport === "http" ? startHttp() : startStdio()).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
