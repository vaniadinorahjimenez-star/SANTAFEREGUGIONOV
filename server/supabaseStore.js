import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_PROJECT_ID = 'icroicyyekqxmufyxeqc';
export const DEFAULT_SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;
const SUPABASE_TIMEOUT_MS = 4500;
const OUTBOX_FILE = path.join('/tmp', 'santafe_supabase_outbox.json');

export const COLLECTION_TO_TABLE = {
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

const SUPABASE_BACKOFF_MS = 15000;

let cachedClient = null;
let cachedSignature = '';
let cachedStatusResult = null;
let cachedStatusTime = 0;
let supabaseBackoffUntil = 0;
let isFlushingOutbox = false;

let outboxState = {
  upserts: {},
  deletes: {},
};

try {
  if (fs.existsSync(OUTBOX_FILE)) {
    const raw = fs.readFileSync(OUTBOX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      outboxState = {
        upserts: parsed.upserts && typeof parsed.upserts === 'object' ? parsed.upserts : {},
        deletes: parsed.deletes && typeof parsed.deletes === 'object' ? parsed.deletes : {},
      };
    }
  }
} catch {}

function persistOutbox() {
  try {
    fs.writeFileSync(OUTBOX_FILE, JSON.stringify(outboxState), 'utf8');
  } catch {}
}

function createTimeoutFetch(timeoutMs = SUPABASE_TIMEOUT_MS) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // Llamar abort() sin argumento para preservar name === 'AbortError' y evitar reintentos largos de postgrest-js
      controller.abort();
    }, timeoutMs);

    const externalSignal = init?.signal;
    const onExternalAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  };
}

export function getSupabaseEnv() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).trim();
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    anonKey ||
    ''
  ).trim();
  const mode = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 'service_role'
    : key
    ? 'anon'
    : 'unconfigured';
  return { url, key, anonKey, mode, projectId: SUPABASE_PROJECT_ID };
}

export function getSupabasePublicConfig() {
  const { url, anonKey, projectId } = getSupabaseEnv();
  return {
    configured: Boolean(url && anonKey),
    url,
    anonKey: anonKey || null,
    projectId,
  };
}

export function getSupabaseServerClient() {
  const { url, key } = getSupabaseEnv();
  if (!url || !key) return null;
  const sig = `${url}::${key.slice(0, 12)}`;
  if (!cachedClient || cachedSignature !== sig) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: createTimeoutFetch(SUPABASE_TIMEOUT_MS),
      },
    });
    cachedSignature = sig;
  }
  return cachedClient;
}

function normalizeRecordId(collectionKey, record) {
  if (!record || typeof record !== 'object') return null;
  if (collectionKey === 'dailyDeliveries') {
    if (record.id && String(record.id).trim()) return String(record.id).trim();
    if (record.date && record.shift) return `${record.date}_${record.shift}`;
    return null;
  }
  if (collectionKey === 'customers') {
    const raw = record.id || record.phone;
    return raw ? String(raw).trim() : null;
  }
  if (collectionKey === 'shiftCuts') {
    const raw =
      record.id ||
      record.folio ||
      (record.date && record.shiftType ? `${record.date}_${record.shiftType}` : '');
    return raw ? String(raw).trim() : null;
  }
  const raw = record.id || record.folio;
  return raw ? String(raw).trim() : null;
}

function enqueueOutboxUpserts(collectionKey, records) {
  if (!COLLECTION_TO_TABLE[collectionKey] || !Array.isArray(records) || records.length === 0) return;
  if (!outboxState.upserts[collectionKey]) outboxState.upserts[collectionKey] = {};
  const delSet = new Set(Array.isArray(outboxState.deletes[collectionKey]) ? outboxState.deletes[collectionKey] : []);

  for (const rec of records) {
    const id = normalizeRecordId(collectionKey, rec);
    if (!id) continue;
    outboxState.upserts[collectionKey][id] = { ...rec, id };
    delSet.delete(id);
  }
  outboxState.deletes[collectionKey] = Array.from(delSet);
  persistOutbox();
}

function dequeueOutboxUpserts(collectionKey, ids) {
  if (!outboxState.upserts[collectionKey] || !Array.isArray(ids) || ids.length === 0) return;
  let changed = false;
  for (const id of ids) {
    if (id && outboxState.upserts[collectionKey][String(id)]) {
      delete outboxState.upserts[collectionKey][String(id)];
      changed = true;
    }
  }
  if (changed) persistOutbox();
}

function enqueueOutboxDeletes(collectionKey, ids) {
  if (!COLLECTION_TO_TABLE[collectionKey] || !Array.isArray(ids) || ids.length === 0) return;
  const delSet = new Set(Array.isArray(outboxState.deletes[collectionKey]) ? outboxState.deletes[collectionKey] : []);
  for (const id of ids) {
    if (!id) continue;
    const strId = String(id);
    delSet.add(strId);
    if (outboxState.upserts[collectionKey]?.[strId]) {
      delete outboxState.upserts[collectionKey][strId];
    }
  }
  outboxState.deletes[collectionKey] = Array.from(delSet);
  persistOutbox();
}

function dequeueOutboxDeletes(collectionKey, ids) {
  if (!Array.isArray(outboxState.deletes[collectionKey]) || !Array.isArray(ids) || ids.length === 0) return;
  const removeSet = new Set(ids.map(String));
  const next = outboxState.deletes[collectionKey].filter((id) => !removeSet.has(String(id)));
  if (next.length !== outboxState.deletes[collectionKey].length) {
    outboxState.deletes[collectionKey] = next;
    persistOutbox();
  }
}

export function getSupabaseOutboxStats() {
  let pendingUpserts = 0;
  let pendingDeletes = 0;
  for (const colMap of Object.values(outboxState.upserts || {})) {
    if (colMap && typeof colMap === 'object') {
      pendingUpserts += Object.keys(colMap).length;
    }
  }
  for (const delArr of Object.values(outboxState.deletes || {})) {
    if (Array.isArray(delArr)) {
      pendingDeletes += delArr.length;
    }
  }
  return {
    pendingUpserts,
    pendingDeletes,
    totalPending: pendingUpserts + pendingDeletes,
  };
}

function getMexicoLocalDateString(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    const offsetDate = new Date(date.getTime() - 6 * 60 * 60 * 1000);
    return offsetDate.toISOString().split('T')[0];
  }
}

function toTableRow(collectionKey, record) {
  const id = normalizeRecordId(collectionKey, record);
  if (!id) return null;
  const now = new Date();
  const nowIso = now.toISOString();
  const localDate = getMexicoLocalDateString(now);
  const branch = record.branch || record.branchId || 'refugio';

  switch (collectionKey) {
    case 'tickets':
      return {
        id,
        folio: record.folio ? String(record.folio) : id,
        date: record.date ? String(record.date) : localDate,
        branch,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'orders':
      return {
        id,
        folio: record.folio ? String(record.folio) : id,
        branch,
        delivery_date: record.deliveryDate ? String(record.deliveryDate) : null,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'shiftCuts':
      return {
        id,
        date: record.date ? String(record.date) : localDate,
        branch,
        shift_type: record.shiftType ? String(record.shiftType) : null,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'outflows':
      return {
        id,
        date: record.date ? String(record.date) : localDate,
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
    case 'operationalExpenses':
    case 'supplierBills':
      return {
        id,
        date: record.date ? String(record.date) : localDate,
        branch,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'supplierBankProfiles':
      return {
        id,
        branch,
        updated_at: nowIso,
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
    default:
      return null;
  }
}

function isAbortOrTimeoutError(errOrMessage) {
  const msg = typeof errOrMessage === 'string'
    ? errOrMessage
    : `${errOrMessage?.name || ''} ${errOrMessage?.message || ''}`;
  const lower = msg.toLowerCase();
  return (
    lower.includes('abort') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('no respondió a tiempo')
  );
}

function formatSupabaseError(errOrMessage) {
  const msg = typeof errOrMessage === 'string' ? errOrMessage : errOrMessage?.message || 'Error conectando con Supabase';
  if (isAbortOrTimeoutError(errOrMessage)) {
    return `El servidor REST/DB de Supabase (${SUPABASE_PROJECT_ID}) no respondió a tiempo. Verifica que el proyecto no esté pausado en Supabase Dashboard; tus ventas siguen guardándose localmente y en cola automática.`;
  }
  return msg;
}

export async function getSupabaseStatus(forceFresh = false) {
  const env = getSupabaseEnv();
  const stats = getSupabaseOutboxStats();

  if (!env.key) {
    return {
      configured: false,
      projectId: env.projectId,
      url: env.url,
      mode: env.mode,
      tablesReady: false,
      pendingOutboxCount: stats.totalPending,
      error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY en las variables de entorno.',
    };
  }

  if (!forceFresh && cachedStatusResult && (Date.now() - cachedStatusTime < 4000 || Date.now() < supabaseBackoffUntil)) {
    return { ...cachedStatusResult, pendingOutboxCount: stats.totalPending };
  }

  const client = getSupabaseServerClient();
  if (!client) {
    return {
      configured: false,
      projectId: env.projectId,
      url: env.url,
      mode: env.mode,
      tablesReady: false,
      pendingOutboxCount: stats.totalPending,
      error: 'No se pudo inicializar el cliente de Supabase.',
    };
  }

  try {
    const { error } = await client.from('bakery_tickets').select('id').limit(1);
    if (error) {
      if (isAbortOrTimeoutError(error.message)) {
        supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
      }
      cachedStatusResult = {
        configured: true,
        projectId: env.projectId,
        url: env.url,
        mode: env.mode,
        tablesReady: false,
        pendingOutboxCount: stats.totalPending,
        error: formatSupabaseError(error.message),
      };
      cachedStatusTime = Date.now();
      return cachedStatusResult;
    }

    supabaseBackoffUntil = 0;
    cachedStatusResult = {
      configured: true,
      projectId: env.projectId,
      url: env.url,
      mode: env.mode,
      tablesReady: true,
      pendingOutboxCount: stats.totalPending,
    };
    cachedStatusTime = Date.now();

    if (stats.totalPending > 0) {
      flushSupabaseOutbox().catch(() => {});
    }

    return cachedStatusResult;
  } catch (err) {
    if (isAbortOrTimeoutError(err)) {
      supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
    }
    cachedStatusResult = {
      configured: true,
      projectId: env.projectId,
      url: env.url,
      mode: env.mode,
      tablesReady: false,
      pendingOutboxCount: stats.totalPending,
      error: formatSupabaseError(err),
    };
    cachedStatusTime = Date.now();
    return cachedStatusResult;
  }
}

export async function upsertCollectionToSupabase(collectionKey, records, { enqueueOnFail = true } = {}) {
  const client = getSupabaseServerClient();
  const table = COLLECTION_TO_TABLE[collectionKey];
  if (!table || !Array.isArray(records) || records.length === 0) {
    return { ok: false, count: 0 };
  }
  if (!client || (enqueueOnFail && Date.now() < supabaseBackoffUntil)) {
    if (enqueueOnFail) enqueueOutboxUpserts(collectionKey, records);
    return { ok: false, count: 0, queued: enqueueOnFail };
  }

  const dedup = new Map();
  for (const item of records) {
    const row = toTableRow(collectionKey, item);
    if (row) dedup.set(row.id, row);
  }
  const rows = Array.from(dedup.values());
  if (rows.length === 0) return { ok: true, count: 0 };

  const CHUNK_SIZE = 150;
  let totalUpserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    try {
      const { error } = await client.from(table).upsert(chunk, { onConflict: 'id' });
      if (error) {
        const isTransient = isAbortOrTimeoutError(error.message);
        if (isTransient) {
          supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
        } else {
          console.warn(`[Supabase] Error guardando en ${table}:`, error.message);
        }
        if (enqueueOnFail) {
          enqueueOutboxUpserts(collectionKey, rows.slice(i).map((r) => r.payload));
        }
        return { ok: false, count: totalUpserted, queued: enqueueOnFail, error: formatSupabaseError(error.message) };
      }
      supabaseBackoffUntil = 0;
      totalUpserted += chunk.length;
      dequeueOutboxUpserts(collectionKey, chunk.map((r) => r.id));
    } catch (err) {
      const isTransient = isAbortOrTimeoutError(err);
      if (isTransient) {
        supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
      } else {
        console.warn(`[Supabase] Excepción guardando en ${table}:`, err?.message);
      }
      if (enqueueOnFail) {
        enqueueOutboxUpserts(collectionKey, rows.slice(i).map((r) => r.payload));
      }
      return { ok: false, count: totalUpserted, queued: enqueueOnFail, error: formatSupabaseError(err) };
    }
  }
  return { ok: true, count: totalUpserted };
}

export async function deleteRecordsFromSupabase(collectionKey, ids, { enqueueOnFail = true } = {}) {
  const client = getSupabaseServerClient();
  const table = COLLECTION_TO_TABLE[collectionKey];
  const cleanIds = (ids || []).filter(Boolean).map(String);
  if (!table || cleanIds.length === 0) return { ok: false };
  if (!client || (enqueueOnFail && Date.now() < supabaseBackoffUntil)) {
    if (enqueueOnFail) enqueueOutboxDeletes(collectionKey, cleanIds);
    return { ok: false, queued: enqueueOnFail };
  }

  try {
    const deleteMarkers = cleanIds.map((recordId) => ({
      entity_id: `${collectionKey}::${recordId}`,
      entity: collectionKey,
      record_id: recordId,
      deleted_at: new Date().toISOString(),
    }));
    const { error: markerErr } = await client.from('bakery_deleted_records').upsert(deleteMarkers, { onConflict: 'entity_id' });
    if (markerErr && isAbortOrTimeoutError(markerErr.message)) {
      supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
      if (enqueueOnFail) enqueueOutboxDeletes(collectionKey, cleanIds);
      return { ok: false, queued: enqueueOnFail, error: formatSupabaseError(markerErr.message) };
    }

    const { error } = await client.from(table).delete().in('id', cleanIds);
    if (error) {
      const isTransient = isAbortOrTimeoutError(error.message);
      if (isTransient) {
        supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
      } else {
        console.warn(`[Supabase] Error eliminando de ${table}:`, error.message);
      }
      if (enqueueOnFail) enqueueOutboxDeletes(collectionKey, cleanIds);
      return { ok: false, queued: enqueueOnFail, error: formatSupabaseError(error.message) };
    }
    supabaseBackoffUntil = 0;
    dequeueOutboxDeletes(collectionKey, cleanIds);
    return { ok: true };
  } catch (err) {
    const isTransient = isAbortOrTimeoutError(err);
    if (isTransient) {
      supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
    } else {
      console.warn(`[Supabase] Excepción eliminando de ${table}:`, err?.message);
    }
    if (enqueueOnFail) enqueueOutboxDeletes(collectionKey, cleanIds);
    return { ok: false, queued: enqueueOnFail, error: formatSupabaseError(err) };
  }
}

export async function syncDeltaToSupabase(payload) {
  const client = getSupabaseServerClient();
  if (!payload || typeof payload !== 'object') return { ok: false, skipped: true };

  const upsertEntries = Object.keys(COLLECTION_TO_TABLE)
    .filter((collectionKey) => Array.isArray(payload[collectionKey]) && payload[collectionKey].length > 0)
    .map((collectionKey) => [collectionKey, payload[collectionKey]]);

  const deleteEntries =
    payload.deletedIds && typeof payload.deletedIds === 'object'
      ? Object.entries(payload.deletedIds).filter(
          ([entity, ids]) => COLLECTION_TO_TABLE[entity] && Array.isArray(ids) && ids.length > 0
        )
      : [];

  if (upsertEntries.length === 0 && deleteEntries.length === 0) {
    return { ok: true, count: 0 };
  }

  // Si el circuito está en backoff o no hay cliente, encolar al instante sin disparar ráfagas de timeouts
  if (!client || Date.now() < supabaseBackoffUntil) {
    for (const [collectionKey, records] of upsertEntries) {
      enqueueOutboxUpserts(collectionKey, records);
    }
    for (const [entity, ids] of deleteEntries) {
      enqueueOutboxDeletes(entity, ids);
    }
    return { ok: false, queued: true, pendingOutboxCount: getSupabaseOutboxStats().totalPending };
  }

  // Ejecutar upserts y deletes en paralelo (1 round-trip en vez de 10 secuenciales)
  const upsertResults = await Promise.all(
    upsertEntries.map(([collectionKey, records]) =>
      upsertCollectionToSupabase(collectionKey, records, { enqueueOnFail: true })
    )
  );
  const deleteResults = await Promise.all(
    deleteEntries.map(([entity, ids]) =>
      deleteRecordsFromSupabase(entity, ids, { enqueueOnFail: true })
    )
  );

  const allOk =
    upsertResults.every((r) => Boolean(r?.ok)) &&
    deleteResults.every((r) => Boolean(r?.ok));

  return { ok: allOk, pendingOutboxCount: getSupabaseOutboxStats().totalPending };
}

export async function flushSupabaseOutbox() {
  if (isFlushingOutbox) return getSupabaseOutboxStats();
  const statsBefore = getSupabaseOutboxStats();
  if (statsBefore.totalPending === 0) return statsBefore;
  const client = getSupabaseServerClient();
  if (!client) return statsBefore;

  isFlushingOutbox = true;
  try {
    // Verificar salud rápida primero antes de intentar todas las colecciones pendientes
    const { error: pingErr } = await client.from('bakery_tickets').select('id').limit(1);
    if (pingErr) {
      if (isAbortOrTimeoutError(pingErr.message)) {
        supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
      }
      return getSupabaseOutboxStats();
    }
    supabaseBackoffUntil = 0;

    for (const [collectionKey, delIds] of Object.entries(outboxState.deletes || {})) {
      if (!Array.isArray(delIds) || delIds.length === 0) continue;
      const res = await deleteRecordsFromSupabase(collectionKey, [...delIds], { enqueueOnFail: true });
      if (!res.ok) break;
    }

    for (const [collectionKey, colMap] of Object.entries(outboxState.upserts || {})) {
      const records = colMap && typeof colMap === 'object' ? Object.values(colMap) : [];
      if (records.length === 0) continue;
      const res = await upsertCollectionToSupabase(collectionKey, records, { enqueueOnFail: true });
      if (!res.ok) break;
    }
  } catch {} finally {
    isFlushingOutbox = false;
  }
  return getSupabaseOutboxStats();
}

// Reintento automático en segundo plano cada 20 segundos si quedan registros en cola
setInterval(() => {
  const { totalPending } = getSupabaseOutboxStats();
  if (totalPending > 0 && Date.now() >= supabaseBackoffUntil) {
    flushSupabaseOutbox().catch(() => {});
  }
}, 20000).unref?.();

export async function fetchCollectionFromSupabase(collectionKey, maxRows = collectionKey === 'tickets' ? 20000 : 5000) {
  const client = getSupabaseServerClient();
  const table = COLLECTION_TO_TABLE[collectionKey];
  if (!client || !table || Date.now() < supabaseBackoffUntil) return null;

  const PAGE_SIZE = 1000;
  const allRows = [];
  let offset = 0;

  try {
    while (offset < maxRows) {
      let q = client.from(table).select('id, payload, updated_at');
      if (collectionKey === 'tickets') {
        q = q.order('date', { ascending: false }).order('updated_at', { ascending: false }).order('id', { ascending: true });
      } else {
        q = q.order('updated_at', { ascending: false }).order('id', { ascending: true });
      }
      const to = Math.min(offset + PAGE_SIZE - 1, maxRows - 1);
      const { data, error } = await q.range(offset, to);
      if (error) {
        if (isAbortOrTimeoutError(error.message)) {
          supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
        } else {
          console.warn(`[Supabase] Error leyendo ${table}:`, error.message);
        }
        return allRows.length > 0 ? allRows : null;
      }
      supabaseBackoffUntil = 0;
      const chunk = (data || []).map((row) => row.payload).filter(Boolean);
      allRows.push(...chunk);
      if (!data || data.length < PAGE_SIZE) {
        break;
      }
      offset += PAGE_SIZE;
    }
    return allRows;
  } catch (err) {
    if (isAbortOrTimeoutError(err)) {
      supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
    } else {
      console.warn(`[Supabase] Excepción leyendo ${table}:`, err?.message);
    }
    return allRows.length > 0 ? allRows : null;
  }
}

export async function fetchAllFromSupabase(forceRefresh = false) {
  const client = getSupabaseServerClient();
  if (forceRefresh) {
    supabaseBackoffUntil = 0;
  }
  if (!client || Date.now() < supabaseBackoffUntil) return null;

  try {
    // Sondeo rápido para evitar esperar 14 tablas si Postgres/PostgREST está caído o pausado
    const { error: pingErr } = await client.from('bakery_tickets').select('id').limit(1);
    if (pingErr) {
      if (isAbortOrTimeoutError(pingErr.message)) {
        supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
      }
      return null;
    }
    supabaseBackoffUntil = 0;

    const keys = Object.keys(COLLECTION_TO_TABLE);
    const collectionMap = {};
    let loadedAny = false;

    // Consultar en bloques de 4 colecciones para no saturar conexiones concurrentes
    for (let i = 0; i < keys.length; i += 4) {
      if (Date.now() < supabaseBackoffUntil) break;
      const batch = keys.slice(i, i + 4);
      const batchResults = await Promise.all(batch.map((k) => fetchCollectionFromSupabase(k)));
      batch.forEach((k, idx) => {
        const list = batchResults[idx];
        if (Array.isArray(list)) {
          collectionMap[k] = list;
          loadedAny = true;
        } else {
          collectionMap[k] = [];
        }
      });
    }

    const { data: deletedRows } = await client
      .from('bakery_deleted_records')
      .select('entity, record_id')
      .order('deleted_at', { ascending: false })
      .limit(2000);

    const result = { ...collectionMap, deletedIds: {} };
    if (Array.isArray(deletedRows)) {
      for (const row of deletedRows) {
        if (!row?.entity || !row?.record_id) continue;
        if (!result.deletedIds[row.entity]) result.deletedIds[row.entity] = [];
        result.deletedIds[row.entity].push(String(row.record_id));
      }
    }

    return loadedAny ? result : null;
  } catch (err) {
    if (isAbortOrTimeoutError(err)) {
      supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
    } else {
      console.warn('[Supabase] Error hidratando datos desde Supabase:', err?.message);
    }
    return null;
  }
}

const HOT_WATERMARK_COLLECTIONS = [
  'tickets',
  'orders',
  'dailyDeliveries',
  'vipOrders',
  'supplierBills',
  'outflows',
  'shiftCuts',
];

let cachedWatermark = { latestUpdatedAt: null, checkedAt: 0 };
let inFlightWatermarkPromise = null;

/**
 * Consulta ultra-ligera (1 solo round-trip en paralelo sobre tablas activas, caché 2.5s)
 * para detectar cambios desde cualquier dispositivo del mundo en ~100ms.
 */
export async function getSupabaseLatestWatermark(forceFresh = false) {
  const client = getSupabaseServerClient();
  if (!client || Date.now() < supabaseBackoffUntil) {
    return { ok: false, latestUpdatedAt: cachedWatermark.latestUpdatedAt };
  }
  if (!forceFresh && Date.now() - cachedWatermark.checkedAt < 2500) {
    return { ok: true, latestUpdatedAt: cachedWatermark.latestUpdatedAt };
  }
  if (inFlightWatermarkPromise) return inFlightWatermarkPromise;

  inFlightWatermarkPromise = (async () => {
    try {
      const [checks, delRes] = await Promise.all([
        Promise.all(
          HOT_WATERMARK_COLLECTIONS.map(async (colKey) => {
            const tbl = COLLECTION_TO_TABLE[colKey];
            const { data, error } = await client
              .from(tbl)
              .select('updated_at')
              .order('updated_at', { ascending: false })
              .limit(1);
            if (error) {
              if (isAbortOrTimeoutError(error.message)) {
                supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
              }
              return null;
            }
            return data?.[0]?.updated_at || null;
          })
        ),
        client
          .from('bakery_deleted_records')
          .select('deleted_at')
          .order('deleted_at', { ascending: false })
          .limit(1),
      ]);

      let maxIso = delRes?.data?.[0]?.deleted_at || null;
      let maxMs = maxIso ? new Date(maxIso).getTime() : 0;

      for (const iso of checks) {
        if (!iso) continue;
        const ms = new Date(iso).getTime();
        if (Number.isFinite(ms) && ms > maxMs) {
          maxMs = ms;
          maxIso = iso;
        }
      }

      if (maxIso) {
        cachedWatermark = { latestUpdatedAt: maxIso, checkedAt: Date.now() };
      } else {
        cachedWatermark.checkedAt = Date.now();
      }
      return { ok: Date.now() >= supabaseBackoffUntil, latestUpdatedAt: cachedWatermark.latestUpdatedAt };
    } catch (err) {
      if (isAbortOrTimeoutError(err)) {
        supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
      }
      return { ok: false, latestUpdatedAt: cachedWatermark.latestUpdatedAt };
    } finally {
      inFlightWatermarkPromise = null;
    }
  })();

  return inFlightWatermarkPromise;
}

/**
 * Descarga ÚNICAMENTE los registros modificados después de `sinceIso` en 1 SOLO round-trip paralelo,
 * evitando re-escanear miles de filas y entregando cambios en ~100ms.
 */
export async function fetchDeltaSinceFromSupabase(sinceIso, { hotOnly = false } = {}) {
  const client = getSupabaseServerClient();
  if (!client || Date.now() < supabaseBackoffUntil) return null;

  try {
    const safeSince = sinceIso && !Number.isNaN(new Date(sinceIso).getTime())
      ? new Date(new Date(sinceIso).getTime() - 1500).toISOString()
      : new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const keys = hotOnly ? HOT_WATERMARK_COLLECTIONS : Object.keys(COLLECTION_TO_TABLE);
    const delta = { deletedIds: {} };
    let hasChanges = false;
    let latestIso = sinceIso || null;
    let latestMs = latestIso ? new Date(latestIso).getTime() : 0;

    const [allRes, delRes] = await Promise.all([
      Promise.all(
        keys.map(async (colKey) => {
          const tbl = COLLECTION_TO_TABLE[colKey];
          const { data, error } = await client
            .from(tbl)
            .select('payload, updated_at')
            .gt('updated_at', safeSince)
            .order('updated_at', { ascending: false })
            .limit(250);
          if (error) {
            if (isAbortOrTimeoutError(error.message)) {
              supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
            }
            return { colKey, rows: [] };
          }
          return { colKey, rows: data || [] };
        })
      ),
      client
        .from('bakery_deleted_records')
        .select('entity, record_id, deleted_at')
        .gt('deleted_at', safeSince)
        .order('deleted_at', { ascending: false })
        .limit(250),
    ]);

    for (const { colKey, rows } of allRes) {
      if (rows.length > 0) {
        delta[colKey] = rows.map((r) => r.payload).filter(Boolean);
        hasChanges = true;
        for (const r of rows) {
          const ms = r.updated_at ? new Date(r.updated_at).getTime() : 0;
          if (ms > latestMs) {
            latestMs = ms;
            latestIso = r.updated_at;
          }
        }
      }
    }

    const delRows = delRes?.data;
    if (Array.isArray(delRows) && delRows.length > 0) {
      hasChanges = true;
      for (const row of delRows) {
        if (!row?.entity || !row?.record_id) continue;
        if (!delta.deletedIds[row.entity]) delta.deletedIds[row.entity] = [];
        delta.deletedIds[row.entity].push(String(row.record_id));
        const ms = row.deleted_at ? new Date(row.deleted_at).getTime() : 0;
        if (ms > latestMs) {
          latestMs = ms;
          latestIso = row.deleted_at;
        }
      }
    }

    return hasChanges ? { delta, latestUpdatedAt: latestIso } : null;
  } catch (err) {
    if (isAbortOrTimeoutError(err)) {
      supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
    }
    return null;
  }
}

const MEDIA_BUCKET = 'santafe-media';
let mediaBucketEnsured = false;

/**
 * Sube una imagen/PDF/XML base64 al bucket público `santafe-media` en Supabase Storage
 * para que las fotos se carguen al instante desde cualquier celular sin saturar localStorage.
 */
export async function uploadMediaToSupabaseStorage({ dataUrl, folder = 'receipts', fileName = '' }) {
  const client = getSupabaseServerClient();
  const env = getSupabaseEnv();
  if (!client || !dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return { ok: false, reason: 'invalid_or_unconfigured' };
  }
  if (Date.now() < supabaseBackoffUntil) {
    return { ok: false, reason: 'supabase_backoff' };
  }

  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return { ok: false, reason: 'invalid_data_url' };
    const contentType = match[1] || 'image/jpeg';
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    if (!mediaBucketEnsured && env.mode === 'service_role') {
      try {
        await client.storage.createBucket(MEDIA_BUCKET, { public: true });
      } catch {}
      mediaBucketEnsured = true;
    }

    const extMap = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'application/xml': 'xml',
      'text/xml': 'xml',
    };
    const ext = extMap[contentType.toLowerCase()] || 'bin';
    const safeFolder = String(folder || 'receipts').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeName = String(fileName || 'file')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const objectPath = `${safeFolder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}.${ext}`;

    const { error } = await client.storage
      .from(MEDIA_BUCKET)
      .upload(objectPath, buffer, {
        contentType,
        upsert: true,
        cacheControl: '31536000',
      });

    if (error) {
      if (isAbortOrTimeoutError(error.message)) {
        supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
      }
      return { ok: false, error: formatSupabaseError(error.message) };
    }

    const { data: pubData } = client.storage.from(MEDIA_BUCKET).getPublicUrl(objectPath);
    if (pubData?.publicUrl) {
      return { ok: true, publicUrl: pubData.publicUrl, path: objectPath };
    }
    return { ok: false, reason: 'no_public_url' };
  } catch (err) {
    if (isAbortOrTimeoutError(err)) {
      supabaseBackoffUntil = Date.now() + SUPABASE_BACKOFF_MS;
    }
    return { ok: false, error: formatSupabaseError(err) };
  }
}

