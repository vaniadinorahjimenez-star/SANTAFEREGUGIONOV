import { BakeryOrder, BranchId, DriverCustomer, SaleTicket, TicketItem, VipOrder } from '../../types';
import {
  formatLocalDate,
  getDailyDeliverySheet,
  getNormalizedDriverCustomerItems,
  getTodayString,
  loadDriverCustomers,
  shiftLocalDate
} from '../../utils/storage';

export type SocioPortalType = 'roscas' | 'barra_fria' | 'reparto' | 'mostrador_panaderos';
export type SocioTimeframe = 'dia' | 'semana' | 'mes';
export type SocioBranchFilter = 'todas' | BranchId;
export type SocioDriverFilter = 'todos' | 'simon' | 'osvaldo';

export const ROSCA_COMMISSION_RATE = 0.05; // 5% de comisión sobre ventas de Roscas y Esferas
export const BARRA_FRIA_PASTEL_65_COMMISSION = 9.0; // $9.00 MXN por Pastel $65
export const BARRA_FRIA_PASTEL_35_COMMISSION = 5.0; // $5.00 MXN por Pastel $35
export const BARRA_FRIA_PERCENT_COMMISSION_RATE = 0.05; // 5% sobre venta para Galletas $65 y Dona Junior $15
export const BARRA_FRIA_COMMISSION_PER_UNIT = 9.0; // Referencia Pastel $65
export const REPARTO_COMMISSION_RATE = 0.05; // 5% de comisión sobre ventas de reparto
export const MOSTRADOR_PANADEROS_POOL_RATE = 0.01; // 1% del total de ventas diarias para Socios VIP (Mostrador y Panaderos)

export const SOCIO_START_DATE: Record<SocioPortalType, string> = {
  roscas: '2026-11-20',
  barra_fria: '2026-11-25',
  reparto: '2026-11-01',
  mostrador_panaderos: '2026-12-01'
};

export const SOCIO_START_DATE_LABEL: Record<SocioPortalType, string> = {
  roscas: '20 de noviembre 2026',
  barra_fria: '25 de noviembre 2026',
  reparto: '1 de noviembre 2026',
  mostrador_panaderos: '1 de diciembre 2026'
};

export const MOSTRADOR_PANADEROS_END_DATE = '2027-01-07';
export const MOSTRADOR_PANADEROS_END_DATE_LABEL = '7 de enero 2027';

export type BarraFriaItemKind = 'pastel_65' | 'pastel_35' | 'galletas_65' | 'dona_junior';

export interface BarraFriaCategorySummary {
  pieces: number;
  revenue: number;
  commission: number;
}

export interface BarraFriaBreakdown {
  pastel65: BarraFriaCategorySummary;
  pastel35: BarraFriaCategorySummary;
  galletas65: BarraFriaCategorySummary;
  donaJunior: BarraFriaCategorySummary;
}

export interface SocioMatchedLine {
  ticketId: string;
  folio: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  timestamp: string;
  branch: BranchId;
  productKey: string;
  productName: string;
  subCategory: 'rosca' | 'esfera' | 'postre';
  barraFriaKind?: BarraFriaItemKind;
  unitPrice: number;
  quantity: number;
  revenue: number;
  commission: number;
  sourceLabel?: string;
}

export interface SocioReportExtras {
  orders?: BakeryOrder[];
  driverCustomers?: DriverCustomer[];
  cloudDailyDeliveries?: SocioDailyDeliveryInput[];
}

export interface SimonRepartoRoscaEntry {
  id: string;
  date: string;
  time: string;
  timestamp: string;
  folio: string;
  clientName: string;
  shift: 'madrugada' | 'manana' | 'tarde';
  productKey: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  revenue: number;
  source: 'ticket' | 'hoja' | 'pedido';
}

export interface SocioBranchSummary {
  branch: BranchId;
  label: string;
  pieces: number;
  roscaPieces: number;
  esferaPieces: number;
  revenue: number;
  commission: number;
  ticketsCount: number;
}

export interface SocioProductBreakdown {
  productKey: string;
  name: string;
  subCategory: 'rosca' | 'esfera' | 'postre';
  unitPrice: number;
  pieces: number;
  refugioPieces: number;
  zakiaPieces: number;
  revenue: number;
  commission: number;
}

export interface SocioChartBucket {
  key: string;
  label: string;
  sublabel?: string;
  pieces: number;
  revenue: number;
  commission: number;
  refugioPieces: number;
  zakiaPieces: number;
  isCurrent?: boolean;
}

export interface SocioPeriodReport {
  portal: SocioPortalType;
  portalStartDate: string;
  portalStartDateLabel: string;
  isBeforeStartDate: boolean;
  timeframe: SocioTimeframe;
  branchFilter: SocioBranchFilter;
  startDate: string;
  endDate: string;
  periodTitle: string;
  periodSubtitle: string;
  totalPieces: number;
  roscaPieces: number;
  esferaPieces: number;
  roscaRevenue: number;
  esferaRevenue: number;
  roscaCommission: number;
  esferaCommission: number;
  barraFriaBreakdown: BarraFriaBreakdown;
  totalRevenue: number;
  totalCommission: number;
  ticketsCount: number;
  branches: {
    refugio: SocioBranchSummary;
    zakia: SocioBranchSummary;
  };
  allBranchesTotalPieces: number;
  allBranchesTotalRevenue: number;
  allBranchesTotalCommission: number;
  products: SocioProductBreakdown[];
  chartBuckets: SocioChartBucket[];
  peakBucket: SocioChartBucket | null;
  recentLines: SocioMatchedLine[];
}

function normalizeText(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function normalizePartnerPassword(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function verifyPartnerPassword(portal: SocioPortalType, input: string): boolean {
  const compact = normalizePartnerPassword(input).replace(/\s+/g, '');
  if (portal === 'roscas') {
    return compact === 'turosca';
  }
  if (portal === 'barra_fria') {
    return compact === 'sermejor';
  }
  if (portal === 'mostrador_panaderos') {
    return compact === 'equipo';
  }
  return compact === 'tupuedes';
}

/**
 * Clasifica si un artículo de ticket pertenece al módulo de Roscas y Esferas.
 */
export function classifyRoscaEsferaItem(item: TicketItem): 'rosca' | 'esfera' | null {
  const idNorm = normalizeText(item.productId);
  const nameNorm = normalizeText(item.name);

  if (idNorm.startsWith('p_esfera') || nameNorm.includes('esfera')) {
    return 'esfera';
  }
  if (idNorm.startsWith('p_rosca') || nameNorm.includes('rosca')) {
    return 'rosca';
  }
  return null;
}

/**
 * Clasifica si un artículo pertenece a los productos comisionables de Barra Fría
 * a partir del 25 de noviembre 2026:
 * - Pastel $65 ($9 por pieza)
 * - Pastel $35 ($5 por pieza)
 * - Galletas $65 (5% sobre venta)
 * - Dona Junior $15 (5% sobre venta) — excluye Dona Especial $20 y Dona Mini $8
 */
export function classifyBarraFriaItem(item: TicketItem): BarraFriaItemKind | null {
  const idNorm = normalizeText(item.productId);
  const nameNorm = normalizeText(item.name);
  const qty = Number(item.quantity) || 0;
  const rawPrice = Number(item.price) || (qty > 0 ? (Number(item.total) || 0) / qty : 0);
  const price = Math.round(rawPrice * 100) / 100;

  // 1. Pastel $65 ($9 por pieza)
  if (idNorm === 'p_pastel_65') return 'pastel_65';
  if (nameNorm.includes('pastel') && (Math.abs(price - 65) < 0.01 || /\b65\b/.test(nameNorm))) {
    return 'pastel_65';
  }

  // 2. Pastel $35 ($5 por pieza)
  if (idNorm === 'p_pastel_35') return 'pastel_35';
  if (nameNorm.includes('pastel') && (Math.abs(price - 35) < 0.01 || /\b35\b/.test(nameNorm))) {
    return 'pastel_35';
  }

  // 3. Galletas $65 (5% sobre venta) — no incluir Galletas $35 ni $50
  if (idNorm === 'p_galletas_65') return 'galletas_65';
  if (
    (nameNorm.includes('galleta') || idNorm.startsWith('p_galletas')) &&
    (Math.abs(price - 65) < 0.01 || /\b65\b/.test(nameNorm))
  ) {
    return 'galletas_65';
  }

  // 4. Dona Junior $15 (5% sobre venta) — excluir explícitamente Dona Especial $20 y Dona Mini $8
  if (idNorm === 'p_dona_especial_20' || nameNorm.includes('especial') || nameNorm.includes('mini')) {
    return null;
  }
  if (idNorm === 'p_dona_junior_15') return 'dona_junior';
  if (nameNorm.includes('dona') && nameNorm.includes('junior')) {
    return 'dona_junior';
  }

  return null;
}

export function computeBarraFriaCommission(
  kind: BarraFriaItemKind,
  quantity: number,
  revenue: number
): number {
  if (kind === 'pastel_65') {
    return Math.round(quantity * BARRA_FRIA_PASTEL_65_COMMISSION * 100) / 100;
  }
  if (kind === 'pastel_35') {
    return Math.round(quantity * BARRA_FRIA_PASTEL_35_COMMISSION * 100) / 100;
  }
  return Math.round(revenue * BARRA_FRIA_PERCENT_COMMISSION_RATE * 100) / 100;
}

export function isBarraFriaPostreItem(item: TicketItem): boolean {
  return classifyBarraFriaItem(item) !== null;
}

function getCanonicalProductDisplay(
  item: TicketItem,
  subCategory: 'rosca' | 'esfera' | 'postre',
  barraFriaKind?: BarraFriaItemKind
): { key: string; name: string } {
  const price = Math.round((Number(item.price) || 0) * 100) / 100;
  const idNorm = normalizeText(item.productId);
  const rawName = (item.name || '').trim();

  if (barraFriaKind === 'pastel_65' || idNorm === 'p_pastel_65') return { key: 'pastel_65', name: 'Pastel $65' };
  if (barraFriaKind === 'pastel_35' || idNorm === 'p_pastel_35') return { key: 'pastel_35', name: 'Pastel $35' };
  if (barraFriaKind === 'galletas_65' || idNorm === 'p_galletas_65') return { key: 'galletas_65', name: 'Galletas $65' };
  if (barraFriaKind === 'dona_junior' || idNorm === 'p_dona_junior_15') return { key: 'dona_junior_15', name: 'Dona Junior $15' };

  if (idNorm === 'p_rosca_50') return { key: 'rosca_50', name: 'Rosca $50' };
  if (idNorm === 'p_rosca_53') return { key: 'rosca_53', name: 'Rosca $53' };
  if (idNorm === 'p_esfera_35') return { key: 'esfera_35', name: 'Esfera $35' };
  if (idNorm === 'p_gelatina_20') return { key: 'gelatina_20', name: 'Gelatina $20' };
  if (idNorm === 'p_arroz_leche_25') return { key: 'arroz_leche_25', name: 'Arroz con Leche $25' };
  if (idNorm === 'p_galletas_35') return { key: 'galletas_35', name: 'Galletas $35' };
  if (idNorm === 'p_galletas_50') return { key: 'galletas_50', name: 'Galletas $50' };

  const cleanName = rawName || (subCategory === 'esfera' ? 'Esfera' : subCategory === 'rosca' ? 'Rosca' : 'Postre');
  const priceTag = price > 0 && !cleanName.includes('$') ? ` $${price}` : '';
  const display = `${cleanName}${priceTag}`;
  return {
    key: `${normalizeText(cleanName)}_${price}`,
    name: display
  };
}

const SHORT_DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const SHORT_MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FULL_MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function parseLocalYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

/**
 * Devuelve el rango [startDate, endDate] y textos legibles para el periodo elegido
 * a partir de una fecha ancla `anchorDate` (YYYY-MM-DD).
 */
export function getPeriodBounds(timeframe: SocioTimeframe, anchorDate: string): {
  startDate: string;
  endDate: string;
  periodTitle: string;
  periodSubtitle: string;
} {
  const today = getTodayString();
  const yesterday = shiftLocalDate(today, -1);
  const d = parseLocalYmd(anchorDate);

  if (timeframe === 'dia') {
    const dayName = SHORT_DAYS_ES[d.getDay()];
    const monthName = SHORT_MONTHS_ES[d.getMonth()];
    const formatted = `${dayName} ${d.getDate()} ${monthName}`;
    let title = formatted;
    if (anchorDate === today) title = `Hoy · ${formatted}`;
    else if (anchorDate === yesterday) title = `Ayer · ${formatted}`;

    return {
      startDate: anchorDate,
      endDate: anchorDate,
      periodTitle: title,
      periodSubtitle: `${d.getFullYear()}`
    };
  }

  if (timeframe === 'semana') {
    // Semana Lunes a Domingo que contiene anchorDate
    const jsDay = d.getDay(); // 0=Dom, 1=Lun..6=Sab
    const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
    const startDate = shiftLocalDate(anchorDate, diffToMonday);
    const endDate = shiftLocalDate(startDate, 6);
    const s = parseLocalYmd(startDate);
    const e = parseLocalYmd(endDate);

    const sameMonth = s.getMonth() === e.getMonth();
    const rangeLabel = sameMonth
      ? `${s.getDate()} al ${e.getDate()} ${SHORT_MONTHS_ES[e.getMonth()]}`
      : `${s.getDate()} ${SHORT_MONTHS_ES[s.getMonth()]} – ${e.getDate()} ${SHORT_MONTHS_ES[e.getMonth()]}`;

    const isCurrentWeek = today >= startDate && today <= endDate;
    return {
      startDate,
      endDate,
      periodTitle: isCurrentWeek ? `Esta semana` : `Semana ${rangeLabel}`,
      periodSubtitle: isCurrentWeek ? `${rangeLabel} · ${e.getFullYear()}` : `Lun a Dom · ${e.getFullYear()}`
    };
  }

  // Mes calendario completo
  const year = d.getFullYear();
  const monthIdx = d.getMonth();
  const firstDay = new Date(year, monthIdx, 1, 12, 0, 0);
  const lastDay = new Date(year, monthIdx + 1, 0, 12, 0, 0);
  const startDate = formatLocalDate(firstDay);
  const endDate = formatLocalDate(lastDay);
  const isCurrentMonth = today >= startDate && today <= endDate;

  return {
    startDate,
    endDate,
    periodTitle: `${FULL_MONTHS_ES[monthIdx]} ${year}`,
    periodSubtitle: isCurrentMonth ? 'Mes en curso (en tiempo real)' : `Del 1 al ${lastDay.getDate()} de ${FULL_MONTHS_ES[monthIdx]}`
  };
}

export function stepAnchorDate(timeframe: SocioTimeframe, anchorDate: string, direction: -1 | 1): string {
  if (timeframe === 'dia') {
    return shiftLocalDate(anchorDate, direction);
  }
  if (timeframe === 'semana') {
    return shiftLocalDate(anchorDate, direction * 7);
  }
  const d = parseLocalYmd(anchorDate);
  const target = new Date(d.getFullYear(), d.getMonth() + direction, 1, 12, 0, 0);
  return formatLocalDate(target);
}

export function formatMoney(amount: number, showCents = true): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0
  }).format(safe);
}

export function formatCompactMoney(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const hasCents = Math.abs(safe - Math.round(safe)) > 0.004;
  return formatMoney(safe, hasCents);
}

function getTicketDate(ticket: SaleTicket): string {
  if (ticket.date && /^\d{4}-\d{2}-\d{2}$/.test(ticket.date)) {
    return ticket.date;
  }
  if (ticket.timestamp) {
    const parsed = new Date(ticket.timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return formatLocalDate(parsed);
    }
  }
  return '';
}

function getTicketHour(ticket: SaleTicket): number {
  if (ticket.time) {
    const match = ticket.time.match(/^(\d{1,2}):/);
    if (match) {
      const h = Number(match[1]);
      if (h >= 0 && h <= 23) return h;
    }
  }
  if (ticket.timestamp) {
    const parsed = new Date(ticket.timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getHours();
    }
  }
  return 12;
}

function shiftDefaultTime(shift: 'madrugada' | 'manana' | 'tarde'): string {
  if (shift === 'madrugada') return '07:00';
  if (shift === 'manana') return '10:00';
  return '16:00';
}

function resolveDeliveryTicketDriverForRosca(
  t: SaleTicket,
  simonClientIds: Set<string>,
  simonClientNames: Set<string>,
  osvaldoClientNames: Set<string>
): 'simon' | 'osvaldo' | 'unknown' {
  if (t.driverId === 'simon') return 'simon';
  if (t.driverId === 'osvaldo') return 'osvaldo';

  if (t.id) {
    for (const cid of simonClientIds) {
      if (t.id.endsWith(`_${cid}`)) return 'simon';
    }
  }

  const cashierNorm = normalizeText(t.cashier);
  const folioNorm = normalizeText(t.folio);
  if (cashierNorm.includes('simon') || folioNorm.includes('simon')) return 'simon';
  if (cashierNorm.includes('osvaldo') || folioNorm.includes('osvaldo')) return 'osvaldo';

  const custNorm = normalizeText(t.customerName);
  if (custNorm) {
    if (simonClientNames.has(custNorm) || matchSimonAuthorizedClient(t.customerName)) return 'simon';
    if (osvaldoClientNames.has(custNorm) || matchOsvaldoAuthorizedClient(t.customerName)) return 'osvaldo';
  }

  return 'unknown';
}

/**
 * Recopila todas las Roscas entregadas en el reparto de Don Simón (atribuidas a El Refugio)
 * combinando sin duplicados: Tickets de Reparto + Hojas de Reparto Diario (nube + local) + Pedidos de Reparto.
 */
export function collectSimonRepartoRoscaLines(params: {
  tickets: SaleTicket[];
  orders?: BakeryOrder[];
  driverCustomers?: DriverCustomer[];
  cloudDailyDeliveries?: SocioDailyDeliveryInput[];
  startDate: string;
  endDate: string;
}): SimonRepartoRoscaEntry[] {
  const { tickets, orders = [], driverCustomers = [], cloudDailyDeliveries, startDate, endDate } = params;
  if (!startDate || !endDate || startDate > endDate) return [];

  const rawClients = driverCustomers.length > 0 ? driverCustomers : loadDriverCustomers();
  const simonClientMap = new Map<string, DriverCustomer>();
  const simonClientIds = new Set<string>();
  const simonClientNames = new Set<string>();
  const osvaldoClientNames = new Set<string>();

  for (const c of rawClients) {
    if (!c || !c.id) continue;
    if (c.driverId === 'simon') {
      simonClientMap.set(c.id, c);
      simonClientIds.add(c.id);
      const cn = normalizeText(c.name);
      if (cn) simonClientNames.add(cn);
    } else if (c.driverId === 'osvaldo') {
      const cn = normalizeText(c.name);
      if (cn) osvaldoClientNames.add(cn);
    }
  }
  const simonClients = Array.from(simonClientMap.values());

  const out: SimonRepartoRoscaEntry[] = [];
  const seenIds = new Set<string>();
  const seenDateClientShift = new Set<string>();

  // 1. Tickets de Reparto (registramos claves de todos para evitar duplicar hojas, pero solo sumamos Roscas de Simón)
  for (const t of tickets) {
    if (!isTicketDeliveryRecord(t)) continue;
    const tDate = getTicketDate(t);
    if (!tDate || tDate < startDate || tDate > endDate) continue;

    const shift: 'madrugada' | 'manana' | 'tarde' =
      t.deliveryShift === 'madrugada' || t.deliveryShift === 'manana' || t.deliveryShift === 'tarde'
        ? t.deliveryShift
        : t.shift === 'turno1'
        ? 'manana'
        : 'tarde';

    if (t.id) seenIds.add(t.id);
    if (t.customerName) {
      seenDateClientShift.add(`${tDate}__${normalizeText(t.customerName)}__${shift}`);
    }

    const driver = resolveDeliveryTicketDriverForRosca(t, simonClientIds, simonClientNames, osvaldoClientNames);
    if (driver !== 'simon') continue;

    const lineTime = (t.time || '').slice(0, 5) || shiftDefaultTime(shift);
    const lineTs = t.timestamp || `${tDate}T${lineTime}:00`;
    const clientName = (t.customerName || 'Reparto Simón').trim();

    for (const item of t.items || []) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      if (classifyRoscaEsferaItem(item) !== 'rosca') continue;

      const rawPrice = Number(item.price) || (qty > 0 ? (Number(item.total) || 0) / qty : 45);
      const unitPrice = Math.round((rawPrice > 0 ? rawPrice : 45) * 100) / 100;
      const revenue = Math.round((Number(item.total) || unitPrice * qty) * 100) / 100;

      out.push({
        id: t.id || `rep_tk_rosca_${tDate}_${out.length}`,
        date: tDate,
        time: lineTime,
        timestamp: lineTs,
        folio: t.folio || 'Reparto Simón',
        clientName,
        shift,
        productKey: `rosca_reparto_simon_${unitPrice}`,
        productName: `Rosca Reparto Simón $${unitPrice}`,
        unitPrice,
        quantity: qty,
        revenue,
        source: 'ticket'
      });
    }
  }

  // 2. Hojas de Reparto Diario (nube + local) para clientes de Simón sin duplicar tickets
  const cloudSheetMap = new Map<string, Record<string, Record<string, number>>>();
  if (Array.isArray(cloudDailyDeliveries)) {
    for (const row of cloudDailyDeliveries) {
      if (row && row.date && row.shift && row.quantities) {
        cloudSheetMap.set(`${row.date}__${row.shift}`, row.quantities);
      }
    }
  }

  const targetDates = enumerateDatesInclusive(startDate, endDate, 400);
  const shifts: Array<'madrugada' | 'manana' | 'tarde'> = ['madrugada', 'manana', 'tarde'];

  for (const curDate of targetDates) {
    for (const sh of shifts) {
      let localSheet: Record<string, Record<string, number>> = {};
      try {
        localSheet = getDailyDeliverySheet(curDate, sh) || {};
      } catch {
        localSheet = {};
      }
      const cloudSheet = cloudSheetMap.get(`${curDate}__${sh}`) || {};
      const sheet: Record<string, Record<string, number>> = {
        ...cloudSheet,
        ...localSheet
      };
      if (Object.keys(sheet).length === 0) continue;

      const lineTime = shiftDefaultTime(sh);
      const lineTs = `${curDate}T${lineTime}:00`;

      for (const client of simonClients) {
        const repId = `rep_${curDate}_${sh}_${client.id}`;
        const nameKey = `${curDate}__${normalizeText(client.name)}__${sh}`;
        if (seenIds.has(repId) || seenDateClientShift.has(nameKey)) continue;

        const cQ = sheet[client.id];
        if (!cQ) continue;

        const breadItems = getNormalizedDriverCustomerItems(client);
        const checkedBreads = new Set<string>();
        let addedForClient = false;

        for (const it of breadItems) {
          checkedBreads.add(it.breadName);
          const qty = Number(cQ[it.breadName]) || 0;
          if (qty <= 0) continue;

          const synthetic: TicketItem = {
            id: '',
            productId: '',
            name: it.breadName,
            price: Number(it.unitPrice) || 45,
            quantity: qty,
            total: qty * (Number(it.unitPrice) || 45)
          };
          if (classifyRoscaEsferaItem(synthetic) !== 'rosca') continue;

          const unitPrice = Math.round((Number(it.unitPrice) || 45) * 100) / 100;
          const revenue = Math.round(qty * unitPrice * 100) / 100;

          out.push({
            id: repId,
            date: curDate,
            time: lineTime,
            timestamp: lineTs,
            folio: `Reparto Simón (${resolveShiftLabel(sh)})`,
            clientName: client.name,
            shift: sh,
            productKey: `rosca_reparto_simon_${unitPrice}`,
            productName: `Rosca Reparto Simón $${unitPrice}`,
            unitPrice,
            quantity: qty,
            revenue,
            source: 'hoja'
          });
          addedForClient = true;
        }

        // Capturar cualquier clave adicional con "rosca" registrada en la hoja de este cliente
        for (const [breadName, rawQty] of Object.entries(cQ)) {
          if (checkedBreads.has(breadName)) continue;
          const qty = Number(rawQty) || 0;
          if (qty <= 0) continue;

          const synthetic: TicketItem = {
            id: '',
            productId: '',
            name: breadName,
            price: 45,
            quantity: qty,
            total: qty * 45
          };
          if (classifyRoscaEsferaItem(synthetic) !== 'rosca') continue;

          const unitPrice = 45;
          const revenue = Math.round(qty * unitPrice * 100) / 100;
          out.push({
            id: repId,
            date: curDate,
            time: lineTime,
            timestamp: lineTs,
            folio: `Reparto Simón (${resolveShiftLabel(sh)})`,
            clientName: client.name,
            shift: sh,
            productKey: `rosca_reparto_simon_${unitPrice}`,
            productName: `Rosca Reparto Simón $${unitPrice}`,
            unitPrice,
            quantity: qty,
            revenue,
            source: 'hoja'
          });
          addedForClient = true;
        }

        if (addedForClient) {
          seenIds.add(repId);
          seenDateClientShift.add(nameKey);
        }
      }
    }
  }

  // 3. Pedidos de Reparto (BakeryOrder) asignados a Simón
  for (const o of orders) {
    if (!isOrderDeliveryRecord(o)) continue;
    if (o.assignedDriverId !== 'simon') continue;
    const oDate = o.deliveryDate || '';
    if (!oDate || oDate < startDate || oDate > endDate) continue;

    const hour = Number((o.deliveryTime || '10:00').split(':')[0]) || 10;
    const shift: 'madrugada' | 'manana' | 'tarde' = hour < 7 ? 'madrugada' : hour < 14 ? 'manana' : 'tarde';
    const ordId = `rep_ord_${o.id}`;
    const nameKey = o.customerName ? `${oDate}__${normalizeText(o.customerName)}__${shift}` : '';
    if (seenIds.has(ordId) || (nameKey && seenDateClientShift.has(nameKey))) continue;

    const lineTime = (o.deliveryTime || '').slice(0, 5) || shiftDefaultTime(shift);
    const lineTs = `${oDate}T${lineTime}:00`;
    const clientName = (o.customerName || 'Pedido Reparto').trim();
    let addedForOrder = false;

    for (const it of o.items || []) {
      const qty = Number(it.quantity) || 0;
      if (qty <= 0) continue;

      const synthetic: TicketItem = {
        id: '',
        productId: it.breadId || '',
        name: it.name || '',
        price: Number(it.unitPrice) || 45,
        quantity: qty,
        total: Number(it.total) || qty * (Number(it.unitPrice) || 45)
      };
      if (classifyRoscaEsferaItem(synthetic) !== 'rosca') continue;

      const unitPrice = Math.round((Number(it.unitPrice) || 45) * 100) / 100;
      const revenue = Math.round((Number(it.total) || qty * unitPrice) * 100) / 100;

      out.push({
        id: ordId,
        date: oDate,
        time: lineTime,
        timestamp: lineTs,
        folio: o.folio || 'Reparto Simón',
        clientName,
        shift,
        productKey: `rosca_reparto_simon_${unitPrice}`,
        productName: `Rosca Reparto Simón $${unitPrice}`,
        unitPrice,
        quantity: qty,
        revenue,
        source: 'pedido'
      });
      addedForOrder = true;
    }

    if (addedForOrder) {
      seenIds.add(ordId);
      if (nameKey) seenDateClientShift.add(nameKey);
    }
  }

  return out;
}

/**
 * Construye el reporte completo en tiempo real para el portal de socios seleccionado.
 */
export function buildSocioReport(
  tickets: SaleTicket[],
  portal: SocioPortalType,
  timeframe: SocioTimeframe,
  anchorDate: string,
  branchFilter: SocioBranchFilter,
  extras?: SocioReportExtras
): SocioPeriodReport {
  const bounds = getPeriodBounds(timeframe, anchorDate);
  const { startDate, endDate, periodTitle } = bounds;
  const portalStartDate = SOCIO_START_DATE[portal];
  const portalStartDateLabel = SOCIO_START_DATE_LABEL[portal];
  const isBeforeStartDate = endDate < portalStartDate;
  const periodSubtitle =
    timeframe === 'mes' && !isBeforeStartDate && startDate < portalStartDate
      ? `Acumulado desde ${portalStartDateLabel}`
      : bounds.periodSubtitle;
  const today = getTodayString();

  const refugioSummary: SocioBranchSummary = {
    branch: 'refugio',
    label: 'El Refugio',
    pieces: 0,
    roscaPieces: 0,
    esferaPieces: 0,
    revenue: 0,
    commission: 0,
    ticketsCount: 0
  };
  const zakiaSummary: SocioBranchSummary = {
    branch: 'zakia',
    label: 'Zakia',
    pieces: 0,
    roscaPieces: 0,
    esferaPieces: 0,
    revenue: 0,
    commission: 0,
    ticketsCount: 0
  };

  const refugioTicketIds = new Set<string>();
  const zakiaTicketIds = new Set<string>();
  const filteredTicketIds = new Set<string>();

  const productMap = new Map<string, SocioProductBreakdown>();
  const allPeriodLines: SocioMatchedLine[] = [];
  const filteredLines: SocioMatchedLine[] = [];

  const registerMatchedLine = (line: SocioMatchedLine) => {
    allPeriodLines.push(line);

    // Siempre acumulamos comparativo de ambas sucursales (El Refugio vs Zakia)
    const branchTarget = line.branch === 'zakia' ? zakiaSummary : refugioSummary;
    branchTarget.pieces += line.quantity;
    branchTarget.revenue += line.revenue;
    branchTarget.commission = Math.round((branchTarget.commission + line.commission) * 100) / 100;
    if (line.subCategory === 'rosca') branchTarget.roscaPieces += line.quantity;
    if (line.subCategory === 'esfera') branchTarget.esferaPieces += line.quantity;
    if (line.branch === 'zakia') zakiaTicketIds.add(line.ticketId);
    else refugioTicketIds.add(line.ticketId);

    // Filtrado por sucursal activa
    if (branchFilter !== 'todas' && line.branch !== branchFilter) return;

    filteredLines.push(line);
    filteredTicketIds.add(line.ticketId);

    const existingProd = productMap.get(line.productKey);
    if (existingProd) {
      existingProd.pieces += line.quantity;
      existingProd.revenue += line.revenue;
      existingProd.commission = Math.round((existingProd.commission + line.commission) * 100) / 100;
      if (line.branch === 'zakia') existingProd.zakiaPieces += line.quantity;
      else existingProd.refugioPieces += line.quantity;
    } else {
      productMap.set(line.productKey, {
        productKey: line.productKey,
        name: line.productName,
        subCategory: line.subCategory,
        unitPrice: line.unitPrice,
        pieces: line.quantity,
        refugioPieces: line.branch === 'refugio' ? line.quantity : 0,
        zakiaPieces: line.branch === 'zakia' ? line.quantity : 0,
        revenue: line.revenue,
        commission: line.commission
      });
    }
  };

  for (const ticket of tickets) {
    const tDate = getTicketDate(ticket);
    if (!tDate || tDate < portalStartDate || tDate < startDate || tDate > endDate) continue;

    // Para Roscas, los tickets de reparto se procesan en el bloque unificado de Reparto de Simón (atribuidos a El Refugio sin duplicados)
    if (portal === 'roscas' && isTicketDeliveryRecord(ticket)) continue;

    const branch: BranchId = ticket.branch === 'zakia' ? 'zakia' : 'refugio';

    for (const item of ticket.items || []) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      let subCategory: 'rosca' | 'esfera' | 'postre' | null = null;
      let barraFriaKind: BarraFriaItemKind | undefined;
      if (portal === 'roscas') {
        subCategory = classifyRoscaEsferaItem(item);
      } else {
        const bfKind = classifyBarraFriaItem(item);
        if (bfKind) {
          subCategory = 'postre';
          barraFriaKind = bfKind;
        }
      }

      if (!subCategory) continue;

      const unitPrice = Number(item.price) || 0;
      const revenue = Number(item.total) || unitPrice * qty;
      const commission =
        portal === 'roscas'
          ? Math.round(revenue * ROSCA_COMMISSION_RATE * 100) / 100
          : barraFriaKind
          ? computeBarraFriaCommission(barraFriaKind, qty, revenue)
          : 0;

      const { key: productKey, name: productName } = getCanonicalProductDisplay(item, subCategory, barraFriaKind);

      registerMatchedLine({
        ticketId: ticket.id,
        folio: ticket.folio || '',
        date: tDate,
        time: (ticket.time || '').slice(0, 5) || '--:--',
        timestamp: ticket.timestamp || `${tDate}T${ticket.time || '12:00:00'}`,
        branch,
        productKey,
        productName,
        subCategory,
        barraFriaKind,
        unitPrice,
        quantity: qty,
        revenue,
        commission
      });
    }
  }

  // Contabilizar Roscas de Reparto de Don Simón atribuidas estrictamente a El Refugio (sin duplicados)
  if (portal === 'roscas' && !isBeforeStartDate) {
    const effectiveStart = startDate < portalStartDate ? portalStartDate : startDate;
    const simonRoscas = collectSimonRepartoRoscaLines({
      tickets,
      orders: extras?.orders,
      driverCustomers: extras?.driverCustomers,
      cloudDailyDeliveries: extras?.cloudDailyDeliveries,
      startDate: effectiveStart,
      endDate
    });

    for (const entry of simonRoscas) {
      const commission = Math.round(entry.revenue * ROSCA_COMMISSION_RATE * 100) / 100;
      registerMatchedLine({
        ticketId: entry.id,
        folio: entry.folio,
        date: entry.date,
        time: entry.time,
        timestamp: entry.timestamp,
        branch: 'refugio',
        productKey: entry.productKey,
        productName: entry.productName,
        subCategory: 'rosca',
        unitPrice: entry.unitPrice,
        quantity: entry.quantity,
        revenue: entry.revenue,
        commission,
        sourceLabel: `Reparto Simón (${entry.clientName})`
      });
    }
  }

  refugioSummary.ticketsCount = refugioTicketIds.size;
  zakiaSummary.ticketsCount = zakiaTicketIds.size;

  let totalPieces = 0;
  let roscaPieces = 0;
  let esferaPieces = 0;
  let roscaRevenue = 0;
  let esferaRevenue = 0;
  let roscaCommission = 0;
  let esferaCommission = 0;
  let totalRevenue = 0;
  let totalCommission = 0;

  const barraFriaBreakdown: BarraFriaBreakdown = {
    pastel65: { pieces: 0, revenue: 0, commission: 0 },
    pastel35: { pieces: 0, revenue: 0, commission: 0 },
    galletas65: { pieces: 0, revenue: 0, commission: 0 },
    donaJunior: { pieces: 0, revenue: 0, commission: 0 }
  };

  for (const line of filteredLines) {
    totalPieces += line.quantity;
    totalRevenue += line.revenue;
    totalCommission += line.commission;
    if (line.subCategory === 'rosca') {
      roscaPieces += line.quantity;
      roscaRevenue += line.revenue;
      roscaCommission += line.commission;
    } else if (line.subCategory === 'esfera') {
      esferaPieces += line.quantity;
      esferaRevenue += line.revenue;
      esferaCommission += line.commission;
    } else if (line.barraFriaKind) {
      const target =
        line.barraFriaKind === 'pastel_65'
          ? barraFriaBreakdown.pastel65
          : line.barraFriaKind === 'pastel_35'
          ? barraFriaBreakdown.pastel35
          : line.barraFriaKind === 'galletas_65'
          ? barraFriaBreakdown.galletas65
          : barraFriaBreakdown.donaJunior;
      target.pieces += line.quantity;
      target.revenue = Math.round((target.revenue + line.revenue) * 100) / 100;
      target.commission = Math.round((target.commission + line.commission) * 100) / 100;
    }
  }

  totalCommission = Math.round(totalCommission * 100) / 100;
  roscaCommission = Math.round(roscaCommission * 100) / 100;
  esferaCommission = Math.round(esferaCommission * 100) / 100;

  // Construir cubetas del gráfico ("Cómo se está vendiendo")
  const chartBuckets: SocioChartBucket[] = [];

  if (timeframe === 'dia') {
    // Bloques horarios de 2 horas para legibilidad en celular (7-9, 9-11, 11-13, 13-15, 15-17, 17-19, 19-21, 21+)
    const slots = [
      { key: 'h07', label: '7-9h', start: 0, end: 8 },
      { key: 'h09', label: '9-11h', start: 9, end: 10 },
      { key: 'h11', label: '11-13h', start: 11, end: 12 },
      { key: 'h13', label: '13-15h', start: 13, end: 14 },
      { key: 'h15', label: '15-17h', start: 15, end: 16 },
      { key: 'h17', label: '17-19h', start: 17, end: 18 },
      { key: 'h19', label: '19-21h', start: 19, end: 20 },
      { key: 'h21', label: '21h+', start: 21, end: 23 }
    ];
    const nowHour = new Date().getHours();
    const isToday = anchorDate === today;

    for (const slot of slots) {
      chartBuckets.push({
        key: slot.key,
        label: slot.label,
        sublabel: `De ${slot.start === 0 ? '7' : slot.start}:00 a ${slot.end + 1}:00`,
        pieces: 0,
        revenue: 0,
        commission: 0,
        refugioPieces: 0,
        zakiaPieces: 0,
        isCurrent: isToday && nowHour >= slot.start && nowHour <= slot.end
      });
    }

    // Mapeamos líneas filtradas por hora usando el mapa de tickets
    const ticketHourMap = new Map<string, number>();
    for (const t of tickets) {
      if (filteredTicketIds.has(t.id)) {
        ticketHourMap.set(t.id, getTicketHour(t));
      }
    }

    for (const line of filteredLines) {
      let hour = ticketHourMap.get(line.ticketId);
      if (hour === undefined) {
        const hm = line.time.match(/^(\d{1,2}):/);
        hour = hm ? Math.min(23, Math.max(0, Number(hm[1]))) : 12;
      }
      const idx = slots.findIndex(s => hour >= s.start && hour <= s.end);
      const bucket = chartBuckets[idx >= 0 ? idx : 0];
      bucket.pieces += line.quantity;
      bucket.revenue += line.revenue;
      bucket.commission = Math.round((bucket.commission + line.commission) * 100) / 100;
      if (line.branch === 'zakia') bucket.zakiaPieces += line.quantity;
      else bucket.refugioPieces += line.quantity;
    }
  } else if (timeframe === 'semana') {
    const bucketByDate = new Map<string, SocioChartBucket>();
    for (let i = 0; i < 7; i++) {
      const dateStr = shiftLocalDate(startDate, i);
      const dt = parseLocalYmd(dateStr);
      const bucket: SocioChartBucket = {
        key: dateStr,
        label: SHORT_DAYS_ES[dt.getDay()],
        sublabel: `${dt.getDate()} ${SHORT_MONTHS_ES[dt.getMonth()]}`,
        pieces: 0,
        revenue: 0,
        commission: 0,
        refugioPieces: 0,
        zakiaPieces: 0,
        isCurrent: dateStr === today
      };
      chartBuckets.push(bucket);
      bucketByDate.set(dateStr, bucket);
    }

    for (const line of filteredLines) {
      const bucket = bucketByDate.get(line.date);
      if (!bucket) continue;
      bucket.pieces += line.quantity;
      bucket.revenue += line.revenue;
      bucket.commission = Math.round((bucket.commission + line.commission) * 100) / 100;
      if (line.branch === 'zakia') bucket.zakiaPieces += line.quantity;
      else bucket.refugioPieces += line.quantity;
    }
  } else {
    // Mes: dividido por semanas del mes (Sem 1: 1-7, Sem 2: 8-14, Sem 3: 15-21, Sem 4: 22-28, Sem 5: 29-fin)
    const endDt = parseLocalYmd(endDate);
    const daysInMonth = endDt.getDate();
    const todayNum = today >= startDate && today <= endDate ? parseLocalYmd(today).getDate() : -1;
    const weekRanges = [
      { key: 'w1', label: 'Sem 1', start: 1, end: 7 },
      { key: 'w2', label: 'Sem 2', start: 8, end: 14 },
      { key: 'w3', label: 'Sem 3', start: 15, end: 21 },
      { key: 'w4', label: 'Sem 4', start: 22, end: 28 },
      ...(daysInMonth > 28 ? [{ key: 'w5', label: 'Sem 5', start: 29, end: daysInMonth }] : [])
    ];

    for (const wr of weekRanges) {
      chartBuckets.push({
        key: wr.key,
        label: wr.label,
        sublabel: `Días ${wr.start}–${wr.end}`,
        pieces: 0,
        revenue: 0,
        commission: 0,
        refugioPieces: 0,
        zakiaPieces: 0,
        isCurrent: todayNum >= wr.start && todayNum <= wr.end
      });
    }

    for (const line of filteredLines) {
      const dayOfMonth = Number(line.date.slice(8, 10)) || 1;
      const idx = Math.min(Math.floor((dayOfMonth - 1) / 7), chartBuckets.length - 1);
      const bucket = chartBuckets[idx];
      if (!bucket) continue;
      bucket.pieces += line.quantity;
      bucket.revenue += line.revenue;
      bucket.commission = Math.round((bucket.commission + line.commission) * 100) / 100;
      if (line.branch === 'zakia') bucket.zakiaPieces += line.quantity;
      else bucket.refugioPieces += line.quantity;
    }
  }

  let peakBucket: SocioChartBucket | null = null;
  for (const b of chartBuckets) {
    if (b.pieces > 0 && (!peakBucket || b.pieces > peakBucket.pieces)) {
      peakBucket = b;
    }
  }

  const products = Array.from(productMap.values()).sort((a, b) => {
    if (b.pieces !== a.pieces) return b.pieces - a.pieces;
    return b.revenue - a.revenue;
  });

  // Ordenar ventas recientes (más nuevas primero)
  const recentLines = [...filteredLines].sort((a, b) => {
    const cmpDate = b.date.localeCompare(a.date);
    if (cmpDate !== 0) return cmpDate;
    return b.timestamp.localeCompare(a.timestamp);
  });

  return {
    portal,
    portalStartDate,
    portalStartDateLabel,
    isBeforeStartDate,
    timeframe,
    branchFilter,
    startDate,
    endDate,
    periodTitle,
    periodSubtitle,
    totalPieces,
    roscaPieces,
    esferaPieces,
    roscaRevenue,
    esferaRevenue,
    roscaCommission,
    esferaCommission,
    barraFriaBreakdown,
    totalRevenue,
    totalCommission,
    ticketsCount: filteredTicketIds.size,
    branches: {
      refugio: refugioSummary,
      zakia: zakiaSummary
    },
    allBranchesTotalPieces: refugioSummary.pieces + zakiaSummary.pieces,
    allBranchesTotalRevenue: refugioSummary.revenue + zakiaSummary.revenue,
    allBranchesTotalCommission: Math.round((refugioSummary.commission + zakiaSummary.commission) * 100) / 100,
    products,
    chartBuckets,
    peakBucket,
    recentLines
  };
}

// =========================================================================
// MOTOR DE ANALÍTICA PARA REPARTO (SIMÓN Y OSVALDO — 5% DE COMISIÓN)
// =========================================================================

export interface RepartoEntryItem {
  name: string;
  quantity: number;
  revenue: number;
}

export interface RepartoEntry {
  id: string;
  date: string; // YYYY-MM-DD
  shift: 'madrugada' | 'manana' | 'tarde';
  shiftLabel: string;
  driverId: 'simon' | 'osvaldo';
  driverName: string;
  clientName: string;
  pieces: number;
  revenue: number;
  commission: number;
  items: RepartoEntryItem[];
  source: 'ticket' | 'hoja' | 'pedido';
}

export interface RepartoProductBreakdown {
  key: string;
  name: string;
  pieces: number;
  simonPieces: number;
  osvaldoPieces: number;
  commission: number;
}

export interface RepartoDriverSummary {
  driverId: 'simon' | 'osvaldo';
  label: string;
  deliveriesCount: number;
  pieces: number;
  revenue: number;
  commission: number;
}

export interface RepartoClientBreakdown {
  key: string;
  clientName: string;
  driverId: 'simon' | 'osvaldo';
  driverName: string;
  deliveriesCount: number;
  pieces: number;
  revenue: number;
  commission: number;
}

export interface RepartoChartBucket {
  key: string;
  label: string;
  sublabel?: string;
  deliveriesCount: number;
  pieces: number;
  revenue: number;
  commission: number;
  simonRevenue: number;
  osvaldoRevenue: number;
  simonCommission: number;
  osvaldoCommission: number;
  isCurrent?: boolean;
}

export interface RepartoPeriodReport {
  portalStartDate: string;
  portalStartDateLabel: string;
  isBeforeStartDate: boolean;
  timeframe: SocioTimeframe;
  driverFilter: SocioDriverFilter;
  startDate: string;
  endDate: string;
  periodTitle: string;
  periodSubtitle: string;
  totalDeliveries: number;
  totalPieces: number;
  totalRevenue: number;
  totalCommission: number;
  drivers: {
    simon: RepartoDriverSummary;
    osvaldo: RepartoDriverSummary;
  };
  allDriversTotalDeliveries: number;
  allDriversTotalPieces: number;
  allDriversTotalRevenue: number;
  allDriversTotalCommission: number;
  topProducts: RepartoProductBreakdown[];
  clients: RepartoClientBreakdown[];
  chartBuckets: RepartoChartBucket[];
  peakBucket: RepartoChartBucket | null;
  recentEntries: RepartoEntry[];
}

function isTicketDeliveryRecord(t: SaleTicket): boolean {
  return Boolean(
    t.isDelivery ||
    t.driverId === 'osvaldo' ||
    t.driverId === 'simon' ||
    (t.cashier && t.cashier.toLowerCase().includes('reparto'))
  );
}

function isOrderDeliveryRecord(o: BakeryOrder): boolean {
  return Boolean(
    o.deliveryType === 'reparto' ||
    o.orderChannel === 'reparto' ||
    o.deliveryType === 'domicilio' ||
    o.assignedDriverId === 'osvaldo' ||
    o.assignedDriverId === 'simon'
  );
}

function resolveShiftLabel(shift: 'madrugada' | 'manana' | 'tarde'): string {
  if (shift === 'madrugada') return 'Madrugada';
  if (shift === 'manana') return 'Mañana';
  return 'Tarde';
}

function enumerateDatesInclusive(startDate: string, endDate: string, maxDays = 40): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const dates: string[] = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < maxDays) {
    dates.push(cursor);
    cursor = shiftLocalDate(cursor, 1);
    guard++;
  }
  return dates;
}

export const OSVALDO_CLIENTS_PENDING = false;

export interface AuthorizedRepartoClientMatch {
  driverId: 'simon' | 'osvaldo';
  driverName: 'Don Simón' | 'Osvaldo';
  key: string;
  label: string;
}

function normalizeClientForMatch(name: string | undefined): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["'“”().,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clientes autorizados para comisión del 5% de Don Simón (12 clientes exactos):
 * Paola, Cremería Liz, Cremería Ángeles 1, Cremería Ángeles 2, Cabrera, San José,
 * Chopi, Vicky, Lupita, El Pollo, Señora Laura y Cremería Aby.
 */
export function matchSimonAuthorizedClient(rawName: string | undefined): { key: string; label: string } | null {
  const n = normalizeClientForMatch(rawName);
  if (!n) return null;

  if (/\bpaola\b/.test(n)) return { key: 'paola', label: 'Paola' };
  if (/\b(liz|lyz)\b/.test(n)) return { key: 'cremeria_liz', label: 'Cremería Liz' };
  if (/\bangeles\b/.test(n) && /\b1\b/.test(n)) return { key: 'cremeria_angeles_1', label: 'Cremería Ángeles 1' };
  if (/\bangeles\b/.test(n) && /\b2\b/.test(n)) return { key: 'cremeria_angeles_2', label: 'Cremería Ángeles 2' };
  if (/\bcabrera\b/.test(n)) return { key: 'cabrera', label: 'Cabrera' };
  if (/\bsan\s+(jose|gose)\b/.test(n)) return { key: 'san_jose', label: 'San José' };
  if (/\bchopi\b/.test(n)) return { key: 'chopi', label: 'Chopi' };
  if (/\b(vicky|viky)\b/.test(n)) return { key: 'vicky', label: 'Vicky' };
  if (/\blupita\b/.test(n)) return { key: 'lupita', label: 'Lupita' };
  if (/\bpollo\b/.test(n)) return { key: 'el_pollo', label: 'El Pollo' };
  if (/\blaura\b/.test(n)) return { key: 'senora_laura', label: 'Señora Laura' };
  if (/\b(aby|avy)\b/.test(n)) return { key: 'cremeria_aby', label: 'Cremería Aby' };

  return null;
}

/**
 * Clientes autorizados para comisión del 5% de Osvaldo (2 clientes exactos):
 * Esperanza "El Calero" y El Zancudo.
 */
export function matchOsvaldoAuthorizedClient(rawName: string | undefined): { key: string; label: string } | null {
  const n = normalizeClientForMatch(rawName);
  if (!n) return null;

  if (/\b(esperanza|calero)\b/.test(n)) return { key: 'esperanza_calero', label: 'Esperanza "El Calero"' };
  if (/\bzancudo\b/.test(n)) return { key: 'el_zancudo', label: 'El Zancudo' };

  return null;
}

/**
 * Resuelve si un cliente pertenece a la lista autorizada de comisiones de Don Simón o de Osvaldo.
 */
export function matchAuthorizedRepartoClient(rawName: string | undefined): AuthorizedRepartoClientMatch | null {
  const simon = matchSimonAuthorizedClient(rawName);
  if (simon) {
    return { driverId: 'simon', driverName: 'Don Simón', ...simon };
  }
  const osvaldo = matchOsvaldoAuthorizedClient(rawName);
  if (osvaldo) {
    return { driverId: 'osvaldo', driverName: 'Osvaldo', ...osvaldo };
  }
  return null;
}

export interface SocioDailyDeliveryInput {
  date: string;
  shift: 'madrugada' | 'manana' | 'tarde';
  quantities: Record<string, Record<string, number>>;
}

/**
 * Construye el reporte de comisiones (5%) para Reparto (Simón y Osvaldo)
 * combinando sin duplicados: Tickets de Reparto + Hojas de Reparto Diario + Pedidos de Reparto.
 * Solo considera fechas a partir del 1 de noviembre 2026.
 */
export function buildRepartoReport(
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  driverCustomers: DriverCustomer[],
  timeframe: SocioTimeframe,
  anchorDate: string,
  driverFilter: SocioDriverFilter,
  cloudDailyDeliveries?: SocioDailyDeliveryInput[]
): RepartoPeriodReport {
  const { startDate, endDate, periodTitle, periodSubtitle } = getPeriodBounds(timeframe, anchorDate);
  const portalStartDate = SOCIO_START_DATE.reparto;
  const portalStartDateLabel = SOCIO_START_DATE_LABEL.reparto;
  const isBeforeStartDate = endDate < portalStartDate;
  const today = getTodayString();

  const effectiveStart = startDate < portalStartDate ? portalStartDate : startDate;
  const targetDates = isBeforeStartDate ? [] : enumerateDatesInclusive(effectiveStart, endDate);

  // Clientes activos de reparto (Simón y Osvaldo)
  const rawClients = driverCustomers.length > 0 ? driverCustomers : loadDriverCustomers();
  const clientMap = new Map<string, DriverCustomer>();
  for (const c of rawClients) {
    if (c && c.id && (c.driverId === 'osvaldo' || c.driverId === 'simon')) {
      clientMap.set(c.id, c);
    }
  }
  const activeDeliveryClients = Array.from(clientMap.values());

  const allEntries: RepartoEntry[] = [];
  const seenTicketIds = new Set<string>();
  const seenDateClientShift = new Set<string>();

  // 1. Tickets de Reparto en rango (clientes autorizados de Don Simón y Osvaldo)
  for (const t of tickets) {
    if (!isTicketDeliveryRecord(t)) continue;
    const tDate = getTicketDate(t);
    if (!tDate || tDate < portalStartDate || tDate < startDate || tDate > endDate) continue;
    if (t.id && seenTicketIds.has(t.id)) continue;

    const clientMatch = matchAuthorizedRepartoClient(t.customerName);
    if (!clientMatch) continue;

    const revenue = Number(t.total) || 0;
    const pieces = (t.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    if (revenue <= 0 && pieces <= 0) continue;

    const shift: 'madrugada' | 'manana' | 'tarde' =
      t.deliveryShift === 'madrugada' || t.deliveryShift === 'manana' || t.deliveryShift === 'tarde'
        ? t.deliveryShift
        : t.shift === 'turno1'
        ? 'manana'
        : 'tarde';

    if (t.id) seenTicketIds.add(t.id);
    if (t.customerName) {
      seenDateClientShift.add(`${tDate}__${normalizeText(t.customerName)}__${shift}`);
    }
    seenDateClientShift.add(`${tDate}__${clientMatch.key}__${shift}`);

    allEntries.push({
      id: t.id || `rep_tk_${tDate}_${allEntries.length}`,
      date: tDate,
      shift,
      shiftLabel: resolveShiftLabel(shift),
      driverId: clientMatch.driverId,
      driverName: clientMatch.driverName,
      clientName: clientMatch.label,
      pieces,
      revenue,
      commission: Math.round(revenue * REPARTO_COMMISSION_RATE * 100) / 100,
      items: (t.items || [])
        .filter(it => (Number(it.quantity) || 0) > 0)
        .map(it => ({
          name: (it.name || 'Pan de reparto').trim(),
          quantity: Number(it.quantity) || 0,
          revenue: Number(it.total) || (Number(it.price) || 0) * (Number(it.quantity) || 0)
        })),
      source: 'ticket'
    });
  }

  // 2. Hojas de Reparto Diario (madrugada, mañana, tarde) combinando nube (Supabase) + local sin duplicar tickets
  const cloudSheetMap = new Map<string, Record<string, Record<string, number>>>();
  if (Array.isArray(cloudDailyDeliveries)) {
    for (const row of cloudDailyDeliveries) {
      if (row && row.date && row.shift && row.quantities) {
        cloudSheetMap.set(`${row.date}__${row.shift}`, row.quantities);
      }
    }
  }

  const shifts: Array<'madrugada' | 'manana' | 'tarde'> = ['madrugada', 'manana', 'tarde'];
  for (const curDate of targetDates) {
    for (const sh of shifts) {
      let localSheet: Record<string, Record<string, number>> = {};
      try {
        localSheet = getDailyDeliverySheet(curDate, sh) || {};
      } catch {
        localSheet = {};
      }
      const cloudSheet = cloudSheetMap.get(`${curDate}__${sh}`) || {};
      const sheet: Record<string, Record<string, number>> = {
        ...cloudSheet,
        ...localSheet
      };
      if (Object.keys(sheet).length === 0) continue;

      for (const client of activeDeliveryClients) {
        const clientMatch = matchAuthorizedRepartoClient(client.name);
        if (!clientMatch) continue;

        const repId = `rep_${curDate}_${sh}_${client.id}`;
        const nameKey = `${curDate}__${normalizeText(client.name)}__${sh}`;
        const canonicalKey = `${curDate}__${clientMatch.key}__${sh}`;
        if (seenTicketIds.has(repId) || seenDateClientShift.has(nameKey) || seenDateClientShift.has(canonicalKey)) continue;

        const cQ = sheet[client.id];
        if (!cQ) continue;

        const breadItems = getNormalizedDriverCustomerItems(client);
        let pieces = 0;
        let revenue = 0;
        const entryItems: RepartoEntryItem[] = [];
        for (const it of breadItems) {
          const q = Number(cQ[it.breadName]) || 0;
          if (q > 0) {
            const lineRev = q * (Number(it.unitPrice) || 0);
            pieces += q;
            revenue += lineRev;
            entryItems.push({
              name: (it.breadName || 'Pan de reparto').trim(),
              quantity: q,
              revenue: lineRev
            });
          }
        }
        if (pieces <= 0 && revenue <= 0) continue;

        seenTicketIds.add(repId);
        seenDateClientShift.add(nameKey);
        seenDateClientShift.add(canonicalKey);

        allEntries.push({
          id: repId,
          date: curDate,
          shift: sh,
          shiftLabel: resolveShiftLabel(sh),
          driverId: clientMatch.driverId,
          driverName: clientMatch.driverName,
          clientName: clientMatch.label,
          pieces,
          revenue: Math.round(revenue * 100) / 100,
          commission: Math.round(revenue * REPARTO_COMMISSION_RATE * 100) / 100,
          items: entryItems,
          source: 'hoja'
        });
      }
    }
  }

  // 3. Pedidos de Reparto (BakeryOrder) en rango (clientes autorizados de Don Simón y Osvaldo)
  for (const o of orders) {
    if (!isOrderDeliveryRecord(o)) continue;
    const oDate = o.deliveryDate || '';
    if (!oDate || oDate < portalStartDate || oDate < startDate || oDate > endDate) continue;

    const clientMatch = matchAuthorizedRepartoClient(o.customerName);
    if (!clientMatch) continue;

    const revenue = Number(o.total) || 0;
    const pieces = (o.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    if (revenue <= 0 && pieces <= 0) continue;

    const hour = Number((o.deliveryTime || '10:00').split(':')[0]) || 10;
    const shift: 'madrugada' | 'manana' | 'tarde' = hour < 7 ? 'madrugada' : hour < 14 ? 'manana' : 'tarde';

    allEntries.push({
      id: `rep_ord_${o.id}`,
      date: oDate,
      shift,
      shiftLabel: resolveShiftLabel(shift),
      driverId: clientMatch.driverId,
      driverName: clientMatch.driverName,
      clientName: clientMatch.label,
      pieces,
      revenue,
      commission: Math.round(revenue * REPARTO_COMMISSION_RATE * 100) / 100,
      items: (o.items || [])
        .filter(it => (Number(it.quantity) || 0) > 0)
        .map(it => ({
          name: (it.name || 'Pan de reparto').trim(),
          quantity: Number(it.quantity) || 0,
          revenue: Number(it.total) || (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0)
        })),
      source: 'pedido'
    });
  }

  const simonSummary: RepartoDriverSummary = {
    driverId: 'simon',
    label: 'Don Simón',
    deliveriesCount: 0,
    pieces: 0,
    revenue: 0,
    commission: 0
  };
  const osvaldoSummary: RepartoDriverSummary = {
    driverId: 'osvaldo',
    label: 'Osvaldo',
    deliveriesCount: 0,
    pieces: 0,
    revenue: 0,
    commission: 0
  };

  for (const entry of allEntries) {
    const target = entry.driverId === 'osvaldo' ? osvaldoSummary : simonSummary;
    target.deliveriesCount += 1;
    target.pieces += entry.pieces;
    target.revenue = Math.round((target.revenue + entry.revenue) * 100) / 100;
    target.commission = Math.round((target.commission + entry.commission) * 100) / 100;
  }

  const filteredEntries =
    driverFilter === 'todos' ? allEntries : allEntries.filter(e => e.driverId === driverFilter);

  let totalPieces = 0;
  let totalRevenue = 0;
  let totalCommission = 0;
  const clientAggMap = new Map<string, RepartoClientBreakdown>();
  const productAggMap = new Map<string, RepartoProductBreakdown>();

  for (const entry of filteredEntries) {
    totalPieces += entry.pieces;
    totalRevenue += entry.revenue;
    totalCommission += entry.commission;

    for (const item of entry.items) {
      const pKey = normalizeText(item.name);
      if (!pKey) continue;
      const itemComm = Math.round(item.revenue * REPARTO_COMMISSION_RATE * 100) / 100;
      const prevProd = productAggMap.get(pKey);
      if (prevProd) {
        prevProd.pieces += item.quantity;
        prevProd.commission = Math.round((prevProd.commission + itemComm) * 100) / 100;
        if (entry.driverId === 'osvaldo') prevProd.osvaldoPieces += item.quantity;
        else prevProd.simonPieces += item.quantity;
      } else {
        productAggMap.set(pKey, {
          key: pKey,
          name: item.name,
          pieces: item.quantity,
          simonPieces: entry.driverId === 'simon' ? item.quantity : 0,
          osvaldoPieces: entry.driverId === 'osvaldo' ? item.quantity : 0,
          commission: itemComm
        });
      }
    }

    const cKey = `${entry.driverId}__${normalizeText(entry.clientName)}`;
    const prev = clientAggMap.get(cKey);
    if (prev) {
      prev.deliveriesCount += 1;
      prev.pieces += entry.pieces;
      prev.revenue = Math.round((prev.revenue + entry.revenue) * 100) / 100;
      prev.commission = Math.round((prev.commission + entry.commission) * 100) / 100;
    } else {
      clientAggMap.set(cKey, {
        key: cKey,
        clientName: entry.clientName,
        driverId: entry.driverId,
        driverName: entry.driverName,
        deliveriesCount: 1,
        pieces: entry.pieces,
        revenue: entry.revenue,
        commission: entry.commission
      });
    }
  }

  totalRevenue = Math.round(totalRevenue * 100) / 100;
  totalCommission = Math.round(totalCommission * 100) / 100;

  // Construir cubetas del gráfico para Reparto
  const chartBuckets: RepartoChartBucket[] = [];
  if (timeframe === 'dia') {
    const shiftSlots: Array<{ key: 'madrugada' | 'manana' | 'tarde'; label: string; sublabel: string }> = [
      { key: 'madrugada', label: 'Madrugada', sublabel: 'Turno madrugada' },
      { key: 'manana', label: 'Mañana', sublabel: 'Turno mañana' },
      { key: 'tarde', label: 'Tarde', sublabel: 'Turno tarde' }
    ];
    for (const slot of shiftSlots) {
      chartBuckets.push({
        key: slot.key,
        label: slot.label,
        sublabel: slot.sublabel,
        deliveriesCount: 0,
        pieces: 0,
        revenue: 0,
        commission: 0,
        simonRevenue: 0,
        osvaldoRevenue: 0,
        simonCommission: 0,
        osvaldoCommission: 0,
        isCurrent: false
      });
    }
    for (const entry of filteredEntries) {
      const b = chartBuckets.find(x => x.key === entry.shift);
      if (!b) continue;
      b.deliveriesCount += 1;
      b.pieces += entry.pieces;
      b.revenue = Math.round((b.revenue + entry.revenue) * 100) / 100;
      b.commission = Math.round((b.commission + entry.commission) * 100) / 100;
      if (entry.driverId === 'osvaldo') {
        b.osvaldoRevenue = Math.round((b.osvaldoRevenue + entry.revenue) * 100) / 100;
        b.osvaldoCommission = Math.round((b.osvaldoCommission + entry.commission) * 100) / 100;
      } else {
        b.simonRevenue = Math.round((b.simonRevenue + entry.revenue) * 100) / 100;
        b.simonCommission = Math.round((b.simonCommission + entry.commission) * 100) / 100;
      }
    }
  } else if (timeframe === 'semana') {
    const bucketByDate = new Map<string, RepartoChartBucket>();
    for (let i = 0; i < 7; i++) {
      const dateStr = shiftLocalDate(startDate, i);
      const dt = parseLocalYmd(dateStr);
      const bucket: RepartoChartBucket = {
        key: dateStr,
        label: SHORT_DAYS_ES[dt.getDay()],
        sublabel: `${dt.getDate()} ${SHORT_MONTHS_ES[dt.getMonth()]}`,
        deliveriesCount: 0,
        pieces: 0,
        revenue: 0,
        commission: 0,
        simonRevenue: 0,
        osvaldoRevenue: 0,
        simonCommission: 0,
        osvaldoCommission: 0,
        isCurrent: dateStr === today
      };
      chartBuckets.push(bucket);
      bucketByDate.set(dateStr, bucket);
    }
    for (const entry of filteredEntries) {
      const b = bucketByDate.get(entry.date);
      if (!b) continue;
      b.deliveriesCount += 1;
      b.pieces += entry.pieces;
      b.revenue = Math.round((b.revenue + entry.revenue) * 100) / 100;
      b.commission = Math.round((b.commission + entry.commission) * 100) / 100;
      if (entry.driverId === 'osvaldo') {
        b.osvaldoRevenue = Math.round((b.osvaldoRevenue + entry.revenue) * 100) / 100;
        b.osvaldoCommission = Math.round((b.osvaldoCommission + entry.commission) * 100) / 100;
      } else {
        b.simonRevenue = Math.round((b.simonRevenue + entry.revenue) * 100) / 100;
        b.simonCommission = Math.round((b.simonCommission + entry.commission) * 100) / 100;
      }
    }
  } else {
    const endDt = parseLocalYmd(endDate);
    const daysInMonth = endDt.getDate();
    const todayNum = today >= startDate && today <= endDate ? parseLocalYmd(today).getDate() : -1;
    const weekRanges = [
      { key: 'w1', label: 'Sem 1', start: 1, end: 7 },
      { key: 'w2', label: 'Sem 2', start: 8, end: 14 },
      { key: 'w3', label: 'Sem 3', start: 15, end: 21 },
      { key: 'w4', label: 'Sem 4', start: 22, end: 28 },
      ...(daysInMonth > 28 ? [{ key: 'w5', label: 'Sem 5', start: 29, end: daysInMonth }] : [])
    ];
    for (const wr of weekRanges) {
      chartBuckets.push({
        key: wr.key,
        label: wr.label,
        sublabel: `Días ${wr.start}–${wr.end}`,
        deliveriesCount: 0,
        pieces: 0,
        revenue: 0,
        commission: 0,
        simonRevenue: 0,
        osvaldoRevenue: 0,
        simonCommission: 0,
        osvaldoCommission: 0,
        isCurrent: todayNum >= wr.start && todayNum <= wr.end
      });
    }
    for (const entry of filteredEntries) {
      const dayOfMonth = Number(entry.date.slice(8, 10)) || 1;
      const idx = Math.min(Math.floor((dayOfMonth - 1) / 7), chartBuckets.length - 1);
      const b = chartBuckets[idx];
      if (!b) continue;
      b.deliveriesCount += 1;
      b.pieces += entry.pieces;
      b.revenue = Math.round((b.revenue + entry.revenue) * 100) / 100;
      b.commission = Math.round((b.commission + entry.commission) * 100) / 100;
      if (entry.driverId === 'osvaldo') {
        b.osvaldoRevenue = Math.round((b.osvaldoRevenue + entry.revenue) * 100) / 100;
        b.osvaldoCommission = Math.round((b.osvaldoCommission + entry.commission) * 100) / 100;
      } else {
        b.simonRevenue = Math.round((b.simonRevenue + entry.revenue) * 100) / 100;
        b.simonCommission = Math.round((b.simonCommission + entry.commission) * 100) / 100;
      }
    }
  }

  let peakBucket: RepartoChartBucket | null = null;
  for (const b of chartBuckets) {
    if (b.revenue > 0 && (!peakBucket || b.revenue > peakBucket.revenue)) {
      peakBucket = b;
    }
  }

  const topProducts = Array.from(productAggMap.values()).sort((a, b) => {
    if (b.pieces !== a.pieces) return b.pieces - a.pieces;
    return b.commission - a.commission;
  });
  const clients = Array.from(clientAggMap.values()).sort((a, b) => b.commission - a.commission);
  const recentEntries = [...filteredEntries].sort((a, b) => {
    const dCmp = b.date.localeCompare(a.date);
    if (dCmp !== 0) return dCmp;
    const shiftOrder = { tarde: 3, manana: 2, madrugada: 1 };
    return shiftOrder[b.shift] - shiftOrder[a.shift];
  });

  return {
    portalStartDate,
    portalStartDateLabel,
    isBeforeStartDate,
    timeframe,
    driverFilter,
    startDate,
    endDate,
    periodTitle,
    periodSubtitle,
    totalDeliveries: filteredEntries.length,
    totalPieces,
    totalRevenue,
    totalCommission,
    drivers: {
      simon: simonSummary,
      osvaldo: osvaldoSummary
    },
    allDriversTotalDeliveries: simonSummary.deliveriesCount + osvaldoSummary.deliveriesCount,
    allDriversTotalPieces: simonSummary.pieces + osvaldoSummary.pieces,
    allDriversTotalRevenue: Math.round((simonSummary.revenue + osvaldoSummary.revenue) * 100) / 100,
    allDriversTotalCommission: Math.round((simonSummary.commission + osvaldoSummary.commission) * 100) / 100,
    topProducts,
    clients,
    chartBuckets,
    peakBucket,
    recentEntries
  };
}

// =========================================================================
// MOTOR DE ANALÍTICA PARA SOCIOS VIP: MOSTRADOR Y PANADEROS (1% VENTAS DIARIAS)
// =========================================================================

export interface MostradorPanaderoMember {
  id: string;
  name: string;
  branch: BranchId;
  branchLabel: 'El Refugio' | 'Zakia';
}

export const MOSTRADOR_PANADEROS_MEMBERS: MostradorPanaderoMember[] = [
  // El Refugio (6)
  { id: 'chino', name: 'Chino', branch: 'refugio', branchLabel: 'El Refugio' },
  { id: 'bruce', name: 'Bruce', branch: 'refugio', branchLabel: 'El Refugio' },
  { id: 'daniel', name: 'Daniel', branch: 'refugio', branchLabel: 'El Refugio' },
  { id: 'mago', name: 'Mago', branch: 'refugio', branchLabel: 'El Refugio' },
  { id: 'natty', name: 'Natty', branch: 'refugio', branchLabel: 'El Refugio' },
  { id: 'nan', name: 'Nan', branch: 'refugio', branchLabel: 'El Refugio' },
  // Zakia (5)
  { id: 'mireya', name: 'Mireya', branch: 'zakia', branchLabel: 'Zakia' },
  { id: 'maggie', name: 'Maggie', branch: 'zakia', branchLabel: 'Zakia' },
  { id: 'ama', name: 'Ama', branch: 'zakia', branchLabel: 'Zakia' },
  { id: 'angy', name: 'Angy', branch: 'zakia', branchLabel: 'Zakia' },
  { id: 'ernesto', name: 'Ernesto', branch: 'zakia', branchLabel: 'Zakia' }
];

export interface MostradorPanaderosDailyEntry {
  date: string; // YYYY-MM-DD
  label: string; // Ej. "Mié 25 Nov"
  poolAmount: number; // 1% del día (bolsa grupal)
  memberAmount: number; // Monto individual del día (1% ÷ 11)
  isToday: boolean;
}

export interface MostradorPanaderosChartBucket {
  key: string;
  label: string;
  sublabel?: string;
  memberAmount: number;
  poolAmount: number;
  isCurrent?: boolean;
}

export interface MostradorPanaderosReport {
  portalStartDate: string;
  portalStartDateLabel: string;
  portalEndDate: string;
  portalEndDateLabel: string;
  isBeforeStartDate: boolean;
  isAfterEndDate: boolean;
  timeframe: SocioTimeframe;
  startDate: string;
  endDate: string;
  periodTitle: string;
  periodSubtitle: string;
  memberCount: number;
  poolTotalAmount: number; // 1% total del periodo
  memberTotalAmount: number; // Monto individual acumulado del periodo
  todayMemberAmount: number; // Monto individual acumulado hoy en vivo
  avgDailyMemberAmount: number; // Promedio diario por integrante en días con venta
  activeDaysCount: number;
  members: MostradorPanaderoMember[];
  refugioMembers: MostradorPanaderoMember[];
  zakiaMembers: MostradorPanaderoMember[];
  dailyEntries: MostradorPanaderosDailyEntry[];
  chartBuckets: MostradorPanaderosChartBucket[];
  peakBucket: MostradorPanaderosChartBucket | null;
}

function getVipOrderAmount(v: VipOrder): number {
  const direct = Number((v as any).totalAmount ?? (v as any).total ?? 0);
  if (direct > 0) return direct;
  if (Array.isArray((v as any).items)) {
    return (v as any).items.reduce((sum: number, it: any) => {
      const q = Number(it.quantity) || 0;
      const p = Number(it.unitPrice ?? it.price) || 0;
      return sum + (Number(it.subtotal ?? it.total) || q * p);
    }, 0);
  }
  return 0;
}

function getVipOrderDate(v: VipOrder): string {
  const raw = (v as any).date || (v as any).deliveryDate || (v as any).createdAt || '';
  return typeof raw === 'string' ? raw.slice(0, 10) : '';
}

/**
 * Construye el reporte en tiempo real para Socios VIP (Mostrador y Panaderos):
 * 1% del total de ventas diarias (Mostradores El Refugio + Zakia + Reparto sin duplicados + Pedidos VIP),
 * dividido equitativamente entre los 11 integrantes del 1 de diciembre 2026 al 7 de enero 2027.
 */
export function buildMostradorPanaderosReport(
  tickets: SaleTicket[],
  orders: BakeryOrder[],
  vipOrders: VipOrder[],
  driverCustomers: DriverCustomer[],
  timeframe: SocioTimeframe,
  anchorDate: string,
  cloudDailyDeliveries?: SocioDailyDeliveryInput[]
): MostradorPanaderosReport {
  const bounds = getPeriodBounds(timeframe, anchorDate);
  const { startDate, endDate, periodTitle } = bounds;
  const portalStartDate = SOCIO_START_DATE.mostrador_panaderos;
  const portalStartDateLabel = SOCIO_START_DATE_LABEL.mostrador_panaderos;
  const portalEndDate = MOSTRADOR_PANADEROS_END_DATE;
  const portalEndDateLabel = MOSTRADOR_PANADEROS_END_DATE_LABEL;
  const isBeforeStartDate = endDate < portalStartDate;
  const isAfterEndDate = startDate > portalEndDate;
  const isOutOfCampaign = isBeforeStartDate || isAfterEndDate;

  let periodSubtitle = bounds.periodSubtitle;
  if (!isOutOfCampaign) {
    if (startDate < portalStartDate && endDate > portalEndDate) {
      periodSubtitle = `Del ${portalStartDateLabel} al ${portalEndDateLabel}`;
    } else if (startDate < portalStartDate) {
      periodSubtitle = `Acumulado desde ${portalStartDateLabel}`;
    } else if (endDate > portalEndDate) {
      periodSubtitle = `Acumulado hasta ${portalEndDateLabel}`;
    }
  }
  const today = getTodayString();

  const memberCount = MOSTRADOR_PANADEROS_MEMBERS.length;
  const refugioMembers = MOSTRADOR_PANADEROS_MEMBERS.filter(m => m.branch === 'refugio');
  const zakiaMembers = MOSTRADOR_PANADEROS_MEMBERS.filter(m => m.branch === 'zakia');

  const effectiveStart = startDate < portalStartDate ? portalStartDate : startDate;
  const effectiveEnd = endDate > portalEndDate ? portalEndDate : endDate;

  // Rango ampliado para incluir también "today" (solo si está dentro de la campaña) y calcular siempre "Hoy en vivo"
  const calcDatesSet = new Set<string>();
  if (!isOutOfCampaign && effectiveStart <= effectiveEnd) {
    for (const d of enumerateDatesInclusive(effectiveStart, effectiveEnd, 45)) {
      calcDatesSet.add(d);
    }
  }
  if (today >= portalStartDate && today <= portalEndDate) {
    calcDatesSet.add(today);
  }

  const dailySalesMap = new Map<string, number>();
  // Para gráfica horaria en vista "Por Día"
  const hourlySalesForDay = new Map<number, number>();
  const seenRepIds = new Set<string>();
  const seenRepDateNameShift = new Set<string>();

  const addSale = (date: string, amount: number, hour?: number) => {
    if (
      !date ||
      amount <= 0 ||
      date < portalStartDate ||
      date > portalEndDate ||
      !calcDatesSet.has(date)
    ) {
      return;
    }
    dailySalesMap.set(date, (dailySalesMap.get(date) || 0) + amount);
    if (
      timeframe === 'dia' &&
      date === anchorDate &&
      date >= portalStartDate &&
      date <= portalEndDate
    ) {
      const h = typeof hour === 'number' && hour >= 0 && hour <= 23 ? hour : 12;
      hourlySalesForDay.set(h, (hourlySalesForDay.get(h) || 0) + amount);
    }
  };

  // 1. Tickets (Mostrador El Refugio + Mostrador Zakia + Tickets de Reparto)
  for (const t of tickets) {
    const tDate = getTicketDate(t);
    if (!tDate || !calcDatesSet.has(tDate)) continue;
    const amt = Number(t.total) || 0;
    const isDel = isTicketDeliveryRecord(t);
    if (isDel) {
      const shift: 'madrugada' | 'manana' | 'tarde' =
        t.deliveryShift === 'madrugada' || t.deliveryShift === 'manana' || t.deliveryShift === 'tarde'
          ? t.deliveryShift
          : t.shift === 'turno1'
          ? 'manana'
          : 'tarde';
      if (t.id) seenRepIds.add(t.id);
      if (t.customerName) {
        seenRepDateNameShift.add(`${tDate}__${normalizeText(t.customerName)}__${shift}`);
      }
    }
    if (amt > 0) {
      addSale(tDate, amt, getTicketHour(t));
    }
  }

  // 2. Hojas de Reparto Diario (nube + local) sin duplicar tickets de reparto
  const rawClients = driverCustomers.length > 0 ? driverCustomers : loadDriverCustomers();
  const clientMap = new Map<string, DriverCustomer>();
  for (const c of rawClients) {
    if (c && c.id && (c.driverId === 'osvaldo' || c.driverId === 'simon')) {
      clientMap.set(c.id, c);
    }
  }
  const activeDeliveryClients = Array.from(clientMap.values());

  const cloudSheetMap = new Map<string, Record<string, Record<string, number>>>();
  if (Array.isArray(cloudDailyDeliveries)) {
    for (const row of cloudDailyDeliveries) {
      if (row && row.date && row.shift && row.quantities) {
        cloudSheetMap.set(`${row.date}__${row.shift}`, row.quantities);
      }
    }
  }

  const shifts: Array<'madrugada' | 'manana' | 'tarde'> = ['madrugada', 'manana', 'tarde'];
  const shiftHours: Record<'madrugada' | 'manana' | 'tarde', number> = {
    madrugada: 7,
    manana: 10,
    tarde: 16
  };

  for (const curDate of calcDatesSet) {
    for (const sh of shifts) {
      let localSheet: Record<string, Record<string, number>> = {};
      try {
        localSheet = getDailyDeliverySheet(curDate, sh) || {};
      } catch {
        localSheet = {};
      }
      const cloudSheet = cloudSheetMap.get(`${curDate}__${sh}`) || {};
      const sheet: Record<string, Record<string, number>> = {
        ...cloudSheet,
        ...localSheet
      };
      if (Object.keys(sheet).length === 0) continue;

      for (const client of activeDeliveryClients) {
        const repId = `rep_${curDate}_${sh}_${client.id}`;
        const nameKey = `${curDate}__${normalizeText(client.name)}__${sh}`;
        if (seenRepIds.has(repId) || seenRepDateNameShift.has(nameKey)) continue;

        const cQ = sheet[client.id];
        if (!cQ) continue;

        const breadItems = getNormalizedDriverCustomerItems(client);
        let sheetRevenue = 0;
        for (const it of breadItems) {
          const q = Number(cQ[it.breadName]) || 0;
          if (q > 0) {
            sheetRevenue += q * (Number(it.unitPrice) || 0);
          }
        }
        if (sheetRevenue > 0) {
          seenRepIds.add(repId);
          seenRepDateNameShift.add(nameKey);
          addSale(curDate, sheetRevenue, shiftHours[sh]);
        }
      }
    }
  }

  // 3. Pedidos de Reparto (BakeryOrder) sin duplicar
  for (const o of orders) {
    if (!isOrderDeliveryRecord(o)) continue;
    const oDate = o.deliveryDate || '';
    if (!oDate || !calcDatesSet.has(oDate)) continue;
    const hour = Number((o.deliveryTime || '10:00').split(':')[0]) || 10;
    const shift: 'madrugada' | 'manana' | 'tarde' = hour < 7 ? 'madrugada' : hour < 14 ? 'manana' : 'tarde';
    const ordId = `rep_ord_${o.id}`;
    const nameKey = o.customerName ? `${oDate}__${normalizeText(o.customerName)}__${shift}` : '';
    if (seenRepIds.has(ordId) || (nameKey && seenRepDateNameShift.has(nameKey))) continue;
    const amt = Number(o.total) || 0;
    if (amt > 0) {
      seenRepIds.add(ordId);
      if (nameKey) seenRepDateNameShift.add(nameKey);
      addSale(oDate, amt, hour);
    }
  }

  // 4. Pedidos VIP
  for (const v of vipOrders) {
    const vDate = getVipOrderDate(v);
    if (!vDate || !calcDatesSet.has(vDate)) continue;
    const amt = getVipOrderAmount(v);
    if (amt > 0) {
      let vHour = 11;
      if (v.createdAt) {
        const parsed = new Date(v.createdAt);
        if (!Number.isNaN(parsed.getTime())) vHour = parsed.getHours();
      }
      addSale(vDate, amt, vHour);
    }
  }

  // Consolidar días del periodo seleccionado (estrictamente dentro del 1 dic 2026 al 7 ene 2027)
  const periodDates =
    isOutOfCampaign || effectiveStart > effectiveEnd
      ? []
      : enumerateDatesInclusive(effectiveStart, effectiveEnd, 45);
  const dailyEntries: MostradorPanaderosDailyEntry[] = [];
  let periodTotalSales = 0;
  let activeDaysCount = 0;

  for (const d of periodDates) {
    const daySales = dailySalesMap.get(d) || 0;
    if (daySales <= 0) continue;
    periodTotalSales += daySales;
    activeDaysCount += 1;
    const poolAmount = Math.round(daySales * MOSTRADOR_PANADEROS_POOL_RATE * 100) / 100;
    const memberAmount = Math.round((poolAmount / memberCount) * 100) / 100;
    const dt = parseLocalYmd(d);
    dailyEntries.push({
      date: d,
      label: `${SHORT_DAYS_ES[dt.getDay()]} ${dt.getDate()} ${SHORT_MONTHS_ES[dt.getMonth()]}`,
      poolAmount,
      memberAmount,
      isToday: d === today
    });
  }

  dailyEntries.sort((a, b) => b.date.localeCompare(a.date));

  const poolTotalAmount = Math.round(periodTotalSales * MOSTRADOR_PANADEROS_POOL_RATE * 100) / 100;
  const memberTotalAmount = Math.round((poolTotalAmount / memberCount) * 100) / 100;
  const todaySales = dailySalesMap.get(today) || 0;
  const todayMemberAmount =
    today >= portalStartDate && today <= portalEndDate
      ? Math.round(((todaySales * MOSTRADOR_PANADEROS_POOL_RATE) / memberCount) * 100) / 100
      : 0;
  const avgDailyMemberAmount =
    activeDaysCount > 0 ? Math.round((memberTotalAmount / activeDaysCount) * 100) / 100 : 0;

  // Construir cubetas del gráfico (siempre en monto individual del socio VIP)
  const chartBuckets: MostradorPanaderosChartBucket[] = [];

  if (timeframe === 'dia') {
    const slots = [
      { key: 'h07', label: '7-9h', start: 0, end: 8 },
      { key: 'h09', label: '9-11h', start: 9, end: 10 },
      { key: 'h11', label: '11-13h', start: 11, end: 12 },
      { key: 'h13', label: '13-15h', start: 13, end: 14 },
      { key: 'h15', label: '15-17h', start: 15, end: 16 },
      { key: 'h17', label: '17-19h', start: 17, end: 18 },
      { key: 'h19', label: '19-21h', start: 19, end: 20 },
      { key: 'h21', label: '21h+', start: 21, end: 23 }
    ];
    const nowHour = new Date().getHours();
    const isToday = anchorDate === today;

    for (const slot of slots) {
      let slotSales = 0;
      for (let h = slot.start; h <= slot.end; h++) {
        slotSales += hourlySalesForDay.get(h) || 0;
      }
      const slotPool = Math.round(slotSales * MOSTRADOR_PANADEROS_POOL_RATE * 100) / 100;
      const slotMember = Math.round((slotPool / memberCount) * 100) / 100;
      chartBuckets.push({
        key: slot.key,
        label: slot.label,
        sublabel: `De ${slot.start === 0 ? '7' : slot.start}:00 a ${slot.end + 1}:00`,
        memberAmount: slotMember,
        poolAmount: slotPool,
        isCurrent: isToday && nowHour >= slot.start && nowHour <= slot.end
      });
    }
  } else if (timeframe === 'semana') {
    for (let i = 0; i < 7; i++) {
      const dateStr = shiftLocalDate(startDate, i);
      const dt = parseLocalYmd(dateStr);
      const daySales =
        dateStr >= portalStartDate && dateStr <= portalEndDate ? dailySalesMap.get(dateStr) || 0 : 0;
      const poolAmt = Math.round(daySales * MOSTRADOR_PANADEROS_POOL_RATE * 100) / 100;
      const memAmt = Math.round((poolAmt / memberCount) * 100) / 100;
      chartBuckets.push({
        key: dateStr,
        label: SHORT_DAYS_ES[dt.getDay()],
        sublabel: `${dt.getDate()} ${SHORT_MONTHS_ES[dt.getMonth()]}`,
        memberAmount: memAmt,
        poolAmount: poolAmt,
        isCurrent: dateStr === today
      });
    }
  } else {
    const endDt = parseLocalYmd(endDate);
    const daysInMonth = endDt.getDate();
    const todayNum = today >= startDate && today <= endDate ? parseLocalYmd(today).getDate() : -1;
    const weekRanges = [
      { key: 'w1', label: 'Sem 1', start: 1, end: 7 },
      { key: 'w2', label: 'Sem 2', start: 8, end: 14 },
      { key: 'w3', label: 'Sem 3', start: 15, end: 21 },
      { key: 'w4', label: 'Sem 4', start: 22, end: 28 },
      ...(daysInMonth > 28 ? [{ key: 'w5', label: 'Sem 5', start: 29, end: daysInMonth }] : [])
    ];

    const weekSales = weekRanges.map(() => 0);
    for (const d of periodDates) {
      const dayOfMonth = Number(d.slice(8, 10)) || 1;
      const idx = Math.min(Math.floor((dayOfMonth - 1) / 7), weekRanges.length - 1);
      weekSales[idx] += dailySalesMap.get(d) || 0;
    }

    weekRanges.forEach((wr, idx) => {
      const poolAmt = Math.round(weekSales[idx] * MOSTRADOR_PANADEROS_POOL_RATE * 100) / 100;
      const memAmt = Math.round((poolAmt / memberCount) * 100) / 100;
      chartBuckets.push({
        key: wr.key,
        label: wr.label,
        sublabel: `Días ${wr.start}–${wr.end}`,
        memberAmount: memAmt,
        poolAmount: poolAmt,
        isCurrent: todayNum >= wr.start && todayNum <= wr.end
      });
    });
  }

  let peakBucket: MostradorPanaderosChartBucket | null = null;
  for (const b of chartBuckets) {
    if (b.memberAmount > 0 && (!peakBucket || b.memberAmount > peakBucket.memberAmount)) {
      peakBucket = b;
    }
  }

  return {
    portalStartDate,
    portalStartDateLabel,
    portalEndDate,
    portalEndDateLabel,
    isBeforeStartDate,
    isAfterEndDate,
    timeframe,
    startDate,
    endDate,
    periodTitle,
    periodSubtitle,
    memberCount,
    poolTotalAmount,
    memberTotalAmount,
    todayMemberAmount,
    avgDailyMemberAmount,
    activeDaysCount,
    members: MOSTRADOR_PANADEROS_MEMBERS,
    refugioMembers,
    zakiaMembers,
    dailyEntries,
    chartBuckets,
    peakBucket
  };
}


