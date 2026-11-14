import {
  SaleTicket,
  BakeryOrder,
  ShiftCutRecord,
  CashOutflowItem,
  Customer,
  OperationalExpense,
  SupplierBill,
  SupplierBankInfo,
  VipCustomer,
  VipOrder,
  DriverDaySettlement
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
  loadSupplierBankProfiles,
  mergeSupplierBankProfiles,
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
  loadDriverSettlements,
  saveDriverSettlements,
  mergeDriverSettlements,
  loadDriverCustomers,
  saveDriverCustomers,
  normalizeDriverCustomerItems,
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
  saveSupplierBankProfileToFirestore,
  saveVipCustomerToFirestore,
  saveVipOrderToFirestore,
  fetchAllDailyDeliveriesFromFirestore,
  fetchOperationalExpensesFromFirestore,
  fetchSupplierBillsFromFirestore,
  fetchSupplierBankProfilesFromFirestore,
  subscribeToFirestoreTickets,
  subscribeToFirestoreOrders,
  subscribeToFirestoreShiftCuts,
  subscribeToFirestoreOutflows,
  subscribeToAllDailyDeliveries,
  subscribeToOperationalExpenses,
  subscribeToSupplierBills,
  subscribeToSupplierBankProfiles,
  saveDriverSettlementToFirestore,
  fetchDriverSettlementsFromFirestore,
  subscribeToDriverSettlements,
  fetchDriverCustomersFromFirestore,
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
    supplierBankProfiles?: SupplierBankInfo[];
    vipCustomers?: VipCustomer[];
    vipOrders?: VipOrder[];
  };
  error?: string;
  isFirebase?: boolean;
}

type SyncListener = (data: Partial<NonNullable<CloudSyncResult['mergedData']>>) => void;
const listeners: Set<SyncListener> = new Set();

export function onCloudSyncUpdated(cb: SyncListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyListeners(data: Partial<NonNullable<CloudSyncResult['mergedData']>>) {
  if (!data || Object.keys(data).length === 0) return;
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

let lastServerVersion: string | null = null;

async function fetchServerVersion(): Promise<string | null> {
  try {
    const res = await fetch('/api/sync?checkOnly=1', { method: 'GET' });
    if (res.ok) {
      const json = await res.json();
      return json.version || null;
    }
  } catch {}
  return null;
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
  supplierBankProfiles?: SupplierBankInfo[];
  vipCustomers?: VipCustomer[];
  vipOrders?: VipOrder[];
  dailyDeliveries?: Array<{
    date: string;
    shift: 'madrugada' | 'manana' | 'tarde';
    quantities: Record<string, Record<string, number>>;
  }>;
  driverSettlements?: DriverDaySettlement[];
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
      if (json.version) {
        lastServerVersion = json.version;
      } else if (json.data?.lastUpdated) {
        lastServerVersion = json.data.lastUpdated;
      }
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
      if (json.version) {
        lastServerVersion = json.version;
      } else if (json.data?.lastUpdated) {
        lastServerVersion = json.data.lastUpdated;
      }
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
 * SOLO escribe y notifica las colecciones que realmente cambiaron.
 */
function handleIncomingRemoteData(serverData: any) {
  if (!serverData) return;

  if (serverData.lastUpdated) {
    lastServerVersion = serverData.lastUpdated;
  }

  const hasDeleted = serverData.deletedIds && typeof serverData.deletedIds === 'object';
  if (hasDeleted) {
    applyRemoteDeletedIds(serverData.deletedIds);
  }

  const changedPayload: Partial<NonNullable<CloudSyncResult['mergedData']>> = {};

  if ((Array.isArray(serverData.tickets) && serverData.tickets.length > 0) || (hasDeleted && Array.isArray(serverData.deletedIds.tickets) && serverData.deletedIds.tickets.length > 0)) {
    const currentTickets = loadTickets();
    const mergedTickets = mergeTickets(
      currentTickets,
      Array.isArray(serverData.tickets) ? serverData.tickets : []
    );
    const prevRaw = JSON.stringify(currentTickets);
    const nextRaw = JSON.stringify(mergedTickets);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.TICKETS, nextRaw);
      changedPayload.tickets = mergedTickets;
    }
  }

  if ((Array.isArray(serverData.orders) && serverData.orders.length > 0) || (hasDeleted && Array.isArray(serverData.deletedIds.orders) && serverData.deletedIds.orders.length > 0)) {
    const currentOrders = loadOrders();
    const deletedOrders = getDeletedOrderIds();
    const activeOrders = Array.isArray(serverData.orders)
      ? serverData.orders.filter(
          (o: any) => o && (o.id || o.folio) && !deletedOrders.has(o.id) && !(o.folio && deletedOrders.has(o.folio))
        )
      : [];
    const mergedOrders = mergeOrders(currentOrders, activeOrders);
    const prevRaw = JSON.stringify(currentOrders);
    const nextRaw = JSON.stringify(mergedOrders);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.ORDERS, nextRaw);
      changedPayload.orders = mergedOrders;
    }
  }

  if (Array.isArray(serverData.shiftCuts) && serverData.shiftCuts.length > 0) {
    const currentCuts = loadShiftCuts();
    const mergedShiftCuts = mergeShiftCuts(currentCuts, serverData.shiftCuts);
    const prevRaw = JSON.stringify(currentCuts);
    const nextRaw = JSON.stringify(mergedShiftCuts);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, nextRaw);
      changedPayload.shiftCuts = mergedShiftCuts;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('shiftCutsUpdated'));
      }
    }
  }

  if (Array.isArray(serverData.outflows) && serverData.outflows.length > 0) {
    const currentOutflows = loadOutflows();
    const mergedOutflows = mergeOutflows(currentOutflows, serverData.outflows);
    const prevRaw = JSON.stringify(currentOutflows);
    const nextRaw = JSON.stringify(mergedOutflows);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.OUTFLOWS, nextRaw);
      changedPayload.outflows = mergedOutflows;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('outflowsUpdated'));
      }
    }
  }

  if (Array.isArray(serverData.customers) && serverData.customers.length > 0) {
    const currentCustomers = loadCustomers();
    const mergedCustomers = mergeCustomers(currentCustomers, serverData.customers);
    const prevRaw = JSON.stringify(currentCustomers);
    const nextRaw = JSON.stringify(mergedCustomers);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, nextRaw);
      changedPayload.customers = mergedCustomers;
    }
  }

  if ((Array.isArray(serverData.operationalExpenses) && serverData.operationalExpenses.length > 0) || (hasDeleted && Array.isArray(serverData.deletedIds.operationalExpenses) && serverData.deletedIds.operationalExpenses.length > 0)) {
    const currentExpenses = loadOperationalExpenses();
    const mergedExpenses = mergeOperationalExpenses(
      currentExpenses,
      Array.isArray(serverData.operationalExpenses) ? serverData.operationalExpenses : []
    );
    const prevRaw = JSON.stringify(currentExpenses);
    const nextRaw = JSON.stringify(mergedExpenses);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, nextRaw);
      changedPayload.operationalExpenses = mergedExpenses;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('expensesUpdated'));
      }
    }
  }

  if ((Array.isArray(serverData.supplierBills) && serverData.supplierBills.length > 0) || (hasDeleted && Array.isArray(serverData.deletedIds.supplierBills) && serverData.deletedIds.supplierBills.length > 0)) {
    const currentBills = loadSupplierBills();
    const mergedBills = mergeSupplierBills(
      currentBills,
      Array.isArray(serverData.supplierBills) ? serverData.supplierBills : []
    );
    const prevRaw = JSON.stringify(currentBills);
    const nextRaw = JSON.stringify(mergedBills);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, nextRaw);
      changedPayload.supplierBills = mergedBills;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('supplierBillsUpdated'));
      }
    }
  }

  if (Array.isArray(serverData.supplierBankProfiles) && serverData.supplierBankProfiles.length > 0) {
    const currentBankProfiles = loadSupplierBankProfiles();
    const mergedBankProfiles = mergeSupplierBankProfiles(currentBankProfiles, serverData.supplierBankProfiles);
    const prevRaw = JSON.stringify(currentBankProfiles);
    const nextRaw = JSON.stringify(mergedBankProfiles);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, nextRaw);
      changedPayload.supplierBankProfiles = mergedBankProfiles;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('supplierBankProfilesUpdated'));
      }
    }
  }

  if ((Array.isArray(serverData.vipCustomers) && serverData.vipCustomers.length > 0) || (hasDeleted && Array.isArray(serverData.deletedIds.vipCustomers) && serverData.deletedIds.vipCustomers.length > 0)) {
    const currentVipCustomers = loadVipCustomers();
    const mergedVipCustomers = mergeVipCustomers(
      currentVipCustomers,
      Array.isArray(serverData.vipCustomers) ? serverData.vipCustomers : []
    );
    const prevRaw = JSON.stringify(currentVipCustomers);
    const nextRaw = JSON.stringify(mergedVipCustomers);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.VIP_CUSTOMERS, nextRaw);
      changedPayload.vipCustomers = mergedVipCustomers;
    }
  }

  if ((Array.isArray(serverData.vipOrders) && serverData.vipOrders.length > 0) || (hasDeleted && Array.isArray(serverData.deletedIds.vipOrders) && serverData.deletedIds.vipOrders.length > 0)) {
    const currentVipOrders = loadVipOrders();
    const mergedVipOrders = mergeVipOrders(
      currentVipOrders,
      Array.isArray(serverData.vipOrders) ? serverData.vipOrders : []
    );
    const prevRaw = JSON.stringify(currentVipOrders);
    const nextRaw = JSON.stringify(mergedVipOrders);
    if (prevRaw !== nextRaw) {
      localStorage.setItem(STORAGE_KEYS.VIP_ORDERS, nextRaw);
      changedPayload.vipOrders = mergedVipOrders;
    }
  }

  if (Array.isArray(serverData.dailyDeliveries) && serverData.dailyDeliveries.length > 0) {
    let anyDeliveryChanged = false;
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
      if (JSON.stringify(currentSheet) !== JSON.stringify(mergedSheet)) {
        saveDailyDeliverySheet(del.date, mergedSheet, del.shift);
        anyDeliveryChanged = true;
      }
    });
    if (anyDeliveryChanged && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('dailyDeliveryUpdated'));
    }
  }

  if (Array.isArray(serverData.driverSettlements) && serverData.driverSettlements.length > 0) {
    const currentSettlements = loadDriverSettlements();
    const mergedSettlements = mergeDriverSettlements(currentSettlements, serverData.driverSettlements);
    if (JSON.stringify(currentSettlements) !== JSON.stringify(mergedSettlements)) {
      saveDriverSettlements(mergedSettlements);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('driverSettlementsUpdated'));
      }
    }
  }

  if (Object.keys(changedPayload).length > 0) {
    notifyListeners(changedPayload);
  }
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
      const myClientId = getSyncClientId();
      const evtSource = new EventSource('/api/sync/events');
      evtSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed?.version) {
            if (parsed.sourceClientId && parsed.sourceClientId === myClientId) {
              lastServerVersion = parsed.version;
              return;
            }
          }
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
    supplierBankProfiles: loadSupplierBankProfiles(),
    vipCustomers: loadVipCustomers(),
    vipOrders: loadVipOrders(),
    skipPusher: true
  };
  postToServerSync(initialLocalData).then(remoteMerged => {
    if (remoteMerged) {
      handleIncomingRemoteData(remoteMerged);
    }
  });

  // 4. Polling ultra-ligero (?checkOnly=1 = ~90 bytes) cada 7 segundos:
  //    Solo descarga /api/sync si el version hash del servidor cambió respecto a lastServerVersion.
  const checkAndSyncServerIfChanged = async () => {
    try {
      const serverVer = await fetchServerVersion();
      if (serverVer && serverVer === lastServerVersion) {
        return;
      }
      const freshRemote = await fetchFromServerSync();
      if (freshRemote) {
        handleIncomingRemoteData(freshRemote);
      }
    } catch {}
  };

  const pollInterval = setInterval(checkAndSyncServerIfChanged, 7000);

  // Escuchar cuando el usuario regresa a la pestaña (visibilidad activa en el teléfono)
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      checkAndSyncServerIfChanged();
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  // 5. Escuchar tickets de Firestore en tiempo real (canal principal en la nube)
  subscribeToFirestoreTickets((firestoreTickets) => {
    updateStatus({
      connected: true,
      userEmail: auth.currentUser?.email || undefined
    });
    if (firestoreTickets && firestoreTickets.length > 0) {
      const current = loadTickets();
      const existingIds = new Set(current.map(t => t.id || t.folio));
      const newTicketsOnly = firestoreTickets.filter(t => !existingIds.has(t.id || t.folio));
      const merged = mergeTickets(current, firestoreTickets);
      const prevRaw = JSON.stringify(current);
      const nextRaw = JSON.stringify(merged);
      if (prevRaw !== nextRaw) {
        localStorage.setItem(STORAGE_KEYS.TICKETS, nextRaw);
        if (newTicketsOnly.length > 0) {
          postToServerSync({ tickets: newTicketsOnly, skipPusher: true });
        }
        notifyListeners({ tickets: merged });
      }
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
      const prevRaw = JSON.stringify(current);
      const nextRaw = JSON.stringify(merged);
      if (prevRaw !== nextRaw) {
        localStorage.setItem(STORAGE_KEYS.ORDERS, nextRaw);
        notifyListeners({ orders: merged });
      }
    }
  });

  // 7. Escuchar cortes de turno de Firestore
  subscribeToFirestoreShiftCuts((firestoreCuts) => {
    if (firestoreCuts && firestoreCuts.length > 0) {
      const current = loadShiftCuts();
      const merged = mergeShiftCuts(current, firestoreCuts);
      const prevRaw = JSON.stringify(current);
      const nextRaw = JSON.stringify(merged);
      if (prevRaw !== nextRaw) {
        localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, nextRaw);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('shiftCutsUpdated'));
        }
        notifyListeners({ shiftCuts: merged });
      }
    }
  });

  // 8. Escuchar salidas de dinero de Firestore
  subscribeToFirestoreOutflows((firestoreOutflows) => {
    if (firestoreOutflows && firestoreOutflows.length > 0) {
      const current = loadOutflows();
      const merged = mergeOutflows(current, firestoreOutflows);
      const prevRaw = JSON.stringify(current);
      const nextRaw = JSON.stringify(merged);
      if (prevRaw !== nextRaw) {
        localStorage.setItem(STORAGE_KEYS.OUTFLOWS, nextRaw);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('outflowsUpdated'));
        }
        notifyListeners({ outflows: merged });
      }
    }
  });

  // 9. Escuchar hojas de reparto en tiempo real
  subscribeToAllDailyDeliveries((deliveries) => {
    if (deliveries && deliveries.length > 0) {
      let anyChanged = false;
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
        if (JSON.stringify(current) !== JSON.stringify(merged)) {
          saveDailyDeliverySheet(del.date, merged, del.shift);
          anyChanged = true;
        }
      });
      if (anyChanged && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('dailyDeliveryUpdated'));
      }
    }
  });

  // 10. Escuchar gastos operativos
  subscribeToOperationalExpenses((expenses) => {
    if (expenses && expenses.length >= 0) {
      const current = loadOperationalExpenses();
      const merged = mergeOperationalExpenses(current, expenses);
      const prevRaw = JSON.stringify(current);
      const nextRaw = JSON.stringify(merged);
      if (prevRaw !== nextRaw) {
        localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, nextRaw);
        notifyListeners({ operationalExpenses: merged });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('expensesUpdated'));
        }
      }
    }
  });

  // 11. Escuchar proveedores
  subscribeToSupplierBills((bills) => {
    if (bills && bills.length >= 0) {
      const current = loadSupplierBills();
      const merged = mergeSupplierBills(current, bills);
      const prevRaw = JSON.stringify(current);
      const nextRaw = JSON.stringify(merged);
      if (prevRaw !== nextRaw) {
        localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, nextRaw);
        notifyListeners({ supplierBills: merged });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('supplierBillsUpdated'));
        }
      }
    }
  });

  // 12. Escuchar perfiles bancarios de proveedores
  subscribeToSupplierBankProfiles((profiles) => {
    if (profiles && profiles.length >= 0) {
      const current = loadSupplierBankProfiles();
      const merged = mergeSupplierBankProfiles(current, profiles);
      const prevRaw = JSON.stringify(current);
      const nextRaw = JSON.stringify(merged);
      if (prevRaw !== nextRaw) {
        localStorage.setItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, nextRaw);
        notifyListeners({ supplierBankProfiles: merged });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('supplierBankProfilesUpdated'));
        }
      }
    }
  });

  // 13. Escuchar estados de liquidación diaria por repartidor
  subscribeToDriverSettlements((settlements) => {
    if (settlements && settlements.length >= 0) {
      const current = loadDriverSettlements();
      const merged = mergeDriverSettlements(current, settlements);
      if (JSON.stringify(current) !== JSON.stringify(merged)) {
        saveDriverSettlements(merged);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('driverSettlementsUpdated'));
        }
      }
    }
  });

  return () => {
    clearInterval(pollInterval);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
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
  supplierBankProfiles?: SupplierBankInfo[];
  vipCustomers?: VipCustomer[];
  vipOrders?: VipOrder[];
}): Promise<CloudSyncResult> {
  const isDeltaOnly = Boolean(providedData);
  const changedPayload: Partial<NonNullable<CloudSyncResult['mergedData']>> = {};

  const localTickets = !isDeltaOnly || providedData?.tickets
    ? mergeTickets(loadTickets(), providedData?.tickets || [])
    : loadTickets();
  if (!isDeltaOnly || providedData?.tickets) {
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(localTickets));
    if (providedData?.tickets) changedPayload.tickets = localTickets;
  }

  const localOrders = !isDeltaOnly || providedData?.orders
    ? mergeOrders(loadOrders(), providedData?.orders || [])
    : loadOrders();
  if (!isDeltaOnly || providedData?.orders) {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(localOrders));
    if (providedData?.orders) changedPayload.orders = localOrders;
  }

  const localShiftCuts = !isDeltaOnly || providedData?.shiftCuts
    ? mergeShiftCuts(loadShiftCuts(), providedData?.shiftCuts || [])
    : loadShiftCuts();
  if (!isDeltaOnly || providedData?.shiftCuts) {
    localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(localShiftCuts));
    if (providedData?.shiftCuts) changedPayload.shiftCuts = localShiftCuts;
  }

  const localOutflows = !isDeltaOnly || providedData?.outflows
    ? mergeOutflows(loadOutflows(), providedData?.outflows || [])
    : loadOutflows();
  if (!isDeltaOnly || providedData?.outflows) {
    localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(localOutflows));
    if (providedData?.outflows) changedPayload.outflows = localOutflows;
  }

  const localCustomers = !isDeltaOnly || providedData?.customers
    ? mergeCustomers(loadCustomers(), providedData?.customers || [])
    : loadCustomers();
  if (!isDeltaOnly || providedData?.customers) {
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(localCustomers));
    if (providedData?.customers) changedPayload.customers = localCustomers;
  }

  const localExpenses = !isDeltaOnly || providedData?.operationalExpenses
    ? mergeOperationalExpenses(loadOperationalExpenses(), providedData?.operationalExpenses || [])
    : loadOperationalExpenses();
  if (!isDeltaOnly || providedData?.operationalExpenses) {
    localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(localExpenses));
    if (providedData?.operationalExpenses) changedPayload.operationalExpenses = localExpenses;
  }

  const localBills = !isDeltaOnly || providedData?.supplierBills
    ? mergeSupplierBills(loadSupplierBills(), providedData?.supplierBills || [])
    : loadSupplierBills();
  if (!isDeltaOnly || providedData?.supplierBills) {
    localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(localBills));
    if (providedData?.supplierBills) changedPayload.supplierBills = localBills;
  }

  const localBankProfiles = !isDeltaOnly || providedData?.supplierBankProfiles
    ? mergeSupplierBankProfiles(loadSupplierBankProfiles(), providedData?.supplierBankProfiles || [])
    : loadSupplierBankProfiles();
  if (!isDeltaOnly || providedData?.supplierBankProfiles) {
    localStorage.setItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, JSON.stringify(localBankProfiles));
    if (providedData?.supplierBankProfiles) changedPayload.supplierBankProfiles = localBankProfiles;
  }

  const localVipCustomers = !isDeltaOnly || providedData?.vipCustomers
    ? mergeVipCustomers(loadVipCustomers(), providedData?.vipCustomers || [])
    : loadVipCustomers();
  if (!isDeltaOnly || providedData?.vipCustomers) {
    localStorage.setItem(STORAGE_KEYS.VIP_CUSTOMERS, JSON.stringify(localVipCustomers));
    if (providedData?.vipCustomers) changedPayload.vipCustomers = localVipCustomers;
  }

  const localVipOrders = !isDeltaOnly || providedData?.vipOrders
    ? mergeVipOrders(loadVipOrders(), providedData?.vipOrders || [])
    : loadVipOrders();
  if (!isDeltaOnly || providedData?.vipOrders) {
    localStorage.setItem(STORAGE_KEYS.VIP_ORDERS, JSON.stringify(localVipOrders));
    if (providedData?.vipOrders) changedPayload.vipOrders = localVipOrders;
  }

  // 1. Enviar de inmediato al servidor Express central + Pusher (solo delta si se proveyó, para velocidad instantánea)
  postToServerSync(
    isDeltaOnly
      ? { ...providedData }
      : {
          tickets: localTickets,
          orders: localOrders,
          shiftCuts: localShiftCuts,
          outflows: localOutflows,
          customers: localCustomers,
          operationalExpenses: localExpenses,
          supplierBills: localBills,
          supplierBankProfiles: localBankProfiles,
          vipCustomers: localVipCustomers,
          vipOrders: localVipOrders
        }
  ).catch(() => {});

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

  if (providedData?.supplierBankProfiles && providedData.supplierBankProfiles.length > 0 && !isQuotaExceeded()) {
    for (const prof of providedData.supplierBankProfiles) {
      saveSupplierBankProfileToFirestore(prof).catch(() => {});
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
    supplierBankProfiles: localBankProfiles,
    vipCustomers: localVipCustomers,
    vipOrders: localVipOrders
  };

  notifyListeners(isDeltaOnly ? changedPayload : resultData);
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
 * Emite actualizaciones de la hoja de reparto diaria por Pusher y servidor central como complemento a Firestore
 */
export async function broadcastDailyDeliveryPusher(
  date: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  quantities: Record<string, Record<string, number>>
): Promise<void> {
  const payload = [{ date, shift, quantities }];
  await Promise.allSettled([
    postToServerSync({ dailyDeliveries: payload }),
    broadcastPusherDelta({ dailyDeliveries: payload })
  ]);
}

export async function saveDriverSettlementToCloud(
  settlement: DriverDaySettlement
): Promise<void> {
  await Promise.allSettled([
    saveDriverSettlementToFirestore(settlement),
    postToServerSync({ driverSettlements: [settlement] }),
    broadcastPusherDelta({ driverSettlements: [settlement] })
  ]);
}

/**
 * Sincroniza hojas de reparto desde Servidor (Pusher/SSE) + Firestore para poder consultar cualquier día/semana desde cualquier lugar
 */
export async function syncDailyDeliveriesFromCloud(dates?: string[]): Promise<boolean> {
  try {
    let changed = false;
    const serverData = await fetchFromServerSync();
    if (serverData && Array.isArray(serverData.dailyDeliveries) && serverData.dailyDeliveries.length > 0) {
      handleIncomingRemoteData({ dailyDeliveries: serverData.dailyDeliveries });
      changed = true;
    }
    if (serverData && Array.isArray(serverData.driverSettlements) && serverData.driverSettlements.length > 0) {
      handleIncomingRemoteData({ driverSettlements: serverData.driverSettlements });
      changed = true;
    }

    const [remoteAll, remoteSettlements, remoteDriverCustomers] = await Promise.all([
      fetchAllDailyDeliveriesFromFirestore().catch(() => []),
      fetchDriverSettlementsFromFirestore().catch(() => []),
      fetchDriverCustomersFromFirestore().catch(() => [])
    ]);
    if (remoteDriverCustomers && remoteDriverCustomers.length > 0) {
      const localCustomers = loadDriverCustomers();
      const map = new Map<string, any>();
      localCustomers.forEach(c => { if (c?.id) map.set(c.id, normalizeDriverCustomerItems(c)); });
      remoteDriverCustomers.forEach(c => {
        if (c?.id) {
          map.set(c.id, normalizeDriverCustomerItems({ ...(map.get(c.id) || {}), ...c }));
        }
      });
      saveDriverCustomers(Array.from(map.values()));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('driverCustomersUpdated'));
      }
      changed = true;
    }
    if (remoteSettlements && remoteSettlements.length > 0) {
      const mergedSettlements = mergeDriverSettlements(loadDriverSettlements(), remoteSettlements);
      saveDriverSettlements(mergedSettlements);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('driverSettlementsUpdated'));
      }
      changed = true;
    }
    if (remoteAll && remoteAll.length > 0) {
      remoteAll.forEach(del => {
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
      changed = true;
    }

    if (dates && dates.length > 0 && dates.length <= 14) {
      const { fetchDailyDeliveryFromFirestore } = await import('./firebase');
      const shifts: Array<'madrugada' | 'manana' | 'tarde'> = ['madrugada', 'manana', 'tarde'];
      await Promise.all(
        dates.flatMap(dStr =>
          shifts.map(async sh => {
            const q = await fetchDailyDeliveryFromFirestore(dStr, sh).catch(() => null);
            if (q) {
              const current = getDailyDeliverySheet(dStr, sh);
              const merged = mergeDailyDeliverySheets(current, q, dStr, sh);
              saveDailyDeliverySheet(dStr, merged, sh);
              changed = true;
            }
          })
        )
      );
    }

    if (changed && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('dailyDeliveryUpdated'));
    }
    updateStatus({ connected: true, userEmail: auth.currentUser?.email || undefined });
    return true;
  } catch {
    return false;
  }
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
      const [remoteDeliveries, remoteExpenses, remoteBills, remoteBankProfiles] = await Promise.all([
        fetchAllDailyDeliveriesFromFirestore().catch(() => []),
        fetchOperationalExpensesFromFirestore().catch(() => []),
        fetchSupplierBillsFromFirestore().catch(() => []),
        fetchSupplierBankProfilesFromFirestore().catch(() => [])
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

      if (remoteBankProfiles && remoteBankProfiles.length > 0) {
        const curBank = loadSupplierBankProfiles();
        const merged = mergeSupplierBankProfiles(curBank, remoteBankProfiles);
        localStorage.setItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, JSON.stringify(merged));
        window.dispatchEvent(new Event('supplierBankProfilesUpdated'));
      }
    } catch {}

    const localTickets = loadTickets();
    const localOrders = loadOrders();
    const localShiftCuts = loadShiftCuts();
    const localOutflows = loadOutflows();
    const localCustomers = loadCustomers();
    const localExpenses = loadOperationalExpenses();
    const localBills = loadSupplierBills();
    const localBankProfiles = loadSupplierBankProfiles();

    const resultData = {
      tickets: localTickets,
      orders: localOrders,
      shiftCuts: localShiftCuts,
      outflows: localOutflows,
      customers: localCustomers,
      operationalExpenses: localExpenses,
      supplierBills: localBills,
      supplierBankProfiles: localBankProfiles
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
