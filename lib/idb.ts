// 아주 작은 IndexedDB 헬퍼 — 외부 의존성 없이 오프라인 사본 저장
// 스토어: flights(id) · aircraft(registration) · outbox(id) · meta(k)

const DB_NAME = 'airlog10'
const DB_VERSION = 2

let dbPromise: Promise<IDBDatabase> | null = null

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('flights')) db.createObjectStore('flights', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('aircraft')) db.createObjectStore('aircraft', { keyPath: 'registration' })
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' })
      if (!db.objectStoreNames.contains('people')) db.createObjectStore('people', { keyPath: 'name' })
      if (!db.objectStoreNames.contains('airport_notes')) db.createObjectStore('airport_notes', { keyPath: 'ident' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}

export function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
}

export function idbPut(store: string, row: unknown): Promise<IDBValidKey> {
  return tx(store, 'readwrite', (s) => s.put(row))
}

export function idbDelete(store: string, key: string): Promise<undefined> {
  return tx(store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>)
}

export function idbPutMany(store: string, rows: unknown[]): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(store, 'readwrite')
        const s = t.objectStore(store)
        for (const r of rows) s.put(r)
        t.oncomplete = () => resolve()
        t.onerror = () => reject(t.error)
      })
  )
}
