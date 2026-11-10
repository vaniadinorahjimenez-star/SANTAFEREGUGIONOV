import { SaleTicket, BakeryOrder, ShiftCutRecord, CashOutflowItem, Customer, OperationalExpense, SupplierBill } from '../types';
import { 
  loadTickets, 
  loadOrders, 
  loadShiftCuts, 
  loadOutflows, 
  loadCustomers,
  loadOperationalExpenses,
  saveOperationalExpenses,
  mergeOperationalExpenses,
  loadSupplierBills,
  saveSupplierBills,
  mergeSupplierBills,
  saveDailyDeliverySheet,
  getDailyDeliverySheet,
  mergeDailyDeliverySheets,
  unmarkDeliveryAsDeleted,
  mergeTickets,
  mergeOrders,
  mergeShiftCuts,
  mergeOutflows,
  mergeCustomers,
  getDeletedOrderIds,
  STORAGE_KEYS
} from '../utils/storage';
import {
  auth,
  saveSaleTicketToFirestore,
  saveShiftCutToFirestore,
  saveOrderToFirestore,
  saveCustomerToFirestore,
  saveOutflowToFirestore,
  fetchAllDailyDeliveriesFromFirestore,
  fetchOperationalExpensesFromFirestore,
  fetchSupplierBillsFromFirestore,
  subscribeToFirestoreTickets,
  subscribeToFirestoreOrders,
  subscribeToFirestoreShiftCuts,
  subscribeToFirestoreOutflows,
  subscribeToAllDailyDeliveries,
  subscribeToOperationalExpenses,
  subscribeToSupplierBills,
  signInWithGoogle,
  logoutFirebase,
  testConnection,
  isQuotaExceeded
} from './firebase';

export interface CloudSyncResult {
  success: boolean;
  message: string;
  mergedData?: {
    tickets: SaleTicket[];
    orders: BakeryOrder[];
    shiftCuts: ShiftCutRecord[];
    outflows: CashOutflowItem[];
    customers: Customer[];
    operationalExpenses?: OperationalExpense[];
    supplierBills?: SupplierBill[];
  };
  error?: string;
  isFirebase?: boolean;
}

type SyncListener = (data: NonNullable<CloudSyncResult['mergedData']>) => void;
const listeners: Set<SyncListener> = new Set();

export function onCloudSyncUpdated(cb: SyncListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyListeners(data: NonNullable<CloudSyncResult['mergedData']>) {
  listeners.forEach(cb => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error en callback de sincronización:', e);
    }
  });
}

let isSyncInProgress = false;
let hasPendingSync = false;
let pendingProvidedData: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
  operationalExpenses?: OperationalExpense[];
  supplierBills?: SupplierBill[];
} | undefined = undefined;

let isFirebaseConnected = false;
let listenersStarted = false;
const statusCallbacks = new Set<(status: { connected: boolean; userEmail?: string; lastSyncTime: number }) => void>();
let currentStatus: { connected: boolean; userEmail?: string; lastSyncTime: number } = {
  connected: true,
  userEmail: auth.currentUser?.email || undefined,
  lastSyncTime: Date.now()
};

function updateStatus(status: { connected: boolean; userEmail?: string }) {
  currentStatus = { ...status, lastSyncTime: Date.now() };
  isFirebaseConnected = status.connected;
  statusCallbacks.forEach(cb => {
    try { cb(currentStatus); } catch {}
  });
}

/**
 * Enviar datos locales combinados al servidor Express backend (/api/sync)
 * Esto garantiza sincronización en tiempo real inmediata entre computadoras y celulares
 * sin depender exclusivamente de las cuotas gratuitas de Firestore.
 */
async function postToServerSync(data: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
  operationalExpenses?: OperationalExpense[];
  supplierBills?: SupplierBill[];
}): Promise<any> {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      const json = await res.json();
      return json.data || null;
    }
  } catch {
    // Si falla la red local o dev server, se continúa sin romper
  }
  return null;
}

/**
 * Consulta el servidor backend Express para obtener los últimos tickets y ventas en tiempo real
 */
async function fetchFromServerSync(): Promise<any> {
  try {
    const res = await fetch('/api/sync', { method: 'GET' });
    if (res.ok) {
      const json = await res.json();
      return json.data || null;
    }
  } catch {}
  return null;
}

/**
 * Procesa datos remotos recibidos desde el servidor backend o SSE y actualiza localStorage y React
 */
function handleIncomingRemoteData(serverData: any) {
  if (!serverData) return;

  let hasUpdates = false;
  const currentTickets = loadTickets();
  const currentOrders = loadOrders();
  const currentCuts = loadShiftCuts();
  const currentOutflows = loadOutflows();
  const currentCustomers = loadCustomers();
  const currentExpenses = loadOperationalExpenses();
  const currentBills = loadSupplierBills();

  let mergedTickets = currentTickets;
  if (Array.isArray(serverData.tickets) && serverData.tickets.length > 0) {
    mergedTickets = mergeTickets(currentTickets, serverData.tickets);
    if (mergedTickets.length !== currentTickets.length || JSON.stringify(mergedTickets[0]) !== JSON.stringify(currentTickets[0])) {
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(mergedTickets));
      hasUpdates = true;
    }
  }

  let mergedOrders = currentOrders;
  if (Array.isArray(serverData.orders) && serverData.orders.length > 0) {
    const deleted = getDeletedOrderIds();
    const active = serverData.orders.filter(
      (o: any) => o && (o.id || o.folio) && !deleted.has(o.id) && !(o.folio && deleted.has(o.folio))
    );
    mergedOrders = mergeOrders(currentOrders, active);
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(mergedOrders));
  }

  let mergedShiftCuts = currentCuts;
  if (Array.isArray(serverData.shiftCuts) && serverData.shiftCuts.length > 0) {
    mergedShiftCuts = mergeShiftCuts(currentCuts, serverData.shiftCuts);
    localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(mergedShiftCuts));
  }

  let mergedOutflows = currentOutflows;
  if (Array.isArray(serverData.outflows) && serverData.outflows.length > 0) {
    mergedOutflows = mergeOutflows(currentOutflows, serverData.outflows);
    localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(mergedOutflows));
  }

  let mergedCustomers = currentCustomers;
  if (Array.isArray(serverData.customers) && serverData.customers.length > 0) {
    mergedCustomers = mergeCustomers(currentCustomers, serverData.customers);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(mergedCustomers));
  }

  let mergedExpenses = currentExpenses;
  if (Array.isArray(serverData.operationalExpenses) && serverData.operationalExpenses.length > 0) {
    mergedExpenses = mergeOperationalExpenses(currentExpenses, serverData.operationalExpenses);
    localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(mergedExpenses));
  }

  let mergedBills = currentBills;
  if (Array.isArray(serverData.supplierBills) && serverData.supplierBills.length > 0) {
    mergedBills = mergeSupplierBills(currentBills, serverData.supplierBills);
    localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(mergedBills));
  }

  notifyListeners({
    tickets: mergedTickets,
    orders: mergedOrders,
    shiftCuts: mergedShiftCuts,
    outflows: mergedOutflows,
    customers: mergedCustomers,
    operationalExpenses: mergedExpenses,
    supplierBills: mergedBills
  });
  updateStatus({ connected: true, userEmail: auth.currentUser?.email || undefined });
}

/**
 * Inicializa la sincronización automática con Firebase y el servidor Express en tiempo real
 */
export function initFirebaseAutoSync(onStatusChange?: (status: { connected: boolean; userEmail?: string; lastSyncTime: number }) => void): () => void {
  if (onStatusChange) {
    statusCallbacks.add(onStatusChange);
    onStatusChange(currentStatus);
  }

  if (listenersStarted) {
    return () => {
      if (onStatusChange) statusCallbacks.delete(onStatusChange);
    };
  }
  listenersStarted = true;

  updateStatus({
    connected: true,
    userEmail: auth.currentUser?.email || undefined
  });

  // 1. Iniciar conexión SSE (Server-Sent Events) para tiempo real instantáneo con el servidor
  try {
    if (typeof EventSource !== 'undefined') {
      const evtSource = new EventSource('/api/sync/events');
      evtSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && parsed.data) {
            handleIncomingRemoteData(parsed.data);
          }
        } catch {}
      };
      evtSource.onerror = () => {
        // En caso de reconexión SSE, el navegador reintenta automáticamente
      };
    }
  } catch {}

  // 2. Probar conexión Firestore y sincronizar datos acumulados
  testConnection().then((ok) => {
    updateStatus({
      connected: ok,
      userEmail: auth.currentUser?.email || undefined
    });
  }).catch(() => {
    updateStatus({
      connected: true,
      userEmail: auth.currentUser?.email || undefined
    });
  });

  // 3. Empujar datos locales inmediatamente al servidor y traer los de las otras sucursales / dispositivos
  const initialLocalData = {
    tickets: loadTickets(),
    orders: loadOrders(),
    shiftCuts: loadShiftCuts(),
    outflows: loadOutflows(),
    customers: loadCustomers(),
    operationalExpenses: loadOperationalExpenses(),
    supplierBills: loadSupplierBills()
  };
  postToServerSync(initialLocalData).then(remoteMerged => {
    if (remoteMerged) {
      handleIncomingRemoteData(remoteMerged);
    }
  });

  // 4. Polling ultra-ligero cada 4.5 segundos para sincronización garantizada en celulares
  const pollInterval = setInterval(async () => {
    try {
      const freshRemote = await fetchFromServerSync();
      if (freshRemote) {
        handleIncomingRemoteData(freshRemote);
      }
    } catch {}
  }, 4500);

  // Escuchar cuando el usuario regresa a la pestaña (visibilidad activa en el teléfono)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        fetchFromServerSync().then(remote => {
          if (remote) handleIncomingRemoteData(remote);
        });
      }
    });
  }

  // 5. Escuchar tickets de Firestore en tiempo real (canal complementario en la nube)
  subscribeToFirestoreTickets((firestoreTickets) => {
    updateStatus({
      connected: true,
      userEmail: auth.currentUser?.email || undefined
    });
    if (firestoreTickets && firestoreTickets.length > 0) {
      const current = loadTickets();
      const merged = mergeTickets(current, firestoreTickets);
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(merged));
      // También respaldar en el servidor central
      postToServerSync({ tickets: firestoreTickets });
      notifyListeners({
        tickets: merged,
        orders: loadOrders(),
        shiftCuts: loadShiftCuts(),
        outflows: loadOutflows(),
        customers: loadCustomers()
      });
    }
  });

  // 6. Escuchar pedidos de Firestore
  subscribeToFirestoreOrders((firestoreOrders) => {
    if (firestoreOrders) {
      const deleted = getDeletedOrderIds();
      const activeFirestoreOrders = firestoreOrders.filter(
        o => o && (o.id || o.folio) && !deleted.has(o.id) && !(o.folio && deleted.has(o.folio))
      );
      const current = loadOrders();
      const merged = mergeOrders(current, activeFirestoreOrders);
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(merged));
      notifyListeners({
        tickets: loadTickets(),
        orders: merged,
        shiftCuts: loadShiftCuts(),
        outflows: loadOutflows(),
        customers: loadCustomers()
      });
    }
  });

  // 7. Escuchar cortes de turno de Firestore
  subscribeToFirestoreShiftCuts((firestoreCuts) => {
    if (firestoreCuts && firestoreCuts.length > 0) {
      const current = loadShiftCuts();
      const merged = mergeShiftCuts(current, firestoreCuts);
      localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(merged));
      notifyListeners({
        tickets: loadTickets(),
        orders: loadOrders(),
        shiftCuts: merged,
        outflows: loadOutflows(),
        customers: loadCustomers()
      });
    }
  });

  // 8. Escuchar salidas de dinero de Firestore
  subscribeToFirestoreOutflows((firestoreOutflows) => {
    if (firestoreOutflows && firestoreOutflows.length > 0) {
      const current = loadOutflows();
      const merged = mergeOutflows(current, firestoreOutflows);
      localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(merged));
      notifyListeners({
        tickets: loadTickets(),
        orders: loadOrders(),
        shiftCuts: loadShiftCuts(),
        outflows: merged,
        customers: loadCustomers()
      });
    }
  });

  // 9. Escuchar hojas de reparto en tiempo real
  subscribeToAllDailyDeliveries((deliveries) => {
    if (deliveries && deliveries.length > 0) {
      deliveries.forEach(del => {
        const filteredRemote: Record<string, Record<string, number>> = {};
        for (const [cId, breads] of Object.entries(del.quantities || {})) {
          const hasActiveBreads = Object.values(breads || {}).some(q => Number(q) > 0);
          if (hasActiveBreads) {
            unmarkDeliveryAsDeleted(del.date, del.shift, cId);
            filteredRemote[cId] = breads as Record<string, number>;
          }
        }
        const current = getDailyDeliverySheet(del.date, del.shift);
        const merged = mergeDailyDeliverySheets(current, filteredRemote, del.date, del.shift);
        saveDailyDeliverySheet(del.date, merged, del.shift);
      });
      window.dispatchEvent(new Event('dailyDeliveryUpdated'));
      notifyListeners({
        tickets: loadTickets(),
        orders: loadOrders(),
        shiftCuts: loadShiftCuts(),
        outflows: loadOutflows(),
        customers: loadCustomers()
      });
    }
  });

  // 10. Escuchar gastos operativos
  subscribeToOperationalExpenses((expenses) => {
    if (expenses && expenses.length >= 0) {
      const current = loadOperationalExpenses();
      const merged = mergeOperationalExpenses(current, expenses);
      localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(merged));
      notifyListeners({
        tickets: loadTickets(),
        orders: loadOrders(),
        shiftCuts: loadShiftCuts(),
        outflows: loadOutflows(),
        customers: loadCustomers(),
        operationalExpenses: merged,
        supplierBills: loadSupplierBills()
      });
      window.dispatchEvent(new Event('expensesUpdated'));
    }
  });

  // 11. Escuchar proveedores
  subscribeToSupplierBills((bills) => {
    if (bills && bills.length >= 0) {
      const current = loadSupplierBills();
      const merged = mergeSupplierBills(current, bills);
      localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(merged));
      notifyListeners({
        tickets: loadTickets(),
        orders: loadOrders(),
        shiftCuts: loadShiftCuts(),
        outflows: loadOutflows(),
        customers: loadCustomers(),
        operationalExpenses: loadOperationalExpenses(),
        supplierBills: merged
      });
      window.dispatchEvent(new Event('supplierBillsUpdated'));
    }
  });

  return () => {
    clearInterval(pollInterval);
    if (onStatusChange) statusCallbacks.delete(onStatusChange);
  };
}

/**
 * Realiza la sincronización combinada (Merge) con el servidor y Firebase Firestore
 * NUNCA sobrescribe datos; combina los tickets, cobros de tarjeta, pedidos y cortes.
 */
export async function syncWithCloud(providedData?: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
  operationalExpenses?: OperationalExpense[];
  supplierBills?: SupplierBill[];
}): Promise<CloudSyncResult> {
  const currentStoredTickets = loadTickets();
  const localTickets = mergeTickets(currentStoredTickets, providedData?.tickets || []);
  const localOrders = mergeOrders(loadOrders(), providedData?.orders || []);
  const localShiftCuts = mergeShiftCuts(loadShiftCuts(), providedData?.shiftCuts || []);
  const localOutflows = mergeOutflows(loadOutflows(), providedData?.outflows || []);
  const localCustomers = mergeCustomers(loadCustomers(), providedData?.customers || []);
  const localExpenses = mergeOperationalExpenses(loadOperationalExpenses(), providedData?.operationalExpenses || []);
  const localBills = mergeSupplierBills(loadSupplierBills(), providedData?.supplierBills || []);

  localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(localTickets));
  localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(localOrders));
  localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(localShiftCuts));
  localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(localOutflows));
  localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(localCustomers));
  localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(localExpenses));
  localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(localBills));

  // 1. Enviar de inmediato al servidor Express central (broadcast instantáneo a todos los celulares)
  postToServerSync({
    tickets: providedData?.tickets || localTickets,
    orders: providedData?.orders || localOrders,
    shiftCuts: providedData?.shiftCuts || localShiftCuts,
    outflows: providedData?.outflows || localOutflows,
    customers: providedData?.customers || localCustomers,
    operationalExpenses: providedData?.operationalExpenses || localExpenses,
    supplierBills: providedData?.supplierBills || localBills
  }).catch(() => {});

  // 2. Si hay tickets recién creados, guardarlos individualmente en Firestore si la cuota no está excedida
  if (providedData?.tickets && providedData.tickets.length > 0 && !isQuotaExceeded()) {
    for (const t of providedData.tickets) {
      saveSaleTicketToFirestore(t).catch(() => {});
    }
  }

  if (providedData?.shiftCuts && providedData.shiftCuts.length > 0 && !isQuotaExceeded()) {
    for (const c of providedData.shiftCuts) {
      saveShiftCutToFirestore(c).catch(() => {});
    }
  }

  if (providedData?.orders && providedData.orders.length > 0 && !isQuotaExceeded()) {
    for (const o of providedData.orders) {
      saveOrderToFirestore(o).catch(() => {});
    }
  }

  if (providedData?.customers && providedData.customers.length > 0 && !isQuotaExceeded()) {
    for (const cu of providedData.customers) {
      saveCustomerToFirestore(cu).catch(() => {});
    }
  }

  if (providedData?.outflows && providedData.outflows.length > 0 && !isQuotaExceeded()) {
    for (const out of providedData.outflows) {
      saveOutflowToFirestore(out).catch(() => {});
    }
  }

  const resultData = {
    tickets: localTickets,
    orders: localOrders,
    shiftCuts: localShiftCuts,
    outflows: localOutflows,
    customers: localCustomers,
    operationalExpenses: localExpenses,
    supplierBills: localBills
  };

  notifyListeners(resultData);
  updateStatus({ connected: true, userEmail: auth.currentUser?.email || undefined });

  return {
    success: true,
    message: `Sincronización en tiempo real activa (${localTickets.length} tickets registrados)`,
    mergedData: resultData,
    isFirebase: true
  };
}

/**
 * Consulta el servidor y Firebase para combinar y descargar todos los datos en tiempo real
 */
export async function fetchAndMergeCloud(): Promise<CloudSyncResult> {
  try {
    // 1. Obtener datos del servidor Express en tiempo real (instantáneo)
    const serverData = await fetchFromServerSync();
    if (serverData) {
      handleIncomingRemoteData(serverData);
    }

    // 2. Obtener hojas de reparto y complementos de Firestore si es posible
    try {
      const [remoteDeliveries, remoteExpenses, remoteBills] = await Promise.all([
        fetchAllDailyDeliveriesFromFirestore().catch(() => []),
        fetchOperationalExpensesFromFirestore().catch(() => []),
        fetchSupplierBillsFromFirestore().catch(() => [])
      ]);

      if (remoteDeliveries && remoteDeliveries.length > 0) {
        remoteDeliveries.forEach(del => {
          const filteredRemote: Record<string, Record<string, number>> = {};
          for (const [cId, breads] of Object.entries(del.quantities || {})) {
            const hasActiveBreads = Object.values(breads || {}).some(q => Number(q) > 0);
            if (hasActiveBreads) {
              unmarkDeliveryAsDeleted(del.date, del.shift, cId);
              filteredRemote[cId] = breads as Record<string, number>;
            }
          }
          const current = getDailyDeliverySheet(del.date, del.shift);
          const merged = mergeDailyDeliverySheets(current, filteredRemote, del.date, del.shift);
          saveDailyDeliverySheet(del.date, merged, del.shift);
        });
        window.dispatchEvent(new Event('dailyDeliveryUpdated'));
      }

      if (remoteExpenses && remoteExpenses.length > 0) {
        const curExp = loadOperationalExpenses();
        const merged = mergeOperationalExpenses(curExp, remoteExpenses);
        localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(merged));
      }

      if (remoteBills && remoteBills.length > 0) {
        const curBills = loadSupplierBills();
        const merged = mergeSupplierBills(curBills, remoteBills);
        localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(merged));
      }
    } catch {}

    const localTickets = loadTickets();
    const localOrders = loadOrders();
    const localShiftCuts = loadShiftCuts();
    const localOutflows = loadOutflows();
    const localCustomers = loadCustomers();
    const localExpenses = loadOperationalExpenses();
    const localBills = loadSupplierBills();

    const resultData = {
      tickets: localTickets,
      orders: localOrders,
      shiftCuts: localShiftCuts,
      outflows: localOutflows,
      customers: localCustomers,
      operationalExpenses: localExpenses,
      supplierBills: localBills
    };

    notifyListeners(resultData);
    updateStatus({ connected: true, userEmail: auth.currentUser?.email || undefined });

    return {
      success: true,
      message: 'Sincronización en tiempo real completada',
      mergedData: resultData,
      isFirebase: true
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Usando datos locales',
      error: err?.message
    };
  }
}

export function getCloudSyncStatus(): { isOnline: boolean; isFirebaseConnected: boolean; lastSyncTime: number; userEmail?: string } {
  return {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isFirebaseConnected: true,
    userEmail: auth.currentUser?.email || undefined,
    lastSyncTime: currentStatus.lastSyncTime
  };
}

export { signInWithGoogle, logoutFirebase };
