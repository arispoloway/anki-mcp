import { config } from "./config.js";
import type { Preset } from "./config.js";
import { findNotes, notesInfo, findCards, cardsInfo, type NoteInfo } from "./anki-client.js";

// ── HTML / comment stripping ──

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripComments(s: string): string {
  return s.replace(/<!--.*?-->/g, "").trim();
}

function cleanFieldValue(raw: string): string {
  return stripComments(stripHtml(raw));
}

// ── Generic note formatting ──

export interface IncludeFlags {
  [fieldName: string]: boolean | undefined;
  noteId?: boolean;
  tags?: boolean;
}

export type CompactNote = Record<string, unknown>;

/**
 * Convert a NoteInfo into a compact object based on which fields to return.
 * `defaultFields` are always included; `include` toggles optional fields.
 */
export function toCompact(
  n: NoteInfo,
  defaultFields: string[],
  include?: IncludeFlags,
): CompactNote {
  const result: CompactNote = {};

  if (include?.noteId) result.noteId = n.noteId;

  for (const field of defaultFields) {
    result[field] = cleanFieldValue(n.fields[field]?.value ?? "");
  }

  if (include) {
    for (const [key, on] of Object.entries(include)) {
      if (!on) continue;
      if (key === "noteId" || key === "tags") continue; // handled separately
      // It's an optional note field name
      if (n.fields[key]) {
        result[key] = cleanFieldValue(n.fields[key].value ?? "");
      }
    }
  }

  if (include?.tags) result.tags = n.tags;

  return result;
}

// ── Sorting ──

export type SortOrder = string; // validated at the Zod level per-preset

function sortNoteIds(ids: number[], sort: string): number[] {
  if (sort === "added_asc") return [...ids].sort((a, b) => a - b);
  if (sort === "added_desc") return [...ids].sort((a, b) => b - a);
  return ids; // other sorts happen after fetching full info
}

function sortNoteInfos(infos: NoteInfo[], sort: string, orderedIds?: number[]): void {
  if (sort === "modified_asc") {
    infos.sort((a, b) => a.mod - b.mod);
  } else if (sort === "modified_desc") {
    infos.sort((a, b) => b.mod - a.mod);
  } else if ((sort === "added_asc" || sort === "added_desc") && orderedIds) {
    const order = new Map(orderedIds.map((id, i) => [id, i]));
    infos.sort((a, b) => (order.get(a.noteId) ?? 0) - (order.get(b.noteId) ?? 0));
  }
}

// ── Pagination ──

export interface PaginatedResult<T> {
  total: number;
  page: number;
  hasMore: boolean;
  notes: T[];
}

function paginate<T>(items: T[], limit: number, page: number): PaginatedResult<T> {
  const effectivePage = Math.max(1, page);
  const start = (effectivePage - 1) * limit;
  const notes = limit > 0 ? items.slice(start, start + limit) : items;
  return {
    total: items.length,
    page: effectivePage,
    hasMore: start + notes.length < items.length,
    notes,
  };
}

// ── Query building ──

/**
 * Build the search query for a preset, interpolating custom parameters,
 * appending the optional free-text search expansion, and tag filters.
 */
export function buildQuery(
  preset: Preset,
  customParams: Record<string, unknown>,
  searchTerm?: string,
  tags?: string[],
): string {
  let query = preset.baseQuery;

  // Interpolate ${paramName} placeholders from custom parameters
  if (preset.parameters) {
    for (const [key, def] of Object.entries(preset.parameters)) {
      const value = customParams[key] ?? def.default;
      query = query.replace(`\${${key}}`, String(value));
    }
  }

  // Expand free-text search across configured fields
  if (searchTerm && searchTerm.trim() && preset.searchFields.length > 0) {
    const term = searchTerm.trim();
    const clauses = preset.searchFields.map((f) => `${f}:*${term}*`);
    const expansion = clauses.length === 1 ? clauses[0] : `(${clauses.join(" OR ")})`;
    query = `${query} ${expansion}`;
  }

  // Append tag filters (match any of the provided tags)
  if (tags && tags.length > 0) {
    const tagClauses = tags.map((t) => `tag:${t}`);
    const tagExpansion = tagClauses.length === 1 ? tagClauses[0] : `(${tagClauses.join(" OR ")})`;
    query = `${query} ${tagExpansion}`;
  }

  return query.trim();
}

// ── Main search function (note-level) ──

export async function searchNotes(
  query: string,
  defaultFields: string[],
  limit: number,
  page: number,
  include?: IncludeFlags,
  sort?: string,
): Promise<PaginatedResult<CompactNote>> {
  const noteIds = await findNotes(query);

  // Pre-sort IDs for added_* sorts (noteIds ≈ creation timestamps)
  const sorted = sort ? sortNoteIds(noteIds, sort) : noteIds;

  // Paginate IDs before fetching full info (avoids fetching everything)
  const { notes: pagedIds, ...meta } = paginate(sorted, limit, page);

  if (pagedIds.length === 0) return { ...meta, notes: [] };

  const infos = await notesInfo(pagedIds);

  // Post-fetch sorts (modified, or preserving pre-sort order)
  if (sort) sortNoteInfos(infos, sort, pagedIds);

  const notes = infos.map((n) => toCompact(n, defaultFields, include));
  return { ...meta, notes };
}

// ── Card-level search with scheduling data ──

export interface CardWithScheduling extends CompactNote {
  interval: number;
  ease: number;
  lapses: number;
  reps: number;
}

export async function searchCardsWithScheduling(
  query: string,
  defaultFields: string[],
  limit: number,
  page: number,
  include?: IncludeFlags,
  sort?: string,
): Promise<PaginatedResult<CardWithScheduling>> {
  const cardIds = await findCards(query);
  const allInfos = cardIds.length > 0 ? await cardsInfo(cardIds) : [];

  // Deduplicate by note ID
  const seen = new Set<number>();
  const allResults: CardWithScheduling[] = [];
  for (const c of allInfos) {
    if (seen.has(c.note)) continue;
    seen.add(c.note);

    const note: CardWithScheduling = {
      interval: c.interval,
      ease: c.ease,
      lapses: c.lapses,
      reps: c.reps,
    };

    if (include?.noteId) note.noteId = c.note;

    for (const field of defaultFields) {
      note[field] = cleanFieldValue(c.fields[field]?.value ?? "");
    }

    if (include) {
      for (const [key, on] of Object.entries(include)) {
        if (!on || key === "noteId" || key === "tags") continue;
        if (c.fields[key]) {
          note[key] = cleanFieldValue(c.fields[key].value ?? "");
        }
      }
    }

    allResults.push(note);
  }

  // Apply scheduling-aware sorts
  if (sort === "lapses_desc") allResults.sort((a, b) => b.lapses - a.lapses);
  else if (sort === "lapses_asc") allResults.sort((a, b) => a.lapses - b.lapses);
  else if (sort === "ease_asc") allResults.sort((a, b) => a.ease - b.ease);
  else if (sort === "ease_desc") allResults.sort((a, b) => b.ease - a.ease);

  return paginate(allResults, limit, page);
}
