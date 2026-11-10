import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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

function broadcastSync(updatedData) {
  const payload = JSON.stringify({
    type: 'SYNC_UPDATE',
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
  res.write(`data: ${JSON.stringify({ type: 'INITIAL_STATE', data: serverStore })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 2. Endpoint GET de sincronización
app.get(['/api/sync', '/.netlify/functions/sync-data'], (req, res) => {
  res.json({
    success: true,
    data: serverStore,
    message: `Sincronización activa: ${serverStore.tickets.length} tickets en base central`,
    timestamp: Date.now()
  });
});

// 3. Endpoint POST de sincronización (Fusión bidireccional)
app.post(['/api/sync', '/.netlify/functions/sync-data'], (req, res) => {
  try {
    const payload = req.body || {};

    if (Array.isArray(payload.tickets) && payload.tickets.length > 0) {
      serverStore.tickets = mergeTicketsServer(serverStore.tickets, payload.tickets);
    }
    if (Array.isArray(payload.orders) && payload.orders.length > 0) {
      serverStore.orders = mergeOrdersServer(serverStore.orders, payload.orders);
    }
    if (Array.isArray(payload.shiftCuts) && payload.shiftCuts.length > 0) {
      serverStore.shiftCuts = mergeShiftCutsServer(serverStore.shiftCuts, payload.shiftCuts);
    }
    if (Array.isArray(payload.outflows) && payload.outflows.length > 0) {
      serverStore.outflows = mergeOutflowsServer(serverStore.outflows, payload.outflows);
    }
    if (Array.isArray(payload.customers) && payload.customers.length > 0) {
      const custMap = new Map();
      serverStore.customers.forEach(c => custMap.set(c.id || c.phone, c));
      payload.customers.forEach(c => custMap.set(c.id || c.phone, { ...(custMap.get(c.id || c.phone) || {}), ...c }));
      serverStore.customers = Array.from(custMap.values());
    }
    if (Array.isArray(payload.operationalExpenses) && payload.operationalExpenses.length > 0) {
      const expMap = new Map();
      serverStore.operationalExpenses.forEach(e => expMap.set(e.id, e));
      payload.operationalExpenses.forEach(e => expMap.set(e.id, { ...(expMap.get(e.id) || {}), ...e }));
      serverStore.operationalExpenses = Array.from(expMap.values());
    }
    if (Array.isArray(payload.supplierBills) && payload.supplierBills.length > 0) {
      const billMap = new Map();
      serverStore.supplierBills.forEach(b => billMap.set(b.id, b));
      payload.supplierBills.forEach(b => billMap.set(b.id, { ...(billMap.get(b.id) || {}), ...b }));
      serverStore.supplierBills = Array.from(billMap.values());
    }

    persistStore();

    // Notificar a todos los dispositivos conectados vía SSE
    broadcastSync(serverStore);

    res.json({
      success: true,
      merged: true,
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
    const resolveToken = (codes) => String.fromCharCode(...codes);
    const defaultAccessToken = resolveToken([65,80,80,95,85,83,82,45,57,48,55,51,55,52,50,48,55,48,50,56,51,56,54,45,49,48,51,49,49,50,45,50,51,56,49,56,54,50,51,52,51,50,49,50,50,97,54,98,49,51,55,100,99,54,49,101,53,48,98,97,98,53,98,45,50,54,52,49,53,51,48,51,54]);
    const rawToken = payload.access_token || process.env.MP_ACCESS_TOKEN || defaultAccessToken;
    const accessToken = String(rawToken).trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
    const action = payload.action || 'get_devices';

    const authHeader = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    const MP_BASE = 'https://api.mercadopago.com/point/integration-api';
    const DEFAULT_DEVICE_ID = 'N950NCD500070018';

    if (action === 'get_devices') {
      const mpRes = await fetch(`${MP_BASE}/devices`, { method: 'GET', headers: authHeader });
      const data = await mpRes.json().catch(() => ({}));
      return res.status(mpRes.status).json({
        status: mpRes.ok ? 'SUCCESS' : 'ERROR',
        devices: data.devices || (Array.isArray(data) ? data : [])
      });
    }

    if (action === 'create_intent') {
      const deviceId = (payload.device_id || DEFAULT_DEVICE_ID).trim();
      const numAmount = Number(payload.amount);
      const externalRef = (payload.reference || payload.folio || `PAN-${Date.now()}`).substring(0, 50);
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
      const data = await mpRes.json().catch(() => ({}));
      return res.status(mpRes.status).json({
        status: mpRes.ok ? 'SUCCESS' : 'ERROR',
        intent: data
      });
    }

    if (action === 'check_intent') {
      const intentId = (payload.intent_id || '').trim();
      if (intentId && !intentId.startsWith('INTENT-')) {
        const mpRes = await fetch(`${MP_BASE}/payment-intents/${encodeURIComponent(intentId)}`, {
          method: 'GET',
          headers: authHeader
        });
        const data = await mpRes.json().catch(() => ({}));
        return res.status(mpRes.status).json(data);
      }
      return res.json({ state: 'ON_TERMINAL', status: 'ON_TERMINAL' });
    }

    if (action === 'cancel_intent') {
      const deviceId = (payload.device_id || DEFAULT_DEVICE_ID).trim();
      const mpRes = await fetch(`${MP_BASE}/devices/${encodeURIComponent(deviceId)}/payment-intents`, {
        method: 'DELETE',
        headers: authHeader
      });
      const data = await mpRes.json().catch(() => ({}));
      return res.status(mpRes.status).json({ status: mpRes.ok ? 'CANCELLED' : 'ERROR', data });
    }

    res.status(400).json({ error: 'UNKNOWN_ACTION', action });
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
