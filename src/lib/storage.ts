import type { SavedIdeario } from '../types/ideario';

const DB_NAME = 'ideario-db';
const DB_VERSION = 1;
const STORE_NAME = 'idearios';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
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

export async function saveToLocalDB(ideario: SavedIdeario): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(ideario);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadFromLocalDB(): Promise<SavedIdeario[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as SavedIdeario[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function markAsSynced(id: string, gistId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const data = getReq.result as SavedIdeario | undefined;
      if (data) {
        data.synced = true;
        data.gist_id = gistId;
        store.put(data);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function deleteFromLocalDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
