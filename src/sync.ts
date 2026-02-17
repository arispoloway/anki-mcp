import { sync } from "./anki-client.js";
import { config } from "./config.js";

let lastSyncTime = 0;

function secondsSinceLastSync(): number {
  if (lastSyncTime === 0) return Infinity;
  return (Date.now() - lastSyncTime) / 1000;
}

/** Sync if more than syncIntervalSeconds have elapsed since the last sync. */
export async function syncIfStale(): Promise<void> {
  if (secondsSinceLastSync() < config.sync.syncIntervalSeconds) return;
  await sync();
  lastSyncTime = Date.now();
}
