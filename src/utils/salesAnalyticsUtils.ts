import { SaleTicket, BakeryOrder, CashOutflowItem, DriverCustomer } from '../types';
import { loadOutflows, getDailyDeliverySheet, loadDriverCustomers, formatLocalDate, getTodayString, getNormalizedDriverCustomerItems } from './storage';

export interface AnalyticsBranchOptions {
  includeRepartos?: boolean;
  includeStoreOrders?: boolean;
}

export const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const DAY_NAMES_ES = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

export const SHORT_DAY_NAMES_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export interface DayMetricItem {
  date: string; // YYYY-MM-DD
  dayName: string; // Lunes, Martes...
  dayShort: string; // Lun, Mar...
  dayNumber: number; // 1-31
  mostradorSales: number;
  cashSales: number;
  cardSales: number;
  orderSales: number;
  totalSales: number;
  outflows: number;
  netProfit: number;
  piecesCount: number;
  ticketsCount: number;
  isBestDay?: boolean;
}

export interface WeeklySalesMetrics {
  weekLabel: string; // "Semana del 12 al 18 Octubre"
  startDate: string; // YYYY-MM-DD (Lunes)
  endDate: string; // YYYY-MM-DD (Domingo)
  days: DayMetricItem[];
  totalSales: number;
  totalCash: number;
  totalCard: number;
  totalOutflows: number;
  netProfit: number;
  profitMargin: number;
  averageDailySales: number;
  totalPieces: number;
  totalTickets: number;
  bestDay: { dayName: string; sales: number } | null;
}

export interface MonthWeekItem {
  weekNumber: number;
  weekLabel: string; // "Semana 1 (1 - 7 Oct)"
  startDate: string;
  endDate: string;
  totalSales: number;
  totalOutflows: number;
  netProfit: number;
  totalPieces: number;
  ticketsCount: number;
}

export interface MonthFinancialSummary {
  year: number;
  monthIndex: number; // 0-11
  monthName: string; // "Octubre"
  monthKey: string; // "2026-10"
  totalSales: number;
  cashSales: number;
  cardSales: number;
  mostradorSales: number;
  ordersSales: number;
  totalOutflows: number;
  netProfit: number;
  profitMargin: number;
  totalPieces: number;
  ticketsCount: number;
  averageTicket: number;
  bestDay: { date: string; dayName: string; amount: number } | null;
  weeks: MonthWeekItem[];
  days: DayMetricItem[];
}

export interface YearFinancialSummary {
  year: number;
  totalSales: number;
  totalOutflows: number;
  netProfit: number;
  averageMargin: number;
  totalPieces: number;
  totalTickets: number;
  bestMonth: { name: string; profit: number; sales: number } | null;
  months: {
    monthIndex: number;
    monthName: string;
    totalSales: number;
    cashSales: number;
    cardSales: number;
    totalOutflows: number;
    netProfit: number;
    profitMargin: number;
    totalPieces: number;
    ticketsCount: number;
    isCurrentMonth: boolean;
  }[];
}

/**
 * Resuelve la fecha de un ticket en formato YYYY-MM-DD usando hora LOCAL
 */
export function extractTicketDate(ticket: SaleTicket): string {
  if (ticket.date && typeof ticket.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ticket.date.trim())) {
    return ticket.date.trim();
  }
  if (ticket.timestamp && typeof ticket.timestamp === 'string') {
    const parsed = new Date(ticket.timestamp);
    if (!isNaN(parsed.getTime())) {
      return formatLocalDate(parsed);
    }
    return ticket.timestamp.split('T')[0];
  }
  return getTodayString();
}

/**
 * Resuelve la fecha de un pedido en formato YYYY-MM-DD usando hora LOCAL
 */
export function extractOrderDate(order: BakeryOrder): string {
  if (order.deliveryDate && typeof order.deliveryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(order.deliveryDate.trim())) {
    return order.deliveryDate.trim();
  }
  if (order.createdAt && typeof order.createdAt === 'string') {
    const parsed = new Date(order.createdAt);
    if (!isNaN(parsed.getTime())) {
      return formatLocalDate(parsed);
    }
    return order.createdAt.split('T')[0];
  }
  return getTodayString();
}

/**
 * Obtiene el monto cobrado de un pedido
 */
export function getOrderCollectedAmount(order: BakeryOrder): number {
  if (order.paymentStatus === 'pagado') {
    return order.total;
  }
  const deposit = order.deposit || 0;
  const collected = order.collectedAmount || 0;
  return Math.min(order.total, deposit + collected);
}

/**
 * Obtiene el lunes de la semana que contiene a la fecha dada
 */
export function getMondayOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Formatea una fecha YYYY-MM-DD a string amigable
 */
export function formatFriendlyDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day, 12, 0, 0);
  const dayName = DAY_NAMES_ES[d.getDay()];
  const monthName = MONTH_NAMES_ES[month];
  return `${dayName}, ${day} de ${monthName} de ${year}`;
}

/**
 * Helper para verificar si un ticket pertenece al módulo de Reparto
 */
export function isDeliveryTicket(ticket: SaleTicket): boolean {
  return Boolean(
    ticket.isDelivery ||
    ticket.driverId === 'osvaldo' ||
    ticket.driverId === 'simon' ||
    (ticket.id && ticket.id.startsWith('rep_')) ||
    (ticket.cashier && ticket.cashier.toLowerCase().includes('reparto'))
  );
}

/**
 * Helper para verificar si un pedido pertenece a Reparto
 */
export function isDeliveryOrder(order: BakeryOrder): boolean {
  return (
    order.deliveryType === 'domicilio' ||
    order.deliveryType === 'reparto' ||
    order.orderChannel === 'reparto' ||
    order.assignedDriverId === 'osvaldo' ||
    order.assignedDriverId === 'simon'
  );
}

export interface DailyRepartoDetails {
  date: string;
  totalAmount: number;
  totalPieces: number;
  simonTotal: number;
  simonPieces: number;
  simonMananaMoney: number;
  simonMananaPieces: number;
  simonTardeMoney: number;
  simonTardePieces: number;
  osvaldoTotal: number;
  osvaldoPieces: number;
  osvaldoMananaMoney: number;
  osvaldoMananaPieces: number;
  osvaldoTardeMoney: number;
  osvaldoTardePieces: number;
  routesCount: number;
}

interface NormalizedDriverClientEntry {
  client: DriverCustomer;
  isSimon: boolean;
  items: { breadName: string; unitPrice: number }[];
}

export interface AnalyticsDateIndex {
  ticketsByDate: Map<string, SaleTicket[]>;
  ordersByDate: Map<string, BakeryOrder[]>;
  outflowsByDate: Map<string, number>;
  driverClients: NormalizedDriverClientEntry[];
  driverIdByName: Map<string, string>;
  dailySheetsCache: Map<string, Record<string, Record<string, number>>>;
}

export function buildAnalyticsDateIndex(
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  outflows?: CashOutflowItem[]
): AnalyticsDateIndex {
  const allOutflows = outflows || loadOutflows();
  const ticketsByDate = new Map<string, SaleTicket[]>();
  const ordersByDate = new Map<string, BakeryOrder[]>();
  const outflowsByDate = new Map<string, number>();

  for (const t of tickets) {
    const d = extractTicketDate(t);
    let bucket = ticketsByDate.get(d);
    if (!bucket) {
      bucket = [];
      ticketsByDate.set(d, bucket);
    }
    bucket.push(t);
  }

  for (const o of orders) {
    const d = extractOrderDate(o);
    let bucket = ordersByDate.get(d);
    if (!bucket) {
      bucket = [];
      ordersByDate.set(d, bucket);
    }
    bucket.push(o);
  }

  for (const out of allOutflows) {
    const oDate = out.date || (out.createdAt ? formatLocalDate(new Date(out.createdAt)) : '');
    if (!oDate) continue;
    outflowsByDate.set(oDate, (outflowsByDate.get(oDate) || 0) + (out.amount || 0));
  }

  const rawDriverCustomers = loadDriverCustomers();
  const driverClients: NormalizedDriverClientEntry[] = [];
  const driverIdByName = new Map<string, string>();
  for (const client of rawDriverCustomers) {
    if (client.name) driverIdByName.set(client.name, client.id);
    if (client.driverId === 'simon' || client.driverId === 'osvaldo') {
      driverClients.push({
        client,
        isSimon: client.driverId === 'simon',
        items: getNormalizedDriverCustomerItems(client)
      });
    }
  }

  const dailySheetsCache = new Map<string, Record<string, Record<string, number>>>();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const prefix = 'santafe_daily_delivery_';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        // Parse key formatted as santafe_daily_delivery_YYYY-MM-DD_shift
        const suffix = key.slice(prefix.length);
        const lastUnderscore = suffix.lastIndexOf('_');
        if (lastUnderscore <= 0) continue;
        const dStr = suffix.slice(0, lastUnderscore);
        const shift = suffix.slice(lastUnderscore + 1) as 'madrugada' | 'manana' | 'tarde';
        if (shift === 'madrugada' || shift === 'manana' || shift === 'tarde') {
          dailySheetsCache.set(`${dStr}_${shift}`, getDailyDeliverySheet(dStr, shift));
        }
      }
    } catch {}
  }

  return {
    ticketsByDate,
    ordersByDate,
    outflowsByDate,
    driverClients,
    driverIdByName,
    dailySheetsCache
  };
}

function getCachedSheet(
  index: AnalyticsDateIndex | undefined,
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde'
): Record<string, Record<string, number>> {
  if (index) {
    return index.dailySheetsCache.get(`${dateStr}_${shift}`) || {};
  }
  return getDailyDeliverySheet(dateStr, shift);
}

/**
 * Obtiene los números reales y exactos del módulo de Reparto para una fecha dada:
 * Combina hojas de reparto diarias (madrugada, mañana y tarde), tickets de reparto y pedidos asignados
 */
export function calculateDailyRepartoDetails(
  dateStr: string,
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  index?: AnalyticsDateIndex
): DailyRepartoDetails {
  const targetDate = dateStr.trim();
  const madrugadaSheet = getCachedSheet(index, targetDate, 'madrugada');
  const mananaSheet = getCachedSheet(index, targetDate, 'manana');
  const tardeSheet = getCachedSheet(index, targetDate, 'tarde');

  const dayTickets = index
    ? (index.ticketsByDate.get(targetDate) || [])
    : tickets.filter(t => extractTicketDate(t) === targetDate);
  const dayOrders = index
    ? (index.ordersByDate.get(targetDate) || [])
    : orders.filter(o => extractOrderDate(o) === targetDate);

  const driverClients: NormalizedDriverClientEntry[] = index
    ? index.driverClients
    : loadDriverCustomers()
        .filter(c => c.driverId === 'simon' || c.driverId === 'osvaldo')
        .map(client => ({
          client,
          isSimon: client.driverId === 'simon',
          items: getNormalizedDriverCustomerItems(client)
        }));

  const driverIdByName = index
    ? index.driverIdByName
    : new Map(loadDriverCustomers().map(c => [c.name, c.id]));

  const hasMadrugada = Object.keys(madrugadaSheet).length > 0;
  const hasManana = Object.keys(mananaSheet).length > 0;
  const hasTarde = Object.keys(tardeSheet).length > 0;
  const dayDeliveryTickets = dayTickets.filter(isDeliveryTicket);

  let simonMadrugadaMoney = 0;
  let simonMadrugadaPieces = 0;
  let simonMananaMoney = 0;
  let simonMananaPieces = 0;
  let simonTardeMoney = 0;
  let simonTardePieces = 0;

  let osvaldoMadrugadaMoney = 0;
  let osvaldoMadrugadaPieces = 0;
  let osvaldoMananaMoney = 0;
  let osvaldoMananaPieces = 0;
  let osvaldoTardeMoney = 0;
  let osvaldoTardePieces = 0;

  let routesCount = 0;
  const processedClientShift = new Set<string>();

  if (hasMadrugada || hasManana || hasTarde || dayDeliveryTickets.length > 0) {
    // 1. Calcular a partir de las hojas de reparto de los clientes de Simón y Osvaldo
    for (const { client, isSimon, items } of driverClients) {
      // Turno Madrugada
      if (hasMadrugada || dayDeliveryTickets.length > 0) {
        const madQ = madrugadaSheet[client.id] || {};
        let madPieces = 0;
        let madTotal = 0;
        for (const it of items) {
          const q = madQ[it.breadName] || 0;
          if (q > 0) {
            madPieces += q;
            madTotal += q * it.unitPrice;
          }
        }
        const matchedMad = dayDeliveryTickets.find(
          t => t.id === `rep_${targetDate}_madrugada_${client.id}` ||
               (t.customerName === client.name && t.deliveryShift === 'madrugada')
        );
        if (madPieces > 0 || matchedMad) {
          routesCount++;
          processedClientShift.add(`${client.id}_madrugada`);
          const finalTotal = matchedMad ? matchedMad.total : madTotal;
          const finalPieces = matchedMad ? matchedMad.items.reduce((s, it) => s + it.quantity, 0) : madPieces;
          if (isSimon) {
            simonMadrugadaMoney += finalTotal;
            simonMadrugadaPieces += finalPieces;
          } else {
            osvaldoMadrugadaMoney += finalTotal;
            osvaldoMadrugadaPieces += finalPieces;
          }
        }
      }

      // Turno Mañana
      if (hasManana || dayDeliveryTickets.length > 0) {
        const mQ = mananaSheet[client.id] || {};
        let mPieces = 0;
        let mTotal = 0;
        for (const it of items) {
          const q = mQ[it.breadName] || 0;
          if (q > 0) {
            mPieces += q;
            mTotal += q * it.unitPrice;
          }
        }
        const matchedM = dayDeliveryTickets.find(
          t => t.id === `rep_${targetDate}_manana_${client.id}` ||
               (t.customerName === client.name && t.deliveryShift === 'manana')
        );
        if (mPieces > 0 || matchedM) {
          routesCount++;
          processedClientShift.add(`${client.id}_manana`);
          const finalTotal = matchedM ? matchedM.total : mTotal;
          const finalPieces = matchedM ? matchedM.items.reduce((s, it) => s + it.quantity, 0) : mPieces;
          if (isSimon) {
            simonMananaMoney += finalTotal;
            simonMananaPieces += finalPieces;
          } else {
            osvaldoMananaMoney += finalTotal;
            osvaldoMananaPieces += finalPieces;
          }
        }
      }

      // Turno Tarde
      if (hasTarde || dayDeliveryTickets.length > 0) {
        const tQ = tardeSheet[client.id] || {};
        let tPieces = 0;
        let tTotal = 0;
        for (const it of items) {
          const q = tQ[it.breadName] || 0;
          if (q > 0) {
            tPieces += q;
            tTotal += q * it.unitPrice;
          }
        }
        const matchedT = dayDeliveryTickets.find(
          t => t.id === `rep_${targetDate}_tarde_${client.id}` ||
               (t.customerName === client.name && t.deliveryShift === 'tarde')
        );
        if (tPieces > 0 || matchedT) {
          routesCount++;
          processedClientShift.add(`${client.id}_tarde`);
          const finalTotal = matchedT ? matchedT.total : tTotal;
          const finalPieces = matchedT ? matchedT.items.reduce((s, it) => s + it.quantity, 0) : tPieces;
          if (isSimon) {
            simonTardeMoney += finalTotal;
            simonTardePieces += finalPieces;
          } else {
            osvaldoTardeMoney += finalTotal;
            osvaldoTardePieces += finalPieces;
          }
        }
      }
    }

    // 2. Sumar tickets de reparto del día que no hayan sido contabilizados por la hoja
    for (const t of dayDeliveryTickets) {
      const isSimon = t.driverId === 'simon' || Boolean(t.cashier && t.cashier.toLowerCase().includes('simon'));
      const isOsvaldo = t.driverId === 'osvaldo' || Boolean(t.cashier && t.cashier.toLowerCase().includes('osvaldo'));
      const shift = t.deliveryShift || (t.shift === 'turno1' ? 'manana' : 'tarde');
      const matchedClientId = t.customerName ? driverIdByName.get(t.customerName) : undefined;
      if (matchedClientId && processedClientShift.has(`${matchedClientId}_${shift}`)) {
        continue;
      }

      routesCount++;
      const pieces = t.items.reduce((sum, it) => sum + it.quantity, 0);
      if (isSimon) {
        if (shift === 'tarde') {
          simonTardeMoney += t.total;
          simonTardePieces += pieces;
        } else if (shift === 'madrugada') {
          simonMadrugadaMoney += t.total;
          simonMadrugadaPieces += pieces;
        } else {
          simonMananaMoney += t.total;
          simonMananaPieces += pieces;
        }
      } else if (isOsvaldo) {
        if (shift === 'tarde') {
          osvaldoTardeMoney += t.total;
          osvaldoTardePieces += pieces;
        } else if (shift === 'madrugada') {
          osvaldoMadrugadaMoney += t.total;
          osvaldoMadrugadaPieces += pieces;
        } else {
          osvaldoMananaMoney += t.total;
          osvaldoMananaPieces += pieces;
        }
      }
    }
  }

  // 3. Sumar pedidos de reparto de BakeryOrder del día
  for (const o of dayOrders) {
    if (!isDeliveryOrder(o)) continue;
    routesCount++;
    const amount = getOrderCollectedAmount(o);
    const pieces = o.items.reduce((sum, it) => sum + it.quantity, 0);
    if (o.assignedDriverId === 'simon') {
      simonMananaMoney += amount;
      simonMananaPieces += pieces;
    } else {
      osvaldoMananaMoney += amount;
      osvaldoMananaPieces += pieces;
    }
  }

  const simonTotal = simonMadrugadaMoney + simonMananaMoney + simonTardeMoney;
  const simonPieces = simonMadrugadaPieces + simonMananaPieces + simonTardePieces;
  const osvaldoTotal = osvaldoMadrugadaMoney + osvaldoMananaMoney + osvaldoTardeMoney;
  const osvaldoPieces = osvaldoMadrugadaPieces + osvaldoMananaPieces + osvaldoTardePieces;

  return {
    date: targetDate,
    totalAmount: simonTotal + osvaldoTotal,
    totalPieces: simonPieces + osvaldoPieces,
    simonTotal,
    simonPieces,
    simonMananaMoney,
    simonMananaPieces,
    simonTardeMoney,
    simonTardePieces,
    osvaldoTotal,
    osvaldoPieces,
    osvaldoMananaMoney,
    osvaldoMananaPieces,
    osvaldoTardeMoney,
    osvaldoTardePieces,
    routesCount
  };
}

/**
 * Calcula las métricas de un día específico con estricta separación de Mostrador y Reparto
 */
export function calculateDailyMetrics(
  dateStr: string,
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  outflows?: CashOutflowItem[],
  options: AnalyticsBranchOptions = {},
  index?: AnalyticsDateIndex
): DayMetricItem {
  const { includeRepartos = true, includeStoreOrders = true } = options;
  const targetDate = dateStr.trim();

  // 1. MOSTRADOR: Solo tickets que NO son de reparto
  const dayTickets = index
    ? (index.ticketsByDate.get(targetDate) || [])
    : tickets.filter(t => extractTicketDate(t) === targetDate);
  const mostradorTickets = dayTickets.filter(t => !isDeliveryTicket(t));

  let mostradorSales = 0;
  let cashSales = 0;
  let cardSales = 0;
  let mostradorPieces = 0;
  for (const t of mostradorTickets) {
    mostradorSales += t.total;
    if (t.paymentMethod === 'efectivo') cashSales += t.total;
    else if (t.paymentMethod === 'tarjeta') cardSales += t.total;
    for (const it of t.items) mostradorPieces += it.quantity;
  }

  // 2. REPARTO: Números reales de Simón y Osvaldo (solo en El Refugio)
  const repartoDetails = includeRepartos
    ? calculateDailyRepartoDetails(targetDate, tickets, orders, index)
    : { totalAmount: 0, totalPieces: 0, routesCount: 0 };
  const orderSales = repartoDetails.totalAmount;
  const orderPieces = repartoDetails.totalPieces;

  // 3. PIDE Y RECOGE EN TIENDA / VIP (solo cuando aplica)
  let storePickupSales = 0;
  let storePickupPieces = 0;
  let storePickupCount = 0;
  if (includeStoreOrders) {
    const dayOrders = index
      ? (index.ordersByDate.get(targetDate) || [])
      : orders.filter(o => extractOrderDate(o) === targetDate);
    for (const o of dayOrders) {
      if (isDeliveryOrder(o)) continue;
      storePickupCount++;
      storePickupSales += getOrderCollectedAmount(o);
      for (const it of o.items) storePickupPieces += it.quantity;
    }
  }

  // Filtrar salidas/gastos del día
  let dayOutflows = 0;
  if (index) {
    dayOutflows = index.outflowsByDate.get(targetDate) || 0;
  } else {
    const allOutflows = outflows || loadOutflows();
    for (const o of allOutflows) {
      const oDate = o.date || (o.createdAt ? formatLocalDate(new Date(o.createdAt)) : '');
      if (oDate === targetDate) dayOutflows += o.amount;
    }
  }

  const totalSales = mostradorSales + orderSales + storePickupSales;
  const netProfit = totalSales - dayOutflows;

  const d = new Date(targetDate + 'T12:00:00');
  const dayName = DAY_NAMES_ES[d.getDay()] || 'Día';
  const dayShort = SHORT_DAY_NAMES_ES[d.getDay()] || '';
  const dayNumber = d.getDate();

  return {
    date: targetDate,
    dayName,
    dayShort,
    dayNumber,
    mostradorSales,
    cashSales,
    cardSales,
    orderSales,
    totalSales,
    outflows: dayOutflows,
    netProfit,
    piecesCount: mostradorPieces + orderPieces + storePickupPieces,
    ticketsCount: mostradorTickets.length + repartoDetails.routesCount + storePickupCount
  };
}

/**
 * Calcula las métricas para una semana completa (Lunes a Domingo)
 */
export function calculateWeeklyMetrics(
  mondayDate: Date,
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  outflows?: CashOutflowItem[],
  options: AnalyticsBranchOptions = {},
  precomputedIndex?: AnalyticsDateIndex
): WeeklySalesMetrics {
  const index = precomputedIndex || buildAnalyticsDateIndex(tickets, orders, outflows);
  const days: DayMetricItem[] = [];
  const current = new Date(mondayDate);
  current.setHours(12, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const dStr = formatLocalDate(current);
    days.push(calculateDailyMetrics(dStr, tickets, orders, outflows, options, index));
    current.setDate(current.getDate() + 1);
  }

  // Identificar el mejor día de venta
  let maxSales = -1;
  days.forEach(d => {
    if (d.totalSales > maxSales) {
      maxSales = d.totalSales;
    }
  });
  if (maxSales > 0) {
    days.forEach(d => {
      if (d.totalSales === maxSales) {
        d.isBestDay = true;
      }
    });
  }

  const startDateStr = days[0].date;
  const endDateStr = days[6].date;
  const startDayNum = parseInt(startDateStr.split('-')[2], 10);
  const endDayNum = parseInt(endDateStr.split('-')[2], 10);
  const endMonth = MONTH_NAMES_ES[parseInt(endDateStr.split('-')[1], 10) - 1];

  const totalSales = days.reduce((acc, d) => acc + d.totalSales, 0);
  const totalCash = days.reduce((acc, d) => acc + d.cashSales, 0);
  const totalCard = days.reduce((acc, d) => acc + d.cardSales, 0);
  const totalOutflows = days.reduce((acc, d) => acc + d.outflows, 0);
  const netProfit = totalSales - totalOutflows;
  const profitMargin = totalSales > 0 ? Math.round((netProfit / totalSales) * 100) : 0;
  const averageDailySales = Math.round(totalSales / 7);
  const totalPieces = days.reduce((acc, d) => acc + d.piecesCount, 0);
  const totalTickets = days.reduce((acc, d) => acc + d.ticketsCount, 0);

  const bestDayObj = days.find(d => d.isBestDay);

  return {
    weekLabel: `Semana del ${startDayNum} al ${endDayNum} de ${endMonth}`,
    startDate: startDateStr,
    endDate: endDateStr,
    days,
    totalSales,
    totalCash,
    totalCard,
    totalOutflows,
    netProfit,
    profitMargin,
    averageDailySales,
    totalPieces,
    totalTickets,
    bestDay: bestDayObj ? { dayName: bestDayObj.dayName, sales: bestDayObj.totalSales } : null
  };
}

/**
 * Calcula el resumen financiero para un mes específico (ej: Enero, Febrero...)
 */
export function calculateMonthlyFinancialSummary(
  year: number,
  monthIndex: number, // 0 - 11
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  outflows?: CashOutflowItem[],
  options: AnalyticsBranchOptions = {},
  precomputedIndex?: AnalyticsDateIndex
): MonthFinancialSummary {
  const index = precomputedIndex || buildAnalyticsDateIndex(tickets, orders, outflows);
  const monthName = MONTH_NAMES_ES[monthIndex];
  const monthStr = String(monthIndex + 1).padStart(2, '0');
  const monthKey = `${year}-${monthStr}`;

  // Días en este mes
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const days: DayMetricItem[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
    days.push(calculateDailyMetrics(dStr, tickets, orders, outflows, options, index));
  }

  // Mejor día del mes
  let maxDaySales = -1;
  let bestDayItem: { date: string; dayName: string; amount: number } | null = null;
  days.forEach(d => {
    if (d.totalSales > maxDaySales) {
      maxDaySales = d.totalSales;
      bestDayItem = { date: d.date, dayName: `${d.dayName} ${d.dayNumber}`, amount: d.totalSales };
    }
  });

  const totalSales = days.reduce((acc, d) => acc + d.totalSales, 0);
  const cashSales = days.reduce((acc, d) => acc + d.cashSales, 0);
  const cardSales = days.reduce((acc, d) => acc + d.cardSales, 0);
  const mostradorSales = days.reduce((acc, d) => acc + d.mostradorSales, 0);
  const ordersSales = days.reduce((acc, d) => acc + d.orderSales, 0);
  const totalOutflows = days.reduce((acc, d) => acc + d.outflows, 0);
  const netProfit = totalSales - totalOutflows;
  const profitMargin = totalSales > 0 ? Math.round((netProfit / totalSales) * 100) : 0;
  const totalPieces = days.reduce((acc, d) => acc + d.piecesCount, 0);
  const ticketsCount = days.reduce((acc, d) => acc + d.ticketsCount, 0);
  const averageTicket = ticketsCount > 0 ? Math.round(totalSales / ticketsCount) : 0;

  // Agrupar en semanas del mes (bloques de 7 días)
  const weeks: MonthWeekItem[] = [];
  const weekChunks = [
    { start: 1, end: Math.min(7, daysInMonth), num: 1 },
    { start: 8, end: Math.min(14, daysInMonth), num: 2 },
    { start: 15, end: Math.min(21, daysInMonth), num: 3 },
    { start: 22, end: Math.min(28, daysInMonth), num: 4 },
  ];
  if (daysInMonth > 28) {
    weekChunks.push({ start: 29, end: daysInMonth, num: 5 });
  }

  weekChunks.forEach(wc => {
    const chunkDays = days.slice(wc.start - 1, wc.end);
    const wSales = chunkDays.reduce((acc, d) => acc + d.totalSales, 0);
    const wOutflows = chunkDays.reduce((acc, d) => acc + d.outflows, 0);
    const wProfit = wSales - wOutflows;
    const wPieces = chunkDays.reduce((acc, d) => acc + d.piecesCount, 0);
    const wTickets = chunkDays.reduce((acc, d) => acc + d.ticketsCount, 0);

    weeks.push({
      weekNumber: wc.num,
      weekLabel: `Semana ${wc.num} (${wc.start} al ${wc.end} de ${monthName.slice(0, 3)})`,
      startDate: `${year}-${monthStr}-${String(wc.start).padStart(2, '0')}`,
      endDate: `${year}-${monthStr}-${String(wc.end).padStart(2, '0')}`,
      totalSales: wSales,
      totalOutflows: wOutflows,
      netProfit: wProfit,
      totalPieces: wPieces,
      ticketsCount: wTickets
    });
  });

  return {
    year,
    monthIndex,
    monthName,
    monthKey,
    totalSales,
    cashSales,
    cardSales,
    mostradorSales,
    ordersSales,
    totalOutflows,
    netProfit,
    profitMargin,
    totalPieces,
    ticketsCount,
    averageTicket,
    bestDay: bestDayItem,
    weeks,
    days
  };
}

/**
 * Calcula el resumen anual de los 12 meses (Enero a Diciembre) en una sola pasada O(N)
 */
export function calculateYearFinancialSummary(
  year: number,
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  outflows?: CashOutflowItem[],
  options: AnalyticsBranchOptions = {}
): YearFinancialSummary {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const index = buildAnalyticsDateIndex(tickets, orders, outflows);

  const monthsData = MONTH_NAMES_ES.map((name, idx) => {
    const summary = calculateMonthlyFinancialSummary(year, idx, tickets, orders, outflows, options, index);
    return {
      monthIndex: idx,
      monthName: name,
      totalSales: summary.totalSales,
      cashSales: summary.cashSales,
      cardSales: summary.cardSales,
      totalOutflows: summary.totalOutflows,
      netProfit: summary.netProfit,
      profitMargin: summary.profitMargin,
      totalPieces: summary.totalPieces,
      ticketsCount: summary.ticketsCount,
      isCurrentMonth: year === currentYear && idx === currentMonthIdx
    };
  });

  const totalSales = monthsData.reduce((acc, m) => acc + m.totalSales, 0);
  const totalOutflows = monthsData.reduce((acc, m) => acc + m.totalOutflows, 0);
  const netProfit = totalSales - totalOutflows;
  const averageMargin = totalSales > 0 ? Math.round((netProfit / totalSales) * 100) : 0;
  const totalPieces = monthsData.reduce((acc, m) => acc + m.totalPieces, 0);
  const totalTickets = monthsData.reduce((acc, m) => acc + m.ticketsCount, 0);

  let bestMonth: { name: string; profit: number; sales: number } | null = null;
  let maxProfit = -1;
  monthsData.forEach(m => {
    if (m.netProfit > maxProfit && m.totalSales > 0) {
      maxProfit = m.netProfit;
      bestMonth = { name: m.monthName, profit: m.netProfit, sales: m.totalSales };
    }
  });

  return {
    year,
    totalSales,
    totalOutflows,
    netProfit,
    averageMargin,
    totalPieces,
    totalTickets,
    bestMonth,
    months: monthsData
  };
}
