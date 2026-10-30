export type BreadClassificationKey =
  | 'bolillo'
  | 'tradicional'
  | 'relleno'
  | 'especial'
  | 'muerto_tradicional'
  | 'muerto_relleno'
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
    shortLabel: 'Bolillo',
    targetPrice: 5,
    color: '#D95D39',
    chartColor: '#D95D39',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-400',
    textColor: 'text-amber-900',
    emoji: '🥖',
    description: 'Producto ancla de la panadería. Se mide y hornea por charolas.'
  },
  tradicional: {
    key: 'tradicional',
    label: 'Pan Tradicional ($12)',
    shortLabel: 'Tradicional',
    targetPrice: 12,
    color: '#F59E0B',
    chartColor: '#F59E0B',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-400',
    textColor: 'text-orange-950',
    emoji: '🥐',
    description: 'Conchas, cuernos, donas, orejas, mantecadas y piezas clásicas.'
  },
  relleno: {
    key: 'relleno',
    label: 'Pan de Relleno ($18)',
    shortLabel: 'Con Relleno',
    targetPrice: 18,
    color: '#8B5CF6',
    chartColor: '#8B5CF6',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-400',
    textColor: 'text-purple-950',
    emoji: '🥯',
    description: 'Rellenos de queso con zarzamora, crema pastelera, chocolate, cajeta.'
  },
  especial: {
    key: 'especial',
    label: 'Pan Especial ($20)',
    shortLabel: 'Especial',
    targetPrice: 20,
    color: '#EC4899',
    chartColor: '#EC4899',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-400',
    textColor: 'text-pink-950',
    emoji: '⭐',
    description: 'Especialidades finas, danés premium, trenzas y recetas gourmet.'
  },
  muerto_tradicional: {
    key: 'muerto_tradicional',
    label: 'Pan de Muerto ($25)',
    shortLabel: 'P. Muerto',
    targetPrice: 25,
    color: '#F97316',
    chartColor: '#EA580C',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-500',
    textColor: 'text-amber-950',
    emoji: '💀',
    description: 'Pan de muerto tradicional con azúcar o ajonjolí y esencia de azahar.'
  },
  muerto_relleno: {
    key: 'muerto_relleno',
    label: 'P. Muerto Relleno ($35)',
    shortLabel: 'Muerto Relleno',
    targetPrice: 35,
    color: '#10B981',
    chartColor: '#059669',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-400',
    textColor: 'text-emerald-950',
    emoji: '🍫',
    description: 'Pan de muerto relleno con nata, crema chantilly, nutella o zarzamora.'
  },
  otros: {
    key: 'otros',
    label: 'Otros Productos',
    shortLabel: 'Otros',
    targetPrice: 0,
    color: '#64748B',
    chartColor: '#64748B',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-300',
    textColor: 'text-slate-800',
    emoji: '📦',
    description: 'Otros precios, galletas, pastelería o productos no pan (leche, etc.)'
  }
};

/**
 * Clasifica un artículo según las reglas estrictas de precio dadas por el usuario:
 * - $5  -> Bolillo
 * - $12 -> Pan Tradicional
 * - $18 -> Pan de Relleno
 * - $20 -> Especial
 * - $25 -> Pan de Muerto Tradicional
 * - $35 -> Pan de Muerto Relleno
 * Con fallback por nombre si el precio difiere ligeramente o viene de encargos.
 */
export function classifyBreadItem(price: number, name?: string): BreadClassificationKey {
  const roundedPrice = Math.round(price);
  const normName = (name || '').toLowerCase();

  // 1. Reglas estrictas por precio exacto
  if (roundedPrice === 5) return 'bolillo';
  if (roundedPrice === 12) return 'tradicional';
  if (roundedPrice === 18) return 'relleno';
  if (roundedPrice === 20) return 'especial';
  if (roundedPrice === 25) return 'muerto_tradicional';
  if (roundedPrice === 35) return 'muerto_relleno';

  // 2. Coincidencias por nombre (en caso de promociones o pedidos)
  if (normName.includes('bolillo') || normName.includes('telera') || normName.includes('birote')) {
    return 'bolillo';
  }
  if (normName.includes('muerto') && (normName.includes('rellen') || roundedPrice >= 30)) {
    return 'muerto_relleno';
  }
  if (normName.includes('muerto') || normName.includes('hojaldra')) {
    return 'muerto_tradicional';
  }
  if (normName.includes('rellen') || normName.includes('queso') || normName.includes('zarzamora') || normName.includes('crema')) {
    return 'relleno';
  }
  if (normName.includes('especial') || normName.includes('gourmet') || normName.includes('trenza') || normName.includes('danes')) {
    return 'especial';
  }
  if (normName.includes('concha') || normName.includes('cuerno') || normName.includes('dona') || normName.includes('oreja') || normName.includes('rebanada') || normName.includes('manteconcha')) {
    return 'tradicional';
  }

  return 'otros';
}

export interface HourlyBolilloProduction {
  hour: number;
  label: string; // '07:00'
  rangeLabel: string; // '07:00 - 08:00'
  pieces: number;
  trays: number; // Decimal (e.g. 3.2 charolas)
  fullTrays: number; // Ceil (e.g. 4 charolas)
  percentage: number; // % of day
  isPeakHour: boolean;
  recommendedBakeTrays: number; // Sugerencia de horneado en tandas
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
  percentVsAverage: number; // Ej: +25% o -15%
  status: 'alto' | 'medio' | 'bajo';
  recommendation: string;
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
  dailyAvgPieces: number;
  charolas?: number; // Solo aplica para bolillo
}

export interface ProductionAnalyticsResult {
  totalTicketsAnalyzed: number;
  totalDaysAnalyzed: number;
  totalPiecesProduced: number;
  totalRevenue: number;
  
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
 * Calcula las estadísticas de producción analizando todos los tickets filtrados
 */
export function calculateProductionStats(
  tickets: Array<{
    id: string;
    date: string;
    time?: string;
    timestamp?: string;
    items: Array<{ price: number; quantity: number; name?: string; total?: number }>;
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
    otros: { pieces: 0, revenue: 0 }
  };

  // Agrupadores temporales
  const hourlyBolilloMap: Record<number, number> = {};
  for (let h = 6; h <= 22; h++) {
    hourlyBolilloMap[h] = 0;
  }

  // Agrupador por día de la semana (0 = Dom, ... 6 = Sáb)
  const dayOfWeekPiecesMap: Record<number, { pieces: number; daysSet: Set<string> }> = {};
  for (let d = 0; d < 7; d++) {
    dayOfWeekPiecesMap[d] = { pieces: 0, daysSet: new Set<string>() };
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
    otros: number;
    totalPieces: number;
    totalSales: number;
  }> = {};

  // Turnos
  const shifts = {
    turno1: { bolilloPieces: 0, totalPieces: 0, totalSales: 0 },
    turno2: { bolilloPieces: 0, totalPieces: 0, totalSales: 0 }
  };

  const uniqueDays = new Set<string>();

  // Procesar tickets
  for (const ticket of tickets) {
    if (!ticket) continue;

    const tDate = (ticket.date || (ticket.timestamp ? ticket.timestamp.split('T')[0] : '')).trim();
    if (tDate) uniqueDays.add(tDate);

    // Extraer hora (0 a 23)
    let hour = 12;
    if (ticket.time && typeof ticket.time === 'string') {
      const parts = ticket.time.split(':');
      if (parts[0]) {
        const parsed = parseInt(parts[0], 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) hour = parsed;
      }
    } else if (ticket.timestamp) {
      const d = new Date(ticket.timestamp);
      if (!isNaN(d.getTime())) hour = d.getHours();
    }

    // Día de la semana (0 a 6)
    let dayOfWeek = 1;
    if (tDate) {
      const [year, month, day] = tDate.split('-').map(n => parseInt(n, 10));
      if (year && month && day) {
        const dObj = new Date(year, month - 1, day);
        if (!isNaN(dObj.getTime())) dayOfWeek = dObj.getDay();
      }
    }

    // Inicializar día en dailyMap si no existe
    if (tDate && !dailyMap[tDate]) {
      dailyMap[tDate] = {
        date: tDate,
        bolillo: 0,
        tradicional: 0,
        relleno: 0,
        especial: 0,
        muerto: 0,
        muertoRelleno: 0,
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
      const cat = classifyBreadItem(itemPrice, item.name);
      const lineRevenue = item.total != null ? item.total : itemPrice * qty;

      categoryCounts[cat].pieces += qty;
      categoryCounts[cat].revenue += lineRevenue;
      ticketTotalPieces += qty;

      // Desglose para Bolillo
      if (cat === 'bolillo') {
        const hKey = Math.min(22, Math.max(6, hour));
        hourlyBolilloMap[hKey] = (hourlyBolilloMap[hKey] || 0) + qty;

        if (dayOfWeekPiecesMap[dayOfWeek]) {
          dayOfWeekPiecesMap[dayOfWeek].pieces += qty;
          if (tDate) dayOfWeekPiecesMap[dayOfWeek].daysSet.add(tDate);
        }

        if (tDate && dailyMap[tDate]) {
          dailyMap[tDate].bolillo += qty;
        }

        if (isTurno1) {
          shifts.turno1.bolilloPieces += qty;
        } else {
          shifts.turno2.bolilloPieces += qty;
        }
      } else if (cat === 'tradicional') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].tradicional += qty;
      } else if (cat === 'relleno') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].relleno += qty;
      } else if (cat === 'especial') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].especial += qty;
      } else if (cat === 'muerto_tradicional') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].muerto += qty;
      } else if (cat === 'muerto_relleno') {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].muertoRelleno += qty;
      } else {
        if (tDate && dailyMap[tDate]) dailyMap[tDate].otros += qty;
      }
    }

    if (tDate && dailyMap[tDate]) {
      dailyMap[tDate].totalPieces += ticketTotalPieces;
      dailyMap[tDate].totalSales += (ticket.total || 0);
    }

    if (isTurno1) {
      shifts.turno1.totalPieces += ticketTotalPieces;
      shifts.turno1.totalSales += (ticket.total || 0);
    } else {
      shifts.turno2.totalPieces += ticketTotalPieces;
      shifts.turno2.totalSales += (ticket.total || 0);
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

  // Desglose por categorías con porcentajes y promedio diario
  const categoryTotals = {} as Record<BreadClassificationKey, CategorySummaryData>;
  const categoryList: CategorySummaryData[] = [];

  for (const catKey of Object.keys(BREAD_CATEGORIES) as BreadClassificationKey[]) {
    const def = BREAD_CATEGORIES[catKey];
    const pieces = categoryCounts[catKey].pieces;
    const rev = categoryCounts[catKey].revenue;
    const pct = totalPiecesProduced > 0 ? (pieces / totalPiecesProduced) * 100 : 0;
    const dailyAvg = totalDays > 0 ? Math.round(pieces / totalDays) : pieces;

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
      percentageOfPieces: Math.round(pct * 10) / 10,
      dailyAvgPieces: dailyAvg,
      charolas: catKey === 'bolillo' ? Math.round((pieces / safePerTray) * 10) / 10 : undefined
    };

    categoryTotals[catKey] = data;
    categoryList.push(data);
  }

  // Ordenar lista de categorías por cantidad de piezas vendidas descendente
  categoryList.sort((a, b) => b.totalPieces - a.totalPieces);

  const bolilloTotalPieces = categoryCounts.bolillo.pieces;
  const bolilloPieces = bolilloTotalPieces;
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

    // Sugerencia de charolas a hornear para esa hora considerando flujo
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

  // Desglose por día de la semana
  // Calcular promedio general por día para comparar
  let totalWeekBolillo = 0;
  for (let d = 0; d < 7; d++) {
    totalWeekBolillo += dayOfWeekPiecesMap[d].pieces;
  }
  const avgPerWeekDay = totalWeekBolillo / 7;

  // Reorganizar días iniciando en Lunes (1) hasta Domingo (0)
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
    let recommendation = 'Producción Normal';

    if (percentVsAverage >= 15) {
      status = 'alto';
      recommendation = `🔥 Producir +${percentVsAverage}% (Día Fuerte)`;
    } else if (percentVsAverage <= -15) {
      status = 'bajo';
      recommendation = `📉 Producir ${percentVsAverage}% (Día Tranquilo)`;
    } else {
      status = 'medio';
      recommendation = `⚖️ Producción Estándar (~${avgTrays} charolas)`;
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

  // Día más fuerte y día más bajo
  const sortedDays = [...dayOfWeekStats].filter(d => d.totalPieces > 0).sort((a, b) => b.avgPiecesPerDay - a.avgPiecesPerDay);
  const strongestDay = sortedDays.length > 0 ? sortedDays[0] : null;
  const lowestDay = sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : null;

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
      otrosPieces: val.otros,
      totalPieces: val.totalPieces,
      totalSales: val.totalSales
    };
  });

  // Desglose de turnos
  const shiftBreakdown = {
    turno1: {
      bolilloPieces: shifts.turno1.bolilloPieces,
      bolilloTrays: Math.round((shifts.turno1.bolilloPieces / safePerTray) * 10) / 10,
      totalPieces: shifts.turno1.totalPieces,
      totalSales: shifts.turno1.totalSales
    },
    turno2: {
      bolilloPieces: shifts.turno2.bolilloPieces,
      bolilloTrays: Math.round((shifts.turno2.bolilloPieces / safePerTray) * 10) / 10,
      totalPieces: shifts.turno2.totalPieces,
      totalSales: shifts.turno2.totalSales
    }
  };

  // Planificador de Producción de Bolillo Recomendado
  // Proporción estándar en panaderías mexicanas: Turno 1 (55% mañana), Turno 2 (45% tarde/noche)
  const suggestedDailyBolilloPieces = bolilloDailyAvgPieces > 0 ? bolilloDailyAvgPieces : 300;
  const suggestedDailyBolilloTrays = Math.ceil(suggestedDailyBolilloPieces / safePerTray);

  const t1Trays = Math.ceil(suggestedDailyBolilloTrays * 0.55);
  const t2Trays = Math.max(1, suggestedDailyBolilloTrays - t1Trays);

  const bakingBatches = [
    {
      time: '06:30 AM',
      label: 'Tanda 1 (Apertura Mañana)',
      suggestedTrays: Math.ceil(t1Trays * 0.6),
      notes: 'Para el desayuno y clientes de primera hora (07:00 a 10:00)'
    },
    {
      time: '10:30 AM',
      label: 'Tanda 2 (Resurtido Mediodía)',
      suggestedTrays: Math.max(1, t1Trays - Math.ceil(t1Trays * 0.6)),
      notes: 'Para tortas, comidas y compras de medio día'
    },
    {
      time: '16:00 PM',
      label: 'Tanda 3 (Arranque Tarde)',
      suggestedTrays: Math.ceil(t2Trays * 0.5),
      notes: 'Bolillo recién salido calientito para la llegada de la tarde'
    },
    {
      time: '18:30 PM',
      label: 'Tanda 4 (Pico Merienda / Cena)',
      suggestedTrays: Math.max(1, t2Trays - Math.ceil(t2Trays * 0.5)),
      notes: 'Mayor afluencia de familias para la cena y merienda'
    }
  ];

  return {
    totalTicketsAnalyzed: totalTickets,
    totalDaysAnalyzed: totalDays,
    totalPiecesProduced,
    totalRevenue,
    bolillosPerTray: safePerTray,
    bolilloTotalPieces,
    bolilloTotalTrays,
    bolilloDailyAvgPieces,
    bolilloDailyAvgTrays,
    bolilloPeakHour,
    strongestDay,
    lowestDay,
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
 * Útil para que el usuario pueda visualizar las gráficas y entender el modelo de producción
 * mientras se van acumulando sus tickets reales de cada día.
 */
export function generateSampleWeekTickets(referenceDate: string): any[] {
  const sampleTickets: any[] = [];
  const [y, m, d] = referenceDate.split('-').map(n => parseInt(n, 10));
  const refDateObj = new Date(y, m - 1, d);

  // Generar 7 días de tickets
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const dt = new Date(refDateObj);
    dt.setDate(dt.getDate() - dayOffset);
    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yr}-${mo}-${da}`;
    const dayOfWeek = dt.getDay(); // 0 = Dom, 6 = Sáb

    // Fin de semana (Viernes a Domingo mayor afluencia)
    const multiplier = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) ? 1.25 : 0.95;
    const ticketsCount = Math.round(28 * multiplier);

    for (let i = 0; i < ticketsCount; i++) {
      // Concentración en horas pico: Mañana (07:00 a 10:00) y Tarde (17:00 a 20:00)
      const isMorning = Math.random() < 0.52;
      let hour = 7;
      if (isMorning) {
        hour = 6 + Math.floor(Math.random() * 5); // 6, 7, 8, 9, 10
      } else {
        hour = 16 + Math.floor(Math.random() * 5); // 16, 17, 18, 19, 20
      }
      const minute = String(Math.floor(Math.random() * 60)).padStart(2, '0');
      const timeStr = `${String(hour).padStart(2, '0')}:${minute}`;

      const items: Array<{ id: string; name: string; price: number; quantity: number; total: number }> = [];

      // 1. Bolillo ($5) - Producto Ancla muy frecuente
      if (Math.random() < 0.85) {
        const qty = Math.floor(Math.random() * 10) + 4; // 4 a 13 bolillos
        items.push({
          id: `bol-${dayOffset}-${i}`,
          name: 'Bolillo Tradicional $5',
          price: 5,
          quantity: qty,
          total: qty * 5
        });
      }

      // 2. Pan Tradicional ($12)
      if (Math.random() < 0.70) {
        const qty = Math.floor(Math.random() * 5) + 2; // 2 a 6 piezas
        items.push({
          id: `trad-${dayOffset}-${i}`,
          name: 'Pan Tradicional (Concha / Cuerno) $12',
          price: 12,
          quantity: qty,
          total: qty * 12
        });
      }

      // 3. Pan de Relleno ($18)
      if (Math.random() < 0.40) {
        const qty = Math.floor(Math.random() * 3) + 1;
        items.push({
          id: `rel-${dayOffset}-${i}`,
          name: 'Pan con Relleno de Queso $18',
          price: 18,
          quantity: qty,
          total: qty * 18
        });
      }

      // 4. Pan Especial ($20)
      if (Math.random() < 0.30) {
        const qty = Math.floor(Math.random() * 2) + 1;
        items.push({
          id: `esp-${dayOffset}-${i}`,
          name: 'Pan Especial Gourmet $20',
          price: 20,
          quantity: qty,
          total: qty * 20
        });
      }

      // 5. Pan de Muerto Tradicional ($25)
      if (Math.random() < 0.25) {
        const qty = Math.floor(Math.random() * 2) + 1;
        items.push({
          id: `muer-${dayOffset}-${i}`,
          name: 'Pan de Muerto Tradicional $25',
          price: 25,
          quantity: qty,
          total: qty * 25
        });
      }

      // 6. Pan de Muerto Relleno ($35)
      if (Math.random() < 0.20) {
        const qty = 1;
        items.push({
          id: `muer-rel-${dayOffset}-${i}`,
          name: 'Pan de Muerto con Crema Nata $35',
          price: 35,
          quantity: qty,
          total: qty * 35
        });
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
