import { readFileSync } from "fs";
import { join } from "path";

// ── Preset parameter definition ──

export interface PresetParameter {
  type: "number" | "string";
  description: string;
  default: number | string;
}

// ── Search preset ──

export interface Preset {
  /** Tool name exposed via MCP (e.g. "search_notes"). Must be unique. */
  name: string;
  /** Tool description shown to the model. */
  description: string;
  /**
   * Base Anki query. May contain ${paramName} placeholders that are
   * substituted at runtime from the preset's `parameters` definitions.
   */
  baseQuery: string;
  /** Anki note type (model name) used for field lookups. */
  noteType: string;
  /**
   * Custom parameters interpolated into baseQuery.
   * Each key becomes a tool parameter with the given type/description/default.
   */
  parameters?: Record<string, PresetParameter>;
  /**
   * If non-empty, the tool exposes a `search` string parameter.
   * The search string is expanded to (Field1:*term* OR Field2:*term*)
   * and appended to the base query.
   */
  searchFields: string[];
  /** Extra description for the search parameter, shown to the model. */
  searchDescription?: string;
  /** Note fields always included in the response. */
  defaultReturnedFields: string[];
  /** Note fields that can be opted into via an `include` parameter. */
  optionalReturnedFields: string[];
  /** Whether tags can be opted in via `include`. */
  optionalReturnedTags?: boolean;
  /**
   * If set, the tool exposes a `tags` parameter that lets the model filter
   * results to notes matching any of the provided tags.
   * The array lists which tag values are valid choices.
   */
  tagFilters?: string[];
  /** Whether to fetch and return card-level scheduling data (interval, ease, lapses, reps). */
  includeSchedulingData?: boolean;
  /** Default number of results per page. */
  defaultLimit: number;
  /** Default sort order for this tool. */
  defaultSort: string;
  /** Allowed sort options (exposed as a string enum to the model). */
  sortOptions: string[];
}

// ── Practice note config ──

export interface PracticeFieldConfig {
  /** Anki field name exactly as it appears in the note type. */
  name: string;
  /** Description shown to the model for this parameter. */
  description: string;
  /** Whether the model must provide a value for this field. */
  required: boolean;
}

export interface PracticeNotesConfig {
  /** Base name used to derive tool names: create_{name}, list_{name}. Must be unique. */
  name: string;
  /** Anki deck name for generated practice notes. */
  deckName: string;
  /** Anki note type (model name). */
  noteType: string;
  /** Tool description shown to the model for the create tool. */
  description: string;
  /** Fields on the note type, in order. Required ones become required tool params. */
  fields: PracticeFieldConfig[];
  /** Tags that the model is allowed to add or remove on notes in this deck. */
  allowedTags: string[];
  /**
   * If set, reject adding a note when any existing note (across all decks)
   * already has the same value for the named field.
   */
  rejectDuplicates?: string;
  /** Tag automatically applied to every created note. */
  defaultTag: string;
}

// ── Top-level config ──

export interface Config {
  /** Transport mode: "stdio" for local agent piping, "http" for network access. */
  transport: "stdio" | "http";
  ankiConnect: {
    url: string;
    version: number;
  };
  sync: {
    syncIntervalSeconds: number;
  };
  presets: Preset[];
  practiceNotes: PracticeNotesConfig[];
}

const raw = readFileSync(join(import.meta.dir, "..", "config.json"), "utf-8");
export const config: Config = JSON.parse(raw);
