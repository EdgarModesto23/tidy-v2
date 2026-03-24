import { browser } from "$app/environment";
import type { ProgramDetailPayload } from "$lib/learning/programBundle";

const PREFIX = "tidy:learning:v1";

/** Max age before a cache entry is ignored and data is refetched. */
const MAX_AGE_MS = 5 * 60 * 1000;

export type ProgramListPayload = {
  programs: Array<{
    id: string;
    name: string;
    description: string | null;
    target_start_date: string | null;
    target_end_date: string | null;
    reason: string;
    updated_at: string;
    completed_at?: string | null;
  }>;
  loadError: string | null;
  list_version: number;
};

type Timestamped<T> = { payload: T; storedAt: number };

const memoryList = new Map<string, Timestamped<ProgramListPayload>>();
const memoryProgram = new Map<string, Timestamped<ProgramDetailPayload>>();

function listStorageKey(userId: string) {
  return `${PREFIX}:list:${userId}`;
}

function programStorageKey(userId: string, programId: string) {
  return `${PREFIX}:prog:${userId}:${programId}`;
}

function isFresh(entry: Timestamped<unknown>): boolean {
  return Date.now() - entry.storedAt < MAX_AGE_MS;
}

export function getCachedProgramList(userId: string): ProgramListPayload | null {
  const k = listStorageKey(userId);
  const mem = memoryList.get(k);
  if (mem && isFresh(mem)) return mem.payload;

  if (!browser) return null;
  try {
    const raw = sessionStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Timestamped<ProgramListPayload>;
    if (!parsed?.payload || typeof parsed.storedAt !== "number") return null;
    if (!isFresh(parsed)) {
      sessionStorage.removeItem(k);
      return null;
    }
    memoryList.set(k, parsed);
    return parsed.payload;
  } catch {
    return null;
  }
}

export function setCachedProgramList(userId: string, payload: ProgramListPayload) {
  const k = listStorageKey(userId);
  const entry: Timestamped<ProgramListPayload> = {
    payload,
    storedAt: Date.now(),
  };
  memoryList.set(k, entry);
  if (browser) {
    try {
      sessionStorage.setItem(k, JSON.stringify(entry));
    } catch {
      /* quota or private mode */
    }
  }
}

export function getCachedProgramBundle(
  userId: string,
  programId: string,
): ProgramDetailPayload | null {
  const k = programStorageKey(userId, programId);
  const mem = memoryProgram.get(k);
  if (mem && isFresh(mem)) return mem.payload;

  if (!browser) return null;
  try {
    const raw = sessionStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Timestamped<ProgramDetailPayload>;
    if (!parsed?.payload || typeof parsed.storedAt !== "number") return null;
    if (!isFresh(parsed)) {
      sessionStorage.removeItem(k);
      return null;
    }
    memoryProgram.set(k, parsed);
    return parsed.payload;
  } catch {
    return null;
  }
}

export function setCachedProgramBundle(
  userId: string,
  programId: string,
  payload: ProgramDetailPayload,
) {
  const k = programStorageKey(userId, programId);
  const entry: Timestamped<ProgramDetailPayload> = {
    payload,
    storedAt: Date.now(),
  };
  memoryProgram.set(k, entry);
  if (browser) {
    try {
      sessionStorage.setItem(k, JSON.stringify(entry));
    } catch {
      /* quota */
    }
  }
}

export function clearProgramListCache(userId: string) {
  const k = listStorageKey(userId);
  memoryList.delete(k);
  if (browser) sessionStorage.removeItem(k);
}

export function clearProgramBundleCache(userId: string, programId: string) {
  const k = programStorageKey(userId, programId);
  memoryProgram.delete(k);
  if (browser) sessionStorage.removeItem(k);
}

/** Clear all learning caches for every user (e.g. sign-out). */
export function clearAllLearningCaches() {
  memoryList.clear();
  memoryProgram.clear();
  if (!browser) return;
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
  }
}
