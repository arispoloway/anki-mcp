import { config } from "./config.js";

interface AnkiResponse<T = unknown> {
  result: T;
  error: string | null;
}

async function invoke<T = unknown>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const body = JSON.stringify({
    action,
    version: config.ankiConnect.version,
    params,
  });

  const resp = await fetch(config.ankiConnect.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!resp.ok) {
    throw new Error(
      `AnkiConnect HTTP error: ${resp.status} ${resp.statusText}`
    );
  }

  const data: AnkiResponse<T> = await resp.json();
  if (data.error) {
    throw new Error(`AnkiConnect error: ${data.error}`);
  }
  return data.result;
}

// ── Note-level queries ──

export interface NoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  fields: Record<string, { value: string; order: number }>;
  mod: number;
  cards: number[];
}

export interface CardInfo {
  cardId: number;
  note: number;
  deckName: string;
  modelName: string;
  interval: number;
  ease: number;
  lapses: number;
  reps: number;
  due: number;
  fields: Record<string, { value: string; order: number }>;
}

export async function findNotes(query: string): Promise<number[]> {
  return invoke<number[]>("findNotes", { query });
}

export async function notesInfo(noteIds: number[]): Promise<NoteInfo[]> {
  return invoke<NoteInfo[]>("notesInfo", { notes: noteIds });
}

export async function findCards(query: string): Promise<number[]> {
  return invoke<number[]>("findCards", { query });
}

export async function cardsInfo(cardIds: number[]): Promise<CardInfo[]> {
  return invoke<CardInfo[]>("cardsInfo", { cards: cardIds });
}

// ── Mutations ──

export async function addNote(
  deckName: string,
  modelName: string,
  fields: Record<string, string>,
  tags: string[]
): Promise<number> {
  return invoke<number>("addNote", {
    note: {
      deckName,
      modelName,
      fields,
      tags,
      options: { allowDuplicate: false, duplicateScope: "deck" },
    },
  });
}

export async function addTags(
  noteIds: number[],
  tags: string
): Promise<void> {
  await invoke("addTags", { notes: noteIds, tags });
}

export async function removeTags(
  noteIds: number[],
  tags: string
): Promise<void> {
  await invoke("removeTags", { notes: noteIds, tags });
}

export async function createDeck(deckName: string): Promise<number> {
  return invoke<number>("createDeck", { deck: deckName });
}

// ── Sync ──

export async function sync(): Promise<void> {
  await invoke("sync");
}
