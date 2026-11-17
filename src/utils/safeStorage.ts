// Almacenamiento seguro resistente a QuotaExceededError con respaldo automático en IndexedDB

const IDB_NAME = 'santafe_pos_archive_db';
const IDB_STORE = 'collections';
const IDB_MEDIA_STORE = 'supplier_media';
const IDB_VERSION = 2;

export interface SupplierMediaRecord {
  id: string;
  receiptImageUrl?: string;
  receiptFileName?: string;
  receiptUploadedAt?: string;
  receiptDeletedAt?: string;
  invoiceFileUrl?: string;
  invoiceFileName?: string;
  invoiceUploadedAt?: string;
  invoiceDeletedAt?: string;
  updatedAt?: string;
}

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
          if (!db.objectStoreNames.contains(IDB_MEDIA_STORE)) {
            db.createObjectStore(IDB_MEDIA_STORE, { keyPath: 'id' });
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

function toMs(iso?: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function mergeMediaField(
  existingRec: Partial<SupplierMediaRecord> | undefined,
  incomingRec: Partial<SupplierMediaRecord>
): Partial<SupplierMediaRecord> {
  const prevUrlR = existingRec?.receiptImageUrl || '';
  const incUrlR = incomingRec.receiptImageUrl || '';
  const incDeletedR = toMs(incomingRec.receiptDeletedAt);
  const prevDeletedR = toMs(existingRec?.receiptDeletedAt);
  const prevUploadedR = Math.max(toMs(existingRec?.receiptUploadedAt), toMs(existingRec?.updatedAt));
  const incUploadedR = Math.max(toMs(incomingRec.receiptUploadedAt), toMs(incomingRec.updatedAt));

  let receiptImageUrl = incUrlR || prevUrlR;
  let receiptFileName = incomingRec.receiptFileName ?? existingRec?.receiptFileName;
  let receiptUploadedAt = incomingRec.receiptUploadedAt ?? existingRec?.receiptUploadedAt;
  let receiptDeletedAt = incDeletedR >= prevDeletedR ? incomingRec.receiptDeletedAt : existingRec?.receiptDeletedAt;

  if (incDeletedR > 0 && incDeletedR >= Math.max(prevUploadedR, incUploadedR) && !incUrlR) {
    receiptImageUrl = '';
    receiptFileName = '';
    receiptUploadedAt = '';
  } else if (incUrlR && prevUrlR && incUploadedR < prevUploadedR) {
    receiptImageUrl = prevUrlR;
    receiptFileName = existingRec?.receiptFileName ?? incomingRec.receiptFileName;
    receiptUploadedAt = existingRec?.receiptUploadedAt ?? incomingRec.receiptUploadedAt;
  }

  const prevUrlI = existingRec?.invoiceFileUrl || '';
  const incUrlI = incomingRec.invoiceFileUrl || '';
  const incDeletedI = toMs(incomingRec.invoiceDeletedAt);
  const prevDeletedI = toMs(existingRec?.invoiceDeletedAt);
  const prevUploadedI = Math.max(toMs(existingRec?.invoiceUploadedAt), toMs(existingRec?.updatedAt));
  const incUploadedI = Math.max(toMs(incomingRec.invoiceUploadedAt), toMs(incomingRec.updatedAt));

  let invoiceFileUrl = incUrlI || prevUrlI;
  let invoiceFileName = incomingRec.invoiceFileName ?? existingRec?.invoiceFileName;
  let invoiceUploadedAt = incomingRec.invoiceUploadedAt ?? existingRec?.invoiceUploadedAt;
  let invoiceDeletedAt = incDeletedI >= prevDeletedI ? incomingRec.invoiceDeletedAt : existingRec?.invoiceDeletedAt;

  if (incDeletedI > 0 && incDeletedI >= Math.max(prevUploadedI, incUploadedI) && !incUrlI) {
    invoiceFileUrl = '';
    invoiceFileName = '';
    invoiceUploadedAt = '';
  } else if (incUrlI && prevUrlI && incUploadedI < prevUploadedI) {
    invoiceFileUrl = prevUrlI;
    invoiceFileName = existingRec?.invoiceFileName ?? incomingRec.invoiceFileName;
    invoiceUploadedAt = existingRec?.invoiceUploadedAt ?? incomingRec.invoiceUploadedAt;
  }

  return {
    receiptImageUrl,
    receiptFileName,
    receiptUploadedAt,
    receiptDeletedAt,
    invoiceFileUrl,
    invoiceFileName,
    invoiceUploadedAt,
    invoiceDeletedAt,
    updatedAt: incomingRec.updatedAt || existingRec?.updatedAt || new Date().toISOString()
  };
}

export async function saveSupplierMediaItem(bill: Partial<SupplierMediaRecord> & { id: string }): Promise<void> {
  if (!bill?.id) return;
  try {
    const db = await openArchiveDB();
    if (!db || !db.objectStoreNames.contains(IDB_MEDIA_STORE)) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_MEDIA_STORE, 'readwrite');
        const store = tx.objectStore(IDB_MEDIA_STORE);
        const getReq = store.get(bill.id);
        getReq.onsuccess = () => {
          const existing = getReq.result as SupplierMediaRecord | undefined;
          const merged = mergeMediaField(existing, bill);
          const nextRec: SupplierMediaRecord = {
            id: bill.id,
            ...merged
          };
          // Solo guardar si hay algún medio o marca de borrado explícito
          if (
            nextRec.receiptImageUrl ||
            nextRec.invoiceFileUrl ||
            nextRec.receiptDeletedAt ||
            nextRec.invoiceDeletedAt
          ) {
            store.put(nextRec);
          }
        };
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

export async function deleteSupplierMediaItem(billId: string, field?: 'receipt' | 'invoice'): Promise<void> {
  if (!billId) return;
  try {
    const db = await openArchiveDB();
    if (!db || !db.objectStoreNames.contains(IDB_MEDIA_STORE)) return;
    const nowIso = new Date().toISOString();

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_MEDIA_STORE, 'readwrite');
        const store = tx.objectStore(IDB_MEDIA_STORE);
        if (!field) {
          store.delete(billId);
        } else {
          const getReq = store.get(billId);
          getReq.onsuccess = () => {
            const existing = (getReq.result as SupplierMediaRecord | undefined) || { id: billId };
            if (field === 'receipt') {
              existing.receiptImageUrl = '';
              existing.receiptFileName = '';
              existing.receiptUploadedAt = '';
              existing.receiptDeletedAt = nowIso;
            } else if (field === 'invoice') {
              existing.invoiceFileUrl = '';
              existing.invoiceFileName = '';
              existing.invoiceUploadedAt = '';
              existing.invoiceDeletedAt = nowIso;
            }
            existing.updatedAt = nowIso;
            store.put(existing);
          };
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // ignore
  }
}

export async function loadAllSupplierMediaMap(): Promise<Map<string, SupplierMediaRecord>> {
  const result = new Map<string, SupplierMediaRecord>();
  try {
    const db = await openArchiveDB();
    if (!db || !db.objectStoreNames.contains(IDB_MEDIA_STORE)) return result;
    const rows = await new Promise<SupplierMediaRecord[]>((resolve) => {
      try {
        const tx = db.transaction(IDB_MEDIA_STORE, 'readonly');
        const req = tx.objectStore(IDB_MEDIA_STORE).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    for (const r of rows) {
      if (r && r.id) result.set(r.id, r);
    }
  } catch {
    // ignore
  }
  return result;
}

export async function hydrateBillsWithMedia<
  T extends {
    id: string;
    receiptImageUrl?: string;
    receiptFileName?: string;
    receiptUploadedAt?: string;
    receiptDeletedAt?: string;
    invoiceFileUrl?: string;
    invoiceFileName?: string;
    invoiceUploadedAt?: string;
    invoiceDeletedAt?: string;
    updatedAt?: string;
  }
>(bills: T[]): Promise<{ bills: T[]; recoveredCount: number }> {
  try {
    const [mediaMap, archivedBills] = await Promise.all([
      loadAllSupplierMediaMap(),
      loadFromIndexedDB<any[]>('santafe_supplier_bills_v1')
    ]);

    const archiveMap = new Map<string, any>();
    if (Array.isArray(archivedBills)) {
      for (const b of archivedBills) {
        if (b && b.id) archiveMap.set(b.id, b);
      }
    }

    let recoveredCount = 0;
    const hydrated = (bills || []).map((bill) => {
      if (!bill?.id) return bill;
      const fromMedia = mediaMap.get(bill.id);
      const fromArchive = archiveMap.get(bill.id);
      const combinedSource = fromMedia || fromArchive
        ? mergeMediaField(fromArchive, fromMedia || {})
        : null;

      if (!combinedSource) return bill;

      const merged = mergeMediaField(combinedSource, bill);
      const recoveredReceipt = !bill.receiptImageUrl && Boolean(merged.receiptImageUrl);
      const recoveredInvoice = !bill.invoiceFileUrl && Boolean(merged.invoiceFileUrl);
      if (recoveredReceipt || recoveredInvoice) {
        recoveredCount++;
      }

      return {
        ...bill,
        ...merged
      };
    });

    return { bills: hydrated, recoveredCount };
  } catch {
    return { bills: bills || [], recoveredCount: 0 };
  }
}

async function persistSupplierBillsMediaNonDestructively(parsed: any[]): Promise<string> {
  try {
    const [mediaMap, existingArchive] = await Promise.all([
      loadAllSupplierMediaMap(),
      loadFromIndexedDB<any[]>('santafe_supplier_bills_v1')
    ]);
    const archiveMap = new Map<string, any>();
    if (Array.isArray(existingArchive)) {
      for (const item of existingArchive) {
        if (item?.id) archiveMap.set(item.id, item);
      }
    }

    const enriched = parsed.map((bill) => {
      if (!bill || !bill.id) return bill;
      const prev = mergeMediaField(archiveMap.get(bill.id), mediaMap.get(bill.id) || {});
      const merged = mergeMediaField(prev, bill);
      const next = { ...bill, ...merged };
      if (next.receiptImageUrl || next.invoiceFileUrl || next.receiptDeletedAt || next.invoiceDeletedAt) {
        saveSupplierMediaItem(next).catch(() => {});
      }
      return next;
    });

    return JSON.stringify(enriched);
  } catch {
    return JSON.stringify(parsed);
  }
}

export async function saveToIndexedDB(key: string, jsonStr: string): Promise<void> {
  try {
    let payloadToSave = jsonStr;
    if (key === 'santafe_supplier_bills_v1') {
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          payloadToSave = await persistSupplierBillsMediaNonDestructively(parsed);
        }
      } catch {
        // use raw jsonStr
      }
    }

    const db = await openArchiveDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(payloadToSave, key);
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
