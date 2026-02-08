import { config } from "./config.js";
import {
  findNotes,
  notesInfo,
  findCards,
  cardsInfo,
  type NoteInfo,
  type CardInfo,
} from "./anki-client.js";

const { fields } = config.noteType;

/** Strip all HTML tags from a string. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

/** Strip HTML comment annotations like <!-- pinyin --> from pinyin fields. */
function stripComments(s: string): string {
  return s.replace(/<!--.*?-->/g, "").trim();
}

/** Options controlling which fields appear in compact output. */
export interface IncludeFields {
  noteId?: boolean;
  pinyin?: boolean;
  english?: boolean;
  tags?: boolean;
}

/** Compact note representation for tool output. */
export interface CompactNote {
  noteId?: number;
  hanzi: string;
  pinyin?: string;
  english?: string;
  tags?: string[];
}

/** Convert a raw NoteInfo to a compact representation with HTML stripped. */
export function toCompact(n: NoteInfo, include?: IncludeFields): CompactNote {
  const result: CompactNote = {
    hanzi: stripHtml(n.fields[fields.hanzi]?.value ?? ""),
  };
  if (include?.noteId) result.noteId = n.noteId;
  if (include?.pinyin) result.pinyin = stripComments(stripHtml(n.fields[fields.pinyin]?.value ?? ""));
  if (include?.english) result.english = stripHtml(n.fields[fields.english]?.value ?? "");
  if (include?.tags) result.tags = n.tags;
  return result;
}

/** Prefix a user query with the deck filter. */
export function deckQuery(extra: string): string {
  return `"deck:${config.deck.name}" ${extra}`.trim();
}

export type SortOrder = "added_asc" | "added_desc" | "modified_asc" | "modified_desc";

/** Result set with pagination metadata. */
export interface PaginatedResult<T> {
  total: number;
  hasMore: boolean;
  notes: T[];
}

/** Find notes in the Chinese deck and return compact representations. */
export async function searchNotes(
  query: string,
  limit?: number,
  include?: IncludeFields,
  sort?: SortOrder,
  page?: number
): Promise<PaginatedResult<CompactNote>> {
  const noteIds = await findNotes(deckQuery(query));
  const total = noteIds.length;
  // noteIds from Anki are creation-time timestamps in ms — sort before capping.
  let sorted = noteIds;
  if (sort === "added_asc" || sort === "added_desc") {
    sorted = [...noteIds].sort((a, b) =>
      sort === "added_asc" ? a - b : b - a
    );
  }
  const effectiveLimit = limit ?? config.defaults.maxResults;
  const effectivePage = Math.max(1, page ?? 1);
  const start = (effectivePage - 1) * effectiveLimit;
  const paged = effectiveLimit > 0
    ? sorted.slice(start, start + effectiveLimit)
    : sorted;
  if (paged.length === 0) return { total, hasMore: false, notes: [] };
  const infos = await notesInfo(paged);

  // For modified sorts, sort after fetching note info.
  if (sort === "modified_asc" || sort === "modified_desc") {
    infos.sort((a, b) =>
      sort === "modified_asc" ? a.mod - b.mod : b.mod - a.mod
    );
  } else if (sort === "added_asc" || sort === "added_desc") {
    // Preserve the pre-sorted noteId order.
    const order = new Map(paged.map((id, i) => [id, i]));
    infos.sort((a, b) => (order.get(a.noteId) ?? 0) - (order.get(b.noteId) ?? 0));
  }

  const notes = infos.map((n) => toCompact(n, include));
  return { total, hasMore: start + paged.length < total, notes };
}

/** Card-level info enriched with scheduling data, for "struggling" queries. */
export interface CardWithScheduling extends CompactNote {
  interval: number;
  ease: number;
  lapses: number;
  reps: number;
}

/** Find cards in the Chinese deck, return note fields + scheduling info. */
export async function searchCardsWithScheduling(
  query: string,
  limit?: number,
  include?: IncludeFields,
  page?: number
): Promise<PaginatedResult<CardWithScheduling>> {
  const cardIds = await findCards(deckQuery(query));
  // Deduplicate by noteId — need all cards to count unique notes accurately.
  const allInfos = cardIds.length > 0 ? await cardsInfo(cardIds) : [];
  const seen = new Set<number>();
  const allResults: CardWithScheduling[] = [];
  for (const c of allInfos) {
    if (seen.has(c.note)) continue;
    seen.add(c.note);
    const note: CardWithScheduling = {
      hanzi: stripHtml(c.fields[fields.hanzi]?.value ?? ""),
      interval: c.interval,
      ease: c.ease,
      lapses: c.lapses,
      reps: c.reps,
    };
    if (include?.noteId) note.noteId = c.note;
    if (include?.pinyin) note.pinyin = stripComments(stripHtml(c.fields[fields.pinyin]?.value ?? ""));
    if (include?.english) note.english = stripHtml(c.fields[fields.english]?.value ?? "");
    allResults.push(note);
  }
  const total = allResults.length;
  const effectiveLimit = limit ?? config.defaults.maxResults;
  const effectivePage = Math.max(1, page ?? 1);
  const start = (effectivePage - 1) * effectiveLimit;
  const notes = effectiveLimit > 0 ? allResults.slice(start, start + effectiveLimit) : allResults;
  return { total, hasMore: start + notes.length < total, notes };
}
