import React, { useState, useMemo, useEffect } from 'react';
import { SaleTicket, Settings, ShiftCutRecord, BakeryOrder, Driver, DriverCustomer, OperationalExpense, SupplierBill, VipOrder } from '../../types';
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
  Cloud,
  Crown,
  FileCheck,
  Image as ImageIcon
} from 'lucide-react';
import { 
  getTodayString, 
  loadOutflows, 
  loadShiftCuts, 
  getNowTimeString, 
  resolveTicketShift,
  getDailyDeliverySheet,
  saveDailyDeliverySheet,
  loadDriverCustomers 
} from '../../utils/storage';
import { fetchAndMergeCloud, syncWithCloud, getCloudSyncStatus } from '../../services/cloudSyncService';
import { fetchDailyDeliveryFromFirestore } from '../../services/firebase';
import { playBeep, playCashSound } from '../../utils/audio';
import { ThermalTicket } from '../ThermalTicket';
import { ThermalShiftCutTicket } from '../ShiftCut/ThermalShiftCutTicket';
import { 
  printOrderTicketDirectToPrinter,
  printDeliveryClientTicketDirectToPrinter,
  printDriverConsolidatedTicketDirectToPrinter 
} from '../../utils/thermalPrinter';
import { DriverDailyTicketsModal } from '../Orders/DriverDailyTicketsModal';
import { calculateTicketsBreakdown } from '../../utils/productClassification';
import { WeeklySalesView } from './WeeklySalesView';
import { MonthlyEarningsView } from './MonthlyEarningsView';
import { DailyPanNoPanChart } from './DailyPanNoPanChart';
import { DeliveryComparisonChart } from '../Orders/DeliveryComparisonChart';

interface SalesHistoryProps {
  tickets: SaleTicket[];
  orders?: BakeryOrder[];
  vipOrders?: VipOrder[];
  drivers?: Driver[];
  driverCustomers?: DriverCustomer[];
  operationalExpenses?: OperationalExpense[];
  supplierBills?: SupplierBill[];
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
  vipOrders = [],
  drivers = [],
  driverCustomers = [],
  operationalExpenses = [],
  supplierBills = [],
  settings,
  onDeleteTicket,
  onUpdateOrder,
  onClearOrders
}) => {
  const todayStr = getTodayString();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [dateFilterMode, setDateFilterMode] = useState<'hoy' | 'ayer' | 'semana' | 'personalizado'>('hoy');
  
  // Branch filter: 'todas' | 'refugio' | 'zakia'
  const [branchFilter, setBranchFilter] = useState<'todas' | 'refugio' | 'zakia'>('todas');
  // 'dia' (Historial y corte por día) | 'semana' (Semanal L-D) | 'meses' (Ganancias por mes Enero-Diciembre)
  const [historyViewMode, setHistoryViewMode] = useState<'dia' | 'semana' | 'meses'>('dia');

  // Control para mostrar/ocultar listado de tickets en corte_caja (priorizar métricas)
  const [showTicketsTable, setShowTicketsTable] = useState<boolean>(false);

  // Control para mostrar/ocultar listado de tickets en repartos (priorizar métricas y gráficas de Simón y Osvaldo)
  const [showDeliveryTicketsTable, setShowDeliveryTicketsTable] = useState<boolean>(false);

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
  const [driverTicketsModalOpen, setDriverTicketsModalOpen] = useState<boolean>(false);
  const [deliveryShiftFilter, setDeliveryShiftFilter] = useState<'todos' | 'manana' | 'tarde'>('todos');
  const [deliveryTabMode, setDeliveryTabMode] = useState<'hoja_diaria' | 'pedidos_especiales'>('hoja_diaria');
  const [ticketDriverFilter, setTicketDriverFilter] = useState<'todos' | 'mostrador' | 'simon' | 'osvaldo'>('todos');

  // Modals
  const [ticketToView, setTicketToView] = useState<SaleTicket | null>(null);
  const [shiftCutToPreview, setShiftCutToPreview] = useState<ShiftCutRecord | null>(null);
  const [orderToView, setOrderToView] = useState<BakeryOrder | null>(null);
  const [previewReceiptImage, setPreviewReceiptImage] = useState<string | null>(null);
  
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
      // 1. Enviar tickets y ventas locales acumuladas al servidor central
      await syncWithCloud({ tickets, orders });
      // 2. Traer y fusionar datos actualizados de todos los dispositivos
      const res = await fetchAndMergeCloud();
      playCashSound();
      const ticketCount = res.mergedData?.tickets?.length ?? tickets.length;
      setCloudSyncNotice(`¡Sincronización en tiempo real completada! ${ticketCount} tickets sincronizados entre PC y teléfono.`);
      setTimeout(() => setCloudSyncNotice(''), 5000);
    } catch {
      setCloudSyncNotice('Sincronización activa.');
      setTimeout(() => setCloudSyncNotice(''), 3000);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Compute yesterday string
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Helper para calcular el día anterior a cualquier fecha
  const getPriorDay = (dateStr: string): string => {
    try {
      const d = new Date(dateStr + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    } catch {
      return yesterdayStr;
    }
  };

  // Compute 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

  // Estado para refrescar la liquidación del corte de las 1:00 PM
  const [cutLiquidationCounter, setCutLiquidationCounter] = useState<number>(0);

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

  // Pedidos Clientes VIP (Facturas y Transferencias)
  const dateMatchedVipOrders = useMemo(() => {
    return (vipOrders || []).filter(vo => {
      const voDate = vo.date || (vo.createdAt ? vo.createdAt.split('T')[0] : todayStr);
      if (dateFilterMode === 'hoy' && voDate !== todayStr) return false;
      if (dateFilterMode === 'ayer' && voDate !== yesterdayStr) return false;
      if (dateFilterMode === 'semana' && voDate < sevenDaysAgoStr) return false;
      if (dateFilterMode === 'personalizado' && voDate !== selectedDate) return false;
      return true;
    });
  }, [vipOrders, dateFilterMode, todayStr, yesterdayStr, sevenDaysAgoStr, selectedDate]);

  // All Pending Receivables (Montos por cobrar globales del período o acumulados)
  const allReceivableOrders = dateMatchedOrders.filter(o => {
    const pending = o.pendingAmount > 0 ? o.pendingAmount : (o.paymentStatus !== 'pagado' ? Math.max(0, o.total - (o.deposit || 0)) : 0);
    return o.paymentStatus !== 'pagado' && pending > 0;
  });

  // Helper to determine if a ticket belongs to Reparto
  const isTicketDelivery = (t: SaleTicket): boolean => {
    return Boolean(
      t.isDelivery || 
      t.driverId === 'osvaldo' || 
      t.driverId === 'simon' || 
      (t.id && t.id.startsWith('rep_')) ||
      (t.cashier && t.cashier.toLowerCase().includes('reparto'))
    );
  };

  // Branch comparison metrics for the active date range (Mostrador Zakia vs El Refugio)
  const branchComparison = useMemo(() => {
    const periodTickets = dateMatchedTickets.filter(t => !isTicketDelivery(t));
    const refugioTickets = periodTickets.filter(t => (t.branch || 'refugio') === 'refugio');
    const zakiaTickets = periodTickets.filter(t => t.branch === 'zakia');

    const refugioSales = refugioTickets.reduce((sum, t) => sum + (t.total || 0), 0);
    const zakiaSales = zakiaTickets.reduce((sum, t) => sum + (t.total || 0), 0);
    const totalSales = refugioSales + zakiaSales;

    const refugioPieces = refugioTickets.reduce((sum, t) => sum + t.items.reduce((s, it) => s + it.quantity, 0), 0);
    const zakiaPieces = zakiaTickets.reduce((sum, t) => sum + t.items.reduce((s, it) => s + it.quantity, 0), 0);
    const totalPieces = refugioPieces + zakiaPieces;

    return {
      refugio: { count: refugioTickets.length, sales: refugioSales, pieces: refugioPieces },
      zakia: { count: zakiaTickets.length, sales: zakiaSales, pieces: zakiaPieces },
      total: { count: periodTickets.length, sales: totalSales, pieces: totalPieces }
    };
  }, [dateMatchedTickets]);

  // Separa Mostrador Físico filtrado por sucursal seleccionada
  const mostradorTickets = dateMatchedTickets
    .filter(t => !isTicketDelivery(t))
    .filter(t => {
      if (branchFilter === 'todas') return true;
      const b = t.branch || 'refugio';
      return b === branchFilter;
    });

  const deliveryTicketsFromStore = dateMatchedTickets.filter(t => isTicketDelivery(t));

  // --- MACRO FINANCIAL METRICS ---
  // A. MOSTRADOR (TICKETS DE TIENDA Y NÚMEROS REALES DE CAJA)
  const mostradorTotal = mostradorTickets.reduce((acc, t) => acc + t.total, 0);
  const mostradorCash = mostradorTickets.filter(t => t.paymentMethod === 'efectivo').reduce((acc, t) => acc + t.total, 0);
  const mostradorCard = mostradorTickets.filter(t => t.paymentMethod === 'tarjeta').reduce((acc, t) => acc + t.total, 0);
  const mostradorPieces = mostradorTickets.reduce((sum, t) => sum + t.items.reduce((s, it) => s + it.quantity, 0), 0);
  const mostradorBreakdown = calculateTicketsBreakdown(mostradorTickets);

  // Turnos en Mostrador
  const turno1Tickets = mostradorTickets.filter(t => getTicketShift(t) === 'turno1');
  const turno1Total = turno1Tickets.reduce((acc, t) => acc + t.total, 0);
  const turno1Cash = turno1Tickets.filter(t => t.paymentMethod === 'efectivo').reduce((acc, t) => acc + t.total, 0);
  const turno1Card = turno1Tickets.filter(t => t.paymentMethod === 'tarjeta').reduce((acc, t) => acc + t.total, 0);
  const turno1Breakdown = calculateTicketsBreakdown(turno1Tickets);

  const turno2Tickets = mostradorTickets.filter(t => getTicketShift(t) === 'turno2');
  const turno2Total = turno2Tickets.reduce((acc, t) => acc + t.total, 0);
  const turno2Cash = turno2Tickets.filter(t => t.paymentMethod === 'efectivo').reduce((acc, t) => acc + t.total, 0);
  const turno2Card = turno2Tickets.filter(t => t.paymentMethod === 'tarjeta').reduce((acc, t) => acc + t.total, 0);
  const turno2Breakdown = calculateTicketsBreakdown(turno2Tickets);

  // Fechas efectivas de reparto según el filtro de fecha (Día único o 7 días de la semana)
  const effectiveDeliveryDates = useMemo(() => {
    if (dateFilterMode === 'hoy') return [todayStr];
    if (dateFilterMode === 'ayer') return [yesterdayStr];
    if (dateFilterMode === 'personalizado') return [selectedDate];
    // Modo semana: los últimos 7 días
    const dates: string[] = [];
    const cur = new Date();
    for (let i = 0; i < 7; i++) {
      dates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() - 1);
    }
    return dates;
  }, [dateFilterMode, selectedDate, todayStr, yesterdayStr]);

  const effectiveDeliveryDate = effectiveDeliveryDates[0] || todayStr;

  // Versión de sincronización en tiempo real para repartos
  const [deliverySyncVersion, setDeliverySyncVersion] = useState<number>(0);

  useEffect(() => {
    const handleUpdate = () => {
      setDeliverySyncVersion(v => v + 1);
    };
    window.addEventListener('dailyDeliveryUpdated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    // Cargar inmediatamente desde Firestore para asegurar datos en teléfonos celulares
    effectiveDeliveryDates.forEach(dStr => {
      fetchDailyDeliveryFromFirestore(dStr, 'manana').then(cloud => {
        if (cloud && Object.keys(cloud).length > 0) {
          saveDailyDeliverySheet(dStr, cloud, 'manana');
          setDeliverySyncVersion(v => v + 1);
        }
      }).catch(() => {});
      fetchDailyDeliveryFromFirestore(dStr, 'tarde').then(cloud => {
        if (cloud && Object.keys(cloud).length > 0) {
          saveDailyDeliverySheet(dStr, cloud, 'tarde');
          setDeliverySyncVersion(v => v + 1);
        }
      }).catch(() => {});
    });

    return () => {
      window.removeEventListener('dailyDeliveryUpdated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [effectiveDeliveryDates]);

  // B. REPARTOS (Hojas de Reparto Diario del Día/Semana + Tickets Registrados + Pedidos Asignados)
  const activeDeliveryClients = useMemo(() => {
    const list = driverCustomers.length > 0 ? driverCustomers : loadDriverCustomers();
    const map = new Map<string, DriverCustomer>();
    list.forEach(c => {
      if (c && c.id && (c.driverId === 'osvaldo' || c.driverId === 'simon')) {
        map.set(c.id, c);
      }
    });
    return Array.from(map.values());
  }, [driverCustomers]);

  const dailySheetTickets = useMemo(() => {
    const list: Array<{
      id: string;
      folio: string;
      clientId: string;
      clientName: string;
      clientPhone?: string;
      clientAddress?: string;
      driverId: 'osvaldo' | 'simon';
      driverName: string;
      date: string;
      shift: 'manana' | 'tarde';
      shiftLabel: string;
      items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      totalPieces: number;
      totalAmount: number;
    }> = [];

    const seenTicketKeys = new Set<string>();
    const addTicket = (item: typeof list[0]) => {
      if (!item || !item.id) return;
      const key = `${item.id}_${item.date}_${item.shift}`;
      if (seenTicketKeys.has(key) || seenTicketKeys.has(item.id)) return;
      seenTicketKeys.add(key);
      seenTicketKeys.add(item.id);
      list.push(item);
    };

    const getItems = (c: DriverCustomer) => {
      if (c.items && c.items.length > 0) return c.items;
      return [
        { breadName: 'Bolillo', unitPrice: 4.00 },
        { breadName: 'Dulce', unitPrice: 8.50 }
      ];
    };

    // Iterar sobre cada día incluido en el período (1 día o los 7 días de la semana)
    effectiveDeliveryDates.forEach(curDate => {
      const curMananaSheet = getDailyDeliverySheet(curDate, 'manana');
      const curTardeSheet = getDailyDeliverySheet(curDate, 'tarde');

      activeDeliveryClients.forEach(c => {
        const breadItems = getItems(c);

        // 1. Turno Mañana para este día
        const mQ = curMananaSheet[c.id] || {};
        let mPieces = 0;
        let mTotal = 0;
        const mItems: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = [];
        breadItems.forEach(it => {
          const q = mQ[it.breadName] || 0;
          if (q > 0) {
            mPieces += q;
            mTotal += q * it.unitPrice;
            mItems.push({ name: it.breadName, quantity: q, unitPrice: it.unitPrice, total: q * it.unitPrice });
          }
        });

        const matchedM = deliveryTicketsFromStore.find(t => 
          (t.date === curDate || getTicketDate(t) === curDate) && (
            t.id === `rep_${curDate}_manana_${c.id}` || 
            (t.customerName === c.name && t.deliveryShift === 'manana')
          )
        );

        if (mPieces > 0 || matchedM) {
          const itemsToUse = matchedM?.items && matchedM.items.length > 0
            ? matchedM.items.map(it => ({ name: it.name, quantity: it.quantity, unitPrice: it.price, total: it.total }))
            : mItems;
          const piecesToUse = matchedM ? matchedM.items.reduce((s, it) => s + it.quantity, 0) : mPieces;
          const totalToUse = matchedM ? matchedM.total : mTotal;

          addTicket({
            id: matchedM?.id || `rep_${curDate}_manana_${c.id}`,
            folio: matchedM?.folio || `REP-M${c.id.slice(-4)}`,
            clientId: c.id,
            clientName: c.name,
            clientPhone: c.phone,
            clientAddress: c.address,
            driverId: c.driverId as 'osvaldo' | 'simon',
            driverName: c.driverId === 'osvaldo' ? 'Osvaldo' : 'Simón',
            date: curDate,
            shift: 'manana',
            shiftLabel: '🌅 Mañana',
            items: itemsToUse,
            totalPieces: piecesToUse,
            totalAmount: totalToUse
          });
        }

        // 2. Turno Tarde para este día
        const tQ = curTardeSheet[c.id] || {};
        let tPieces = 0;
        let tTotal = 0;
        const tItems: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = [];
        breadItems.forEach(it => {
          const q = tQ[it.breadName] || 0;
          if (q > 0) {
            tPieces += q;
            tTotal += q * it.unitPrice;
            tItems.push({ name: it.breadName, quantity: q, unitPrice: it.unitPrice, total: q * it.unitPrice });
          }
        });

        const matchedT = deliveryTicketsFromStore.find(t => 
          (t.date === curDate || getTicketDate(t) === curDate) && (
            t.id === `rep_${curDate}_tarde_${c.id}` || 
            (t.customerName === c.name && t.deliveryShift === 'tarde')
          )
        );

        if (tPieces > 0 || matchedT) {
          const itemsToUse = matchedT?.items && matchedT.items.length > 0
            ? matchedT.items.map(it => ({ name: it.name, quantity: it.quantity, unitPrice: it.price, total: it.total }))
            : tItems;
          const piecesToUse = matchedT ? matchedT.items.reduce((s, it) => s + it.quantity, 0) : tPieces;
          const totalToUse = matchedT ? matchedT.total : tTotal;

          addTicket({
            id: matchedT?.id || `rep_${curDate}_tarde_${c.id}`,
            folio: matchedT?.folio || `REP-T${c.id.slice(-4)}`,
            clientId: c.id,
            clientName: c.name,
            clientPhone: c.phone,
            clientAddress: c.address,
            driverId: c.driverId as 'osvaldo' | 'simon',
            driverName: c.driverId === 'osvaldo' ? 'Osvaldo' : 'Simón',
            date: curDate,
            shift: 'tarde',
            shiftLabel: '🌇 Tarde',
            items: itemsToUse,
            totalPieces: piecesToUse,
            totalAmount: totalToUse
          });
        }
      });
    });

    // Agregar tickets de deliveryTicketsFromStore que no estuvieran en la hoja
    deliveryTicketsFromStore.forEach(st => {
      if (seenTicketKeys.has(st.id) || (st.folio && list.some(item => item.folio === st.folio))) return;
      const driverId = (st.driverId === 'osvaldo' || st.driverId === 'simon')
        ? st.driverId
        : (st.cashier?.toLowerCase().includes('osvaldo') ? 'osvaldo' : 'simon');
      const shift = st.deliveryShift || (st.shift === 'turno1' ? 'manana' : 'tarde');
      addTicket({
        id: st.id,
        folio: st.folio,
        clientId: st.id,
        clientName: st.customerName || 'Cliente de Reparto',
        clientPhone: st.customerPhone,
        clientAddress: '',
        driverId,
        driverName: driverId === 'osvaldo' ? 'Osvaldo' : 'Simón',
        date: st.date || effectiveDeliveryDate,
        shift,
        shiftLabel: shift === 'manana' ? '🌅 Mañana' : '🌇 Tarde',
        items: st.items.map(it => ({ name: it.name, quantity: it.quantity, unitPrice: it.price, total: it.total })),
        totalPieces: st.items.reduce((s, it) => s + it.quantity, 0),
        totalAmount: st.total
      });
    });

    return list;
  }, [activeDeliveryClients, effectiveDeliveryDates, deliveryTicketsFromStore, deliverySyncVersion]);

  const sheetOsvaldoTickets = useMemo(() => dailySheetTickets.filter(t => t.driverId === 'osvaldo'), [dailySheetTickets]);
  const sheetOsvaldoTotal = useMemo(() => sheetOsvaldoTickets.reduce((sum, t) => sum + t.totalAmount, 0), [sheetOsvaldoTickets]);
  const sheetOsvaldoPieces = useMemo(() => sheetOsvaldoTickets.reduce((sum, t) => sum + t.totalPieces, 0), [sheetOsvaldoTickets]);

  const sheetSimonTickets = useMemo(() => dailySheetTickets.filter(t => t.driverId === 'simon'), [dailySheetTickets]);
  const sheetSimonTotal = useMemo(() => sheetSimonTickets.reduce((sum, t) => sum + t.totalAmount, 0), [sheetSimonTickets]);
  const sheetSimonPieces = useMemo(() => sheetSimonTickets.reduce((sum, t) => sum + t.totalPieces, 0), [sheetSimonTickets]);

  const sheetGrandTotal = sheetOsvaldoTotal + sheetSimonTotal;
  const sheetGrandPieces = sheetOsvaldoPieces + sheetSimonPieces;

  // Choferes breakdown total (incluye pedidos de BakeryOrder asignados a chofer)
  const osvaldoOrders = deliveryOrders.filter(o => o.assignedDriverId === 'osvaldo');
  const osvaldoOrdersTotal = osvaldoOrders.reduce((acc, o) => acc + o.total, 0);
  const osvaldoOrdersPieces = osvaldoOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0), 0);
  const osvaldoTotal = sheetOsvaldoTotal + osvaldoOrdersTotal;
  const osvaldoPieces = sheetOsvaldoPieces + osvaldoOrdersPieces;
  const osvaldoCollected = osvaldoOrders.reduce((acc, o) => acc + (o.paymentStatus === 'pagado' ? o.total : (o.deposit || 0) + (o.collectedAmount || 0)), 0) + sheetOsvaldoTotal;
  const osvaldoPending = Math.max(0, osvaldoTotal - osvaldoCollected);

  const simonOrders = deliveryOrders.filter(o => o.assignedDriverId === 'simon');
  const simonOrdersTotal = simonOrders.reduce((acc, o) => acc + o.total, 0);
  const simonOrdersPieces = simonOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0), 0);
  const simonTotal = sheetSimonTotal + simonOrdersTotal;
  const simonPieces = sheetSimonPieces + simonOrdersPieces;
  const simonCollected = simonOrders.reduce((acc, o) => acc + (o.paymentStatus === 'pagado' ? o.total : (o.deposit || 0) + (o.collectedAmount || 0)), 0) + sheetSimonTotal;
  const simonPending = Math.max(0, simonTotal - simonCollected);

  // Turno breakdown for Simón
  const simonMananaTickets = sheetSimonTickets.filter(t => t.shift === 'manana');
  const simonMananaMoney = simonMananaTickets.reduce((s, t) => s + t.totalAmount, 0);
  const simonMananaPieces = simonMananaTickets.reduce((s, t) => s + t.totalPieces, 0);
  const simonTardeTickets = sheetSimonTickets.filter(t => t.shift === 'tarde');
  const simonTardeMoney = simonTardeTickets.reduce((s, t) => s + t.totalAmount, 0);
  const simonTardePieces = simonTardeTickets.reduce((s, t) => s + t.totalPieces, 0);

  // Turno breakdown for Osvaldo
  const osvaldoMananaTickets = sheetOsvaldoTickets.filter(t => t.shift === 'manana');
  const osvaldoMananaMoney = osvaldoMananaTickets.reduce((s, t) => s + t.totalAmount, 0);
  const osvaldoMananaPieces = osvaldoMananaTickets.reduce((s, t) => s + t.totalPieces, 0);
  const osvaldoTardeTickets = sheetOsvaldoTickets.filter(t => t.shift === 'tarde');
  const osvaldoTardeMoney = osvaldoTardeTickets.reduce((s, t) => s + t.totalAmount, 0);
  const osvaldoTardePieces = osvaldoTardeTickets.reduce((s, t) => s + t.totalPieces, 0);

  // =========================================================================
  // CORTE DIARIO DE REPARTIDORES A LA 1:00 PM (REQUISITO ESTRICTO DEL NEGOCIO)
  // Solo se colocan pendientes los tickets de:
  // 1) HOY EN LA MAÑANA (cutTargetDate, turno 'manana')
  // 2) AYER EN LA TARDE (cutPriorDate, turno 'tarde')
  // =========================================================================
  const cutTargetDate = dateFilterMode === 'ayer' ? yesterdayStr : (dateFilterMode === 'hoy' ? todayStr : selectedDate);
  const cutPriorDate = getPriorDay(cutTargetDate);

  const LIQUIDATED_REP_CUT_KEY = 'santafe_driver_cut_liquidated_';
  const LIQUIDATED_REP_TICKETS_KEY = 'santafe_liquidated_rep_ticket_ids_v1';

  const isDriverCutLiquidated = (driverId: 'simon' | 'osvaldo', dateStr: string): boolean => {
    try {
      return Boolean(localStorage.getItem(`${LIQUIDATED_REP_CUT_KEY}${driverId}_${dateStr}`));
    } catch {}
    return false;
  };

  const setDriverCutLiquidated = (driverId: 'simon' | 'osvaldo', dateStr: string, amount: number): void => {
    try {
      localStorage.setItem(`${LIQUIDATED_REP_CUT_KEY}${driverId}_${dateStr}`, JSON.stringify({
        liquidatedAt: new Date().toISOString(),
        amount,
        driverId,
        date: dateStr
      }));
    } catch {}
  };

  const removeDriverCutLiquidated = (driverId: 'simon' | 'osvaldo', dateStr: string): void => {
    try {
      localStorage.removeItem(`${LIQUIDATED_REP_CUT_KEY}${driverId}_${dateStr}`);
    } catch {}
  };

  const getLiquidatedRepTicketIds = (): Set<string> => {
    try {
      const raw = localStorage.getItem(LIQUIDATED_REP_TICKETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {}
    return new Set();
  };

  const markRepTicketLiquidated = (ticketId: string): void => {
    try {
      const set = getLiquidatedRepTicketIds();
      set.add(ticketId);
      localStorage.setItem(LIQUIDATED_REP_TICKETS_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  };

  const unmarkRepTicketLiquidated = (ticketId: string): void => {
    try {
      const set = getLiquidatedRepTicketIds();
      set.delete(ticketId);
      localStorage.setItem(LIQUIDATED_REP_TICKETS_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  };

  // Calcular lista detallada de tickets que entran al corte de 1:00 PM
  const driverCutTickets = useMemo(() => {
    const list: Array<{
      id: string;
      folio: string;
      clientId: string;
      clientName: string;
      clientPhone?: string;
      clientAddress?: string;
      driverId: 'simon' | 'osvaldo';
      driverName: string;
      date: string;
      shift: 'manana' | 'tarde';
      periodLabel: string;
      items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      totalPieces: number;
      totalAmount: number;
      isPaid: boolean;
      orderRef?: BakeryOrder;
    }> = [];

    const liquidatedIds = getLiquidatedRepTicketIds();
    const simonCutDone = isDriverCutLiquidated('simon', cutTargetDate);
    const osvaldoCutDone = isDriverCutLiquidated('osvaldo', cutTargetDate);

    const getItems = (c: DriverCustomer) => {
      if (c.items && c.items.length > 0) return c.items;
      return [
        { breadName: 'Bolillo', unitPrice: 4.00 },
        { breadName: 'Dulce', unitPrice: 8.50 }
      ];
    };

    // 1. AYER EN LA TARDE (cutPriorDate, shift 'tarde')
    const ayerTardeSheet = getDailyDeliverySheet(cutPriorDate, 'tarde');
    activeDeliveryClients.forEach(c => {
      const tQ = ayerTardeSheet[c.id] || {};
      let pieces = 0;
      let total = 0;
      const items: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = [];
      getItems(c).forEach(it => {
        const q = tQ[it.breadName] || 0;
        if (q > 0) {
          pieces += q;
          total += q * it.unitPrice;
          items.push({ name: it.breadName, quantity: q, unitPrice: it.unitPrice, total: q * it.unitPrice });
        }
      });

      if (pieces > 0) {
        const id = `rep_cut_${cutPriorDate}_tarde_${c.id}`;
        const isPaid = (c.driverId === 'simon' ? simonCutDone : osvaldoCutDone) || liquidatedIds.has(id);
        list.push({
          id,
          folio: `CUT-T${c.id.slice(-4)}`,
          clientId: c.id,
          clientName: c.name,
          clientPhone: c.phone,
          clientAddress: c.address,
          driverId: c.driverId as 'osvaldo' | 'simon',
          driverName: c.driverId === 'osvaldo' ? 'Osvaldo' : 'Simón',
          date: cutPriorDate,
          shift: 'tarde',
          periodLabel: '🌇 Ayer Tarde',
          items,
          totalPieces: pieces,
          totalAmount: total,
          isPaid
        });
      }
    });

    // 2. HOY EN LA MAÑANA (cutTargetDate, shift 'manana')
    const hoyMananaSheet = getDailyDeliverySheet(cutTargetDate, 'manana');
    activeDeliveryClients.forEach(c => {
      const mQ = hoyMananaSheet[c.id] || {};
      let pieces = 0;
      let total = 0;
      const items: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = [];
      getItems(c).forEach(it => {
        const q = mQ[it.breadName] || 0;
        if (q > 0) {
          pieces += q;
          total += q * it.unitPrice;
          items.push({ name: it.breadName, quantity: q, unitPrice: it.unitPrice, total: q * it.unitPrice });
        }
      });

      if (pieces > 0) {
        const id = `rep_cut_${cutTargetDate}_manana_${c.id}`;
        const isPaid = (c.driverId === 'simon' ? simonCutDone : osvaldoCutDone) || liquidatedIds.has(id);
        list.push({
          id,
          folio: `CUT-M${c.id.slice(-4)}`,
          clientId: c.id,
          clientName: c.name,
          clientPhone: c.phone,
          clientAddress: c.address,
          driverId: c.driverId as 'osvaldo' | 'simon',
          driverName: c.driverId === 'osvaldo' ? 'Osvaldo' : 'Simón',
          date: cutTargetDate,
          shift: 'manana',
          periodLabel: '🌅 Hoy Mañana',
          items,
          totalPieces: pieces,
          totalAmount: total,
          isPaid
        });
      }
    });

    // 3. BakeryOrders de Ayer Tarde o Hoy Mañana
    orders.forEach(o => {
      if (isOrderDelivery(o) && o.assignedDriverId) {
        const isAyerTarde = o.deliveryDate === cutPriorDate && o.deliveryShift === 'tarde';
        const isHoyManana = o.deliveryDate === cutTargetDate && (o.deliveryShift === 'manana' || !o.deliveryShift);
        if (isAyerTarde || isHoyManana) {
          const id = `rep_cut_order_${o.id || o.folio}`;
          const isPaid = o.paymentStatus === 'pagado' || (o.assignedDriverId === 'simon' ? simonCutDone : osvaldoCutDone) || liquidatedIds.has(id);
          const pending = o.pendingAmount > 0 ? o.pendingAmount : Math.max(0, o.total - (o.deposit || 0) - (o.collectedAmount || 0));
          list.push({
            id,
            folio: o.folio,
            clientId: o.id,
            clientName: o.customerName,
            clientPhone: o.customerPhone,
            clientAddress: o.address,
            driverId: o.assignedDriverId as 'osvaldo' | 'simon',
            driverName: o.assignedDriverId === 'osvaldo' ? 'Osvaldo' : 'Simón',
            date: o.deliveryDate,
            shift: isAyerTarde ? 'tarde' : 'manana',
            periodLabel: isAyerTarde ? '🌇 Ayer Tarde' : '🌅 Hoy Mañana',
            items: o.items.map(it => ({ name: it.name, quantity: it.quantity, unitPrice: it.price, total: it.total })),
            totalPieces: o.items.reduce((s, it) => s + it.quantity, 0),
            totalAmount: pending > 0 ? pending : o.total,
            isPaid,
            orderRef: o
          });
        }
      }
    });

    return list;
  }, [activeDeliveryClients, cutTargetDate, cutPriorDate, orders, deliverySyncVersion, cutLiquidationCounter]);

  // Simón Cut 1 PM
  const simonCutTickets = useMemo(() => driverCutTickets.filter(t => t.driverId === 'simon'), [driverCutTickets]);
  const simonCutTotal = useMemo(() => simonCutTickets.reduce((s, t) => s + t.totalAmount, 0), [simonCutTickets]);
  const simonCutPieces = useMemo(() => simonCutTickets.reduce((s, t) => s + t.totalPieces, 0), [simonCutTickets]);
  const simonCutPaid = useMemo(() => simonCutTickets.filter(t => t.isPaid).reduce((s, t) => s + t.totalAmount, 0), [simonCutTickets]);
  const simonCutPending = useMemo(() => Math.max(0, simonCutTotal - simonCutPaid), [simonCutTotal, simonCutPaid]);
  const simonIsLiquidated = isDriverCutLiquidated('simon', cutTargetDate) || (simonCutTickets.length > 0 && simonCutPending === 0);

  // Turno breakdown for Simón Cut
  const simonAyerTardeTickets = useMemo(() => simonCutTickets.filter(t => t.shift === 'tarde'), [simonCutTickets]);
  const simonAyerTardeTotal = useMemo(() => simonAyerTardeTickets.reduce((s, t) => s + t.totalAmount, 0), [simonAyerTardeTickets]);
  const simonAyerTardePieces = useMemo(() => simonAyerTardeTickets.reduce((s, t) => s + t.totalPieces, 0), [simonAyerTardeTickets]);
  const simonHoyMananaTickets = useMemo(() => simonCutTickets.filter(t => t.shift === 'manana'), [simonCutTickets]);
  const simonHoyMananaTotal = useMemo(() => simonHoyMananaTickets.reduce((s, t) => s + t.totalAmount, 0), [simonHoyMananaTickets]);
  const simonHoyMananaPieces = useMemo(() => simonHoyMananaTickets.reduce((s, t) => s + t.totalPieces, 0), [simonHoyMananaTickets]);

  // Osvaldo Cut 1 PM
  const osvaldoCutTickets = useMemo(() => driverCutTickets.filter(t => t.driverId === 'osvaldo'), [driverCutTickets]);
  const osvaldoCutTotal = useMemo(() => osvaldoCutTickets.reduce((s, t) => s + t.totalAmount, 0), [osvaldoCutTickets]);
  const osvaldoCutPieces = useMemo(() => osvaldoCutTickets.reduce((s, t) => s + t.totalPieces, 0), [osvaldoCutTickets]);
  const osvaldoCutPaid = useMemo(() => osvaldoCutTickets.filter(t => t.isPaid).reduce((s, t) => s + t.totalAmount, 0), [osvaldoCutTickets]);
  const osvaldoCutPending = useMemo(() => Math.max(0, osvaldoCutTotal - osvaldoCutPaid), [osvaldoCutTotal, osvaldoCutPaid]);
  const osvaldoIsLiquidated = isDriverCutLiquidated('osvaldo', cutTargetDate) || (osvaldoCutTickets.length > 0 && osvaldoCutPending === 0);

  // Turno breakdown for Osvaldo Cut
  const osvaldoAyerTardeTickets = useMemo(() => osvaldoCutTickets.filter(t => t.shift === 'tarde'), [osvaldoCutTickets]);
  const osvaldoAyerTardeTotal = useMemo(() => osvaldoAyerTardeTickets.reduce((s, t) => s + t.totalAmount, 0), [osvaldoAyerTardeTickets]);
  const osvaldoAyerTardePieces = useMemo(() => osvaldoAyerTardeTickets.reduce((s, t) => s + t.totalPieces, 0), [osvaldoAyerTardeTickets]);
  const osvaldoHoyMananaTickets = useMemo(() => osvaldoCutTickets.filter(t => t.shift === 'manana'), [osvaldoCutTickets]);
  const osvaldoHoyMananaTotal = useMemo(() => osvaldoHoyMananaTickets.reduce((s, t) => s + t.totalAmount, 0), [osvaldoHoyMananaTickets]);
  const osvaldoHoyMananaPieces = useMemo(() => osvaldoHoyMananaTickets.reduce((s, t) => s + t.totalPieces, 0), [osvaldoHoyMananaTickets]);

  const deliveryTotalGenerated = simonTotal + osvaldoTotal;
  const deliveryPiecesCount = simonPieces + osvaldoPieces;
  const deliveryTotalCollected = simonCutPaid + osvaldoCutPaid;
  // Requisito estricto del usuario: pendientes de reparto SOLO son Hoy Mañana + Ayer Tarde
  const deliveryTotalPending = simonCutPending + osvaldoCutPending;
  const deliveryTotalClients = sheetSimonTickets.length + sheetOsvaldoTickets.length + simonOrders.length + osvaldoOrders.length;

  // Percentage calculations
  const simonMoneyPct = deliveryTotalGenerated > 0 ? Math.round((simonTotal / deliveryTotalGenerated) * 100) : 0;
  const osvaldoMoneyPct = deliveryTotalGenerated > 0 ? Math.max(0, 100 - simonMoneyPct) : 0;
  const simonPiecesPct = deliveryPiecesCount > 0 ? Math.round((simonPieces / deliveryPiecesCount) * 100) : 0;
  const osvaldoPiecesPct = deliveryPiecesCount > 0 ? Math.max(0, 100 - simonPiecesPct) : 0;

  // C. CLIENTES VIP (PEDIDOS TIENDA + CLIENTES VIP CON TRANSFERENCIA/FACTURA)
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

  const vipOnlyTotalGenerated = dateMatchedVipOrders.reduce((acc, vo) => acc + (vo.totalAmount || 0), 0);
  const vipOnlyTotalCollected = dateMatchedVipOrders.reduce((acc, vo) => {
    if (vo.paymentStatus === 'pagado' || vo.isAudited) return acc + (vo.totalAmount || 0);
    return acc;
  }, 0);
  const vipOnlyTotalPending = dateMatchedVipOrders.reduce((acc, vo) => {
    if (vo.paymentStatus === 'pagado' || vo.isAudited) return acc;
    return acc + (vo.totalAmount || 0);
  }, 0);

  const vipCombinedTotalGenerated = storeOrdersTotalGenerated + vipOnlyTotalGenerated;
  const vipCombinedTotalCollected = storeOrdersTotalCollected + vipOnlyTotalCollected;
  const vipCombinedTotalPending = storeOrdersTotalPending + vipOnlyTotalPending;
  const vipCombinedCount = storePickupOrders.length + dateMatchedVipOrders.length;

  // D. MONTOS POR COBRAR (CUENTAS POR COBRAR: REPARTO + CLIENTES VIP)
  const totalGlobalPending = deliveryTotalPending + vipCombinedTotalPending;
  const countPendingCutTickets = driverCutTickets.filter(t => !t.isPaid).length;
  const countPendingStoreOrders = storePickupOrders.filter(o => o.paymentStatus !== 'pagado').length;
  const countPendingVipOrders = dateMatchedVipOrders.filter(vo => vo.paymentStatus !== 'pagado' && !vo.isAudited).length;
  const countPendingOrders = countPendingCutTickets + countPendingStoreOrders + countPendingVipOrders;

  // Gran Total de Ventas Globales (Mostrador + Repartos + Clientes VIP)
  const grandTotalSales = mostradorTotal + deliveryTotalGenerated + vipCombinedTotalGenerated;
  const grandTotalCollectedCashAndCard = mostradorTotal + deliveryTotalCollected + vipCombinedTotalCollected;

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

  // Gastos operativos registrados en el nuevo módulo de Gastos y Proveedores
  const relevantPeriodOperationalExpenses = (operationalExpenses || []).filter(e => {
    const eDate = e.date || '';
    if (dateFilterMode === 'hoy' && eDate !== todayStr) return false;
    if (dateFilterMode === 'ayer' && eDate !== yesterdayStr) return false;
    if (dateFilterMode === 'semana' && eDate < sevenDaysAgoStr) return false;
    if (dateFilterMode === 'personalizado' && eDate !== selectedDate) return false;
    return true;
  });
  const totalPeriodOperationalExpenses = relevantPeriodOperationalExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Gastos operativos totales (caja chica + nómina/renta/proveedores)
  const grandTotalPeriodExpenses = totalPeriodOutflows + totalPeriodOperationalExpenses;

  // Fórmula solicitada por el usuario:
  // (+) Ingresos mostrador + (+) Ventas de reparto - (-) Gastos operativos = (=) Utilidad Neta
  const totalRevenueCombined = mostradorTotal + deliveryTotalCollected;
  const netUtilityCombined = totalRevenueCombined - grandTotalPeriodExpenses;
  const netMarginCombined = totalRevenueCombined > 0 ? Math.round((netUtilityCombined / totalRevenueCombined) * 100) : 0;

  const netPeriodProfit = mostradorTotal - totalPeriodOutflows;
  const netPeriodMargin = mostradorTotal > 0 ? Math.round((netPeriodProfit / mostradorTotal) * 100) : 0;

  // --- FILTERS PER VIEW ---
  // Filtered tickets (Corte mostrador - EXCLUYE REPARTO)
  const filteredTickets = mostradorTickets.filter(ticket => {
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

  // Filtered Daily Delivery Sheet Tickets (Mostrador Simón & Osvaldo)
  const filteredDailySheetTickets = useMemo(() => {
    return dailySheetTickets.filter(t => {
      if (driverFilter !== 'todos' && t.driverId !== driverFilter) return false;
      if (deliveryShiftFilter !== 'todos' && t.shift !== deliveryShiftFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = t.clientName.toLowerCase().includes(q);
        const matchItems = t.items.some(it => it.name.toLowerCase().includes(q));
        if (!matchName && !matchItems) return false;
      }
      return true;
    });
  }, [dailySheetTickets, driverFilter, deliveryShiftFilter, searchQuery]);

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

  // Unified Receivables List (Corte de Reparto 1:00 PM + Pide y Recoge en Tienda)
  const unifiedReceivables = useMemo(() => {
    const list: Array<{
      id: string;
      folio: string;
      type: 'reparto' | 'tienda';
      periodLabel: string;
      customerName: string;
      customerPhone?: string;
      address?: string;
      assignedTo: string;
      date: string;
      total: number;
      deposit: number;
      pendingAmount: number;
      isPaid: boolean;
      itemsSummary?: string;
      orderRef?: BakeryOrder;
    }> = [];

    // 1. Tickets del Corte de Reparto (Hoy Mañana + Ayer Tarde)
    driverCutTickets.forEach(t => {
      list.push({
        id: t.id,
        folio: t.folio,
        type: 'reparto',
        periodLabel: t.periodLabel,
        customerName: t.clientName,
        customerPhone: t.clientPhone,
        address: t.clientAddress,
        assignedTo: t.driverName,
        date: t.date,
        total: t.totalAmount,
        deposit: t.isPaid ? t.totalAmount : 0,
        pendingAmount: t.isPaid ? 0 : t.totalAmount,
        isPaid: t.isPaid,
        itemsSummary: t.items.map(it => `${it.quantity}x ${it.name}`).join(', '),
        orderRef: t.orderRef
      });
    });

    // 2. Pedidos Clientes VIP (Tienda + Módulo VIP)
    storePickupOrders.forEach(o => {
      const pending = o.pendingAmount > 0 
        ? o.pendingAmount 
        : (o.paymentStatus !== 'pagado' ? Math.max(0, o.total - (o.deposit || 0) - (o.collectedAmount || 0)) : 0);
      list.push({
        id: o.id || o.folio,
        folio: o.folio,
        type: 'tienda',
        periodLabel: '👑 Clientes VIP (Tienda)',
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        address: o.address,
        assignedTo: 'Mostrador / VIP',
        date: o.deliveryDate || '',
        total: o.total,
        deposit: (o.deposit || 0) + (o.collectedAmount || 0),
        pendingAmount: pending,
        isPaid: o.paymentStatus === 'pagado' || pending === 0,
        itemsSummary: o.items.map(it => `${it.quantity}x ${it.name}`).join(', '),
        orderRef: o
      });
    });

    dateMatchedVipOrders.forEach(vo => {
      const isPaid = vo.paymentStatus === 'pagado' || Boolean(vo.isAudited);
      const pending = isPaid ? 0 : vo.totalAmount;
      list.push({
        id: vo.id || vo.folio,
        folio: vo.folio,
        type: 'tienda',
        periodLabel: '👑 Clientes VIP (Transferencia)',
        customerName: vo.customerName,
        customerPhone: vo.customerPhone,
        address: 'Pasa a recoger a la panadería',
        assignedTo: 'Contabilidad / VIP',
        date: vo.date || '',
        total: vo.totalAmount,
        deposit: isPaid ? vo.totalAmount : 0,
        pendingAmount: pending,
        isPaid,
        itemsSummary: `${vo.breadType || 'Pan surtido VIP'}${vo.requiresInvoice ? ' · Requiere Factura' : ''}`
      });
    });

    return list;
  }, [driverCutTickets, storePickupOrders, dateMatchedVipOrders]);

  // Filtered Receivables
  const filteredReceivables = useMemo(() => {
    return unifiedReceivables.filter(item => {
      if (item.pendingAmount <= 0) return false;
      if (receivableTypeFilter === 'reparto' && item.type !== 'reparto') return false;
      if (receivableTypeFilter === 'tienda' && item.type !== 'tienda') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchFolio = item.folio.toLowerCase().includes(q);
        const matchCustomer = item.customerName.toLowerCase().includes(q);
        const matchPhone = item.customerPhone?.includes(q);
        if (!matchFolio && !matchCustomer && !matchPhone) return false;
      }
      return true;
    });
  }, [unifiedReceivables, receivableTypeFilter, searchQuery]);

  // Handlers para liquidar corte de 1:00 PM de choferes
  const handleLiquidateDriverCut = (driverId: 'simon' | 'osvaldo') => {
    const driverName = driverId === 'simon' ? 'Simón' : 'Osvaldo';
    const amount = driverId === 'simon' ? simonCutPending : osvaldoCutPending;
    const totalAmount = driverId === 'simon' ? simonCutTotal : osvaldoCutTotal;
    setDriverCutLiquidated(driverId, cutTargetDate, totalAmount);
    const ticketsToMark = driverId === 'simon' ? simonCutTickets : osvaldoCutTickets;
    ticketsToMark.forEach(t => markRepTicketLiquidated(t.id));

    // Si había BakeryOrders asociadas, marcarlas pagadas
    ticketsToMark.forEach(t => {
      if (t.orderRef && onUpdateOrder) {
        onUpdateOrder({
          ...t.orderRef,
          paymentStatus: 'pagado',
          pendingAmount: 0,
          collectedAmount: t.orderRef.total
        });
      }
    });

    playCashSound();
    setCutLiquidationCounter(prev => prev + 1);
    setSettleSuccessNotice(`¡Corte de 1:00 PM de ${driverName} liquidado en Caja por $${amount > 0 ? amount : totalAmount}.00!`);
    setTimeout(() => setSettleSuccessNotice(''), 5000);
  };

  const handleUndoDriverCutLiquidation = (driverId: 'simon' | 'osvaldo') => {
    const driverName = driverId === 'simon' ? 'Simón' : 'Osvaldo';
    removeDriverCutLiquidated(driverId, cutTargetDate);
    const ticketsToUnmark = driverId === 'simon' ? simonCutTickets : osvaldoCutTickets;
    ticketsToUnmark.forEach(t => unmarkRepTicketLiquidated(t.id));
    playBeep(450, 'sawtooth', 0.1);
    setCutLiquidationCounter(prev => prev + 1);
    setSettleSuccessNotice(`Liquidación de ${driverName} revertida a pendiente.`);
    setTimeout(() => setSettleSuccessNotice(''), 4000);
  };

  const handleLiquidateSingleCutTicket = (ticketId: string, amount: number, clientName: string) => {
    markRepTicketLiquidated(ticketId);
    playCashSound();
    setCutLiquidationCounter(prev => prev + 1);
    setSettleSuccessNotice(`¡Cobro de $${amount}.00 para ${clientName} liquidado con éxito!`);
    setTimeout(() => setSettleSuccessNotice(''), 4000);
  };

  // --- ACTIONS ---
  // Handle Delete Ticket with PIN
  const handleOpenDeleteModal = (ticket: SaleTicket) => {
    setTicketToDelete(ticket);
    setAdminPinInput('');
    setPinError('');
  };

  const handleConfirmDelete = () => {
    if (!ticketToDelete) return;
    const validPin = settings.adminPin || '135792';
    if (adminPinInput.trim() === '135792' || adminPinInput.trim() === '13579' || adminPinInput.trim() === validPin) {
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
      setPinError('❌ Clave de administrador incorrecta.');
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

  // Print consolidated manifest ticket for a driver
  const handlePrintDriverManifest = (driverId: 'osvaldo' | 'simon') => {
    const driverName = driverId === 'osvaldo' ? 'Osvaldo' : 'Simón';
    const ticketsForDriver = dailySheetTickets.filter(t => t.driverId === driverId);
    if (ticketsForDriver.length === 0) {
      alert(`No hay pedidos cargados para ${driverName} en la fecha ${selectedDate}.`);
      return;
    }
    const clientSummaries = ticketsForDriver.map(t => ({
      clientName: t.clientName,
      itemsSummary: t.items,
      clientTotal: t.totalAmount,
      clientPieces: t.totalPieces
    }));
    const totalAmount = ticketsForDriver.reduce((s, t) => s + t.totalAmount, 0);
    const totalPieces = ticketsForDriver.reduce((s, t) => s + t.totalPieces, 0);
    playCashSound();
    printDriverConsolidatedTicketDirectToPrinter(
      driverName,
      selectedDate,
      clientSummaries,
      totalAmount,
      totalPieces,
      settings,
      deliveryShiftFilter === 'todos' ? undefined : (deliveryShiftFilter === 'manana' ? 'Mañana' : 'Tarde')
    );
  };

  // Print individual delivery client ticket (single copy)
  const handlePrintDeliveryClientTicket = (ticket: typeof dailySheetTickets[0]) => {
    playCashSound();
    printDeliveryClientTicketDirectToPrinter(
      ticket.clientName,
      ticket.driverName,
      ticket.date,
      ticket.items,
      ticket.totalAmount,
      ticket.totalPieces,
      settings,
      ticket.shiftLabel
    );
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
    const expectedCash = cutCash - totalOutflows;

    const cutRecord: ShiftCutRecord = {
      id: `cut-hist-${Date.now()}`,
      folio: `CORTE-${shiftType.toUpperCase()}`,
      date: dateFilterMode === 'hoy' ? todayStr : selectedDate,
      time: getNowTimeString(),
      cashierName: shiftCashier,
      shiftName: shiftTitle,
      initialCash: 0,
      nextShiftCash: 1000,
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
      notes: 'Fondo de $1,000 en caja dejado para cambio (no contabilizado en ventas ni en la entrega).',
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
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xl shadow-xs">
            📊
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
              Historial de Ventas y Caja
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Cortes de mostrador, turnos y control de productos No Pan
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
                if (window.confirm('¿Deseas limpiar todos los montos de repartos, Clientes VIP y cuentas por cobrar dejándolos en ceros ($0)? (Las ventas y cortes de mostrador se conservarán intactos)')) {
                  onClearOrders();
                  playCashSound();
                  setCloudSyncNotice('🧹 Montos de repartos, Clientes VIP y cuentas por cobrar limpiados a ceros ($0).');
                  setTimeout(() => setCloudSyncNotice(''), 4000);
                }
              }}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 transition-colors cursor-pointer border border-rose-200"
              title="Limpia todos los pedidos de reparto, Clientes VIP y montos por cobrar dejándolos en ceros"
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

      {/* VISTA RÁPIDA DE LO VENDIDO EN ZAKIA Y REFUGIO AL MISMO TIEMPO */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-3.5 sm:p-4 text-white shadow-lg border border-slate-700 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <h2 className="text-xs sm:text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                <span>Vista Rápida: Sucursal Zakia y El Refugio</span>
                <span className="text-[10px] font-bold bg-amber-400 text-slate-950 px-2 py-0.2 rounded-full uppercase tracking-wider">
                  En Vivo
                </span>
              </h2>
              <p className="text-[11px] text-slate-300 font-medium">
                Comparativa simultánea de ventas y tickets para el período seleccionado
              </p>
            </div>
          </div>

          {/* Filtro Rápido de Sucursal */}
          <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-600/70 shadow-inner">
            <button
              type="button"
              onClick={() => {
                setBranchFilter('todas');
                playBeep(600, 'sine', 0.03);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                branchFilter === 'todas'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              🏢 Todas
            </button>
            <button
              type="button"
              onClick={() => {
                setBranchFilter('refugio');
                playBeep(600, 'sine', 0.03);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                branchFilter === 'refugio'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              🥖 El Refugio
            </button>
            <button
              type="button"
              onClick={() => {
                setBranchFilter('zakia');
                playBeep(600, 'sine', 0.03);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                branchFilter === 'zakia'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm font-black'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              🌿 Zakia
            </button>
          </div>
        </div>

        {/* 3 Comparative Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Card El Refugio */}
          <button
            type="button"
            onClick={() => {
              setBranchFilter(branchFilter === 'refugio' ? 'todas' : 'refugio');
              playBeep(650, 'sine', 0.03);
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              branchFilter === 'refugio'
                ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/30'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-amber-300 font-bold mb-1">
              <span className="flex items-center gap-1">
                <span>🥖</span>
                <span>Sucursal El Refugio</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-200 font-bold">
                {branchComparison.refugio.count} tickets
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black font-mono text-white">
              ${branchComparison.refugio.sales.toLocaleString('es-MX')}.00
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              {branchComparison.refugio.pieces} piezas vendidas
            </div>
          </button>

          {/* Card Zakia */}
          <button
            type="button"
            onClick={() => {
              setBranchFilter(branchFilter === 'zakia' ? 'todas' : 'zakia');
              playBeep(650, 'sine', 0.03);
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              branchFilter === 'zakia'
                ? 'bg-emerald-500/20 border-emerald-400 ring-2 ring-emerald-400/30'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-emerald-300 font-bold mb-1">
              <span className="flex items-center gap-1">
                <span>🌿</span>
                <span>Sucursal Zakia</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-400/20 text-emerald-200 font-bold">
                {branchComparison.zakia.count} tickets
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black font-mono text-white">
              ${branchComparison.zakia.sales.toLocaleString('es-MX')}.00
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              {branchComparison.zakia.pieces} piezas vendidas
            </div>
          </button>

          {/* Card General Consolidado */}
          <button
            type="button"
            onClick={() => {
              setBranchFilter('todas');
              playBeep(650, 'sine', 0.03);
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              branchFilter === 'todas'
                ? 'bg-blue-500/20 border-blue-400 ring-2 ring-blue-400/30'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-blue-300 font-bold mb-1">
              <span className="flex items-center gap-1">
                <span>🏢</span>
                <span>Total General Consolidado</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-400/20 text-blue-200 font-bold">
                {branchComparison.total.count} tickets
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black font-mono text-amber-300">
              ${branchComparison.total.sales.toLocaleString('es-MX')}.00
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              {branchComparison.total.pieces} piezas totales
            </div>
          </button>
        </div>
      </div>

      {/* 2. SELECTOR DE VISTA Y FECHA PRINCIPAL (Navegación Rápida con Ayer, Hoy, Semanas y Meses) */}
      <div className="bg-white rounded-2xl p-2.5 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {/* Botón HOY */}
          <button
            type="button"
            id="history-btn-hoy"
            onClick={() => {
              setHistoryViewMode('dia');
              setDateFilterMode('hoy');
              setSelectedDate(todayStr);
              playBeep(650, 'sine', 0.03);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              historyViewMode === 'dia' && dateFilterMode === 'hoy'
                ? 'bg-slate-900 text-white shadow-xs ring-2 ring-slate-800'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Ver ventas y corte de hoy"
          >
            <span>☀️</span>
            <span>Hoy ({todayStr.slice(5)})</span>
          </button>

          {/* Botón AYER (Requisito explícito del usuario) */}
          <button
            type="button"
            id="history-btn-ayer"
            onClick={() => {
              setHistoryViewMode('dia');
              setDateFilterMode('ayer');
              setSelectedDate(yesterdayStr);
              playBeep(650, 'sine', 0.03);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              historyViewMode === 'dia' && dateFilterMode === 'ayer'
                ? 'bg-blue-700 text-white shadow-xs ring-2 ring-blue-600'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Ver ventas y corte del día de ayer"
          >
            <span>⏪</span>
            <span>Ayer ({yesterdayStr.slice(5)})</span>
          </button>

          {/* Selector de cualquier día */}
          <div className="flex items-center gap-1 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  setDateFilterMode('personalizado');
                  setHistoryViewMode('dia');
                  playBeep(650, 'sine', 0.03);
                }
              }}
              className="bg-transparent text-xs font-black text-slate-800 cursor-pointer focus:outline-none"
              title="Elegir cualquier otra fecha en el calendario"
            />
          </div>

          <div className="h-6 w-px bg-slate-200 hidden sm:block mx-0.5" />

          {/* Botón POR SEMANA */}
          <button
            type="button"
            id="history-mode-semana-btn"
            onClick={() => {
              setHistoryViewMode('semana');
              playBeep(650, 'sine', 0.03);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              historyViewMode === 'semana'
                ? 'bg-[#D95D39] text-white shadow-xs ring-2 ring-orange-500'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Ver comparativa semanal de Lunes a Domingo y elegir semana"
          >
            <span>📆</span>
            <span>Por Semana</span>
          </button>

          {/* Botón POR MES */}
          <button
            type="button"
            id="history-mode-meses-btn"
            onClick={() => {
              setHistoryViewMode('meses');
              playBeep(650, 'sine', 0.03);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              historyViewMode === 'meses'
                ? 'bg-slate-900 text-white shadow-xs ring-2 ring-slate-800'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Ver resumen y ganancias por mes"
          >
            <span>📈</span>
            <span>Por Mes</span>
          </button>
        </div>

        {/* Indicador visual activo de qué fecha/período se está visualizando */}
        <div className="text-xs font-bold text-slate-700 bg-amber-50/90 border border-amber-300 px-3 py-1.5 rounded-xl flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-black">
            {historyViewMode === 'semana'
              ? 'Vista Semanal (Lunes a Domingo)'
              : historyViewMode === 'meses'
              ? 'Vista Mensual'
              : dateFilterMode === 'hoy'
              ? `Viendo: Hoy (${todayStr})`
              : dateFilterMode === 'ayer'
              ? `Viendo: Ayer (${yesterdayStr})`
              : `Viendo: ${selectedDate}`}
          </span>
        </div>
      </div>

      {/* VISTA SEMANAL (Lunes a Domingo) */}
      {historyViewMode === 'semana' && (
        <WeeklySalesView
          tickets={branchFilter === 'todas' ? tickets : tickets.filter(t => (t.branch || 'refugio') === branchFilter)}
          orders={orders}
          outflows={allOutflowsList}
          operationalExpenses={operationalExpenses}
          supplierBills={supplierBills}
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
          tickets={branchFilter === 'todas' ? tickets : tickets.filter(t => (t.branch || 'refugio') === branchFilter)}
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
              {deliveryTotalClients > 0 ? deliveryTotalClients : deliveryOrders.length} rutas
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-blue-900 tracking-tight">
              ${deliveryTotalGenerated.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold mt-1 pt-1.5 border-t border-blue-100">
              <span className="text-emerald-700 font-black">Cobrado: ${deliveryTotalCollected.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-amber-700 font-black">Por Cobrar: ${deliveryTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* CARD 3: CLIENTES VIP (TRANSFERENCIAS Y FACTURAS) */}
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
              <span>👑 Clientes VIP</span>
            </span>
            <span className="text-[10px] font-black bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full">
              {vipCombinedCount} pedidos
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-purple-900 tracking-tight">
              ${vipCombinedTotalGenerated.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold mt-1 pt-1.5 border-t border-purple-100">
              <span className="text-emerald-700 font-black">Pagado: ${vipCombinedTotalCollected.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-amber-700 font-black">Por Cobrar: ${vipCombinedTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
              ${totalGlobalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold mt-1 pt-1.5 border-t border-rose-100">
              <span className="text-slate-600">🛵 Reparto: <strong>${deliveryTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
              <span className="text-slate-600">👑 Clientes VIP: <strong>${vipCombinedTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
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
            onClick={() => {
              setDateFilterMode('hoy');
              setSelectedDate(todayStr);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              dateFilterMode === 'hoy' ? 'bg-[#D95D39] text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Hoy
          </button>
          <button
            id="date-filter-ayer-btn"
            type="button"
            onClick={() => {
              setDateFilterMode('ayer');
              setSelectedDate(yesterdayStr);
            }}
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
          <Crown className="w-4 h-4" />
          <span>3. Clientes VIP ({vipCombinedCount})</span>
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
          {/* GRÁFICA DIARIA INTERACTIVA: VENTA DE PAN VS NO PAN */}
          <DailyPanNoPanChart
            tickets={tickets}
            selectedDate={selectedDate}
            onSelectDate={(dateStr) => {
              setSelectedDate(dateStr);
              setDateFilterMode('personalizado');
            }}
          />

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

            {/* Acceso Rápido: Tickets de Reparto por Día (Simón y Osvaldo) */}
            <button
              type="button"
              onClick={() => {
                playBeep(650, 'sine', 0.04);
                setDriverTicketsModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
              title="Consultar y reimprimir tickets de reparto por día de Simón y Osvaldo"
            >
              <span>🛵</span>
              <span>Tickets Reparto Día ({dailySheetTickets.length})</span>
            </button>
          </div>

          {/* PANEL DE MÉTRICAS EJECUTIVAS DE MOSTRADOR (SIN SATURACIÓN DE TEXTO) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-slate-500 block">Ticket Promedio</span>
              <div className="text-xl font-black text-slate-900 mt-1">
                ${Math.round(mostradorTotal / Math.max(1, filteredTickets.length))}.00
              </div>
              <span className="text-[10.5px] text-slate-500 font-medium">Por cliente en mostrador</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-slate-500 block">Piezas por Ticket</span>
              <div className="text-xl font-black text-[#D95D39] mt-1">
                {(mostradorPieces / Math.max(1, filteredTickets.length)).toFixed(1)} <span className="text-xs text-slate-500">pzs</span>
              </div>
              <span className="text-[10.5px] text-slate-500 font-medium">{mostradorPieces} piezas totales</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-slate-500 block">Cobro en Efectivo</span>
              <div className="text-xl font-black text-emerald-700 mt-1">
                {Math.round((mostradorCash / Math.max(1, mostradorTotal)) * 100)}%
              </div>
              <span className="text-[10.5px] text-emerald-800 font-bold">${mostradorCash}.00 en caja</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-black uppercase text-slate-500 block">Cobro con Tarjeta</span>
              <div className="text-xl font-black text-blue-700 mt-1">
                {Math.round((mostradorCard / Math.max(1, mostradorTotal)) * 100)}%
              </div>
              <span className="text-[10.5px] text-blue-800 font-bold">${mostradorCard}.00 en terminal</span>
            </div>
          </div>

          {/* BALANCE GENERAL DEL DÍA / PERÍODO CONECTADO CON GASTOS Y PROVEEDORES */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-4 shadow-md border border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-amber-300">
                  Balance Diario: Mostrador + Reparto - Gastos Operativos
                </span>
                <div className="text-lg font-black mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-amber-200">Mostrador: ${mostradorTotal}</span>
                  <span className="text-slate-400">+</span>
                  <span className="text-blue-300">Reparto: ${deliveryTotalCollected}</span>
                  <span className="text-slate-400">-</span>
                  <span className="text-rose-300">Gastos: ${grandTotalPeriodExpenses}</span>
                  <span className="text-slate-400">=</span>
                  <span className="text-emerald-400 text-xl font-black">Utilidad Neta: ${netUtilityCombined}.00</span>
                </div>
              </div>

              <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/15 text-right">
                <span className="text-[9px] uppercase font-bold text-slate-300 block">Margen Libre</span>
                <span className="text-base font-black text-emerald-300">{netMarginCombined}%</span>
              </div>
            </div>
          </div>

          {/* Listado Comprimible de Tickets de Mostrador (Por defecto cerrado para evitar saturación visual) */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-orange-600" />
                <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Registro de Tickets de Mostrador ({filteredTickets.length})
                  </h2>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {showTicketsTable ? 'Mostrando todos los folios y detalle de ventas' : 'Oculto por defecto para priorizar métricas y rapidez'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
                  Total: <strong className="text-amber-900">${mostradorTotal}.00</strong> ({mostradorPieces} pzs)
                </span>
                <button
                  type="button"
                  onClick={() => setShowTicketsTable(prev => !prev)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showTicketsTable ? 'Ocultar Listado' : `👁️ Ver Listado (${filteredTickets.length} tickets)`}</span>
                </button>
              </div>
            </div>

            {showTicketsTable ? (
              <div className="overflow-x-auto animate-in fade-in duration-150">
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
                    filteredTickets.map((ticket, idx) => {
                      const shift = getTicketShift(ticket);
                      return (
                        <tr key={`${ticket.id || ticket.folio}_${idx}`} className="hover:bg-amber-50/40 transition-colors">
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
          ) : (
            <div className="p-4 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 font-medium">
                {filteredTickets.length} tickets registrados en mostrador para este período.
              </span>
              <button
                type="button"
                onClick={() => setShowTicketsTable(true)}
                className="font-black text-[#D95D39] hover:text-[#b84524] transition-colors cursor-pointer inline-flex items-center gap-1"
              >
                <span>Desplegar listado si deseas auditar o reimprimir folios</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    )}

      {/* =========================================================================
          MODULE 2: MONTOS GENERADOS POR REPARTO (CHOFERES & RUTAS)
          ========================================================================= */}
      {activeModule === 'repartos' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* ===============================================================
              SECCIÓN 1: GRÁFICAS COMPARATIVAS INTERACTIVAS: SIMÓN VS OSVALDO
              (Semana, Mes, Día, Dinero, Piezas, Desglose Turnos Mañana/Tarde)
              =============================================================== */}
          <DeliveryComparisonChart
            tickets={tickets}
            orders={orders}
            driverCustomers={driverCustomers}
            currentSelectedDate={selectedDate}
            onSelectDate={(newDate) => {
              setSelectedDate(newDate);
            }}
          />

          {/* ===============================================================
              SECCIÓN 2: RESÚMENES EJECUTIVOS DIRECTOS (SIN TANTAS LETRAS)
              =============================================================== */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 1. SIMÓN (RESUMEN EJECUTIVO DIRECTO) */}
            <div className="bg-gradient-to-br from-emerald-500/10 via-white to-emerald-50/50 rounded-3xl p-4.5 border-2 border-emerald-400 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2.5 border-b border-emerald-200">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-base shadow-xs">
                      🛵
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-black text-base text-slate-900 leading-none">Simón</h3>
                        <span className="bg-emerald-100 text-emerald-900 font-black text-[9px] px-1.5 py-0.5 rounded-full border border-emerald-300">
                          RUTA 2
                        </span>
                      </div>
                      <span className="text-[11px] text-emerald-700 font-bold mt-0.5 block">
                        {sheetSimonTickets.length + simonOrders.length} entregas realizadas
                      </span>
                    </div>
                  </div>
                </div>

                {/* Métricas clave directas */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-white rounded-2xl p-2.5 border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Venta en Dinero</span>
                    <p className="text-xl font-black text-emerald-950 mt-0.5">
                      ${simonTotal.toLocaleString('es-MX')}
                    </p>
                    <span className="inline-block mt-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {simonMoneyPct}% del total
                    </span>
                  </div>

                  <div className="bg-white rounded-2xl p-2.5 border border-emerald-200 text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Venta en Piezas</span>
                    <p className="text-xl font-black text-slate-900 mt-0.5">
                      {simonPieces.toLocaleString('es-MX')} <span className="text-xs font-bold text-slate-500">pzs</span>
                    </p>
                    <span className="inline-block mt-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {simonPiecesPct}% de piezas
                    </span>
                  </div>
                </div>

                {/* Desglose compacto de Turnos */}
                <div className="bg-emerald-50/60 rounded-xl p-2.5 mt-2.5 border border-emerald-200/60 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block font-bold">🌅 Mañana</span>
                    <strong className="text-slate-900 font-black">${simonMananaMoney.toLocaleString('es-MX')}</strong>
                    <span className="text-[10px] text-slate-500 ml-1">({simonMananaPieces} pzs)</span>
                  </div>
                  <div className="h-6 w-px bg-emerald-200"></div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block font-bold">🌇 Tarde</span>
                    <strong className="text-slate-900 font-black">${simonTardeMoney.toLocaleString('es-MX')}</strong>
                    <span className="text-[10px] text-slate-500 ml-1">({simonTardePieces} pzs)</span>
                  </div>
                </div>
              </div>

              {/* Botón Imprimir Consolidado Simón */}
              <button
                type="button"
                onClick={() => handlePrintDriverManifest('simon')}
                className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer border border-emerald-700"
                title="Imprimir ticket térmico consolidado de Simón"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>🖨️ Imprimir Consolidado Simón</span>
              </button>
            </div>

            {/* 2. OSVALDO (RESUMEN EJECUTIVO DIRECTO) */}
            <div className="bg-gradient-to-br from-blue-500/10 via-white to-blue-50/50 rounded-3xl p-4.5 border-2 border-blue-400 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2.5 border-b border-blue-200">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-base shadow-xs">
                      🛵
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-black text-base text-slate-900 leading-none">Osvaldo</h3>
                        <span className="bg-blue-100 text-blue-900 font-black text-[9px] px-1.5 py-0.5 rounded-full border border-blue-300">
                          RUTA 1
                        </span>
                      </div>
                      <span className="text-[11px] text-blue-700 font-bold mt-0.5 block">
                        {sheetOsvaldoTickets.length + osvaldoOrders.length} entregas realizadas
                      </span>
                    </div>
                  </div>
                </div>

                {/* Métricas clave directas */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-white rounded-2xl p-2.5 border border-blue-200 text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Venta en Dinero</span>
                    <p className="text-xl font-black text-blue-950 mt-0.5">
                      ${osvaldoTotal.toLocaleString('es-MX')}
                    </p>
                    <span className="inline-block mt-1 bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {osvaldoMoneyPct}% del total
                    </span>
                  </div>

                  <div className="bg-white rounded-2xl p-2.5 border border-blue-200 text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Venta en Piezas</span>
                    <p className="text-xl font-black text-slate-900 mt-0.5">
                      {osvaldoPieces.toLocaleString('es-MX')} <span className="text-xs font-bold text-slate-500">pzs</span>
                    </p>
                    <span className="inline-block mt-1 bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {osvaldoPiecesPct}% de piezas
                    </span>
                  </div>
                </div>

                {/* Desglose compacto de Turnos */}
                <div className="bg-blue-50/60 rounded-xl p-2.5 mt-2.5 border border-blue-200/60 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block font-bold">🌅 Mañana</span>
                    <strong className="text-slate-900 font-black">${osvaldoMananaMoney.toLocaleString('es-MX')}</strong>
                    <span className="text-[10px] text-slate-500 ml-1">({osvaldoMananaPieces} pzs)</span>
                  </div>
                  <div className="h-6 w-px bg-blue-200"></div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block font-bold">🌇 Tarde</span>
                    <strong className="text-slate-900 font-black">${osvaldoTardeMoney.toLocaleString('es-MX')}</strong>
                    <span className="text-[10px] text-slate-500 ml-1">({osvaldoTardePieces} pzs)</span>
                  </div>
                </div>
              </div>

              {/* Botón Imprimir Consolidado Osvaldo */}
              <button
                type="button"
                onClick={() => handlePrintDriverManifest('osvaldo')}
                className="mt-3 w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer border border-blue-700"
                title="Imprimir ticket térmico consolidado de Osvaldo"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>🖨️ Imprimir Consolidado Osvaldo</span>
              </button>
            </div>

            {/* 3. RESUMEN GLOBAL REPARTO */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-4.5 shadow-sm flex flex-col justify-between border border-slate-700">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">
                    Total Reparto {dateFilterMode === 'hoy' ? 'de Hoy' : 'del Día'}
                  </span>
                  <span className="bg-white/10 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                    {deliveryTotalClients} entregas
                  </span>
                </div>

                <div className="mt-2.5">
                  <div className="text-3xl font-black text-white tracking-tight">
                    ${deliveryTotalGenerated.toLocaleString('es-MX')}.00
                  </div>
                  <p className="text-xs text-amber-300 font-bold mt-1">
                    {deliveryPiecesCount.toLocaleString('es-MX')} piezas surtidas en total
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/10 text-xs font-bold">
                  <div className="bg-white/5 p-2 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Cobrado</span>
                    <span className="text-emerald-400 font-black text-sm">${deliveryTotalCollected.toLocaleString('es-MX')}</span>
                  </div>
                  <div className="bg-white/5 p-2 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Por Cobrar</span>
                    <span className="text-amber-300 font-black text-sm">${deliveryTotalPending.toLocaleString('es-MX')}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  playBeep(650, 'sine', 0.04);
                  setDriverTicketsModalOpen(true);
                }}
                className="mt-3.5 w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-95 text-slate-950 font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                title="Abrir visor de tickets de reparto"
              >
                <span>🛵</span>
                <span>Visor Completo de Tickets</span>
              </button>
            </div>
          </div>

          {/* ===============================================================
              SECCIÓN 3: CONSULTAR LISTADO DETALLADO DE TICKETS
              (Oculto por defecto para priorizar métricas ejecutivas de Simón y Osvaldo)
              =============================================================== */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-black">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <span>Listado Detallado de Tickets y Envíos</span>
                    <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded-full">
                      {dailySheetTickets.length + filteredDeliveryOrders.length} registros
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">
                    {dailySheetTickets.length} tickets de reparto diario y {filteredDeliveryOrders.length} encargos especiales
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  playBeep(650, 'sine', 0.04);
                  setShowDeliveryTicketsTable(prev => !prev);
                }}
                className={`py-2.5 px-5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 ${
                  showDeliveryTicketsTable
                    ? 'bg-slate-900 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>
                  {showDeliveryTicketsTable
                    ? 'Ocultar Listado de Tickets'
                    : `Consultar Listado de Tickets (${dailySheetTickets.length + filteredDeliveryOrders.length})`}
                </span>
              </button>
            </div>

            {showDeliveryTicketsTable && (
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                {/* Sub-Tabs de Reparto */}
                <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setDeliveryTabMode('hoja_diaria')}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                deliveryTabMode === 'hoja_diaria'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <span>🛵</span>
              <span>Tickets de Reparto Diario ({dailySheetTickets.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDeliveryTabMode('pedidos_especiales')}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                deliveryTabMode === 'pedidos_especiales'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Encargos & Pedidos Especiales ({filteredDeliveryOrders.length})</span>
            </button>
          </div>

          {/* VISTA 1: TICKETS DE REPARTO DIARIO (SIMÓN Y OSVALDO) */}
          {deliveryTabMode === 'hoja_diaria' && (
            <div className="space-y-3">
              {/* Filtros de la Hoja Diaria */}
              <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Chofer:</span>
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => setDriverFilter('todos')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        driverFilter === 'todos' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Todos ({dailySheetTickets.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDriverFilter('osvaldo')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        driverFilter === 'osvaldo' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      🛵 Osvaldo ({sheetOsvaldoTickets.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDriverFilter('simon')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        driverFilter === 'simon' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      🛵 Simón ({sheetSimonTickets.length})
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Turno:</span>
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => setDeliveryShiftFilter('todos')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                        deliveryShiftFilter === 'todos' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Ambos
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryShiftFilter('manana')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                        deliveryShiftFilter === 'manana' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      🌅 Mañana
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryShiftFilter('tarde')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-colors cursor-pointer ${
                        deliveryShiftFilter === 'tarde' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      🌇 Tarde
                    </button>
                  </div>
                </div>

                {driverFilter !== 'todos' && (
                  <button
                    type="button"
                    onClick={() => handlePrintDriverManifest(driverFilter as 'osvaldo' | 'simon')}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir Consolidado {driverFilter === 'osvaldo' ? 'Osvaldo' : 'Simón'}</span>
                  </button>
                )}
              </div>

              {/* Tabla de Tickets de Reparto */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Receipt className="w-4 h-4 text-blue-600" />
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                      Tickets de Clientes de Reparto ({filteredDailySheetTickets.length})
                    </h2>
                  </div>
                  <span className="text-xs font-black text-blue-900">
                    Total del Día: <strong>${filteredDailySheetTickets.reduce((s, t) => s + t.totalAmount, 0)}.00</strong> ({filteredDailySheetTickets.reduce((s, t) => s + t.totalPieces, 0)} pzs)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Cliente / Negocio</th>
                        <th className="py-3 px-3">Chofer</th>
                        <th className="py-3 px-3">Turno</th>
                        <th className="py-3 px-3">Piezas</th>
                        <th className="py-3 px-4">Desglose de Panes</th>
                        <th className="py-3 px-3 text-right">Total a Liquidar</th>
                        <th className="py-3 px-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredDailySheetTickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                            <div className="max-w-md mx-auto space-y-2">
                              <p className="text-sm text-slate-600 font-black">
                                No se encontraron pedidos de reparto para este día con los filtros aplicados.
                              </p>
                              <p className="text-xs text-slate-400 font-normal">
                                Si las chicas cargaron pedidos en la pestaña Repartos, asegúrate de haber seleccionado la fecha correcta arriba.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredDailySheetTickets.map((ticket, idx) => (
                          <tr key={`${ticket.id}_${ticket.shift}_${ticket.date}_${idx}`} className="hover:bg-blue-50/30 transition-colors">
                            <td className="py-3 px-4">
                              <strong className="text-slate-900 block font-bold text-xs">{ticket.clientName}</strong>
                              {ticket.clientAddress && (
                                <span className="text-[10px] text-slate-500 block truncate max-w-[200px]">
                                  📍 {ticket.clientAddress}
                                </span>
                              )}
                              {ticket.clientPhone && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  📞 {ticket.clientPhone}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-flex items-center gap-1 font-black px-2 py-0.5 rounded-md text-[10px] ${
                                ticket.driverId === 'osvaldo'
                                  ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              }`}>
                                🛵 {ticket.driverName.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-bold text-[11px] text-slate-700">
                                {ticket.shiftLabel}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="bg-amber-100 text-amber-950 font-black px-2 py-0.5 rounded text-[11px]">
                                {ticket.totalPieces} pzs
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1 max-w-[320px]">
                                {ticket.items.map((it, idx) => (
                                  <span
                                    key={idx}
                                    className="bg-slate-100 text-slate-800 text-[10.5px] font-semibold px-2 py-0.5 rounded border border-slate-200"
                                  >
                                    <strong>{it.quantity}x</strong> {it.name} (${it.unitPrice.toFixed(2)})
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className="font-black text-sm text-slate-900">
                                ${ticket.totalAmount.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handlePrintDeliveryClientTicket(ticket)}
                                className="bg-amber-100 hover:bg-[#D95D39] hover:text-white text-amber-950 font-black px-2.5 py-1 rounded-lg text-xs transition-colors inline-flex items-center gap-1 cursor-pointer border border-amber-300 shadow-2xs active:scale-95"
                                title="Reimprimir Ticket individual de este cliente (1 solo ticket sin copias)"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Reimprimir Ticket</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 2: ENCARGOS & PEDIDOS ESPECIALES */}
          {deliveryTabMode === 'pedidos_especiales' && (
            <div className="space-y-3">
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
                        filteredDeliveryOrders.map((order, idx) => {
                          const pieces = order.items.reduce((s, it) => s + it.quantity, 0);
                          const pending = order.pendingAmount > 0 
                            ? order.pendingAmount 
                            : (order.paymentStatus !== 'pagado' ? Math.max(0, order.total - (order.deposit || 0) - (order.collectedAmount || 0)) : 0);

                          return (
                            <tr key={`${order.id || order.folio}_${idx}`} className="hover:bg-blue-50/30 transition-colors">
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
                                  🛵 {order.assignedDriverId?.toUpperCase()}
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 3: PEDIDOS CLIENTES VIP (EN TIENDA / TRANSFERENCIAS Y FACTURAS)
          ========================================================================= */}
      {activeModule === 'pedidos_tienda' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Header Summary for VIP Customers */}
          <div className="bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-800 text-white rounded-3xl p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-2xl shadow-inner">
                👑
              </div>
              <div>
                <h3 className="font-black text-lg text-white">Pedidos Clientes VIP (Facturación y Transferencias)</h3>
                <p className="text-xs text-purple-200 font-medium">
                  {vipCombinedCount} pedidos registrados · Transferencias bancarias, facturas CFDI y cotejo de comprobantes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-right">
              <div className="bg-white/15 px-3.5 py-2 rounded-2xl border border-white/10">
                <span className="text-[10px] text-purple-200 uppercase font-black">Monto VIP Total</span>
                <p className="text-xl font-black text-amber-300">${vipCombinedTotalGenerated.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-white/15 px-3.5 py-2 rounded-2xl border border-white/10">
                <span className="text-[10px] text-purple-200 uppercase font-black">Por Cobrar VIP</span>
                <p className="text-xl font-black text-rose-300">${vipCombinedTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>

          {/* Tabla de Clientes VIP con filas delgadas y limpias */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-3 sm:p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Crown className="w-4 h-4 text-purple-700" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Listado de Clientes VIP ({vipCombinedCount})
                </h2>
              </div>
              <span className="text-xs font-black text-purple-900">
                Cobrado: <strong className="text-emerald-700">${vipCombinedTotalCollected.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> | Saldo Pendiente: <strong className="text-rose-600">${vipCombinedTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Folio</th>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Cliente VIP</th>
                    <th className="py-2.5 px-3">Tipo de Pan</th>
                    <th className="py-2.5 px-3 text-center">Transferencia / Foto</th>
                    <th className="py-2.5 px-3 text-center">Factura</th>
                    <th className="py-2.5 px-3 text-right">Monto</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                    <th className="py-2.5 px-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {/* 1. Pedidos VIP dedicados */}
                  {dateMatchedVipOrders.map((vo) => {
                    const isPaid = vo.paymentStatus === 'pagado' || Boolean(vo.isAudited);
                    const pending = isPaid ? 0 : vo.totalAmount;

                    return (
                      <tr key={vo.id} className="hover:bg-purple-50/40 transition-colors">
                        <td className="py-2 px-3 font-mono font-black text-purple-900 text-xs">
                          {vo.folio}
                        </td>
                        <td className="py-2 px-3 text-slate-700 font-semibold whitespace-nowrap">
                          {vo.date}
                        </td>
                        <td className="py-2 px-3">
                          <strong className="text-slate-900 font-bold block">{vo.customerName}</strong>
                          {vo.customerPhone && (
                            <span className="text-[10px] text-purple-700 font-mono">📞 {vo.customerPhone}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="bg-amber-100 text-amber-950 font-bold px-2 py-0.5 rounded text-[11px]">
                            {vo.breadType || 'Pan surtido'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {vo.transferReceiptUrl ? (
                            <button
                              type="button"
                              onClick={() => setPreviewReceiptImage(vo.transferReceiptUrl || null)}
                              className="inline-flex items-center gap-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-300 cursor-pointer shadow-2xs"
                              title="Ver foto de la transferencia"
                            >
                              <ImageIcon className="w-3 h-3 text-emerald-700" />
                              <span>✓ Foto OK</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-900 font-black px-2 py-0.5 rounded text-[10px] border border-amber-300">
                              ⚠️ Sin Foto
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {!vo.requiresInvoice ? (
                            <span className="text-slate-400 text-[10px] italic">No requiere</span>
                          ) : vo.invoiceFolio || vo.invoiceFileUrl ? (
                            <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 font-black px-2 py-0.5 rounded text-[10px] border border-blue-300">
                              <FileCheck className="w-3 h-3 text-blue-700" />
                              <span>{vo.invoiceFolio || '✓ Facturada'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 bg-rose-100 text-rose-900 font-black px-2 py-0.5 rounded text-[10px] border border-rose-300 animate-pulse">
                              ⚠️ Falta Factura
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-black text-slate-900 text-xs">
                          ${vo.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {vo.isAudited ? (
                            <span className="bg-emerald-100 text-emerald-900 font-black px-2 py-0.5 rounded text-[10px] border border-emerald-300">
                              ✓ Cotejado
                            </span>
                          ) : isPaid ? (
                            <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                              ✓ Pagado
                            </span>
                          ) : (
                            <span className="bg-amber-100 text-amber-950 font-black px-2 py-0.5 rounded text-[10px] border border-amber-300">
                              ⏳ Por Cobrar
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {pending > 0 ? (
                            <span className="font-black text-rose-700 text-xs">
                              ${pending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-bold text-xs">$0.00</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* 2. Pedidos tienda regulares / legacy */}
                  {filteredStoreOrders.map((order, idx) => {
                    const pieces = order.items.reduce((s, it) => s + it.quantity, 0);
                    const pending = order.pendingAmount > 0 
                      ? order.pendingAmount 
                      : (order.paymentStatus !== 'pagado' ? Math.max(0, order.total - (order.deposit || 0) - (order.collectedAmount || 0)) : 0);

                    return (
                      <tr key={`${order.id || order.folio}_${idx}`} className="hover:bg-purple-50/30 transition-colors">
                        <td className="py-2 px-3 font-mono font-black text-purple-900 text-xs">
                          {order.folio}
                        </td>
                        <td className="py-2 px-3 text-slate-700 font-semibold whitespace-nowrap">
                          {order.deliveryDate}
                        </td>
                        <td className="py-2 px-3">
                          <strong className="text-slate-900 font-bold block">{order.customerName}</strong>
                          {order.customerPhone && (
                            <span className="text-[10px] text-purple-700 font-mono">📞 {order.customerPhone}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="bg-purple-100 text-purple-950 font-black px-2 py-0.5 rounded text-[11px]">
                            {pieces} pzs
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center text-slate-400 text-[10px]">
                          Efectivo mostrador
                        </td>
                        <td className="py-2 px-3 text-center text-slate-400 text-[10px]">
                          Ticket simple
                        </td>
                        <td className="py-2 px-3 text-right font-black text-slate-900 text-xs">
                          ${order.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {order.paymentStatus === 'pagado' ? (
                            <span className="bg-emerald-100 text-emerald-900 font-black px-2 py-0.5 rounded text-[10px] border border-emerald-300">
                              ✓ Pagado
                            </span>
                          ) : (
                            <span className="bg-amber-100 text-amber-950 font-black px-2 py-0.5 rounded text-[10px] border border-amber-300">
                              ⏳ Por Cobrar
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {pending > 0 ? (
                            <span className="font-black text-rose-700 text-xs">
                              ${pending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-bold text-xs">$0.00</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {dateMatchedVipOrders.length === 0 && filteredStoreOrders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400 font-bold">
                        No se encontraron pedidos de Clientes VIP para el período seleccionado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODULE 4: MONTOS POR COBRAR (CUENTAS POR COBRAR: REPARTO Y CLIENTES VIP)
          ========================================================================= */}
      {activeModule === 'por_cobrar' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Header de Cuentas por Cobrar */}
          <div className="bg-gradient-to-br from-rose-700 via-rose-800 to-slate-900 text-white rounded-3xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-2xl font-black">
                ⏳
              </div>
              <div>
                <h3 className="font-black text-lg text-white">Montos por Cobrar (Corte Reparto 1:00 PM y Clientes VIP)</h3>
                <p className="text-xs text-rose-200 font-medium">
                  Liquidación de repartidores a la 1:00 PM (<strong className="text-white">Ayer Tarde + Hoy Mañana</strong>) y clientes VIP frecuentes
                </p>
              </div>
            </div>

            <div className="bg-white/15 backdrop-blur-xs px-4 py-2.5 rounded-2xl text-right border border-white/20">
              <span className="text-[10px] uppercase font-black text-rose-200 tracking-wider block">Total Deuda Pendiente</span>
              <div className="text-2xl font-black text-white tracking-tight">
                ${totalGlobalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-rose-200 font-bold">
                Reparto 1 PM: ${deliveryTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • Clientes VIP: ${vipCombinedTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* PANEL EJECUTIVO: CORTE DE REPARTIDORES 1:00 PM (Simón y Osvaldo) */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border-2 border-blue-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛵</span>
                <div>
                  <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider">
                    Corte Diario de Repartidores a la 1:00 PM
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Entregas a liquidar: <strong className="text-slate-800">Ayer en la Tarde ({cutPriorDate})</strong> y <strong className="text-slate-800">Hoy en la Mañana ({cutTargetDate})</strong>
                  </p>
                </div>
              </div>
              <div className="text-xs font-black px-3 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl">
                Saldo Pendiente Total Reparto: <strong className="text-blue-700">${deliveryTotalPending}.00</strong>
              </div>
            </div>

            {/* Dos Columnas: Simón vs Osvaldo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tarjeta Chofer: SIMÓN */}
              <div className={`p-4 rounded-2xl border-2 transition-all ${
                simonIsLiquidated 
                  ? 'bg-emerald-50/70 border-emerald-300' 
                  : simonCutPending > 0
                  ? 'bg-blue-50/60 border-blue-400 shadow-xs'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                      S
                    </div>
                    <div>
                      <h5 className="font-black text-slate-900 text-sm">Simón (Chofer Reparto)</h5>
                      <span className="text-[10px] text-slate-500 font-bold">
                        {simonCutTickets.length} entregas totales ({simonCutPieces} piezas)
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Por Cobrar</span>
                    <span className={`text-lg font-black ${simonCutPending > 0 ? 'text-blue-900' : 'text-emerald-700'}`}>
                      ${simonCutPending}.00
                    </span>
                  </div>
                </div>

                {/* Desglose Turnos Simón: Ayer Tarde vs Hoy Mañana */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/80 text-xs">
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-black text-amber-800 block">🌇 Ayer Tarde ({cutPriorDate.slice(5)})</span>
                    <div className="font-black text-slate-900 mt-0.5">${simonAyerTardeTotal}.00</div>
                    <span className="text-[10px] text-slate-500">{simonAyerTardePieces} pzs • {simonAyerTardeTickets.length} rutas</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-black text-sky-800 block">🌅 Hoy Mañana ({cutTargetDate.slice(5)})</span>
                    <div className="font-black text-slate-900 mt-0.5">${simonHoyMananaTotal}.00</div>
                    <span className="text-[10px] text-slate-500">{simonHoyMananaPieces} pzs • {simonHoyMananaTickets.length} rutas</span>
                  </div>
                </div>

                {/* Acciones de Liquidación para Simón */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between">
                  {simonIsLiquidated ? (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>✅ Liquidado en Caja a la 1:00 PM (${simonCutTotal}.00)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUndoDriverCutLiquidation('simon')}
                        className="text-[11px] font-bold text-slate-500 hover:text-rose-700 underline cursor-pointer"
                      >
                        Revertir
                      </button>
                    </div>
                  ) : simonCutPending > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleLiquidateDriverCut('simon')}
                      className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black py-2 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs border border-blue-500"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Registrar Liquidación Simón en Caja (${simonCutPending}.00)</span>
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-slate-500">Sin adeudos pendientes para este corte</span>
                  )}
                </div>
              </div>

              {/* Tarjeta Chofer: OSVALDO */}
              <div className={`p-4 rounded-2xl border-2 transition-all ${
                osvaldoIsLiquidated 
                  ? 'bg-emerald-50/70 border-emerald-300' 
                  : osvaldoCutPending > 0
                  ? 'bg-blue-50/60 border-blue-400 shadow-xs'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-cyan-700 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                      O
                    </div>
                    <div>
                      <h5 className="font-black text-slate-900 text-sm">Osvaldo (Chofer Reparto)</h5>
                      <span className="text-[10px] text-slate-500 font-bold">
                        {osvaldoCutTickets.length} entregas totales ({osvaldoCutPieces} piezas)
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Por Cobrar</span>
                    <span className={`text-lg font-black ${osvaldoCutPending > 0 ? 'text-blue-900' : 'text-emerald-700'}`}>
                      ${osvaldoCutPending}.00
                    </span>
                  </div>
                </div>

                {/* Desglose Turnos Osvaldo: Ayer Tarde vs Hoy Mañana */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/80 text-xs">
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-black text-amber-800 block">🌇 Ayer Tarde ({cutPriorDate.slice(5)})</span>
                    <div className="font-black text-slate-900 mt-0.5">${osvaldoAyerTardeTotal}.00</div>
                    <span className="text-[10px] text-slate-500">{osvaldoAyerTardePieces} pzs • {osvaldoAyerTardeTickets.length} rutas</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-black text-sky-800 block">🌅 Hoy Mañana ({cutTargetDate.slice(5)})</span>
                    <div className="font-black text-slate-900 mt-0.5">${osvaldoHoyMananaTotal}.00</div>
                    <span className="text-[10px] text-slate-500">{osvaldoHoyMananaPieces} pzs • {osvaldoHoyMananaTickets.length} rutas</span>
                  </div>
                </div>

                {/* Acciones de Liquidación para Osvaldo */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between">
                  {osvaldoIsLiquidated ? (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>✅ Liquidado en Caja a la 1:00 PM (${osvaldoCutTotal}.00)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUndoDriverCutLiquidation('osvaldo')}
                        className="text-[11px] font-bold text-slate-500 hover:text-rose-700 underline cursor-pointer"
                      >
                        Revertir
                      </button>
                    </div>
                  ) : osvaldoCutPending > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleLiquidateDriverCut('osvaldo')}
                      className="w-full bg-cyan-700 hover:bg-cyan-800 active:scale-95 text-white font-black py-2 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs border border-cyan-600"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Registrar Liquidación Osvaldo en Caja (${osvaldoCutPending}.00)</span>
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-slate-500">Sin adeudos pendientes para este corte</span>
                  )}
                </div>
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
                  Todos los Pendientes ({filteredReceivables.length})
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
                  <Crown className="w-3.5 h-3.5" />
                  <span>Solo Clientes VIP (${vipCombinedTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
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
                  Listado de Cuentas por Cobrar ({filteredReceivables.length})
                </h2>
              </div>
              <span className="text-xs font-black text-rose-800">
                Total por Cobrar: ${filteredReceivables.reduce((acc, o) => acc + o.pendingAmount, 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    <th className="py-3 px-3">Fecha y Turno</th>
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
                          <span className="text-xs text-slate-400">Todos los repartos de Hoy Mañana y Ayer Tarde y pedidos de Clientes VIP están cubiertos o liquidados.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredReceivables.map((item, idx) => {
                      const isDel = item.type === 'reparto';

                      return (
                        <tr key={`${item.id || item.folio}_${idx}`} className="hover:bg-rose-50/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-black text-rose-900">
                            {item.folio}
                          </td>
                          <td className="py-3 px-3">
                            {isDel ? (
                              <span className="bg-blue-100 text-blue-900 font-black px-2 py-0.5 rounded-full text-[10px] border border-blue-300 flex items-center gap-1 w-max">
                                <Truck className="w-3 h-3" /> {item.periodLabel}
                              </span>
                            ) : (
                              <span className="bg-purple-100 text-purple-900 font-black px-2 py-0.5 rounded-full text-[10px] border border-purple-300 flex items-center gap-1 w-max">
                                <Crown className="w-3 h-3" /> Clientes VIP
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <strong className="text-slate-900 block font-bold text-xs">{item.customerName}</strong>
                            {item.customerPhone && (
                              <span className="text-[10px] text-slate-500 font-mono block">📞 {item.customerPhone}</span>
                            )}
                            {item.address && (
                              <span className="text-[10px] text-slate-400 truncate block max-w-[180px]">📍 {item.address}</span>
                            )}
                            {item.itemsSummary && (
                              <span className="text-[10px] text-slate-500 truncate block max-w-[200px]">🍞 {item.itemsSummary}</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-800 text-xs">
                              {item.assignedTo}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 text-[11px]">
                            {item.date}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-slate-900">
                            ${item.total}.00
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-700 font-bold">
                            ${item.deposit || 0}.00
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-black text-sm text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                              ${item.pendingAmount}.00
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {item.orderRef ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettleModal(item.orderRef!)}
                                  className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black px-3 py-1.5 rounded-xl text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border border-emerald-500"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>Cobrar / Liquidar</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleLiquidateSingleCutTicket(item.id, item.pendingAmount, item.customerName)}
                                  className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black px-3 py-1.5 rounded-xl text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border border-emerald-500"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>Cobrar / Liquidar</span>
                                </button>
                              )}

                              {item.orderRef && (
                                <button
                                  type="button"
                                  onClick={() => setOrderToView(item.orderRef!)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black p-1.5 rounded-xl text-xs transition-colors cursor-pointer border border-slate-200"
                                  title="Ver Ticket"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
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
                  name="admin_delete_pin"
                  value={adminPinInput}
                  onChange={(e) => {
                    setAdminPinInput(e.target.value);
                    if (pinError) setPinError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmDelete();
                  }}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
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

      {/* 6. MODAL VISOR Y REIMPRESIÓN DE TICKETS DE REPARTO POR DÍA (OSVALDO Y SIMÓN) */}
      <DriverDailyTicketsModal
        isOpen={driverTicketsModalOpen}
        onClose={() => setDriverTicketsModalOpen(false)}
        settings={settings}
        driverCustomers={driverCustomers}
        orders={orders}
        initialDate={selectedDate || todayStr}
      />

      {/* 7. MODAL VISOR DE FOTO DE COMPROBANTE DE TRANSFERENCIA */}
      {previewReceiptImage && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in"
          onClick={() => setPreviewReceiptImage(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-xl w-full p-4 shadow-2xl border-2 border-purple-300 relative space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-black text-sm text-slate-800 flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-purple-700" />
                <span>Comprobante de Transferencia Bancaria</span>
              </span>
              <button
                type="button"
                onClick={() => setPreviewReceiptImage(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-2xl bg-slate-900 flex items-center justify-center p-2">
              <img
                src={previewReceiptImage}
                alt="Comprobante de transferencia"
                className="max-h-[70vh] w-auto object-contain rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
