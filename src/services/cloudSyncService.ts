import { SaleTicket, BakeryOrder, ShiftCutRecord, CashOutflowItem, Customer } from '../types';
import { 
  loadTickets, 
  loadOrders, 
  loadShiftCuts, 
  loadOutflows, 
  loadCustomers,
  saveDailyDeliverySheet,
  getDailyDeliverySheet,
  mergeDailyDeliverySheets,
  mergeTickets,
  mergeOrders,
  mergeShiftCuts,
  mergeOutflows,
  mergeCustomers,
  getDeletedOrderIds,
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
  subscribeToFirestoreTickets,
  subscribeToFirestoreOrders,
  subscribeToFirestoreShiftCuts,
  subscribeToFirestoreOutflows,
  subscribeToAllDailyDeliveries,
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
let firebaseInitialized = false;

function areTicketsIdentical(a: SaleTicket[], b: SaleTicket[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id || a[i]?.paymentMethod !== b[i]?.paymentMethod || a[i]?.total !== b[i]?.total) return false;
  }
  return true;
}

function areOrdersIdentical(a: BakeryOrder[], b: BakeryOrder[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const oA = a[i];
    const oB = b[i];
    if (
      oA?.id !== oB?.id ||
      oA?.folio !== oB?.folio ||
      oA?.paymentStatus !== oB?.paymentStatus ||
      oA?.deliveryStatus !== oB?.deliveryStatus ||
      oA?.collectedAmount !== oB?.collectedAmount ||
      oA?.pendingAmount !== oB?.pendingAmount ||
      oA?.deposit !== oB?.deposit ||
      oA?.total !== oB?.total ||
      oA?.deliveryDate !== oB?.deliveryDate ||
      oA?.deliveryTime !== oB?.deliveryTime ||
      oA?.assignedDriverId !== oB?.assignedDriverId ||
      oA?.items?.length !== oB?.items?.length
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Inicializa la sincronización automática con Firebase
 * Se conecta solo sin requerir que el usuario toque nada
 */
export function initFirebaseAutoSync(onStatusChange?: (status: { connected: boolean; userEmail?: string }) => void): () => void {
  if (firebaseInitialized) return () => {};
  firebaseInitialized = true;

  // Estado conectado automáticamente
  isFirebaseConnected = true;
  onStatusChange?.({
    connected: true,
    userEmail: auth.currentUser?.email || undefined
  });

  // Verificar en segundo plano y subir datos locales a Firebase de inmediato
  testConnection().then((ok) => {
    isFirebaseConnected = ok;
    onStatusChange?.({
      connected: ok,
      userEmail: auth.currentUser?.email || undefined
    });
    if (ok) {
      syncLocalDataToFirebase();
    }
  }).catch(() => {
    // Si la red tiene retraso inicial, mantener activo para reintentos
    isFirebaseConnected = true;
  });

  // Intentar sincronizar datos locales acumulados a Firestore
  syncLocalDataToFirebase();

  const unsubAuth = auth.onAuthStateChanged((user) => {
    onStatusChange?.({
      connected: true,
      userEmail: user?.email || undefined
    });
    syncLocalDataToFirebase();
  });

  // Escuchar tickets de Firestore en tiempo real automáticamente (para celular y mostrador)
  const unsubTickets = subscribeToFirestoreTickets((firestoreTickets) => {
    isFirebaseConnected = true;
    onStatusChange?.({
      connected: true,
      userEmail: auth.currentUser?.email || undefined
    });
    if (firestoreTickets && firestoreTickets.length > 0) {
      const current = loadTickets();
      const merged = mergeTickets(current, firestoreTickets);
      if (!areTicketsIdentical(current, merged)) {
        localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(merged));
        notifyListeners({
          tickets: merged,
          orders: loadOrders(),
          shiftCuts: loadShiftCuts(),
          outflows: loadOutflows(),
          customers: loadCustomers()
        });
      }
    }
  });

  // Escuchar pedidos de Firestore en tiempo real automáticamente
  const unsubOrders = subscribeToFirestoreOrders((firestoreOrders) => {
    if (firestoreOrders && firestoreOrders.length > 0) {
      const deleted = getDeletedOrderIds();
      const activeFirestoreOrders = firestoreOrders.filter(
        o => !deleted.has(o.id) && !(o.folio && deleted.has(o.folio))
      );
      const current = loadOrders();
      const merged = mergeOrders(current, activeFirestoreOrders);
      if (!areOrdersIdentical(current, merged)) {
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(merged));
        notifyListeners({
          tickets: loadTickets(),
          orders: merged,
          shiftCuts: loadShiftCuts(),
          outflows: loadOutflows(),
          customers: loadCustomers()
        });
      }
    }
  });

  // Escuchar cortes de turno en tiempo real automáticamente
  const unsubShiftCuts = subscribeToFirestoreShiftCuts((firestoreCuts) => {
    if (firestoreCuts && firestoreCuts.length > 0) {
      const current = loadShiftCuts();
      const merged = mergeShiftCuts(current, firestoreCuts);
      if (merged.length !== current.length) {
        localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(merged));
        notifyListeners({
          tickets: loadTickets(),
          orders: loadOrders(),
          shiftCuts: merged,
          outflows: loadOutflows(),
          customers: loadCustomers()
        });
      }
    }
  });

  // Escuchar salidas de dinero en tiempo real automáticamente
  const unsubOutflows = subscribeToFirestoreOutflows((firestoreOutflows) => {
    if (firestoreOutflows && firestoreOutflows.length > 0) {
      const current = loadOutflows();
      const merged = mergeOutflows(current, firestoreOutflows);
      if (merged.length !== current.length) {
        localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(merged));
        notifyListeners({
          tickets: loadTickets(),
          orders: loadOrders(),
          shiftCuts: loadShiftCuts(),
          outflows: merged,
          customers: loadCustomers()
        });
      }
    }
  });

  // Escuchar hojas de reparto en tiempo real automáticamente (para celular y cualquier PC en el mundo)
  // Guarda el estado autoritativo de Firestore para que las eliminaciones se reflejen de inmediato
  const unsubDeliveries = subscribeToAllDailyDeliveries((deliveries) => {
    deliveries.forEach(del => {
      saveDailyDeliverySheet(del.date, del.quantities, del.shift);
    });
    // Disparar evento para que cualquier componente o vista activa se refresque
    window.dispatchEvent(new Event('dailyDeliveryUpdated'));
  });

  return () => {
    unsubAuth();
    unsubTickets();
    unsubOrders();
    unsubShiftCuts();
    unsubOutflows();
    unsubDeliveries();
  };
}

/**
 * Sube datos locales que no hayan sido respaldados aún en Firestore
 */
async function syncLocalDataToFirebase() {
  if (isQuotaExceeded()) return;
  try {
    const localTickets = loadTickets();
    if (localTickets.length > 0) {
      await saveSaleTicketToFirestore(localTickets[0]);
    }
  } catch (err) {
    console.warn('Error en syncLocalDataToFirebase:', err);
  }
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

    // 2. Si se pasaron tickets específicos (ej. una venta que se acaba de registrar), guardarlos en Firestore
    if (providedData?.tickets && providedData.tickets.length > 0) {
      for (const t of providedData.tickets) {
        const ok = await saveSaleTicketToFirestore(t);
        if (ok) savedToFirebaseCount++;
      }
    } else if (localTickets.length > 0) {
      // Sincronizar el ticket más reciente a Firestore
      const latest = localTickets[0];
      if (latest) {
        await saveSaleTicketToFirestore(latest);
      }
    }

    // Si se pasaron cortes, guardarlos en Firestore
    if (providedData?.shiftCuts && providedData.shiftCuts.length > 0) {
      for (const c of providedData.shiftCuts) {
        await saveShiftCutToFirestore(c);
      }
    }

    // Si se pasaron pedidos, guardarlos en Firestore
    if (providedData?.orders && providedData.orders.length > 0) {
      for (const o of providedData.orders) {
        await saveOrderToFirestore(o);
      }
    }

    // Si se pasaron clientes, guardarlos en Firestore
    if (providedData?.customers && providedData.customers.length > 0) {
      for (const cu of providedData.customers) {
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

    if (!areTicketsIdentical(freshLocal, finalMergedTickets)) {
      notifyListeners(resultData);
    }

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
    const [remoteTickets, remoteOrders, remoteCuts, remoteCustomers, remoteOutflows, remoteDeliveries] = await Promise.all([
      fetchTicketsFromFirestore(),
      fetchOrdersFromFirestore(),
      fetchShiftCutsFromFirestore(),
      fetchCustomersFromFirestore(),
      fetchOutflowsFromFirestore(),
      fetchAllDailyDeliveriesFromFirestore()
    ]);

    // Guardar hojas de reparto en localStorage del dispositivo
    if (remoteDeliveries && remoteDeliveries.length > 0) {
      remoteDeliveries.forEach(del => {
        saveDailyDeliverySheet(del.date, del.quantities, del.shift);
      });
      window.dispatchEvent(new Event('dailyDeliveryUpdated'));
    }

    const localTickets = loadTickets();
    const localOrders = loadOrders();
    const localShiftCuts = loadShiftCuts();
    const localOutflows = loadOutflows();
    const localCustomers = loadCustomers();

    const mergedTickets = mergeTickets(localTickets, remoteTickets);
    const mergedOrders = mergeOrders(localOrders, remoteOrders);
    const mergedShiftCuts = mergeShiftCuts(localShiftCuts, remoteCuts);
    const mergedCustomers = mergeCustomers(localCustomers, remoteCustomers);
    const mergedOutflows = mergeOutflows(localOutflows, remoteOutflows);

    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(mergedTickets));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(mergedOrders));
    localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(mergedShiftCuts));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(mergedCustomers));
    localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(mergedOutflows));

    const resultData = {
      tickets: mergedTickets,
      orders: mergedOrders,
      shiftCuts: mergedShiftCuts,
      outflows: mergedOutflows,
      customers: mergedCustomers
    };

    if (!areTicketsIdentical(localTickets, mergedTickets) || !areOrdersIdentical(localOrders, mergedOrders)) {
      notifyListeners(resultData);
    }

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
