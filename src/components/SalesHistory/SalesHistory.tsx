import React, { useState } from 'react';
import { SaleTicket, Settings, ShiftCutRecord, BakeryOrder, Driver, DriverCustomer } from '../../types';
import { 
  TrendingUp, 
  Banknote, 
  CreditCard, 
  Receipt, 
  Calendar, 
  Search, 
  Printer, 
  Eye, 
  Sun, 
  Moon, 
  Clock, 
  CheckCircle2, 
  FileSpreadsheet,
  Trash2,
  Lock,
  ShieldAlert,
  AlertTriangle,
  X,
  KeyRound,
  Truck,
  ShoppingBag,
  Store,
  DollarSign,
  Phone,
  User,
  MapPin,
  MessageCircle,
  Check,
  ChevronRight,
  ArrowDownCircle,
  HelpCircle,
  Sparkles,
  Percent,
  Wallet,
  Wheat,
  Coffee,
  RefreshCw,
  Cloud
} from 'lucide-react';
import { getTodayString, loadOutflows, loadShiftCuts, getNowTimeString, resolveTicketShift } from '../../utils/storage';
import { fetchAndMergeCloud, getCloudSyncStatus } from '../../services/cloudSyncService';
import { playBeep, playCashSound } from '../../utils/audio';
import { ThermalTicket } from '../ThermalTicket';
import { ThermalShiftCutTicket } from '../ShiftCut/ThermalShiftCutTicket';
import { printOrderTicketDirectToPrinter } from '../../utils/thermalPrinter';
import { calculateTicketsBreakdown } from '../../utils/productClassification';
import { WeeklySalesView } from './WeeklySalesView';
import { MonthlyEarningsView } from './MonthlyEarningsView';

interface SalesHistoryProps {
  tickets: SaleTicket[];
  orders?: BakeryOrder[];
  drivers?: Driver[];
  driverCustomers?: DriverCustomer[];
  settings: Settings;
  onDeleteTicket?: (ticketId: string) => void;
  onUpdateOrder?: (order: BakeryOrder) => void;
  onClearOrders?: () => void;
}

// Convert "08:30 AM", "14:15", "03:20 PM" to minutes from 00:00
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const str = timeStr.trim().toUpperCase();
  const isPM = str.includes('PM') || str.includes('P.M.');
  const isAM = str.includes('AM') || str.includes('A.M.');
  
  const clean = str.replace(/[^0-9:]/g, '');
  const parts = clean.split(':');
  let h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  
  return h * 60 + m;
}

// Turno 1: 06:50 AM (410 mins) a 15:00 HRS (900 mins)
// Turno 2: 15:01 HRS (901 mins) a 22:10 HRS (1330 mins)
// Or manually assigned shift if cashier switched earlier
export function getTicketShift(ticketOrTime: string | { shift?: 'turno1' | 'turno2'; time: string }): 'turno1' | 'turno2' {
  if (typeof ticketOrTime === 'string') {
    return resolveTicketShift({ time: ticketOrTime });
  }
  return resolveTicketShift(ticketOrTime);
}

export const SalesHistory: React.FC<SalesHistoryProps> = ({
  tickets,
  orders = [],
  drivers = [],
  driverCustomers = [],
  settings,
  onDeleteTicket,
  onUpdateOrder,
  onClearOrders
}) => {
  const todayStr = getTodayString();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [dateFilterMode, setDateFilterMode] = useState<'hoy' | 'ayer' | 'semana' | 'personalizado'>('hoy');
  
  // Vista principal de Historial de Ventas (Estilo Punto Zakia)
  // 'dia' (Historial y corte por día) | 'semana' (Semanal L-D) | 'meses' (Ganancias por mes Enero-Diciembre)
  const [historyViewMode, setHistoryViewMode] = useState<'dia' | 'semana' | 'meses'>('dia');

  // Sub-Navigation Module in Historial de Caja (para modo día)
  // 'corte_caja' (Mostrador / Turnos) | 'repartos' (Reparto y choferes) | 'pedidos_tienda' (Recoger en tienda) | 'por_cobrar' (Montos pendientes por cobrar)
  const [activeModule, setActiveModule] = useState<'corte_caja' | 'repartos' | 'pedidos_tienda' | 'por_cobrar'>('corte_caja');

  // Search & Specific Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<'todos' | 'efectivo' | 'tarjeta'>('todos');
  const [shiftFilter, setShiftFilter] = useState<'todos' | 'turno1' | 'turno2'>('todos');
  const [driverFilter, setDriverFilter] = useState<'todos' | 'osvaldo' | 'simon' | 'ninguno'>('todos');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<'todos' | 'entregado' | 'en_camino' | 'pendiente'>('todos');
  const [receivableTypeFilter, setReceivableTypeFilter] = useState<'todos' | 'reparto' | 'tienda'>('todos');

  // Modals
  const [ticketToView, setTicketToView] = useState<SaleTicket | null>(null);
  const [shiftCutToPreview, setShiftCutToPreview] = useState<ShiftCutRecord | null>(null);
  const [orderToView, setOrderToView] = useState<BakeryOrder | null>(null);
  
  // Order Settlement / Cobro Modal
  const [orderToSettle, setOrderToSettle] = useState<BakeryOrder | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [settleMethod, setSettleMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [settleSuccessNotice, setSettleSuccessNotice] = useState<string>('');

  // Admin PIN Delete Modal State (Clave 13579)
  const [ticketToDelete, setTicketToDelete] = useState<SaleTicket | null>(null);
  const [adminPinInput, setAdminPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [successDeleteNotice, setSuccessDeleteNotice] = useState<string>('');

  // Sincronización en la Nube Netlify (Combinar PC + Celular)
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [cloudSyncNotice, setCloudSyncNotice] = useState<string>('');

  const handleManualSyncCloud = async () => {
    setIsSyncingCloud(true);
    playBeep(650, 'sine', 0.05);
    try {
      const res = await fetchAndMergeCloud();
      playCashSound();
      const ticketCount = res.mergedData?.tickets?.length ?? tickets.length;
      const orderCount = res.mergedData?.orders?.length ?? orders.length;
      setCloudSyncNotice(`¡Sincronización completada! Se unificaron ${ticketCount} tickets y ${orderCount} pedidos entre PC y teléfono.`);
      setTimeout(() => setCloudSyncNotice(''), 5000);
    } catch {
      setCloudSyncNotice('Sincronización local activa.');
      setTimeout(() => setCloudSyncNotice(''), 3000);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Compute yesterday string
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Compute 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  // Helper para resolver la fecha del ticket de forma infalible
  const getTicketDate = (t: SaleTicket): string => {
    if (t.date && typeof t.date === 'string' && t.date.trim()) return t.date.trim();
    if (t.timestamp && typeof t.timestamp === 'string') return t.timestamp.split('T')[0];
    return todayStr;
  };

  // 1. DATE-MATCHED TICKETS (Mostrador)
  const dateMatchedTickets = tickets.filter(ticket => {
    const tDate = getTicketDate(ticket);
    if (dateFilterMode === 'hoy' && tDate !== todayStr) return false;
    if (dateFilterMode === 'ayer' && tDate !== yesterdayStr) return false;
    if (dateFilterMode === 'semana' && tDate < sevenDaysAgoStr) return false;
    if (dateFilterMode === 'personalizado' && tDate !== selectedDate) return false;
    return true;
  });

  // 2. DATE-MATCHED ORDERS (Repartos y Pedidos Tienda)
  const dateMatchedOrders = orders.filter(order => {
    const orderDate = order.deliveryDate || (order.createdAt ? order.createdAt.split('T')[0] : todayStr);
    if (dateFilterMode === 'hoy' && orderDate !== todayStr) return false;
    if (dateFilterMode === 'ayer' && orderDate !== yesterdayStr) return false;
    if (dateFilterMode === 'semana' && orderDate < sevenDaysAgoStr) return false;
    if (dateFilterMode === 'personalizado' && orderDate !== selectedDate) return false;
    return true;
  });

  // Helper categorization functions
  const isOrderDelivery = (o: BakeryOrder) => {
    return o.deliveryType === 'domicilio' || 
           o.deliveryType === 'reparto' || 
           o.orderChannel === 'reparto' || 
           o.assignedDriverId === 'osvaldo' || 
           o.assignedDriverId === 'simon';
  };

  const isOrderPickup = (o: BakeryOrder) => {
    return !isOrderDelivery(o);
  };

  // Repartos list
  const deliveryOrders = dateMatchedOrders.filter(isOrderDelivery);
  // Pedidos en Tienda list
  const storePickupOrders = dateMatchedOrders.filter(isOrderPickup);

  // All Pending Receivables (Montos por cobrar globales del período o acumulados)
  const allReceivableOrders = dateMatchedOrders.filter(o => {
    const pending = o.pendingAmount > 0 ? o.pendingAmount : (o.paymentStatus !== 'pagado' ? Math.max(0, o.total - (o.deposit || 0)) : 0);
    return o.paymentStatus !== 'pagado' && pending > 0;
  });

  // --- MACRO FINANCIAL METRICS ---
  // A. MOSTRADOR (TICKETS)
  const mostradorTotal = dateMatchedTickets.reduce((acc, t) => acc + t.total, 0);
  const mostradorCash = dateMatchedTickets.filter(t => t.paymentMethod === 'efectivo').reduce((acc, t) => acc + t.total, 0);
  const mostradorCard = dateMatchedTickets.filter(t => t.paymentMethod === 'tarjeta').reduce((acc, t) => acc + t.total, 0);
  const mostradorPieces = dateMatchedTickets.reduce((sum, t) => sum + t.items.reduce((s, it) => s + it.quantity, 0), 0);
  const mostradorBreakdown = calculateTicketsBreakdown(dateMatchedTickets);

  // Turnos
  const turno1Tickets = dateMatchedTickets.filter(t => getTicketShift(t) === 'turno1');
  const turno1Total = turno1Tickets.reduce((acc, t) => acc + t.total, 0);
  const turno1Cash = turno1Tickets.filter(t => t.paymentMethod === 'efectivo').reduce((acc, t) => acc + t.total, 0);
  const turno1Card = turno1Tickets.filter(t => t.paymentMethod === 'tarjeta').reduce((acc, t) => acc + t.total, 0);
  const turno1Breakdown = calculateTicketsBreakdown(turno1Tickets);

  const turno2Tickets = dateMatchedTickets.filter(t => getTicketShift(t) === 'turno2');
  const turno2Total = turno2Tickets.reduce((acc, t) => acc + t.total, 0);
  const turno2Cash = turno2Tickets.filter(t => t.paymentMethod === 'efectivo').reduce((acc, t) => acc + t.total, 0);
  const turno2Card = turno2Tickets.filter(t => t.paymentMethod === 'tarjeta').reduce((acc, t) => acc + t.total, 0);
  const turno2Breakdown = calculateTicketsBreakdown(turno2Tickets);

  // B. REPARTOS (MONTOS GENERADOS)
  const deliveryTotalGenerated = deliveryOrders.reduce((acc, o) => acc + o.total, 0);
  const deliveryTotalCollected = deliveryOrders.reduce((acc, o) => {
    if (o.paymentStatus === 'pagado') return acc + o.total;
    return acc + (o.deposit || 0) + (o.collectedAmount || 0);
  }, 0);
  const deliveryTotalPending = deliveryOrders.reduce((acc, o) => {
    if (o.paymentStatus === 'pagado') return acc;
    const p = o.pendingAmount > 0 ? o.pendingAmount : Math.max(0, o.total - (o.deposit || 0) - (o.collectedAmount || 0));
    return acc + p;
  }, 0);
  const deliveryPiecesCount = deliveryOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0), 0);

  // Choferes breakdown
  const osvaldoOrders = deliveryOrders.filter(o => o.assignedDriverId === 'osvaldo');
  const osvaldoTotal = osvaldoOrders.reduce((acc, o) => acc + o.total, 0);
  const osvaldoCollected = osvaldoOrders.reduce((acc, o) => acc + (o.paymentStatus === 'pagado' ? o.total : (o.deposit || 0) + (o.collectedAmount || 0)), 0);
  const osvaldoPending = osvaldoTotal - osvaldoCollected;

  const simonOrders = deliveryOrders.filter(o => o.assignedDriverId === 'simon');
  const simonTotal = simonOrders.reduce((acc, o) => acc + o.total, 0);
  const simonCollected = simonOrders.reduce((acc, o) => acc + (o.paymentStatus === 'pagado' ? o.total : (o.deposit || 0) + (o.collectedAmount || 0)), 0);
  const simonPending = simonTotal - simonCollected;

  // C. PEDIDOS PARA RECOGER EN TIENDA
  const storeOrdersTotalGenerated = storePickupOrders.reduce((acc, o) => acc + o.total, 0);
  const storeOrdersTotalCollected = storePickupOrders.reduce((acc, o) => {
    if (o.paymentStatus === 'pagado') return acc + o.total;
    return acc + (o.deposit || 0) + (o.collectedAmount || 0);
  }, 0);
  const storeOrdersTotalPending = storePickupOrders.reduce((acc, o) => {
    if (o.paymentStatus === 'pagado') return acc;
    const p = o.pendingAmount > 0 ? o.pendingAmount : Math.max(0, o.total - (o.deposit || 0) - (o.collectedAmount || 0));
    return acc + p;
  }, 0);
  const storeOrdersPiecesCount = storePickupOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0), 0);

  // D. MONTOS POR COBRAR (CUENTAS POR COBRAR)
  const totalGlobalPending = deliveryTotalPending + storeOrdersTotalPending;
  const countPendingOrders = allReceivableOrders.length;

  // Gran Total de Ventas Globales (Mostrador + Repartos + Pedidos Tienda)
  const grandTotalSales = mostradorTotal + deliveryTotalGenerated + storeOrdersTotalGenerated;
  const grandTotalCollectedCashAndCard = mostradorTotal + deliveryTotalCollected + storeOrdersTotalCollected;

  // E. GASTOS / SALIDAS A PROVEEDORES Y GANANCIA NETA DEL PERÍODO
  const allOutflowsList = loadOutflows();
  const relevantPeriodOutflows = allOutflowsList.filter(o => {
    const oDate = o.date || (o.createdAt ? o.createdAt.split('T')[0] : '');
    if (dateFilterMode === 'hoy' && oDate !== todayStr) return false;
    if (dateFilterMode === 'ayer' && oDate !== yesterdayStr) return false;
    if (dateFilterMode === 'semana' && oDate < sevenDaysAgoStr) return false;
    if (dateFilterMode === 'personalizado' && oDate !== selectedDate) return false;
    return true;
  });
  const totalPeriodOutflows = relevantPeriodOutflows.reduce((sum, o) => sum + o.amount, 0);
  const netPeriodProfit = mostradorTotal - totalPeriodOutflows;
  const netPeriodMargin = mostradorTotal > 0 ? Math.round((netPeriodProfit / mostradorTotal) * 100) : 0;

  // --- FILTERS PER VIEW ---
  // Filtered tickets (Corte mostrador)
  const filteredTickets = dateMatchedTickets.filter(ticket => {
    if (shiftFilter !== 'todos' && getTicketShift(ticket) !== shiftFilter) return false;
    if (paymentFilter !== 'todos' && ticket.paymentMethod !== paymentFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchFolio = ticket.folio.toLowerCase().includes(q);
      const matchCustomer = ticket.customerName?.toLowerCase().includes(q);
      const matchPhone = ticket.customerPhone?.includes(q);
      if (!matchFolio && !matchCustomer && !matchPhone) return false;
    }
    return true;
  });

  // Filtered Delivery Orders
  const filteredDeliveryOrders = deliveryOrders.filter(order => {
    if (driverFilter !== 'todos' && order.assignedDriverId !== driverFilter) return false;
    if (deliveryStatusFilter !== 'todos' && order.deliveryStatus !== deliveryStatusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchFolio = order.folio.toLowerCase().includes(q);
      const matchCustomer = order.customerName.toLowerCase().includes(q);
      const matchPhone = order.customerPhone?.includes(q);
      const matchAddress = order.address?.toLowerCase().includes(q);
      if (!matchFolio && !matchCustomer && !matchPhone && !matchAddress) return false;
    }
    return true;
  });

  // Filtered Store Pickup Orders
  const filteredStoreOrders = storePickupOrders.filter(order => {
    if (deliveryStatusFilter !== 'todos' && order.deliveryStatus !== deliveryStatusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchFolio = order.folio.toLowerCase().includes(q);
      const matchCustomer = order.customerName.toLowerCase().includes(q);
      const matchPhone = order.customerPhone?.includes(q);
      if (!matchFolio && !matchCustomer && !matchPhone) return false;
    }
    return true;
  });

  // Filtered Receivables
  const filteredReceivables = allReceivableOrders.filter(order => {
    const isDel = isOrderDelivery(order);
    if (receivableTypeFilter === 'reparto' && !isDel) return false;
    if (receivableTypeFilter === 'tienda' && isDel) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchFolio = order.folio.toLowerCase().includes(q);
      const matchCustomer = order.customerName.toLowerCase().includes(q);
      const matchPhone = order.customerPhone?.includes(q);
      if (!matchFolio && !matchCustomer && !matchPhone) return false;
    }
    return true;
  });

  // --- ACTIONS ---
  // Handle Delete Ticket with PIN
  const handleOpenDeleteModal = (ticket: SaleTicket) => {
    setTicketToDelete(ticket);
    setAdminPinInput('');
    setPinError('');
  };

  const handleConfirmDelete = () => {
    if (!ticketToDelete) return;
    const validPin = settings.adminPin || '13579';
    if (adminPinInput.trim() === '13579' || adminPinInput.trim() === validPin) {
      const deletedFolio = ticketToDelete.folio;
      if (onDeleteTicket) {
        onDeleteTicket(ticketToDelete.id);
      }
      playBeep(450, 'sawtooth', 0.15);
      if (ticketToView?.id === ticketToDelete.id) {
        setTicketToView(null);
      }
      setTicketToDelete(null);
      setAdminPinInput('');
      setPinError('');
      setSuccessDeleteNotice(`¡Venta ${deletedFolio} eliminada correctamente!`);
      setTimeout(() => setSuccessDeleteNotice(''), 4000);
    } else {
      playBeep(250, 'sawtooth', 0.2);
      setPinError('❌ Clave de administrador incorrecta. Se requiere la clave 13579.');
    }
  };

  // Open Settle Order Modal
  const handleOpenSettleModal = (order: BakeryOrder) => {
    playBeep(650, 'sine', 0.03);
    const pending = order.pendingAmount > 0 ? order.pendingAmount : Math.max(0, order.total - (order.deposit || 0) - (order.collectedAmount || 0));
    setOrderToSettle(order);
    setSettleAmount(pending.toString());
    setSettleMethod('efectivo');
    setSettleNotes('');
  };

  // Confirm Settle / Cobro of Order
  const handleConfirmSettleOrder = () => {
    if (!orderToSettle || !onUpdateOrder) return;
    const amountNum = parseFloat(settleAmount) || 0;
    if (amountNum <= 0) return;

    const currentPending = orderToSettle.pendingAmount > 0 
      ? orderToSettle.pendingAmount 
      : Math.max(0, orderToSettle.total - (orderToSettle.deposit || 0) - (orderToSettle.collectedAmount || 0));
    
    const newPending = Math.max(0, currentPending - amountNum);
    const newCollected = (orderToSettle.collectedAmount || 0) + amountNum;
    const isFullyPaid = newPending === 0;

    const updatedOrder: BakeryOrder = {
      ...orderToSettle,
      collectedAmount: newCollected,
      pendingAmount: newPending,
      paymentStatus: isFullyPaid ? 'pagado' : 'anticipo',
      paidDate: todayStr,
      paidMethod: settleMethod,
      deliveryStatus: orderToSettle.deliveryStatus === 'pendiente' && isFullyPaid ? 'entregado' : orderToSettle.deliveryStatus,
      accountingNotes: settleNotes ? `${orderToSettle.accountingNotes || ''} | [Cobro Historial: $${amountNum} por ${settleMethod} - ${settleNotes}]`.trim() : orderToSettle.accountingNotes
    };

    onUpdateOrder(updatedOrder);
    playCashSound();
    
    setSettleSuccessNotice(`¡Cobro de $${amountNum}.00 registrado para pedido #${orderToSettle.folio}!`);
    setTimeout(() => setSettleSuccessNotice(''), 4000);
    setOrderToSettle(null);
  };

  // Print Shift Cut Ticket
  const handlePrintCut = (shiftType: 'turno1' | 'turno2' | 'dia_completo') => {
    let targetTickets = dateMatchedTickets;
    let shiftTitle = 'Turno Completo (Día)';
    let shiftCashier = 'Responsable de Sucursal';

    if (shiftType === 'turno1') {
      targetTickets = turno1Tickets;
      shiftTitle = 'Turno 1 (Mañana 07:00 a 15:00)';
      shiftCashier = 'Cajero Turno 1';
    } else if (shiftType === 'turno2') {
      targetTickets = turno2Tickets;
      shiftTitle = 'Turno 2 (Tarde 15:00 a 22:00)';
      shiftCashier = 'Cajero Turno 2';
    }

    const cutTotal = targetTickets.reduce((acc, t) => acc + t.total, 0);
    const cutCash = targetTickets.filter(t => t.paymentMethod === 'efectivo').reduce((acc, t) => acc + t.total, 0);
    const cutCard = targetTickets.filter(t => t.paymentMethod === 'tarjeta').reduce((acc, t) => acc + t.total, 0);
    const cutPieces = targetTickets.reduce((sum, t) => sum + t.items.reduce((s, it) => s + it.quantity, 0), 0);
    const cutBreakdown = calculateTicketsBreakdown(targetTickets);
    const allOutflows = loadOutflows();
    const targetDate = dateFilterMode === 'hoy' ? todayStr : (dateFilterMode === 'ayer' ? yesterdayStr : selectedDate);
    const relevantOutflows = allOutflows.filter(o => {
      const oDate = o.date || (o.createdAt ? o.createdAt.split('T')[0] : '');
      if (oDate && oDate !== targetDate) return false;
      if (!oDate) return false;
      if (shiftType !== 'dia_completo' && o.shiftCode && o.shiftCode !== shiftType) return false;
      return true;
    });
    const totalOutflows = relevantOutflows.reduce((sum, o) => sum + o.amount, 0);
    const expectedCash = 300 + cutCash - totalOutflows;

    const cutRecord: ShiftCutRecord = {
      id: `cut-hist-${Date.now()}`,
      folio: `CORTE-${shiftType.toUpperCase()}`,
      date: dateFilterMode === 'hoy' ? todayStr : selectedDate,
      time: getNowTimeString(),
      cashierName: shiftCashier,
      shiftName: shiftTitle,
      initialCash: 300,
      totalGrossSales: cutTotal,
      totalCashSales: cutCash,
      totalCardSales: cutCard,
      totalBreadSales: cutBreakdown.breadTotal,
      totalNonBreadSales: cutBreakdown.nonBreadTotal,
      breadPieces: cutBreakdown.breadPieces,
      nonBreadPieces: cutBreakdown.nonBreadPieces,
      totalPieces: cutPieces,
      ticketsCount: targetTickets.length,
      outflows: relevantOutflows,
      totalOutflows,
      expectedCashInDrawer: expectedCash,
      createdAt: new Date().toISOString()
    };

    setShiftCutToPreview(cutRecord);
  };

  // Export to CSV
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    if (activeModule === 'corte_caja') {
      headers = ['Folio', 'Fecha', 'Hora', 'Turno', 'Cliente', 'Telefono', 'Metodo Pago', 'Subtotal', 'Descuento', 'Total', 'Puntos'];
      rows = filteredTickets.map(t => [
        t.folio,
        t.date,
        t.time,
        getTicketShift(t) === 'turno1' ? 'Turno 1 (Matutino)' : 'Turno 2 (Vespertino)',
        `"${t.customerName || 'Publico General'}"`,
        t.customerPhone || '',
        t.paymentMethod,
        t.subtotal,
        t.discount,
        t.total,
        t.pointsEarned
      ]);
    } else if (activeModule === 'repartos') {
      headers = ['Folio', 'Fecha', 'Hora', 'Cliente', 'Telefono', 'Direccion', 'Repartidor', 'Piezas', 'Total', 'Anticipo', 'Saldo Pendiente', 'Estado Pago', 'Estado Entrega'];
      rows = filteredDeliveryOrders.map(o => [
        o.folio,
        o.deliveryDate,
        o.deliveryTime,
        `"${o.customerName}"`,
        o.customerPhone || '',
        `"${o.address || ''}"`,
        o.assignedDriverId,
        o.items.reduce((s, it) => s + it.quantity, 0),
        o.total,
        o.deposit || 0,
        o.pendingAmount || 0,
        o.paymentStatus,
        o.deliveryStatus
      ]);
    } else if (activeModule === 'pedidos_tienda') {
      headers = ['Folio', 'Fecha', 'Hora Entrega', 'Cliente', 'Telefono', 'Piezas', 'Total', 'Anticipo', 'Saldo Pendiente', 'Estado Pago', 'Estado Entrega'];
      rows = filteredStoreOrders.map(o => [
        o.folio,
        o.deliveryDate,
        o.deliveryTime,
        `"${o.customerName}"`,
        o.customerPhone || '',
        o.items.reduce((s, it) => s + it.quantity, 0),
        o.total,
        o.deposit || 0,
        o.pendingAmount || 0,
        o.paymentStatus,
        o.deliveryStatus
      ]);
    } else {
      headers = ['Folio', 'Fecha', 'Tipo', 'Cliente', 'Telefono', 'Asignado', 'Total', 'Anticipo', 'Saldo Pendiente a Cobrar', 'Estado Pago'];
      rows = filteredReceivables.map(o => [
        o.folio,
        o.deliveryDate,
        isOrderDelivery(o) ? 'Reparto' : 'Tienda',
        `"${o.customerName}"`,
        o.customerPhone || '',
        isOrderDelivery(o) ? o.assignedDriverId : 'Mostrador',
        o.total,
        o.deposit || 0,
        o.pendingAmount || Math.max(0, o.total - (o.deposit || 0)),
        o.paymentStatus
      ]);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SantaFe_${activeModule}_${selectedDate || 'reporte'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 pb-12">
      {/* 1. Header Banner & Quick Actions */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#D95D39] via-amber-600 to-orange-500 text-white flex items-center justify-center font-bold text-2xl shadow-md">
            📊
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              Historial de Caja, Repartos y Cuentas por Cobrar
            </h1>
            <p className="text-xs text-slate-600 font-bold">
              Corte de Turnos (T1 & T2) · Montos de Reparto · Pedidos en Tienda · Cuentas por Cobrar
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Botón Sincronizar Nube (Combinar PC + Celular) */}
          <button
            id="cloud-sync-btn"
            type="button"
            onClick={handleManualSyncCloud}
            disabled={isSyncingCloud}
            className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white font-black px-3.5 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="Combina las ventas registradas en PC y Teléfono en un solo total unificado"
          >
            <RefreshCw className={`w-4 h-4 text-white ${isSyncingCloud ? 'animate-spin' : ''}`} />
            <span>{isSyncingCloud ? 'Combinando...' : 'Sincronizar Nube (PC + Celular)'}</span>
          </button>

          <button
            id="print-full-day-btn"
            type="button"
            onClick={() => handlePrintCut('dia_completo')}
            className="bg-slate-900 hover:bg-black text-white font-black px-3.5 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>Imprimir Corte Día Completo (Z)</span>
          </button>

          <button
            id="export-csv-btn"
            type="button"
            onClick={handleExportCSV}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer border border-slate-300"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Exportar CSV</span>
          </button>

          {onClearOrders && (
            <button
              id="clear-orders-history-btn"
              type="button"
              onClick={() => {
                if (window.confirm('¿Deseas limpiar todos los montos de repartos, pide y recoge y cuentas por cobrar dejándolos en ceros ($0)? (Las ventas y cortes de mostrador se conservarán intactos)')) {
                  onClearOrders();
                  playCashSound();
                  setCloudSyncNotice('🧹 Montos de repartos, pide y recoge y cuentas por cobrar limpiados a ceros ($0).');
                  setTimeout(() => setCloudSyncNotice(''), 4000);
                }
              }}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 transition-colors cursor-pointer border border-rose-200"
              title="Limpia todos los pedidos de reparto, pide y recoge y montos por cobrar dejándolos en ceros"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Limpiar Repartos y Cobros ($0)</span>
            </button>
          )}
        </div>
      </div>

      {/* Cloud Sync Notification */}
      {cloudSyncNotice && (
        <div className="bg-sky-600 text-white p-3.5 rounded-2xl shadow-md flex items-center justify-between gap-2 text-xs font-black animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-200 animate-pulse" />
            <span>{cloudSyncNotice}</span>
          </div>
          <button onClick={() => setCloudSyncNotice('')} className="text-sky-100 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Notifications */}
      {successDeleteNotice && (
        <div className="bg-emerald-500 text-white p-3.5 rounded-2xl shadow-md flex items-center justify-between gap-2 text-xs font-black animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-100" />
            <span>{successDeleteNotice}</span>
          </div>
          <button onClick={() => setSuccessDeleteNotice('')} className="text-emerald-100 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {settleSuccessNotice && (
        <div className="bg-purple-600 text-white p-3.5 rounded-2xl shadow-md flex items-center justify-between gap-2 text-xs font-black animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{settleSuccessNotice}</span>
          </div>
          <button onClick={() => setSettleSuccessNotice('')} className="text-purple-100 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. SELECTOR DE VISTA PRINCIPAL (Estilo Punto de Venta Zakia) */}
      <div className="bg-white rounded-3xl p-2.5 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            id="history-mode-dia-btn"
            onClick={() => setHistoryViewMode('dia')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              historyViewMode === 'dia'
                ? 'bg-gradient-to-r from-[#D95D39] to-amber-600 text-white shadow-md scale-102 ring-2 ring-orange-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <span>📅</span>
            <span>Por Día (Caja & Turnos)</span>
          </button>

          <button
            type="button"
            id="history-mode-semana-btn"
            onClick={() => setHistoryViewMode('semana')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              historyViewMode === 'semana'
                ? 'bg-gradient-to-r from-[#D95D39] to-amber-600 text-white shadow-md scale-102 ring-2 ring-orange-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <span>📆</span>
            <span>Por Semana (Lunes a Domingo)</span>
          </button>

          <button
            type="button"
            id="history-mode-meses-btn"
            onClick={() => setHistoryViewMode('meses')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              historyViewMode === 'meses'
                ? 'bg-gradient-to-r from-[#D95D39] to-amber-600 text-white shadow-md scale-102 ring-2 ring-orange-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <span>📈</span>
            <span>Ganancias por Mes (Enero, Feb...)</span>
          </button>
        </div>

        <div className="text-xs font-bold text-slate-500 hidden md:flex items-center gap-1.5 px-3">
          <span>Panadería Santa Fé Zakia</span>
          <span>•</span>
          <span className="text-emerald-700 font-black">Historial Financiero</span>
        </div>
      </div>

      {/* VISTA SEMANAL (Lunes a Domingo) */}
      {historyViewMode === 'semana' && (
        <WeeklySalesView
          tickets={tickets}
          orders={orders}
          outflows={allOutflowsList}
          onSelectDay={(dateStr) => {
            setSelectedDate(dateStr);
            setDateFilterMode('personalizado');
            setHistoryViewMode('dia');
          }}
        />
      )}

      {/* VISTA GANANCIAS POR MES (Enero a Diciembre) */}
      {historyViewMode === 'meses' && (
        <MonthlyEarningsView
          tickets={tickets}
          orders={orders}
          outflows={allOutflowsList}
          onSelectDay={(dateStr) => {
            setSelectedDate(dateStr);
            setDateFilterMode('personalizado');
            setHistoryViewMode('dia');
          }}
        />
      )}

      {/* VISTA DIARIA (Corte de Turnos y Cajas) */}
      {historyViewMode === 'dia' && (
        <>
          {/* Banner Resumen de Ganancia Neta del Día / Período */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-4 sm:p-5 shadow-md flex flex-wrap items-center justify-between gap-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400 text-emerald-400 flex items-center justify-center text-xl font-black">
                💵
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Balance Financiero del Día ({dateFilterMode === 'hoy' ? 'Hoy' : dateFilterMode === 'ayer' ? 'Ayer' : dateFilterMode === 'semana' ? 'Últimos 7 Días' : selectedDate})
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                    ${netPeriodProfit.toLocaleString('es-MX')}.00
                  </span>
                  <span className="text-xs text-emerald-200 font-bold bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                    {netPeriodMargin}% Utilidad Neta
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs font-bold">
              <div className="bg-white/10 px-3 py-1.5 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Ventas Mostrador</span>
                <span className="text-amber-300 font-black">${mostradorTotal.toLocaleString('es-MX')}.00</span>
              </div>
              <div className="bg-white/10 px-3 py-1.5 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Gastos a Proveedores</span>
                <span className="text-rose-300 font-black">-${totalPeriodOutflows.toLocaleString('es-MX')}.00</span>
              </div>
              <div className="bg-white/10 px-3 py-1.5 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Total Piezas</span>
                <span className="text-white font-black">{mostradorPieces} pzs</span>
              </div>
            </div>
          </div>

          {/* 2. TOP MACRO FINANCIAL EXECUTIVE CARDS (Resumen del Día / Período) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* CARD 1: CORTE DEL DÍA / MOSTRADOR */}
        <div 
          onClick={() => setActiveModule('corte_caja')}
          className={`p-4 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden ${
            activeModule === 'corte_caja'
              ? 'bg-amber-50/80 border-amber-500 shadow-md ring-2 ring-amber-300'
              : 'bg-white border-amber-200 hover:border-amber-400 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
              <span>🥖 Corte Mostrador</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
              T1+T2
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              ${mostradorTotal}.00
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 font-bold mt-1 pt-1.5 border-t border-amber-100">
              <span className="text-emerald-700">💵 ${mostradorCash}</span>
              <span className="text-blue-700">💳 ${mostradorCard}</span>
              <span className="text-slate-500">{filteredTickets.length} tks</span>
            </div>
            {/* Desglose Pan vs No Pan */}
            <div className="mt-2 pt-1.5 border-t border-dashed border-amber-200 flex items-center justify-between text-[10px] font-black">
              <span className="text-amber-900">
                🍞 Pan: <strong>${mostradorBreakdown.breadTotal}</strong> <span className="text-[9px] font-normal text-amber-800">({mostradorBreakdown.breadPieces} pzs)</span>
              </span>
              <span className="text-purple-900">
                🥛 Otros: <strong>${mostradorBreakdown.nonBreadTotal}</strong> <span className="text-[9px] font-normal text-purple-800">({mostradorBreakdown.nonBreadPieces} arts)</span>
              </span>
            </div>
          </div>
        </div>

        {/* CARD 2: MONTOS GENERADOS POR REPARTO */}
        <div 
          onClick={() => setActiveModule('repartos')}
          className={`p-4 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden ${
            activeModule === 'repartos'
              ? 'bg-blue-50/80 border-blue-500 shadow-md ring-2 ring-blue-300'
              : 'bg-white border-blue-200 hover:border-blue-400 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
              <span>🛵 Repartos Generados</span>
            </span>
            <span className="text-[10px] font-black bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full">
              {deliveryOrders.length} rutas
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-blue-900 tracking-tight">
              ${deliveryTotalGenerated}.00
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold mt-1 pt-1.5 border-t border-blue-100">
              <span className="text-emerald-700 font-black">Cobrado: ${deliveryTotalCollected}</span>
              <span className="text-amber-700 font-black">Por Cobrar: ${deliveryTotalPending}</span>
            </div>
          </div>
        </div>

        {/* CARD 3: PIDE Y RECOGE (TRASCOS, MAGDA, ETC.) */}
        <div 
          onClick={() => setActiveModule('pedidos_tienda')}
          className={`p-4 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden ${
            activeModule === 'pedidos_tienda'
              ? 'bg-purple-50/80 border-purple-500 shadow-md ring-2 ring-purple-300'
              : 'bg-white border-purple-200 hover:border-purple-400 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-purple-950 flex items-center gap-1.5">
              <span>🛍️ Pide y Recoge</span>
            </span>
            <span className="text-[10px] font-black bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full">
              {storePickupOrders.length} pedidos
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-purple-900 tracking-tight">
              ${storeOrdersTotalGenerated}.00
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold mt-1 pt-1.5 border-t border-purple-100">
              <span className="text-emerald-700 font-black">Pagado: ${storeOrdersTotalCollected}</span>
              <span className="text-amber-700 font-black">Por Cobrar: ${storeOrdersTotalPending}</span>
            </div>
          </div>
        </div>

        {/* CARD 4: MONTOS POR COBRAR (CUENTAS POR COBRAR) */}
        <div 
          onClick={() => setActiveModule('por_cobrar')}
          className={`p-4 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden ${
            activeModule === 'por_cobrar'
              ? 'bg-rose-50/90 border-rose-500 shadow-md ring-2 ring-rose-300'
              : 'bg-white border-rose-200 hover:border-rose-400 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-rose-950 flex items-center gap-1.5">
              <span>⏳ Montos por Cobrar</span>
            </span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
              totalGlobalPending > 0 ? 'bg-rose-100 text-rose-900 animate-pulse' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {countPendingOrders} pendientes
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-rose-700 tracking-tight">
              ${totalGlobalPending}.00
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold mt-1 pt-1.5 border-t border-rose-100">
              <span className="text-slate-600">🛵 Reparto: <strong>${deliveryTotalPending}</strong></span>
              <span className="text-slate-600">🛍️ Pide y Recoge: <strong>${storeOrdersTotalPending}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. DATE & TIME PERIOD BAR */}
      <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
          <button
            id="date-filter-hoy-btn"
            type="button"
            onClick={() => setDateFilterMode('hoy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              dateFilterMode === 'hoy' ? 'bg-[#D95D39] text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Hoy
          </button>
          <button
            id="date-filter-ayer-btn"
            type="button"
            onClick={() => setDateFilterMode('ayer')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              dateFilterMode === 'ayer' ? 'bg-[#D95D39] text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Ayer
          </button>
          <button
            id="date-filter-semana-btn"
            type="button"
            onClick={() => setDateFilterMode('semana')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              dateFilterMode === 'semana' ? 'bg-[#D95D39] text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Últimos 7 Días
          </button>
          <button
            id="date-filter-personalizado-btn"
            type="button"
            onClick={() => setDateFilterMode('personalizado')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              dateFilterMode === 'personalizado' ? 'bg-[#D95D39] text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Por Fecha
          </button>
        </div>

        {dateFilterMode === 'personalizado' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">Día Seleccionado:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1 bg-amber-50 rounded-lg text-xs font-bold border border-amber-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        )}

        {/* Global Search Input */}
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente, folio, teléfono..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
            />
          </div>
        </div>
      </div>

      {/* 4. MAIN NAVIGATION MODULE SELECTOR (TABS) */}
      <div className="flex items-center overflow-x-auto gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <button
          id="module-tab-corte-btn"
          type="button"
          onClick={() => setActiveModule('corte_caja')}
          className={`flex-1 min-w-[170px] py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeModule === 'corte_caja'
              ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-700'
              : 'bg-white hover:bg-slate-50 text-slate-700'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>1. Corte Mostrador ({filteredTickets.length})</span>
        </button>

        <button
          id="module-tab-repartos-btn"
          type="button"
          onClick={() => setActiveModule('repartos')}
          className={`flex-1 min-w-[170px] py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeModule === 'repartos'
              ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700'
              : 'bg-white hover:bg-slate-50 text-slate-700'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>2. Repartos (${deliveryTotalGenerated})</span>
        </button>

        <button
          id="module-tab-tienda-btn"
          type="button"
          onClick={() => setActiveModule('pedidos_tienda')}
          className={`flex-1 min-w-[180px] py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeModule === 'pedidos_tienda'
              ? 'bg-purple-700 text-white shadow-sm ring-1 ring-purple-800'
              : 'bg-white hover:bg-slate-50 text-slate-700'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>3. Pide y Recoge ({storePickupOrders.length})</span>
        </button>

        <button
          id="module-tab-por-cobrar-btn"
          type="button"
          onClick={() => setActiveModule('por_cobrar')}
          className={`flex-1 min-w-[180px] py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeModule === 'por_cobrar'
              ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-700'
              : 'bg-white hover:bg-slate-50 text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>4. Montos por Cobrar (${totalGlobalPending})</span>
          {countPendingOrders > 0 && (
            <span className="bg-rose-200 text-rose-950 text-[10px] px-1.5 py-0.2 rounded-full font-black">
              {countPendingOrders}
            </span>
          )}
        </button>
      </div>

      {/* =========================================================================
          MODULE 1: CORTE DE CAJA / MOSTRADOR (TURNO 1 Y TURNO 2)
          ========================================================================= */}
      {activeModule === 'corte_caja' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* SECCIÓN DESTACADA: 2 CORTES DEL DÍA (TURNO 1 Y TURNO 2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CORTE TURNO 1 */}
            <div className={`bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-white rounded-3xl p-5 border-2 shadow-sm transition-all ${
              shiftFilter === 'turno1' ? 'border-amber-600 ring-2 ring-amber-400/50' : 'border-amber-300'
            }`}>
              <div className="flex items-center justify-between pb-3 border-b border-amber-200">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-black text-base text-slate-900">
                        Turno 1 - Matutino
                      </h3>
                      <span className="bg-amber-200 text-amber-950 font-black text-[10px] px-2 py-0.5 rounded-full border border-amber-300">
                        06:50 AM - 15:00 hrs
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-bold">
                      {turno1Tickets.length} tickets emitidos en este turno
                    </p>
                  </div>
                </div>

                <button
                  id="print-shift1-btn"
                  type="button"
                  onClick={() => handlePrintCut('turno1')}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-black px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Corte T1</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3">
                <div className="bg-white/80 rounded-2xl p-2.5 border border-amber-200 text-center">
                  <div className="text-[10px] font-black uppercase text-slate-500">Total Venta</div>
                  <div className="text-xl font-black text-amber-950 tracking-tight mt-0.5">
                    ${turno1Total}.00
                  </div>
                </div>
                <div className="bg-white/80 rounded-2xl p-2.5 border border-emerald-200 text-center">
                  <div className="text-[10px] font-black uppercase text-emerald-800">Efectivo</div>
                  <div className="text-lg font-black text-emerald-700 tracking-tight mt-0.5">
                    ${turno1Cash}.00
                  </div>
                </div>
                <div className="bg-white/80 rounded-2xl p-2.5 border border-blue-200 text-center">
                  <div className="text-[10px] font-black uppercase text-blue-800">Tarjeta</div>
                  <div className="text-lg font-black text-blue-700 tracking-tight mt-0.5">
                    ${turno1Card}.00
                  </div>
                </div>
              </div>

              {/* Desglose Venta de Pan vs Otros T1 */}
              <div className="mt-3 pt-2.5 border-t border-amber-200/80 grid grid-cols-2 gap-2 text-xs font-bold">
                <div className="bg-amber-100/70 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-amber-950">
                  <span className="flex items-center gap-1">🍞 Pan ({turno1Breakdown.breadPieces} pzs)</span>
                  <span className="font-black text-amber-900">${turno1Breakdown.breadTotal}.00</span>
                </div>
                <div className="bg-purple-100/70 border border-purple-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-purple-950">
                  <span className="flex items-center gap-1">🥛 Otros ({turno1Breakdown.nonBreadPieces} arts)</span>
                  <span className="font-black text-purple-900">${turno1Breakdown.nonBreadTotal}.00</span>
                </div>
              </div>
            </div>

            {/* CORTE TURNO 2 */}
            <div className={`bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-white rounded-3xl p-5 border-2 shadow-sm transition-all ${
              shiftFilter === 'turno2' ? 'border-indigo-600 ring-2 ring-indigo-400/50' : 'border-indigo-300'
            }`}>
              <div className="flex items-center justify-between pb-3 border-b border-indigo-200">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-black text-base text-slate-900">
                        Turno 2 - Vespertino
                      </h3>
                      <span className="bg-indigo-200 text-indigo-950 font-black text-[10px] px-2 py-0.5 rounded-full border border-indigo-300">
                        15:01 hrs - 22:10 hrs
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-bold">
                      {turno2Tickets.length} tickets emitidos en este turno
                    </p>
                  </div>
                </div>

                <button
                  id="print-shift2-btn"
                  type="button"
                  onClick={() => handlePrintCut('turno2')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Corte T2</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3">
                <div className="bg-white/80 rounded-2xl p-2.5 border border-indigo-200 text-center">
                  <div className="text-[10px] font-black uppercase text-slate-500">Total Venta</div>
                  <div className="text-xl font-black text-indigo-950 tracking-tight mt-0.5">
                    ${turno2Total}.00
                  </div>
                </div>
                <div className="bg-white/80 rounded-2xl p-2.5 border border-emerald-200 text-center">
                  <div className="text-[10px] font-black uppercase text-emerald-800">Efectivo</div>
                  <div className="text-lg font-black text-emerald-700 tracking-tight mt-0.5">
                    ${turno2Cash}.00
                  </div>
                </div>
                <div className="bg-white/80 rounded-2xl p-2.5 border border-blue-200 text-center">
                  <div className="text-[10px] font-black uppercase text-blue-800">Tarjeta</div>
                  <div className="text-lg font-black text-blue-700 tracking-tight mt-0.5">
                    ${turno2Card}.00
                  </div>
                </div>
              </div>

              {/* Desglose Venta de Pan vs Otros T2 */}
              <div className="mt-3 pt-2.5 border-t border-indigo-200/80 grid grid-cols-2 gap-2 text-xs font-bold">
                <div className="bg-amber-100/70 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-amber-950">
                  <span className="flex items-center gap-1">🍞 Pan ({turno2Breakdown.breadPieces} pzs)</span>
                  <span className="font-black text-amber-900">${turno2Breakdown.breadTotal}.00</span>
                </div>
                <div className="bg-purple-100/70 border border-purple-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-purple-950">
                  <span className="flex items-center gap-1">🥛 Otros ({turno2Breakdown.nonBreadPieces} arts)</span>
                  <span className="font-black text-purple-900">${turno2Breakdown.nonBreadTotal}.00</span>
                </div>
              </div>
            </div>
          </div>

          {/* BANNER GENERAL: DESGLOSE TOTAL DE PRODUCTOS (PAN VS OTROS/NO PAN) */}
          <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-purple-50 rounded-2xl p-4 border border-amber-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xl shadow-xs">
                🥖
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Desglose Global del Período: Venta de Pan vs Otros Productos (No Pan)
                </h4>
                <p className="text-[11px] text-slate-600 font-medium">
                  Separación automática de venta en panadería vs abarrotes, refrescos, lácteos y otros
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-white px-3.5 py-2 rounded-xl border border-amber-200 shadow-xs flex items-center gap-2">
                <span className="text-base">🍞</span>
                <div>
                  <div className="text-[9px] uppercase font-black text-amber-800">Total Venta Pan</div>
                  <div className="text-sm font-black text-amber-950">
                    ${mostradorBreakdown.breadTotal}.00 <span className="text-xs text-slate-500 font-bold">({mostradorBreakdown.breadPieces} piezas)</span>
                  </div>
                </div>
              </div>

              <div className="bg-white px-3.5 py-2 rounded-xl border border-purple-200 shadow-xs flex items-center gap-2">
                <span className="text-base">🥛</span>
                <div>
                  <div className="text-[9px] uppercase font-black text-purple-800">Total Otros / No Pan</div>
                  <div className="text-sm font-black text-purple-950">
                    ${mostradorBreakdown.nonBreadTotal}.00 <span className="text-xs text-slate-500 font-bold">({mostradorBreakdown.nonBreadPieces} artículos)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Filters: Turno y Método de Pago */}
          <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Turno:</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  id="shift-filter-all-btn"
                  onClick={() => setShiftFilter('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    shiftFilter === 'todos' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Ambos Turnos
                </button>
                <button
                  id="shift-filter-t1-btn"
                  onClick={() => setShiftFilter('turno1')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                    shiftFilter === 'turno1' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-900 hover:text-amber-950'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Turno 1</span>
                </button>
                <button
                  id="shift-filter-t2-btn"
                  onClick={() => setShiftFilter('turno2')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                    shiftFilter === 'turno2' ? 'bg-indigo-600 text-white shadow-xs' : 'text-indigo-900 hover:text-indigo-950'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Turno 2</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Pago:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPaymentFilter('todos')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                    paymentFilter === 'todos' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setPaymentFilter('efectivo')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                    paymentFilter === 'efectivo' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  💵 Efectivo
                </button>
                <button
                  onClick={() => setPaymentFilter('tarjeta')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                    paymentFilter === 'tarjeta' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  💳 Tarjeta
                </button>
              </div>
            </div>
          </div>

          {/* Tickets Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-orange-600" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Listado Detallado de Tickets de Mostrador ({filteredTickets.length})
                </h2>
              </div>
              <span className="text-xs font-black text-slate-600">
                Total en Mostrador: <strong className="text-amber-800">${mostradorTotal}.00</strong> ({mostradorPieces} piezas)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Folio</th>
                    <th className="py-3 px-3">Hora & Turno</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-3">Piezas / Desglose</th>
                    <th className="py-3 px-3">Método</th>
                    <th className="py-3 px-3 text-right">Puntos</th>
                    <th className="py-3 px-4 text-right">Total Cobrado</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 font-bold">
                        No se encontraron tickets con los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((ticket) => {
                      const shift = getTicketShift(ticket);
                      return (
                        <tr key={ticket.id} className="hover:bg-amber-50/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-black text-orange-700">
                            {ticket.folio}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-800">{ticket.time}</div>
                            <span className={`inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.2 rounded mt-0.5 ${
                              shift === 'turno1' 
                                ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                                : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                            }`}>
                              {shift === 'turno1' ? '🌅 T1 (06:50-15:00)' : '🌇 T2 (15:01-22:10)'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {ticket.customerName ? (
                              <div>
                                <strong className="text-slate-900 block font-bold">{ticket.customerName}</strong>
                                {ticket.customerPhone && (
                                  <span className="text-[10px] text-slate-500 font-mono">{ticket.customerPhone}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Público en Mostrador</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="bg-amber-100 text-amber-950 font-black px-2 py-0.5 rounded text-[11px]">
                              {ticket.items.reduce((s, i) => s + i.quantity, 0)} pzs
                            </span>
                            <span className="text-slate-600 text-[10.5px] ml-1.5 truncate max-w-[150px] inline-block align-middle font-bold">
                              ({ticket.items.map(i => `${i.quantity}x$${i.price}`).join(', ')})
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {ticket.paymentMethod === 'efectivo' ? (
                              <span className="bg-emerald-100 text-emerald-900 font-black px-2 py-0.5 rounded-full border border-emerald-300 text-[10px]">
                                💵 Efectivo
                              </span>
                            ) : (
                              <span className="bg-blue-100 text-blue-900 font-black px-2 py-0.5 rounded-full border border-blue-300 text-[10px]">
                                💳 Tarjeta
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-amber-900">
                            +{ticket.pointsEarned} pts
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-black text-sm text-slate-900">
                              ${ticket.total}.00
                            </span>
                            {ticket.discount > 0 && (
                              <span className="text-[10px] text-emerald-700 font-bold block">
                                Desc: -${ticket.discount}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setTicketToView(ticket)}
                                className="bg-amber-100 hover:bg-[#D95D39] hover:text-white text-amber-950 font-black px-2.5 py-1 rounded-lg text-xs transition-colors inline-flex items-center gap-1 cursor-pointer border border-amber-300 shadow-2xs"
                                title="Ver / Reimprimir Ticket"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver Ticket</span>
                              </button>

                              <button
                                onClick={() => handleOpenDeleteModal(ticket)}
                                className="bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 font-black p-1.5 rounded-lg text-xs transition-colors inline-flex items-center justify-center cursor-pointer border border-rose-200 shadow-2xs"
                                title="Eliminar venta errónea o de prueba (Solo Administrador)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 2: MONTOS GENERADOS POR REPARTO (CHOFERES & RUTAS)
          ========================================================================= */}
      {activeModule === 'repartos' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Tarjetas de Desglose por Chofer */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Osvaldo */}
            <div className="bg-gradient-to-br from-blue-500/10 via-white to-blue-50/40 rounded-3xl p-4 border-2 border-blue-300 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black shadow-xs">
                    🛵
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">Chofer: Osvaldo</h3>
                    <p className="text-[10px] text-blue-700 font-bold">{osvaldoOrders.length} pedidos asignados</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-3 text-center">
                <div className="bg-white rounded-xl p-2 border border-blue-100">
                  <span className="text-[9px] uppercase font-bold text-slate-500">Generado</span>
                  <p className="text-sm font-black text-blue-950 mt-0.5">${osvaldoTotal}</p>
                </div>
                <div className="bg-white rounded-xl p-2 border border-emerald-200">
                  <span className="text-[9px] uppercase font-bold text-emerald-700">Cobrado</span>
                  <p className="text-sm font-black text-emerald-700 mt-0.5">${osvaldoCollected}</p>
                </div>
                <div className="bg-white rounded-xl p-2 border border-rose-200">
                  <span className="text-[9px] uppercase font-bold text-rose-700">Por Cobrar</span>
                  <p className="text-sm font-black text-rose-700 mt-0.5">${Math.max(0, osvaldoPending)}</p>
                </div>
              </div>
            </div>

            {/* Simón */}
            <div className="bg-gradient-to-br from-emerald-500/10 via-white to-emerald-50/40 rounded-3xl p-4 border-2 border-emerald-300 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-xs">
                    🛵
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">Chofer: Simón</h3>
                    <p className="text-[10px] text-emerald-700 font-bold">{simonOrders.length} pedidos asignados</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-3 text-center">
                <div className="bg-white rounded-xl p-2 border border-emerald-100">
                  <span className="text-[9px] uppercase font-bold text-slate-500">Generado</span>
                  <p className="text-sm font-black text-emerald-950 mt-0.5">${simonTotal}</p>
                </div>
                <div className="bg-white rounded-xl p-2 border border-emerald-200">
                  <span className="text-[9px] uppercase font-bold text-emerald-700">Cobrado</span>
                  <p className="text-sm font-black text-emerald-700 mt-0.5">${simonCollected}</p>
                </div>
                <div className="bg-white rounded-xl p-2 border border-rose-200">
                  <span className="text-[9px] uppercase font-bold text-rose-700">Por Cobrar</span>
                  <p className="text-sm font-black text-rose-700 mt-0.5">${Math.max(0, simonPending)}</p>
                </div>
              </div>
            </div>

            {/* Resumen Global Repartos */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">
                  Total Reparto {dateFilterMode === 'hoy' ? 'de Hoy' : 'del Período'}
                </span>
                <div className="text-2xl font-black text-white mt-1">
                  ${deliveryTotalGenerated}.00
                </div>
                <p className="text-xs text-slate-300 font-medium">
                  {deliveryPiecesCount} piezas enviadas en {deliveryOrders.length} pedidos a domicilio
                </p>
              </div>
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold">
                <span className="text-emerald-400">Total Cobrado: ${deliveryTotalCollected}</span>
                <span className="text-amber-300">Por Cobrar: ${deliveryTotalPending}</span>
              </div>
            </div>
          </div>

          {/* Sub-Filters para Reparto */}
          <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Filtrar por Chofer:</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setDriverFilter('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    driverFilter === 'todos' ? 'bg-blue-700 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Todos los Choferes
                </button>
                <button
                  type="button"
                  onClick={() => setDriverFilter('osvaldo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    driverFilter === 'osvaldo' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Osvaldo
                </button>
                <button
                  type="button"
                  onClick={() => setDriverFilter('simon')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    driverFilter === 'simon' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Simón
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Estado de Entrega:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setDeliveryStatusFilter('todos')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                    deliveryStatusFilter === 'todos' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setDeliveryStatusFilter('entregado')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                    deliveryStatusFilter === 'entregado' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  ✓ Entregados
                </button>
                <button
                  onClick={() => setDeliveryStatusFilter('en_camino')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                    deliveryStatusFilter === 'en_camino' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🛵 En Camino
                </button>
              </div>
            </div>
          </div>

          {/* Tabla de Pedidos de Reparto */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Listado de Pedidos de Reparto ({filteredDeliveryOrders.length})
                </h2>
              </div>
              <span className="text-xs font-black text-blue-900">
                Total Reparto: <strong>${deliveryTotalGenerated}.00</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Folio</th>
                    <th className="py-3 px-3">Chofer</th>
                    <th className="py-3 px-4">Cliente / Dirección</th>
                    <th className="py-3 px-3">Piezas</th>
                    <th className="py-3 px-3">Total</th>
                    <th className="py-3 px-3">Estado Pago</th>
                    <th className="py-3 px-3">Saldo Pendiente</th>
                    <th className="py-3 px-3">Entrega</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredDeliveryOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400 font-bold">
                        No se encontraron pedidos de reparto con los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    filteredDeliveryOrders.map((order) => {
                      const pieces = order.items.reduce((s, it) => s + it.quantity, 0);
                      const pending = order.pendingAmount > 0 
                        ? order.pendingAmount 
                        : (order.paymentStatus !== 'pagado' ? Math.max(0, order.total - (order.deposit || 0) - (order.collectedAmount || 0)) : 0);

                      return (
                        <tr key={order.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-black text-blue-900">
                            {order.folio}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center gap-1 font-black px-2 py-0.5 rounded-md text-[10px] ${
                              order.assignedDriverId === 'osvaldo'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : order.assignedDriverId === 'simon'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              🛵 {order.assignedDriverId.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-[200px]">
                            <strong className="text-slate-900 block font-bold truncate">{order.customerName}</strong>
                            {order.address && (
                              <span className="text-[10.5px] text-slate-500 truncate block">📍 {order.address}</span>
                            )}
                            {order.customerPhone && (
                              <span className="text-[10px] text-slate-400 font-mono">📞 {order.customerPhone}</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="bg-amber-100 text-amber-950 font-black px-2 py-0.5 rounded text-[11px]">
                              {pieces} pzs
                            </span>
                          </td>
                          <td className="py-3 px-3 font-black text-slate-900">
                            ${order.total}.00
                          </td>
                          <td className="py-3 px-3">
                            {order.paymentStatus === 'pagado' ? (
                              <span className="bg-emerald-100 text-emerald-900 font-black px-2 py-0.5 rounded-full text-[10px] border border-emerald-300">
                                ✓ Pagado
                              </span>
                            ) : (
                              <span className="bg-amber-100 text-amber-950 font-black px-2 py-0.5 rounded-full text-[10px] border border-amber-300">
                                ⏳ Por Cobrar
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {pending > 0 ? (
                              <span className="font-black text-rose-700 text-xs">
                                ${pending}.00
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-bold text-xs">$0.00</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {order.deliveryStatus === 'entregado' ? (
                              <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-0.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Entregado
                              </span>
                            ) : order.deliveryStatus === 'en_camino' ? (
                              <span className="text-amber-700 font-bold text-[11px] flex items-center gap-0.5">
                                <Clock className="w-3.5 h-3.5" /> En camino
                              </span>
                            ) : (
                              <span className="text-slate-500 font-bold text-[11px]">
                                Pendiente
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {pending > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettleModal(order)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2.5 py-1 rounded-lg text-xs transition-colors inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                  title="Cobrar / Liquidar saldo pendiente de este reparto"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>Cobrar</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setOrderToView(order)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-black p-1.5 rounded-lg text-xs transition-colors cursor-pointer border border-slate-200"
                                title="Ver Comanda / Ticket de Reparto"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 3: PEDIDOS PIDE Y RECOGE (EN MOSTRADOR)
          ========================================================================= */}
      {activeModule === 'pedidos_tienda' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Header Summary for Store Pickups */}
          <div className="bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-800 text-white rounded-3xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-2xl">
                🛍️
              </div>
              <div>
                <h3 className="font-black text-lg text-white">Pedidos Pide y Recoge (Tienda)</h3>
                <p className="text-xs text-purple-200 font-medium">
                  {storePickupOrders.length} pedidos registrados (Trascos, Magda, Bollos David, Deliz, etc.) · {storeOrdersPiecesCount} piezas en total
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-right">
              <div className="bg-white/15 px-3.5 py-2 rounded-2xl">
                <span className="text-[10px] text-purple-200 uppercase font-black">Monto Generado</span>
                <p className="text-xl font-black text-amber-300">${storeOrdersTotalGenerated}.00</p>
              </div>
              <div className="bg-white/15 px-3.5 py-2 rounded-2xl">
                <span className="text-[10px] text-purple-200 uppercase font-black">Por Cobrar en Tienda</span>
                <p className="text-xl font-black text-rose-300">${storeOrdersTotalPending}.00</p>
              </div>
            </div>
          </div>

          {/* Tabla de Pedidos en Tienda */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShoppingBag className="w-4 h-4 text-purple-700" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Listado de Clientes Pide y Recoge ({filteredStoreOrders.length})
                </h2>
              </div>
              <span className="text-xs font-black text-purple-900">
                Pagado: <strong>${storeOrdersTotalCollected}</strong> | Saldo Pendiente: <strong className="text-rose-600">${storeOrdersTotalPending}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Folio</th>
                    <th className="py-3 px-3">Hora Recolección</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-3">Piezas / Desglose</th>
                    <th className="py-3 px-4">Notas / Observaciones</th>
                    <th className="py-3 px-3">Total</th>
                    <th className="py-3 px-3">Estado Pago</th>
                    <th className="py-3 px-3">Saldo a Cobrar</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredStoreOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400 font-bold">
                        No se encontraron pedidos de recolección en tienda con los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    filteredStoreOrders.map((order) => {
                      const pieces = order.items.reduce((s, it) => s + it.quantity, 0);
                      const pending = order.pendingAmount > 0 
                        ? order.pendingAmount 
                        : (order.paymentStatus !== 'pagado' ? Math.max(0, order.total - (order.deposit || 0) - (order.collectedAmount || 0)) : 0);

                      return (
                        <tr key={order.id} className="hover:bg-purple-50/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-black text-purple-900">
                            {order.folio}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-800">{order.deliveryTime || 'Por la tarde'}</div>
                            <span className="text-[10px] text-slate-500 font-medium">{order.deliveryDate}</span>
                          </td>
                          <td className="py-3 px-4">
                            <strong className="text-slate-900 block font-bold">{order.customerName}</strong>
                            {order.customerPhone && (
                              <span className="text-[10px] text-purple-700 font-mono">📞 {order.customerPhone}</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="bg-purple-100 text-purple-950 font-black px-2 py-0.5 rounded text-[11px]">
                              {pieces} pzs
                            </span>
                            <span className="text-slate-600 text-[10px] ml-1 block truncate max-w-[140px]">
                              {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-[180px]">
                            {order.notes ? (
                              <span className="text-slate-700 text-xs italic line-clamp-2">"{order.notes}"</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-black text-slate-900">
                            ${order.total}.00
                          </td>
                          <td className="py-3 px-3">
                            {order.paymentStatus === 'pagado' ? (
                              <span className="bg-emerald-100 text-emerald-900 font-black px-2 py-0.5 rounded-full text-[10px] border border-emerald-300">
                                ✓ Pagado
                              </span>
                            ) : (
                              <span className="bg-amber-100 text-amber-950 font-black px-2 py-0.5 rounded-full text-[10px] border border-amber-300">
                                ⏳ Por Cobrar
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {pending > 0 ? (
                              <span className="font-black text-rose-700 text-xs">
                                ${pending}.00
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-bold text-xs">$0.00</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {pending > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettleModal(order)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2.5 py-1 rounded-lg text-xs transition-colors inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                  title="Cobrar este pedido al entregar al cliente"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>Cobrar</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setOrderToView(order)}
                                className="bg-purple-100 hover:bg-purple-200 text-purple-950 font-black p-1.5 rounded-lg text-xs transition-colors cursor-pointer border border-purple-200"
                                title="Ver Ticket de Tienda"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 4: MONTOS POR COBRAR (CUENTAS POR COBRAR: REPARTO Y PIDE Y RECOGE)
          ========================================================================= */}
      {activeModule === 'por_cobrar' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Header de Cuentas por Cobrar */}
          <div className="bg-gradient-to-br from-rose-600 via-rose-700 to-amber-700 text-white rounded-3xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-2xl font-black">
                ⏳
              </div>
              <div>
                <h3 className="font-black text-lg text-white">Cuentas y Montos Pendientes por Cobrar</h3>
                <p className="text-xs text-rose-100 font-medium">
                  Control unificado de saldos pendientes de <strong className="text-white">Reparto</strong> y <strong className="text-white">Pide y Recoge</strong>
                </p>
              </div>
            </div>

            <div className="bg-white/15 backdrop-blur-xs px-4 py-2.5 rounded-2xl text-right">
              <span className="text-[10px] uppercase font-black text-rose-200 tracking-wider">Total Deuda Pendiente</span>
              <div className="text-2xl font-black text-white tracking-tight">
                ${totalGlobalPending}.00
              </div>
            </div>
          </div>

          {/* Sub-Filters para Cuentas por Cobrar */}
          <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Origen del Saldo:</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setReceivableTypeFilter('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    receivableTypeFilter === 'todos' ? 'bg-rose-700 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Todos los Pendientes ({allReceivableOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReceivableTypeFilter('reparto')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                    receivableTypeFilter === 'reparto' ? 'bg-blue-700 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Solo Repartos (${deliveryTotalPending})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReceivableTypeFilter('tienda')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                    receivableTypeFilter === 'tienda' ? 'bg-purple-700 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Solo Pide y Recoge (${storeOrdersTotalPending})</span>
                </button>
              </div>
            </div>

            <span className="text-xs font-bold text-slate-500">
              💡 Haz clic en <strong>Cobrar / Liquidar</strong> para saldar la cuenta inmediatamente
            </span>
          </div>

          {/* Tabla de Cuentas por Cobrar */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-rose-600" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Listado de Clientes con Montos por Cobrar ({filteredReceivables.length})
                </h2>
              </div>
              <span className="text-xs font-black text-rose-800">
                Total por Cobrar: ${filteredReceivables.reduce((acc, o) => {
                  const p = o.pendingAmount > 0 ? o.pendingAmount : Math.max(0, o.total - (o.deposit || 0) - (o.collectedAmount || 0));
                  return acc + p;
                }, 0)}.00
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Folio</th>
                    <th className="py-3 px-3">Tipo / Origen</th>
                    <th className="py-3 px-4">Cliente / Contacto</th>
                    <th className="py-3 px-3">Asignado</th>
                    <th className="py-3 px-3">Fecha</th>
                    <th className="py-3 px-3 text-right">Total Pedido</th>
                    <th className="py-3 px-3 text-right">Anticipo</th>
                    <th className="py-3 px-4 text-right">Saldo por Cobrar</th>
                    <th className="py-3 px-4 text-center">Acción de Cobro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredReceivables.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                          <span className="text-sm font-black text-slate-700">¡Al día! No hay cuentas pendientes por cobrar</span>
                          <span className="text-xs text-slate-400">Todos los repartos y pedidos de Pide y Recoge están cubiertos o liquidados.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredReceivables.map((order) => {
                      const isDel = isOrderDelivery(order);
                      const pending = order.pendingAmount > 0 
                        ? order.pendingAmount 
                        : Math.max(0, order.total - (order.deposit || 0) - (order.collectedAmount || 0));

                      return (
                        <tr key={order.id} className="hover:bg-rose-50/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-black text-rose-900">
                            {order.folio}
                          </td>
                          <td className="py-3 px-3">
                            {isDel ? (
                              <span className="bg-blue-100 text-blue-900 font-black px-2 py-0.5 rounded-full text-[10px] border border-blue-300 flex items-center gap-1 w-max">
                                <Truck className="w-3 h-3" /> Reparto
                              </span>
                            ) : (
                              <span className="bg-purple-100 text-purple-900 font-black px-2 py-0.5 rounded-full text-[10px] border border-purple-300 flex items-center gap-1 w-max">
                                <ShoppingBag className="w-3 h-3" /> Pide y Recoge
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <strong className="text-slate-900 block font-bold text-xs">{order.customerName}</strong>
                            {order.customerPhone && (
                              <span className="text-[10px] text-slate-500 font-mono block">📞 {order.customerPhone}</span>
                            )}
                            {order.address && (
                              <span className="text-[10px] text-slate-400 truncate block max-w-[180px]">📍 {order.address}</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-700 text-xs">
                              {isDel ? `Chofer: ${order.assignedDriverId.toUpperCase()}` : 'Mostrador Tienda'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 text-[11px]">
                            {order.deliveryDate}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-slate-900">
                            ${order.total}.00
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-700 font-bold">
                            ${order.deposit || 0}.00
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-black text-sm text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                              ${pending}.00
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenSettleModal(order)}
                                className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black px-3 py-1.5 rounded-xl text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border border-emerald-500"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>Cobrar / Liquidar</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setOrderToView(order)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black p-1.5 rounded-xl text-xs transition-colors cursor-pointer border border-slate-200"
                                title="Ver Ticket"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* =========================================================================
          MODALS SECTION
          ========================================================================= */}

      {/* 1. Ticket Viewer Modal (Mostrador) */}
      {ticketToView && (
        <ThermalTicket
          ticket={ticketToView}
          settings={settings}
          onRequestDelete={handleOpenDeleteModal}
          onClose={() => setTicketToView(null)}
        />
      )}

      {/* 2. Order Ticket Preview Modal (Reparto / Tienda) */}
      {orderToView && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border-2 border-amber-300 animate-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 leading-tight">
                    Pedido #{orderToView.folio}
                  </h3>
                  <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider">
                    {isOrderDelivery(orderToView) ? 'Ruta de Reparto' : 'Recoger en Tienda'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderToView(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-3 space-y-2 text-xs">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-600">Cliente:</span>
                  <span className="font-black text-slate-900">{orderToView.customerName}</span>
                </div>
                {orderToView.customerPhone && (
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-600">Teléfono:</span>
                    <span className="font-mono text-slate-800">{orderToView.customerPhone}</span>
                  </div>
                )}
                {orderToView.address && (
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-600">Dirección:</span>
                    <span className="text-slate-800 text-right truncate max-w-[200px]">{orderToView.address}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-bold text-slate-600">Entrega:</span>
                  <span className="text-slate-800">{orderToView.deliveryDate} - {orderToView.deliveryTime}</span>
                </div>
              </div>

              {/* Items */}
              <div className="bg-amber-50/60 p-3 rounded-2xl border border-amber-200 space-y-1">
                <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider">Productos</span>
                {orderToView.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-xs pt-1 border-t border-amber-200/60 first:border-0 first:pt-0">
                    <span>{it.quantity}x {it.name}</span>
                    <span className="font-black">${it.total}.00</span>
                  </div>
                ))}
              </div>

              {/* Total & Saldo */}
              <div className="bg-slate-900 text-white p-3.5 rounded-2xl space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Total del Pedido:</span>
                  <span className="font-black">${orderToView.total}.00</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-400">
                  <span>Anticipo / Cobrado:</span>
                  <span className="font-black">${(orderToView.deposit || 0) + (orderToView.collectedAmount || 0)}.00</span>
                </div>
                <div className="flex justify-between text-sm font-black pt-1 border-t border-white/20 text-amber-300">
                  <span>Saldo Pendiente:</span>
                  <span>${orderToView.pendingAmount > 0 ? orderToView.pendingAmount : Math.max(0, orderToView.total - (orderToView.deposit || 0) - (orderToView.collectedAmount || 0))}.00</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  printOrderTicketDirectToPrinter(orderToView, settings);
                }}
                className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl font-black text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket 🖨️</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderToView(null)}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal de Cobro / Liquidación de Saldos Pendientes */}
      {orderToSettle && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border-2 border-emerald-400 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 leading-tight">
                    Cobrar / Liquidar Pedido #{orderToSettle.folio}
                  </h3>
                  <p className="text-[11px] text-emerald-800 font-bold">
                    Cliente: {orderToSettle.customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderToSettle(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Info Card */}
            <div className="my-3 bg-emerald-50 rounded-2xl p-3 border border-emerald-200 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="font-bold text-slate-600">Total Pedido:</span>
                <span className="font-black text-slate-900">${orderToSettle.total}.00</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span className="font-bold">Anticipo Previo:</span>
                <span className="font-bold text-emerald-700">${orderToSettle.deposit || 0}.00</span>
              </div>
              <div className="flex justify-between text-sm font-black pt-1.5 border-t border-emerald-200 text-rose-800">
                <span>Saldo Pendiente Actual:</span>
                <span>${orderToSettle.pendingAmount > 0 ? orderToSettle.pendingAmount : Math.max(0, orderToSettle.total - (orderToSettle.deposit || 0) - (orderToSettle.collectedAmount || 0))}.00</span>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Monto a Cobrar / Liquidar:
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400 text-base">$</span>
                  <input
                    type="number"
                    min="1"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Método de Pago:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSettleMethod('efectivo')}
                    className={`py-2 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                      settleMethod === 'efectivo'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>💵 Efectivo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleMethod('tarjeta')}
                    className={`py-2 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                      settleMethod === 'tarjeta'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>💳 Tarjeta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleMethod('transferencia')}
                    className={`py-2 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                      settleMethod === 'transferencia'
                        ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>📱 Transfer</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Nota / Referencia de Cobro:
                </label>
                <input
                  type="text"
                  placeholder="Ej. Liquidó en turno vespertino / Folio trans..."
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 mt-4 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOrderToSettle(null)}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmSettleOrder}
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-emerald-500"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar Cobro 💵</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Admin PIN Delete Confirmation Modal (Clave 13579) */}
      {ticketToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border-2 border-rose-400 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 leading-tight">
                    Eliminar Venta
                  </h3>
                  <p className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">
                    Solo Administrador
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTicketToDelete(null);
                  setAdminPinInput('');
                  setPinError('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-3 bg-rose-50/80 rounded-2xl p-3 border border-rose-200/80 space-y-1 text-xs">
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-bold">Folio:</span>
                <span className="font-mono font-black text-rose-800">{ticketToDelete.folio}</span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-bold">Total:</span>
                <span className="font-black text-sm text-slate-900">${ticketToDelete.total}.00</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 text-[11px]">
                <span>Hora: {ticketToDelete.time}</span>
                <span>{ticketToDelete.items.reduce((s, i) => s + i.quantity, 0)} piezas</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 font-medium mb-3">
              Para eliminar esta venta errónea o de prueba, ingresa la clave de administrador:
            </p>

            <div className="space-y-2">
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="Ingrese clave (13579)"
                  value={adminPinInput}
                  onChange={(e) => {
                    setAdminPinInput(e.target.value);
                    if (pinError) setPinError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmDelete();
                  }}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 rounded-xl text-center text-lg font-mono font-black tracking-widest border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-1 pt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      playBeep(600, 'sine', 0.02);
                      if (pinError) setPinError('');
                      if (k === 'C') {
                        setAdminPinInput('');
                      } else if (k === '⌫') {
                        setAdminPinInput(prev => prev.slice(0, -1));
                      } else {
                        setAdminPinInput(prev => prev + k);
                      }
                    }}
                    className="py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-black text-sm rounded-lg border border-slate-200 shadow-2xs cursor-pointer"
                  >
                    {k}
                  </button>
                ))}
              </div>

              {pinError && (
                <div className="bg-rose-100 text-rose-900 p-2 rounded-xl text-[11px] font-bold border border-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-700" />
                  <span>{pinError}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setTicketToDelete(null);
                  setAdminPinInput('');
                  setPinError('');
                }}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                id="confirm-delete-ticket-btn"
                onClick={handleConfirmDelete}
                className="w-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-rose-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Borrar Venta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL DE PREVIO E IMPRESIÓN DEL TICKET DE CORTE CON DESGLOSE COMPLETO */}
      {shiftCutToPreview && (
        <ThermalShiftCutTicket
          cut={shiftCutToPreview}
          settings={settings}
          onClose={() => setShiftCutToPreview(null)}
          onPrintDirect={() => {
            window.print();
          }}
        />
      )}
    </div>
  );
};
