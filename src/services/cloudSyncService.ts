import {
  SaleTicket,
  BakeryOrder,
  ShiftCutRecord,
  CashOutflowItem,
  Customer,
  OperationalExpense,
  SupplierBill,
  VipCustomer,
  VipOrder
} from '../types';
import {
  loadTickets,
  loadOrders,
  loadShiftCuts,
  loadOutflows,
  loadCustomers,
  loadOperationalExpenses,
  mergeOperationalExpenses,
  loadSupplierBills,
  mergeSupplierBills,
  loadVipCustomers,
  mergeVipCustomers,
  loadVipOrders,
  mergeVipOrders,
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
  markOrderAsDeleted,
  markTicketAsDeleted,
  markOperationalExpenseAsDeleted,
  markSupplierBillAsDeleted,
  markVipCustomerAsDeleted,
  markVipOrderAsDeleted,
  STORAGE_KEYS
} from '../utils/storage';
import {
  auth,
  saveSaleTicketToFirestore,
  saveShiftCutToFirestore,
  saveOrderToFirestore,
  saveCustomerToFirestore,
  saveOutflowToFirestore,
  saveOperationalExpenseToFirestore,
  saveSupplierBillToFirestore,
  saveVipCustomerToFirestore,
  saveVipOrderToFirestore,
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
import {
  initPusherClient,
  onPusherDelta,
  onPusherRefresh,
  onPusherCustomEvent,
  onPusherStatusChange,
  broadcastPusherDelta,
  getSyncClientId,
  getPusherStatus,
  PusherStatusInfo
} from './pusherService';

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
    vipCustomers?: VipCustomer[];
    vipOrders?: VipOrder[];
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
const statusCallbacks = new Set<(status: { connected: boolean; userEmail?: string; lastSyncTime: number; pusher?: PusherStatusInfo }) => void>();
let currentStatus: { connected: boolean; userEmail?: string; lastSyncTime: number; pusher?: PusherStatusInfo } = {
  connected: true,
  userEmail: auth.currentUser?.email || undefined,
  lastSyncTime: Date.now(),
  pusher: getPusherStatus()
};

function updateStatus(status: { connected: boolean; userEmail?: string; pusher?: PusherStatusInfo }) {
  currentStatus = {
    ...currentStatus,
    ...status,
    pusher: status.pusher || getPusherStatus(),
    lastSyncTime: Date.now()
  };
  isFirebaseConnected = status.connected;
  statusCallbacks.forEach(cb => {
    try { cb(currentStatus); } catch {}
  });
}

/**
 * Enviar datos locales combinados al servidor Express backend (/api/sync) y Pusher
 * Esto garantiza sincronización en tiempo real inmediata entre computadoras y celulares
 * complementando a Firebase Firestore.
 */
async function postToServerSync(data: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
  operationalExpenses?: OperationalExpense[];
  supplierBills?: SupplierBill[];
  vipCustomers?: VipCustomer[];
  vipOrders?: VipOrder[];
  deletedIds?: Record<string, string[]>;
  skipPusher?: boolean;
}): Promise<any> {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        clientId: getSyncClientId()
      })
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
 * Consulta el servidor backend Express para obtener los últimos datos en tiempo real
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

function applyRemoteDeletedIds(deletedIds?: Record<string, string[]>) {
  if (!deletedIds || typeof deletedIds !== 'object') return;
  if (Array.isArray(deletedIds.tickets)) {
    deletedIds.tickets.forEach(id => markTicketAsDeleted(id));
  }
  if (Array.isArray(deletedIds.orders)) {
    deletedIds.orders.forEach(id => markOrderAsDeleted(id));
  }
  if (Array.isArray(deletedIds.operationalExpenses)) {
    deletedIds.operationalExpenses.forEach(id => markOperationalExpenseAsDeleted(id));
  }
  if (Array.isArray(deletedIds.supplierBills)) {
    deletedIds.supplierBills.forEach(id => markSupplierBillAsDeleted(id));
  }
  if (Array.isArray(deletedIds.vipCustomers)) {
    deletedIds.vipCustomers.forEach(id => markVipCustomerAsDeleted(id));
  }
  if (Array.isArray(deletedIds.vipOrders)) {
    deletedIds.vipOrders.forEach(id => markVipOrderAsDeleted(id));
  }
}

/**
 * Procesa datos remotos recibidos desde Pusher, SSE o servidor y actualiza localStorage y React
 */
function handleIncomingRemoteData(serverData: any) {
  if (!serverData) return;

  if (serverData.deletedIds) {
    applyRemoteDeletedIds(serverData.deletedIds);
  }

  const currentTickets = loadTickets();
  const currentOrders = loadOrders();
  const currentCuts = loadShiftCuts();
  const currentOutflows = loadOutflows();
  const currentCustomers = loadCustomers();
  const currentExpenses = loadOperationalExpenses();
  const currentBills = loadSupplierBills();
  const currentVipCustomers = loadVipCustomers();
  const currentVipOrders = loadVipOrders();

  const mergedTickets = mergeTickets(
    currentTickets,
    Array.isArray(serverData.tickets) ? serverData.tickets : []
  );
  localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(mergedTickets));

  const deletedOrders = getDeletedOrderIds();
  const activeOrders = Array.isArray(serverData.orders)
    ? serverData.orders.filter(
        (o: any) => o && (o.id || o.folio) && !deletedOrders.has(o.id) && !(o.folio && deletedOrders.has(o.folio))
      )
    : [];
  const mergedOrders = mergeOrders(currentOrders, activeOrders);
  localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(mergedOrders));

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

  const mergedExpenses = mergeOperationalExpenses(
    currentExpenses,
    Array.isArray(serverData.operationalExpenses) ? serverData.operationalExpenses : []
  );
  localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(mergedExpenses));

  const mergedBills = mergeSupplierBills(
    currentBills,
    Array.isArray(serverData.supplierBills) ? serverData.supplierBills : []
  );
  localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(mergedBills));

  const mergedVipCustomers = mergeVipCustomers(
    currentVipCustomers,
    Array.isArray(serverData.vipCustomers) ? serverData.vipCustomers : []
  );
  localStorage.setItem(STORAGE_KEYS.VIP_CUSTOMERS, JSON.stringify(mergedVipCustomers));

  const mergedVipOrders = mergeVipOrders(
    currentVipOrders,
    Array.isArray(serverData.vipOrders) ? serverData.vipOrders : []
  );
  localStorage.setItem(STORAGE_KEYS.VIP_ORDERS, JSON.stringify(mergedVipOrders));

  if (Array.isArray(serverData.dailyDeliveries) && serverData.dailyDeliveries.length > 0) {
    serverData.dailyDeliveries.forEach((del: any) => {
      if (!del?.date || !del?.shift || !del?.quantities) return;
      const filteredRemote: Record<string, Record<string, number>> = {};
      for (const [cId, breads] of Object.entries(del.quantities || {})) {
        const hasActiveBreads = Object.values((breads as any) || {}).some(q => Number(q) > 0);
        if (hasActiveBreads) {
          unmarkDeliveryAsDeleted(del.date, del.shift, cId);
          filteredRemote[cId] = breads as Record<string, number>;
        }
      }
      const currentSheet = getDailyDeliverySheet(del.date, del.shift);
      const mergedSheet = mergeDailyDeliverySheets(currentSheet, filteredRemote, del.date, del.shift);
      saveDailyDeliverySheet(del.date, mergedSheet, del.shift);
    });
    window.dispatchEvent(new Event('dailyDeliveryUpdated'));
  }

  notifyListeners({
    tickets: mergedTickets,
    orders: mergedOrders,
    shiftCuts: mergedShiftCuts,
    outflows: mergedOutflows,
    customers: mergedCustomers,
    operationalExpenses: mergedExpenses,
    supplierBills: mergedBills,
    vipCustomers: mergedVipCustomers,
    vipOrders: mergedVipOrders
  });
  updateStatus({ connected: true, userEmail: auth.currentUser?.email || undefined });
}

/**
 * Inicializa la sincronización automática con Firebase + Pusher + servidor Express en tiempo real
 */
export function initFirebaseAutoSync(
  onStatusChange?: (status: { connected: boolean; userEmail?: string; lastSyncTime: number; pusher?: PusherStatusInfo }) => void
): () => void {
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

  // 0. Iniciar Pusher como complemento WebSocket en tiempo real de Firebase
  initPusherClient().catch(() => {});
  onPusherStatusChange((pusherState) => {
    updateStatus({
      connected: currentStatus.connected,
      userEmail: auth.currentUser?.email || undefined,
      pusher: pusherState
    });
  });
  onPusherDelta((delta) => {
    handleIncomingRemoteData(delta);
  });
  onPusherRefresh(() => {
    fetchAndMergeCloud().catch(() => {});
  });
  onPusherCustomEvent((evt) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('santafe:pusher-event', { detail: evt }));
    }
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

  // 3. Empujar datos locales inmediatamente al servidor (sin saturar Pusher en arranque) y traer los de las otras sucursales
  const initialLocalData = {
    tickets: loadTickets(),
    orders: loadOrders(),
    shiftCuts: loadShiftCuts(),
    outflows: loadOutflows(),
    customers: loadCustomers(),
    operationalExpenses: loadOperationalExpenses(),
    supplierBills: loadSupplierBills(),
    vipCustomers: loadVipCustomers(),
    vipOrders: loadVipOrders(),
    skipPusher: true
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
      // También respaldar en el servidor central sin re-disparar Pusher en bucle
      postToServerSync({ tickets: firestoreTickets, skipPusher: true });
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
 * Realiza la sincronización combinada (Merge) con el servidor, Pusher y Firebase Firestore
 * NUNCA sobrescribe datos; combina los tickets, cobros de tarjeta, pedidos, gastos, pagos del viernes y cortes.
 */
export async function syncWithCloud(providedData?: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
  operationalExpenses?: OperationalExpense[];
  supplierBills?: SupplierBill[];
  vipCustomers?: VipCustomer[];
  vipOrders?: VipOrder[];
}): Promise<CloudSyncResult> {
  const currentStoredTickets = loadTickets();
  const localTickets = mergeTickets(currentStoredTickets, providedData?.tickets || []);
  const localOrders = mergeOrders(loadOrders(), providedData?.orders || []);
  const localShiftCuts = mergeShiftCuts(loadShiftCuts(), providedData?.shiftCuts || []);
  const localOutflows = mergeOutflows(loadOutflows(), providedData?.outflows || []);
  const localCustomers = mergeCustomers(loadCustomers(), providedData?.customers || []);
  const localExpenses = mergeOperationalExpenses(loadOperationalExpenses(), providedData?.operationalExpenses || []);
  const localBills = mergeSupplierBills(loadSupplierBills(), providedData?.supplierBills || []);
  const localVipCustomers = mergeVipCustomers(loadVipCustomers(), providedData?.vipCustomers || []);
  const localVipOrders = mergeVipOrders(loadVipOrders(), providedData?.vipOrders || []);

  localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(localTickets));
  localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(localOrders));
  localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(localShiftCuts));
  localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(localOutflows));
  localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(localCustomers));
  localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(localExpenses));
  localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(localBills));
  localStorage.setItem(STORAGE_KEYS.VIP_CUSTOMERS, JSON.stringify(localVipCustomers));
  localStorage.setItem(STORAGE_KEYS.VIP_ORDERS, JSON.stringify(localVipOrders));

  // 1. Enviar de inmediato al servidor Express central + Pusher (solo delta si se proveyó, para velocidad instantánea)
  postToServerSync({
    tickets: providedData?.tickets || localTickets,
    orders: providedData?.orders || localOrders,
    shiftCuts: providedData?.shiftCuts || localShiftCuts,
    outflows: providedData?.outflows || localOutflows,
    customers: providedData?.customers || localCustomers,
    operationalExpenses: providedData?.operationalExpenses || localExpenses,
    supplierBills: providedData?.supplierBills || localBills,
    vipCustomers: providedData?.vipCustomers || localVipCustomers,
    vipOrders: providedData?.vipOrders || localVipOrders
  }).catch(() => {});

  // 2. Respaldar cambios individuales en Firebase Firestore si la cuota no está excedida
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

  if (providedData?.operationalExpenses && providedData.operationalExpenses.length > 0 && !isQuotaExceeded()) {
    for (const exp of providedData.operationalExpenses) {
      saveOperationalExpenseToFirestore(exp).catch(() => {});
    }
  }

  if (providedData?.supplierBills && providedData.supplierBills.length > 0 && !isQuotaExceeded()) {
    for (const bill of providedData.supplierBills) {
      saveSupplierBillToFirestore(bill).catch(() => {});
    }
  }

  if (providedData?.vipCustomers && providedData.vipCustomers.length > 0 && !isQuotaExceeded()) {
    for (const vc of providedData.vipCustomers) {
      saveVipCustomerToFirestore(vc).catch(() => {});
    }
  }

  if (providedData?.vipOrders && providedData.vipOrders.length > 0 && !isQuotaExceeded()) {
    for (const vo of providedData.vipOrders) {
      saveVipOrderToFirestore(vo).catch(() => {});
    }
  }

  const resultData = {
    tickets: localTickets,
    orders: localOrders,
    shiftCuts: localShiftCuts,
    outflows: localOutflows,
    customers: localCustomers,
    operationalExpenses: localExpenses,
    supplierBills: localBills,
    vipCustomers: localVipCustomers,
    vipOrders: localVipOrders
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
 * Propaga eliminaciones en tiempo real vía servidor + Pusher para evitar reapariciones entre dispositivos
 */
export async function notifyCloudDeletion(
  entity: 'tickets' | 'orders' | 'operationalExpenses' | 'supplierBills' | 'vipCustomers' | 'vipOrders',
  ids: string[]
): Promise<void> {
  const cleanIds = (ids || []).filter(Boolean);
  if (cleanIds.length === 0) return;
  await postToServerSync({
    deletedIds: { [entity]: cleanIds }
  });
}

/**
 * Emite actualizaciones de la hoja de reparto diaria por Pusher como complemento a Firestore
 */
export async function broadcastDailyDeliveryPusher(
  date: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  quantities: Record<string, Record<string, number>>
): Promise<void> {
  await broadcastPusherDelta({
    dailyDeliveries: [{ date, shift, quantities }]
  });
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

export function getCloudSyncStatus(): {
  isOnline: boolean;
  isFirebaseConnected: boolean;
  lastSyncTime: number;
  userEmail?: string;
  pusher?: PusherStatusInfo;
} {
  return {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isFirebaseConnected: true,
    userEmail: auth.currentUser?.email || undefined,
    lastSyncTime: currentStatus.lastSyncTime,
    pusher: getPusherStatus()
  };
}

export { signInWithGoogle, logoutFirebase };
