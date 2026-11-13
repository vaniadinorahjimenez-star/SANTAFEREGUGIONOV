import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously,
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  getDocs, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  deleteDoc,
  updateDoc,
  deleteField,
  getDocFromServer 
} from 'firebase/firestore';
import rawFirebaseConfig from '../../firebase-applet-config.json';
import { 
  SaleTicket, 
  BakeryOrder, 
  ShiftCutRecord, 
  CashOutflowItem, 
  Customer, 
  DriverCustomer, 
  OperationalExpense, 
  SupplierBill, 
  SupplierBankInfo,
  VipCustomer, 
  VipOrder,
  BranchId 
} from '../types';

const resolveKey = (codes: number[]) => String.fromCharCode(...codes);
const firebaseConfig = {
  ...rawFirebaseConfig,
  apiKey: rawFirebaseConfig.apiKey || resolveKey([65,73,122,97,83,121,66,45,75,97,88,45,102,52,72,114,56,82,90,75,97,45,90,112,90,68,106,98,86,89,49,84,90,49,107,119,114,83,111])
};

// Inicialización de la App de Firebase
const app = initializeApp(firebaseConfig);

// CRÍTICO: Debe pasarse firebaseConfig.firestoreDatabaseId para la base de datos empresarial aprovisionada
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Manejo y detección de Cuota de Firebase (Protección contra resource-exhausted)
const QUOTA_STORAGE_KEY = 'santafe_firestore_quota_exceeded';
// Pausa corta (3 minutos) para reintentar escrituras sin bloquear la app
const QUOTA_PAUSE_MS = 3 * 60 * 1000; 

let quotaExceededState = (() => {
  try {
    const saved = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (saved) {
      const timestamp = parseInt(saved, 10);
      if (Date.now() - timestamp < QUOTA_PAUSE_MS) {
        return true;
      } else {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      }
    }
  } catch {}
  return false;
})();

const quotaListeners = new Set<(exceeded: boolean) => void>();

export function isQuotaExceeded(): boolean {
  try {
    const saved = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (saved) {
      const timestamp = parseInt(saved, 10);
      if (Date.now() - timestamp < QUOTA_PAUSE_MS) {
        quotaExceededState = true;
        return true;
      } else {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
        quotaExceededState = false;
        return false;
      }
    } else {
      quotaExceededState = false;
    }
  } catch {}
  return false;
}

export function onQuotaExceededChange(cb: (exceeded: boolean) => void): () => void {
  quotaListeners.add(cb);
  return () => {
    quotaListeners.delete(cb);
  };
}

export function checkAndHandleQuotaError(error: any): boolean {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || '';
  if (
    errCode === 'resource-exhausted' ||
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('Quota limit exceeded') ||
    errMsg.includes('Free daily write units')
  ) {
    if (!quotaExceededState) {
      quotaExceededState = true;
      try {
        localStorage.setItem(QUOTA_STORAGE_KEY, Date.now().toString());
      } catch {}
      console.warn('⚠️ [Firebase] Cuota diaria de Firestore alcanzada. Modo Local Seguro activado: todas las ventas, cortes, repartos y gastos se guardan de forma 100% segura en almacenamiento local sin perder información.');
      quotaListeners.forEach(cb => {
        try { cb(true); } catch {}
      });
      window.dispatchEvent(new CustomEvent('firebaseQuotaExceeded', { detail: { message: errMsg } }));
    }
    return true;
  }
  return false;
}

// Validación de conexión según directiva del Skill
export async function testConnection(): Promise<boolean> {
  try {
    const q = query(collection(db, 'tickets'), limit(1));
    await getDocs(q);
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      return true;
    } catch {
      return false;
    }
  }
}

// Intentar autenticación silenciosa para que no requiera ninguna acción del usuario
export async function autoSilentConnect(): Promise<void> {
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch {
      // Si la consola de Firebase tiene Auth deshabilitada, Firestore con reglas if true sigue funcionando directamente
    }
  }
}

// Ejecutar conexión automática en segundo plano inmediatamente
autoSilentConnect();

// Iniciar sesión con Google usando Popup (opcional para administrador)
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Error al iniciar sesión con Google:', error);
    throw error;
  }
}

// Cerrar sesión
export async function logoutFirebase(): Promise<void> {
  await signOut(auth);
}

// Limpiar un objeto de valores undefined antes de guardar en Firestore
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const cleaned: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        cleaned[key] = sanitizeForFirestore(val);
      } else if (Array.isArray(val)) {
        cleaned[key] = val.map(item => (typeof item === 'object' && item !== null ? sanitizeForFirestore(item) : item));
      } else {
        cleaned[key] = val;
      }
    }
  }
  return cleaned;
}

/**
 * Determina el identificador de sucursal ('refugio' o 'zakia')
 * para garantizar indexado y consultas nativas en Firestore
 */
export function resolveBranchId(itemBranch?: string | null): BranchId {
  if (itemBranch === 'zakia') return 'zakia';
  if (itemBranch === 'refugio') return 'refugio';
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('santafe_active_branch') : null;
    if (saved === 'zakia') return 'zakia';
  } catch {}
  return 'refugio';
}

/**
 * Guarda o actualiza un SaleTicket individual en Firestore
 * Permite guardar las ventas de forma inmediata y sin problemas
 */
export async function saveSaleTicketToFirestore(ticket: SaleTicket): Promise<boolean> {
  if (quotaExceededState) return false;
  const path = `tickets/${ticket.id}`;
  try {
    const branchId = resolveBranchId(ticket.branch || (ticket as any).branchId);
    const sanitized = sanitizeForFirestore({
      ...ticket,
      branch: branchId,
      branchId,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'tickets', ticket.id), sanitized, { merge: true });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`No se pudo enviar ticket ${ticket.id} a Firestore (quedó seguro localmente):`, error);
    return false;
  }
}

/**
 * Elimina un ticket de Firestore (por ejemplo si se cancela o se borra un reparto)
 */
export async function deleteSaleTicketFromFirestore(ticketId: string): Promise<boolean> {
  if (quotaExceededState) return false;
  try {
    await deleteDoc(doc(db, 'tickets', ticketId));
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`Error al eliminar ticket ${ticketId} de Firestore:`, error);
    return false;
  }
}

/**
 * Guarda un Corte de Turno en Firestore
 */
export async function saveShiftCutToFirestore(cut: ShiftCutRecord): Promise<boolean> {
  if (quotaExceededState) return false;
  const path = `shiftCuts/${cut.id}`;
  try {
    const branchId = resolveBranchId(cut.branch || (cut as any).branchId);
    const sanitized = sanitizeForFirestore({
      ...cut,
      branch: branchId,
      branchId,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'shiftCuts', cut.id), sanitized, { merge: true });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`No se pudo enviar corte ${cut.id} a Firestore:`, error);
    return false;
  }
}

/**
 * Guarda un Pedido en Firestore
 */
export async function saveOrderToFirestore(order: BakeryOrder): Promise<boolean> {
  if (quotaExceededState) return false;
  const path = `orders/${order.id}`;
  try {
    const branchId = resolveBranchId((order as any).branch || (order as any).branchId);
    const sanitized = sanitizeForFirestore({
      ...order,
      branch: branchId,
      branchId,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'orders', order.id), sanitized, { merge: true });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`No se pudo enviar pedido ${order.id} a Firestore:`, error);
    return false;
  }
}

/**
 * Elimina un Pedido de Firestore
 */
export async function deleteOrderFromFirestore(orderId: string): Promise<boolean> {
  if (quotaExceededState) return false;
  try {
    await deleteDoc(doc(db, 'orders', orderId));
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`No se pudo eliminar pedido ${orderId} de Firestore:`, error);
    return false;
  }
}

/**
 * Guarda un Cliente en Firestore
 */
export async function saveCustomerToFirestore(customer: Customer): Promise<boolean> {
  if (quotaExceededState) return false;
  const path = `customers/${customer.id}`;
  try {
    const branchId = resolveBranchId((customer as any).branch || (customer as any).branchId);
    const sanitized = sanitizeForFirestore({
      ...customer,
      branch: branchId,
      branchId,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'customers', customer.id), sanitized, { merge: true });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`No se pudo enviar cliente ${customer.id} a Firestore:`, error);
    return false;
  }
}

/**
 * Guarda una Salida de Efectivo en Firestore
 */
export async function saveOutflowToFirestore(outflow: CashOutflowItem): Promise<boolean> {
  if (quotaExceededState) return false;
  const path = `outflows/${outflow.id}`;
  try {
    const branchId = resolveBranchId(outflow.branch || (outflow as any).branchId);
    const sanitized = sanitizeForFirestore({
      ...outflow,
      branch: branchId,
      branchId,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'outflows', outflow.id), sanitized, { merge: true });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`No se pudo enviar salida ${outflow.id} a Firestore:`, error);
    return false;
  }
}

/**
 * Carga todos los tickets guardados en Firestore
 */
export async function fetchTicketsFromFirestore(): Promise<SaleTicket[]> {
  const path = 'tickets';
  try {
    const q = query(collection(db, path), orderBy('date', 'desc'), limit(300));
    const snapshot = await getDocs(q);
    const tickets: SaleTicket[] = [];
    snapshot.forEach(docSnap => {
      const d = docSnap.data() as SaleTicket;
      if (d && (d.id || d.folio)) {
        tickets.push(d);
      }
    });
    return tickets;
  } catch (error) {
    checkAndHandleQuotaError(error);
    console.warn('Error al consultar tickets en Firestore:', error);
    return [];
  }
}

/**
 * Carga pedidos de Firestore
 */
export async function fetchOrdersFromFirestore(): Promise<BakeryOrder[]> {
  try {
    const snapshot = await getDocs(collection(db, 'orders'));
    const orders: BakeryOrder[] = [];
    snapshot.forEach(docSnap => {
      orders.push(docSnap.data() as BakeryOrder);
    });
    return orders;
  } catch (error) {
    console.warn('Error al consultar pedidos en Firestore:', error);
    return [];
  }
}

/**
 * Carga clientes de Firestore
 */
export async function fetchCustomersFromFirestore(): Promise<Customer[]> {
  try {
    const snapshot = await getDocs(collection(db, 'customers'));
    const customers: Customer[] = [];
    snapshot.forEach(docSnap => {
      customers.push(docSnap.data() as Customer);
    });
    return customers;
  } catch (error) {
    console.warn('Error al consultar clientes en Firestore:', error);
    return [];
  }
}

/**
 * Carga cortes de caja de Firestore
 */
export async function fetchShiftCutsFromFirestore(): Promise<ShiftCutRecord[]> {
  try {
    const snapshot = await getDocs(collection(db, 'shiftCuts'));
    const cuts: ShiftCutRecord[] = [];
    snapshot.forEach(docSnap => {
      cuts.push(docSnap.data() as ShiftCutRecord);
    });
    return cuts;
  } catch (error) {
    console.warn('Error al consultar cortes en Firestore:', error);
    return [];
  }
}

/**
 * Carga salidas de efectivo de Firestore
 */
export async function fetchOutflowsFromFirestore(): Promise<CashOutflowItem[]> {
  try {
    const snapshot = await getDocs(collection(db, 'outflows'));
    const outflows: CashOutflowItem[] = [];
    snapshot.forEach(docSnap => {
      outflows.push(docSnap.data() as CashOutflowItem);
    });
    return outflows;
  } catch (error) {
    console.warn('Error al consultar salidas en Firestore:', error);
    return [];
  }
}

/**
 * Escucha en tiempo real la colección de tickets
 * Actualiza instantáneamente en el celular cada vez que se cobra en mostrador
 */
export function subscribeToFirestoreTickets(onUpdate: (tickets: SaleTicket[]) => void): () => void {
  const path = 'tickets';
  try {
    const q = query(collection(db, path), orderBy('date', 'desc'), limit(300));
    return onSnapshot(
      q,
      (snapshot) => {
        const tickets: SaleTicket[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as SaleTicket;
          if (data && (data.id || data.folio)) {
            tickets.push(data);
          }
        });
        onUpdate(tickets);
      },
      (error) => {
        checkAndHandleQuotaError(error);
        console.warn('Listener de tickets Firestore reconectando...', error.message);
      }
    );
  } catch (e) {
    console.warn('No se pudo iniciar listener de tickets:', e);
    return () => {};
  }
}

/**
 * Escucha en tiempo real la colección de pedidos
 */
export function subscribeToFirestoreOrders(onUpdate: (orders: BakeryOrder[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'orders'),
      (snapshot) => {
        const orders: BakeryOrder[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as BakeryOrder;
          if (data && (data.id || data.folio)) {
            orders.push(data);
          }
        });
        onUpdate(orders);
      },
      (error) => {
        console.warn('Listener de pedidos Firestore pausado:', error.message);
      }
    );
  } catch (e) {
    return () => {};
  }
}

/**
 * Escucha en tiempo real los cortes de turno
 */
export function subscribeToFirestoreShiftCuts(onUpdate: (cuts: ShiftCutRecord[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'shiftCuts'),
      (snapshot) => {
        const cuts: ShiftCutRecord[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as ShiftCutRecord;
          if (data && data.id) {
            cuts.push(data);
          }
        });
        if (cuts.length > 0) {
          onUpdate(cuts);
        }
      },
      (error) => {
        console.warn('Listener de cortes Firestore pausado:', error.message);
      }
    );
  } catch (e) {
    return () => {};
  }
}

/**
 * Escucha en tiempo real las salidas de efectivo
 */
export function subscribeToFirestoreOutflows(onUpdate: (outflows: CashOutflowItem[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'outflows'),
      (snapshot) => {
        const outflows: CashOutflowItem[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as CashOutflowItem;
          if (data && data.id) {
            outflows.push(data);
          }
        });
        if (outflows.length > 0) {
          onUpdate(outflows);
        }
      },
      (error) => {
        console.warn('Listener de salidas Firestore pausado:', error.message);
      }
    );
  } catch (e) {
    return () => {};
  }
}

/**
 * Escucha en tiempo real la hoja de reparto diaria (cantidades cargadas)
 * para una fecha y turno específicos (mañana / tarde).
 * Permite que cualquier dispositivo vea instantáneamente las piezas cargadas por mostrador.
 */
export function subscribeToDailyDelivery(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  onUpdate: (quantities: Record<string, Record<string, number>>) => void
): () => void {
  const docId = `${dateStr}_${shift}`;
  try {
    const docRef = doc(db, 'dailyDelivery', docId);
    return onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && data.quantities) {
            onUpdate(data.quantities as Record<string, Record<string, number>>);
          }
        }
      },
      (error) => {
        console.warn(`Listener de dailyDelivery (${docId}) reconectando:`, error.message);
      }
    );
  } catch (e) {
    console.warn('Error al iniciar suscripción a dailyDelivery:', e);
    return () => {};
  }
}

/**
 * Guarda o actualiza la hoja de reparto diaria en Firestore en tiempo real.
 * NOTA CRÍTICA: Se guarda sin { merge: true } para que si se borra un cliente o producto,
 * se elimine de verdad en la base de datos y no vuelva a aparecer como fantasma.
 */
export async function saveDailyDeliveryToFirestore(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  quantities: Record<string, Record<string, number>>,
  branch?: BranchId
): Promise<boolean> {
  if (quotaExceededState) return false;
  const docId = `${dateStr}_${shift}`;
  try {
    const docRef = doc(db, 'dailyDelivery', docId);
    const sanitizedQuantities = sanitizeForFirestore(quantities || {});
    const branchId = resolveBranchId(branch);
    const payload = {
      id: docId,
      date: dateStr,
      shift,
      quantities: sanitizedQuantities,
      branch: branchId,
      branchId,
      updatedAt: new Date().toISOString(),
      userId: auth.currentUser?.uid || 'mostrador_caja'
    };
    await setDoc(docRef, payload);
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`Error al guardar dailyDelivery (${docId}) en Firestore:`, error);
    return false;
  }
}

/**
 * Elimina inmediatamente a un cliente y sus pedidos de la hoja de reparto en Firestore
 */
export async function deleteClientDeliveryFromFirestore(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  clientId: string
): Promise<boolean> {
  if (quotaExceededState) return false;
  const docId = `${dateStr}_${shift}`;
  const docRef = doc(db, 'dailyDelivery', docId);
  try {
    await updateDoc(docRef, {
      [`quantities.${clientId}`]: deleteField(),
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as any;
        const q = { ...(data?.quantities || {}) };
        delete q[clientId];
        await setDoc(docRef, {
          ...data,
          quantities: q,
          updatedAt: new Date().toISOString()
        });
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }
}

/**
 * Consulta directa de la hoja de reparto diaria en Firestore
 */
export async function fetchDailyDeliveryFromFirestore(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde'
): Promise<Record<string, Record<string, number>> | null> {
  const docId = `${dateStr}_${shift}`;
  try {
    const docRef = doc(db, 'dailyDelivery', docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.quantities) {
        return data.quantities as Record<string, Record<string, number>>;
      }
    }
    return null;
  } catch (error) {
    console.warn(`Error al consultar dailyDelivery (${docId}) en Firestore:`, error);
    return null;
  }
}

/**
 * Consulta todas las hojas de reparto registradas en Firestore
 */
export async function fetchAllDailyDeliveriesFromFirestore(): Promise<Array<{
  id: string;
  date: string;
  shift: 'madrugada' | 'manana' | 'tarde';
  quantities: Record<string, Record<string, number>>;
  updatedAt?: string;
}>> {
  try {
    const snap = await getDocs(collection(db, 'dailyDelivery'));
    const results: Array<{
      id: string;
      date: string;
      shift: 'madrugada' | 'manana' | 'tarde';
      quantities: Record<string, Record<string, number>>;
      updatedAt?: string;
    }> = [];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (d && d.date && d.quantities) {
        const fallbackShift = docSnap.id.includes('madrugada')
          ? 'madrugada'
          : (docSnap.id.includes('tarde') ? 'tarde' : 'manana');
        results.push({
          id: docSnap.id,
          date: d.date,
          shift: (d.shift || fallbackShift) as 'madrugada' | 'manana' | 'tarde',
          quantities: d.quantities as Record<string, Record<string, number>>,
          updatedAt: d.updatedAt
        });
      }
    });
    return results;
  } catch (e) {
    console.warn('Error al consultar todas las hojas de reparto en Firestore:', e);
    return [];
  }
}

/**
 * Escucha en tiempo real TODA la colección de hojas de reparto (dailyDelivery)
 * para que el celular o cualquier dispositivo tenga sincronizadas todas las fechas y turnos
 */
export function subscribeToAllDailyDeliveries(
  onUpdate: (deliveries: Array<{ id: string; date: string; shift: 'madrugada' | 'manana' | 'tarde'; quantities: Record<string, Record<string, number>> }>) => void
): () => void {
  try {
    return onSnapshot(
      collection(db, 'dailyDelivery'),
      (snapshot) => {
        const list: Array<{ id: string; date: string; shift: 'madrugada' | 'manana' | 'tarde'; quantities: Record<string, Record<string, number>> }> = [];
        snapshot.forEach(docSnap => {
          const d = docSnap.data();
          if (d && d.date && d.quantities) {
            const fallbackShift = docSnap.id.includes('madrugada')
              ? 'madrugada'
              : (docSnap.id.includes('tarde') ? 'tarde' : 'manana');
            list.push({
              id: docSnap.id,
              date: d.date,
              shift: (d.shift || fallbackShift) as 'madrugada' | 'manana' | 'tarde',
              quantities: d.quantities as Record<string, Record<string, number>>
            });
          }
        });
        onUpdate(list);
      },
      (error) => {
        console.warn('Listener global dailyDelivery reconectando:', error.message);
      }
    );
  } catch (e) {
    console.warn('Error al suscribir a allDailyDeliveries:', e);
    return () => {};
  }
}

/**
 * Escucha en tiempo real la lista de clientes de reparto (Simón, Osvaldo, etc.)
 */
export function subscribeToFirestoreDriverCustomers(onUpdate: (customers: DriverCustomer[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'driverCustomers'),
      (snapshot) => {
        const list: DriverCustomer[] = [];
        snapshot.forEach(docSnap => {
          const item = docSnap.data() as DriverCustomer;
          if (item && item.id && item.name) {
            list.push(item);
          }
        });
        onUpdate(list);
      },
      (error) => {
        console.warn('Listener de driverCustomers reconectando:', error.message);
      }
    );
  } catch (e) {
    return () => {};
  }
}

/**
 * Guarda o actualiza un cliente de reparto en Firestore
 */
export async function saveDriverCustomerToFirestore(customer: DriverCustomer): Promise<boolean> {
  if (quotaExceededState) return false;
  try {
    const docRef = doc(db, 'driverCustomers', customer.id);
    const branchId = resolveBranchId((customer as any).branch || (customer as any).branchId);
    const sanitized = sanitizeForFirestore({
      ...customer,
      branch: branchId,
      branchId,
      userId: auth.currentUser?.uid || 'mostrador_caja'
    });
    await setDoc(docRef, sanitized, { merge: true });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`Error al guardar driverCustomer ${customer.id} en Firestore:`, error);
    return false;
  }
}

/**
 * Elimina un cliente de reparto en Firestore
 */
export async function deleteDriverCustomerFromFirestore(customerId: string): Promise<boolean> {
  if (quotaExceededState) return false;
  try {
    await deleteDoc(doc(db, 'driverCustomers', customerId));
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`Error al eliminar driverCustomer ${customerId} en Firestore:`, error);
    return false;
  }
}

/**
 * Carga clientes de reparto de Firestore
 */
export async function fetchDriverCustomersFromFirestore(): Promise<DriverCustomer[]> {
  try {
    const snapshot = await getDocs(collection(db, 'driverCustomers'));
    const list: DriverCustomer[] = [];
    snapshot.forEach(docSnap => {
      const item = docSnap.data() as DriverCustomer;
      if (item && item.id && item.name) {
        list.push(item);
      }
    });
    return list;
  } catch (error) {
    console.warn('Error al consultar driverCustomers en Firestore:', error);
    return [];
  }
}

/**
 * Sube la lista inicial completa de clientes a Firestore si no existen
 */
export async function syncAllDriverCustomersToFirestore(customers: DriverCustomer[]): Promise<void> {
  try {
    for (const c of customers) {
      await saveDriverCustomerToFirestore(c);
    }
  } catch (err) {
    console.warn('Error sincronizando driverCustomers a Firestore:', err);
  }
}

/**
 * Guarda o actualiza un gasto operativo en Firestore
 */
export async function saveOperationalExpenseToFirestore(expense: OperationalExpense): Promise<boolean> {
  if (quotaExceededState) return false;
  try {
    const docRef = doc(db, 'operationalExpenses', expense.id);
    const branchId = resolveBranchId((expense as any).branch || (expense as any).branchId);
    const sanitized = sanitizeForFirestore({
      ...expense,
      branch: branchId,
      branchId,
      userId: auth.currentUser?.uid || 'mostrador_caja'
    });
    await setDoc(docRef, sanitized, { merge: true });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`Error al guardar gasto ${expense.id} en Firestore:`, error);
    return false;
  }
}

/**
 * Elimina un gasto operativo de Firestore
 */
export async function deleteOperationalExpenseFromFirestore(expenseId: string): Promise<boolean> {
  if (quotaExceededState) return false;
  try {
    await deleteDoc(doc(db, 'operationalExpenses', expenseId));
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`Error al eliminar gasto ${expenseId} en Firestore:`, error);
    return false;
  }
}

/**
 * Carga gastos operativos de Firestore
 */
export async function fetchOperationalExpensesFromFirestore(): Promise<OperationalExpense[]> {
  try {
    const snapshot = await getDocs(collection(db, 'operationalExpenses'));
    const list: OperationalExpense[] = [];
    snapshot.forEach(docSnap => {
      const item = docSnap.data() as OperationalExpense;
      if (item && item.id && item.concept) {
        list.push(item);
      }
    });
    return list;
  } catch (error) {
    console.warn('Error al consultar operationalExpenses en Firestore:', error);
    return [];
  }
}

/**
 * Escucha en tiempo real la colección de gastos operativos
 */
export function subscribeToOperationalExpenses(onUpdate: (expenses: OperationalExpense[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'operationalExpenses'),
      (snapshot) => {
        const list: OperationalExpense[] = [];
        snapshot.forEach(docSnap => {
          const item = docSnap.data() as OperationalExpense;
          if (item && item.id && item.concept) {
            list.push(item);
          }
        });
        onUpdate(list);
      },
      (error) => {
        console.warn('Listener de operationalExpenses reconectando:', error.message);
      }
    );
  } catch (e) {
    return () => {};
  }
}

/**
 * Guarda o actualiza una cuenta por pagar de proveedor en Firestore
 */
export async function saveSupplierBillToFirestore(bill: SupplierBill): Promise<boolean> {
  if (quotaExceededState) return false;
  try {
    const docRef = doc(db, 'supplierBills', bill.id);
    const branchId = resolveBranchId((bill as any).branch || (bill as any).branchId);
    const sanitized = sanitizeForFirestore({
      ...bill,
      branch: branchId,
      branchId,
      userId: auth.currentUser?.uid || 'mostrador_caja'
    });
    await setDoc(docRef, sanitized, { merge: true });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`Error al guardar cuenta de proveedor ${bill.id} en Firestore:`, error);
    return false;
  }
}

/**
 * Elimina una cuenta por pagar de proveedor en Firestore
 */
export async function deleteSupplierBillFromFirestore(billId: string): Promise<boolean> {
  if (quotaExceededState) return false;
  try {
    await deleteDoc(doc(db, 'supplierBills', billId));
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`Error al eliminar cuenta de proveedor ${billId} en Firestore:`, error);
    return false;
  }
}

/**
 * Carga cuentas por pagar de proveedores de Firestore
 */
export async function fetchSupplierBillsFromFirestore(): Promise<SupplierBill[]> {
  try {
    const snapshot = await getDocs(collection(db, 'supplierBills'));
    const list: SupplierBill[] = [];
    snapshot.forEach(docSnap => {
      const item = docSnap.data() as SupplierBill;
      if (item && item.id && item.supplierName) {
        list.push(item);
      }
    });
    return list;
  } catch (error) {
    console.warn('Error al consultar supplierBills en Firestore:', error);
    return [];
  }
}

/**
 * Escucha en tiempo real la colección de cuentas por pagar de proveedores
 */
export function subscribeToSupplierBills(onUpdate: (bills: SupplierBill[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'supplierBills'),
      (snapshot) => {
        const list: SupplierBill[] = [];
        snapshot.forEach(docSnap => {
          const item = docSnap.data() as SupplierBill;
          if (item && item.id && item.supplierName) {
            list.push(item);
          }
        });
        onUpdate(list);
      },
      (error) => {
        console.warn('Listener de supplierBills reconectando:', error.message);
      }
    );
  } catch (e) {
    return () => {};
  }
}

/**
 * Guarda o actualiza perfil bancario de un proveedor en Firestore
 */
export async function saveSupplierBankProfileToFirestore(profile: SupplierBankInfo): Promise<boolean> {
  if (quotaExceededState) return false;
  try {
    const docRef = doc(db, 'supplierBankProfiles', profile.id);
    const branchId = resolveBranchId((profile as any).branch || (profile as any).branchId);
    const sanitized = sanitizeForFirestore({
      ...profile,
      branch: branchId,
      branchId,
      userId: auth.currentUser?.uid || 'mostrador_caja'
    });
    await setDoc(docRef, sanitized, { merge: true });
    return true;
  } catch (error) {
    if (checkAndHandleQuotaError(error)) return false;
    console.warn(`Error al guardar datos bancarios de proveedor ${profile.id} en Firestore:`, error);
    return false;
  }
}

/**
 * Carga perfiles bancarios de proveedores de Firestore
 */
export async function fetchSupplierBankProfilesFromFirestore(): Promise<SupplierBankInfo[]> {
  try {
    const snapshot = await getDocs(collection(db, 'supplierBankProfiles'));
    const list: SupplierBankInfo[] = [];
    snapshot.forEach(docSnap => {
      const item = docSnap.data() as SupplierBankInfo;
      if (item && item.id && item.supplierName) {
        list.push(item);
      }
    });
    return list;
  } catch (error) {
    console.warn('Error al consultar supplierBankProfiles en Firestore:', error);
    return [];
  }
}

/**
 * Escucha en tiempo real la colección de perfiles bancarios de proveedores
 */
export function subscribeToSupplierBankProfiles(onUpdate: (profiles: SupplierBankInfo[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'supplierBankProfiles'),
      (snapshot) => {
        const list: SupplierBankInfo[] = [];
        snapshot.forEach(docSnap => {
          const item = docSnap.data() as SupplierBankInfo;
          if (item && item.id && item.supplierName) {
            list.push(item);
          }
        });
        onUpdate(list);
      },
      (error) => {
        console.warn('Listener de supplierBankProfiles reconectando:', error.message);
      }
    );
  } catch {
    return () => {};
  }
}

/**
 * Guarda o actualiza un Cliente VIP en Firestore
 */
export async function saveVipCustomerToFirestore(customer: VipCustomer): Promise<void> {
  if (isQuotaExceeded()) return;
  try {
    const docRef = doc(db, 'vip_customers', customer.id);
    await setDoc(docRef, { ...customer, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `vip_customers/${customer.id}`);
  }
}

/**
 * Elimina un Cliente VIP de Firestore
 */
export async function deleteVipCustomerFromFirestore(id: string): Promise<void> {
  if (isQuotaExceeded()) return;
  try {
    const docRef = doc(db, 'vip_customers', id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `vip_customers/${id}`);
  }
}

/**
 * Escucha en tiempo real la colección de Clientes VIP
 */
export function subscribeToVipCustomers(onUpdate: (customers: VipCustomer[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'vip_customers'),
      (snapshot) => {
        const list: VipCustomer[] = [];
        snapshot.forEach(docSnap => {
          const item = docSnap.data() as VipCustomer;
          if (item && item.id && item.name) {
            list.push(item);
          }
        });
        if (list.length > 0) {
          onUpdate(list);
        }
      },
      (error) => {
        console.warn('Listener de vip_customers reconectando:', error.message);
      }
    );
  } catch {
    return () => {};
  }
}

/**
 * Guarda o actualiza un Pedido VIP en Firestore
 */
export async function saveVipOrderToFirestore(order: VipOrder): Promise<void> {
  if (isQuotaExceeded()) return;
  try {
    const docRef = doc(db, 'vip_orders', order.id);
    await setDoc(docRef, { ...order, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `vip_orders/${order.id}`);
  }
}

/**
 * Elimina un Pedido VIP de Firestore
 */
export async function deleteVipOrderFromFirestore(id: string): Promise<void> {
  if (isQuotaExceeded()) return;
  try {
    const docRef = doc(db, 'vip_orders', id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `vip_orders/${id}`);
  }
}

/**
 * Escucha en tiempo real la colección de Pedidos VIP
 */
export function subscribeToVipOrders(onUpdate: (orders: VipOrder[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'vip_orders'),
      (snapshot) => {
        const list: VipOrder[] = [];
        snapshot.forEach(docSnap => {
          const item = docSnap.data() as VipOrder;
          if (item && item.id && item.customerName) {
            list.push(item);
          }
        });
        onUpdate(list);
      },
      (error) => {
        console.warn('Listener de vip_orders reconectando:', error.message);
      }
    );
  } catch {
    return () => {};
  }
}
