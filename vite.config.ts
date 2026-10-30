import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

// Plugin para conectar directamente con la API real de Clip Pinpad F2F en desarrollo
function clipNetlifyFunctionDevPlugin(): Plugin {
  return {
    name: 'clip-netlify-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/.netlify/functions/clip-payment')) {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, Pinpad-Include-Detail',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            });
            return res.end();
          }

          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              let payload: any = {};
              if (bodyStr) {
                try { payload = JSON.parse(bodyStr); } catch (e) {}
              }

              const defaultApiKey = 'a7c54f1f-9bea-4405-a128-83e8f18f9d32';
              const defaultSecretKey = '9d0167db-964e-459b-bada-b758d301f792';
              const defaultSerial = 'P8C2240805000156';

              const rawApiKey = payload.api_key || process.env.CLIP_API_KEY || process.env.CLIP_KEY || defaultApiKey;
              const rawSecretKey = payload.secret_key || process.env.CLIP_SECRET_KEY || process.env.CLIP_SECRET || defaultSecretKey;
              const serial = (payload.serial_number_pos || process.env.CLIP_TERMINAL_SERIAL || defaultSerial).trim();
              const action = payload.action || 'create_payment';

              // Construir encabezado Authorization según especificaciones de Clip
              let authHeader = '';
              let apiKey = (rawApiKey || '').trim();
              let secretKey = (rawSecretKey || '').trim();

              if ((apiKey.startsWith('"') && apiKey.endsWith('"')) || (apiKey.startsWith("'") && apiKey.endsWith("'"))) {
                apiKey = apiKey.slice(1, -1).trim();
              }
              if ((secretKey.startsWith('"') && secretKey.endsWith('"')) || (secretKey.startsWith("'") && secretKey.endsWith("'"))) {
                secretKey = secretKey.slice(1, -1).trim();
              }

              if (/^basic\s+/i.test(apiKey) || /^bearer\s+/i.test(apiKey)) {
                authHeader = apiKey;
              } else if (/^basic\s+/i.test(secretKey) || /^bearer\s+/i.test(secretKey)) {
                authHeader = secretKey;
              } else if (apiKey && secretKey) {
                authHeader = `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`;
              } else {
                const singleToken = apiKey || secretKey;
                if (singleToken) {
                  if (singleToken.includes(':')) {
                    authHeader = `Basic ${Buffer.from(singleToken).toString('base64')}`;
                  } else {
                    authHeader = `Basic ${singleToken}`;
                  }
                }
              }

              const headers = {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              };

              // ACCIÓN: DIAGNÓSTICO EN VIVO
              if (action === 'diagnose') {
                if (!authHeader) {
                  res.writeHead(200, headers);
                  return res.end(JSON.stringify({
                    status: 'MISSING_CREDENTIALS',
                    message: 'Faltan credenciales de Clip. Ingresa tu API Key y Secret Key en Ajustes de la Panadería.',
                    diagnosis: { has_api_key: false, has_secret_key: false, env_serial_value: serial }
                  }));
                }

                try {
                  // Consultar lectores registrados en la cuenta
                  const clipRes = await fetch('https://api.payclip.io/f2f/pinpad/v1/devices/status', {
                    method: 'GET',
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
                  });
                  const clipData = await clipRes.json().catch(() => ({}));

                  let isSerialFound = false;
                  if (Array.isArray(clipData)) {
                    isSerialFound = clipData.some(d => 
                      (d.serial_number || d.serial_number_pos || d.serialNumber || d.ssn || '').toUpperCase() === serial.toUpperCase()
                    );
                  }

                  res.writeHead(200, headers);
                  return res.end(JSON.stringify({
                    status: clipRes.status === 401 ? 'AUTH_FAILED' : 'CONNECTED',
                    clip_http_status: clipRes.status,
                    clip_response: clipData,
                    is_serial_in_account: isSerialFound,
                    message: clipRes.status === 401 
                      ? 'Error 401: Clave no reconocida por Clip. Revisa tu API Key y Secret Key.'
                      : (isSerialFound ? `Terminal ${serial} conectada y registrada en tu cuenta.` : `Credenciales válidas (HTTP 200). La serie ${serial} no aparece en la lista de terminales activas de la cuenta.`),
                    diagnosis: {
                      has_api_key: Boolean(apiKey),
                      has_secret_key: Boolean(secretKey),
                      env_serial_value: serial,
                      auth_header_format: authHeader.startsWith('Basic ') ? 'Basic [Configurado]' : 'Bearer [Configurado]'
                    }
                  }));
                } catch (e: any) {
                  res.writeHead(200, headers);
                  return res.end(JSON.stringify({ status: 'NETWORK_ERROR', message: e.message }));
                }
              }

              // ACCIÓN: CHECK STATUS (POLLING REAL)
              if (action === 'check_status') {
                const reqId = payload.pinpad_request_id;
                if (!authHeader) {
                  res.writeHead(400, headers);
                  return res.end(JSON.stringify({ error: 'MISSING_API_KEY', message: 'Falta CLIP_API_KEY' }));
                }
                const clipRes = await fetch(`https://api.payclip.io/f2f/pinpad/v1/payment?pinpadRequestId=${encodeURIComponent(reqId)}`, {
                  method: 'GET',
                  headers: { 'Authorization': authHeader, 'Pinpad-Include-Detail': 'true' }
                });
                const clipData = await clipRes.json().catch(() => ({}));
                res.writeHead(clipRes.status, headers);
                return res.end(JSON.stringify(clipData));
              }

              // ACCIÓN: CREAR COBRO REAL EN LA TERMINAL
              if (!authHeader) {
                res.writeHead(400, headers);
                return res.end(JSON.stringify({
                  error: 'CLIP_AUTH_ERROR',
                  message: 'Faltan las credenciales de Clip. Ingrésalas en Ajustes de la Panadería o en tu panel de Netlify.'
                }));
              }

              const numAmount = Number(payload.amount);
              // CRUCIAL: "amount" debe ser un string con 2 decimales según la API de Clip
              const formattedAmount = isNaN(numAmount) ? '0.00' : numAmount.toFixed(2);

              const clipBody: any = {
                amount: formattedAmount,
                reference: (payload.reference || `PAN-${Date.now()}`).substring(0, 40),
                serial_number_pos: serial
              };
              if (payload.tip_amount) {
                clipBody.tip_amount = String(payload.tip_amount);
              }
              if (payload.preferences && typeof payload.preferences === 'object') {
                clipBody.preferences = payload.preferences;
              }

              const clipRes = await fetch('https://api.payclip.io/f2f/pinpad/v1/payment', {
                method: 'POST',
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(clipBody)
              });

              const clipData = await clipRes.json().catch(() => ({}));

              if (!clipRes.ok) {
                const rawMsg = clipData.message || clipData.description || '';
                let errCode = 'UNKNOWN';
                if (clipRes.status === 401) errCode = 'CLIP_AUTH_ERROR';
                else if (clipRes.status === 404) errCode = 'DEVICE_NOT_FOUND';
                else if (clipRes.status === 503 || clipRes.status === 504 || clipRes.status === 408) errCode = 'TERMINAL_OFFLINE';
                else if (clipRes.status === 409) errCode = 'TERMINAL_BUSY';

                res.writeHead(clipRes.status, headers);
                return res.end(JSON.stringify({
                  error: errCode,
                  http_status: clipRes.status,
                  message: rawMsg || `Clip API devolvió error HTTP ${clipRes.status}`,
                  details: clipData
                }));
              }

              res.writeHead(clipRes.status, headers);
              return res.end(JSON.stringify(clipData));

            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              return res.end(JSON.stringify({ error: 'DEV_PROXY_ERROR', message: err.message }));
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
    plugins: [react(), tailwindcss(), clipNetlifyFunctionDevPlugin()],
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
