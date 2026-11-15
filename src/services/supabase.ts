import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import { safeGetItem, safeSetJson } from '../utils/safeStorage';
import type {
  SaleTicket,
  BakeryOrder,
  ShiftCutRecord,
  CashOutflowItem,
  Customer,
  DriverCustomer,
  OperationalExpense,
  SupplierBill,
  SupplierBankInfo,
  VipCustomer,
  VipOrder,
  BranchId,
  DriverDaySettlement,
} from '../types';

export const SUPABASE_PROJECT_ID = 'icroicyyekqxmufyxeqc';
export const SUPABASE_URL = (
  ((import.meta as any).env?.VITE_SUPABASE_URL as string | undefined) ||
  `https://${SUPABASE_PROJECT_ID}.supabase.co`
).trim();
const SUPABASE_ANON_KEY = (
  ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined) || ''
).trim();

const SUPABASE_REQUEST_TIMEOUT_MS = 6000;
const SUPABASE_OUTBOX_KEY = 'santafe_supabase_outbox_v1';

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    // Llamar abort() sin argumento para conservar name === 'AbortError' y detener reintentos de postgrest-js
    controller.abort();
  }, timeoutMs);

  const externalSignal = init?.signal;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

// Limpiar bloqueo previo de cuota de Firebase para reactivar guardados en la nube al instante
try {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('santafe_firestore_quota_exceeded');
  }
} catch {}

let browserSupabaseClient: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    browserSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
      global: {
        fetch: (input, init) => fetchWithTimeout(input, init, SUPABASE_REQUEST_TIMEOUT_MS),
      },
    });
  } catch (e) {
    console.warn('[Supabase] No se pudo inicializar cliente directo:', e);
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  return browserSupabaseClient;
}

export interface SupabaseStatusInfo {
  configured: boolean;
  projectId: string;
  url: string;
  mode: 'client_anon' | 'server_proxy' | 'unconfigured';
  tablesReady: boolean;
  pendingCount?: number;
  error?: string;
}

let cachedStatus: SupabaseStatusInfo = {
  configured: Boolean(SUPABASE_ANON_KEY),
  projectId: SUPABASE_PROJECT_ID,
  url: SUPABASE_URL,
  mode: SUPABASE_ANON_KEY ? 'client_anon' : 'unconfigured',
  tablesReady: false,
  pendingCount: 0,
};

const statusSubscribers = new Set<(status: SupabaseStatusInfo) => void>();

export function getCachedSupabaseStatus(): SupabaseStatusInfo {
  return cachedStatus;
}

export function onSupabaseStatusChange(cb: (status: SupabaseStatusInfo) => void): () => void {
  statusSubscribers.add(cb);
  cb(cachedStatus);
  return () => {
    statusSubscribers.delete(cb);
  };
}

function updateSupabaseStatus(next: SupabaseStatusInfo) {
  cachedStatus = next;
  statusSubscribers.forEach((cb) => {
    try {
      cb(next);
    } catch {}
  });
}

let inFlightStatusCheck: Promise<SupabaseStatusInfo> | null = null;

export async function checkSupabaseConnection(): Promise<SupabaseStatusInfo> {
  if (inFlightStatusCheck) return inFlightStatusCheck;

  inFlightStatusCheck = (async () => {
    let serverOutboxPending = 0;

    // 1. Verificar vía servidor (/api/supabase/status) con timeout estricto
    try {
      const res = await fetchWithTimeout('/api/supabase/status', { method: 'GET' }, 9000);
      if (res.ok) {
        const json = await res.json();
        serverOutboxPending = Number(json.pendingOutboxCount || 0) || 0;
        const info: SupabaseStatusInfo = {
          configured: Boolean(json.configured || SUPABASE_ANON_KEY),
          projectId: json.projectId || SUPABASE_PROJECT_ID,
          url: json.url || SUPABASE_URL,
          mode: json.configured ? 'server_proxy' : SUPABASE_ANON_KEY ? 'client_anon' : 'unconfigured',
          tablesReady: Boolean(json.tablesReady),
          pendingCount: getSupabasePendingCount() + serverOutboxPending,
          error: json.error,
        };
        const errLower = typeof json.error === 'string' ? json.error.toLowerCase() : '';
        const isTimeoutErr =
          errLower.includes('timeout') ||
          errLower.includes('abort') ||
          errLower.includes('no respondió a tiempo');
        if (info.configured && !info.tablesReady && !isTimeoutErr && browserSupabaseClient) {
          try {
            const { error } = await browserSupabaseClient.from('bakery_tickets').select('id').limit(1);
            info.tablesReady = !error;
            if (!error) info.error = undefined;
            else info.error = error.message;
          } catch {}
        }
        updateSupabaseStatus(info);
        if (info.tablesReady && (info.pendingCount || 0) > 0) {
          flushSupabaseOutbox().catch(() => {});
        }
        return info;
      }
    } catch {}

    // 2. Fallback directo con cliente anon en navegador
    if (browserSupabaseClient) {
      try {
        const { error } = await browserSupabaseClient.from('bakery_tickets').select('id').limit(1);
        const info: SupabaseStatusInfo = {
          configured: true,
          projectId: SUPABASE_PROJECT_ID,
          url: SUPABASE_URL,
          mode: 'client_anon',
          tablesReady: !error,
          pendingCount: getSupabasePendingCount() + serverOutboxPending,
          error: error?.message,
        };
        updateSupabaseStatus(info);
        if (info.tablesReady && (info.pendingCount || 0) > 0) {
          flushSupabaseOutbox().catch(() => {});
        }
        return info;
      } catch (err: any) {
        const info: SupabaseStatusInfo = {
          configured: true,
          projectId: SUPABASE_PROJECT_ID,
          url: SUPABASE_URL,
          mode: 'client_anon',
          tablesReady: false,
          pendingCount: getSupabasePendingCount() + serverOutboxPending,
          error: err?.message || 'Error conectando a Supabase',
        };
        updateSupabaseStatus(info);
        return info;
      }
    }

    const unconfigured: SupabaseStatusInfo = {
      configured: false,
      projectId: SUPABASE_PROJECT_ID,
      url: SUPABASE_URL,
      mode: 'unconfigured',
      tablesReady: false,
      pendingCount: getSupabasePendingCount(),
      error: 'Falta configurar SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY',
    };
    updateSupabaseStatus(unconfigured);
    return unconfigured;
  })();

  try {
    return await inFlightStatusCheck;
  } finally {
    inFlightStatusCheck = null;
  }
}

export function resolveBranchId(itemBranch?: string | null): BranchId {
  if (itemBranch === 'zakia') return 'zakia';
  if (itemBranch === 'refugio') return 'refugio';
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('santafe_active_branch') : null;
    if (saved === 'zakia') return 'zakia';
  } catch {}
  return 'refugio';
}

function sanitizePayload<T extends Record<string, any>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_, val) => (val === undefined ? null : val)));
}

type CollectionKey =
  | 'tickets'
  | 'orders'
  | 'shiftCuts'
  | 'outflows'
  | 'customers'
  | 'dailyDeliveries'
  | 'driverCustomers'
  | 'driverSettlements'
  | 'operationalExpenses'
  | 'supplierBills'
  | 'supplierBankProfiles'
  | 'vipCustomers'
  | 'vipOrders';

const COLLECTION_TABLE_MAP: Record<CollectionKey, string> = {
  tickets: 'bakery_tickets',
  orders: 'bakery_orders',
  shiftCuts: 'bakery_shift_cuts',
  outflows: 'bakery_outflows',
  customers: 'bakery_customers',
  dailyDeliveries: 'bakery_daily_deliveries',
  driverCustomers: 'bakery_driver_customers',
  driverSettlements: 'bakery_driver_settlements',
  operationalExpenses: 'bakery_operational_expenses',
  supplierBills: 'bakery_supplier_bills',
  supplierBankProfiles: 'bakery_supplier_bank_profiles',
  vipCustomers: 'bakery_vip_customers',
  vipOrders: 'bakery_vip_orders',
};

function buildTableRow(collection: CollectionKey, record: Record<string, any>): Record<string, any> {
  const nowIso = new Date().toISOString();
  const branch = resolveBranchId(record.branch || record.branchId);
  const id = String(record.id || record.folio || record.phone || `${collection}_${Date.now()}`);

  switch (collection) {
    case 'tickets':
      return {
        id,
        folio: String(record.folio || id),
        date: String(record.date || nowIso.split('T')[0]),
        branch,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'orders':
      return {
        id,
        folio: String(record.folio || id),
        branch,
        delivery_date: record.deliveryDate ? String(record.deliveryDate) : null,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'shiftCuts':
      return {
        id,
        date: String(record.date || nowIso.split('T')[0]),
        branch,
        shift_type: record.shiftType ? String(record.shiftType) : null,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'outflows':
    case 'operationalExpenses':
    case 'supplierBills':
      return {
        id,
        date: String(record.date || nowIso.split('T')[0]),
        branch,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'customers':
      return {
        id,
        phone: record.phone ? String(record.phone) : null,
        branch,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'dailyDeliveries':
      return {
        id,
        date: String(record.date || ''),
        shift: String(record.shift || 'manana'),
        branch,
        updated_at: record.updatedAt || nowIso,
        payload: { ...record, id },
      };
    case 'driverCustomers':
    case 'supplierBankProfiles':
      return {
        id,
        branch,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'driverSettlements':
      return {
        id,
        date: String(record.date || ''),
        driver_id: String(record.driverId || ''),
        shift: record.shift ? String(record.shift) : null,
        settled: Boolean(record.settled),
        updated_at: record.updatedAt || nowIso,
        payload: { ...record, id },
      };
    case 'vipCustomers':
      return {
        id,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'vipOrders':
      return {
        id,
        delivery_date: record.deliveryDate ? String(record.deliveryDate) : null,
        updated_at: nowIso,
        payload: { ...record, id },
      };
  }
}

interface SupabaseOutboxItem {
  type: 'upsert' | 'delete';
  collection: CollectionKey;
  id: string;
  record?: Record<string, any>;
  updatedAt: string;
}

let isFlushingBrowserOutbox = false;

function readBrowserOutbox(): SupabaseOutboxItem[] {
  try {
    const raw = safeGetItem(SUPABASE_OUTBOX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeBrowserOutbox(items: SupabaseOutboxItem[]): void {
  const capped = items.length > 600 ? items.slice(items.length - 600) : items;
  safeSetJson(SUPABASE_OUTBOX_KEY, capped);
  const nextPending = capped.length;
  if ((cachedStatus.pendingCount || 0) !== nextPending) {
    updateSupabaseStatus({ ...cachedStatus, pendingCount: nextPending });
  }
}

function enqueueOutbox(item: SupabaseOutboxItem): void {
  const list = readBrowserOutbox();
  const key = `${item.collection}::${item.id}`;
  const filtered = list.filter((it) => `${it.collection}::${it.id}` !== key);
  filtered.push(item);
  writeBrowserOutbox(filtered);
}

function removeOutboxItem(collection: CollectionKey, id: string): void {
  const list = readBrowserOutbox();
  if (list.length === 0) return;
  const filtered = list.filter((it) => !(it.collection === collection && it.id === id));
  if (filtered.length !== list.length) {
    writeBrowserOutbox(filtered);
  }
}

export function getSupabasePendingCount(): number {
  return readBrowserOutbox().length;
}

async function tryUpsertOnce(collection: CollectionKey, cleanRecord: Record<string, any>): Promise<boolean> {
  if (browserSupabaseClient) {
    try {
      const table = COLLECTION_TABLE_MAP[collection];
      const row = buildTableRow(collection, cleanRecord);
      const { error } = await browserSupabaseClient.from(table).upsert(row, { onConflict: 'id' });
      if (!error) return true;
    } catch {}
  }

  try {
    const res = await fetchWithTimeout('/api/supabase/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert',
        collection,
        record: cleanRecord,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      return Boolean(json?.ok);
    }
  } catch {}
  return false;
}

async function tryDeleteOnce(collection: CollectionKey, id: string): Promise<boolean> {
  if (browserSupabaseClient) {
    try {
      const table = COLLECTION_TABLE_MAP[collection];
      await browserSupabaseClient.from('bakery_deleted_records').upsert(
        {
          entity_id: `${collection}::${id}`,
          entity: collection,
          record_id: String(id),
          deleted_at: new Date().toISOString(),
        },
        { onConflict: 'entity_id' }
      );
      const { error } = await browserSupabaseClient.from(table).delete().eq('id', String(id));
      if (!error) return true;
    } catch {}
  }

  try {
    const res = await fetchWithTimeout('/api/supabase/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        collection,
        id: String(id),
      }),
    });
    if (res.ok) {
      const json = await res.json();
      return Boolean(json?.ok);
    }
  } catch {}
  return false;
}

export async function flushSupabaseOutbox(): Promise<{ flushed: number; remaining: number }> {
  const current = readBrowserOutbox();
  if (isFlushingBrowserOutbox) {
    return { flushed: 0, remaining: current.length };
  }
  isFlushingBrowserOutbox = true;
  let flushed = 0;

  try {
    // Intentar vaciar cola del servidor primero
    try {
      await fetchWithTimeout('/api/supabase/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'flush' }),
      }, 7000);
    } catch {}

    if (current.length === 0) {
      return { flushed: 0, remaining: 0 };
    }

    const remaining: SupabaseOutboxItem[] = [];
    let abortedDueToOffline = false;

    for (let i = 0; i < current.length; i++) {
      const item = current[i];
      if (abortedDueToOffline) {
        remaining.push(item);
        continue;
      }
      let ok = false;
      if (item.type === 'upsert' && item.record) {
        ok = await tryUpsertOnce(item.collection, item.record);
      } else if (item.type === 'delete') {
        ok = await tryDeleteOnce(item.collection, item.id);
      }
      if (ok) {
        flushed++;
      } else {
        remaining.push(item);
        // Cortar el barrido ante fallo de red/timeout para no encadenar decenas de timeouts
        abortedDueToOffline = true;
      }
    }

    writeBrowserOutbox(remaining);
    return { flushed, remaining: remaining.length };
  } finally {
    isFlushingBrowserOutbox = false;
  }
}

async function upsertViaSupabase(collection: CollectionKey, record: Record<string, any>): Promise<boolean> {
  const cleanRecord = sanitizePayload(record);
  const recordId = String(cleanRecord.id || cleanRecord.folio || cleanRecord.phone || `${collection}_${Date.now()}`);
  const ok = await tryUpsertOnce(collection, { ...cleanRecord, id: recordId });
  if (ok) {
    removeOutboxItem(collection, recordId);
    return true;
  }
  enqueueOutbox({
    type: 'upsert',
    collection,
    id: recordId,
    record: { ...cleanRecord, id: recordId },
    updatedAt: new Date().toISOString(),
  });
  return false;
}

async function deleteViaSupabase(collection: CollectionKey, id: string): Promise<boolean> {
  if (!id) return false;
  const strId = String(id);
  const ok = await tryDeleteOnce(collection, strId);
  if (ok) {
    removeOutboxItem(collection, strId);
    return true;
  }
  enqueueOutbox({
    type: 'delete',
    collection,
    id: strId,
    updatedAt: new Date().toISOString(),
  });
  return false;
}

async function fetchCollectionViaSupabase<T>(collection: CollectionKey, limitCount = 1500): Promise<T[]> {
  if (browserSupabaseClient) {
    try {
      const table = COLLECTION_TABLE_MAP[collection];
      let q = browserSupabaseClient.from(table).select('payload, updated_at');
      if (collection === 'tickets') {
        q = q.order('date', { ascending: false }).order('updated_at', { ascending: false }).limit(limitCount);
      } else {
        q = q.order('updated_at', { ascending: false }).limit(limitCount);
      }
      const { data, error } = await q;
      if (!error && Array.isArray(data)) {
        return data.map((r: any) => r.payload as T).filter(Boolean);
      }
    } catch {}
  }

  try {
    const res = await fetchWithTimeout('/api/supabase/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'fetch',
        collection,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.ok && Array.isArray(json.data)) {
        return json.data as T[];
      }
    }
  } catch {}
  return [];
}

let subscribeStaggerIdx = 0;

function subscribeCollectionRealtime<T>(
  collection: CollectionKey,
  onUpdate: (items: T[]) => void,
  filterFn?: (item: T) => boolean
): () => void {
  let active = true;
  let channel: RealtimeChannel | null = null;
  const staggerMs = (subscribeStaggerIdx++ % 8) * 350;

  const refresh = async () => {
    if (!active) return;
    const rows = await fetchCollectionViaSupabase<T>(collection);
    if (!active) return;
    const filtered = filterFn ? rows.filter(filterFn) : rows;
    if (filtered.length > 0) {
      onUpdate(filtered);
    }
  };

  // Escalonar carga inicial para no saturar conexiones concurrentes si Supabase tarda en despertar
  const initTimer = setTimeout(() => {
    if (active && cachedStatus.tablesReady) {
      refresh().catch(() => {});
    }
  }, staggerMs + 400);

  // Suscripción en tiempo real Supabase Realtime si hay ANON KEY en cliente
  if (browserSupabaseClient) {
    try {
      const table = COLLECTION_TABLE_MAP[collection];
      channel = browserSupabaseClient
        .channel(`realtime_${table}_${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => {
            refresh().catch(() => {});
          }
        )
        .subscribe();
    } catch {}
  }

  return () => {
    active = false;
    clearTimeout(initTimer);
    if (channel && browserSupabaseClient) {
      browserSupabaseClient.removeChannel(channel).catch(() => {});
    }
  };
}

// ==================== API PÚBLICA SUPABASE ====================

export async function saveSaleTicketToSupabase(ticket: SaleTicket): Promise<boolean> {
  const branchId = resolveBranchId(ticket.branch || (ticket as any).branchId);
  const fallbackDate = new Date().toISOString().split('T')[0];
  const safeTotal = Math.max(0, Number(ticket.total ?? 0) || 0);
  const safeSubtotal = Math.max(0, Number(ticket.subtotal ?? safeTotal) || 0);
  const cleanTicket = {
    ...ticket,
    id: String(ticket.id || ticket.folio || `tk_${Date.now()}`),
    folio: String(ticket.folio || ticket.id || `T-${Date.now()}`),
    date: ticket.date && typeof ticket.date === 'string' && ticket.date.trim() ? ticket.date.trim() : fallbackDate,
    subtotal: safeSubtotal,
    total: safeTotal,
    branch: branchId,
    branchId,
  };
  return upsertViaSupabase('tickets', cleanTicket);
}

export async function deleteSaleTicketFromSupabase(ticketId: string): Promise<boolean> {
  return deleteViaSupabase('tickets', ticketId);
}

export async function fetchTicketsFromSupabase(): Promise<SaleTicket[]> {
  return fetchCollectionViaSupabase<SaleTicket>('tickets', 1500);
}

export function subscribeToSupabaseTickets(onUpdate: (tickets: SaleTicket[]) => void): () => void {
  return subscribeCollectionRealtime<SaleTicket>('tickets', onUpdate, (t) => Boolean(t && (t.id || t.folio)));
}

export async function saveShiftCutToSupabase(cut: ShiftCutRecord): Promise<boolean> {
  const branchId = resolveBranchId(cut.branch || (cut as any).branchId);
  return upsertViaSupabase('shiftCuts', { ...cut, branch: branchId, branchId });
}

export async function fetchShiftCutsFromSupabase(): Promise<ShiftCutRecord[]> {
  return fetchCollectionViaSupabase<ShiftCutRecord>('shiftCuts');
}

export function subscribeToSupabaseShiftCuts(onUpdate: (cuts: ShiftCutRecord[]) => void): () => void {
  return subscribeCollectionRealtime<ShiftCutRecord>('shiftCuts', onUpdate, (c) => Boolean(c && c.id));
}

export async function saveOrderToSupabase(order: BakeryOrder): Promise<boolean> {
  const branchId = resolveBranchId((order as any).branch || (order as any).branchId);
  return upsertViaSupabase('orders', { ...order, branch: branchId, branchId });
}

export async function deleteOrderFromSupabase(orderId: string): Promise<boolean> {
  return deleteViaSupabase('orders', orderId);
}

export async function fetchOrdersFromSupabase(): Promise<BakeryOrder[]> {
  return fetchCollectionViaSupabase<BakeryOrder>('orders');
}

export function subscribeToSupabaseOrders(onUpdate: (orders: BakeryOrder[]) => void): () => void {
  return subscribeCollectionRealtime<BakeryOrder>('orders', onUpdate, (o) => Boolean(o && (o.id || o.folio)));
}

export async function saveCustomerToSupabase(customer: Customer): Promise<boolean> {
  const branchId = resolveBranchId((customer as any).branch || (customer as any).branchId);
  return upsertViaSupabase('customers', { ...customer, branch: branchId, branchId });
}

export async function fetchCustomersFromSupabase(): Promise<Customer[]> {
  return fetchCollectionViaSupabase<Customer>('customers');
}

export async function saveOutflowToSupabase(outflow: CashOutflowItem): Promise<boolean> {
  const branchId = resolveBranchId(outflow.branch || (outflow as any).branchId);
  return upsertViaSupabase('outflows', { ...outflow, branch: branchId, branchId });
}

export async function deleteOutflowFromSupabase(outflowId: string): Promise<boolean> {
  return deleteViaSupabase('outflows', outflowId);
}

export async function fetchOutflowsFromSupabase(): Promise<CashOutflowItem[]> {
  return fetchCollectionViaSupabase<CashOutflowItem>('outflows');
}

export function subscribeToSupabaseOutflows(onUpdate: (outflows: CashOutflowItem[]) => void): () => void {
  return subscribeCollectionRealtime<CashOutflowItem>('outflows', onUpdate, (o) => Boolean(o && o.id));
}

export async function saveDailyDeliveryToSupabase(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  quantities: Record<string, Record<string, number>>,
  branch?: BranchId
): Promise<boolean> {
  const docId = `${dateStr}_${shift}`;
  const branchId = resolveBranchId(branch);
  return upsertViaSupabase('dailyDeliveries', {
    id: docId,
    date: dateStr,
    shift,
    quantities: quantities || {},
    branch: branchId,
    branchId,
    updatedAt: new Date().toISOString(),
  });
}

export async function fetchDailyDeliveryFromSupabase(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde'
): Promise<Record<string, Record<string, number>> | null> {
  const docId = `${dateStr}_${shift}`;
  if (browserSupabaseClient) {
    try {
      const { data, error } = await browserSupabaseClient
        .from('bakery_daily_deliveries')
        .select('payload')
        .eq('id', docId)
        .maybeSingle();
      if (!error && data?.payload?.quantities) {
        return data.payload.quantities as Record<string, Record<string, number>>;
      }
    } catch {}
  }
  const all = await fetchAllDailyDeliveriesFromSupabase();
  const match = all.find((d) => d.id === docId || (d.date === dateStr && d.shift === shift));
  return match?.quantities || null;
}

export async function deleteClientDeliveryFromSupabase(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  clientId: string
): Promise<boolean> {
  const current = (await fetchDailyDeliveryFromSupabase(dateStr, shift)) || {};
  const next = { ...current };
  delete next[clientId];
  return saveDailyDeliveryToSupabase(dateStr, shift, next);
}

export async function fetchAllDailyDeliveriesFromSupabase(): Promise<
  Array<{
    id: string;
    date: string;
    shift: 'madrugada' | 'manana' | 'tarde';
    quantities: Record<string, Record<string, number>>;
    updatedAt?: string;
  }>
> {
  const list = await fetchCollectionViaSupabase<any>('dailyDeliveries');
  return list
    .filter((d) => d && d.date && d.quantities)
    .map((d) => {
      const id = String(d.id || `${d.date}_${d.shift || 'manana'}`);
      const fallbackShift = id.includes('madrugada') ? 'madrugada' : id.includes('tarde') ? 'tarde' : 'manana';
      return {
        id,
        date: d.date,
        shift: (d.shift || fallbackShift) as 'madrugada' | 'manana' | 'tarde',
        quantities: d.quantities as Record<string, Record<string, number>>,
        updatedAt: d.updatedAt,
      };
    });
}

export function subscribeToSupabaseDailyDelivery(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  onUpdate: (quantities: Record<string, Record<string, number>>) => void
): () => void {
  const docId = `${dateStr}_${shift}`;
  let active = true;
  let channel: RealtimeChannel | null = null;

  const refreshOne = async () => {
    const q = await fetchDailyDeliveryFromSupabase(dateStr, shift);
    if (active && q) onUpdate(q);
  };

  refreshOne().catch(() => {});

  if (browserSupabaseClient) {
    try {
      channel = browserSupabaseClient
        .channel(`daily_delivery_${docId}_${Math.random().toString(36).slice(2, 7)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bakery_daily_deliveries', filter: `id=eq.${docId}` },
          (payload: any) => {
            const q = payload?.new?.payload?.quantities;
            if (active && q) {
              onUpdate(q as Record<string, Record<string, number>>);
            } else {
              refreshOne().catch(() => {});
            }
          }
        )
        .subscribe();
    } catch {}
  }

  return () => {
    active = false;
    if (channel && browserSupabaseClient) {
      browserSupabaseClient.removeChannel(channel).catch(() => {});
    }
  };
}

export function subscribeToAllSupabaseDailyDeliveries(
  onUpdate: (
    deliveries: Array<{
      id: string;
      date: string;
      shift: 'madrugada' | 'manana' | 'tarde';
      quantities: Record<string, Record<string, number>>;
    }>
  ) => void
): () => void {
  return subscribeCollectionRealtime<any>(
    'dailyDeliveries',
    (rows) => {
      const normalized = rows
        .filter((d) => d && d.date && d.quantities)
        .map((d) => {
          const id = String(d.id || `${d.date}_${d.shift || 'manana'}`);
          const fallbackShift = id.includes('madrugada') ? 'madrugada' : id.includes('tarde') ? 'tarde' : 'manana';
          return {
            id,
            date: d.date,
            shift: (d.shift || fallbackShift) as 'madrugada' | 'manana' | 'tarde',
            quantities: d.quantities as Record<string, Record<string, number>>,
          };
        });
      onUpdate(normalized);
    }
  );
}

export async function saveDriverCustomerToSupabase(customer: DriverCustomer): Promise<boolean> {
  const branchId = resolveBranchId((customer as any).branch || (customer as any).branchId);
  return upsertViaSupabase('driverCustomers', { ...customer, branch: branchId, branchId });
}

export async function deleteDriverCustomerFromSupabase(customerId: string): Promise<boolean> {
  return deleteViaSupabase('driverCustomers', customerId);
}

export async function fetchDriverCustomersFromSupabase(): Promise<DriverCustomer[]> {
  return fetchCollectionViaSupabase<DriverCustomer>('driverCustomers');
}

export function subscribeToSupabaseDriverCustomers(onUpdate: (customers: DriverCustomer[]) => void): () => void {
  return subscribeCollectionRealtime<DriverCustomer>('driverCustomers', onUpdate, (c) => Boolean(c && c.id && c.name));
}

export async function syncAllDriverCustomersToSupabase(customers: DriverCustomer[]): Promise<void> {
  for (const c of customers || []) {
    await saveDriverCustomerToSupabase(c);
  }
}

export async function saveOperationalExpenseToSupabase(expense: OperationalExpense): Promise<boolean> {
  const branchId = resolveBranchId((expense as any).branch || (expense as any).branchId);
  return upsertViaSupabase('operationalExpenses', { ...expense, branch: branchId, branchId });
}

export async function deleteOperationalExpenseFromSupabase(expenseId: string): Promise<boolean> {
  return deleteViaSupabase('operationalExpenses', expenseId);
}

export async function fetchOperationalExpensesFromSupabase(): Promise<OperationalExpense[]> {
  return fetchCollectionViaSupabase<OperationalExpense>('operationalExpenses');
}

export function subscribeToSupabaseOperationalExpenses(onUpdate: (expenses: OperationalExpense[]) => void): () => void {
  return subscribeCollectionRealtime<OperationalExpense>('operationalExpenses', onUpdate, (e) => Boolean(e && e.id && e.concept));
}

export async function saveSupplierBillToSupabase(bill: SupplierBill): Promise<boolean> {
  const branchId = resolveBranchId((bill as any).branch || (bill as any).branchId);
  return upsertViaSupabase('supplierBills', { ...bill, branch: branchId, branchId });
}

export async function deleteSupplierBillFromSupabase(billId: string): Promise<boolean> {
  return deleteViaSupabase('supplierBills', billId);
}

export async function fetchSupplierBillsFromSupabase(): Promise<SupplierBill[]> {
  return fetchCollectionViaSupabase<SupplierBill>('supplierBills');
}

export function subscribeToSupabaseSupplierBills(onUpdate: (bills: SupplierBill[]) => void): () => void {
  return subscribeCollectionRealtime<SupplierBill>('supplierBills', onUpdate, (b) => Boolean(b && b.id && b.supplierName));
}

export async function saveSupplierBankProfileToSupabase(profile: SupplierBankInfo): Promise<boolean> {
  const branchId = resolveBranchId((profile as any).branch || (profile as any).branchId);
  return upsertViaSupabase('supplierBankProfiles', { ...profile, branch: branchId, branchId });
}

export async function fetchSupplierBankProfilesFromSupabase(): Promise<SupplierBankInfo[]> {
  return fetchCollectionViaSupabase<SupplierBankInfo>('supplierBankProfiles');
}

export function subscribeToSupabaseSupplierBankProfiles(onUpdate: (profiles: SupplierBankInfo[]) => void): () => void {
  return subscribeCollectionRealtime<SupplierBankInfo>('supplierBankProfiles', onUpdate, (p) => Boolean(p && p.id && p.supplierName));
}

export async function saveVipCustomerToSupabase(customer: VipCustomer): Promise<boolean> {
  return upsertViaSupabase('vipCustomers', { ...customer, updatedAt: new Date().toISOString() });
}

export async function deleteVipCustomerFromSupabase(id: string): Promise<boolean> {
  return deleteViaSupabase('vipCustomers', id);
}

export async function fetchVipCustomersFromSupabase(): Promise<VipCustomer[]> {
  return fetchCollectionViaSupabase<VipCustomer>('vipCustomers');
}

export function subscribeToSupabaseVipCustomers(onUpdate: (customers: VipCustomer[]) => void): () => void {
  return subscribeCollectionRealtime<VipCustomer>('vipCustomers', onUpdate, (c) => Boolean(c && c.id && c.name));
}

export async function saveVipOrderToSupabase(order: VipOrder): Promise<boolean> {
  return upsertViaSupabase('vipOrders', {
    ...order,
    totalAmount: Math.max(0, Number(order.totalAmount ?? 0) || 0),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteVipOrderFromSupabase(id: string): Promise<boolean> {
  return deleteViaSupabase('vipOrders', id);
}

export async function fetchVipOrdersFromSupabase(): Promise<VipOrder[]> {
  return fetchCollectionViaSupabase<VipOrder>('vipOrders');
}

export function subscribeToSupabaseVipOrders(onUpdate: (orders: VipOrder[]) => void): () => void {
  return subscribeCollectionRealtime<VipOrder>('vipOrders', onUpdate, (o) => Boolean(o && o.id && o.customerName));
}

export async function saveDriverSettlementToSupabase(settlement: DriverDaySettlement): Promise<boolean> {
  return upsertViaSupabase('driverSettlements', {
    id: settlement.id,
    date: settlement.date,
    driverId: settlement.driverId,
    ...(settlement.shift ? { shift: settlement.shift } : {}),
    settled: Boolean(settlement.settled),
    updatedAt: settlement.updatedAt || new Date().toISOString(),
  });
}

export async function fetchDriverSettlementsFromSupabase(): Promise<DriverDaySettlement[]> {
  const rows = await fetchCollectionViaSupabase<DriverDaySettlement>('driverSettlements');
  return rows.filter((item) => item && item.id && item.date && (item.driverId === 'osvaldo' || item.driverId === 'simon'));
}

export function subscribeToSupabaseDriverSettlements(onUpdate: (settlements: DriverDaySettlement[]) => void): () => void {
  return subscribeCollectionRealtime<DriverDaySettlement>(
    'driverSettlements',
    onUpdate,
    (item) => Boolean(item && item.id && item.date && (item.driverId === 'osvaldo' || item.driverId === 'simon'))
  );
}

export async function fetchDeletedIdsFromSupabase(): Promise<Record<string, string[]>> {
  const grouped: Record<string, string[]> = {};
  if (!browserSupabaseClient) return grouped;
  try {
    const { data, error } = await browserSupabaseClient
      .from('bakery_deleted_records')
      .select('entity, record_id')
      .order('deleted_at', { ascending: false })
      .limit(2000);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (!row?.entity || !row?.record_id) continue;
        if (!grouped[row.entity]) grouped[row.entity] = [];
        grouped[row.entity].push(String(row.record_id));
      }
    }
  } catch {}
  return grouped;
}

export function subscribeToSupabaseDeletedRecords(
  onDeleted: (entity: string, recordId: string) => void
): () => void {
  if (!browserSupabaseClient) return () => {};
  let channel: RealtimeChannel | null = null;
  try {
    channel = browserSupabaseClient
      .channel(`realtime_bakery_deleted_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bakery_deleted_records' },
        (payload: any) => {
          const row = payload?.new;
          if (row?.entity && row?.record_id) {
            onDeleted(String(row.entity), String(row.record_id));
          }
        }
      )
      .subscribe();
  } catch {}
  return () => {
    if (channel && browserSupabaseClient) {
      browserSupabaseClient.removeChannel(channel).catch(() => {});
    }
  };
}

export const SUPABASE_SCHEMA_SQL = `-- Panadería Santa Fé -> Supabase (icroicyyekqxmufyxeqc)
CREATE TABLE IF NOT EXISTS public.bakery_tickets (
  id TEXT PRIMARY KEY,
  folio TEXT,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_tickets_date ON public.bakery_tickets (date DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_tickets_branch ON public.bakery_tickets (branch);

CREATE TABLE IF NOT EXISTS public.bakery_orders (
  id TEXT PRIMARY KEY,
  folio TEXT,
  branch TEXT DEFAULT 'refugio',
  delivery_date TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_orders_delivery_date ON public.bakery_orders (delivery_date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_shift_cuts (
  id TEXT PRIMARY KEY,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  shift_type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_shift_cuts_date ON public.bakery_shift_cuts (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_outflows (
  id TEXT PRIMARY KEY,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_outflows_date ON public.bakery_outflows (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_customers (
  id TEXT PRIMARY KEY,
  phone TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bakery_daily_deliveries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  shift TEXT NOT NULL,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_daily_deliveries_date ON public.bakery_daily_deliveries (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_driver_customers (
  id TEXT PRIMARY KEY,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bakery_driver_settlements (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  shift TEXT,
  settled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_driver_settlements_date ON public.bakery_driver_settlements (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_operational_expenses (
  id TEXT PRIMARY KEY,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_operational_expenses_date ON public.bakery_operational_expenses (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_supplier_bills (
  id TEXT PRIMARY KEY,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_supplier_bills_date ON public.bakery_supplier_bills (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_supplier_bank_profiles (
  id TEXT PRIMARY KEY,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bakery_vip_customers (
  id TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bakery_vip_orders (
  id TEXT PRIMARY KEY,
  delivery_date TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_vip_orders_date ON public.bakery_vip_orders (delivery_date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_deleted_records (
  entity_id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bakery_deleted_records_entity ON public.bakery_deleted_records (entity);

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'bakery_tickets','bakery_orders','bakery_shift_cuts','bakery_outflows',
    'bakery_customers','bakery_daily_deliveries','bakery_driver_customers',
    'bakery_driver_settlements','bakery_operational_expenses','bakery_supplier_bills',
    'bakery_supplier_bank_profiles','bakery_vip_customers','bakery_vip_orders',
    'bakery_deleted_records'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "pos_full_access_%s" ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY "pos_full_access_%s" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'bakery_tickets','bakery_orders','bakery_shift_cuts','bakery_outflows',
    'bakery_customers','bakery_daily_deliveries','bakery_driver_customers',
    'bakery_driver_settlements','bakery_operational_expenses','bakery_supplier_bills',
    'bakery_supplier_bank_profiles','bakery_vip_customers','bakery_vip_orders',
    'bakery_deleted_records'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;`;

