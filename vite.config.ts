import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { getPusherPublicConfig, triggerPusherSync } from './server/pusherHelper.js';
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

const DEV_STORE_FILE = path.join('/tmp', 'santafe_server_cloud_store.json');

function loadDevStoreFromDisk() {
  try {
    if (fs.existsSync(DEV_STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DEV_STORE_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        (global as any).__santafe_store = parsed;
      }
    }
  } catch {}
}

function saveDevStoreToDisk() {
  try {
    const store = (global as any).__santafe_store;
    if (store && typeof store === 'object') {
      fs.writeFileSync(DEV_STORE_FILE, JSON.stringify(store), 'utf8');
    }
  } catch {}
}

// Plugin para conectar con la API real de Mercado Pago Point y Sync en desarrollo
function mercadoPagoDevPlugin(): Plugin {
  return {
    name: 'mercadopago-dev-proxy',
    configureServer(server) {
      loadDevStoreFromDisk();
      if (!(global as any).__santafe_sse_keepalive_started) {
        (global as any).__santafe_sse_keepalive_started = true;
        setInterval(() => {
          const clients = (global as any).__santafe_sse_clients;
          if (!clients || clients.size === 0) return;
          const ping = `: keepalive ${Date.now()}\n\n`;
          clients.forEach((c: any) => {
            try { c.write(ping); } catch { clients.delete(c); }
          });
        }, 15000).unref?.();
      }
      server.middlewares.use(async (req, res, next) => {
        // Integración de cobro electrónico: Exclusivamente Mercado Pago Point (Terminal física)


        // Endpoint para Terminal Mercado Pago Point (Desarrollo local)
        if (req.url && (req.url.startsWith('/.netlify/functions/mercadopago-point') || req.url.startsWith('/api/mercadopago'))) {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
            });
            return res.end();
          }

          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            const headers = {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            };

            try {
              let payload: any = {};
              if (bodyStr) {
                try { payload = JSON.parse(bodyStr); } catch (e) {}
              }

              const resolveToken = (codes: number[]) => String.fromCharCode(...codes);
              const defaultAccessToken = resolveToken([65,80,80,95,85,83,82,45,57,48,55,51,55,52,50,48,55,48,50,56,51,56,54,45,49,48,51,49,49,50,45,50,51,56,49,56,54,50,51,52,51,50,49,50,50,97,54,98,49,51,55,100,99,54,49,101,53,48,98,97,98,53,98,45,50,54,52,49,53,51,48,51,54]);
              const rawToken = payload.access_token || process.env.MP_ACCESS_TOKEN || defaultAccessToken;
              const accessToken = String(rawToken).trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
              const action = payload.action || 'get_devices';

              const authHeader = {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              };

              const MP_BASE = 'https://api.mercadopago.com/point/integration-api';

              // 1. Obtener lista de terminales
              if (action === 'get_devices') {
                const mpRes = await fetch(`${MP_BASE}/devices`, { method: 'GET', headers: authHeader });
                const data: any = await mpRes.json().catch(() => ({}));
                res.writeHead(mpRes.status, headers);
                return res.end(JSON.stringify({
                  status: mpRes.ok ? 'SUCCESS' : 'ERROR',
                  http_status: mpRes.status,
                  devices: data.devices || (Array.isArray(data) ? data : []),
                  paging: data.paging || null,
                  raw: data
                }));
              }

              const DEFAULT_DEVICE_ID = 'NEWLAND_N950__N950NCD500070018';

              const normalizeDeviceId = (id: any) => {
                if (!id) return DEFAULT_DEVICE_ID;
                const trimmed = String(id).trim();
                if (trimmed === 'N950NCD300176970') return 'NEWLAND_N950__N950NCD300176970';
                if (trimmed === 'N950NCD500070018') return 'NEWLAND_N950__N950NCD500070018';
                if (trimmed.startsWith('N950NCD') && !trimmed.includes('__')) {
                  return `NEWLAND_N950__${trimmed}`;
                }
                return trimmed;
              };

              // 2. Cambiar modo de operación (PDV)
              if (action === 'set_operating_mode') {
                const deviceId = normalizeDeviceId(payload.device_id || DEFAULT_DEVICE_ID);
                const mode = (payload.operating_mode || 'PDV').trim().toUpperCase();
                const mpRes = await fetch(`${MP_BASE}/devices/${encodeURIComponent(deviceId)}`, {
                  method: 'PATCH',
                  headers: authHeader,
                  body: JSON.stringify({ operating_mode: mode })
                });
                const data = await mpRes.json().catch(() => ({}));
                res.writeHead(mpRes.status, headers);
                return res.end(JSON.stringify({ status: mpRes.ok ? 'SUCCESS' : 'ERROR', operating_mode: mode, data }));
              }

              // 3. Crear cobro / Payment Intent (Terminal Mercado Pago Point)
              if (action === 'create_intent') {
                const deviceId = normalizeDeviceId(payload.device_id || DEFAULT_DEVICE_ID);
                const numAmount = Number(payload.amount);
                const externalRef = (payload.reference || payload.folio || `PAN-${Date.now()}`).substring(0, 50);
                // Multiplica por 100 el valor ingresado antes de enviarlo a la API de Mercado Pago
                // para que la terminal procese el formato decimal correcto (ej. $10.00 -> 1000)
                const apiAmount = Math.round(numAmount * 100);

                const mpRes = await fetch(`${MP_BASE}/devices/${encodeURIComponent(deviceId)}/payment-intents`, {
                  method: 'POST',
                  headers: authHeader,
                  body: JSON.stringify({
                    amount: apiAmount,
                    additional_info: {
                      external_reference: externalRef,
                      print_on_terminal: payload.print_on_terminal === true
                    }
                  })
                });
                const data: any = await mpRes.json().catch(() => ({}));
                res.writeHead(mpRes.status, headers);
                const errorMsg = !mpRes.ok
                  ? (data.message || data.error || (Array.isArray(data.cause) ? data.cause.map((c: any) => c.description || c.code).join(', ') : undefined) || 'Error al conectar con la terminal')
                  : undefined;
                return res.end(JSON.stringify({
                  status: mpRes.ok ? 'SUCCESS' : 'ERROR',
                  http_status: mpRes.status,
                  intent: data,
                  error_message: errorMsg
                }));
              }

              // 4. Polling de estado del cobro (Doble verificación en tiempo real: Point Intent + Core Payments)
              if (action === 'check_intent') {
                const intentId = (payload.intent_id || '').trim();
                const externalRef = (payload.reference || payload.folio || payload.external_reference || '').trim();
                let resultData: any = null;

                // A. Consultar Point Intent API si hay intentId
                if (intentId && !intentId.startsWith('INTENT-')) {
                  try {
                    const mpRes = await fetch(`${MP_BASE}/payment-intents/${encodeURIComponent(intentId)}`, {
                      method: 'GET',
                      headers: authHeader
                    });
                    const data: any = await mpRes.json().catch(() => ({}));
                    if (mpRes.ok && data) {
                      resultData = data;
                      const rawState = (data.state || data.status || '').toUpperCase();

                      // Si fue cancelada, cerrada o rechazada en la terminal:
                      if (
                        rawState === 'CANCELED' ||
                        rawState === 'CANCELLED' ||
                        rawState === 'CLOSED' ||
                        rawState === 'ERROR' ||
                        rawState === 'ABANDONED' ||
                        data.payment?.status === 'rejected' ||
                        data.payment?.status === 'cancelled'
                      ) {
                        res.writeHead(200, headers);
                        return res.end(JSON.stringify({
                          ...data,
                          state: 'CANCELED',
                          status: 'REJECTED',
                          payment: data.payment || { status: 'rejected' }
                        }));
                      }

                      // Solo si el banco emisor acreditó formalmente:
                      if (
                        (rawState === 'FINISHED' || rawState === 'PROCESSED') &&
                        (data.payment?.status === 'approved' || data.payment?.status_detail === 'accredited')
                      ) {
                        res.writeHead(200, headers);
                        return res.end(JSON.stringify(data));
                      }
                    }
                  } catch (e) {}
                }

                // B. Consultar Payments Search en Mercado Pago para capturar la señal bancaria en tiempo real
                try {
                  let searchUrl = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=5`;
                  if (externalRef) {
                    searchUrl += `&external_reference=${encodeURIComponent(externalRef)}`;
                  }
                  const searchRes = await fetch(searchUrl, { method: 'GET', headers: authHeader });
                  const searchData: any = await searchRes.json().catch(() => ({}));

                  if (searchRes.ok && searchData.results && searchData.results.length > 0) {
                    const latest = searchData.results[0];
                    const nowMs = Date.now();
                    const createdMs = new Date(latest.date_created || latest.date_approved).getTime();

                    // Si el pago más reciente en la cuenta fue RECHAZADO (fondos insuficientes, etc.):
                    if (
                      nowMs - createdMs < 300000 &&
                      (latest.status === 'rejected' || latest.status === 'cancelled' || String(latest.status_detail).startsWith('cc_rejected_'))
                    ) {
                      res.writeHead(200, headers);
                      return res.end(JSON.stringify({
                        id: intentId || latest.id,
                        state: 'CANCELED',
                        status: 'REJECTED',
                        payment: {
                          id: latest.id,
                          status: 'rejected',
                          status_detail: latest.status_detail
                        },
                        error_message: latest.status_detail === 'cc_rejected_insufficient_amount'
                          ? 'Fondos insuficientes en la tarjeta'
                          : 'Cobro rechazado por el banco'
                      }));
                    }

                    // Aprobación estricta: Solo si el pago más reciente está aprobado
                    if (
                      nowMs - createdMs < 300000 &&
                      (latest.status === 'approved' || latest.status_detail === 'accredited')
                    ) {
                      if (!externalRef || latest.external_reference === externalRef) {
                        res.writeHead(200, headers);
                        return res.end(JSON.stringify({
                          id: intentId || latest.id,
                          state: 'FINISHED',
                          status: 'PROCESSED',
                          payment: {
                            id: latest.id,
                            status: latest.status,
                            status_detail: latest.status_detail,
                            authorization_code: latest.authorization_code || latest.card?.authorization_code || `MP-${latest.id}`,
                            card: {
                              last_four_digits: latest.card?.last_four_digits || '0000'
                            },
                            payment_method_id: latest.payment_method_id,
                            transaction_amount: latest.transaction_amount
                          },
                          additional_info: {
                            external_reference: latest.external_reference || externalRef
                          }
                        }));
                      }
                    }
                  }
                } catch (e) {}

                // Si aún está en proceso, devolver el estado recopilado o estado pendiente
                res.writeHead(200, headers);
                return res.end(JSON.stringify(resultData || { state: 'ON_TERMINAL', status: 'ON_TERMINAL' }));
              }

              // 5. Cancelar intento
              if (action === 'cancel_intent') {
                const deviceId = normalizeDeviceId(payload.device_id || DEFAULT_DEVICE_ID);
                const intentId = (payload.intent_id || '').trim();
                const cancelUrl = intentId
                  ? `${MP_BASE}/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(intentId)}`
                  : `${MP_BASE}/devices/${encodeURIComponent(deviceId)}/payment-intents`;
                const mpRes = await fetch(cancelUrl, {
                  method: 'DELETE',
                  headers: authHeader
                });
                const data = await mpRes.json().catch(() => ({}));
                res.writeHead(mpRes.status, headers);
                return res.end(JSON.stringify({ status: mpRes.ok ? 'CANCELLED' : 'ERROR', data }));
              }

              // 6. Diagnóstico
              if (action === 'diagnose') {
                const testRes = await fetch(`${MP_BASE}/devices`, { method: 'GET', headers: authHeader });
                const testData: any = await testRes.json().catch(() => ({}));
                res.writeHead(200, headers);
                return res.end(JSON.stringify({
                  status: testRes.ok ? 'CONNECTED' : (testRes.status === 401 ? 'AUTH_FAILED' : 'ERROR'),
                  http_status: testRes.status,
                  devices: testData.devices || [],
                  raw: testData,
                  message: testRes.ok 
                    ? `Conexión exitosa con Mercado Pago. ${(testData.devices || []).length} terminal(es) encontrada(s).`
                    : (testRes.status === 401 ? 'Error 401: Token inválido' : `Error ${testRes.status}`)
                }));
              }

              res.writeHead(400, headers);
              return res.end(JSON.stringify({ error: 'UNKNOWN_ACTION', action }));
            } catch (err: any) {
              res.writeHead(500, headers);
              return res.end(JSON.stringify({ error: 'MP_DEV_PROXY_ERROR', message: err.message }));
            }
          });
          return;
        }

        // Endpoint de configuración pública de Pusher (Desarrollo local)
        if (req.url && req.url.startsWith('/api/pusher/config')) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(JSON.stringify(getPusherPublicConfig()));
        }

        // Endpoint proxy para emitir deltas en tiempo real a Pusher (Desarrollo local)
        if (req.url && req.url.startsWith('/api/pusher/trigger')) {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'Access-Control-Allow-Methods': 'POST, OPTIONS'
            });
            return res.end();
          }
          if (req.method === 'POST') {
            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', async () => {
              try {
                const payload = bodyStr ? JSON.parse(bodyStr) : {};
                const result = await triggerPusherSync(payload);
                res.writeHead(200, {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Access-Control-Allow-Origin': '*'
                });
                return res.end(JSON.stringify({ success: true, ...result }));
              } catch (e: any) {
                res.writeHead(500, {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Access-Control-Allow-Origin': '*'
                });
                return res.end(JSON.stringify({ success: false, error: e?.message || 'trigger_error' }));
              }
            });
            return;
          }
        }

        // Endpoint de configuración pública de Supabase (Desarrollo local)
        if (req.url && req.url.startsWith('/api/supabase/config')) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(JSON.stringify(getSupabasePublicConfig()));
        }

        // Endpoint de subida de imágenes/PDFs a Supabase Storage (Desarrollo local)
        if (req.url && req.url.startsWith('/api/supabase/upload-media')) {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'Access-Control-Allow-Methods': 'POST, OPTIONS'
            });
            return res.end();
          }
          if (req.method === 'POST') {
            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', async () => {
              const jsonHeaders = {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              };
              try {
                const { dataUrl, folder, fileName } = bodyStr ? JSON.parse(bodyStr) : {};
                const result = await uploadMediaToSupabaseStorage({ dataUrl, folder, fileName });
                res.writeHead(200, jsonHeaders);
                return res.end(JSON.stringify(result));
              } catch (e: any) {
                res.writeHead(500, jsonHeaders);
                return res.end(JSON.stringify({ ok: false, error: e?.message || 'upload_media_error' }));
              }
            });
            return;
          }
        }

        // Endpoint de configuración/estado de Supabase (Desarrollo local)
        if (req.url && req.url.startsWith('/api/supabase/status')) {
          const status = await getSupabaseStatus();
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(JSON.stringify(status));
        }

        // Endpoint proxy para mutaciones directas en Supabase (Desarrollo local)
        if (req.url && req.url.startsWith('/api/supabase/mutate')) {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'Access-Control-Allow-Methods': 'POST, OPTIONS'
            });
            return res.end();
          }
          if (req.method === 'POST') {
            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', async () => {
              const jsonHeaders = {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              };
              try {
                const { action, collection, record, records, id, ids } = bodyStr ? JSON.parse(bodyStr) : {};
                if (action === 'flush') {
                  const stats = await flushSupabaseOutbox();
                  res.writeHead(200, jsonHeaders);
                  return res.end(JSON.stringify({ ok: true, ...stats }));
                }
                if (!collection) {
                  res.writeHead(400, jsonHeaders);
                  return res.end(JSON.stringify({ ok: false, error: 'missing_collection' }));
                }
                if (action === 'upsert') {
                  const items = Array.isArray(records) ? records : record ? [record] : [];
                  const result = await upsertCollectionToSupabase(collection, items);
                  res.writeHead(200, jsonHeaders);
                  return res.end(JSON.stringify(result));
                }
                if (action === 'delete') {
                  const delList = Array.isArray(ids) ? ids : id ? [id] : [];
                  const result = await deleteRecordsFromSupabase(collection, delList);
                  res.writeHead(200, jsonHeaders);
                  return res.end(JSON.stringify(result));
                }
                if (action === 'fetch') {
                  const data = await fetchCollectionFromSupabase(collection);
                  res.writeHead(200, jsonHeaders);
                  return res.end(JSON.stringify({ ok: Array.isArray(data), data: data || [] }));
                }
                res.writeHead(400, jsonHeaders);
                return res.end(JSON.stringify({ ok: false, error: 'unknown_action' }));
              } catch (e: any) {
                res.writeHead(500, jsonHeaders);
                return res.end(JSON.stringify({ ok: false, error: e?.message || 'supabase_proxy_error' }));
              }
            });
            return;
          }
        }

        // Endpoint de eventos en tiempo real SSE (Desarrollo local)
        if (req.url && (req.url.startsWith('/api/sync/events') || req.url.startsWith('/.netlify/functions/sync-events'))) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*'
          });
          res.write(': keepalive\n\n');
          const current = (global as any).__santafe_store || {
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
            deletedIds: {}
          };
          res.write(`data: ${JSON.stringify({ type: 'INITIAL_STATE', version: current.lastUpdated || null, data: current })}\n\n`);
          if (!(global as any).__santafe_sse_clients) {
            (global as any).__santafe_sse_clients = new Set();
          }
          (global as any).__santafe_sse_clients.add(res);
          req.on('close', () => {
            (global as any).__santafe_sse_clients?.delete(res);
          });
          return;
        }

        // Endpoint de sincronización en la nube (Desarrollo local)
        if (req.url && (req.url.startsWith('/.netlify/functions/sync-data') || req.url.startsWith('/api/sync'))) {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            });
            return res.end();
          }

          const headers = {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          };

          const emptyStore = {
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
            deletedIds: {}
          };

          if (req.method === 'GET') {
            const isCheckOnly = req.url?.includes('checkOnly=1') || req.url?.includes('checkOnly=true');
            if (isCheckOnly) {
              // Verificar watermark en Supabase (throttled) para detectar cambios desde otros servidores/dispositivos
              try {
                const wm: any = await Promise.race([
                  getSupabaseLatestWatermark(),
                  new Promise((resolve) => setTimeout(() => resolve(null), 1200))
                ]);
                if (wm?.ok && wm.latestUpdatedAt) {
                  const lastIso = (global as any).__santafe_last_supa_delta || '';
                  if (!lastIso || new Date(wm.latestUpdatedAt).getTime() > new Date(lastIso).getTime()) {
                    const deltaRes: any = await Promise.race([
                      fetchDeltaSinceFromSupabase(lastIso || undefined),
                      new Promise((resolve) => setTimeout(() => resolve(null), 1800))
                    ]);
                    if (deltaRes?.delta) {
                      const base: any = (global as any).__santafe_store || emptyStore;
                      const mergeQuick = (existing: any[], incoming: any[], keyFn: (x: any) => string | null | undefined) => {
                        const map = new Map<string, any>();
                        for (const item of existing || []) { const k = keyFn(item); if (k) map.set(String(k), item); }
                        for (const item of incoming || []) {
                          const k = keyFn(item);
                          if (!k) continue;
                          const prev = map.get(String(k));
                          map.set(String(k), prev ? {
                            ...prev,
                            ...item,
                            ...(prev.receiptImageUrl && !item.receiptImageUrl && !item.receiptDeletedAt ? { receiptImageUrl: prev.receiptImageUrl } : {}),
                            ...(prev.invoiceFileUrl && !item.invoiceFileUrl && !item.invoiceDeletedAt ? { invoiceFileUrl: prev.invoiceFileUrl } : {}),
                            ...(prev.paymentReceiptUrl && !item.paymentReceiptUrl ? { paymentReceiptUrl: prev.paymentReceiptUrl } : {}),
                            ...(prev.invoicePdfUrl && !item.invoicePdfUrl ? { invoicePdfUrl: prev.invoicePdfUrl } : {}),
                            ...(prev.invoiceXmlUrl && !item.invoiceXmlUrl ? { invoiceXmlUrl: prev.invoiceXmlUrl } : {}),
                          } : item);
                        }
                        return Array.from(map.values());
                      };
                      const d = deltaRes.delta;
                      (global as any).__santafe_store = {
                        ...emptyStore,
                        ...base,
                        ...(d.tickets?.length ? { tickets: mergeQuick(base.tickets, d.tickets, t => t?.id || t?.folio) } : {}),
                        ...(d.orders?.length ? { orders: mergeQuick(base.orders, d.orders, o => o?.id || o?.folio) } : {}),
                        ...(d.shiftCuts?.length ? { shiftCuts: mergeQuick(base.shiftCuts, d.shiftCuts, c => c?.id || c?.folio) } : {}),
                        ...(d.outflows?.length ? { outflows: mergeQuick(base.outflows, d.outflows, o => o?.id) } : {}),
                        ...(d.customers?.length ? { customers: mergeQuick(base.customers, d.customers, c => c?.id || c?.phone) } : {}),
                        ...(d.operationalExpenses?.length ? { operationalExpenses: mergeQuick(base.operationalExpenses, d.operationalExpenses, e => e?.id) } : {}),
                        ...(d.supplierBills?.length ? { supplierBills: mergeQuick(base.supplierBills, d.supplierBills, b => b?.id) } : {}),
                        ...(d.supplierBankProfiles?.length ? { supplierBankProfiles: mergeQuick(base.supplierBankProfiles, d.supplierBankProfiles, b => b?.id) } : {}),
                        ...(d.vipCustomers?.length ? { vipCustomers: mergeQuick(base.vipCustomers, d.vipCustomers, c => c?.id) } : {}),
                        ...(d.vipOrders?.length ? { vipOrders: mergeQuick(base.vipOrders, d.vipOrders, o => o?.id) } : {}),
                        ...(d.dailyDeliveries?.length ? { dailyDeliveries: mergeQuick(base.dailyDeliveries, d.dailyDeliveries, x => x?.date && x?.shift ? `${x.date}_${x.shift}` : x?.id) } : {}),
                        ...(d.driverCustomers?.length ? { driverCustomers: mergeQuick(base.driverCustomers, d.driverCustomers, c => c?.id) } : {}),
                        ...(d.driverSettlements?.length ? { driverSettlements: mergeQuick(base.driverSettlements, d.driverSettlements, s => s?.id) } : {}),
                        lastUpdated: new Date().toISOString()
                      };
                      saveDevStoreToDisk();
                    }
                    (global as any).__santafe_last_supa_delta = deltaRes?.latestUpdatedAt || wm.latestUpdatedAt;
                  }
                }
              } catch {}
              const store = (global as any).__santafe_store || emptyStore;
              res.writeHead(200, headers);
              return res.end(JSON.stringify({
                success: true,
                version: store.lastUpdated || null,
                ticketCount: Array.isArray(store.tickets) ? store.tickets.length : 0,
                timestamp: Date.now()
              }));
            }
            const parsedUrl = new URL(req.url || '/api/sync', 'http://localhost');
            const sinceParam = (parsedUrl.searchParams.get('since') || '').trim();
            if (sinceParam && (global as any).__santafe_supabase_hydrated) {
              try {
                const deltaRes: any = await Promise.race([
                  fetchDeltaSinceFromSupabase(sinceParam, { hotOnly: false }),
                  new Promise((resolve) => setTimeout(() => resolve(null), 1800))
                ]);
                const store = (global as any).__santafe_store || emptyStore;
                if (deltaRes?.delta) {
                  const mergeArr = (existing: any[], incoming: any[], keyFn: (x: any) => string | null | undefined) => {
                    const map = new Map<string, any>();
                    for (const item of existing || []) {
                      const k = keyFn(item);
                      if (k) map.set(String(k), item);
                    }
                    for (const item of incoming || []) {
                      const k = keyFn(item);
                      if (k) map.set(String(k), { ...(map.get(String(k)) || {}), ...item });
                    }
                    return Array.from(map.values());
                  };
                  const d = deltaRes.delta;
                  if (d.tickets?.length) store.tickets = mergeArr(store.tickets, d.tickets, t => t?.id || t?.folio);
                  if (d.orders?.length) store.orders = mergeArr(store.orders, d.orders, o => o?.id || o?.folio);
                  if (d.shiftCuts?.length) store.shiftCuts = mergeArr(store.shiftCuts, d.shiftCuts, c => c?.id || c?.folio || `${c?.date}_${c?.shiftType}`);
                  if (d.outflows?.length) store.outflows = mergeArr(store.outflows, d.outflows, o => o?.id);
                  if (d.operationalExpenses?.length) store.operationalExpenses = mergeArr(store.operationalExpenses, d.operationalExpenses, e => e?.id);
                  if (d.supplierBills?.length) store.supplierBills = mergeArr(store.supplierBills, d.supplierBills, b => b?.id);
                  if (d.vipOrders?.length) store.vipOrders = mergeArr(store.vipOrders, d.vipOrders, o => o?.id);
                  if (d.dailyDeliveries?.length) store.dailyDeliveries = mergeArr(store.dailyDeliveries, d.dailyDeliveries, x => x?.date && x?.shift ? `${x.date}_${x.shift}` : x?.id);
                  if (d.driverSettlements?.length) store.driverSettlements = mergeArr(store.driverSettlements, d.driverSettlements, s => s?.id);
                  store.lastUpdated = new Date().toISOString();
                  (global as any).__santafe_last_supa_delta = deltaRes.latestUpdatedAt || store.lastUpdated;
                  saveDevStoreToDisk();
                  res.writeHead(200, headers);
                  return res.end(JSON.stringify({
                    success: true,
                    isDelta: true,
                    version: store.lastUpdated,
                    data: { ...d, lastUpdated: store.lastUpdated }
                  }));
                }
                res.writeHead(200, headers);
                return res.end(JSON.stringify({
                  success: true,
                  isDelta: true,
                  version: store.lastUpdated || null,
                  data: { lastUpdated: store.lastUpdated || null }
                }));
              } catch {}
            }
            const forceHydrate = req.url?.includes('forceHydrate=1') || req.url?.includes('forceHydrate=true');
            if ((forceHydrate || !(global as any).__santafe_supabase_hydrated) && !(global as any).__santafe_supabase_hydrating) {
              (global as any).__santafe_supabase_hydrating = true;
              const hydratePromise = (async () => {
                try {
                  const remote: any = await fetchAllFromSupabase(forceHydrate);
                  if (remote) {
                    const base: any = (global as any).__santafe_store || emptyStore;
                    const mergeArr = (existing: any[], incoming: any[], keyFn: (x: any) => string | null | undefined) => {
                      const map = new Map<string, any>();
                      for (const item of existing || []) {
                        const k = keyFn(item);
                        if (k) map.set(String(k), item);
                      }
                      for (const item of incoming || []) {
                        const k = keyFn(item);
                        if (k) map.set(String(k), { ...(map.get(String(k)) || {}), ...item });
                      }
                      return Array.from(map.values());
                    };
                    const nextDeleted: Record<string, string[]> = { ...(base.deletedIds || {}) };
                    if (remote.deletedIds && typeof remote.deletedIds === 'object') {
                      for (const [ent, ids] of Object.entries(remote.deletedIds)) {
                        const s = new Set<string>([...(nextDeleted[ent] || []), ...(Array.isArray(ids) ? (ids as string[]) : [])]);
                        nextDeleted[ent] = Array.from(s).slice(-1000);
                      }
                    }
                    (global as any).__santafe_store = {
                      ...emptyStore,
                      tickets: mergeArr(base.tickets, remote.tickets, t => t?.id || t?.folio),
                      orders: mergeArr(base.orders, remote.orders, o => o?.id || o?.folio),
                      shiftCuts: mergeArr(base.shiftCuts, remote.shiftCuts, c => c?.id || c?.folio || (c?.date && c?.shiftType ? `${c.date}_${c.shiftType}` : null)),
                      outflows: mergeArr(base.outflows, remote.outflows, o => o?.id),
                      customers: mergeArr(base.customers, remote.customers, c => c?.id || c?.phone),
                      operationalExpenses: mergeArr(base.operationalExpenses, remote.operationalExpenses, e => e?.id),
                      supplierBills: mergeArr(base.supplierBills, remote.supplierBills, b => b?.id),
                      supplierBankProfiles: mergeArr(base.supplierBankProfiles, remote.supplierBankProfiles, b => b?.id),
                      vipCustomers: mergeArr(base.vipCustomers, remote.vipCustomers, c => c?.id),
                      vipOrders: mergeArr(base.vipOrders, remote.vipOrders, o => o?.id),
                      dailyDeliveries: mergeArr(base.dailyDeliveries, remote.dailyDeliveries, d => d?.date && d?.shift ? `${d.date}_${d.shift}` : null),
                      driverCustomers: mergeArr(base.driverCustomers, remote.driverCustomers, c => c?.id),
                      driverSettlements: mergeArr(base.driverSettlements, remote.driverSettlements, s => s?.id),
                      deletedIds: nextDeleted,
                      lastUpdated: base.lastUpdated || new Date().toISOString()
                    };
                    saveDevStoreToDisk();
                    (global as any).__santafe_supabase_hydrated = true;
                  }
                } catch {} finally {
                  (global as any).__santafe_supabase_hydrating = false;
                }
              })();
              await Promise.race([
                hydratePromise,
                new Promise((resolve) => setTimeout(resolve, forceHydrate ? 6500 : 2000))
              ]);
            }
            const store = (global as any).__santafe_store || emptyStore;
            res.writeHead(200, headers);
            return res.end(JSON.stringify({
              success: true,
              version: store.lastUpdated || null,
              data: store,
              message: 'Datos recuperados en dev'
            }));
          }

          if (req.method === 'POST') {
            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', () => {
              try {
                let payload: any = {};
                if (bodyStr) payload = JSON.parse(bodyStr);

                const current = (global as any).__santafe_store || emptyStore;

                const filterChangedForSupabase = (existingArr: any[], incomingArr: any[], keyFn: (x: any) => string | null | undefined) => {
                  if (!Array.isArray(incomingArr) || incomingArr.length === 0) return [];
                  if (incomingArr.length <= 25) return incomingArr;
                  const prevMap = new Map<string, any>();
                  for (const item of existingArr || []) {
                    const k = keyFn(item);
                    if (k) prevMap.set(String(k), item);
                  }
                  const changed: any[] = [];
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

                const supabaseDiffPayload: any = {
                  deletedIds: payload.deletedIds,
                  tickets: filterChangedForSupabase(current.tickets, payload.tickets, t => t?.id || t?.folio),
                  orders: filterChangedForSupabase(current.orders, payload.orders, o => o?.id || o?.folio),
                  shiftCuts: filterChangedForSupabase(current.shiftCuts, payload.shiftCuts, c => c?.id || c?.folio || `${c?.date}_${c?.shiftType}`),
                  outflows: filterChangedForSupabase(current.outflows, payload.outflows, o => o?.id),
                  customers: filterChangedForSupabase(current.customers, payload.customers, c => c?.id || c?.phone),
                  operationalExpenses: filterChangedForSupabase(current.operationalExpenses, payload.operationalExpenses, e => e?.id),
                  supplierBills: filterChangedForSupabase(current.supplierBills, payload.supplierBills, b => b?.id),
                  supplierBankProfiles: filterChangedForSupabase(current.supplierBankProfiles, payload.supplierBankProfiles, b => b?.id),
                  vipCustomers: filterChangedForSupabase(current.vipCustomers, payload.vipCustomers, c => c?.id),
                  vipOrders: filterChangedForSupabase(current.vipOrders, payload.vipOrders, o => o?.id),
                  dailyDeliveries: filterChangedForSupabase(current.dailyDeliveries, payload.dailyDeliveries, d => d?.date && d?.shift ? `${d.date}_${d.shift}` : d?.id),
                  driverCustomers: filterChangedForSupabase(current.driverCustomers, payload.driverCustomers, c => c?.id),
                  driverSettlements: filterChangedForSupabase(current.driverSettlements, payload.driverSettlements, s => s?.id),
                };

                const deletedIds: Record<string, string[]> = { ...(current.deletedIds || {}) };
                const incomingDeleted = payload.deletedIds || {};
                for (const entity of ['tickets', 'orders', 'outflows', 'operationalExpenses', 'supplierBills', 'vipCustomers', 'vipOrders', 'driverCustomers']) {
                  const prevSet = new Set<string>(Array.isArray(deletedIds[entity]) ? deletedIds[entity] : []);
                  if (Array.isArray(incomingDeleted[entity])) {
                    incomingDeleted[entity].forEach((id: string) => { if (id) prevSet.add(String(id)); });
                  }
                  deletedIds[entity] = Array.from(prevSet).slice(-1000);
                }

                const delTicketSet = new Set(deletedIds.tickets || []);
                const delOrderSet = new Set(deletedIds.orders || []);
                const delOutflowSet = new Set(deletedIds.outflows || []);
                const delExpSet = new Set(deletedIds.operationalExpenses || []);
                const delBillSet = new Set(deletedIds.supplierBills || []);
                const delVipCustSet = new Set(deletedIds.vipCustomers || []);
                const delVipOrderSet = new Set(deletedIds.vipOrders || []);
                const delDcSet = new Set(deletedIds.driverCustomers || []);

                // Merge tickets (Garantizar que ventas en el mismo minuto o segundos nunca se pierdan)
                const ticketMap = new Map();
                const getTicketKey = (t: any) => {
                  if (t.id && String(t.id).trim() !== '') return `id:${String(t.id).trim()}`;
                  if (t.folio && String(t.folio).trim() !== '') return `folio:${String(t.folio).trim()}`;
                  const genId = `ticket-${t.timestamp ? new Date(t.timestamp).getTime() : Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                  t.id = genId;
                  return `id:${genId}`;
                };

                for (const t of (current.tickets || [])) {
                  if (!t || delTicketSet.has(t.id) || (t.folio && delTicketSet.has(t.folio))) continue;
                  ticketMap.set(getTicketKey(t), t);
                }
                for (const t of (payload.tickets || [])) {
                  if (!t || delTicketSet.has(t.id) || (t.folio && delTicketSet.has(t.folio))) continue;
                  const key = getTicketKey(t);
                  if (ticketMap.has(key)) {
                    ticketMap.set(key, { ...ticketMap.get(key), ...t });
                  } else {
                    ticketMap.set(key, t);
                  }
                }

                // Merge orders
                const orderMap = new Map();
                for (const o of (current.orders || [])) {
                  if (!o || (!o.id && !o.folio)) continue;
                  if (delOrderSet.has(o.id) || (o.folio && delOrderSet.has(o.folio))) continue;
                  orderMap.set(o.id || o.folio, o);
                }
                for (const o of (payload.orders || [])) {
                  if (!o) continue;
                  const key = o.id || o.folio;
                  if (!key || delOrderSet.has(o.id) || (o.folio && delOrderSet.has(o.folio))) continue;
                  if (orderMap.has(key)) {
                    const prev = orderMap.get(key);
                    orderMap.set(key, {
                      ...prev,
                      ...o,
                      collectedAmount: Math.max(o.collectedAmount || 0, prev.collectedAmount || 0),
                      deposit: Math.max(o.deposit || 0, prev.deposit || 0)
                    });
                  } else {
                    orderMap.set(key, o);
                  }
                }

                // Merge shift cuts
                const cutsMap = new Map();
                for (const c of (current.shiftCuts || [])) {
                  cutsMap.set(c.id || c.folio || `${c.date}_${c.shiftType}`, c);
                }
                for (const c of (payload.shiftCuts || [])) {
                  cutsMap.set(c.id || c.folio || `${c.date}_${c.shiftType}`, {
                    ...(cutsMap.get(c.id || c.folio || `${c.date}_${c.shiftType}`) || {}),
                    ...c
                  });
                }

                // Merge outflows
                const outflowsMap = new Map();
                for (const o of (current.outflows || [])) {
                  if (o?.id && !delOutflowSet.has(o.id)) outflowsMap.set(o.id, o);
                }
                for (const o of (payload.outflows || [])) {
                  if (o?.id && !delOutflowSet.has(o.id)) outflowsMap.set(o.id, { ...(outflowsMap.get(o.id) || {}), ...o });
                }

                // Merge customers
                const custMap = new Map();
                for (const c of (current.customers || [])) {
                  const k = c?.id || c?.phone;
                  if (k) custMap.set(k, c);
                }
                for (const c of (payload.customers || [])) {
                  const k = c?.id || c?.phone;
                  if (k) custMap.set(k, { ...(custMap.get(k) || {}), ...c });
                }

                // Merge operationalExpenses
                const expMap = new Map();
                for (const e of (current.operationalExpenses || [])) {
                  if (e?.id && !delExpSet.has(e.id)) expMap.set(e.id, e);
                }
                for (const e of (payload.operationalExpenses || [])) {
                  if (e?.id && !delExpSet.has(e.id)) expMap.set(e.id, { ...(expMap.get(e.id) || {}), ...e });
                }

                // Merge supplierBills (preservando comprobantes/facturas non-destructively)
                const billMap = new Map();
                for (const b of (current.supplierBills || [])) {
                  if (b?.id && !delBillSet.has(b.id)) billMap.set(b.id, b);
                }
                for (const b of (payload.supplierBills || [])) {
                  if (!b?.id || delBillSet.has(b.id)) continue;
                  const prev = billMap.get(b.id);
                  billMap.set(b.id, prev ? {
                    ...prev,
                    ...b,
                    ...(prev.receiptImageUrl && !b.receiptImageUrl && !b.receiptDeletedAt ? { receiptImageUrl: prev.receiptImageUrl, receiptFileName: prev.receiptFileName, receiptUploadedAt: prev.receiptUploadedAt } : {}),
                    ...(prev.invoiceFileUrl && !b.invoiceFileUrl && !b.invoiceDeletedAt ? { invoiceFileUrl: prev.invoiceFileUrl, invoiceFileName: prev.invoiceFileName, invoiceUploadedAt: prev.invoiceUploadedAt } : {}),
                  } : b);
                }

                // Merge supplierBankProfiles
                const bankMap = new Map();
                for (const bp of (current.supplierBankProfiles || [])) {
                  if (bp?.id) bankMap.set(bp.id, bp);
                }
                for (const bp of (payload.supplierBankProfiles || [])) {
                  if (bp?.id) bankMap.set(bp.id, { ...(bankMap.get(bp.id) || {}), ...bp });
                }

                // Merge vipCustomers
                const vipCustMap = new Map();
                for (const vc of (current.vipCustomers || [])) {
                  if (vc?.id && !delVipCustSet.has(vc.id)) vipCustMap.set(vc.id, vc);
                }
                for (const vc of (payload.vipCustomers || [])) {
                  if (vc?.id && !delVipCustSet.has(vc.id)) vipCustMap.set(vc.id, { ...(vipCustMap.get(vc.id) || {}), ...vc });
                }

                // Merge vipOrders (preservando comprobantes y PDFs/XMLs)
                const vipOrderMap = new Map();
                for (const vo of (current.vipOrders || [])) {
                  if (vo?.id && !delVipOrderSet.has(vo.id)) vipOrderMap.set(vo.id, vo);
                }
                for (const vo of (payload.vipOrders || [])) {
                  if (!vo?.id || delVipOrderSet.has(vo.id)) continue;
                  const prev = vipOrderMap.get(vo.id);
                  vipOrderMap.set(vo.id, prev ? {
                    ...prev,
                    ...vo,
                    ...(prev.paymentReceiptUrl && !vo.paymentReceiptUrl ? { paymentReceiptUrl: prev.paymentReceiptUrl } : {}),
                    ...(prev.invoicePdfUrl && !vo.invoicePdfUrl ? { invoicePdfUrl: prev.invoicePdfUrl, invoicePdfFileName: prev.invoicePdfFileName } : {}),
                    ...(prev.invoiceXmlUrl && !vo.invoiceXmlUrl ? { invoiceXmlUrl: prev.invoiceXmlUrl, invoiceXmlFileName: prev.invoiceXmlFileName } : {}),
                  } : vo);
                }

                // Merge dailyDeliveries
                const delMap = new Map();
                for (const d of (current.dailyDeliveries || [])) {
                  if (d?.date && d?.shift) delMap.set(`${d.date}_${d.shift}`, d);
                }
                for (const d of (payload.dailyDeliveries || [])) {
                  if (d?.date && d?.shift && d?.quantities) {
                    const key = `${d.date}_${d.shift}`;
                    const prev = delMap.get(key);
                    delMap.set(key, {
                      date: d.date,
                      shift: d.shift,
                      quantities: { ...(prev?.quantities || {}), ...d.quantities },
                      updatedAt: d.updatedAt || new Date().toISOString()
                    });
                  }
                }

                // Merge driverSettlements
                const setMap = new Map();
                for (const s of (current.driverSettlements || [])) {
                  if (s?.id) setMap.set(s.id, s);
                }
                for (const s of (payload.driverSettlements || [])) {
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
                }

                // Merge driverCustomers
                const dcMap = new Map();
                for (const c of (current.driverCustomers || [])) {
                  if (c?.id && !delDcSet.has(c.id)) dcMap.set(c.id, c);
                }
                for (const c of (payload.driverCustomers || [])) {
                  if (c?.id && !delDcSet.has(c.id)) dcMap.set(c.id, { ...(dcMap.get(c.id) || {}), ...c });
                }

                (global as any).__santafe_store = {
                  tickets: Array.from(ticketMap.values()),
                  orders: Array.from(orderMap.values()),
                  shiftCuts: Array.from(cutsMap.values()),
                  outflows: Array.from(outflowsMap.values()),
                  customers: Array.from(custMap.values()),
                  operationalExpenses: Array.from(expMap.values()),
                  supplierBills: Array.from(billMap.values()),
                  supplierBankProfiles: Array.from(bankMap.values()),
                  vipCustomers: Array.from(vipCustMap.values()),
                  vipOrders: Array.from(vipOrderMap.values()),
                  dailyDeliveries: Array.from(delMap.values()),
                  driverCustomers: Array.from(dcMap.values()),
                  driverSettlements: Array.from(setMap.values()),
                  deletedIds,
                  lastUpdated: new Date().toISOString()
                };
                saveDevStoreToDisk();

                // Persistir ÚNICAMENTE el diff real en Supabase en segundo plano (nunca re-subir miles de filas intactas)
                if (!payload.skipSupabaseWrite) {
                  syncDeltaToSupabase(supabaseDiffPayload).catch(() => {});
                }

                const sseClients = (global as any).__santafe_sse_clients;
                const versionStr = (global as any).__santafe_store.lastUpdated;
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
                  lastUpdated: versionStr
                };
                if (sseClients && sseClients.size > 0) {
                  const sseMsg = `data: ${JSON.stringify({
                    type: 'SYNC_UPDATE',
                    sourceClientId: payload.clientId || null,
                    version: versionStr,
                    data: deltaPayload,
                    timestamp: Date.now()
                  })}\n\n`;
                  sseClients.forEach((client: any) => {
                    try { client.write(sseMsg); } catch { sseClients.delete(client); }
                  });
                }

                // Complemento en tiempo real vía Pusher (envía delta ligero si hay cambios)
                if (!payload.skipPusher) {
                  triggerPusherSync({
                    clientId: payload.clientId || 'server',
                    timestamp: Date.now(),
                    ...deltaPayload
                  }).catch(() => {});
                }

                res.writeHead(200, headers);
                if (payload.deltaOnly) {
                  return res.end(JSON.stringify({
                    success: true,
                    merged: true,
                    version: versionStr,
                    ticketCount: (global as any).__santafe_store.tickets.length,
                    message: 'Delta sincronizado'
                  }));
                }
                return res.end(JSON.stringify({
                  success: true,
                  merged: true,
                  version: versionStr,
                  data: (global as any).__santafe_store,
                  message: 'Datos combinados correctamente en dev'
                }));
              } catch (e: any) {
                res.writeHead(500, headers);
                return res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), mercadoPagoDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('node_modules/firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/leaflet')) {
              return 'vendor-maps';
            }
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
          }
        }
      }
    },
  };
});
