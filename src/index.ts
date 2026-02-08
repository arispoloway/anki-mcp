#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SearchNotesParams,
  RecentlyLearnedParams,
  StrugglingNotesParams,
  UpdateTagsParams,
  CreatePracticeNoteParams,
  handleSearchNotes,
  handleRecentlyLearned,
  handleStrugglingNotes,
  handleUpdateTags,
  handleListPracticeNotes,
  handleCreatePracticeNote,
} from "./tools.js";

const server = new McpServer({
  name: "chinese-anki",
  version: "1.0.0",
});

server.tool(
  "search_notes",
  "Search Chinese vocabulary notes using Anki query syntax. " +
    "The deck filter is applied automatically — just provide the search terms. " +
    "Returns hanzi by default — only request extra fields via 'include' if needed. " +
    "Examples: 'is:new', 'tag:word', 'tag:sentence', '吃', 'added:7', 'is:due'.",
  SearchNotesParams,
  handleSearchNotes
);

server.tool(
  "recently_learned",
  "Get notes that were first studied recently. " +
    "Returns hanzi by default — only request extra fields via 'include' if needed.",
  RecentlyLearnedParams,
  handleRecentlyLearned
);

server.tool(
  "struggling_notes",
  "Get notes the user is struggling with — high lapse count or low ease. " +
    "Returns hanzi plus interval/ease/lapses/reps stats by default — only request extra fields via 'include' if needed.",
  StrugglingNotesParams,
  handleStrugglingNotes
);

server.tool(
  "update_tags",
  "Add or remove tags on one or more notes by note ID.",
  UpdateTagsParams,
  handleUpdateTags
);

server.tool(
  "list_practice_notes",
  "List all practice sentences in the generated practice deck. " +
    "Returns a flat list of hanzi strings.",
  {},
  handleListPracticeNotes
);

server.tool(
  "create_practice_note",
  "Create a new practice note in the generated practice deck. " +
    "Provide hanzi, pinyin, and english. " +
    "Use this for AI-generated sentences the user hasn't seen before. " +
    "Tags are assigned automatically.",
  CreatePracticeNoteParams,
  handleCreatePracticeNote
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
