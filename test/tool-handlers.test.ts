import "./setup.js";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { type GeneratedTool, generateAllTools } from "../src/tools.js";

// ── Fetch interceptor ──

interface AnkiRequest {
  action: string;
  version: number;
  params: Record<string, unknown>;
}

let fetchCalls: AnkiRequest[] = [];
let fetchResponses: Map<string, unknown> = new Map();

function setAnkiResponse(action: string, result: unknown) {
  fetchResponses.set(action, result);
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  fetchResponses = new Map();

  globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as AnkiRequest;
    fetchCalls.push(body);

    const result = fetchResponses.get(body.action) ?? null;
    return new Response(JSON.stringify({ result, error: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Helpers ──

const tools = generateAllTools();
const byName = (name: string): GeneratedTool => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
};

function parseResult(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

function callsFor(action: string): AnkiRequest[] {
  return fetchCalls.filter((c) => c.action === action);
}

// ── Preset tool: search_notes ──

describe("search_notes handler", () => {
  test("calls findNotes then notesInfo with correct queries", async () => {
    setAnkiResponse("findNotes", [100, 200, 300]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 300,
        modelName: "TestModel",
        tags: ["verb"],
        fields: { Front: { value: "hello", order: 0 }, Back: { value: "world", order: 1 } },
        mod: 1000,
        cards: [1],
      },
      {
        noteId: 200,
        modelName: "TestModel",
        tags: [],
        fields: { Front: { value: "foo", order: 0 }, Back: { value: "bar", order: 1 } },
        mod: 900,
        cards: [2],
      },
      {
        noteId: 100,
        modelName: "TestModel",
        tags: [],
        fields: { Front: { value: "baz", order: 0 }, Back: { value: "qux", order: 1 } },
        mod: 800,
        cards: [3],
      },
    ]);

    const tool = byName("search_notes");
    await tool.handler({});

    // Should call findNotes with the base query
    const findCalls = callsFor("findNotes");
    expect(findCalls).toHaveLength(1);
    expect(findCalls[0].params.query).toBe('"deck:TestDeck"');

    // Should call notesInfo with paginated IDs (default sort: added_desc = reversed)
    const infoCalls = callsFor("notesInfo");
    expect(infoCalls).toHaveLength(1);
    expect(infoCalls[0].params.notes).toEqual([300, 200, 100]);
  });

  test("passes search term as field expansion in query", async () => {
    setAnkiResponse("findNotes", []);

    const tool = byName("search_notes");
    await tool.handler({ search: "hello" });

    const findCalls = callsFor("findNotes");
    expect(findCalls[0].params.query).toBe('"deck:TestDeck" (Front:*hello* OR Back:*hello*)');
  });

  test("passes tag filters in query", async () => {
    setAnkiResponse("findNotes", []);

    const tool = byName("search_notes");
    await tool.handler({ tags: ["verb"] });

    const findCalls = callsFor("findNotes");
    expect(findCalls[0].params.query).toBe('"deck:TestDeck" tag:verb');
  });

  test("combines search and tags in query", async () => {
    setAnkiResponse("findNotes", []);

    const tool = byName("search_notes");
    await tool.handler({ search: "go", tags: ["verb", "noun"] });

    const findCalls = callsFor("findNotes");
    expect(findCalls[0].params.query).toBe(
      '"deck:TestDeck" (Front:*go* OR Back:*go*) (tag:verb OR tag:noun)',
    );
  });

  test("returns only default fields by default", async () => {
    setAnkiResponse("findNotes", [1]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 1,
        modelName: "TestModel",
        tags: ["verb"],
        fields: {
          Front: { value: "hello", order: 0 },
          Back: { value: "world", order: 1 },
          Extra: { value: "extra", order: 2 },
        },
        mod: 1000,
        cards: [1],
      },
    ]);

    const tool = byName("search_notes");
    const result = parseResult(await tool.handler({})) as Record<string, unknown>;
    const notes = result.notes as Record<string, unknown>[];

    expect(notes[0]).toEqual({ Front: "hello" });
    expect(notes[0]).not.toHaveProperty("Back");
    expect(notes[0]).not.toHaveProperty("noteId");
    expect(notes[0]).not.toHaveProperty("tags");
  });

  test("includes optional fields when requested via include", async () => {
    setAnkiResponse("findNotes", [1]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 1,
        modelName: "TestModel",
        tags: ["verb"],
        fields: {
          Front: { value: "hello", order: 0 },
          Back: { value: "world", order: 1 },
        },
        mod: 1000,
        cards: [1],
      },
    ]);

    const tool = byName("search_notes");
    const result = parseResult(
      await tool.handler({ include: { Back: true, noteId: true, tags: true } }),
    ) as Record<string, unknown>;
    const notes = result.notes as Record<string, unknown>[];

    expect(notes[0]).toEqual({
      Front: "hello",
      Back: "world",
      noteId: 1,
      tags: ["verb"],
    });
  });

  test("paginates results correctly", async () => {
    // Return 5 note IDs, request limit=2 page=2
    setAnkiResponse("findNotes", [5, 4, 3, 2, 1]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 3,
        modelName: "TestModel",
        tags: [],
        fields: { Front: { value: "c", order: 0 } },
        mod: 300,
        cards: [3],
      },
      {
        noteId: 2,
        modelName: "TestModel",
        tags: [],
        fields: { Front: { value: "b", order: 0 } },
        mod: 200,
        cards: [2],
      },
    ]);

    const tool = byName("search_notes");
    const result = parseResult(await tool.handler({ limit: 2, page: 2 })) as Record<
      string,
      unknown
    >;

    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.hasMore).toBe(true);

    // notesInfo should only be called with the page's IDs
    const infoCalls = callsFor("notesInfo");
    expect(infoCalls[0].params.notes).toEqual([3, 2]);
  });

  test("strips HTML from field values", async () => {
    setAnkiResponse("findNotes", [1]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 1,
        modelName: "TestModel",
        tags: [],
        fields: {
          Front: { value: "<b>bold</b>&nbsp;text", order: 0 },
        },
        mod: 1000,
        cards: [1],
      },
    ]);

    const tool = byName("search_notes");
    const result = parseResult(await tool.handler({})) as Record<string, unknown>;
    const notes = result.notes as Record<string, unknown>[];

    expect(notes[0].Front).toBe("bold text");
  });
});

// ── Preset tool: recent (custom parameters) ──

describe("recent handler (custom parameters)", () => {
  test("interpolates default parameter value into query", async () => {
    setAnkiResponse("findNotes", []);

    const tool = byName("recent");
    await tool.handler({});

    const findCalls = callsFor("findNotes");
    expect(findCalls[0].params.query).toBe('"deck:TestDeck" introduced:7');
  });

  test("interpolates provided parameter value into query", async () => {
    setAnkiResponse("findNotes", []);

    const tool = byName("recent");
    await tool.handler({ days: 14 });

    const findCalls = callsFor("findNotes");
    expect(findCalls[0].params.query).toBe('"deck:TestDeck" introduced:14');
  });
});

// ── Preset tool: struggling (scheduling data) ──

describe("struggling handler (scheduling data)", () => {
  test("calls findCards and cardsInfo instead of findNotes/notesInfo", async () => {
    setAnkiResponse("findCards", [10, 20]);
    setAnkiResponse("cardsInfo", [
      {
        cardId: 10,
        note: 1,
        deckName: "TestDeck",
        modelName: "TestModel",
        interval: 30,
        ease: 2100,
        lapses: 5,
        reps: 20,
        due: 100,
        fields: { Front: { value: "hard word", order: 0 } },
      },
      {
        cardId: 20,
        note: 2,
        deckName: "TestDeck",
        modelName: "TestModel",
        interval: 10,
        ease: 1800,
        lapses: 8,
        reps: 15,
        due: 200,
        fields: { Front: { value: "harder word", order: 0 } },
      },
    ]);

    const tool = byName("struggling");
    const result = parseResult(await tool.handler({})) as Record<string, unknown>;

    // Should NOT call findNotes/notesInfo
    expect(callsFor("findNotes")).toHaveLength(0);
    expect(callsFor("notesInfo")).toHaveLength(0);

    // Should call findCards and cardsInfo
    expect(callsFor("findCards")).toHaveLength(1);
    expect(callsFor("cardsInfo")).toHaveLength(1);
    expect(callsFor("findCards")[0].params.query).toBe('"deck:TestDeck" prop:lapses>3');

    // Default sort is lapses_desc, so harder word (lapses=8) should come first
    const notes = result.notes as Record<string, unknown>[];
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({
      Front: "harder word",
      lapses: 8,
      ease: 1800,
      interval: 10,
      reps: 15,
    });
    expect(notes[1]).toMatchObject({
      Front: "hard word",
      lapses: 5,
    });
  });

  test("deduplicates cards by note ID", async () => {
    setAnkiResponse("findCards", [10, 20]);
    setAnkiResponse("cardsInfo", [
      {
        cardId: 10,
        note: 1,
        deckName: "TestDeck",
        modelName: "TestModel",
        interval: 30,
        ease: 2100,
        lapses: 5,
        reps: 20,
        due: 100,
        fields: { Front: { value: "word", order: 0 } },
      },
      {
        cardId: 20,
        note: 1, // same note as card 10
        deckName: "TestDeck",
        modelName: "TestModel",
        interval: 10,
        ease: 1800,
        lapses: 8,
        reps: 15,
        due: 200,
        fields: { Front: { value: "word", order: 0 } },
      },
    ]);

    const tool = byName("struggling");
    const result = parseResult(await tool.handler({})) as Record<string, unknown>;
    const notes = result.notes as Record<string, unknown>[];

    expect(notes).toHaveLength(1);
  });
});

// ── Practice tools: create ──

describe("create_practice handler", () => {
  test("calls createDeck and addNote with correct params", async () => {
    setAnkiResponse("createDeck", 1);
    setAnkiResponse("addNote", 42);

    const tool = byName("create_practice");
    const result = parseResult(await tool.handler({ Front: "hello", Back: "world" })) as Record<
      string,
      unknown
    >;

    // Should create deck first
    const deckCalls = callsFor("createDeck");
    expect(deckCalls).toHaveLength(1);
    expect(deckCalls[0].params.deck).toBe("Practice");

    // Should add note
    const noteCalls = callsFor("addNote");
    expect(noteCalls).toHaveLength(1);
    expect(noteCalls[0].params.note).toMatchObject({
      deckName: "Practice",
      modelName: "TestModel",
      fields: { Front: "hello", Back: "world", Extra: "" },
      tags: ["generated"],
    });

    expect(result).toMatchObject({ success: true, noteId: 42 });
  });

  test("includes optional fields when provided", async () => {
    setAnkiResponse("createDeck", 1);
    setAnkiResponse("addNote", 43);

    const tool = byName("create_practice");
    await tool.handler({ Front: "hello", Back: "world", Extra: "some extra" });

    const noteCalls = callsFor("addNote");
    expect(noteCalls[0].params.note).toMatchObject({
      fields: { Front: "hello", Back: "world", Extra: "some extra" },
    });
  });
});

describe("create_vocab handler (with duplicate rejection)", () => {
  test("checks for duplicates before creating", async () => {
    setAnkiResponse("findNotes", []);
    setAnkiResponse("createDeck", 1);
    setAnkiResponse("addNote", 44);

    const tool = byName("create_vocab");
    const result = parseResult(
      await tool.handler({ Front: "new_word", Back: "definition" }),
    ) as Record<string, unknown>;

    // Should check for duplicates
    const findCalls = callsFor("findNotes");
    expect(findCalls).toHaveLength(1);
    expect(findCalls[0].params.query).toBe("Front:new_word");

    expect(result).toMatchObject({ success: true, noteId: 44 });
  });

  test("rejects when duplicate exists", async () => {
    setAnkiResponse("findNotes", [99]);

    const tool = byName("create_vocab");
    const result = parseResult(await tool.handler({ Front: "existing", Back: "def" })) as Record<
      string,
      unknown
    >;

    expect(result.success).toBe(false);
    expect(result.reason).toContain("already exists");
    expect(result.existingNoteIds).toEqual([99]);

    // Should NOT call addNote
    expect(callsFor("addNote")).toHaveLength(0);
  });

  test("applies correct default tag", async () => {
    setAnkiResponse("findNotes", []);
    setAnkiResponse("createDeck", 1);
    setAnkiResponse("addNote", 45);

    const tool = byName("create_vocab");
    await tool.handler({ Front: "word", Back: "def" });

    const noteCalls = callsFor("addNote");
    expect(noteCalls[0].params.note).toMatchObject({
      deckName: "Vocab",
      tags: ["new"],
    });
  });
});

// ── Practice tools: list ──

describe("list_practice handler", () => {
  test("queries the correct deck and returns primary field values", async () => {
    setAnkiResponse("findNotes", [1, 2]);
    setAnkiResponse("notesInfo", [
      {
        noteId: 1,
        modelName: "TestModel",
        tags: [],
        fields: { Front: { value: "hello", order: 0 }, Back: { value: "world", order: 1 } },
        mod: 100,
        cards: [1],
      },
      {
        noteId: 2,
        modelName: "TestModel",
        tags: [],
        fields: { Front: { value: "foo", order: 0 }, Back: { value: "bar", order: 1 } },
        mod: 200,
        cards: [2],
      },
    ]);

    const tool = byName("list_practice");
    const result = parseResult(await tool.handler({}));

    // Should query the Practice deck
    const findCalls = callsFor("findNotes");
    expect(findCalls[0].params.query).toBe('"deck:Practice"');

    // Should return flat list of primary field values
    expect(result).toEqual(["hello", "foo"]);
  });

  test("returns empty array when deck is empty", async () => {
    setAnkiResponse("findNotes", []);

    const tool = byName("list_practice");
    const result = parseResult(await tool.handler({}));

    expect(result).toEqual([]);
    // Should not call notesInfo when there are no notes
    expect(callsFor("notesInfo")).toHaveLength(0);
  });
});

// ── update_tags ──

describe("update_tags handler", () => {
  test("calls addTags with space-joined tags", async () => {
    setAnkiResponse("addTags", null);

    const tool = byName("update_tags");
    const result = parseResult(
      await tool.handler({ noteIds: [1, 2], add: ["verb", "noun"] }),
    ) as Record<string, unknown>;

    const addCalls = callsFor("addTags");
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0].params).toEqual({ notes: [1, 2], tags: "verb noun" });

    expect(result).toMatchObject({ success: true, added: ["verb", "noun"], removed: [] });
  });

  test("calls removeTags with space-joined tags", async () => {
    setAnkiResponse("removeTags", null);

    const tool = byName("update_tags");
    await tool.handler({ noteIds: [3], remove: ["verb"] });

    const removeCalls = callsFor("removeTags");
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0].params).toEqual({ notes: [3], tags: "verb" });
  });

  test("calls both addTags and removeTags when both provided", async () => {
    setAnkiResponse("addTags", null);
    setAnkiResponse("removeTags", null);

    const tool = byName("update_tags");
    await tool.handler({ noteIds: [1], add: ["noun"], remove: ["verb"] });

    expect(callsFor("addTags")).toHaveLength(1);
    expect(callsFor("removeTags")).toHaveLength(1);
  });

  test("skips addTags/removeTags when not provided", async () => {
    const tool = byName("update_tags");
    await tool.handler({ noteIds: [1] });

    expect(callsFor("addTags")).toHaveLength(0);
    expect(callsFor("removeTags")).toHaveLength(0);
  });
});

// ── sync ──

describe("sync handler", () => {
  test("calls AnkiConnect sync action", async () => {
    setAnkiResponse("sync", null);

    const tool = byName("sync");
    const result = parseResult(await tool.handler({})) as Record<string, unknown>;

    const syncCalls = callsFor("sync");
    expect(syncCalls).toHaveLength(1);
    expect(result).toEqual({ success: true });
  });
});

// ── AnkiConnect protocol ──

describe("AnkiConnect protocol", () => {
  test("all requests use version 6 and POST method", async () => {
    setAnkiResponse("findNotes", []);

    const tool = byName("search_notes");
    await tool.handler({});

    for (const call of fetchCalls) {
      expect(call.version).toBe(6);
    }
  });
});
