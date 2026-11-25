/** Remembers that the first-visit hint has been seen, so it shows only once. */

const KEY = 'morpho:welcomed';

/** The bit of Storage this needs; null where storage is unavailable. */
export type HintStorage = Pick<Storage, 'getItem' | 'setItem'> | null;

/** True until markWelcomed has run on this device. Storage that throws counts as a first visit. */
export function isFirstVisit(storage: HintStorage): boolean {
  try {
    return storage?.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}

export function markWelcomed(storage: HintStorage): void {
  try {
    storage?.setItem(KEY, '1');
  } catch {
    // Private browsing or full storage: the hint may show again next time, which is fine.
  }
}

/** localStorage, or null where touching it throws (some privacy settings do). */
export function browserStorage(): HintStorage {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
