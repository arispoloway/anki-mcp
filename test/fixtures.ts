import type { Config } from "../src/config.js";

/**
 * A minimal test config that exercises the major features:
 * - A search preset with searchFields, optional fields, tags, sorting
 * - A preset with custom parameters and scheduling data
 * - A preset with no searchFields
 * - A practice notes config with duplicate rejection
 * - A practice notes config without duplicate rejection
 */
export const testConfig: Config = {
  transport: "stdio",
  ankiConnect: {
    url: "http://127.0.0.1:8765",
    version: 6,
  },
  sync: {
    syncIntervalSeconds: 600,
  },
  presets: [
    {
      name: "search_notes",
      description: "Search vocabulary notes.",
      baseQuery: '"deck:TestDeck"',
      noteType: "TestModel",
      searchFields: ["Front", "Back"],
      searchDescription: "Search front and back fields.",
      tagFilters: ["verb", "noun"],
      defaultReturnedFields: ["Front"],
      optionalReturnedFields: ["Back", "Extra"],
      optionalReturnedTags: true,
      defaultLimit: 25,
      defaultSort: "added_desc",
      sortOptions: ["added_asc", "added_desc", "modified_asc", "modified_desc"],
    },
    {
      name: "recent",
      description: "Recently added notes.",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: config placeholder, not a template literal
      baseQuery: '"deck:TestDeck" introduced:${days}',
      noteType: "TestModel",
      parameters: {
        days: { type: "number", description: "Days back", default: 7 },
      },
      searchFields: [],
      defaultReturnedFields: ["Front"],
      optionalReturnedFields: ["Back"],
      optionalReturnedTags: false,
      defaultLimit: 10,
      defaultSort: "added_desc",
      sortOptions: ["added_asc", "added_desc"],
    },
    {
      name: "struggling",
      description: "Struggling notes with scheduling.",
      baseQuery: '"deck:TestDeck" prop:lapses>3',
      noteType: "TestModel",
      searchFields: [],
      defaultReturnedFields: ["Front"],
      optionalReturnedFields: ["Back"],
      optionalReturnedTags: false,
      includeSchedulingData: true,
      defaultLimit: 20,
      defaultSort: "lapses_desc",
      sortOptions: ["lapses_desc", "lapses_asc", "ease_asc", "ease_desc"],
    },
  ],
  practiceNotes: [
    {
      name: "practice",
      deckName: "Practice",
      noteType: "TestModel",
      description: "Create a practice note.",
      fields: [
        { name: "Front", description: "Front side", required: true },
        { name: "Back", description: "Back side", required: true },
        { name: "Extra", description: "Extra info", required: false },
      ],
      allowedTags: ["verb", "noun"],
      defaultTag: "generated",
    },
    {
      name: "vocab",
      deckName: "Vocab",
      noteType: "TestModel",
      description: "Save a new word.",
      fields: [
        { name: "Front", description: "Word", required: true },
        { name: "Back", description: "Definition", required: true },
      ],
      allowedTags: ["verb", "noun"],
      rejectDuplicates: "Front",
      defaultTag: "new",
    },
  ],
};
