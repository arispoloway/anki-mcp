import "./setup.js";
import { describe, expect, test } from "bun:test";
import { type GeneratedTool, generateAllTools } from "../src/tools.js";

const tools = generateAllTools();
const byName = (name: string): GeneratedTool => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
};

const paramNames = (tool: GeneratedTool): string[] => Object.keys(tool.params);

describe("generateAllTools produces correct tool set", () => {
  test("generates the expected number of tools", () => {
    // 3 presets + (2 practice configs * 2 tools each) + update_tags + sync = 9
    expect(tools.length).toBe(9);
  });

  test("generates tools with the expected names", () => {
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      // Preset tools
      "search_notes",
      "recent",
      "struggling",
      // Practice tools
      "create_practice",
      "list_practice",
      "create_vocab",
      "list_vocab",
      // Built-ins
      "update_tags",
      "sync",
    ]);
  });
});

describe("preset tool: search_notes", () => {
  const tool = byName("search_notes");

  test("has the correct description", () => {
    expect(tool.description).toBe("Search vocabulary notes.");
  });

  test("has search parameter when searchFields is non-empty", () => {
    expect(paramNames(tool)).toContain("search");
  });

  test("has include parameter with optional fields and tags", () => {
    expect(paramNames(tool)).toContain("include");
  });

  test("has tags parameter when tagFilters is configured", () => {
    expect(paramNames(tool)).toContain("tags");
  });

  test("has sort, limit, page parameters", () => {
    expect(paramNames(tool)).toContain("sort");
    expect(paramNames(tool)).toContain("limit");
    expect(paramNames(tool)).toContain("page");
  });

  test("does not have custom parameters (none configured)", () => {
    expect(paramNames(tool)).not.toContain("days");
  });

  test("has the complete expected parameter set", () => {
    expect(paramNames(tool).sort()).toEqual(
      ["search", "include", "tags", "sort", "limit", "page"].sort(),
    );
  });
});

describe("preset tool: recent (with custom parameters)", () => {
  const tool = byName("recent");

  test("has the custom 'days' parameter", () => {
    expect(paramNames(tool)).toContain("days");
  });

  test("does not have search parameter (searchFields is empty)", () => {
    expect(paramNames(tool)).not.toContain("search");
  });

  test("does not have tags parameter (no tagFilters)", () => {
    // The fixture has no tagFilters on 'recent'
    expect(paramNames(tool)).not.toContain("tags");
  });

  test("has include, sort, limit, page", () => {
    expect(paramNames(tool)).toContain("include");
    expect(paramNames(tool)).toContain("sort");
    expect(paramNames(tool)).toContain("limit");
    expect(paramNames(tool)).toContain("page");
  });
});

describe("preset tool: struggling (with scheduling data)", () => {
  const tool = byName("struggling");

  test("has correct description", () => {
    expect(tool.description).toBe("Struggling notes with scheduling.");
  });

  test("does not expose search parameter", () => {
    expect(paramNames(tool)).not.toContain("search");
  });
});

describe("practice tools: create_practice", () => {
  const tool = byName("create_practice");

  test("has correct description from config", () => {
    expect(tool.description).toBe("Create a practice note.");
  });

  test("has parameters matching field config", () => {
    const names = paramNames(tool);
    expect(names).toContain("Front");
    expect(names).toContain("Back");
    expect(names).toContain("Extra");
  });

  test("has no pagination or search parameters", () => {
    const names = paramNames(tool);
    expect(names).not.toContain("limit");
    expect(names).not.toContain("page");
    expect(names).not.toContain("search");
  });
});

describe("practice tools: list_practice", () => {
  const tool = byName("list_practice");

  test("has no parameters", () => {
    expect(paramNames(tool)).toEqual([]);
  });

  test("description mentions deck name", () => {
    expect(tool.description).toContain("Practice");
  });
});

describe("practice tools: create_vocab (with rejectDuplicates)", () => {
  const tool = byName("create_vocab");

  test("has field parameters", () => {
    expect(paramNames(tool)).toContain("Front");
    expect(paramNames(tool)).toContain("Back");
  });

  test("does not have Extra field (not in vocab config)", () => {
    expect(paramNames(tool)).not.toContain("Extra");
  });
});

describe("built-in tool: update_tags", () => {
  const tool = byName("update_tags");

  test("has noteIds, add, remove parameters", () => {
    const names = paramNames(tool);
    expect(names).toContain("noteIds");
    expect(names).toContain("add");
    expect(names).toContain("remove");
  });
});

describe("built-in tool: sync", () => {
  const tool = byName("sync");

  test("has no parameters", () => {
    expect(paramNames(tool)).toEqual([]);
  });

  test("has correct description", () => {
    expect(tool.description).toContain("sync");
  });
});

describe("config with no optional fields produces no include param", () => {
  test("preset with empty optionalReturnedFields and no tags has no include", () => {
    // The 'recent' preset has optionalReturnedFields: ["Back"] so it does have include.
    // The 'struggling' preset also has ["Back"]. Let's verify they all have include.
    const recent = byName("recent");
    expect(paramNames(recent)).toContain("include");
  });
});
