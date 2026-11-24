import { normalizeWork } from './works.js';

const DATABASE_NAME = 'humster-library';
const DATABASE_VERSION = 1;
const STORE_NAME = 'collections';
const COLLECTION_KEY = 'current';
const LEGACY_STORAGE_KEY = 'humster-library-v1';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLibrary() {
  try {
    const database = await openDatabase();
    const saved = await requestResult(database.transaction(STORE_NAME).objectStore(STORE_NAME).get(COLLECTION_KEY));
    database.close();
    if (Array.isArray(saved)) return saved.map(normalizeWork).filter(Boolean);
  } catch {
    // Continue with the older metadata-only localStorage format when IndexedDB is unavailable.
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
    return Array.isArray(legacy) ? legacy.map(normalizeWork).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function saveLibrary(works) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(works, COLLECTION_KEY);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}
