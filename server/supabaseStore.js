import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_PROJECT_ID = 'icroicyyekqxmufyxeqc';
export const DEFAULT_SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;

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

let cachedClient = null;
let cachedSignature = '';

export function getSupabaseEnv() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  const mode = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 'service_role'
    : key
    ? 'anon'
    : 'unconfigured';
  return { url, key, mode, projectId: SUPABASE_PROJECT_ID };
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

function toTableRow(collectionKey, record) {
  const id = normalizeRecordId(collectionKey, record);
  if (!id) return null;
  const nowIso = new Date().toISOString();
  const branch = record.branch || record.branchId || 'refugio';

  switch (collectionKey) {
    case 'tickets':
      return {
        id,
        folio: record.folio ? String(record.folio) : id,
        date: record.date ? String(record.date) : nowIso.split('T')[0],
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
        date: record.date ? String(record.date) : nowIso.split('T')[0],
        branch,
        shift_type: record.shiftType ? String(record.shiftType) : null,
        updated_at: nowIso,
        payload: { ...record, id },
      };
    case 'outflows':
      return {
        id,
        date: record.date ? String(record.date) : nowIso.split('T')[0],
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
        date: record.date ? String(record.date) : nowIso.split('T')[0],
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

export async function getSupabaseStatus() {
  const env = getSupabaseEnv();
  if (!env.key) {
    return {
      configured: false,
      projectId: env.projectId,
      url: env.url,
      mode: env.mode,
      tablesReady: false,
      error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY en las variables de entorno.',
    };
  }

  const client = getSupabaseServerClient();
  if (!client) {
    return {
      configured: false,
      projectId: env.projectId,
      url: env.url,
      mode: env.mode,
      tablesReady: false,
      error: 'No se pudo inicializar el cliente de Supabase.',
    };
  }

  try {
    const { error } = await client.from('bakery_tickets').select('id').limit(1);
    if (error) {
      return {
        configured: true,
        projectId: env.projectId,
        url: env.url,
        mode: env.mode,
        tablesReady: false,
        error: error.message,
      };
    }
    return {
      configured: true,
      projectId: env.projectId,
      url: env.url,
      mode: env.mode,
      tablesReady: true,
    };
  } catch (err) {
    return {
      configured: true,
      projectId: env.projectId,
      url: env.url,
      mode: env.mode,
      tablesReady: false,
      error: err?.message || 'Error conectando con Supabase',
    };
  }
}

export async function upsertCollectionToSupabase(collectionKey, records) {
  const client = getSupabaseServerClient();
  const table = COLLECTION_TO_TABLE[collectionKey];
  if (!client || !table || !Array.isArray(records) || records.length === 0) {
    return { ok: false, count: 0 };
  }

  const dedup = new Map();
  for (const item of records) {
    const row = toTableRow(collectionKey, item);
    if (row) dedup.set(row.id, row);
  }
  const rows = Array.from(dedup.values());
  if (rows.length === 0) return { ok: true, count: 0 };

  // Subir en bloques de 200 para evitar timeouts o límites de payload
  const CHUNK_SIZE = 200;
  let totalUpserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await client.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) {
      console.warn(`[Supabase] Error guardando en ${table}:`, error.message);
      return { ok: false, count: totalUpserted, error: error.message };
    }
    totalUpserted += chunk.length;
  }
  return { ok: true, count: totalUpserted };
}

export async function deleteRecordsFromSupabase(collectionKey, ids) {
  const client = getSupabaseServerClient();
  const table = COLLECTION_TO_TABLE[collectionKey];
  const cleanIds = (ids || []).filter(Boolean).map(String);
  if (!client || !table || cleanIds.length === 0) return { ok: false };

  try {
    const deleteMarkers = cleanIds.map((recordId) => ({
      entity_id: `${collectionKey}::${recordId}`,
      entity: collectionKey,
      record_id: recordId,
      deleted_at: new Date().toISOString(),
    }));
    await client.from('bakery_deleted_records').upsert(deleteMarkers, { onConflict: 'entity_id' });
    const { error } = await client.from(table).delete().in('id', cleanIds);
    if (error) {
      console.warn(`[Supabase] Error eliminando de ${table}:`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.warn(`[Supabase] Excepción eliminando de ${table}:`, err?.message);
    return { ok: false, error: err?.message };
  }
}

export async function syncDeltaToSupabase(payload) {
  const client = getSupabaseServerClient();
  if (!client || !payload || typeof payload !== 'object') return { ok: false, skipped: true };

  const tasks = [];
  for (const collectionKey of Object.keys(COLLECTION_TO_TABLE)) {
    if (Array.isArray(payload[collectionKey]) && payload[collectionKey].length > 0) {
      tasks.push(upsertCollectionToSupabase(collectionKey, payload[collectionKey]));
    }
  }

  if (payload.deletedIds && typeof payload.deletedIds === 'object') {
    for (const [entity, ids] of Object.entries(payload.deletedIds)) {
      if (COLLECTION_TO_TABLE[entity] && Array.isArray(ids) && ids.length > 0) {
        tasks.push(deleteRecordsFromSupabase(entity, ids));
      }
    }
  }

  if (tasks.length === 0) return { ok: true, count: 0 };
  await Promise.allSettled(tasks);
  return { ok: true };
}

export async function fetchCollectionFromSupabase(collectionKey, limitCount = 1500) {
  const client = getSupabaseServerClient();
  const table = COLLECTION_TO_TABLE[collectionKey];
  if (!client || !table) return null;

  try {
    let q = client.from(table).select('id, payload, updated_at');
    if (collectionKey === 'tickets') {
      q = q.order('date', { ascending: false }).order('updated_at', { ascending: false }).limit(limitCount);
    } else {
      q = q.order('updated_at', { ascending: false }).limit(limitCount);
    }
    const { data, error } = await q;
    if (error) {
      console.warn(`[Supabase] Error leyendo ${table}:`, error.message);
      return null;
    }
    return (data || []).map((row) => row.payload).filter(Boolean);
  } catch (err) {
    console.warn(`[Supabase] Excepción leyendo ${table}:`, err?.message);
    return null;
  }
}

export async function fetchAllFromSupabase() {
  const client = getSupabaseServerClient();
  if (!client) return null;

  try {
    const keys = Object.keys(COLLECTION_TO_TABLE);
    const [collectionResults, deletedResult] = await Promise.all([
      Promise.all(keys.map((k) => fetchCollectionFromSupabase(k))),
      client
        .from('bakery_deleted_records')
        .select('entity, record_id')
        .order('deleted_at', { ascending: false })
        .limit(2000),
    ]);

    const result = { deletedIds: {} };
    let loadedAny = false;
    keys.forEach((k, idx) => {
      const list = collectionResults[idx];
      if (Array.isArray(list)) {
        result[k] = list;
        loadedAny = true;
      } else {
        result[k] = [];
      }
    });

    if (deletedResult && Array.isArray(deletedResult.data)) {
      for (const row of deletedResult.data) {
        if (!row?.entity || !row?.record_id) continue;
        if (!result.deletedIds[row.entity]) result.deletedIds[row.entity] = [];
        result.deletedIds[row.entity].push(String(row.record_id));
      }
    }

    return loadedAny ? result : null;
  } catch (err) {
    console.warn('[Supabase] Error hidratando datos desde Supabase:', err?.message);
    return null;
  }
}
