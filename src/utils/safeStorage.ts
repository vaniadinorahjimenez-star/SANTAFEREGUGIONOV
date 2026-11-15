// Almacenamiento seguro resistente a QuotaExceededError con respaldo automático en IndexedDB

const IDB_NAME = 'santafe_pos_archive_db';
const IDB_STORE = 'collections';
const IDB_VERSION = 1;

const LARGE_KEYS = new Set([
  'santafe_tickets_v1',
  'santafe_supplier_bills_v1',
  'santafe_orders_v1',
  'santafe_shift_cuts_v1',
  'santafe_operational_expenses_v1',
  'santafe_vip_orders_v1'
]);

const memoryFallback = new Map<string, string>();
let idbPromise: Promise<IDBDatabase | null> | null = null;

function openArchiveDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (!idbPromise) {
    idbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return idbPromise;
}

export async function saveToIndexedDB(key: string, jsonStr: string): Promise<void> {
  try {
    const db = await openArchiveDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(jsonStr, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // ignore IDB errors
  }
}

export async function loadFromIndexedDB<T = any>(key: string): Promise<T | null> {
  try {
    const db = await openArchiveDB();
    if (!db) return null;
    const raw = await new Promise<string | null>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch {
    // ignore
  }
  return null;
}

function compactBillsForLocalStorage(bills: any[]): any[] {
  return bills.map((b) => {
    if (!b || typeof b !== 'object') return b;
    const copy = { ...b };
    if (typeof copy.receiptImageUrl === 'string' && copy.receiptImageUrl.length > 2048) {
      copy.receiptImageUrl = '';
    }
    if (typeof copy.invoiceFileUrl === 'string' && copy.invoiceFileUrl.length > 2048) {
      copy.invoiceFileUrl = '';
    }
    return copy;
  });
}

function stripLargeFieldsIfNeeded(key: string, parsed: any[]): boolean {
  if (key === 'santafe_tickets_v1') {
    const limits = [2500, 1500, 900, 450, 200, 80];
    for (const limit of limits) {
      if (parsed.length <= limit) continue;
      try {
        localStorage.setItem(key, JSON.stringify(parsed.slice(0, limit)));
        return true;
      } catch {
        // probar límite menor
      }
    }
  }

  if (key === 'santafe_supplier_bills_v1') {
    try {
      const compacted = compactBillsForLocalStorage(parsed);
      localStorage.setItem(key, JSON.stringify(compacted));
      return true;
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * Escribe en localStorage de manera 100% segura (jamás lanza QuotaExceededError).
 * Para colecciones grandes, también guarda el respaldo íntegro en IndexedDB.
 */
export function safeSetItem(key: string, value: string): void {
  memoryFallback.set(key, value);

  if (typeof window !== 'undefined' && LARGE_KEYS.has(key)) {
    saveToIndexedDB(key, value).catch(() => {});
  }

  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(key, value);
    return;
  } catch (err) {
    // Intentar liberar o compactar sin lanzar error al mostrador POS
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && stripLargeFieldsIfNeeded(key, parsed)) {
        return;
      }
    } catch {
      // ignore JSON parse failure
    }

    // Si falló otra clave (p. ej. orders) porque tickets + supplierBills llenaron los 5 MB,
    // compactar supplierBills y recortar caché viejo de tickets en localStorage (IndexedDB conserva todo)
    try {
      const billsRaw = localStorage.getItem('santafe_supplier_bills_v1');
      if (billsRaw && billsRaw.length > 150_000) {
        const bills = JSON.parse(billsRaw);
        if (Array.isArray(bills)) {
          saveToIndexedDB('santafe_supplier_bills_v1', billsRaw).catch(() => {});
          localStorage.setItem('santafe_supplier_bills_v1', JSON.stringify(compactBillsForLocalStorage(bills)));
        }
      }
      const ticketsRaw = localStorage.getItem('santafe_tickets_v1');
      if (ticketsRaw && ticketsRaw.length > 1_800_000) {
        const tickets = JSON.parse(ticketsRaw);
        if (Array.isArray(tickets) && tickets.length > 1200) {
          saveToIndexedDB('santafe_tickets_v1', ticketsRaw).catch(() => {});
          localStorage.setItem('santafe_tickets_v1', JSON.stringify(tickets.slice(0, 1200)));
        }
      }
      localStorage.setItem(key, value);
      return;
    } catch (e2) {
      console.warn(`[SafeStorage] Respaldo en memoria/IndexedDB activo para ${key}:`, (err as any)?.message || e2);
    }
  }
}

export function safeSetJson(key: string, data: unknown): string {
  const serialized = JSON.stringify(data);
  safeSetItem(key, serialized);
  return serialized;
}

export function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {
    // ignore
  }
  return memoryFallback.get(key) ?? null;
}
