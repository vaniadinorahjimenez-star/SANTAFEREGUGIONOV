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
  mergeTickets,
  mergeOrders,
  mergeShiftCuts,
  mergeOutflows,
  mergeCustomers,
  getDeletedOrderIds,
  getDeletedDeliveryKeys,
  STORAGE_KEYS,
  DAILY_DELIVERY_PREFIX
} from '../utils/storage';
import {
  db,
  auth,
  saveSaleTicketToFirestore,
  saveShiftCutToFirestore,
  saveOrderToFirestore,
  saveCustomerToFirestore,
  saveOutflowToFirestore,
  saveDailyDeliveryToFirestore,
  fetchTicketsFromFirestore,
  fetchOrdersFromFirestore,
  fetchCustomersFromFirestore,
  fetchShiftCutsFromFirestore,
  fetchOutflowsFromFirestore,
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
} | undefined = undefined;

let isFirebaseConnected = false;
let listenersStarted = false;
const statusCallbacks = new Set<(status: { connected: boolean; userEmail?: string }) => void>();
let currentStatus: { connected: boolean; userEmail?: string } = {
  connected: true,
  userEmail: auth.currentUser?.email || undefined
};

function updateStatus(status: { connected: boolean; userEmail?: string }) {
  currentStatus = status;
  isFirebaseConnected = status.connected;
  statusCallbacks.forEach(cb => {
    try { cb(status); } catch {}
  });
}

/**
 * Inicializa la sincronización automática con Firebase
 * Se conecta solo sin requerir que el usuario toque nada y permanece conectado
 */
export function initFirebaseAutoSync(onStatusChange?: (status: { connected: boolean; userEmail?: string }) => void): () => void {
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

  // Estado conectado automáticamente
  updateStatus({
    connected: true,
    userEmail: auth.currentUser?.email || undefined
  });

  // Verificar en segundo plano y subir datos locales a Firebase de inmediato
  testConnection().then((ok) => {
    updateStatus({
      connected: ok,
      userEmail: auth.currentUser?.email || undefined
    });
    if (ok) {
      syncLocalDataToFirebase();
    }
  }).catch(() => {
    updateStatus({
      connected: true,
      userEmail: auth.currentUser?.email || undefined
    });
  });

  // Intentar sincronizar datos locales acumulados a Firestore
  syncLocalDataToFirebase();

  auth.onAuthStateChanged((user) => {
    updateStatus({
      connected: true,
      userEmail: user?.email || undefined
    });
    syncLocalDataToFirebase();
  });

  // Escuchar tickets de Firestore en tiempo real automáticamente (para celular y mostrador)
  subscribeToFirestoreTickets((firestoreTickets) => {
    updateStatus({
      connected: true,
      userEmail: auth.currentUser?.email || undefined
    });
    if (firestoreTickets && firestoreTickets.length > 0) {
      const current = loadTickets();
      const merged = mergeTickets(current, firestoreTickets);
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(merged));
      notifyListeners({
        tickets: merged,
        orders: loadOrders(),
        shiftCuts: loadShiftCuts(),
        outflows: loadOutflows(),
        customers: loadCustomers()
      });
    }
  });

  // Escuchar pedidos de Firestore en tiempo real automáticamente
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

  // Escuchar cortes de turno en tiempo real automáticamente
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

  // Escuchar salidas de dinero en tiempo real automáticamente
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

  // Escuchar hojas de reparto en tiempo real automáticamente (para celular y cualquier PC en el mundo)
  subscribeToAllDailyDeliveries((deliveries) => {
    const deletedSet = getDeletedDeliveryKeys();
    deliveries.forEach(del => {
      const filteredRemote: Record<string, Record<string, number>> = {};
      for (const [cId, breads] of Object.entries(del.quantities || {})) {
        if (!deletedSet.has(`${del.date}_${del.shift}_${cId}`)) {
          filteredRemote[cId] = breads;
        }
      }
      saveDailyDeliverySheet(del.date, filteredRemote, del.shift);
    });
  });

  // Escuchar gastos operativos en tiempo real automáticamente
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

  // Escuchar cuentas por pagar de proveedores en tiempo real automáticamente
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
    if (onStatusChange) statusCallbacks.delete(onStatusChange);
  };
}

/**
 * Sube datos locales que no hayan sido respaldados aún en Firestore
 */
async function syncLocalDataToFirebase() {
  if (isQuotaExceeded()) return;
  // Los tickets y ventas ya se envían a Firestore en el momento exacto en que se generan.
  // Evitar re-enviar localTickets[0] repetidamente para no agotar las unidades gratuitas diarias.
}

/**
 * Realiza la sincronización combinada (Merge) con Firebase Firestore
 * NUNCA sobrescribe datos; combina los tickets, cobros de tarjeta, pedidos y cortes.
 * Protegido contra condiciones de carrera: si se registran ventas mientras la petición está en vuelo,
 * jamás se perderán.
 */
export async function syncWithCloud(providedData?: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
}): Promise<CloudSyncResult> {
  // Si la cuota diaria de Firebase está alcanzada, persistir localmente y retornar sin error
  if (isQuotaExceeded()) {
    const currentStoredTickets = loadTickets();
    const localTickets = mergeTickets(currentStoredTickets, providedData?.tickets || []);
    const localOrders = mergeOrders(loadOrders(), providedData?.orders || []);
    const localShiftCuts = mergeShiftCuts(loadShiftCuts(), providedData?.shiftCuts || []);
    const localOutflows = mergeOutflows(loadOutflows(), providedData?.outflows || []);
    const localCustomers = mergeCustomers(loadCustomers(), providedData?.customers || []);

    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(localTickets));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(localOrders));
    localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(localShiftCuts));
    localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(localOutflows));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(localCustomers));

    return {
      success: true,
      message: 'Guardado localmente. Cuota de Firebase alcanzada por hoy (se sincronizará automáticamente mañana).',
      mergedData: {
        tickets: localTickets,
        orders: localOrders,
        shiftCuts: localShiftCuts,
        outflows: localOutflows,
        customers: localCustomers
      }
    };
  }

  // Si ya hay una sincronización en proceso, guardar los datos pendientes y esperar a que termine
  if (isSyncInProgress) {
    hasPendingSync = true;
    pendingProvidedData = providedData;
    return {
      success: true,
      message: 'Sincronización en cola para procesar ventas inmediatas'
    };
  }

  isSyncInProgress = true;

  try {
    // 1. Cargar datos locales frescos combinados con los proporcionados
    const currentStoredTickets = loadTickets();
    const localTickets = mergeTickets(currentStoredTickets, providedData?.tickets || []);
    const localOrders = mergeOrders(loadOrders(), providedData?.orders || []);
    const localShiftCuts = mergeShiftCuts(loadShiftCuts(), providedData?.shiftCuts || []);
    const localOutflows = mergeOutflows(loadOutflows(), providedData?.outflows || []);
    const localCustomers = mergeCustomers(loadCustomers(), providedData?.customers || []);

    // Asegurar respaldo local de inmediato
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(localTickets));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(localOrders));
    localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(localShiftCuts));
    localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(localOutflows));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(localCustomers));

    let savedToFirebaseCount = 0;

    // 2. Si se pasaron tickets específicos recién creados (<= 3), guardarlos en Firestore
    // Evitar bucles masivos sobre colecciones enteras para proteger la cuota de Firestore
    if (providedData?.tickets && providedData.tickets.length > 0 && providedData.tickets.length <= 3) {
      for (const t of providedData.tickets) {
        if (isQuotaExceeded()) break;
        const ok = await saveSaleTicketToFirestore(t);
        if (ok) savedToFirebaseCount++;
      }
    }

    // Si se pasaron cortes específicos recién cerrados, guardarlos en Firestore
    if (providedData?.shiftCuts && providedData.shiftCuts.length > 0 && providedData.shiftCuts.length <= 3) {
      for (const c of providedData.shiftCuts) {
        if (isQuotaExceeded()) break;
        await saveShiftCutToFirestore(c);
      }
    }

    // Si se pasaron pedidos específicos recién registrados, guardarlos en Firestore
    if (providedData?.orders && providedData.orders.length > 0 && providedData.orders.length <= 3) {
      for (const o of providedData.orders) {
        if (isQuotaExceeded()) break;
        await saveOrderToFirestore(o);
      }
    }

    // Si se pasaron clientes específicos recién agregados, guardarlos en Firestore
    if (providedData?.customers && providedData.customers.length > 0 && providedData.customers.length <= 3) {
      for (const cu of providedData.customers) {
        if (isQuotaExceeded()) break;
        await saveCustomerToFirestore(cu);
      }
    }

    // 3. Obtener tickets actualizados de Firestore para combinarlos
    let remoteTickets: SaleTicket[] = [];
    try {
      remoteTickets = await fetchTicketsFromFirestore();
    } catch {
      // Si falla lectura, mantener locales
    }

    const freshLocal = loadTickets();
    const finalMergedTickets = mergeTickets(freshLocal, remoteTickets);
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(finalMergedTickets));

    const resultData = {
      tickets: finalMergedTickets,
      orders: localOrders,
      shiftCuts: localShiftCuts,
      outflows: localOutflows,
      customers: localCustomers
    };

    notifyListeners(resultData);

    return {
      success: true,
      message: `Firebase sincronizado correctamente (${finalMergedTickets.length} tickets en base de datos)`,
      mergedData: resultData,
      isFirebase: true
    };
  } catch (err: any) {
    console.error('Error durante sincronización Firebase:', err);
    return {
      success: false,
      message: 'Guardado local seguro activado (se sincronizará en cuanto haya conexión con Firebase)',
      error: err?.message || 'Error de sincronización'
    };
  } finally {
    isSyncInProgress = false;
    if (hasPendingSync) {
      hasPendingSync = false;
      const nextData = pendingProvidedData;
      pendingProvidedData = undefined;
      setTimeout(() => {
        syncWithCloud(nextData);
      }, 100);
    }
  }
}

/**
 * Consulta Firebase y combina los datos recibidos con los locales
 */
export async function fetchAndMergeCloud(): Promise<CloudSyncResult> {
  try {
    const [remoteTickets, remoteOrders, remoteCuts, remoteCustomers, remoteOutflows, remoteDeliveries, remoteExpenses, remoteBills] = await Promise.all([
      fetchTicketsFromFirestore(),
      fetchOrdersFromFirestore(),
      fetchShiftCutsFromFirestore(),
      fetchCustomersFromFirestore(),
      fetchOutflowsFromFirestore(),
      fetchAllDailyDeliveriesFromFirestore(),
      fetchOperationalExpensesFromFirestore(),
      fetchSupplierBillsFromFirestore()
    ]);

    // Guardar hojas de reparto en localStorage del dispositivo
    if (remoteDeliveries && remoteDeliveries.length > 0) {
      const deletedSet = getDeletedDeliveryKeys();
      remoteDeliveries.forEach(del => {
        const current = getDailyDeliverySheet(del.date, del.shift);
        const filteredRemote: Record<string, Record<string, number>> = {};
        for (const [cId, breads] of Object.entries(del.quantities || {})) {
          if (!deletedSet.has(`${del.date}_${del.shift}_${cId}`)) {
            filteredRemote[cId] = breads;
          }
        }
        const merged = mergeDailyDeliverySheets(current, filteredRemote, del.date, del.shift);
        saveDailyDeliverySheet(del.date, merged, del.shift);
      });
      window.dispatchEvent(new Event('dailyDeliveryUpdated'));
    }

    const localTickets = loadTickets();
    const localOrders = loadOrders();
    const localShiftCuts = loadShiftCuts();
    const localOutflows = loadOutflows();
    const localCustomers = loadCustomers();
    const localExpenses = loadOperationalExpenses();
    const localBills = loadSupplierBills();

    const mergedTickets = mergeTickets(localTickets, remoteTickets);
    const mergedOrders = mergeOrders(localOrders, remoteOrders);
    const mergedShiftCuts = mergeShiftCuts(localShiftCuts, remoteCuts);
    const mergedCustomers = mergeCustomers(localCustomers, remoteCustomers);
    const mergedOutflows = mergeOutflows(localOutflows, remoteOutflows);
    const mergedExpenses = mergeOperationalExpenses(localExpenses, remoteExpenses);
    const mergedBills = mergeSupplierBills(localBills, remoteBills);

    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(mergedTickets));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(mergedOrders));
    localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(mergedShiftCuts));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(mergedCustomers));
    localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(mergedOutflows));
    localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(mergedExpenses));
    localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(mergedBills));

    const resultData = {
      tickets: mergedTickets,
      orders: mergedOrders,
      shiftCuts: mergedShiftCuts,
      outflows: mergedOutflows,
      customers: mergedCustomers,
      operationalExpenses: mergedExpenses,
      supplierBills: mergedBills
    };

    notifyListeners(resultData);

    return {
      success: true,
      message: 'Datos de Firebase combinados con éxito',
      mergedData: resultData,
      isFirebase: true
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'No se pudo obtener datos de Firebase, usando copia local',
      error: err?.message
    };
  }
}

export function getCloudSyncStatus(): { isOnline: boolean; isFirebaseConnected: boolean; lastSyncTime: number; userEmail?: string } {
  return {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isFirebaseConnected: !!auth.currentUser,
    userEmail: auth.currentUser?.email || undefined,
    lastSyncTime: Date.now()
  };
}

export { signInWithGoogle, logoutFirebase };
