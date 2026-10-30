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
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { SaleTicket, BakeryOrder, ShiftCutRecord, CashOutflowItem, Customer } from '../types';

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

// Validación de conexión según directiva del Skill
export async function testConnection(): Promise<boolean> {
  try {
    const q = query(collection(db, 'tickets'), limit(1));
    await getDocs(q);
    return true;
  } catch (error) {
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
 * Guarda o actualiza un SaleTicket individual en Firestore
 * Permite guardar las ventas de forma inmediata y sin problemas
 */
export async function saveSaleTicketToFirestore(ticket: SaleTicket): Promise<boolean> {
  const path = `tickets/${ticket.id}`;
  try {
    const sanitized = sanitizeForFirestore({
      ...ticket,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'tickets', ticket.id), sanitized, { merge: true });
    return true;
  } catch (error) {
    console.warn(`No se pudo enviar ticket ${ticket.id} a Firestore (quedó seguro localmente):`, error);
    return false;
  }
}

/**
 * Guarda un Corte de Turno en Firestore
 */
export async function saveShiftCutToFirestore(cut: ShiftCutRecord): Promise<boolean> {
  const path = `shiftCuts/${cut.id}`;
  try {
    const sanitized = sanitizeForFirestore({
      ...cut,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'shiftCuts', cut.id), sanitized, { merge: true });
    return true;
  } catch (error) {
    console.warn(`No se pudo enviar corte ${cut.id} a Firestore:`, error);
    return false;
  }
}

/**
 * Guarda un Pedido en Firestore
 */
export async function saveOrderToFirestore(order: BakeryOrder): Promise<boolean> {
  const path = `orders/${order.id}`;
  try {
    const sanitized = sanitizeForFirestore({
      ...order,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'orders', order.id), sanitized, { merge: true });
    return true;
  } catch (error) {
    console.warn(`No se pudo enviar pedido ${order.id} a Firestore:`, error);
    return false;
  }
}

/**
 * Guarda un Cliente en Firestore
 */
export async function saveCustomerToFirestore(customer: Customer): Promise<boolean> {
  const path = `customers/${customer.id}`;
  try {
    const sanitized = sanitizeForFirestore({
      ...customer,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'customers', customer.id), sanitized, { merge: true });
    return true;
  } catch (error) {
    console.warn(`No se pudo enviar cliente ${customer.id} a Firestore:`, error);
    return false;
  }
}

/**
 * Guarda una Salida de Efectivo en Firestore
 */
export async function saveOutflowToFirestore(outflow: CashOutflowItem): Promise<boolean> {
  const path = `outflows/${outflow.id}`;
  try {
    const sanitized = sanitizeForFirestore({
      ...outflow,
      userId: auth.currentUser?.uid || 'anonymous_caja'
    });
    await setDoc(doc(db, 'outflows', outflow.id), sanitized, { merge: true });
    return true;
  } catch (error) {
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
    const snapshot = await getDocs(collection(db, path));
    const tickets: SaleTicket[] = [];
    snapshot.forEach(docSnap => {
      const d = docSnap.data() as SaleTicket;
      if (d && (d.id || d.folio)) {
        tickets.push(d);
      }
    });
    return tickets;
  } catch (error) {
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
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const tickets: SaleTicket[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as SaleTicket;
          if (data && (data.id || data.folio)) {
            tickets.push(data);
          }
        });
        if (tickets.length > 0) {
          onUpdate(tickets);
        }
      },
      (error) => {
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
          orders.push(docSnap.data() as BakeryOrder);
        });
        if (orders.length > 0) {
          onUpdate(orders);
        }
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
