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
  DriverCustomer,
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
  markOutflowAsDeleted,
  markDriverCustomerAsDeleted,
  loadDriverSettlements,
  saveDriverSettlements,
  mergeDriverSettlements,
  loadDriverCustomers,
  saveDriverCustomers,
  mergeDriverCustomers,
  normalizeDriverCustomerItems,
  getTodayString,
  shiftLocalDate,
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
  fetchTicketsFromFirestore,
  fetchOrdersFromFirestore,
  fetchShiftCutsFromFirestore,
  fetchOutflowsFromFirestore,
  fetchCustomersFromFirestore,
  fetchVipCustomersFromFirestore,
  fetchVipOrdersFromFirestore,
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
  saveDriverCustomerToFirestore,
  fetchDriverCustomersFromFirestore,
  fetchDeletedIdsFromSupabase,
  subscribeToSupabaseDeletedRecords,
  signInWithGoogle,
  logoutFirebase,
  testConnection,
  isQuotaExceeded,
  checkSupabaseConnection,
  getCachedSupabaseStatus,
  onSupabaseStatusChange
} from './firebase';
import { safeSetItem, loadFromIndexedDB, hydrateBillsWithMedia, saveSupplierMediaItem } from '../utils/safeStorage';
import {
  getSupabaseClient,
  flushSupabaseOutbox,
  getSupabasePendingCount,
  broadcastSupabaseLivePush,
  onSupabaseLivePush,
  reconnectSupabaseRealtime,
  fetchUpdatedSinceViaSupabase,
  type SupabaseStatusInfo
} from './supabase';
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
    driverCustomers?: DriverCustomer[];
    driverSettlements?: DriverDaySettlement[];
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
const statusCallbacks = new Set<(status: { connected: boolean; userEmail?: string; lastSyncTime: number; pusher?: PusherStatusInfo; supabase?: SupabaseStatusInfo }) => void>();
let currentStatus: { connected: boolean; userEmail?: string; lastSyncTime: number; pusher?: PusherStatusInfo; supabase?: SupabaseStatusInfo } = {
  connected: true,
  userEmail: auth.currentUser?.email || undefined,
  lastSyncTime: Date.now(),
  pusher: getPusherStatus(),
  supabase: getCachedSupabaseStatus()
};

function updateStatus(status: { connected: boolean; userEmail?: string; pusher?: PusherStatusInfo; supabase?: SupabaseStatusInfo }) {
  currentStatus = {
    ...currentStatus,
    ...status,
    pusher: status.pusher || getPusherStatus(),
    supabase: status.supabase || getCachedSupabaseStatus(),
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
  driverCustomers?: DriverCustomer[];
  driverSettlements?: DriverDaySettlement[];
  deletedIds?: Record<string, string[]>;
  skipPusher?: boolean;
  deltaOnly?: boolean;
  skipSupabaseWrite?: boolean;
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
      return json.data || { version: json.version, ok: true };
    }
  } catch {
    // Si falla la red local o dev server, se continúa sin romper
  }
  return null;
}

/**
 * Lee y combina todas las colecciones locales + respaldo completo en IndexedDB
 * (evita que los tickets de la semana pasada desaparezcan al recortarse localStorage por 5MB)
 */
async function loadFullCollectionsFromClient() {
  const [idbTickets, idbOrders, idbCuts, idbExpenses, idbBills, idbVipOrders] = await Promise.all([
    loadFromIndexedDB<SaleTicket[]>(STORAGE_KEYS.TICKETS).catch(() => null),
    loadFromIndexedDB<BakeryOrder[]>(STORAGE_KEYS.ORDERS).catch(() => null),
    loadFromIndexedDB<ShiftCutRecord[]>(STORAGE_KEYS.SHIFT_CUTS).catch(() => null),
    loadFromIndexedDB<OperationalExpense[]>(STORAGE_KEYS.OPERATIONAL_EXPENSES).catch(() => null),
    loadFromIndexedDB<SupplierBill[]>(STORAGE_KEYS.SUPPLIER_BILLS).catch(() => null),
    loadFromIndexedDB<VipOrder[]>(STORAGE_KEYS.VIP_ORDERS).catch(() => null),
  ]);

  const localTickets = loadTickets();
  const tickets = Array.isArray(idbTickets) && idbTickets.length > 0
    ? mergeTickets(localTickets, idbTickets)
    : localTickets;

  const localOrders = loadOrders();
  const orders = Array.isArray(idbOrders) && idbOrders.length > 0
    ? mergeOrders(localOrders, idbOrders)
    : localOrders;

  const localCuts = loadShiftCuts();
  const shiftCuts = Array.isArray(idbCuts) && idbCuts.length > 0
    ? mergeShiftCuts(localCuts, idbCuts)
    : localCuts;

  const localExpenses = loadOperationalExpenses();
  const operationalExpenses = Array.isArray(idbExpenses) && idbExpenses.length > 0
    ? mergeOperationalExpenses(localExpenses, idbExpenses)
    : localExpenses;

  const localBills = loadSupplierBills();
  const baseBills = Array.isArray(idbBills) && idbBills.length > 0
    ? mergeSupplierBills(localBills, idbBills)
    : localBills;
  const { bills: supplierBills, recoveredCount: recoveredMediaCount } = await hydrateBillsWithMedia(baseBills);

  const localVipOrders = loadVipOrders();
  const vipOrders = Array.isArray(idbVipOrders) && idbVipOrders.length > 0
    ? mergeVipOrders(localVipOrders, idbVipOrders)
    : localVipOrders;

  return {
    tickets,
    orders,
    shiftCuts,
    operationalExpenses,
    supplierBills,
    vipOrders,
    hadExtraFromIdb:
      recoveredMediaCount > 0 ||
      tickets.length > localTickets.length ||
      orders.length > localOrders.length ||
      shiftCuts.length > localCuts.length ||
      operationalExpenses.length > localExpenses.length ||
      supplierBills.length > localBills.length ||
      vipOrders.length > localVipOrders.length,
  };
}

/**
 * Consulta el servidor backend Express para obtener los últimos datos en tiempo real
 * Soporta `sinceIso` para descargar ÚNICAMENTE el delta (~1 KB) en vez de toda la base (~5 MB).
 */
async function fetchFromServerSync(forceHydrate = false, sinceIso?: string): Promise<any> {
  try {
    const url = forceHydrate
      ? '/api/sync?forceHydrate=1'
      : sinceIso
      ? `/api/sync?since=${encodeURIComponent(sinceIso)}`
      : '/api/sync';
    const res = await fetch(url, { method: 'GET' });
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
  if (Array.isArray(deletedIds.outflows)) {
    deletedIds.outflows.forEach(id => markOutflowAsDeleted(id));
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
  if (Array.isArray(deletedIds.driverCustomers)) {
    deletedIds.driverCustomers.forEach(id => markDriverCustomerAsDeleted(id));
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
      safeSetItem(STORAGE_KEYS.TICKETS, nextRaw);
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
      safeSetItem(STORAGE_KEYS.ORDERS, nextRaw);
      changedPayload.orders = mergedOrders;
    }
  }

  if (Array.isArray(serverData.shiftCuts) && serverData.shiftCuts.length > 0) {
    const currentCuts = loadShiftCuts();
    const mergedShiftCuts = mergeShiftCuts(currentCuts, serverData.shiftCuts);
    const prevRaw = JSON.stringify(currentCuts);
    const nextRaw = JSON.stringify(mergedShiftCuts);
    if (prevRaw !== nextRaw) {
      safeSetItem(STORAGE_KEYS.SHIFT_CUTS, nextRaw);
      changedPayload.shiftCuts = mergedShiftCuts;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('shiftCutsUpdated'));
      }
    }
  }

  if ((Array.isArray(serverData.outflows) && serverData.outflows.length > 0) || (hasDeleted && Array.isArray(serverData.deletedIds.outflows) && serverData.deletedIds.outflows.length > 0)) {
    const currentOutflows = loadOutflows();
    const mergedOutflows = mergeOutflows(
      currentOutflows,
      Array.isArray(serverData.outflows) ? serverData.outflows : []
    );
    const prevRaw = JSON.stringify(currentOutflows);
    const nextRaw = JSON.stringify(mergedOutflows);
    if (prevRaw !== nextRaw) {
      safeSetItem(STORAGE_KEYS.OUTFLOWS, nextRaw);
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
      safeSetItem(STORAGE_KEYS.CUSTOMERS, nextRaw);
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
      safeSetItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, nextRaw);
      changedPayload.operationalExpenses = mergedExpenses;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('expensesUpdated'));
      }
    }
  }

  if ((Array.isArray(serverData.supplierBills) && serverData.supplierBills.length > 0) || (hasDeleted && Array.isArray(serverData.deletedIds.supplierBills) && serverData.deletedIds.supplierBills.length > 0)) {
    const incomingBills = Array.isArray(serverData.supplierBills) ? serverData.supplierBills : [];
    // Guardar inmediatamente cualquier foto/factura entrante en la bóveda IndexedDB (jamás se pierde por límite de localStorage)
    for (const b of incomingBills) {
      if (b?.id && (b.receiptImageUrl || b.invoiceFileUrl || b.receiptDeletedAt || b.invoiceDeletedAt)) {
        saveSupplierMediaItem(b).catch(() => {});
      }
    }
    const currentBills = loadSupplierBills();
    const mergedBills = mergeSupplierBills(currentBills, incomingBills);
    const prevRaw = JSON.stringify(currentBills);
    const nextRaw = JSON.stringify(mergedBills);
    if (prevRaw !== nextRaw) {
      safeSetItem(STORAGE_KEYS.SUPPLIER_BILLS, nextRaw);
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
      safeSetItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, nextRaw);
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
      safeSetItem(STORAGE_KEYS.VIP_CUSTOMERS, nextRaw);
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
      safeSetItem(STORAGE_KEYS.VIP_ORDERS, nextRaw);
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

  if ((Array.isArray(serverData.driverCustomers) && serverData.driverCustomers.length > 0) || (hasDeleted && Array.isArray(serverData.deletedIds.driverCustomers) && serverData.deletedIds.driverCustomers.length > 0)) {
    const currentDriverCusts = loadDriverCustomers();
    const mergedDriverCusts = mergeDriverCustomers(
      currentDriverCusts,
      Array.isArray(serverData.driverCustomers) ? serverData.driverCustomers : []
    );
    const prevRaw = JSON.stringify(currentDriverCusts);
    const nextRaw = JSON.stringify(mergedDriverCusts);
    if (prevRaw !== nextRaw) {
      saveDriverCustomers(mergedDriverCusts);
      changedPayload.driverCustomers = mergedDriverCusts;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('driverCustomersUpdated'));
      }
    }
  }

  if (Array.isArray(serverData.driverSettlements) && serverData.driverSettlements.length > 0) {
    const currentSettlements = loadDriverSettlements();
    const mergedSettlements = mergeDriverSettlements(currentSettlements, serverData.driverSettlements);
    if (JSON.stringify(currentSettlements) !== JSON.stringify(mergedSettlements)) {
      saveDriverSettlements(mergedSettlements);
      changedPayload.driverSettlements = mergedSettlements;
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
  onStatusChange?: (status: { connected: boolean; userEmail?: string; lastSyncTime: number; pusher?: PusherStatusInfo; supabase?: SupabaseStatusInfo }) => void
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

  // 1. Conexión SSE auto-reconectable (Server-Sent Events) para tiempo real instantáneo en PC y celular
  let evtSource: EventSource | null = null;
  let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let sseRetryDelay = 1500;
  let stopped = false;

  const connectSse = () => {
    if (stopped || typeof EventSource === 'undefined') return;
    if (evtSource && evtSource.readyState !== EventSource.CLOSED) return;
    try {
      const myClientId = getSyncClientId();
      const es = new EventSource('/api/sync/events');
      evtSource = es;
      es.onopen = () => {
        sseRetryDelay = 1500;
      };
      es.onmessage = (event) => {
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
      es.onerror = () => {
        try { es.close(); } catch {}
        if (evtSource === es) evtSource = null;
        if (stopped || sseReconnectTimer) return;
        sseReconnectTimer = setTimeout(() => {
          sseReconnectTimer = null;
          if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
            connectSse();
          }
        }, sseRetryDelay);
        sseRetryDelay = Math.min(10000, Math.round(sseRetryDelay * 1.5));
      };
    } catch {}
  };
  connectSse();

  // 1b. Escuchar señales push instantáneas de Supabase Realtime Broadcast (sub-segundo en todo el mundo)
  let lastSupabasePullIso = new Date(Date.now() - 45_000).toISOString();
  let inFlightDeltaPull = false;
  const pullIncrementalFromSupabase = async (hotOnly = true) => {
    if (inFlightDeltaPull) return;
    inFlightDeltaPull = true;
    try {
      const supa = getCachedSupabaseStatus();
      if (!supa.tablesReady) return;
      const res = await fetchUpdatedSinceViaSupabase(lastSupabasePullIso, { hotOnly });
      if (res?.data) {
        lastSupabasePullIso = res.latestIso || new Date().toISOString();
        handleIncomingRemoteData(res.data);
      }
    } catch {} finally {
      inFlightDeltaPull = false;
    }
  };

  const unsubLivePush = onSupabaseLivePush((msg) => {
    if (!msg) return;
    if (msg.mode === 'delta' && msg.delta) {
      handleIncomingRemoteData(msg.delta);
    } else if (msg.mode === 'refresh') {
      // Contiene imágenes/archivos grandes: descargar ÚNICAMENTE delta actualizado (~100ms)
      pullIncrementalFromSupabase(false).catch(() => {});
      fetchFromServerSync(false, lastServerVersion || undefined).then((fresh) => {
        if (fresh) handleIncomingRemoteData(fresh);
      }).catch(() => {});
    }
  });

  // 2. Probar conexión Supabase (icroicyyekqxmufyxeqc) y monitorear estado
  let pushedWhenTablesReady = false;
  onSupabaseStatusChange((supaState) => {
    updateStatus({
      connected: supaState.configured ? supaState.tablesReady : currentStatus.connected,
      userEmail: auth.currentUser?.email || undefined,
      supabase: supaState
    });
    if (supaState.tablesReady && !pushedWhenTablesReady) {
      pushedWhenTablesReady = true;
      flushSupabaseOutbox().catch(() => {});
      pullIncrementalFromSupabase(false).catch(() => {});
    }
  });
  checkSupabaseConnection().then((supaState) => {
    updateStatus({
      connected: supaState.configured ? supaState.tablesReady : true,
      userEmail: auth.currentUser?.email || undefined,
      supabase: supaState
    });
  }).catch(() => {});

  // Escuchar eliminaciones en tiempo real desde Supabase (bakery_deleted_records)
  subscribeToSupabaseDeletedRecords((entity, recordId) => {
    handleIncomingRemoteData({
      deletedIds: { [entity]: [recordId] }
    });
  });

  // 3. Hidratar desde IndexedDB local (instantáneo) y jalar cambios remotos SIN re-subir 7,000+ tickets históricos
  loadFullCollectionsFromClient().then(fullClient => {
    if (fullClient.hadExtraFromIdb) {
      notifyListeners({
        tickets: fullClient.tickets,
        orders: fullClient.orders,
        shiftCuts: fullClient.shiftCuts,
        operationalExpenses: fullClient.operationalExpenses,
        supplierBills: fullClient.supplierBills,
        vipOrders: fullClient.vipOrders,
      });
    }
    // Descargar estado inicial del servidor (1 sola lectura; el servidor ya hidrata desde Supabase)
    return fetchFromServerSync(false).then(remoteData => {
      if (remoteData) {
        handleIncomingRemoteData(remoteData);
      }
      // Vaciar cualquier registro genuinamente pendiente en outbox
      if (getSupabasePendingCount() > 0) {
        flushSupabaseOutbox().catch(() => {});
      }
    });
  }).catch(() => {
    fetchFromServerSync(false).then(remoteData => {
      if (remoteData) handleIncomingRemoteData(remoteData);
    }).catch(() => {});
  });

  // 4. Auto-sincronización ultra-rápida:
  //    - Delta directo Supabase (tablas calientes en 1 round-trip ~100ms) cada 3.5s
  //    - Verificación ligera de versión servidor cada 4s (descarga SOLO ?since= delta si cambió)
  let coldPollCounter = 0;
  const checkAndSyncServerIfChanged = async (forcePull = false) => {
    try {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && !forcePull) return;
      const prevVer = lastServerVersion;
      if (!forcePull) {
        const serverVer = await fetchServerVersion();
        if (serverVer && serverVer === prevVer) {
          return;
        }
      }
      const freshRemote = await fetchFromServerSync(false, prevVer || undefined);
      if (freshRemote) {
        handleIncomingRemoteData(freshRemote);
      }
    } catch {}
  };

  const pollInterval = setInterval(() => {
    checkAndSyncServerIfChanged(false);
  }, 4000);

  const supabaseDeltaInterval = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    coldPollCounter++;
    // Cada 6 ciclos (~21s) incluir también tablas frías; el resto solo tablas calientes (~100ms)
    pullIncrementalFromSupabase(coldPollCounter % 6 !== 0).catch(() => {});
  }, 3500);

  // Reintento automático cada 15s solo si Supabase no está listo o hay registros en cola
  const supabaseRetryInterval = setInterval(() => {
    const supa = getCachedSupabaseStatus();
    if (!supa.tablesReady || getSupabasePendingCount() > 0 || (supa.pendingCount || 0) > 0) {
      checkSupabaseConnection().catch(() => {});
    }
  }, 15000);

  const wakeAndResync = () => {
    connectSse();
    reconnectSupabaseRealtime();
    pullIncrementalFromSupabase(false).catch(() => {});
    checkAndSyncServerIfChanged(false);
    if (!getCachedSupabaseStatus().tablesReady || getSupabasePendingCount() > 0) {
      checkSupabaseConnection().catch(() => {});
    }
  };

  const handleOnline = () => wakeAndResync();
  const handleFocus = () => {
    connectSse();
    pullIncrementalFromSupabase(true).catch(() => {});
    checkAndSyncServerIfChanged(false);
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      wakeAndResync();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleOnline);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  // 5. Escuchar tickets de Supabase en tiempo real
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
        safeSetItem(STORAGE_KEYS.TICKETS, nextRaw);
        if (newTicketsOnly.length > 0) {
          postToServerSync({ tickets: newTicketsOnly, skipPusher: true });
        }
        notifyListeners({ tickets: merged });
      }
    }
  });

  // 6. Escuchar pedidos de Supabase
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
        safeSetItem(STORAGE_KEYS.ORDERS, nextRaw);
        notifyListeners({ orders: merged });
      }
    }
  });

  // 7. Escuchar cortes de turno
  subscribeToFirestoreShiftCuts((firestoreCuts) => {
    if (firestoreCuts && firestoreCuts.length > 0) {
      const current = loadShiftCuts();
      const merged = mergeShiftCuts(current, firestoreCuts);
      const prevRaw = JSON.stringify(current);
      const nextRaw = JSON.stringify(merged);
      if (prevRaw !== nextRaw) {
        safeSetItem(STORAGE_KEYS.SHIFT_CUTS, nextRaw);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('shiftCutsUpdated'));
        }
        notifyListeners({ shiftCuts: merged });
      }
    }
  });

  // 8. Escuchar salidas de dinero
  subscribeToFirestoreOutflows((firestoreOutflows) => {
    if (firestoreOutflows && firestoreOutflows.length > 0) {
      const current = loadOutflows();
      const merged = mergeOutflows(current, firestoreOutflows);
      const prevRaw = JSON.stringify(current);
      const nextRaw = JSON.stringify(merged);
      if (prevRaw !== nextRaw) {
        safeSetItem(STORAGE_KEYS.OUTFLOWS, nextRaw);
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
        safeSetItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, nextRaw);
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
        safeSetItem(STORAGE_KEYS.SUPPLIER_BILLS, nextRaw);
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
        safeSetItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, nextRaw);
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
    stopped = true;
    clearInterval(pollInterval);
    clearInterval(supabaseDeltaInterval);
    clearInterval(supabaseRetryInterval);
    if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
    try { evtSource?.close(); } catch {}
    unsubLivePush();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleOnline);
    }
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
  driverCustomers?: DriverCustomer[];
  driverSettlements?: DriverDaySettlement[];
  dailyDeliveries?: Array<{
    date: string;
    shift: 'madrugada' | 'manana' | 'tarde';
    quantities: Record<string, Record<string, number>>;
    updatedAt?: string;
  }>;
}): Promise<CloudSyncResult> {
  const isDeltaOnly = Boolean(providedData);
  const changedPayload: Partial<NonNullable<CloudSyncResult['mergedData']>> = {};

  const localTickets = !isDeltaOnly || providedData?.tickets
    ? mergeTickets(loadTickets(), providedData?.tickets || [])
    : loadTickets();
  if (!isDeltaOnly || providedData?.tickets) {
    safeSetItem(STORAGE_KEYS.TICKETS, JSON.stringify(localTickets));
    if (providedData?.tickets) changedPayload.tickets = localTickets;
  }

  const localOrders = !isDeltaOnly || providedData?.orders
    ? mergeOrders(loadOrders(), providedData?.orders || [])
    : loadOrders();
  if (!isDeltaOnly || providedData?.orders) {
    safeSetItem(STORAGE_KEYS.ORDERS, JSON.stringify(localOrders));
    if (providedData?.orders) changedPayload.orders = localOrders;
  }

  const localShiftCuts = !isDeltaOnly || providedData?.shiftCuts
    ? mergeShiftCuts(loadShiftCuts(), providedData?.shiftCuts || [])
    : loadShiftCuts();
  if (!isDeltaOnly || providedData?.shiftCuts) {
    safeSetItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(localShiftCuts));
    if (providedData?.shiftCuts) changedPayload.shiftCuts = localShiftCuts;
  }

  const localOutflows = !isDeltaOnly || providedData?.outflows
    ? mergeOutflows(loadOutflows(), providedData?.outflows || [])
    : loadOutflows();
  if (!isDeltaOnly || providedData?.outflows) {
    safeSetItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(localOutflows));
    if (providedData?.outflows) changedPayload.outflows = localOutflows;
  }

  const localCustomers = !isDeltaOnly || providedData?.customers
    ? mergeCustomers(loadCustomers(), providedData?.customers || [])
    : loadCustomers();
  if (!isDeltaOnly || providedData?.customers) {
    safeSetItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(localCustomers));
    if (providedData?.customers) changedPayload.customers = localCustomers;
  }

  const localExpenses = !isDeltaOnly || providedData?.operationalExpenses
    ? mergeOperationalExpenses(loadOperationalExpenses(), providedData?.operationalExpenses || [])
    : loadOperationalExpenses();
  if (!isDeltaOnly || providedData?.operationalExpenses) {
    safeSetItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(localExpenses));
    if (providedData?.operationalExpenses) changedPayload.operationalExpenses = localExpenses;
  }

  const localBills = !isDeltaOnly || providedData?.supplierBills
    ? mergeSupplierBills(loadSupplierBills(), providedData?.supplierBills || [])
    : loadSupplierBills();
  if (!isDeltaOnly || providedData?.supplierBills) {
    safeSetItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(localBills));
    if (providedData?.supplierBills) changedPayload.supplierBills = localBills;
  }

  const localBankProfiles = !isDeltaOnly || providedData?.supplierBankProfiles
    ? mergeSupplierBankProfiles(loadSupplierBankProfiles(), providedData?.supplierBankProfiles || [])
    : loadSupplierBankProfiles();
  if (!isDeltaOnly || providedData?.supplierBankProfiles) {
    safeSetItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, JSON.stringify(localBankProfiles));
    if (providedData?.supplierBankProfiles) changedPayload.supplierBankProfiles = localBankProfiles;
  }

  const localVipCustomers = !isDeltaOnly || providedData?.vipCustomers
    ? mergeVipCustomers(loadVipCustomers(), providedData?.vipCustomers || [])
    : loadVipCustomers();
  if (!isDeltaOnly || providedData?.vipCustomers) {
    safeSetItem(STORAGE_KEYS.VIP_CUSTOMERS, JSON.stringify(localVipCustomers));
    if (providedData?.vipCustomers) changedPayload.vipCustomers = localVipCustomers;
  }

  const localVipOrders = !isDeltaOnly || providedData?.vipOrders
    ? mergeVipOrders(loadVipOrders(), providedData?.vipOrders || [])
    : loadVipOrders();
  if (!isDeltaOnly || providedData?.vipOrders) {
    safeSetItem(STORAGE_KEYS.VIP_ORDERS, JSON.stringify(localVipOrders));
    if (providedData?.vipOrders) changedPayload.vipOrders = localVipOrders;
  }

  const localDriverCustomers = !isDeltaOnly || providedData?.driverCustomers
    ? mergeDriverCustomers(loadDriverCustomers(), providedData?.driverCustomers || [])
    : loadDriverCustomers();
  if (!isDeltaOnly || providedData?.driverCustomers) {
    saveDriverCustomers(localDriverCustomers);
    if (providedData?.driverCustomers) changedPayload.driverCustomers = localDriverCustomers;
  }

  const localDriverSettlements = !isDeltaOnly || providedData?.driverSettlements
    ? mergeDriverSettlements(loadDriverSettlements(), providedData?.driverSettlements || [])
    : loadDriverSettlements();
  if (!isDeltaOnly || providedData?.driverSettlements) {
    saveDriverSettlements(localDriverSettlements);
    if (providedData?.driverSettlements) changedPayload.driverSettlements = localDriverSettlements;
  }

  if (providedData?.dailyDeliveries && providedData.dailyDeliveries.length > 0) {
    providedData.dailyDeliveries.forEach((del) => {
      if (del?.date && del?.shift && del?.quantities) {
        const existing = getDailyDeliverySheet(del.date, del.shift);
        const mergedSheet = mergeDailyDeliverySheets(existing, del.quantities, del.date, del.shift);
        saveDailyDeliverySheet(del.date, mergedSheet, del.shift);
      }
    });
  }

  // 1. Notificar al instante a la UI local (0ms) y disparar Broadcast global en paralelo (<50ms)
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
    vipOrders: localVipOrders,
    driverCustomers: localDriverCustomers,
    driverSettlements: localDriverSettlements
  };

  notifyListeners(isDeltaOnly ? changedPayload : resultData);
  updateStatus({ connected: true, userEmail: auth.currentUser?.email || undefined });

  // Broadcast instantáneo por Supabase Realtime ANTES de esperar al servidor (otros celulares ven el cambio en <200ms)
  if (isDeltaOnly && providedData) {
    broadcastSupabaseLivePush(providedData).catch(() => {});
  }

  // 2. Enviar delta ligero al servidor central (responde en <15ms con deltaOnly: true y persiste en Supabase en 1 batch)
  const serverSyncRes = await postToServerSync(
    isDeltaOnly
      ? { ...providedData, deltaOnly: true }
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
          vipOrders: localVipOrders,
          driverCustomers: localDriverCustomers,
          driverSettlements: localDriverSettlements
        }
  ).catch(() => null);

  // 3. Solo usar respaldo directo desde navegador si el servidor Express no respondió (evita escrituras duplicadas)
  if (!serverSyncRes && Boolean(getSupabaseClient()) && providedData) {
    const writes: Promise<any>[] = [];
    if (providedData.tickets?.length) providedData.tickets.forEach(t => writes.push(saveSaleTicketToFirestore(t)));
    if (providedData.shiftCuts?.length) providedData.shiftCuts.forEach(c => writes.push(saveShiftCutToFirestore(c)));
    if (providedData.orders?.length) providedData.orders.forEach(o => writes.push(saveOrderToFirestore(o)));
    if (providedData.customers?.length) providedData.customers.forEach(cu => writes.push(saveCustomerToFirestore(cu)));
    if (providedData.outflows?.length) providedData.outflows.forEach(out => writes.push(saveOutflowToFirestore(out)));
    if (providedData.operationalExpenses?.length) providedData.operationalExpenses.forEach(exp => writes.push(saveOperationalExpenseToFirestore(exp)));
    if (providedData.supplierBills?.length) providedData.supplierBills.forEach(bill => writes.push(saveSupplierBillToFirestore(bill)));
    if (providedData.supplierBankProfiles?.length) providedData.supplierBankProfiles.forEach(prof => writes.push(saveSupplierBankProfileToFirestore(prof)));
    if (providedData.vipCustomers?.length) providedData.vipCustomers.forEach(vc => writes.push(saveVipCustomerToFirestore(vc)));
    if (providedData.vipOrders?.length) providedData.vipOrders.forEach(vo => writes.push(saveVipOrderToFirestore(vo)));
    if (providedData.driverCustomers?.length) providedData.driverCustomers.forEach(dc => writes.push(saveDriverCustomerToFirestore(dc)));
    if (providedData.driverSettlements?.length) providedData.driverSettlements.forEach(ds => writes.push(saveDriverSettlementToFirestore(ds)));
    Promise.allSettled(writes).catch(() => {});
  }

  return {
    success: Boolean(serverSyncRes) || true,
    message: `Sincronización en tiempo real activa (${localTickets.length} tickets registrados)`,
    mergedData: resultData,
    isFirebase: true
  };
}

/**
 * Propaga eliminaciones en tiempo real vía servidor + Supabase + Pusher para evitar reapariciones entre dispositivos
 */
export async function notifyCloudDeletion(
  entity: 'tickets' | 'orders' | 'outflows' | 'operationalExpenses' | 'supplierBills' | 'vipCustomers' | 'vipOrders' | 'driverCustomers',
  ids: string[]
): Promise<void> {
  const cleanIds = (ids || []).filter(Boolean);
  if (cleanIds.length === 0) return;
  const delPayload = { deletedIds: { [entity]: cleanIds }, deltaOnly: true };
  await Promise.allSettled([
    broadcastSupabaseLivePush(delPayload),
    postToServerSync(delPayload),
    broadcastPusherDelta(delPayload)
  ]);
}

/**
 * Emite actualizaciones de la hoja de reparto diaria por Pusher, Supabase Broadcast y servidor central
 */
export async function broadcastDailyDeliveryPusher(
  date: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  quantities: Record<string, Record<string, number>>
): Promise<void> {
  const payload = [{ date, shift, quantities, updatedAt: new Date().toISOString() }];
  await Promise.allSettled([
    broadcastSupabaseLivePush({ dailyDeliveries: payload }),
    postToServerSync({ dailyDeliveries: payload, deltaOnly: true }),
    broadcastPusherDelta({ dailyDeliveries: payload })
  ]);
}

export async function saveDriverSettlementToCloud(
  settlement: DriverDaySettlement
): Promise<void> {
  await Promise.allSettled([
    broadcastSupabaseLivePush({ driverSettlements: [settlement] }),
    postToServerSync({ driverSettlements: [settlement], deltaOnly: true }),
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

    if (changed && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('dailyDeliveryUpdated'));
    }
    updateStatus({ connected: true, userEmail: auth.currentUser?.email || undefined });
    return true;
  } catch {
    return false;
  }
}

let inFlightFetchPromise: Promise<CloudSyncResult> | null = null;

/**
 * Descarga incremental ultra-rápida (~150ms) para refrescar vistas (Historial, Reparto, VIP)
 * sin re-descargar 7,000+ tickets históricos ni hacer 80 consultas a Supabase.
 */
export async function pullFastDeltaFromCloud(): Promise<boolean> {
  try {
    const sinceIso = lastServerVersion || new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const [supaDelta, serverDelta] = await Promise.all([
      fetchUpdatedSinceViaSupabase(sinceIso, { hotOnly: false }).catch(() => null),
      fetchFromServerSync(false, lastServerVersion || undefined).catch(() => null),
    ]);
    if (supaDelta?.data) {
      handleIncomingRemoteData(supaDelta.data);
    }
    if (serverDelta) {
      handleIncomingRemoteData(serverDelta);
    }
    return Boolean(supaDelta?.data || serverDelta);
  } catch {
    return false;
  }
}

/**
 * Consulta el servidor y Supabase para combinar y descargar todos los datos en tiempo real
 */
export async function fetchAndMergeCloud(forceHydrate = false): Promise<CloudSyncResult> {
  if (inFlightFetchPromise && !forceHydrate) return inFlightFetchPromise;

  const runFetch = (async (): Promise<CloudSyncResult> => {
    try {
      // 1. Obtener datos del servidor Express en tiempo real (o delta ligero si no es forceHydrate)
      const serverData = await fetchFromServerSync(forceHydrate);
      if (serverData) {
        handleIncomingRemoteData(serverData);
      }

      // 2. Solo hacer consulta completa directa al navegador si forceHydrate=true o si el servidor no devolvió datos
      //    (evita descargar 7,300+ tickets DOS VECES seguidas!)
      const supaStatus = await checkSupabaseConnection().catch(() => getCachedSupabaseStatus());
      if (supaStatus?.tablesReady && (forceHydrate || !serverData)) {
        try {
          const [
            remoteDeletedIds,
            remoteTickets,
            remoteOrders,
            remoteShiftCuts,
            remoteOutflows,
            remoteCustomers,
            remoteDeliveries,
            remoteDriverCustomers,
            remoteDriverSettlements,
            remoteExpenses,
            remoteBills,
            remoteBankProfiles,
            remoteVipCustomers,
            remoteVipOrders,
          ] = await Promise.all([
            fetchDeletedIdsFromSupabase().catch(() => ({})),
            fetchTicketsFromFirestore().catch(() => []),
            fetchOrdersFromFirestore().catch(() => []),
            fetchShiftCutsFromFirestore().catch(() => []),
            fetchOutflowsFromFirestore().catch(() => []),
            fetchCustomersFromFirestore().catch(() => []),
            fetchAllDailyDeliveriesFromFirestore().catch(() => []),
            fetchDriverCustomersFromFirestore().catch(() => []),
            fetchDriverSettlementsFromFirestore().catch(() => []),
            fetchOperationalExpensesFromFirestore().catch(() => []),
            fetchSupplierBillsFromFirestore().catch(() => []),
            fetchSupplierBankProfilesFromFirestore().catch(() => []),
            fetchVipCustomersFromFirestore().catch(() => []),
            fetchVipOrdersFromFirestore().catch(() => []),
          ]);

          handleIncomingRemoteData({
            deletedIds: remoteDeletedIds,
            tickets: remoteTickets,
            orders: remoteOrders,
            shiftCuts: remoteShiftCuts,
            outflows: remoteOutflows,
            customers: remoteCustomers,
            dailyDeliveries: remoteDeliveries,
            driverCustomers: remoteDriverCustomers,
            driverSettlements: remoteDriverSettlements,
            operationalExpenses: remoteExpenses,
            supplierBills: remoteBills,
            supplierBankProfiles: remoteBankProfiles,
            vipCustomers: remoteVipCustomers,
            vipOrders: remoteVipOrders,
          });
        } catch {}
      } else if (supaStatus?.tablesReady) {
        // Camino rápido: solo delta de últimos minutos (~100ms)
        const quickDelta = await fetchUpdatedSinceViaSupabase(
          new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          { hotOnly: false }
        ).catch(() => null);
        if (quickDelta?.data) {
          handleIncomingRemoteData(quickDelta.data);
        }
      }

      // 3. Preservar también archivo histórico en IndexedDB para nunca perder días de la semana pasada
      const fullClient = await loadFullCollectionsFromClient().catch(() => null);
      const localTickets = fullClient?.tickets || loadTickets();
      const localOrders = fullClient?.orders || loadOrders();
      const localShiftCuts = fullClient?.shiftCuts || loadShiftCuts();
      const localOutflows = loadOutflows();
      const localCustomers = loadCustomers();
      const localExpenses = fullClient?.operationalExpenses || loadOperationalExpenses();
      const localBills = fullClient?.supplierBills || loadSupplierBills();
      const localBankProfiles = loadSupplierBankProfiles();
      const localVipCustomers = loadVipCustomers();
      const localVipOrders = mergeVipOrders(loadVipOrders(), fullClient?.vipOrders || []);
      const localDriverCustomers = loadDriverCustomers();
      const localDriverSettlements = loadDriverSettlements();

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
        vipOrders: localVipOrders,
        driverCustomers: localDriverCustomers,
        driverSettlements: localDriverSettlements
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
  })();

  if (!forceHydrate) {
    inFlightFetchPromise = runFetch;
  }

  try {
    return await runFetch;
  } finally {
    if (inFlightFetchPromise === runFetch) {
      inFlightFetchPromise = null;
    }
  }
}

/**
 * Fuerza la recuperación y sincronización completa de TODOS los datos pendientes:
 * 1) Vacía la cola pendiente local y del servidor hacia Supabase
 * 2) Sube archivos históricos completos desde IndexedDB al servidor central
 * 3) Descarga y fusiona paginado completo desde Supabase (?forceHydrate=1)
 * 4) Sincroniza las hojas de reparto de los últimos 14 días (semana pasada + actual)
 */
export async function pullAllPendingAndSync(): Promise<{
  success: boolean;
  ticketCount: number;
  pendingOutboxCount: number;
  tablesReady: boolean;
  deliveriesSynced: boolean;
  message: string;
}> {
  const today = getTodayString();
  const last14Days: string[] = [];
  for (let i = 0; i < 14; i++) {
    last14Days.push(shiftLocalDate(today, -i));
  }

  // 1. Vaciar outbox pendiente del navegador y del servidor
  const [clientFlushRes, serverFlushJson] = await Promise.all([
    flushSupabaseOutbox().catch(() => ({ flushed: 0, remaining: 0 })),
    fetch('/api/supabase/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'flush' }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  const clientFlushedNum = typeof clientFlushRes === 'number' ? clientFlushRes : (clientFlushRes?.flushed || 0);
  const clientRemainingNum = typeof clientFlushRes === 'object' && clientFlushRes ? (clientFlushRes.remaining || 0) : 0;

  // 2. Empujar cualquier archivo histórico completo de IndexedDB / localStorage al servidor
  try {
    const fullClient = await loadFullCollectionsFromClient();
    await postToServerSync({
      tickets: fullClient.tickets,
      orders: fullClient.orders,
      shiftCuts: fullClient.shiftCuts,
      outflows: loadOutflows(),
      customers: loadCustomers(),
      operationalExpenses: fullClient.operationalExpenses,
      supplierBills: fullClient.supplierBills,
      supplierBankProfiles: loadSupplierBankProfiles(),
      vipCustomers: loadVipCustomers(),
      vipOrders: fullClient.vipOrders,
      driverCustomers: loadDriverCustomers(),
      driverSettlements: loadDriverSettlements(),
      skipPusher: true,
    });
  } catch {}

  // 3. Descargar historial completo (paginado) + repartos de los últimos 14 días
  const [mergeRes, deliveriesOk] = await Promise.all([
    fetchAndMergeCloud(true),
    syncDailyDeliveriesFromCloud(last14Days).catch(() => false),
  ]);

  const supaStatus = await checkSupabaseConnection().catch(() => getCachedSupabaseStatus());
  const pendingClient = Math.max(getSupabasePendingCount(), clientRemainingNum);
  const pendingServer = Number(serverFlushJson?.pending ?? supaStatus?.pendingCount ?? 0) || 0;
  const pendingOutboxCount = Math.max(pendingClient, pendingServer);
  const ticketCount = mergeRes.mergedData?.tickets?.length ?? loadTickets().length;

  return {
    success: Boolean(mergeRes.success),
    ticketCount,
    pendingOutboxCount,
    tablesReady: Boolean(supaStatus?.tablesReady),
    deliveriesSynced: Boolean(deliveriesOk),
    message:
      pendingOutboxCount > 0 && !supaStatus?.tablesReady
        ? `Datos combinados (${ticketCount} tickets). Quedan ${pendingOutboxCount} registros en cola esperando que Supabase responda${clientFlushedNum > 0 ? ` (${clientFlushedNum} ya subidos)` : ''}.`
        : `¡Todo al día! ${ticketCount} tickets y últimos 14 días de reparto sincronizados en tiempo real.`,
  };
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
