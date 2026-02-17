#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { generateAllTools } from "./tools.js";
import { syncIfStale } from "./sync.js";

const server = new McpServer({
  name: "chinese-anki",
  version: "2.0.0",
});

// Register all tools dynamically from config
for (const tool of generateAllTools()) {
  server.tool(tool.name, tool.description, tool.params, tool.handler);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await syncIfStale().catch(() => {});
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
