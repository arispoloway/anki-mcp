import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Config {
  ankiConnect: {
    url: string;
    version: number;
  };
  deck: {
    name: string;
    generatedSubdeck: string;
  };
  noteType: {
    name: string;
    fields: {
      hanzi: string;
      color: string;
      pinyin: string;
      english: string;
      sound: string;
      includeAudioCard: string;
      notes: string;
    };
  };
  sync: {
    syncIntervalSeconds: number;
  };
  tags: {
    allowed: string[];
  };
  generatedPractice: {
    defaultTag: string;
  };
  defaults: {
    recentDays: number;
    maxResults: number;
    struggleLapsesThreshold: number;
    struggleEaseThreshold: number;
  };
}

const raw = readFileSync(join(__dirname, "..", "config.json"), "utf-8");
export const config: Config = JSON.parse(raw);
