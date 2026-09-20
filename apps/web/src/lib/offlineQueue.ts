export interface QueuedAction {
  key: string;
  method: string;
  path: string;
  body?: unknown;
  /** The idempotency key the original request used, carried through replay. */
  idempotencyKey?: string;
  createdAt: number;
}

const DB_NAME = "prodapp-pending";
const STORE = "actions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function pushAction(action: Omit<QueuedAction, "key" | "createdAt">): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({
      ...action,
      key: crypto.randomUUID(),
      createdAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingActions(): Promise<QueuedAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const getAll = tx.objectStore(STORE).getAll();
    getAll.onsuccess = () => resolve((getAll.result as QueuedAction[]) ?? []);
    getAll.onerror = () => reject(getAll.error);
  });
}

export async function removeAction(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Drop every queued write (used when signing out or resetting local data). */
export async function clearPendingActions(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // No database/db unopened — nothing to clear.
  }
}