import { z } from "zod";
import { config } from "./config.js";
import type { Preset, PracticeNotesConfig } from "./config.js";
import {
  addNote,
  addTags,
  removeTags,
  createDeck,
  findNotes,
  notesInfo,
  sync,
} from "./anki-client.js";
import {
  buildQuery,
  searchNotes,
  searchCardsWithScheduling,
  stripHtml,
  type IncludeFlags,
} from "./helpers.js";
import { syncIfStale } from "./sync.js";

// ── Tool result helpers ──

type ToolResult = { content: Array<{ type: "text"; text: string }> };

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

// ── Dynamic preset tool generation ──

export interface GeneratedTool {
  name: string;
  description: string;
  params: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

function buildPresetTool(preset: Preset): GeneratedTool {
  const params: Record<string, z.ZodTypeAny> = {};

  // Custom parameters (e.g. "days" for recently_learned)
  if (preset.parameters) {
    for (const [key, def] of Object.entries(preset.parameters)) {
      if (def.type === "number") {
        params[key] = z.number().optional().describe(`${def.description} (default ${def.default})`);
      } else {
        params[key] = z
          .string()
          .optional()
          .describe(`${def.description} (default "${def.default}")`);
      }
    }
  }

  // Search parameter (only if searchFields is non-empty)
  if (preset.searchFields.length > 0) {
    const fieldList = preset.searchFields.join(", ");
    const desc =
      preset.searchDescription ??
      `Free-text search across ${fieldList}. Leave empty to return all results matching the base query.`;
    params.search = z.string().optional().describe(desc);
  }

  // Include parameter — built from optionalReturnedFields
  if (preset.optionalReturnedFields.length > 0 || preset.optionalReturnedTags) {
    const shape: Record<string, z.ZodTypeAny> = {
      noteId: z.boolean().optional().describe("Include note IDs"),
    };
    for (const field of preset.optionalReturnedFields) {
      shape[field] = z.boolean().optional().describe(`Include ${field}`);
    }
    if (preset.optionalReturnedTags) {
      shape.tags = z.boolean().optional().describe("Include tags");
    }
    params.include = z
      .object(shape)
      .optional()
      .describe(
        "Extra fields to include beyond the defaults. Only request fields you need to keep responses compact.",
      );
  }

  // Tag filter parameter (only if tagFilters is configured)
  if (preset.tagFilters && preset.tagFilters.length > 0) {
    const tagEnum = preset.tagFilters as [string, ...string[]];
    params.tags = z
      .array(z.enum(tagEnum))
      .optional()
      .describe("Filter results to notes matching any of the provided tags.");
  }

  // Sort parameter
  if (preset.sortOptions.length > 0) {
    const sortEnum = preset.sortOptions as [string, ...string[]];
    params.sort = z
      .enum(sortEnum)
      .optional()
      .describe(`Sort order (default: ${preset.defaultSort})`);
  }

  // Pagination
  params.limit = z
    .number()
    .optional()
    .describe(`Results per page (default ${preset.defaultLimit})`);
  params.page = z
    .number()
    .optional()
    .describe("Page number (default 1). Use with limit for pagination.");

  // Handler
  const handler = async (args: Record<string, unknown>): Promise<ToolResult> => {
    await syncIfStale();

    const customParams: Record<string, unknown> = {};
    if (preset.parameters) {
      for (const key of Object.keys(preset.parameters)) {
        if (args[key] !== undefined) customParams[key] = args[key];
      }
    }

    const tags = args.tags as string[] | undefined;
    const query = buildQuery(preset, customParams, args.search as string | undefined, tags);
    const limit = (args.limit as number | undefined) ?? preset.defaultLimit;
    const page = (args.page as number | undefined) ?? 1;
    const sort = (args.sort as string | undefined) ?? preset.defaultSort;
    const include = args.include as IncludeFlags | undefined;

    if (preset.includeSchedulingData) {
      const result = await searchCardsWithScheduling(
        query,
        preset.defaultReturnedFields,
        limit,
        page,
        include,
        sort,
      );
      return textResult(result);
    }

    const result = await searchNotes(
      query,
      preset.defaultReturnedFields,
      limit,
      page,
      include,
      sort,
    );
    return textResult(result);
  };

  return { name: preset.name, description: preset.description, params, handler };
}

// ── Practice note tool generation ──

function buildPracticeTools(cfg: PracticeNotesConfig): GeneratedTool[] {
  const tools: GeneratedTool[] = [];

  // create_practice_note
  {
    const params: Record<string, z.ZodTypeAny> = {};
    for (const field of cfg.fields) {
      if (field.required) {
        params[field.name] = z.string().describe(field.description);
      } else {
        params[field.name] = z.string().optional().describe(field.description);
      }
    }

    const handler = async (args: Record<string, unknown>): Promise<ToolResult> => {
      await syncIfStale();

      const fields: Record<string, string> = {};
      for (const field of cfg.fields) {
        fields[field.name] = (args[field.name] as string | undefined) ?? "";
      }

      // Check for global duplicates on the configured field
      if (cfg.rejectDuplicates) {
        const value = fields[cfg.rejectDuplicates];
        if (value) {
          const dupeQuery = `${cfg.rejectDuplicates}:${value}`;
          const existing = await findNotes(dupeQuery);
          if (existing.length > 0) {
            return textResult({
              success: false,
              reason: `A note with ${cfg.rejectDuplicates} "${value}" already exists.`,
              existingNoteIds: existing,
            });
          }
        }
      }

      const tags = [cfg.defaultTag];
      await createDeck(cfg.deckName);

      const noteId = await addNote(cfg.deckName, cfg.noteType, fields, tags);

      // Return the provided field values for confirmation
      const response: Record<string, unknown> = { success: true, noteId, tags };
      for (const field of cfg.fields) {
        if (args[field.name]) response[field.name] = args[field.name];
      }
      return textResult(response);
    };

    tools.push({
      name: `create_${cfg.name}`,
      description: cfg.description,
      params,
      handler,
    });
  }

  // list_practice_notes
  {
    const handler = async (): Promise<ToolResult> => {
      await syncIfStale();
      const noteIds = await findNotes(`"deck:${cfg.deckName}"`);
      if (noteIds.length === 0) return textResult([]);
      const infos = await notesInfo(noteIds);
      // Return the first required field as a flat list
      const primaryField = cfg.fields.find((f) => f.required)?.name ?? cfg.fields[0].name;
      return textResult(infos.map((n) => stripHtml(n.fields[primaryField]?.value ?? "")));
    };

    tools.push({
      name: `list_${cfg.name}`,
      description: `List all notes in the ${cfg.deckName} deck. Returns a flat list of ${cfg.fields.find((f) => f.required)?.name ?? "primary field"} values.`,
      params: {},
      handler,
    });
  }

  return tools;
}

// ── Tag tool (stays largely the same) ──

function buildUpdateTagsTool(): GeneratedTool {
  // Derive allowed tags from all practiceNotes configs
  const allAllowed = new Set<string>();
  for (const cfg of config.practiceNotes) {
    for (const tag of cfg.allowedTags) allAllowed.add(tag);
  }
  const allowedTags = [...allAllowed];
  const allowedTagsEnum = allowedTags as [string, ...string[]];

  const params: Record<string, z.ZodTypeAny> = {
    noteIds: z.array(z.number()).describe("Note IDs to update"),
    add: z
      .array(z.enum(allowedTagsEnum))
      .optional()
      .describe(`Tags to add (allowed: ${allowedTags.join(", ")})`),
    remove: z
      .array(z.enum(allowedTagsEnum))
      .optional()
      .describe(`Tags to remove (allowed: ${allowedTags.join(", ")})`),
  };

  const handler = async (args: Record<string, unknown>): Promise<ToolResult> => {
    await syncIfStale();
    const noteIds = args.noteIds as number[];
    const add = args.add as string[] | undefined;
    const remove = args.remove as string[] | undefined;

    if (add?.length) {
      await addTags(noteIds, add.join(" "));
    }
    if (remove?.length) {
      await removeTags(noteIds, remove.join(" "));
    }

    return textResult({
      success: true,
      noteIds,
      added: add ?? [],
      removed: remove ?? [],
    });
  };

  return {
    name: "update_tags",
    description: "Add or remove tags on one or more notes by note ID.",
    params,
    handler,
  };
}

// ── Public: generate all tools from config ──

export function generateAllTools(): GeneratedTool[] {
  const tools: GeneratedTool[] = [];

  // Preset-driven query tools
  for (const preset of config.presets) {
    tools.push(buildPresetTool(preset));
  }

  // Practice note tools
  for (const practiceConfig of config.practiceNotes) {
    tools.push(...buildPracticeTools(practiceConfig));
  }

  // Tag management
  tools.push(buildUpdateTagsTool());

  // Sync
  tools.push({
    name: "sync",
    description:
      "Trigger an immediate sync of the Anki collection with AnkiWeb. Use when the user explicitly asks to sync, or after adding notes.",
    params: {},
    handler: async () => {
      await sync();
      return textResult({ success: true });
    },
  });

  return tools;
}
