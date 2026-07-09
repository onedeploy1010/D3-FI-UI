import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const STORE_FILE = path.join(DATA_DIR, "user-store.json");

export type UserStore = {
  ownedStrategies: string[];
  knowledgeBase: string[];
  tokens: number;
  trainedAgents: unknown[];
  notificationChannels: unknown[];
};

const DEFAULT_STORE: UserStore = {
  ownedStrategies: ["poly-momentum", "deep-value"],
  knowledgeBase: [],
  tokens: 500,
  trainedAgents: [],
  notificationChannels: [],
};

function ensureStore(): UserStore {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(DEFAULT_STORE, null, 2));
    return { ...DEFAULT_STORE };
  }
  try {
    return { ...DEFAULT_STORE, ...JSON.parse(fs.readFileSync(STORE_FILE, "utf-8")) };
  } catch {
    return { ...DEFAULT_STORE };
  }
}

export function readStore(): UserStore {
  return ensureStore();
}

export function writeStore(patch: Partial<UserStore>): UserStore {
  const next = { ...readStore(), ...patch };
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(next, null, 2));
  return next;
}
