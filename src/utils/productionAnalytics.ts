import { isNonBreadProduct } from './productClassification';

export type BreadClassificationKey =
  | 'bolillo'
  | 'tradicional'
  | 'relleno'
  | 'especial'
  | 'muerto_tradicional'
  | 'muerto_relleno'
  | 'rosca'
  | 'otros';

export interface BreadCategoryDefinition {
  key: BreadClassificationKey;
  label: string;
  shortLabel: string;
  targetPrice: number;
  color: string;
  chartColor: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  emoji: string;
  description: string;
}

export const BREAD_CATEGORIES: Record<BreadClassificationKey, BreadCategoryDefinition> = {
  bolillo: {
    key: 'bolillo',
    label: 'Bolillo ($5)',
    shortLabel: 'Bolillo ($5)',
    targetPrice: 5,
    color: '#D95D39',
    chartColor: '#D95D39',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-400',
    textColor: 'text-amber-900',
    emoji: '🥖',
    description: 'Producto ancla ($5)'
  },
  tradicional: {
    key: 'tradicional',
    label: 'Pan Tradicional ($12)',
    shortLabel: 'Tradicional ($12)',
    targetPrice: 12,
    color: '#F59E0B',
    chartColor: '#F59E0B',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-400',
    textColor: 'text-orange-950',
    emoji: '🥐',
    description: 'Todo pan marcado en $12'
  },
  relleno: {
    key: 'relleno',
    label: 'Pan Relleno ($18)',
    shortLabel: 'Relleno ($18)',
    targetPrice: 18,
    color: '#8B5CF6',
    chartColor: '#8B5CF6',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-400',
    textColor: 'text-purple-950',
    emoji: '🥯',
    description: 'Todo pan marcado en $18'
  },
  especial: {
    key: 'especial',
    label: 'Pan Especial ($20)',
    shortLabel: 'Especial ($20)',
    targetPrice: 20,
    color: '#EC4899',
    chartColor: '#EC4899',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-400',
    textColor: 'text-pink-950',
    emoji: '⭐',
    description: 'Especialidades ($20)'
  },
  muerto_tradicional: {
    key: 'muerto_tradicional',
    label: 'Pan Especial ($25)',
    shortLabel: 'Especial ($25)',
    targetPrice: 25,
    color: '#F97316',
    chartColor: '#EA580C',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-500',
    textColor: 'text-amber-950',
    emoji: '🥐',
    description: 'Pan especial ($25)'
  },
  muerto_relleno: {
    key: 'muerto_relleno',
    label: 'Esfera / Especial ($35)',
    shortLabel: 'Esfera / Esp. ($35)',
    targetPrice: 35,
    color: '#10B981',
    chartColor: '#059669',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-400',
    textColor: 'text-emerald-950',
    emoji: '✨',
    description: 'Esfera o panqué especial ($35)'
  },
  rosca: {
    key: 'rosca',
    label: 'Roscas ($50)',
    shortLabel: 'Roscas ($50)',
    targetPrice: 50,
    color: '#B45309',
    chartColor: '#B45309',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-600',
    textColor: 'text-amber-950',
    emoji: '🥨',
    description: 'Roscas ($50)'
  },
  otros: {
    key: 'otros',
    label: 'Otros / No Pan',
    shortLabel: 'Otros',
    targetPrice: 0,
    color: '#64748B',
    chartColor: '#64748B',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-300',
    textColor: 'text-slate-800',
    emoji: '📦',
    description: 'Otros precios o no pan'
  }
};

/**
 * Parsea la hora de un ticket a formato 0..23 respetando AM / PM y formato 24h.
 */
export function parseTicketHour24(ticket: { time?: string; timestamp?: string }): number {
  const timeStr = (ticket.time || '').trim().toUpperCase();
  if (timeStr) {
    const clean = timeStr.replace(/[^0-9:]/g, '');
    const parts = clean.split(':');
    let h = parseInt(parts[0] || '', 10);
    if (!isNaN(h)) {
      if ((timeStr.includes('PM') || timeStr.includes('P.M.')) && h < 12) h += 12;
      if ((timeStr.includes('AM') || timeStr.includes('A.M.')) && h === 12) h = 0;
      if (h >= 0 && h <= 23) return h;
    }
  }
  if (ticket.timestamp) {
    const d = new Date(ticket.timestamp);
    if (!isNaN(d.getTime())) return d.getHours();
  }
  return 12;
}

/**
 * Clasifica un artículo según reglas estrictas homologadas:
 * - $5  -> Bolillo
 * - $12 -> Pan Tradicional (homologado)
 * - $18 -> Pan Relleno (homologado)
 * - $20 -> Especial
 * - $25 -> Pan de Muerto Tradicional
 * - $35 -> Pan de Muerto Relleno
 * - $50 o Rosca -> Roscas ($50)
 */
export function classifyBreadItem(price: number, name?: string, category?: string): BreadClassificationKey {
  if (isNonBreadProduct({ name, category })) {
    return 'otros';
  }

  const roundedPrice = Math.round(price || 0);
  const normName = (name || '').toLowerCase().trim();

  // 1. Reglas estrictas por precio exacto (prioridad absoluta para homologación)
  if (roundedPrice === 5) return 'bolillo';
  if (roundedPrice === 12) return 'tradicional';
  if (roundedPrice === 18) return 'relleno';
  if (roundedPrice === 20) return 'especial';
  if (roundedPrice === 25) return 'muerto_tradicional';
  if (roundedPrice === 35) return 'muerto_relleno';
  if (roundedPrice === 50) return 'rosca';

  // 2. Coincidencias por nombre
  if (normName.includes('rosca')) {
    return 'rosca';
  }
  if (normName.includes('bolillo') || normName.includes('telera') || normName.includes('birote')) {
    return 'bolillo';
  }
  if (normName.includes('muerto') && (normName.includes('rellen') || roundedPrice >= 30)) {
    return 'muerto_relleno';
  }
  if (normName.includes('muerto') || normName.includes('hojaldra')) {
    return 'muerto_tradicional';
  }
  if (normName.includes('rellen') || normName.includes('zarzamora')) {
    return 'relleno';
  }
  if (normName.includes('especial') || normName.includes('gourmet') || normName.includes('trenza') || normName.includes('danes')) {
    return 'especial';
  }
  if (
    normName.includes('tradicional') ||
    normName.includes('concha') ||
    normName.includes('cuerno') ||
    normName.includes('dona') ||
    normName.includes('oreja') ||
    normName.includes('rebanada') ||
    normName.includes('manteconcha') ||
    normName.includes('mantecada')
  ) {
    return 'tradicional';
  }

  return 'otros';
}

/**
 * Homologa los nombres de productos para gráficas y rankings:
 * - Todo lo de $12 -> "Pan Tradicional ($12)"
 * - Todo lo de $18 -> "Pan Relleno ($18)"
 * - Todo lo de $50 / Rosca -> "Roscas ($50)"
 * - Bolillo ($5) -> "Bolillo ($5)"
 */
export function homologateProductDisplay(item: {
  name?: string;
  price: number;
  category?: string;
}): {
  displayName: string;
  categoryKey: BreadClassificationKey;
  emoji: string;
  color: string;
  isBread: boolean;
} {
  if (isNonBreadProduct({ name: item.name, category: item.category })) {
    return {
      displayName: (item.name || 'Producto No Pan').trim(),
      categoryKey: 'otros',
      emoji: '📦',
      color: '#64748B',
      isBread: false
    };
  }

  const catKey = classifyBreadItem(item.price, item.name, item.category);
  const def = BREAD_CATEGORIES[catKey];

  if (catKey === 'bolillo') {
    return { displayName: 'Bolillo ($5)', categoryKey: 'bolillo', emoji: def.emoji, color: def.color, isBread: true };
  }
  if (catKey === 'tradicional') {
    return { displayName: 'Pan Tradicional ($12)', categoryKey: 'tradicional', emoji: def.emoji, color: def.color, isBread: true };
  }
  if (catKey === 'relleno') {
    return { displayName: 'Pan Relleno ($18)', categoryKey: 'relleno', emoji: def.emoji, color: def.color, isBread: true };
  }
  if (catKey === 'especial') {
    return { displayName: 'Pan Especial ($20)', categoryKey: 'especial', emoji: def.emoji, color: def.color, isBread: true };
  }
  if (catKey === 'muerto_tradicional') {
    return { displayName: 'Pan Especial ($25)', categoryKey: 'muerto_tradicional', emoji: def.emoji, color: def.color, isBread: true };
  }
  if (catKey === 'muerto_relleno') {
    const isEsfera = (item.name || '').toLowerCase().includes('esfera');
    return {
      displayName: isEsfera ? 'Esfera ($35)' : 'Pan Especial ($35)',
      categoryKey: 'muerto_relleno',
      emoji: def.emoji,
      color: def.color,
      isBread: true
    };
  }
  if (catKey === 'rosca') {
    return { displayName: 'Roscas ($50)', categoryKey: 'rosca', emoji: def.emoji, color: def.color, isBread: true };
  }

  const clean = (item.name || '').trim();
  return {
    displayName: clean || `Pan Varios ($${Math.round(item.price || 0)})`,
    categoryKey: 'otros',
    emoji: '📦',
    color: '#64748B',
    isBread: true
  };
}

export interface HourlyBolilloProduction {
  hour: number;
  label: string; // '07:00'
  rangeLabel: string; // '07:00 - 08:00'
  pieces: number;
  trays: number;
  fullTrays: number;
  percentage: number;
  isPeakHour: boolean;
  recommendedBakeTrays: number;
}

export interface HourlyAllSalesPoint {
  hour: number;
  label: string; // '07:00'
  shortLabel: string; // '07h'
  shift: 'manana' | 'noche';
  totalRevenue: number;
  avgDailyRevenue: number;
  totalPieces: number;
  avgDailyPieces: number;
  ticketsCount: number;
  percentageOfRevenue: number;
  isPeakHour: boolean;
}

export interface DayOfWeekBolilloStats {
  dayIndex: number; // 0 = Domingo, 1 = Lunes, ... 6 = Sábado
  dayName: string;
  dayShort: string;
  totalPieces: number;
  totalTrays: number;
  daysRecorded: number;
  avgPiecesPerDay: number;
  avgTraysPerDay: number;
  percentVsAverage: number;
  status: 'alto' | 'medio' | 'bajo';
  recommendation: string;
}

export interface DayOfWeekAllSalesStats {
  dayIndex: number;
  dayName: string;
  dayShort: string;
  daysRecorded: number;
  totalRevenue: number;
  avgRevenuePerDay: number;
  totalPieces: number;
  avgPiecesPerDay: number;
  morningRevenue: number;
  nightRevenue: number;
  morningAvgRevenue: number;
  nightAvgRevenue: number;
  percentVsAvgRevenue: number;
  status: 'alto' | 'medio' | 'bajo';
}

export interface CategorySummaryData {
  key: BreadClassificationKey;
  label: string;
  shortLabel: string;
  targetPrice: number;
  color: string;
  chartColor: string;
  emoji: string;
  totalPieces: number;
  totalRevenue: number;
  percentageOfPieces: number;
  percentageOfRevenue: number;
  dailyAvgPieces: number;
  dailyAvgRevenue: number;
  charolas?: number;
}

export interface ShiftBalanceMetrics {
  morning: {
    revenue: number;
    avgDailyRevenue: number;
    pieces: number;
    avgDailyPieces: number;
    pctRevenue: number;
    pctPieces: number;
    earlyOpeningPiecesAvg: number; // 06:00 - 10:59
    bolilloAvg: number;
    tradicionalAvg: number;
    rellenoAvg: number;
    roscaAvg: number;
  };
  night: {
    revenue: number;
    avgDailyRevenue: number;
    pieces: number;
    avgDailyPieces: number;
    pctRevenue: number;
    pctPieces: number;
    lateNightPiecesAvg: number; // 19:00 - 22:00
    bolilloAvg: number;
    tradicionalAvg: number;
    rellenoAvg: number;
    roscaAvg: number;
  };
  morningOpeningTarget: {
    totalPieces: number;
    bolilloPieces: number;
    tradicionalPieces: number;
    rellenoPieces: number;
    roscaPieces: number;
  };
}

export interface ProductionAnalyticsResult {
  totalTicketsAnalyzed: number;
  totalDaysAnalyzed: number;
  totalPiecesProduced: number;
  totalRevenue: number;
  dailyAvgRevenue: number;
  dailyAvgPieces: number;

  // Bolillo Específico
  bolillosPerTray: number;
  bolilloTotalPieces: number;
  bolilloTotalTrays: number;
  bolilloDailyAvgPieces: number;
  bolilloDailyAvgTrays: number;
  bolilloPeakHour: {
    hour: number;
    label: string;
    pieces: number;
    trays: number;
  } | null;
  strongestDay: DayOfWeekBolilloStats | null;
  lowestDay: DayOfWeekBolilloStats | null;

  // Venta Global para Decisiones (Todos los productos)
  dayOfWeekAllSales: DayOfWeekAllSalesStats[];
  strongestSalesDay: DayOfWeekAllSalesStats | null;
  lowestSalesDay: DayOfWeekAllSalesStats | null;
  hourlyAllSales: HourlyAllSalesPoint[];
  peakHoursTop3: HourlyAllSalesPoint[];
  peakMorningHour: HourlyAllSalesPoint | null;
  peakNightHour: HourlyAllSalesPoint | null;
  bestCalendarDay: { date: string; dateFormatted: string; dayName: string; totalSales: number; totalPieces: number } | null;
  worstCalendarDay: { date: string; dateFormatted: string; dayName: string; totalSales: number; totalPieces: number } | null;
  shiftBalance: ShiftBalanceMetrics;

  // Colecciones estructuradas
  categoryTotals: Record<BreadClassificationKey, CategorySummaryData>;
  categoryList: CategorySummaryData[];
  hourlyBolillo: HourlyBolilloProduction[];
  dayOfWeekStats: DayOfWeekBolilloStats[];
  dailyTimeline: Array<{
    date: string;
    dateFormatted: string;
    dayName: string;
    bolilloPieces: number;
    bolilloTrays: number;
    tradicionalPieces: number;
    rellenoPieces: number;
    especialPieces: number;
    muertoPieces: number;
    muertoRellenoPieces: number;
    roscaPieces: number;
    otrosPieces: number;
    totalPieces: number;
    totalSales: number;
  }>;

  // Turnos
  shiftBreakdown: {
    turno1: {
      bolilloPieces: number;
      bolilloTrays: number;
      totalPieces: number;
      totalSales: number;
    };
    turno2: {
      bolilloPieces: number;
      bolilloTrays: number;
      totalPieces: number;
      totalSales: number;
    };
  };

  // Planificador de producción
  productionRecommendation: {
    suggestedDailyBolilloPieces: number;
    suggestedDailyBolilloTrays: number;
    turno1BolilloTrays: number;
    turno2BolilloTrays: number;
    bakingBatches: Array<{
      time: string;
      label: string;
      suggestedTrays: number;
      notes: string;
    }>;
  };
}

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORTS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Calcula las estadísticas de producción y ventas analizando todos los tickets filtrados
 */
export function calculateProductionStats(
  tickets: Array<{
    id: string;
    date: string;
    time?: string;
    timestamp?: string;
    items: Array<{ price: number; quantity: number; name?: string; total?: number; category?: string }>;
    total: number;
  }>,
  bolillosPerTray: number = 12
): ProductionAnalyticsResult {
  const safePerTray = Math.max(1, bolillosPerTray || 12);

  // Inicializar contadores por categoría
  const categoryCounts: Record<BreadClassificationKey, { pieces: number; revenue: number }> = {
    bolillo: { pieces: 0, revenue: 0 },
    tradicional: { pieces: 0, revenue: 0 },
    relleno: { pieces: 0, revenue: 0 },
    especial: { pieces: 0, revenue: 0 },
    muerto_tradicional: { pieces: 0, revenue: 0 },
    muerto_relleno: { pieces: 0, revenue: 0 },
    rosca: { pieces: 0, revenue: 0 },
    otros: { pieces: 0, revenue: 0 }
  };

  // Agrupadores por hora (06 a 22)
  const hourlyBolilloMap: Record<number, number> = {};
  const hourlyAllMap: Record<number, { revenue: number; pieces: number; tickets: number }> = {};
  for (let h = 6; h <= 22; h++) {
    hourlyBolilloMap[h] = 0;
    hourlyAllMap[h] = { revenue: 0, pieces: 0, tickets: 0 };
  }

  // Agrupador por día de la semana (0 = Dom, ... 6 = Sáb)
  const dayOfWeekPiecesMap: Record<number, { pieces: number; daysSet: Set<string> }> = {};
  const dayOfWeekAllMap: Record<number, {
    revenue: number;
    pieces: number;
    morningRevenue: number;
    nightRevenue: number;
    daysSet: Set<string>;
  }> = {};
  for (let d = 0; d < 7; d++) {
    dayOfWeekPiecesMap[d] = { pieces: 0, daysSet: new Set<string>() };
    dayOfWeekAllMap[d] = { revenue: 0, pieces: 0, morningRevenue: 0, nightRevenue: 0, daysSet: new Set<string>() };
  }

  // Agrupador por fecha (YYYY-MM-DD)
  const dailyMap: Record<string, {
    date: string;
    bolillo: number;
    tradicional: number;
    relleno: number;
    especial: number;
    muerto: number;
    muertoRelleno: number;
    rosca: number;
    otros: number;
    totalPieces: number;
    totalSales: number;
  }> = {};

  // Turnos + balance detalle para evitar amanecer vacío
  const shifts = {
    turno1: {
      bolilloPieces: 0,
      tradicionalPieces: 0,
      rellenoPieces: 0,
      roscaPieces: 0,
      earlyOpeningPieces: 0,
      totalPieces: 0,
      totalSales: 0
    },
    turno2: {
      bolilloPieces: 0,
      tradicionalPieces: 0,
      rellenoPieces: 0,
      roscaPieces: 0,
      lateNightPieces: 0,
      totalPieces: 0,
      totalSales: 0
    }
  };

  const uniqueDays = new Set<string>();

  // Procesar tickets
  for (const ticket of tickets) {
    if (!ticket) continue;

    const tDate = (ticket.date || (ticket.timestamp ? ticket.timestamp.split('T')[0] : '')).trim();
    if (tDate) uniqueDays.add(tDate);

    // Extraer hora real 0..23 respetando AM/PM
    const hour = parseTicketHour24(ticket);
    const hKey = Math.min(22, Math.max(6, hour));

    // Día de la semana (0 a 6)
    let dayOfWeek = 1;
    if (tDate) {
      const [year, month, day] = tDate.split('-').map(n => parseInt(n, 10));
      if (year && month && day) {
        const dObj = new Date(year, month - 1, day);
        if (!isNaN(dObj.getTime())) dayOfWeek = dObj.getDay();
      }
    }

    if (tDate && !dailyMap[tDate]) {
      dailyMap[tDate] = {
        date: tDate,
        bolillo: 0,
        tradicional: 0,
        relleno: 0,
        especial: 0,
        muerto: 0,
        muertoRelleno: 0,
        rosca: 0,
        otros: 0,
        totalPieces: 0,
        totalSales: 0
      };
    }

    const isTurno1 = hour < 15;
    let ticketTotalPieces = 0;

    // Procesar cada ítem del ticket
    for (const item of ticket.items || []) {
      const qty = Math.max(0, item.quantity || 0);
      if (qty <= 0) continue;

      const itemPrice = item.price || (qty > 0 ? (item.total || 0) / qty : 0);
      const cat = classifyBreadItem(itemPrice, item.name, item.category);
      const lineRevenue = item.total != null ? item.total : itemPrice * qty;

      categoryCounts[cat].pieces += qty;
      categoryCounts[cat].revenue += lineRevenue;
      ticketTotalPieces += qty;

      if (cat === 'bolillo') {
        hourlyBolilloMap[hKey] = (hourlyBolilloMap[hKey] || 0) + qty;

        if (dayOfWeekPiecesMap[dayOfWeek]) {
          dayOfWeekPiecesMap[dayOfWeek].pieces += qty;
          if (tDate) dayOfWeekPiecesMap[dayOfWeek].daysSet.add(tDate);
        }

        if (tDate && dailyMap[tDate]) dailyMap[tDate].bolillo += qty;

        if (isTurno1) shifts.turno1.bolilloPieces += qty;
        else shifts.turno2.bolilloPieces += qty;
      } else if (cat === 'tradicional') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].tradicional += qty;
        if (isTurno1) shifts.turno1.tradicionalPieces += qty;
        else shifts.turno2.tradicionalPieces += qty;
      } else if (cat === 'relleno') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].relleno += qty;
        if (isTurno1) shifts.turno1.rellenoPieces += qty;
        else shifts.turno2.rellenoPieces += qty;
      } else if (cat === 'especial') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].especial += qty;
      } else if (cat === 'muerto_tradicional') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].muerto += qty;
      } else if (cat === 'muerto_relleno') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].muertoRelleno += qty;
      } else if (cat === 'rosca') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].rosca += qty;
        if (isTurno1) shifts.turno1.roscaPieces += qty;
        else shifts.turno2.roscaPieces += qty;
      } else {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].otros += qty;
      }
    }

    const ticketRev = Number(ticket.total) || 0;

    // Acumular hora global
    hourlyAllMap[hKey].revenue += ticketRev;
    hourlyAllMap[hKey].pieces += ticketTotalPieces;
    hourlyAllMap[hKey].tickets += 1;

    // Acumular día de semana global
    if (dayOfWeekAllMap[dayOfWeek]) {
      dayOfWeekAllMap[dayOfWeek].revenue += ticketRev;
      dayOfWeekAllMap[dayOfWeek].pieces += ticketTotalPieces;
      if (isTurno1) dayOfWeekAllMap[dayOfWeek].morningRevenue += ticketRev;
      else dayOfWeekAllMap[dayOfWeek].nightRevenue += ticketRev;
      if (tDate) dayOfWeekAllMap[dayOfWeek].daysSet.add(tDate);
    }

    if (tDate && dailyMap[tDate]) {
      dailyMap[tDate].totalPieces += ticketTotalPieces;
      dailyMap[tDate].totalSales += ticketRev;
    }

    if (isTurno1) {
      shifts.turno1.totalPieces += ticketTotalPieces;
      shifts.turno1.totalSales += ticketRev;
      if (hour <= 10) shifts.turno1.earlyOpeningPieces += ticketTotalPieces;
    } else {
      shifts.turno2.totalPieces += ticketTotalPieces;
      shifts.turno2.totalSales += ticketRev;
      if (hour >= 19) shifts.turno2.lateNightPieces += ticketTotalPieces;
    }
  }

  const totalDays = Math.max(1, uniqueDays.size);
  const totalTickets = tickets.length;

  let totalPiecesProduced = 0;
  let totalRevenue = 0;
  for (const catKey of Object.keys(categoryCounts) as BreadClassificationKey[]) {
    totalPiecesProduced += categoryCounts[catKey].pieces;
    totalRevenue += categoryCounts[catKey].revenue;
  }
  const ticketSumRevenue = shifts.turno1.totalSales + shifts.turno2.totalSales;
  const effectiveTotalRevenue = ticketSumRevenue > 0 ? ticketSumRevenue : totalRevenue;
  const dailyAvgRevenue = Math.round(effectiveTotalRevenue / totalDays);
  const dailyAvgPieces = Math.round(totalPiecesProduced / totalDays);

  // Desglose por categorías con porcentajes y promedio diario
  const categoryTotals = {} as Record<BreadClassificationKey, CategorySummaryData>;
  const categoryList: CategorySummaryData[] = [];

  for (const catKey of Object.keys(BREAD_CATEGORIES) as BreadClassificationKey[]) {
    const def = BREAD_CATEGORIES[catKey];
    const pieces = categoryCounts[catKey].pieces;
    const rev = categoryCounts[catKey].revenue;
    const pctPieces = totalPiecesProduced > 0 ? (pieces / totalPiecesProduced) * 100 : 0;
    const pctRev = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
    const dailyAvgPcs = totalDays > 0 ? Math.round(pieces / totalDays) : pieces;
    const dailyAvgRev = totalDays > 0 ? Math.round(rev / totalDays) : Math.round(rev);

    const data: CategorySummaryData = {
      key: catKey,
      label: def.label,
      shortLabel: def.shortLabel,
      targetPrice: def.targetPrice,
      color: def.color,
      chartColor: def.chartColor,
      emoji: def.emoji,
      totalPieces: pieces,
      totalRevenue: rev,
      percentageOfPieces: Math.round(pctPieces * 10) / 10,
      percentageOfRevenue: Math.round(pctRev * 10) / 10,
      dailyAvgPieces: dailyAvgPcs,
      dailyAvgRevenue: dailyAvgRev,
      charolas: catKey === 'bolillo' ? Math.round((pieces / safePerTray) * 10) / 10 : undefined
    };

    categoryTotals[catKey] = data;
    categoryList.push(data);
  }

  categoryList.sort((a, b) => b.totalRevenue - a.totalRevenue || b.totalPieces - a.totalPieces);

  const bolilloPieces = categoryCounts.bolillo.pieces;
  const bolilloTotalTrays = Math.round((bolilloPieces / safePerTray) * 10) / 10;
  const bolilloDailyAvgPieces = totalDays > 0 ? Math.round(bolilloPieces / totalDays) : bolilloPieces;
  const bolilloDailyAvgTrays = Math.round((bolilloDailyAvgPieces / safePerTray) * 10) / 10;

  // Desglose horario de Bolillo (06:00 a 22:00)
  let maxHourlyBolillo = 0;
  let peakHourNum = 7;
  for (let h = 6; h <= 22; h++) {
    if ((hourlyBolilloMap[h] || 0) > maxHourlyBolillo) {
      maxHourlyBolillo = hourlyBolilloMap[h];
      peakHourNum = h;
    }
  }

  const hourlyBolillo: HourlyBolilloProduction[] = [];
  for (let h = 6; h <= 22; h++) {
    const pcs = hourlyBolilloMap[h] || 0;
    const traysDecimal = Math.round((pcs / safePerTray) * 10) / 10;
    const fullTrays = Math.ceil(pcs / safePerTray);
    const pct = bolilloPieces > 0 ? Math.round((pcs / bolilloPieces) * 1000) / 10 : 0;
    const isPeak = pcs > 0 && pcs >= maxHourlyBolillo * 0.75;
    const recommendedBake = isPeak ? Math.max(2, Math.ceil(fullTrays * 1.1)) : Math.max(1, fullTrays);

    hourlyBolillo.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      rangeLabel: `${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00`,
      pieces: pcs,
      trays: traysDecimal,
      fullTrays,
      percentage: pct,
      isPeakHour: isPeak,
      recommendedBakeTrays: recommendedBake
    });
  }

  const bolilloPeakHour = maxHourlyBolillo > 0 ? {
    hour: peakHourNum,
    label: `${String(peakHourNum).padStart(2, '0')}:00`,
    pieces: maxHourlyBolillo,
    trays: Math.round((maxHourlyBolillo / safePerTray) * 10) / 10
  } : null;

  // Desglose horario GLOBAL (Todos los productos)
  let maxHourlyRevenue = 0;
  for (let h = 6; h <= 22; h++) {
    if (hourlyAllMap[h].revenue > maxHourlyRevenue) {
      maxHourlyRevenue = hourlyAllMap[h].revenue;
    }
  }

  const hourlyAllSales: HourlyAllSalesPoint[] = [];
  for (let h = 6; h <= 22; h++) {
    const entry = hourlyAllMap[h];
    const pctRev = effectiveTotalRevenue > 0 ? Math.round((entry.revenue / effectiveTotalRevenue) * 1000) / 10 : 0;
    hourlyAllSales.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      shortLabel: `${String(h).padStart(2, '0')}h`,
      shift: h < 15 ? 'manana' : 'noche',
      totalRevenue: Math.round(entry.revenue),
      avgDailyRevenue: Math.round(entry.revenue / totalDays),
      totalPieces: entry.pieces,
      avgDailyPieces: Math.round(entry.pieces / totalDays),
      ticketsCount: entry.tickets,
      percentageOfRevenue: pctRev,
      isPeakHour: entry.revenue > 0 && entry.revenue >= maxHourlyRevenue * 0.72
    });
  }

  const activeHoursSorted = [...hourlyAllSales]
    .filter(h => h.totalRevenue > 0 || h.totalPieces > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue || b.totalPieces - a.totalPieces);
  const peakHoursTop3 = activeHoursSorted.slice(0, 3);
  const peakMorningHour = [...hourlyAllSales]
    .filter(h => h.shift === 'manana' && (h.totalRevenue > 0 || h.totalPieces > 0))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)[0] || null;
  const peakNightHour = [...hourlyAllSales]
    .filter(h => h.shift === 'noche' && (h.totalRevenue > 0 || h.totalPieces > 0))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)[0] || null;

  // Desglose por día de la semana (Bolillo)
  let totalWeekBolillo = 0;
  for (let d = 0; d < 7; d++) {
    totalWeekBolillo += dayOfWeekPiecesMap[d].pieces;
  }
  const avgPerWeekDay = totalWeekBolillo / 7;
  const orderedDayIndices = [1, 2, 3, 4, 5, 6, 0];

  const dayOfWeekStats: DayOfWeekBolilloStats[] = orderedDayIndices.map(dayIdx => {
    const item = dayOfWeekPiecesMap[dayIdx];
    const daysRec = Math.max(1, item.daysSet.size);
    const avgPieces = Math.round(item.pieces / daysRec);
    const avgTrays = Math.round((avgPieces / safePerTray) * 10) / 10;
    const totalTrays = Math.round((item.pieces / safePerTray) * 10) / 10;

    let percentVsAverage = 0;
    if (avgPerWeekDay > 0) {
      percentVsAverage = Math.round(((avgPieces - avgPerWeekDay) / avgPerWeekDay) * 100);
    }

    let status: 'alto' | 'medio' | 'bajo' = 'medio';
    let recommendation = `Estándar (~${avgTrays} ch)`;
    if (percentVsAverage >= 15) {
      status = 'alto';
      recommendation = `+${percentVsAverage}% Día Fuerte`;
    } else if (percentVsAverage <= -15) {
      status = 'bajo';
      recommendation = `${percentVsAverage}% Día Bajo`;
    }

    return {
      dayIndex: dayIdx,
      dayName: DAY_NAMES_ES[dayIdx],
      dayShort: DAY_SHORTS_ES[dayIdx],
      totalPieces: item.pieces,
      totalTrays,
      daysRecorded: item.daysSet.size,
      avgPiecesPerDay: avgPieces,
      avgTraysPerDay: avgTrays,
      percentVsAverage,
      status,
      recommendation
    };
  });

  const sortedDays = [...dayOfWeekStats].filter(d => d.totalPieces > 0).sort((a, b) => b.avgPiecesPerDay - a.avgPiecesPerDay);
  const strongestDay = sortedDays.length > 0 ? sortedDays[0] : null;
  const lowestDay = sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : null;

  // Desglose por día de la semana GLOBAL (Todos los productos en $ y piezas)
  const activeWeekdayBuckets = orderedDayIndices
    .map(idx => {
      const e = dayOfWeekAllMap[idx];
      const rec = e.daysSet.size;
      return rec > 0 ? e.revenue / rec : 0;
    })
    .filter(v => v > 0);
  const avgWeekdayRev = activeWeekdayBuckets.length > 0
    ? activeWeekdayBuckets.reduce((s, v) => s + v, 0) / activeWeekdayBuckets.length
    : 0;

  const dayOfWeekAllSalesTemp: DayOfWeekAllSalesStats[] = orderedDayIndices.map(dayIdx => {
    const e = dayOfWeekAllMap[dayIdx];
    const daysRec = e.daysSet.size;
    const avgRev = daysRec > 0 ? Math.round(e.revenue / daysRec) : 0;
    const avgPcs = daysRec > 0 ? Math.round(e.pieces / daysRec) : 0;
    const morningAvg = daysRec > 0 ? Math.round(e.morningRevenue / daysRec) : 0;
    const nightAvg = daysRec > 0 ? Math.round(e.nightRevenue / daysRec) : 0;
    const pctVsAvg = avgWeekdayRev > 0 && daysRec > 0
      ? Math.round(((avgRev - avgWeekdayRev) / avgWeekdayRev) * 100)
      : 0;

    return {
      dayIndex: dayIdx,
      dayName: DAY_NAMES_ES[dayIdx],
      dayShort: DAY_SHORTS_ES[dayIdx],
      daysRecorded: daysRec,
      totalRevenue: Math.round(e.revenue),
      avgRevenuePerDay: avgRev,
      totalPieces: e.pieces,
      avgPiecesPerDay: avgPcs,
      morningRevenue: Math.round(e.morningRevenue),
      nightRevenue: Math.round(e.nightRevenue),
      morningAvgRevenue: morningAvg,
      nightAvgRevenue: nightAvg,
      percentVsAvgRevenue: pctVsAvg,
      status: 'medio'
    };
  });

  const activeSalesDays = dayOfWeekAllSalesTemp
    .filter(d => d.daysRecorded > 0 && d.totalRevenue > 0)
    .sort((a, b) => b.avgRevenuePerDay - a.avgRevenuePerDay);
  const strongestSalesDay = activeSalesDays[0] || null;
  const lowestSalesDay = activeSalesDays.length > 0 ? activeSalesDays[activeSalesDays.length - 1] : null;

  const dayOfWeekAllSales: DayOfWeekAllSalesStats[] = dayOfWeekAllSalesTemp.map(d => {
    let status: 'alto' | 'medio' | 'bajo' = 'medio';
    if (strongestSalesDay && d.dayIndex === strongestSalesDay.dayIndex && d.totalRevenue > 0) {
      status = 'alto';
    } else if (lowestSalesDay && d.dayIndex === lowestSalesDay.dayIndex && activeSalesDays.length > 1) {
      status = 'bajo';
    } else if (d.percentVsAvgRevenue >= 12) {
      status = 'alto';
    } else if (d.percentVsAvgRevenue <= -12 && d.daysRecorded > 0) {
      status = 'bajo';
    }
    return { ...d, status };
  });

  // Línea de tiempo diaria
  const dailyTimeline = Object.keys(dailyMap).sort().map(dKey => {
    const val = dailyMap[dKey];
    let dayName = '';
    const [y, m, d] = dKey.split('-').map(n => parseInt(n, 10));
    if (y && m && d) {
      const dt = new Date(y, m - 1, d);
      if (!isNaN(dt.getTime())) {
        dayName = DAY_SHORTS_ES[dt.getDay()];
      }
    }

    return {
      date: dKey,
      dateFormatted: `${dKey.slice(8, 10)}/${dKey.slice(5, 7)}`,
      dayName,
      bolilloPieces: val.bolillo,
      bolilloTrays: Math.round((val.bolillo / safePerTray) * 10) / 10,
      tradicionalPieces: val.tradicional,
      rellenoPieces: val.relleno,
      especialPieces: val.especial,
      muertoPieces: val.muerto,
      muertoRellenoPieces: val.muertoRelleno,
      roscaPieces: val.rosca,
      otrosPieces: val.otros,
      totalPieces: val.totalPieces,
      totalSales: Math.round(val.totalSales)
    };
  });

  const nonZeroCalendarDays = dailyTimeline.filter(d => d.totalSales > 0);
  const bestCal = nonZeroCalendarDays.reduce(
    (best, cur) => (!best || cur.totalSales > best.totalSales ? cur : best),
    nonZeroCalendarDays[0] || null
  );
  const worstCal = nonZeroCalendarDays.reduce(
    (low, cur) => (!low || cur.totalSales < low.totalSales ? cur : low),
    nonZeroCalendarDays[0] || null
  );

  // Desglose de turnos
  const shiftBreakdown = {
    turno1: {
      bolilloPieces: shifts.turno1.bolilloPieces,
      bolilloTrays: Math.round((shifts.turno1.bolilloPieces / safePerTray) * 10) / 10,
      totalPieces: shifts.turno1.totalPieces,
      totalSales: Math.round(shifts.turno1.totalSales)
    },
    turno2: {
      bolilloPieces: shifts.turno2.bolilloPieces,
      bolilloTrays: Math.round((shifts.turno2.bolilloPieces / safePerTray) * 10) / 10,
      totalPieces: shifts.turno2.totalPieces,
      totalSales: Math.round(shifts.turno2.totalSales)
    }
  };

  // Balance Mañana vs Noche + Reserva para no amanecer vacío
  const t1PctRev = effectiveTotalRevenue > 0 ? Math.round((shifts.turno1.totalSales / effectiveTotalRevenue) * 100) : 0;
  const t2PctRev = effectiveTotalRevenue > 0 ? Math.max(0, 100 - t1PctRev) : 0;
  const t1PctPcs = totalPiecesProduced > 0 ? Math.round((shifts.turno1.totalPieces / totalPiecesProduced) * 100) : 0;
  const t2PctPcs = totalPiecesProduced > 0 ? Math.max(0, 100 - t1PctPcs) : 0;

  const morningBolilloAvg = Math.round(shifts.turno1.bolilloPieces / totalDays);
  const morningTradAvg = Math.round(shifts.turno1.tradicionalPieces / totalDays);
  const morningRellenoAvg = Math.round(shifts.turno1.rellenoPieces / totalDays);
  const morningRoscaAvg = Math.round(shifts.turno1.roscaPieces / totalDays);
  const morningTotalAvgPcs = Math.round(shifts.turno1.totalPieces / totalDays);

  // Colchón +15% sobre el promedio de mañana para garantizar stock al abrir a las 07:00
  const bufferFactor = 1.15;
  const targetBolillo = Math.ceil(morningBolilloAvg * bufferFactor);
  const targetTrad = Math.ceil(morningTradAvg * bufferFactor);
  const targetRelleno = Math.ceil(morningRellenoAvg * bufferFactor);
  const targetRosca = Math.ceil(morningRoscaAvg * bufferFactor);
  const targetTotalMorning = Math.max(
    Math.ceil(morningTotalAvgPcs * bufferFactor),
    targetBolillo + targetTrad + targetRelleno + targetRosca
  );

  const shiftBalance: ShiftBalanceMetrics = {
    morning: {
      revenue: Math.round(shifts.turno1.totalSales),
      avgDailyRevenue: Math.round(shifts.turno1.totalSales / totalDays),
      pieces: shifts.turno1.totalPieces,
      avgDailyPieces: morningTotalAvgPcs,
      pctRevenue: t1PctRev,
      pctPieces: t1PctPcs,
      earlyOpeningPiecesAvg: Math.round(shifts.turno1.earlyOpeningPieces / totalDays),
      bolilloAvg: morningBolilloAvg,
      tradicionalAvg: morningTradAvg,
      rellenoAvg: morningRellenoAvg,
      roscaAvg: morningRoscaAvg
    },
    night: {
      revenue: Math.round(shifts.turno2.totalSales),
      avgDailyRevenue: Math.round(shifts.turno2.totalSales / totalDays),
      pieces: shifts.turno2.totalPieces,
      avgDailyPieces: Math.round(shifts.turno2.totalPieces / totalDays),
      pctRevenue: t2PctRev,
      pctPieces: t2PctPcs,
      lateNightPiecesAvg: Math.round(shifts.turno2.lateNightPieces / totalDays),
      bolilloAvg: Math.round(shifts.turno2.bolilloPieces / totalDays),
      tradicionalAvg: Math.round(shifts.turno2.tradicionalPieces / totalDays),
      rellenoAvg: Math.round(shifts.turno2.rellenoPieces / totalDays),
      roscaAvg: Math.round(shifts.turno2.roscaPieces / totalDays)
    },
    morningOpeningTarget: {
      totalPieces: targetTotalMorning,
      bolilloPieces: targetBolillo,
      tradicionalPieces: targetTrad,
      rellenoPieces: targetRelleno,
      roscaPieces: targetRosca
    }
  };

  // Planificador de Producción de Bolillo Recomendado
  const suggestedDailyBolilloPieces = bolilloDailyAvgPieces > 0 ? bolilloDailyAvgPieces : 300;
  const suggestedDailyBolilloTrays = Math.ceil(suggestedDailyBolilloPieces / safePerTray);
  const t1Trays = Math.ceil(suggestedDailyBolilloTrays * 0.55);
  const t2Trays = Math.max(1, suggestedDailyBolilloTrays - t1Trays);

  const bakingBatches = [
    {
      time: '06:30 AM',
      label: 'Tanda 1 (Apertura)',
      suggestedTrays: Math.ceil(t1Trays * 0.6),
      notes: 'Cubre 07:00 a 10:00 hrs'
    },
    {
      time: '10:30 AM',
      label: 'Tanda 2 (Mediodía)',
      suggestedTrays: Math.max(1, t1Trays - Math.ceil(t1Trays * 0.6)),
      notes: 'Cubre 11:00 a 14:30 hrs'
    },
    {
      time: '16:00 PM',
      label: 'Tanda 3 (Tarde)',
      suggestedTrays: Math.ceil(t2Trays * 0.5),
      notes: 'Cubre 16:00 a 18:30 hrs'
    },
    {
      time: '18:30 PM',
      label: 'Tanda 4 (Pico Noche)',
      suggestedTrays: Math.max(1, t2Trays - Math.ceil(t2Trays * 0.5)),
      notes: 'Cubre 19:00 a 22:00 hrs'
    }
  ];

  return {
    totalTicketsAnalyzed: totalTickets,
    totalDaysAnalyzed: totalDays,
    totalPiecesProduced,
    totalRevenue: Math.round(effectiveTotalRevenue),
    dailyAvgRevenue,
    dailyAvgPieces,
    bolillosPerTray: safePerTray,
    bolilloTotalPieces: bolilloPieces,
    bolilloTotalTrays,
    bolilloDailyAvgPieces,
    bolilloDailyAvgTrays,
    bolilloPeakHour,
    strongestDay,
    lowestDay,
    dayOfWeekAllSales,
    strongestSalesDay,
    lowestSalesDay,
    hourlyAllSales,
    peakHoursTop3,
    peakMorningHour,
    peakNightHour,
    bestCalendarDay: bestCal ? {
      date: bestCal.date,
      dateFormatted: bestCal.dateFormatted,
      dayName: bestCal.dayName,
      totalSales: bestCal.totalSales,
      totalPieces: bestCal.totalPieces
    } : null,
    worstCalendarDay: worstCal ? {
      date: worstCal.date,
      dateFormatted: worstCal.dateFormatted,
      dayName: worstCal.dayName,
      totalSales: worstCal.totalSales,
      totalPieces: worstCal.totalPieces
    } : null,
    shiftBalance,
    categoryTotals,
    categoryList,
    hourlyBolillo,
    dayOfWeekStats,
    dailyTimeline,
    shiftBreakdown,
    productionRecommendation: {
      suggestedDailyBolilloPieces,
      suggestedDailyBolilloTrays,
      turno1BolilloTrays: t1Trays,
      turno2BolilloTrays: t2Trays,
      bakingBatches
    }
  };
}

/**
 * Genera una semana de tickets de ejemplo realistas para una panadería tradicional mexicana.
 */
export function generateSampleWeekTickets(referenceDate: string): any[] {
  const sampleTickets: any[] = [];
  const [y, m, d] = referenceDate.split('-').map(n => parseInt(n, 10));
  const refDateObj = new Date(y, m - 1, d);

  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const dt = new Date(refDateObj);
    dt.setDate(dt.getDate() - dayOffset);
    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yr}-${mo}-${da}`;
    const dayOfWeek = dt.getDay();

    const multiplier = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) ? 1.25 : 0.9;
    const ticketsCount = Math.round(28 * multiplier);

    for (let i = 0; i < ticketsCount; i++) {
      const isMorning = Math.random() < 0.48;
      const hour = isMorning
        ? 7 + Math.floor(Math.random() * 5)
        : 16 + Math.floor(Math.random() * 5);
      const minute = String(Math.floor(Math.random() * 60)).padStart(2, '0');
      const timeStr = `${String(hour).padStart(2, '0')}:${minute}`;

      const items: Array<{ id: string; name: string; price: number; quantity: number; total: number }> = [];

      if (Math.random() < 0.85) {
        const qty = Math.floor(Math.random() * 10) + 4;
        items.push({ id: `bol-${dayOffset}-${i}`, name: 'Bolillo $5', price: 5, quantity: qty, total: qty * 5 });
      }
      if (Math.random() < 0.72) {
        const qty = Math.floor(Math.random() * 5) + 2;
        items.push({ id: `trad-${dayOffset}-${i}`, name: 'Pan Tradicional $12', price: 12, quantity: qty, total: qty * 12 });
      }
      if (Math.random() < 0.42) {
        const qty = Math.floor(Math.random() * 3) + 1;
        items.push({ id: `rel-${dayOffset}-${i}`, name: 'Pan Relleno $18', price: 18, quantity: qty, total: qty * 18 });
      }
      if (Math.random() < 0.18) {
        const qty = 1;
        items.push({ id: `rosca-${dayOffset}-${i}`, name: 'Rosca $50', price: 50, quantity: qty, total: qty * 50 });
      }

      if (items.length > 0) {
        const total = items.reduce((sum, item) => sum + item.total, 0);
        sampleTickets.push({
          id: `sim-${dayOffset}-${i}`,
          folio: `SIM-${dayOffset}-${i + 1}`,
          timestamp: `${dateStr}T${timeStr}:00.000Z`,
          date: dateStr,
          time: timeStr,
          items,
          subtotal: total,
          discount: 0,
          total,
          paymentMethod: 'efectivo',
          amountPaid: total,
          change: 0,
          pointsEarned: 0,
          pointsRedeemed: 0,
          cashier: 'Mostrador Panadería'
        });
      }
    }
  }

  return sampleTickets;
}
