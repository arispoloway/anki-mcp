import { z } from "zod";
import { config } from "./config.js";
import {
  addNote,
  addTags,
  removeTags,
  createDeck,
  findNotes,
  notesInfo,
} from "./anki-client.js";
import {
  searchNotes,
  searchCardsWithScheduling,
  stripHtml,
  type SortOrder,
} from "./helpers.js";

// ── Shared include-field toggles ──

const includeSchema = z.object({
  noteId: z.boolean().optional().describe("Include note IDs"),
  pinyin: z.boolean().optional().describe("Include pinyin"),
  english: z.boolean().optional().describe("Include english translation"),
  tags: z.boolean().optional().describe("Include tags"),
}).optional().describe("Extra fields to include beyond hanzi. Only request fields you need to keep responses compact.");

type IncludeArg = {
  include?: { noteId?: boolean; pinyin?: boolean; english?: boolean; tags?: boolean };
};

// ── Zod schemas for each tool's parameters ──

const sortSchema = z.enum(["added_asc", "added_desc", "modified_asc", "modified_desc"])
  .optional()
  .describe("Sort order: added_asc/added_desc (by creation date), modified_asc/modified_desc (by last edit)");

const allowedTagsEnum = config.tags.allowed as [string, ...string[]];

const pageSchema = z.number().optional().describe("Page number (default 1). Use with limit for pagination.");

export const SearchNotesParams = {
  query: z.string().describe(
    "Anki search query (deck filter is auto-added). " +
    "Syntax: simple text searches any field. " +
    `Tags: ${allowedTagsEnum.map(t => `tag:${t}`).join(", ")}, -tag:none. ` +
    "Card state: is:new, is:due, is:learn, is:review, is:suspended. " +
    "Time filters: added:N (added in last N days), introduced:N (first studied in last N days), rated:N (reviewed in last N days), rated:N:1 (answered Again in last N days). " +
    "Properties: prop:due=0 (due today), prop:due=-1 (overdue 1 day), prop:ivl>=10 (interval 10+ days), prop:lapses>3, prop:ease<2.0. " +
    "Field search: Hanzi:你好, English:hello. " +
    "Regex: re:pattern. Wildcards: d*g, d_g. " +
    "Boolean: term1 term2 (AND), term1 or term2 (OR), -term (NOT), (a or b) c (grouping)."
  ),
  limit: z.number().optional().describe("Results per page (default 50)"),
  page: pageSchema,
  sort: sortSchema,
  include: includeSchema,
};

export const RecentlyLearnedParams = {
  days: z.number().optional().describe("How many days back to look (default 14)"),
  limit: z.number().optional().describe("Results per page (default 50)"),
  page: pageSchema,
  sort: sortSchema,
  include: includeSchema,
};

export const StrugglingNotesParams = {
  limit: z.number().optional().describe("Results per page (default 50)"),
  page: pageSchema,
  sort: sortSchema,
  include: includeSchema,
};

export const UpdateTagsParams = {
  noteIds: z.array(z.number()).describe("Note IDs to update"),
  add: z.array(z.enum(allowedTagsEnum)).optional().describe(`Tags to add (allowed: ${allowedTagsEnum.join(", ")})`),
  remove: z.array(z.enum(allowedTagsEnum)).optional().describe(`Tags to remove (allowed: ${allowedTagsEnum.join(", ")})`),
};

export const CreatePracticeNoteParams = {
  hanzi: z.string().describe("Chinese characters"),
  pinyin: z.string().describe("Pinyin with tone marks"),
  english: z.string().describe("English translation"),
};

// ── Tool result helpers ──

type ToolResult = { content: Array<{ type: "text"; text: string }> };

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

// ── Handlers ──

type SortArg = { sort?: SortOrder };
type PageArg = { page?: number };

export async function handleSearchNotes(args: {
  query: string;
  limit?: number;
} & IncludeArg & SortArg & PageArg): Promise<ToolResult> {
  const result = await searchNotes(args.query, args.limit, args.include, args.sort, args.page);
  return textResult(result);
}

export async function handleRecentlyLearned(args: {
  days?: number;
  limit?: number;
} & IncludeArg & SortArg & PageArg): Promise<ToolResult> {
  const days = args.days ?? config.defaults.recentDays;
  const result = await searchNotes(`introduced:${days}`, args.limit, args.include, args.sort, args.page);
  return textResult(result);
}

export async function handleStrugglingNotes(args: {
  limit?: number;
} & IncludeArg & SortArg & PageArg): Promise<ToolResult> {
  const { struggleLapsesThreshold, struggleEaseThreshold } = config.defaults;
  const query = `(prop:lapses>${struggleLapsesThreshold} or prop:ease<${struggleEaseThreshold}) is:review`;
  const result = await searchCardsWithScheduling(query, args.limit, args.include, args.page);
  result.notes.sort((a, b) => b.lapses - a.lapses);
  return textResult(result);
}

export async function handleUpdateTags(args: {
  noteIds: number[];
  add?: string[];
  remove?: string[];
}): Promise<ToolResult> {
  if (args.add?.length) {
    await addTags(args.noteIds, args.add.join(" "));
  }
  if (args.remove?.length) {
    await removeTags(args.noteIds, args.remove.join(" "));
  }
  return textResult({
    success: true,
    noteIds: args.noteIds,
    added: args.add ?? [],
    removed: args.remove ?? [],
  });
}

export async function handleListPracticeNotes(): Promise<ToolResult> {
  const noteIds = await findNotes(`"deck:${config.deck.generatedSubdeck}"`);
  if (noteIds.length === 0) return textResult([]);
  const infos = await notesInfo(noteIds);
  const { fields } = config.noteType;
  return textResult(infos.map((n) => stripHtml(n.fields[fields.hanzi]?.value ?? "")));
}

export async function handleCreatePracticeNote(args: {
  hanzi: string;
  pinyin: string;
  english: string;
}): Promise<ToolResult> {
  const tags = [config.generatedPractice.defaultTag];
  const { noteType, deck } = config;

  await createDeck(deck.generatedSubdeck);

  const fields: Record<string, string> = {
    [noteType.fields.hanzi]: args.hanzi,
    [noteType.fields.pinyin]: args.pinyin,
    [noteType.fields.english]: args.english,
    [noteType.fields.color]: "",
    [noteType.fields.sound]: "",
    [noteType.fields.includeAudioCard]: "",
    [noteType.fields.notes]: "",
  };

  const noteId = await addNote(deck.generatedSubdeck, noteType.name, fields, tags);
  return textResult({ success: true, noteId, hanzi: args.hanzi, pinyin: args.pinyin, english: args.english, tags });
}
