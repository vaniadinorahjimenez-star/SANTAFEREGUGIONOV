import { SaleTicket, BakeryOrder, CashOutflowItem } from '../types';
import { loadOutflows } from './storage';

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
 * Resuelve la fecha de un ticket en formato YYYY-MM-DD
 */
export function extractTicketDate(ticket: SaleTicket): string {
  if (ticket.date && typeof ticket.date === 'string' && ticket.date.trim()) {
    return ticket.date.trim();
  }
  if (ticket.timestamp && typeof ticket.timestamp === 'string') {
    return ticket.timestamp.split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Resuelve la fecha de un pedido en formato YYYY-MM-DD
 */
export function extractOrderDate(order: BakeryOrder): string {
  if (order.deliveryDate && typeof order.deliveryDate === 'string' && order.deliveryDate.trim()) {
    return order.deliveryDate.trim();
  }
  if (order.createdAt && typeof order.createdAt === 'string') {
    return order.createdAt.split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
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
 * Calcula las métricas de un día específico
 */
export function calculateDailyMetrics(
  dateStr: string,
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  outflows?: CashOutflowItem[]
): DayMetricItem {
  const targetDate = dateStr.trim();
  const allOutflows = outflows || loadOutflows();

  // Filtrar tickets del día
  const dayTickets = tickets.filter(t => extractTicketDate(t) === targetDate);
  const mostradorSales = dayTickets.reduce((acc, t) => acc + t.total, 0);
  const cashSales = dayTickets.filter(t => t.paymentMethod === 'efectivo').reduce((acc, t) => acc + t.total, 0);
  const cardSales = dayTickets.filter(t => t.paymentMethod === 'tarjeta').reduce((acc, t) => acc + t.total, 0);
  const ticketsPieces = dayTickets.reduce((acc, t) => acc + t.items.reduce((s, it) => s + it.quantity, 0), 0);

  // Filtrar pedidos del día
  const dayOrders = orders.filter(o => extractOrderDate(o) === targetDate);
  const orderSales = dayOrders.reduce((acc, o) => acc + getOrderCollectedAmount(o), 0);
  const orderPieces = dayOrders.reduce((acc, o) => acc + o.items.reduce((s, it) => s + it.quantity, 0), 0);

  // Filtrar salidas/gastos del día
  const dayOutflows = allOutflows
    .filter(o => {
      const oDate = o.date || (o.createdAt ? o.createdAt.split('T')[0] : '');
      return oDate === targetDate;
    })
    .reduce((acc, o) => acc + o.amount, 0);

  const totalSales = mostradorSales + orderSales;
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
    piecesCount: ticketsPieces + orderPieces,
    ticketsCount: dayTickets.length + dayOrders.length
  };
}

/**
 * Calcula las métricas para una semana completa (Lunes a Domingo)
 */
export function calculateWeeklyMetrics(
  mondayDate: Date,
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  outflows?: CashOutflowItem[]
): WeeklySalesMetrics {
  const days: DayMetricItem[] = [];
  const current = new Date(mondayDate);

  for (let i = 0; i < 7; i++) {
    const dStr = current.toISOString().split('T')[0];
    const metric = calculateDailyMetrics(dStr, tickets, orders, outflows);
    days.push(metric);
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
  outflows?: CashOutflowItem[]
): MonthFinancialSummary {
  const monthName = MONTH_NAMES_ES[monthIndex];
  const monthStr = String(monthIndex + 1).padStart(2, '0');
  const monthKey = `${year}-${monthStr}`;
  const allOutflows = outflows || loadOutflows();

  // Días en este mes
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const days: DayMetricItem[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
    const metric = calculateDailyMetrics(dStr, tickets, orders, allOutflows);
    days.push(metric);
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
 * Calcula el resumen anual de los 12 meses (Enero a Diciembre)
 */
export function calculateYearFinancialSummary(
  year: number,
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  outflows?: CashOutflowItem[]
): YearFinancialSummary {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const allOutflows = outflows || loadOutflows();

  const monthsData = MONTH_NAMES_ES.map((name, idx) => {
    const summary = calculateMonthlyFinancialSummary(year, idx, tickets, orders, allOutflows);
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
