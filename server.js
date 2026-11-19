import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getPusherPublicConfig, triggerPusherSync } from './server/pusherHelper.js';
import { handleMercadoPagoProxyAction } from './server/mercadoPagoProxy.js';
import {
  getSupabaseStatus,
  getSupabasePublicConfig,
  getSupabaseLatestWatermark,
  fetchDeltaSinceFromSupabase,
  uploadMediaToSupabaseStorage,
  fetchAllFromSupabase,
  fetchCollectionFromSupabase,
  upsertCollectionToSupabase,
  deleteRecordsFromSupabase,
  syncDeltaToSupabase,
  flushSupabaseOutbox
} from './server/supabaseStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Almacenamiento persistente en disco del servidor
const STORAGE_FILE = path.join('/tmp', 'santafe_server_cloud_store.json');

let serverStore = {
  tickets: [],
  orders: [],
  shiftCuts: [],
  outflows: [],
  customers: [],
  operationalExpenses: [],
  supplierBills: [],
  supplierBankProfiles: [],
  vipCustomers: [],
  vipOrders: [],
  dailyDeliveries: [],
  driverCustomers: [],
  driverSettlements: [],
  deletedIds: {},
  lastUpdated: new Date().toISOString()
};

// Cargar estado inicial desde disco
try {
  if (fs.existsSync(STORAGE_FILE)) {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      serverStore = {
        tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        shiftCuts: Array.isArray(parsed.shiftCuts) ? parsed.shiftCuts : [],
        outflows: Array.isArray(parsed.outflows) ? parsed.outflows : [],
        customers: Array.isArray(parsed.customers) ? parsed.customers : [],
        operationalExpenses: Array.isArray(parsed.operationalExpenses) ? parsed.operationalExpenses : [],
        supplierBills: Array.isArray(parsed.supplierBills) ? parsed.supplierBills : [],
        supplierBankProfiles: Array.isArray(parsed.supplierBankProfiles) ? parsed.supplierBankProfiles : [],
        vipCustomers: Array.isArray(parsed.vipCustomers) ? parsed.vipCustomers : [],
        vipOrders: Array.isArray(parsed.vipOrders) ? parsed.vipOrders : [],
        dailyDeliveries: Array.isArray(parsed.dailyDeliveries) ? parsed.dailyDeliveries : [],
        driverCustomers: Array.isArray(parsed.driverCustomers) ? parsed.driverCustomers : [],
        driverSettlements: Array.isArray(parsed.driverSettlements) ? parsed.driverSettlements : [],
        deletedIds: parsed.deletedIds && typeof parsed.deletedIds === 'object' ? parsed.deletedIds : {},
        lastUpdated: parsed.lastUpdated || new Date().toISOString()
      };
    }
  }
} catch (e) {
  console.warn('Iniciando almacenamiento nuevo en servidor:', e.message);
}

function persistStore() {
  try {
    serverStore.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(serverStore), 'utf8');
  } catch (e) {
    console.warn('Error persistiendo store en disco:', e.message);
  }
}

// Lista de clientes SSE para sincronización en tiempo real
const sseClients = new Set();

function broadcastSync(updatedData, sourceClientId = null, version = serverStore.lastUpdated) {
  const payload = JSON.stringify({
    type: 'SYNC_UPDATE',
    sourceClientId,
    version,
    data: updatedData,
    timestamp: Date.now()
  });
  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  });
}

// Keepalive SSE cada 15s para evitar que Cloud Run / proxies / redes móviles 4G cierren la conexión
setInterval(() => {
  if (sseClients.size === 0) return;
  const pingMsg = `: keepalive ${Date.now()}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(pingMsg);
    } catch {
      sseClients.delete(client);
    }
  });
}, 15000).unref?.();

// Helpers de fusión de datos
function mergeTicketsServer(existing, incoming) {
  const map = new Map();
  const getKey = (t) => {
    if (t.id && String(t.id).trim() !== '') return `id:${String(t.id).trim()}`;
    if (t.folio && String(t.folio).trim() !== '') return `folio:${String(t.folio).trim()}`;
    const gen = `ticket-${t.timestamp ? new Date(t.timestamp).getTime() : Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    t.id = gen;
    return `id:${gen}`;
  };

  for (const t of existing || []) {
    if (!t) continue;
    map.set(getKey(t), t);
  }
  for (const t of incoming || []) {
    if (!t) continue;
    const key = getKey(t);
    if (map.has(key)) {
      map.set(key, { ...map.get(key), ...t });
    } else {
      map.set(key, t);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeB - timeA;
  });
}

function mergeOrdersServer(existing, incoming) {
  const map = new Map();
  for (const o of existing || []) {
    if (o && (o.id || o.folio)) map.set(o.id || o.folio, o);
  }
  for (const o of incoming || []) {
    if (!o || (!o.id && !o.folio)) continue;
    const key = o.id || o.folio;
    if (map.has(key)) {
      map.set(key, { ...map.get(key), ...o });
    } else {
      map.set(key, o);
    }
  }
  return Array.from(map.values());
}

function mergeShiftCutsServer(existing, incoming) {
  const map = new Map();
  for (const c of existing || []) {
    if (c) map.set(c.id || c.folio || `${c.date}_${c.shiftType}`, c);
  }
  for (const c of incoming || []) {
    if (!c) continue;
    const key = c.id || c.folio || `${c.date}_${c.shiftType}`;
    if (map.has(key)) {
      map.set(key, { ...map.get(key), ...c });
    } else {
      map.set(key, c);
    }
  }
  return Array.from(map.values());
}

function mergeOutflowsServer(existing, incoming) {
  const map = new Map();
  for (const o of existing || []) {
    if (o && o.id) map.set(o.id, o);
  }
  for (const o of incoming || []) {
    if (o && o.id) map.set(o.id, { ...(map.get(o.id) || {}), ...o });
  }
  return Array.from(map.values());
}

let supabaseHydrated = false;
let supabaseHydratePromise = null;

async function ensureSupabaseHydrated(force = false) {
  if (supabaseHydrated && !force) return;
  if (!supabaseHydratePromise) {
    supabaseHydratePromise = (async () => {
      try {
        const remote = await fetchAllFromSupabase(force);
        if (remote) {
          if (remote.deletedIds) {
            const nextDeleted = { ...(serverStore.deletedIds || {}) };
            for (const [ent, ids] of Object.entries(remote.deletedIds)) {
              const s = new Set([...(nextDeleted[ent] || []), ...(Array.isArray(ids) ? ids : [])]);
              nextDeleted[ent] = Array.from(s).slice(-1000);
            }
            serverStore.deletedIds = nextDeleted;
          }
          if (Array.isArray(remote.tickets) && remote.tickets.length > 0) {
            serverStore.tickets = mergeTicketsServer(serverStore.tickets, remote.tickets);
          }
          if (Array.isArray(remote.orders) && remote.orders.length > 0) {
            serverStore.orders = mergeOrdersServer(serverStore.orders, remote.orders);
          }
          if (Array.isArray(remote.shiftCuts) && remote.shiftCuts.length > 0) {
            serverStore.shiftCuts = mergeShiftCutsServer(serverStore.shiftCuts, remote.shiftCuts);
          }
          if (Array.isArray(remote.outflows) && remote.outflows.length > 0) {
            serverStore.outflows = mergeOutflowsServer(serverStore.outflows, remote.outflows);
          }
          const simpleMerge = (existing, incoming, keyFn) => {
            const map = new Map();
            for (const x of existing || []) {
              const k = keyFn(x);
              if (k) map.set(k, x);
            }
            for (const x of incoming || []) {
              const k = keyFn(x);
              if (k) map.set(k, { ...(map.get(k) || {}), ...x });
            }
            return Array.from(map.values());
          };
          const mergeSupplierBillsServer = (existing, incoming) => {
            const toMs = (iso) => {
              if (!iso) return 0;
              const t = new Date(iso).getTime();
              return Number.isFinite(t) ? t : 0;
            };
            const map = new Map();
            for (const b of existing || []) {
              if (b?.id) map.set(b.id, b);
            }
            for (const b of incoming || []) {
              if (!b?.id) continue;
              const prev = map.get(b.id);
              if (!prev) {
                map.set(b.id, b);
                continue;
              }
              const prevTime = toMs(prev.updatedAt);
              const incTime = toMs(b.updatedAt);
              const base = incTime >= prevTime ? { ...prev, ...b } : { ...b, ...prev };

              const prevRDel = toMs(prev.receiptDeletedAt);
              const incRDel = toMs(b.receiptDeletedAt);
              const maxRDel = Math.max(prevRDel, incRDel);
              const maxRUp = Math.max(toMs(prev.receiptUploadedAt), toMs(b.receiptUploadedAt), prevTime, incTime);
              let receiptImageUrl = b.receiptImageUrl || prev.receiptImageUrl || '';
              let receiptFileName = b.receiptFileName || prev.receiptFileName || '';
              let receiptUploadedAt = b.receiptUploadedAt || prev.receiptUploadedAt || '';
              const receiptDeletedAt = incRDel >= prevRDel ? b.receiptDeletedAt : prev.receiptDeletedAt;
              if (maxRDel > 0 && maxRDel >= maxRUp && ((incRDel >= prevRDel && !b.receiptImageUrl) || (prevRDel > incRDel && !prev.receiptImageUrl))) {
                receiptImageUrl = '';
                receiptFileName = '';
                receiptUploadedAt = '';
              }

              const prevIDel = toMs(prev.invoiceDeletedAt);
              const incIDel = toMs(b.invoiceDeletedAt);
              const maxIDel = Math.max(prevIDel, incIDel);
              const maxIUp = Math.max(toMs(prev.invoiceUploadedAt), toMs(b.invoiceUploadedAt), prevTime, incTime);
              let invoiceFileUrl = b.invoiceFileUrl || prev.invoiceFileUrl || '';
              let invoiceFileName = b.invoiceFileName || prev.invoiceFileName || '';
              let invoiceUploadedAt = b.invoiceUploadedAt || prev.invoiceUploadedAt || '';
              const invoiceDeletedAt = incIDel >= prevIDel ? b.invoiceDeletedAt : prev.invoiceDeletedAt;
              if (maxIDel > 0 && maxIDel >= maxIUp && ((incIDel >= prevIDel && !b.invoiceFileUrl) || (prevIDel > incIDel && !prev.invoiceFileUrl))) {
                invoiceFileUrl = '';
                invoiceFileName = '';
                invoiceUploadedAt = '';
              }

              map.set(b.id, {
                ...base,
                bankInfo: b.bankInfo || prev.bankInfo,
                receiptImageUrl,
                receiptFileName,
                receiptUploadedAt,
                receiptDeletedAt,
                invoiceFileUrl,
                invoiceFileName,
                invoiceUploadedAt,
                invoiceDeletedAt
              });
            }
            return Array.from(map.values());
          };
          const deepMergeDailyDeliveriesServer = (existing, incoming) => {
            const delMap = new Map();
            for (const d of existing || []) {
              if (d?.date && d?.shift) delMap.set(`${d.date}_${d.shift}`, d);
            }
            for (const d of incoming || []) {
              if (!d?.date || !d?.shift || !d?.quantities) continue;
              const key = `${d.date}_${d.shift}`;
              const prev = delMap.get(key);
              const mergedQty = { ...(prev?.quantities || {}) };
              for (const [clientId, breads] of Object.entries(d.quantities || {})) {
                if (breads && typeof breads === 'object') {
                  mergedQty[clientId] = {
                    ...(mergedQty[clientId] && typeof mergedQty[clientId] === 'object' ? mergedQty[clientId] : {}),
                    ...breads
                  };
                }
              }
              delMap.set(key, {
                id: d.id || key,
                date: d.date,
                shift: d.shift,
                quantities: mergedQty,
                updatedAt: d.updatedAt || new Date().toISOString()
              });
            }
            return Array.from(delMap.values());
          };
          if (remote.customers?.length) serverStore.customers = simpleMerge(serverStore.customers, remote.customers, c => c?.id || c?.phone);
          if (remote.operationalExpenses?.length) serverStore.operationalExpenses = simpleMerge(serverStore.operationalExpenses, remote.operationalExpenses, e => e?.id);
          if (remote.supplierBills?.length) serverStore.supplierBills = mergeSupplierBillsServer(serverStore.supplierBills, remote.supplierBills);
          if (remote.supplierBankProfiles?.length) serverStore.supplierBankProfiles = simpleMerge(serverStore.supplierBankProfiles, remote.supplierBankProfiles, b => b?.id);
          if (remote.vipCustomers?.length) serverStore.vipCustomers = simpleMerge(serverStore.vipCustomers, remote.vipCustomers, c => c?.id);
          if (remote.vipOrders?.length) serverStore.vipOrders = simpleMerge(serverStore.vipOrders, remote.vipOrders, o => o?.id);
          if (remote.driverCustomers?.length) serverStore.driverCustomers = simpleMerge(serverStore.driverCustomers, remote.driverCustomers, c => c?.id);
          if (remote.dailyDeliveries?.length) serverStore.dailyDeliveries = deepMergeDailyDeliveriesServer(serverStore.dailyDeliveries, remote.dailyDeliveries);
          if (remote.driverSettlements?.length) serverStore.driverSettlements = simpleMerge(serverStore.driverSettlements, remote.driverSettlements, s => s?.id);
          persistStore();
          lastSupabaseDeltaIso = new Date().toISOString();
          supabaseHydrated = true;
        }
      } catch (err) {
        console.warn('Error hidratando Supabase:', err?.message);
      } finally {
        supabaseHydratePromise = null;
      }
    })();
  }
  await supabaseHydratePromise;
}

let lastSupabaseDeltaIso = new Date().toISOString();
let incrementalPullPromise = null;

function mergeDeltaIntoServerStore(remoteDelta) {
  if (!remoteDelta || typeof remoteDelta !== 'object') return false;
  let changed = false;

  const nextDeleted = { ...(serverStore.deletedIds || {}) };
  if (remoteDelta.deletedIds && typeof remoteDelta.deletedIds === 'object') {
    for (const [ent, ids] of Object.entries(remoteDelta.deletedIds)) {
      if (!Array.isArray(ids) || ids.length === 0) continue;
      const s = new Set([...(nextDeleted[ent] || []), ...ids.map(String)]);
      nextDeleted[ent] = Array.from(s).slice(-1000);
      changed = true;
    }
    serverStore.deletedIds = nextDeleted;
  }

  const simpleMerge = (existing, incoming, keyFn) => {
    const map = new Map();
    for (const x of existing || []) {
      const k = keyFn(x);
      if (k) map.set(k, x);
    }
    for (const x of incoming || []) {
      const k = keyFn(x);
      if (k) {
        const prev = map.get(k);
        // Preservar URLs de archivos/imágenes en pedidos VIP si el entrante viene vacío
        const merged = prev
          ? {
              ...prev,
              ...x,
              ...(prev.paymentReceiptUrl && !x.paymentReceiptUrl ? { paymentReceiptUrl: prev.paymentReceiptUrl } : {}),
              ...(prev.invoicePdfUrl && !x.invoicePdfUrl ? { invoicePdfUrl: prev.invoicePdfUrl } : {}),
              ...(prev.invoiceXmlUrl && !x.invoiceXmlUrl ? { invoiceXmlUrl: prev.invoiceXmlUrl } : {}),
              ...(prev.receiptImageUrl && !x.receiptImageUrl && !x.receiptDeletedAt ? { receiptImageUrl: prev.receiptImageUrl } : {}),
              ...(prev.invoiceFileUrl && !x.invoiceFileUrl && !x.invoiceDeletedAt ? { invoiceFileUrl: prev.invoiceFileUrl } : {}),
            }
          : x;
        map.set(k, merged);
      }
    }
    return Array.from(map.values());
  };

  if (Array.isArray(remoteDelta.tickets) && remoteDelta.tickets.length > 0) {
    serverStore.tickets = mergeTicketsServer(serverStore.tickets, remoteDelta.tickets);
    changed = true;
  }
  if (Array.isArray(remoteDelta.orders) && remoteDelta.orders.length > 0) {
    serverStore.orders = mergeOrdersServer(serverStore.orders, remoteDelta.orders);
    changed = true;
  }
  if (Array.isArray(remoteDelta.shiftCuts) && remoteDelta.shiftCuts.length > 0) {
    serverStore.shiftCuts = mergeShiftCutsServer(serverStore.shiftCuts, remoteDelta.shiftCuts);
    changed = true;
  }
  if (Array.isArray(remoteDelta.outflows) && remoteDelta.outflows.length > 0) {
    serverStore.outflows = mergeOutflowsServer(serverStore.outflows, remoteDelta.outflows);
    changed = true;
  }
  if (Array.isArray(remoteDelta.customers) && remoteDelta.customers.length > 0) {
    serverStore.customers = simpleMerge(serverStore.customers, remoteDelta.customers, c => c?.id || c?.phone);
    changed = true;
  }
  if (Array.isArray(remoteDelta.operationalExpenses) && remoteDelta.operationalExpenses.length > 0) {
    serverStore.operationalExpenses = simpleMerge(serverStore.operationalExpenses, remoteDelta.operationalExpenses, e => e?.id);
    changed = true;
  }
  if (Array.isArray(remoteDelta.supplierBills) && remoteDelta.supplierBills.length > 0) {
    serverStore.supplierBills = simpleMerge(serverStore.supplierBills, remoteDelta.supplierBills, b => b?.id);
    changed = true;
  }
  if (Array.isArray(remoteDelta.supplierBankProfiles) && remoteDelta.supplierBankProfiles.length > 0) {
    serverStore.supplierBankProfiles = simpleMerge(serverStore.supplierBankProfiles, remoteDelta.supplierBankProfiles, b => b?.id);
    changed = true;
  }
  if (Array.isArray(remoteDelta.vipCustomers) && remoteDelta.vipCustomers.length > 0) {
    serverStore.vipCustomers = simpleMerge(serverStore.vipCustomers, remoteDelta.vipCustomers, c => c?.id);
    changed = true;
  }
  if (Array.isArray(remoteDelta.vipOrders) && remoteDelta.vipOrders.length > 0) {
    serverStore.vipOrders = simpleMerge(serverStore.vipOrders, remoteDelta.vipOrders, o => o?.id);
    changed = true;
  }
  if (Array.isArray(remoteDelta.driverCustomers) && remoteDelta.driverCustomers.length > 0) {
    serverStore.driverCustomers = simpleMerge(serverStore.driverCustomers, remoteDelta.driverCustomers, c => c?.id);
    changed = true;
  }
  if (Array.isArray(remoteDelta.dailyDeliveries) && remoteDelta.dailyDeliveries.length > 0) {
    serverStore.dailyDeliveries = simpleMerge(serverStore.dailyDeliveries, remoteDelta.dailyDeliveries, d => d?.date && d?.shift ? `${d.date}_${d.shift}` : d?.id);
    changed = true;
  }
  if (Array.isArray(remoteDelta.driverSettlements) && remoteDelta.driverSettlements.length > 0) {
    serverStore.driverSettlements = simpleMerge(serverStore.driverSettlements, remoteDelta.driverSettlements, s => s?.id);
    changed = true;
  }

  // Aplicar filtros de borrado
  const delSet = (k) => new Set(serverStore.deletedIds?.[k] || []);
  serverStore.tickets = (serverStore.tickets || []).filter(t => t && !delSet('tickets').has(t.id) && !(t.folio && delSet('tickets').has(t.folio)));
  serverStore.orders = (serverStore.orders || []).filter(o => o && !delSet('orders').has(o.id) && !(o.folio && delSet('orders').has(o.folio)));
  serverStore.outflows = (serverStore.outflows || []).filter(o => o?.id && !delSet('outflows').has(o.id));
  serverStore.operationalExpenses = (serverStore.operationalExpenses || []).filter(e => e?.id && !delSet('operationalExpenses').has(e.id));
  serverStore.supplierBills = (serverStore.supplierBills || []).filter(b => b?.id && !delSet('supplierBills').has(b.id));
  serverStore.vipCustomers = (serverStore.vipCustomers || []).filter(c => c?.id && !delSet('vipCustomers').has(c.id));
  serverStore.vipOrders = (serverStore.vipOrders || []).filter(o => o?.id && !delSet('vipOrders').has(o.id));
  serverStore.driverCustomers = (serverStore.driverCustomers || []).filter(c => c?.id && !delSet('driverCustomers').has(c.id));

  return changed;
}

async function pullSupabaseDeltaIfNewer() {
  if (incrementalPullPromise) return incrementalPullPromise;
  incrementalPullPromise = (async () => {
    try {
      const wm = await getSupabaseLatestWatermark();
      if (!wm?.ok || !wm.latestUpdatedAt) return false;
      const remoteMs = new Date(wm.latestUpdatedAt).getTime();
      const lastMs = lastSupabaseDeltaIso ? new Date(lastSupabaseDeltaIso).getTime() : 0;
      if (!Number.isFinite(remoteMs) || remoteMs <= lastMs) return false;

      const res = await fetchDeltaSinceFromSupabase(lastSupabaseDeltaIso);
      if (res?.delta) {
        const changed = mergeDeltaIntoServerStore(res.delta);
        lastSupabaseDeltaIso = res.latestUpdatedAt || wm.latestUpdatedAt;
        if (changed) {
          persistStore();
          broadcastSync({ ...res.delta, lastUpdated: serverStore.lastUpdated }, 'supabase-cloud', serverStore.lastUpdated);
          return true;
        }
      } else {
        lastSupabaseDeltaIso = wm.latestUpdatedAt;
      }
      return false;
    } catch {
      return false;
    } finally {
      incrementalPullPromise = null;
    }
  })();
  return incrementalPullPromise;
}

// Replicación continua ultra-ligera desde Supabase hacia clientes SSE conectados (celulares / tablets)
setInterval(() => {
  if (sseClients.size > 0) {
    pullSupabaseDeltaIfNewer().catch(() => {});
  }
}, 3000).unref?.();

// 0. Endpoints de Pusher (Configuración pública y Trigger proxy)
app.get('/api/pusher/config', (req, res) => {
  res.json(getPusherPublicConfig());
});

app.post('/api/pusher/trigger', async (req, res) => {
  try {
    const result = await triggerPusherSync(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err?.message || 'trigger_error' });
  }
});

// 0b. Endpoints de Supabase Proxy (Proyecto: icroicyyekqxmufyxeqc)
app.get('/api/supabase/config', (req, res) => {
  res.json(getSupabasePublicConfig());
});

app.get('/api/supabase/status', async (req, res) => {
  const status = await getSupabaseStatus();
  res.json(status);
});

app.post('/api/supabase/upload-media', async (req, res) => {
  try {
    const { dataUrl, folder, fileName } = req.body || {};
    const result = await uploadMediaToSupabaseStorage({ dataUrl, folder, fileName });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'upload_media_error' });
  }
});

app.post('/api/supabase/mutate', async (req, res) => {
  try {
    const { action, collection, record, records, id, ids } = req.body || {};
    if (action === 'flush') {
      const stats = await flushSupabaseOutbox();
      return res.json({ ok: true, ...stats });
    }
    if (!collection) {
      return res.status(400).json({ ok: false, error: 'missing_collection' });
    }
    if (action === 'upsert') {
      const items = Array.isArray(records) ? records : record ? [record] : [];
      const result = await upsertCollectionToSupabase(collection, items);
      return res.json(result);
    }
    if (action === 'delete') {
      const delList = Array.isArray(ids) ? ids : id ? [id] : [];
      const result = await deleteRecordsFromSupabase(collection, delList);
      return res.json(result);
    }
    if (action === 'fetch') {
      const data = await fetchCollectionFromSupabase(collection);
      return res.json({ ok: Array.isArray(data), data: data || [] });
    }
    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'supabase_proxy_error' });
  }
});

// 1. Endpoint SSE para conexión reactiva instantánea
app.get(['/api/sync/events', '/.netlify/functions/sync-events'], (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': keepalive\n\n');

  sseClients.add(res);

  // Enviar estado actual de inmediato
  res.write(`data: ${JSON.stringify({ type: 'INITIAL_STATE', version: serverStore.lastUpdated, data: serverStore })}\n\n`);

  // Verificar si Supabase tiene deltas más nuevos para empujarlos al recién conectado
  pullSupabaseDeltaIfNewer().catch(() => {});

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 2. Endpoint GET de sincronización (soporta ?checkOnly=1 y ?since=<iso> para deltas ultra-ligeros)
app.get(['/api/sync', '/.netlify/functions/sync-data'], async (req, res) => {
  if (req.query?.checkOnly === '1' || req.query?.checkOnly === 'true') {
    await Promise.race([
      pullSupabaseDeltaIfNewer(),
      new Promise((resolve) => setTimeout(resolve, 900))
    ]).catch(() => {});
    return res.json({
      success: true,
      version: serverStore.lastUpdated,
      ticketCount: serverStore.tickets.length,
      timestamp: Date.now()
    });
  }

  const sinceParam = typeof req.query?.since === 'string' ? req.query.since.trim() : '';
  if (sinceParam && supabaseHydrated) {
    const deltaRes = await Promise.race([
      fetchDeltaSinceFromSupabase(sinceParam, { hotOnly: false }),
      new Promise((resolve) => setTimeout(() => resolve(null), 1800))
    ]).catch(() => null);
    if (deltaRes?.delta) {
      mergeDeltaIntoServerStore(deltaRes.delta);
      lastSupabaseDeltaIso = deltaRes.latestUpdatedAt || lastSupabaseDeltaIso;
      persistStore();
      return res.json({
        success: true,
        isDelta: true,
        version: serverStore.lastUpdated,
        data: { ...deltaRes.delta, lastUpdated: serverStore.lastUpdated },
        timestamp: Date.now()
      });
    }
    return res.json({
      success: true,
      isDelta: true,
      version: serverStore.lastUpdated,
      data: { lastUpdated: serverStore.lastUpdated },
      timestamp: Date.now()
    });
  }

  const forceHydrate = req.query?.forceHydrate === '1' || req.query?.forceHydrate === 'true';
  await Promise.race([
    supabaseHydrated && !forceHydrate
      ? pullSupabaseDeltaIfNewer()
      : ensureSupabaseHydrated(forceHydrate),
    new Promise((resolve) => setTimeout(resolve, forceHydrate ? 6500 : 2200))
  ]);
  res.json({
    success: true,
    version: serverStore.lastUpdated,
    data: serverStore,
    message: `Sincronización activa: ${serverStore.tickets.length} tickets en base central`,
    timestamp: Date.now()
  });
});

// 3. Endpoint POST de sincronización (Fusión bidireccional + Supabase + Pusher en tiempo real)
app.post(['/api/sync', '/.netlify/functions/sync-data'], (req, res) => {
  try {
    const payload = req.body || {};

    // Snapshot de IDs/hashes previos para NUNCA re-subir miles de registros históricos sin cambios a Supabase
    const filterChangedForSupabase = (existingArr, incomingArr, keyFn) => {
      if (!Array.isArray(incomingArr) || incomingArr.length === 0) return [];
      if (incomingArr.length <= 25) return incomingArr;
      const prevMap = new Map();
      for (const item of existingArr || []) {
        const k = keyFn(item);
        if (k) prevMap.set(String(k), item);
      }
      const changed = [];
      for (const item of incomingArr) {
        const k = keyFn(item);
        if (!k) continue;
        const prev = prevMap.get(String(k));
        if (!prev || JSON.stringify(prev) !== JSON.stringify(item)) {
          changed.push(item);
        }
      }
      return changed;
    };

    const supabaseDiffPayload = {
      deletedIds: payload.deletedIds,
      tickets: filterChangedForSupabase(serverStore.tickets, payload.tickets, t => t?.id || t?.folio),
      orders: filterChangedForSupabase(serverStore.orders, payload.orders, o => o?.id || o?.folio),
      shiftCuts: filterChangedForSupabase(serverStore.shiftCuts, payload.shiftCuts, c => c?.id || c?.folio || `${c?.date}_${c?.shiftType}`),
      outflows: filterChangedForSupabase(serverStore.outflows, payload.outflows, o => o?.id),
      customers: filterChangedForSupabase(serverStore.customers, payload.customers, c => c?.id || c?.phone),
      operationalExpenses: filterChangedForSupabase(serverStore.operationalExpenses, payload.operationalExpenses, e => e?.id),
      supplierBills: filterChangedForSupabase(serverStore.supplierBills, payload.supplierBills, b => b?.id),
      supplierBankProfiles: filterChangedForSupabase(serverStore.supplierBankProfiles, payload.supplierBankProfiles, b => b?.id),
      vipCustomers: filterChangedForSupabase(serverStore.vipCustomers, payload.vipCustomers, c => c?.id),
      vipOrders: filterChangedForSupabase(serverStore.vipOrders, payload.vipOrders, o => o?.id),
      dailyDeliveries: filterChangedForSupabase(serverStore.dailyDeliveries, payload.dailyDeliveries, d => d?.date && d?.shift ? `${d.date}_${d.shift}` : d?.id),
      driverCustomers: filterChangedForSupabase(serverStore.driverCustomers, payload.driverCustomers, c => c?.id),
      driverSettlements: filterChangedForSupabase(serverStore.driverSettlements, payload.driverSettlements, s => s?.id),
    };

    // Aplicar eliminaciones recibidas
    const deletedIds = { ...(serverStore.deletedIds || {}) };
    const incomingDeleted = payload.deletedIds || {};
    for (const entity of ['tickets', 'orders', 'outflows', 'operationalExpenses', 'supplierBills', 'vipCustomers', 'vipOrders', 'driverCustomers']) {
      const set = new Set(Array.isArray(deletedIds[entity]) ? deletedIds[entity] : []);
      if (Array.isArray(incomingDeleted[entity])) {
        incomingDeleted[entity].forEach(id => { if (id) set.add(String(id)); });
      }
      deletedIds[entity] = Array.from(set).slice(-1000);
    }
    serverStore.deletedIds = deletedIds;

    const delTickets = new Set(deletedIds.tickets || []);
    const delOrders = new Set(deletedIds.orders || []);
    const delOutflows = new Set(deletedIds.outflows || []);
    const delExpenses = new Set(deletedIds.operationalExpenses || []);
    const delBills = new Set(deletedIds.supplierBills || []);
    const delVipCust = new Set(deletedIds.vipCustomers || []);
    const delVipOrders = new Set(deletedIds.vipOrders || []);
    const delDriverCust = new Set(deletedIds.driverCustomers || []);

    if (Array.isArray(payload.tickets) && payload.tickets.length > 0) {
      serverStore.tickets = mergeTicketsServer(serverStore.tickets, payload.tickets);
    }
    serverStore.tickets = serverStore.tickets.filter(t => t && !delTickets.has(t.id) && !(t.folio && delTickets.has(t.folio)));

    if (Array.isArray(payload.orders) && payload.orders.length > 0) {
      serverStore.orders = mergeOrdersServer(serverStore.orders, payload.orders);
    }
    serverStore.orders = serverStore.orders.filter(o => o && !delOrders.has(o.id) && !(o.folio && delOrders.has(o.folio)));

    if (Array.isArray(payload.shiftCuts) && payload.shiftCuts.length > 0) {
      serverStore.shiftCuts = mergeShiftCutsServer(serverStore.shiftCuts, payload.shiftCuts);
    }
    if (Array.isArray(payload.outflows) && payload.outflows.length > 0) {
      serverStore.outflows = mergeOutflowsServer(serverStore.outflows, payload.outflows);
    }
    serverStore.outflows = (serverStore.outflows || []).filter(o => o && o.id && !delOutflows.has(o.id));
    if (Array.isArray(payload.customers) && payload.customers.length > 0) {
      const custMap = new Map();
      serverStore.customers.forEach(c => custMap.set(c.id || c.phone, c));
      payload.customers.forEach(c => custMap.set(c.id || c.phone, { ...(custMap.get(c.id || c.phone) || {}), ...c }));
      serverStore.customers = Array.from(custMap.values());
    }
    if (Array.isArray(payload.operationalExpenses) && payload.operationalExpenses.length > 0) {
      const expMap = new Map();
      serverStore.operationalExpenses.forEach(e => { if (e?.id && !delExpenses.has(e.id)) expMap.set(e.id, e); });
      payload.operationalExpenses.forEach(e => { if (e?.id && !delExpenses.has(e.id)) expMap.set(e.id, { ...(expMap.get(e.id) || {}), ...e }); });
      serverStore.operationalExpenses = Array.from(expMap.values());
    } else {
      serverStore.operationalExpenses = (serverStore.operationalExpenses || []).filter(e => e?.id && !delExpenses.has(e.id));
    }

    if (Array.isArray(payload.supplierBills) && payload.supplierBills.length > 0) {
      const toMs = (iso) => {
        if (!iso) return 0;
        const t = new Date(iso).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      const billMap = new Map();
      serverStore.supplierBills.forEach(b => { if (b?.id && !delBills.has(b.id)) billMap.set(b.id, b); });
      payload.supplierBills.forEach(b => {
        if (!b?.id || delBills.has(b.id)) return;
        const prev = billMap.get(b.id);
        if (!prev) {
          billMap.set(b.id, b);
          return;
        }
        const prevTime = toMs(prev.updatedAt);
        const incTime = toMs(b.updatedAt);
        const base = incTime >= prevTime ? { ...prev, ...b } : { ...b, ...prev };

        const prevRDel = toMs(prev.receiptDeletedAt);
        const incRDel = toMs(b.receiptDeletedAt);
        const maxRDel = Math.max(prevRDel, incRDel);
        const maxRUp = Math.max(toMs(prev.receiptUploadedAt), toMs(b.receiptUploadedAt), prevTime, incTime);
        let receiptImageUrl = b.receiptImageUrl || prev.receiptImageUrl || '';
        let receiptFileName = b.receiptFileName || prev.receiptFileName || '';
        let receiptUploadedAt = b.receiptUploadedAt || prev.receiptUploadedAt || '';
        const receiptDeletedAt = incRDel >= prevRDel ? b.receiptDeletedAt : prev.receiptDeletedAt;
        if (maxRDel > 0 && maxRDel >= maxRUp && ((incRDel >= prevRDel && !b.receiptImageUrl) || (prevRDel > incRDel && !prev.receiptImageUrl))) {
          receiptImageUrl = '';
          receiptFileName = '';
          receiptUploadedAt = '';
        }

        const prevIDel = toMs(prev.invoiceDeletedAt);
        const incIDel = toMs(b.invoiceDeletedAt);
        const maxIDel = Math.max(prevIDel, incIDel);
        const maxIUp = Math.max(toMs(prev.invoiceUploadedAt), toMs(b.invoiceUploadedAt), prevTime, incTime);
        let invoiceFileUrl = b.invoiceFileUrl || prev.invoiceFileUrl || '';
        let invoiceFileName = b.invoiceFileName || prev.invoiceFileName || '';
        let invoiceUploadedAt = b.invoiceUploadedAt || prev.invoiceUploadedAt || '';
        const invoiceDeletedAt = incIDel >= prevIDel ? b.invoiceDeletedAt : prev.invoiceDeletedAt;
        if (maxIDel > 0 && maxIDel >= maxIUp && ((incIDel >= prevIDel && !b.invoiceFileUrl) || (prevIDel > incIDel && !prev.invoiceFileUrl))) {
          invoiceFileUrl = '';
          invoiceFileName = '';
          invoiceUploadedAt = '';
        }

        billMap.set(b.id, {
          ...base,
          bankInfo: b.bankInfo || prev.bankInfo,
          receiptImageUrl,
          receiptFileName,
          receiptUploadedAt,
          receiptDeletedAt,
          invoiceFileUrl,
          invoiceFileName,
          invoiceUploadedAt,
          invoiceDeletedAt
        });
      });
      serverStore.supplierBills = Array.from(billMap.values());
    } else {
      serverStore.supplierBills = (serverStore.supplierBills || []).filter(b => b?.id && !delBills.has(b.id));
    }

    if (Array.isArray(payload.supplierBankProfiles) && payload.supplierBankProfiles.length > 0) {
      const bankMap = new Map();
      (serverStore.supplierBankProfiles || []).forEach(bp => { if (bp?.id) bankMap.set(bp.id, bp); });
      payload.supplierBankProfiles.forEach(bp => { if (bp?.id) bankMap.set(bp.id, { ...(bankMap.get(bp.id) || {}), ...bp }); });
      serverStore.supplierBankProfiles = Array.from(bankMap.values());
    }

    const resolveServerVipId = (c) => {
      const rawId = String(c?.id || '').trim();
      const canon = new Set(['vip_bollo_david', 'vip_perrillos_burger', 'vip_campo_golf', 'vip_star_medica', 'vip_barra_verde']);
      if (canon.has(rawId)) return rawId;
      const hay = `${c?.name || ''} ${c?.businessName || ''} ${rawId}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      if (hay.includes('bollo') && hay.includes('david')) return 'vip_bollo_david';
      if (hay.includes('perrillo')) return 'vip_perrillos_burger';
      if (hay.includes('campo de golf') || hay.includes('campo golf')) return 'vip_campo_golf';
      if (hay.includes('star medica')) return 'vip_star_medica';
      if (hay.includes('barra verde')) return 'vip_barra_verde';
      return rawId;
    };

    if (Array.isArray(payload.vipCustomers) && payload.vipCustomers.length > 0) {
      const vcMap = new Map();
      (serverStore.vipCustomers || []).forEach(c => {
        if (!c?.id || delVipCust.has(c.id)) return;
        const cid = resolveServerVipId(c);
        if (!delVipCust.has(cid)) vcMap.set(cid, { ...(vcMap.get(cid) || {}), ...c, id: cid });
      });
      payload.vipCustomers.forEach(c => {
        if (!c?.id || delVipCust.has(c.id)) return;
        const cid = resolveServerVipId(c);
        if (!delVipCust.has(cid)) vcMap.set(cid, { ...(vcMap.get(cid) || {}), ...c, id: cid });
      });
      serverStore.vipCustomers = Array.from(vcMap.values());
    } else {
      serverStore.vipCustomers = (serverStore.vipCustomers || []).filter(c => c?.id && !delVipCust.has(c.id));
    }

    if (Array.isArray(payload.vipOrders) && payload.vipOrders.length > 0) {
      const voMap = new Map();
      (serverStore.vipOrders || []).forEach(o => { if (o?.id && !delVipOrders.has(o.id)) voMap.set(o.id, o); });
      payload.vipOrders.forEach(o => { if (o?.id && !delVipOrders.has(o.id)) voMap.set(o.id, { ...(voMap.get(o.id) || {}), ...o }); });
      serverStore.vipOrders = Array.from(voMap.values());
    } else {
      serverStore.vipOrders = (serverStore.vipOrders || []).filter(o => o?.id && !delVipOrders.has(o.id));
    }

    if (Array.isArray(payload.dailyDeliveries) && payload.dailyDeliveries.length > 0) {
      const delMap = new Map();
      (serverStore.dailyDeliveries || []).forEach(d => {
        if (d?.date && d?.shift) delMap.set(`${d.date}_${d.shift}`, d);
      });
      payload.dailyDeliveries.forEach(d => {
        if (d?.date && d?.shift && d?.quantities) {
          const key = `${d.date}_${d.shift}`;
          const prev = delMap.get(key);
          const mergedQty = { ...(prev?.quantities || {}) };
          for (const [clientId, breads] of Object.entries(d.quantities || {})) {
            if (breads && typeof breads === 'object') {
              mergedQty[clientId] = {
                ...(mergedQty[clientId] && typeof mergedQty[clientId] === 'object' ? mergedQty[clientId] : {}),
                ...breads
              };
            }
          }
          delMap.set(key, {
            id: d.id || key,
            date: d.date,
            shift: d.shift,
            quantities: mergedQty,
            updatedAt: d.updatedAt || new Date().toISOString()
          });
        }
      });
      serverStore.dailyDeliveries = Array.from(delMap.values());
    }

    if (Array.isArray(payload.driverSettlements) && payload.driverSettlements.length > 0) {
      const setMap = new Map();
      (serverStore.driverSettlements || []).forEach(s => {
        if (s?.id) setMap.set(s.id, s);
      });
      payload.driverSettlements.forEach(s => {
        if (s?.id && s?.date && (s.driverId === 'osvaldo' || s.driverId === 'simon')) {
          const prev = setMap.get(s.id);
          const prevTs = prev?.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
          const incTs = s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now();
          if (!prev || incTs >= prevTs) {
            setMap.set(s.id, {
              id: s.id,
              date: s.date,
              driverId: s.driverId,
              ...(s.shift ? { shift: s.shift } : {}),
              settled: Boolean(s.settled),
              updatedAt: s.updatedAt || new Date().toISOString()
            });
          }
        }
      });
      serverStore.driverSettlements = Array.from(setMap.values());
    }

    if (Array.isArray(payload.driverCustomers) && payload.driverCustomers.length > 0) {
      const dcMap = new Map();
      (serverStore.driverCustomers || []).forEach(c => { if (c?.id && !delDriverCust.has(c.id)) dcMap.set(c.id, c); });
      payload.driverCustomers.forEach(c => { if (c?.id && !delDriverCust.has(c.id)) dcMap.set(c.id, { ...(dcMap.get(c.id) || {}), ...c }); });
      serverStore.driverCustomers = Array.from(dcMap.values());
    } else {
      serverStore.driverCustomers = (serverStore.driverCustomers || []).filter(c => c?.id && !delDriverCust.has(c.id));
    }

    persistStore();

    // Persistir ÚNICAMENTE el diff real en Supabase en segundo plano (sin re-subir miles de tickets históricos)
    if (!payload.skipSupabaseWrite) {
      syncDeltaToSupabase(supabaseDiffPayload).catch(() => {});
    }

    // Notificar a todos los dispositivos conectados vía SSE (solo delta ligero) y Pusher
    const deltaPayload = {
      tickets: supabaseDiffPayload.tickets.length > 0 ? supabaseDiffPayload.tickets : undefined,
      orders: supabaseDiffPayload.orders.length > 0 ? supabaseDiffPayload.orders : undefined,
      shiftCuts: supabaseDiffPayload.shiftCuts.length > 0 ? supabaseDiffPayload.shiftCuts : undefined,
      outflows: supabaseDiffPayload.outflows.length > 0 ? supabaseDiffPayload.outflows : undefined,
      customers: supabaseDiffPayload.customers.length > 0 ? supabaseDiffPayload.customers : undefined,
      operationalExpenses: supabaseDiffPayload.operationalExpenses.length > 0 ? supabaseDiffPayload.operationalExpenses : undefined,
      supplierBills: supabaseDiffPayload.supplierBills.length > 0 ? supabaseDiffPayload.supplierBills : undefined,
      supplierBankProfiles: supabaseDiffPayload.supplierBankProfiles.length > 0 ? supabaseDiffPayload.supplierBankProfiles : undefined,
      vipCustomers: supabaseDiffPayload.vipCustomers.length > 0 ? supabaseDiffPayload.vipCustomers : undefined,
      vipOrders: supabaseDiffPayload.vipOrders.length > 0 ? supabaseDiffPayload.vipOrders : undefined,
      dailyDeliveries: supabaseDiffPayload.dailyDeliveries.length > 0 ? supabaseDiffPayload.dailyDeliveries : undefined,
      driverCustomers: supabaseDiffPayload.driverCustomers.length > 0 ? supabaseDiffPayload.driverCustomers : undefined,
      driverSettlements: supabaseDiffPayload.driverSettlements.length > 0 ? supabaseDiffPayload.driverSettlements : undefined,
      deletedIds: payload.deletedIds,
      lastUpdated: serverStore.lastUpdated
    };
    broadcastSync(deltaPayload, payload.clientId || null, serverStore.lastUpdated);
    if (!payload.skipPusher) {
      triggerPusherSync({
        clientId: payload.clientId || 'server',
        timestamp: Date.now(),
        ...deltaPayload
      }).catch(() => {});
    }

    // Si es un envío delta (99% de ventas/cambios), responder con ACK ultra-ligero (<150 bytes) en vez de 5MB
    if (payload.deltaOnly) {
      return res.json({
        success: true,
        merged: true,
        version: serverStore.lastUpdated,
        ticketCount: serverStore.tickets.length,
        message: 'Sincronizado en tiempo real'
      });
    }

    res.json({
      success: true,
      merged: true,
      version: serverStore.lastUpdated,
      data: serverStore,
      ticketCount: serverStore.tickets.length,
      message: 'Sincronizado en tiempo real'
    });
  } catch (err) {
    console.error('Error en /api/sync POST:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Endpoint Mercado Pago Point en servidor Express (Producción)
app.all(['/api/mercadopago', '/.netlify/functions/mercadopago-point'], async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await handleMercadoPagoProxyAction(payload);
    return res.status(result.statusCode || 200).json(result.body);
  } catch (err) {
    res.status(500).json({ error: 'MP_ERROR', message: err.message });
  }
});

// Servir archivos estáticos generados por vite build
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback para React Router / SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Panadería Santa Fé en producción en puerto ${PORT}`);
});
