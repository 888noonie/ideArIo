import type { SavedIdeario } from '../types/ideario';

const DB_NAME = 'ideario-db';
const DB_VERSION = 1;
const STORE_NAME = 'idearios';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Ideario storage is blocked by another open tab'));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
  });
}

async function withTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, setResult: (value: T) => void, fail: () => void) => void,
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    let result: T;
    let hasResult = false;

    const closeAndReject = (error: unknown) => {
      db.close();
      reject(error instanceof Error ? error : new Error('Ideario storage operation failed'));
    };

    tx.oncomplete = () => {
      db.close();
      if (hasResult) resolve(result);
      else reject(new Error('Ideario storage operation completed without a result'));
    };
    tx.onerror = () => closeAndReject(tx.error);
    tx.onabort = () => closeAndReject(tx.error);

    try {
      operation(
        tx.objectStore(STORE_NAME),
        (value) => {
          result = value;
          hasResult = true;
        },
        () => tx.abort(),
      );
    } catch (error) {
      closeAndReject(error);
      try {
        tx.abort();
      } catch {
        // The transaction may already have completed.
      }
    }
  });
}

export function saveToLocalDB(ideario: SavedIdeario): Promise<void> {
  return withTransaction('readwrite', (store, setResult, fail) => {
    const request = store.put(ideario);
    request.onsuccess = () => setResult(undefined);
    request.onerror = fail;
  });
}

export async function loadFromLocalDB(): Promise<SavedIdeario[]> {
  try {
    return await withTransaction('readonly', (store, setResult, fail) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const ideas = request.result as SavedIdeario[];
        setResult(ideas.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')));
      };
      request.onerror = fail;
    });
  } catch {
    return [];
  }
}

export function markAsSynced(id: string, gistId: string): Promise<void> {
  return withTransaction('readwrite', (store, setResult, fail) => {
    const getRequest = store.get(id);
    getRequest.onerror = fail;
    getRequest.onsuccess = () => {
      const idea = getRequest.result as SavedIdeario | undefined;
      if (!idea) {
        setResult(undefined);
        return;
      }

      const putRequest = store.put({ ...idea, synced: true, gist_id: gistId });
      putRequest.onsuccess = () => setResult(undefined);
      putRequest.onerror = fail;
    };
  });
}

export function deleteFromLocalDB(id: string): Promise<void> {
  return withTransaction('readwrite', (store, setResult, fail) => {
    const request = store.delete(id);
    request.onsuccess = () => setResult(undefined);
    request.onerror = fail;
  });
}
