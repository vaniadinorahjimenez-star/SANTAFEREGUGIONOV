/**
 * Adaptador de compatibilidad hacia Supabase (Proyecto: icroicyyekqxmufyxeqc)
 * Se eliminaron las llamadas a Firebase Firestore para evitar límites de cuota diaria.
 * Todas las operaciones se redirigen directamente a Supabase + Sincronización en tiempo real.
 */
import {
  SUPABASE_PROJECT_ID,
  SUPABASE_URL,
  checkSupabaseConnection,
  getCachedSupabaseStatus,
  onSupabaseStatusChange,
  resolveBranchId,
  saveSaleTicketToSupabase,
  deleteSaleTicketFromSupabase,
  saveShiftCutToSupabase,
  saveOrderToSupabase,
  deleteOrderFromSupabase,
  saveCustomerToSupabase,
  saveOutflowToSupabase,
  deleteOutflowFromSupabase,
  fetchTicketsFromSupabase,
  fetchOrdersFromSupabase,
  fetchCustomersFromSupabase,
  fetchShiftCutsFromSupabase,
  fetchOutflowsFromSupabase,
  subscribeToSupabaseTickets,
  subscribeToSupabaseOrders,
  subscribeToSupabaseShiftCuts,
  subscribeToSupabaseOutflows,
  subscribeToSupabaseDailyDelivery,
  saveDailyDeliveryToSupabase,
  deleteClientDeliveryFromSupabase,
  fetchDailyDeliveryFromSupabase,
  fetchAllDailyDeliveriesFromSupabase,
  subscribeToAllSupabaseDailyDeliveries,
  subscribeToSupabaseDriverCustomers,
  saveDriverCustomerToSupabase,
  deleteDriverCustomerFromSupabase,
  fetchDriverCustomersFromSupabase,
  syncAllDriverCustomersToSupabase,
  saveOperationalExpenseToSupabase,
  deleteOperationalExpenseFromSupabase,
  fetchOperationalExpensesFromSupabase,
  subscribeToSupabaseOperationalExpenses,
  saveSupplierBillToSupabase,
  deleteSupplierBillFromSupabase,
  fetchSupplierBillsFromSupabase,
  subscribeToSupabaseSupplierBills,
  saveSupplierBankProfileToSupabase,
  fetchSupplierBankProfilesFromSupabase,
  subscribeToSupabaseSupplierBankProfiles,
  saveVipCustomerToSupabase,
  deleteVipCustomerFromSupabase,
  fetchVipCustomersFromSupabase,
  subscribeToSupabaseVipCustomers,
  saveVipOrderToSupabase,
  deleteVipOrderFromSupabase,
  fetchVipOrdersFromSupabase,
  subscribeToSupabaseVipOrders,
  saveDriverSettlementToSupabase,
  fetchDriverSettlementsFromSupabase,
  subscribeToSupabaseDriverSettlements,
  fetchDeletedIdsFromSupabase,
  subscribeToSupabaseDeletedRecords,
} from './supabase';

export {
  SUPABASE_PROJECT_ID,
  SUPABASE_URL,
  checkSupabaseConnection,
  getCachedSupabaseStatus,
  onSupabaseStatusChange,
  resolveBranchId,
};

export const auth: { currentUser: { uid: string; email?: string } | null } = {
  currentUser: { uid: 'supabase_pos' },
};

export const db = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function isQuotaExceeded(): boolean {
  return false;
}

export function onQuotaExceededChange(_cb: (exceeded: boolean) => void): () => void {
  return () => {};
}

export function checkAndHandleQuotaError(_error: unknown): boolean {
  return false;
}

export async function testConnection(): Promise<boolean> {
  const status = await checkSupabaseConnection();
  return status.configured && status.tablesReady;
}

export async function autoSilentConnect(): Promise<void> {
  await checkSupabaseConnection().catch(() => {});
}

export async function signInWithGoogle(): Promise<null> {
  return null;
}

export async function logoutFirebase(): Promise<void> {}

export const saveSaleTicketToFirestore = saveSaleTicketToSupabase;
export const deleteSaleTicketFromFirestore = deleteSaleTicketFromSupabase;
export const saveShiftCutToFirestore = saveShiftCutToSupabase;
export const saveOrderToFirestore = saveOrderToSupabase;
export const deleteOrderFromFirestore = deleteOrderFromSupabase;
export const saveCustomerToFirestore = saveCustomerToSupabase;
export const saveOutflowToFirestore = saveOutflowToSupabase;
export const deleteOutflowFromFirestore = deleteOutflowFromSupabase;
export const fetchTicketsFromFirestore = fetchTicketsFromSupabase;
export const fetchOrdersFromFirestore = fetchOrdersFromSupabase;
export const fetchCustomersFromFirestore = fetchCustomersFromSupabase;
export const fetchShiftCutsFromFirestore = fetchShiftCutsFromSupabase;
export const fetchOutflowsFromFirestore = fetchOutflowsFromSupabase;
export const subscribeToFirestoreTickets = subscribeToSupabaseTickets;
export const subscribeToFirestoreOrders = subscribeToSupabaseOrders;
export const subscribeToFirestoreShiftCuts = subscribeToSupabaseShiftCuts;
export const subscribeToFirestoreOutflows = subscribeToSupabaseOutflows;
export const subscribeToDailyDelivery = subscribeToSupabaseDailyDelivery;
export const saveDailyDeliveryToFirestore = saveDailyDeliveryToSupabase;
export const deleteClientDeliveryFromFirestore = deleteClientDeliveryFromSupabase;
export const fetchDailyDeliveryFromFirestore = fetchDailyDeliveryFromSupabase;
export const fetchAllDailyDeliveriesFromFirestore = fetchAllDailyDeliveriesFromSupabase;
export const subscribeToAllDailyDeliveries = subscribeToAllSupabaseDailyDeliveries;
export const subscribeToFirestoreDriverCustomers = subscribeToSupabaseDriverCustomers;
export const saveDriverCustomerToFirestore = saveDriverCustomerToSupabase;
export const deleteDriverCustomerFromFirestore = deleteDriverCustomerFromSupabase;
export const fetchDriverCustomersFromFirestore = fetchDriverCustomersFromSupabase;
export const syncAllDriverCustomersToFirestore = syncAllDriverCustomersToSupabase;
export const saveOperationalExpenseToFirestore = saveOperationalExpenseToSupabase;
export const deleteOperationalExpenseFromFirestore = deleteOperationalExpenseFromSupabase;
export const fetchOperationalExpensesFromFirestore = fetchOperationalExpensesFromSupabase;
export const subscribeToOperationalExpenses = subscribeToSupabaseOperationalExpenses;
export const saveSupplierBillToFirestore = saveSupplierBillToSupabase;
export const deleteSupplierBillFromFirestore = deleteSupplierBillFromSupabase;
export const fetchSupplierBillsFromFirestore = fetchSupplierBillsFromSupabase;
export const subscribeToSupplierBills = subscribeToSupabaseSupplierBills;
export const saveSupplierBankProfileToFirestore = saveSupplierBankProfileToSupabase;
export const fetchSupplierBankProfilesFromFirestore = fetchSupplierBankProfilesFromSupabase;
export const subscribeToSupplierBankProfiles = subscribeToSupabaseSupplierBankProfiles;
export const saveVipCustomerToFirestore = saveVipCustomerToSupabase;
export const deleteVipCustomerFromFirestore = deleteVipCustomerFromSupabase;
export const fetchVipCustomersFromFirestore = fetchVipCustomersFromSupabase;
export const subscribeToVipCustomers = subscribeToSupabaseVipCustomers;
export const saveVipOrderToFirestore = saveVipOrderToSupabase;
export const deleteVipOrderFromFirestore = deleteVipOrderFromSupabase;
export const fetchVipOrdersFromFirestore = fetchVipOrdersFromSupabase;
export const subscribeToVipOrders = subscribeToSupabaseVipOrders;
export const saveDriverSettlementToFirestore = saveDriverSettlementToSupabase;
export const fetchDriverSettlementsFromFirestore = fetchDriverSettlementsFromSupabase;
export const subscribeToDriverSettlements = subscribeToSupabaseDriverSettlements;
export { fetchDeletedIdsFromSupabase, subscribeToSupabaseDeletedRecords };
