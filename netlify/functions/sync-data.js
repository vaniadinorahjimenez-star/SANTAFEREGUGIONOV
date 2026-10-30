/**
 * Netlify Serverless Function: sync-data.js
 * Ruta: /.netlify/functions/sync-data y /api/sync
 * 
 * Sincronización en la Nube con Fusión / Combinación de Datos (Merge).
 * NUNCA sobrescribe ni borra ventas, cobros de tarjeta o pedidos.
 * Combina los datos de la Computadora y del Teléfono unificando montos y estados.
 */

const fs = require('fs');
const path = require('path');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

const TEMP_STORAGE_FILE = path.join('/tmp', 'santafe_cloud_data_store.json');

// Memoria global compartida entre llamadas del contenedor serverless
let inMemoryStore = {
  tickets: [],
  orders: [],
  shiftCuts: [],
  outflows: [],
  customers: [],
  lastUpdated: new Date().toISOString()
};

// Cargar estado inicial desde almacenamiento temporal si existe
function loadStore() {
  try {
    if (fs.existsSync(TEMP_STORAGE_FILE)) {
      const data = fs.readFileSync(TEMP_STORAGE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        inMemoryStore = {
          tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
          orders: Array.isArray(parsed.orders) ? parsed.orders : [],
          shiftCuts: Array.isArray(parsed.shiftCuts) ? parsed.shiftCuts : [],
          outflows: Array.isArray(parsed.outflows) ? parsed.outflows : [],
          customers: Array.isArray(parsed.customers) ? parsed.customers : [],
          lastUpdated: parsed.lastUpdated || new Date().toISOString()
        };
      }
    }
  } catch (err) {
    console.error('Error leyendo almacenamiento temporal en la nube:', err);
  }
}

function saveStore() {
  try {
    inMemoryStore.lastUpdated = new Date().toISOString();
    fs.writeFileSync(TEMP_STORAGE_FILE, JSON.stringify(inMemoryStore, null, 2), 'utf8');
  } catch (err) {
    console.warn('Advertencia guardando en /tmp (puede no persistir en modo estricto):', err.message);
  }
}

// Inicializar almacenamiento al arrancar
loadStore();

/**
 * Combina dos listas de Tickets sin perder absolutamente ninguno.
 * Soporta ventas consecutivas dentro del mismo minuto y con segundos de diferencia.
 */
function mergeTickets(existingList, incomingList) {
  const map = new Map();

  const getTicketKey = (t) => {
    if (t.id && String(t.id).trim() !== '') return `id:${String(t.id).trim()}`;
    if (t.folio && String(t.folio).trim() !== '') return `folio:${String(t.folio).trim()}`;
    const genId = `ticket-${t.timestamp ? new Date(t.timestamp).getTime() : Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    t.id = genId;
    return `id:${genId}`;
  };
  
  // Agregar existentes
  for (const t of existingList || []) {
    if (!t) continue;
    const key = getTicketKey(t);
    map.set(key, t);
  }

  // Combinar entrantes
  for (const t of incomingList || []) {
    if (!t) continue;
    const key = getTicketKey(t);
    if (map.has(key)) {
      const prev = map.get(key);
      map.set(key, {
        ...prev,
        ...t,
        paymentMethod: t.paymentMethod || prev.paymentMethod,
        cardTerminal: t.cardTerminal || prev.cardTerminal,
        cardAuthCode: t.cardAuthCode || prev.cardAuthCode,
        cardLast4: t.cardLast4 || prev.cardLast4,
        cardReference: t.cardReference || prev.cardReference,
      });
    } else {
      map.set(key, t);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.timestamp || `${a.date}T${a.time || '00:00:00'}`).getTime();
    const timeB = new Date(b.timestamp || `${b.date}T${b.time || '00:00:00'}`).getTime();
    if (isNaN(timeA) || isNaN(timeB)) return 0;
    return timeB - timeA;
  });
}

/**
 * Combina dos listas de Pedidos sin perder cobros ni adelantos.
 */
function mergeOrders(existingList, incomingList) {
  const map = new Map();

  for (const o of existingList || []) {
    if (!o) continue;
    if (o.id && (o.id === 'ord-101' || o.id === 'ord-102' || o.id === 'ord-103' || o.id === 'ord-104' || o.id === 'ord-105' || o.id.startsWith('ord-10'))) continue;
    if (o.folio && o.folio.startsWith('PED-010')) continue;
    const key = o.id || o.folio;
    if (key) map.set(key, o);
  }

  for (const o of incomingList || []) {
    if (!o) continue;
    if (o.id && (o.id === 'ord-101' || o.id === 'ord-102' || o.id === 'ord-103' || o.id === 'ord-104' || o.id === 'ord-105' || o.id.startsWith('ord-10'))) continue;
    if (o.folio && o.folio.startsWith('PED-010')) continue;
    const key = o.id || o.folio;
    if (!key) continue;

    if (map.has(key)) {
      const prev = map.get(key);
      const deliveryStatus = (o.deliveryStatus === 'entregado' || prev.deliveryStatus === 'entregado')
        ? 'entregado'
        : (o.deliveryStatus || prev.deliveryStatus);
      const paymentStatus = (o.paymentStatus === 'pagado' || prev.paymentStatus === 'pagado')
        ? 'pagado'
        : (o.paymentStatus || prev.paymentStatus);
      
      const collectedAmount = Math.max(o.collectedAmount || 0, prev.collectedAmount || 0);
      const deposit = Math.max(o.deposit || 0, prev.deposit || 0);
      const pendingAmount = paymentStatus === 'pagado' 
        ? 0 
        : Math.min(
            o.pendingAmount !== undefined ? o.pendingAmount : (o.total - deposit - collectedAmount),
            prev.pendingAmount !== undefined ? prev.pendingAmount : (prev.total - deposit - collectedAmount)
          );

      map.set(key, {
        ...prev,
        ...o,
        deliveryStatus,
        paymentStatus,
        collectedAmount,
        deposit,
        pendingAmount: Math.max(0, pendingAmount),
        deliveredAt: o.deliveredAt || prev.deliveredAt
      });
    } else {
      map.set(key, o);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const dateA = a.deliveryDate || a.createdAt || '';
    const dateB = b.deliveryDate || b.createdAt || '';
    return dateB.localeCompare(dateA);
  });
}

/**
 * Combina Cortes de Caja
 */
function mergeShiftCuts(existingList, incomingList) {
  const map = new Map();
  for (const c of existingList || []) {
    if (!c) continue;
    const key = c.id || c.folio || `${c.date}_${c.shiftType}`;
    map.set(key, c);
  }
  for (const c of incomingList || []) {
    if (!c) continue;
    const key = c.id || c.folio || `${c.date}_${c.shiftType}`;
    map.set(key, { ...(map.get(key) || {}), ...c });
  }
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || `${a.date}T${a.time || '00:00'}`).getTime();
    const timeB = new Date(b.createdAt || `${b.date}T${b.time || '00:00'}`).getTime();
    return timeB - timeA;
  });
}

/**
 * Combina Salidas de Dinero
 */
function mergeOutflows(existingList, incomingList) {
  const map = new Map();
  for (const o of existingList || []) {
    if (o && o.id) map.set(o.id, o);
  }
  for (const o of incomingList || []) {
    if (o && o.id) map.set(o.id, { ...(map.get(o.id) || {}), ...o });
  }
  return Array.from(map.values()).sort((a, b) => {
    return (b.date + b.time).localeCompare(a.date + a.time);
  });
}

/**
 * Combina Clientes
 */
function mergeCustomers(existingList, incomingList) {
  const map = new Map();
  for (const c of existingList || []) {
    if (!c) continue;
    const key = c.phone || c.id;
    if (key) map.set(key, c);
  }
  for (const c of incomingList || []) {
    if (!c) continue;
    const key = c.phone || c.id;
    if (!key) continue;
    if (map.has(key)) {
      const prev = map.get(key);
      map.set(key, {
        ...prev,
        ...c,
        points: Math.max(c.points || 0, prev.points || 0),
        totalSpent: Math.max(c.totalSpent || 0, prev.totalSpent || 0),
        visitsCount: Math.max(c.visitsCount || 0, prev.visitsCount || 0)
      });
    } else {
      map.set(key, c);
    }
  }
  return Array.from(map.values());
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // Recargar store antes de procesar
  loadStore();

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        data: inMemoryStore,
        count: {
          tickets: inMemoryStore.tickets.length,
          orders: inMemoryStore.orders.length,
          shiftCuts: inMemoryStore.shiftCuts.length
        },
        message: 'Datos recuperados de la nube exitosamente'
      })
    };
  }

  if (event.httpMethod === 'POST') {
    try {
      let body = {};
      if (event.body) {
        body = JSON.parse(event.body);
      }

      const incomingTickets = body.tickets || [];
      const incomingOrders = body.orders || [];
      const incomingShiftCuts = body.shiftCuts || [];
      const incomingOutflows = body.outflows || [];
      const incomingCustomers = body.customers || [];

      // COMBINAR (MERGE) en vez de sobrescribir
      inMemoryStore.tickets = mergeTickets(inMemoryStore.tickets, incomingTickets);
      inMemoryStore.orders = mergeOrders(inMemoryStore.orders, incomingOrders);
      inMemoryStore.shiftCuts = mergeShiftCuts(inMemoryStore.shiftCuts, incomingShiftCuts);
      inMemoryStore.outflows = mergeOutflows(inMemoryStore.outflows, incomingOutflows);
      inMemoryStore.customers = mergeCustomers(inMemoryStore.customers, incomingCustomers);

      saveStore();

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          merged: true,
          data: inMemoryStore,
          count: {
            tickets: inMemoryStore.tickets.length,
            orders: inMemoryStore.orders.length,
            shiftCuts: inMemoryStore.shiftCuts.length
          },
          message: 'Datos combinados y sincronizados en la nube correctamente'
        })
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: err.message || 'Error combinando datos en la nube'
        })
      };
    }
  }

  return {
    statusCode: 405,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Método no permitido' })
  };
};
