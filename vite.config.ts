import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

// Plugin para conectar con la API real de Mercado Pago Point y Sync en desarrollo
function mercadoPagoDevPlugin(): Plugin {
  return {
    name: 'mercadopago-dev-proxy',
    configureServer(server) {
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

              const defaultAccessToken = 'APP_USR-907374207028386-103112-23818623432122a6b137dc61e50bab5b-264153036';
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

              const DEFAULT_DEVICE_ID = 'N950NCD500070018';

              // 2. Cambiar modo de operación (PDV)
              if (action === 'set_operating_mode') {
                const deviceId = (payload.device_id || DEFAULT_DEVICE_ID).trim();
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
                const deviceId = (payload.device_id || DEFAULT_DEVICE_ID).trim();
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
                const deviceId = (payload.device_id || DEFAULT_DEVICE_ID).trim();
                const mpRes = await fetch(`${MP_BASE}/devices/${encodeURIComponent(deviceId)}/payment-intents`, {
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

          if (req.method === 'GET') {
            res.writeHead(200, headers);
            return res.end(JSON.stringify({
              success: true,
              data: (global as any).__santafe_store || { tickets: [], orders: [], shiftCuts: [], outflows: [], customers: [] },
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

                const current = (global as any).__santafe_store || { tickets: [], orders: [], shiftCuts: [], outflows: [], customers: [] };

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
                  if (!t) continue;
                  ticketMap.set(getTicketKey(t), t);
                }
                for (const t of (payload.tickets || [])) {
                  if (!t) continue;
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
                  if (o.id || o.folio) orderMap.set(o.id || o.folio, o);
                }
                for (const o of (payload.orders || [])) {
                  const key = o.id || o.folio;
                  if (!key) continue;
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
                  if (o.id) outflowsMap.set(o.id, o);
                }
                for (const o of (payload.outflows || [])) {
                  if (o.id) outflowsMap.set(o.id, { ...(outflowsMap.get(o.id) || {}), ...o });
                }

                (global as any).__santafe_store = {
                  tickets: Array.from(ticketMap.values()),
                  orders: Array.from(orderMap.values()),
                  shiftCuts: Array.from(cutsMap.values()),
                  outflows: Array.from(outflowsMap.values()),
                  customers: payload.customers || current.customers || [],
                  lastUpdated: new Date().toISOString()
                };

                res.writeHead(200, headers);
                return res.end(JSON.stringify({
                  success: true,
                  merged: true,
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
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 2500,
    },
  };
});
