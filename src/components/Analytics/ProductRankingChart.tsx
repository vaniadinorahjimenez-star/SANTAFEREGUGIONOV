import React, { useState, useMemo } from 'react';
import { 
  Trophy, 
  Award, 
  TrendingUp, 
  Calendar, 
  BarChart3, 
  Layers, 
  Flame, 
  Clock, 
  ChevronRight, 
  Filter, 
  Sparkles,
  Search,
  PieChart as PieChartIcon,
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { SaleTicket } from '../../types';
import { classifyBreadItem, BREAD_CATEGORIES, BreadClassificationKey } from '../../utils/productionAnalytics';

export type GranularityMode = 'dia' | 'semana' | 'mes';

interface ProductRankingChartProps {
  tickets: SaleTicket[];
  bolillosPerTray?: number;
}

export interface AggregatedProductItem {
  id: string;
  name: string;
  categoryKey: BreadClassificationKey;
  categoryLabel: string;
  color: string;
  emoji: string;
  targetPrice: number;
  totalQuantity: number;
  totalRevenue: number;
  ticketsCount: number;
  avgPrice: number;
  percentageOfQuantity: number;
  percentageOfRevenue: number;
  trays?: number; // Para bolillo (fijo 12 pzas / charola)
}

/**
 * Normaliza nombres de productos para agrupar de forma inteligente:
 * - "Pan $5", "Bolillo", "Telera" -> Bolillo Tradicional ($5)
 * - "Pan $12", "Concha", "Cuerno", etc.
 */
function resolveProductDisplayName(name: string | undefined, price: number): {
  displayName: string;
  categoryKey: BreadClassificationKey;
  emoji: string;
  color: string;
} {
  const norm = (name || '').toLowerCase().trim();
  const roundedPrice = Math.round(price);
  const catKey = classifyBreadItem(price, name);

  // 1. Bolillo / Telera ($5)
  if (catKey === 'bolillo' || norm.includes('bolillo') || norm.includes('telera') || roundedPrice === 5) {
    let cleanName = 'Bolillo Tradicional ($5)';
    if (norm.includes('telera')) cleanName = 'Telera Tradicional ($5)';
    return {
      displayName: cleanName,
      categoryKey: 'bolillo',
      emoji: '🥖',
      color: '#D95D39'
    };
  }

  // 2. Pan Tradicional ($12)
  if (catKey === 'tradicional' || roundedPrice === 12) {
    if (norm.includes('concha')) {
      return { displayName: 'Conchas Tradicionales ($12)', categoryKey: 'tradicional', emoji: '🍩', color: '#F59E0B' };
    }
    if (norm.includes('cuerno')) {
      return { displayName: 'Cuernos de Mantequilla ($12)', categoryKey: 'tradicional', emoji: '🥐', color: '#F59E0B' };
    }
    if (norm.includes('dona')) {
      return { displayName: 'Donas de Azúcar / Chocolate ($12)', categoryKey: 'tradicional', emoji: '🍩', color: '#F59E0B' };
    }
    if (norm.includes('oreja')) {
      return { displayName: 'Orejas de Hojaldre ($12)', categoryKey: 'tradicional', emoji: '🥐', color: '#F59E0B' };
    }
    if (norm.includes('mantecada')) {
      return { displayName: 'Mantecadas Tradicionales ($12)', categoryKey: 'tradicional', emoji: '🧁', color: '#F59E0B' };
    }
    return {
      displayName: name && !norm.startsWith('pan $') ? name : 'Pan Dulce Tradicional ($12)',
      categoryKey: 'tradicional',
      emoji: '🥐',
      color: '#F59E0B'
    };
  }

  // 3. Pan de Relleno ($18)
  if (catKey === 'relleno' || roundedPrice === 18) {
    if (norm.includes('zarzamora') || norm.includes('queso')) {
      return { displayName: 'Pan Queso con Zarzamora ($18)', categoryKey: 'relleno', emoji: '🥯', color: '#8B5CF6' };
    }
    if (norm.includes('crema') || norm.includes('pastelera')) {
      return { displayName: 'Pan con Crema Pastelera ($18)', categoryKey: 'relleno', emoji: '🥯', color: '#8B5CF6' };
    }
    return {
      displayName: name && !norm.startsWith('pan $') ? name : 'Pan con Relleno ($18)',
      categoryKey: 'relleno',
      emoji: '🥯',
      color: '#8B5CF6'
    };
  }

  // 4. Pan Especial ($20)
  if (catKey === 'especial' || roundedPrice === 20) {
    return {
      displayName: name && !norm.startsWith('pan $') ? name : 'Pan Especial Gourmet ($20)',
      categoryKey: 'especial',
      emoji: '⭐',
      color: '#EC4899'
    };
  }

  // 5. Pan de Muerto Tradicional ($25)
  if (catKey === 'muerto_tradicional' || roundedPrice === 25) {
    return {
      displayName: 'Pan de Muerto Tradicional ($25)',
      categoryKey: 'muerto_tradicional',
      emoji: '💀',
      color: '#EA580C'
    };
  }

  // 6. Pan de Muerto Relleno ($35)
  if (catKey === 'muerto_relleno' || roundedPrice === 35) {
    return {
      displayName: 'Pan de Muerto con Relleno ($35)',
      categoryKey: 'muerto_relleno',
      emoji: '🍫',
      color: '#10B981'
    };
  }

  // Otros
  return {
    displayName: name ? name : `Pan Varios ($${price.toFixed(2)})`,
    categoryKey: 'otros',
    emoji: '📦',
    color: '#64748B'
  };
}

export const ProductRankingChart: React.FC<ProductRankingChartProps> = ({
  tickets,
  bolillosPerTray = 12
}) => {
  // Modo de granularidad: Día, Semana o Mes
  const [granularity, setGranularity] = useState<GranularityMode>('semana');

  // Métrica seleccionada para ordenar la gráfica: Cantidad de piezas vs Ingresos ($)
  const [metricSort, setMetricSort] = useState<'quantity' | 'revenue'>('quantity');

  // Búsqueda de producto en tabla
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Fechas de referencia
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Sub-filtros para cada granularidad
  const [selectedDayOption, setSelectedDayOption] = useState<'hoy' | 'ayer' | 'custom'>('hoy');
  const [customDayDate, setCustomDayDate] = useState<string>(todayStr);

  const [selectedWeekOption, setSelectedWeekOption] = useState<'esta_semana' | 'semana_pasada' | 'ultimos_7dias'>('ultimos_7dias');
  const [selectedMonthOption, setSelectedMonthOption] = useState<'este_mes' | 'mes_anterior' | 'ultimos_30dias'>('ultimos_30dias');

  // Calcular las fechas límite según la granularidad y opción activa
  const targetDateRange = useMemo(() => {
    const now = new Date();

    if (granularity === 'dia') {
      let targetDate = todayStr;
      if (selectedDayOption === 'ayer') targetDate = yesterdayStr;
      if (selectedDayOption === 'custom') targetDate = customDayDate || todayStr;
      return {
        startDate: targetDate,
        endDate: targetDate,
        label: selectedDayOption === 'hoy' 
          ? `Hoy (${targetDate})` 
          : selectedDayOption === 'ayer' 
            ? `Ayer (${targetDate})` 
            : `Día: ${targetDate}`,
        type: 'dia'
      };
    }

    if (granularity === 'semana') {
      if (selectedWeekOption === 'ultimos_7dias') {
        const d7 = new Date();
        d7.setDate(d7.getDate() - 6);
        const y7 = d7.getFullYear();
        const m7 = String(d7.getMonth() + 1).padStart(2, '0');
        const day7 = String(d7.getDate()).padStart(2, '0');
        const start = `${y7}-${m7}-${day7}`;
        return {
          startDate: start,
          endDate: todayStr,
          label: `Últimos 7 Días (${start} al ${todayStr})`,
          type: 'semana'
        };
      }

      if (selectedWeekOption === 'esta_semana') {
        // Lunes a Domingo de la semana actual
        const dayOfWeek = now.getDay(); // 0 = Dom, 1 = Lun...
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(monday.getDate() + diffToMonday);

        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);

        const yM = monday.getFullYear();
        const mM = String(monday.getMonth() + 1).padStart(2, '0');
        const dM = String(monday.getDate()).padStart(2, '0');

        const yS = sunday.getFullYear();
        const mS = String(sunday.getMonth() + 1).padStart(2, '0');
        const dS = String(sunday.getDate()).padStart(2, '0');

        return {
          startDate: `${yM}-${mM}-${dM}`,
          endDate: `${yS}-${mS}-${dS}`,
          label: `Esta Semana (${dM}/${mM} al ${dS}/${mS})`,
          type: 'semana'
        };
      }

      if (selectedWeekOption === 'semana_pasada') {
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const lastMonday = new Date(now);
        lastMonday.setDate(lastMonday.getDate() + diffToMonday - 7);

        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastSunday.getDate() + 6);

        const yM = lastMonday.getFullYear();
        const mM = String(lastMonday.getMonth() + 1).padStart(2, '0');
        const dM = String(lastMonday.getDate()).padStart(2, '0');

        const yS = lastSunday.getFullYear();
        const mS = String(lastSunday.getMonth() + 1).padStart(2, '0');
        const dS = String(lastSunday.getDate()).padStart(2, '0');

        return {
          startDate: `${yM}-${mM}-${dM}`,
          endDate: `${yS}-${mS}-${dS}`,
          label: `Semana Pasada (${dM}/${mM} al ${dS}/${mS})`,
          type: 'semana'
        };
      }
    }

    if (granularity === 'mes') {
      if (selectedMonthOption === 'ultimos_30dias') {
        const d30 = new Date();
        d30.setDate(d30.getDate() - 29);
        const y30 = d30.getFullYear();
        const m30 = String(d30.getMonth() + 1).padStart(2, '0');
        const day30 = String(d30.getDate()).padStart(2, '0');
        const start = `${y30}-${m30}-${day30}`;
        return {
          startDate: start,
          endDate: todayStr,
          label: `Últimos 30 Días (${start} al ${todayStr})`,
          type: 'mes'
        };
      }

      if (selectedMonthOption === 'este_mes') {
        const yr = now.getFullYear();
        const mo = String(now.getMonth() + 1).padStart(2, '0');
        const start = `${yr}-${mo}-01`;
        return {
          startDate: start,
          endDate: todayStr,
          label: `Este Mes (${mo}/${yr})`,
          type: 'mes'
        };
      }

      if (selectedMonthOption === 'mes_anterior') {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const yr = prev.getFullYear();
        const mo = String(prev.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(yr, prev.getMonth() + 1, 0).getDate();
        return {
          startDate: `${yr}-${mo}-01`,
          endDate: `${yr}-${mo}-${String(lastDay).padStart(2, '0')}`,
          label: `Mes Anterior (${mo}/${yr})`,
          type: 'mes'
        };
      }
    }

    return {
      startDate: todayStr,
      endDate: todayStr,
      label: todayStr,
      type: 'dia'
    };
  }, [granularity, selectedDayOption, customDayDate, selectedWeekOption, selectedMonthOption, todayStr, yesterdayStr]);

  // Filtrar tickets en el rango
  const periodTickets = useMemo(() => {
    return tickets.filter(t => {
      if (!t.date) return false;
      return t.date >= targetDateRange.startDate && t.date <= targetDateRange.endDate;
    });
  }, [tickets, targetDateRange]);

  // Agrupar ítems por producto y calcular estadísticas de venta
  const { productList, totalPieces, totalRevenue, topProduct, timelineData } = useMemo(() => {
    const map = new Map<string, {
      name: string;
      categoryKey: BreadClassificationKey;
      color: string;
      emoji: string;
      quantity: number;
      revenue: number;
      ticketsSet: Set<string>;
      prices: number[];
    }>();

    let sumPieces = 0;
    let sumRevenue = 0;

    // Timeline por fecha para gráfica de evolución
    const timelineByDate: Record<string, Record<string, number>> = {};

    periodTickets.forEach(ticket => {
      const tDate = ticket.date;
      if (!timelineByDate[tDate]) timelineByDate[tDate] = {};

      ticket.items.forEach(item => {
        const qty = item.quantity || 0;
        if (qty <= 0) return;

        const price = item.price || (item.total ? item.total / qty : 0);
        const revenue = item.total != null ? item.total : price * qty;

        const { displayName, categoryKey, emoji, color } = resolveProductDisplayName(item.name, price);

        sumPieces += qty;
        sumRevenue += revenue;

        // Sumar al timeline
        timelineByDate[tDate][displayName] = (timelineByDate[tDate][displayName] || 0) + qty;

        if (!map.has(displayName)) {
          map.set(displayName, {
            name: displayName,
            categoryKey,
            color,
            emoji,
            quantity: 0,
            revenue: 0,
            ticketsSet: new Set<string>(),
            prices: []
          });
        }

        const entry = map.get(displayName)!;
        entry.quantity += qty;
        entry.revenue += revenue;
        entry.ticketsSet.add(ticket.id);
        entry.prices.push(price);
      });
    });

    // Convertir a lista y calcular porcentajes
    const list: AggregatedProductItem[] = Array.from(map.values()).map(it => {
      const avgP = it.quantity > 0 ? it.revenue / it.quantity : 0;
      const pctQty = sumPieces > 0 ? (it.quantity / sumPieces) * 100 : 0;
      const pctRev = sumRevenue > 0 ? (it.revenue / sumRevenue) * 100 : 0;
      const isBolillo = it.categoryKey === 'bolillo' || it.name.toLowerCase().includes('bolillo');

      return {
        id: it.name,
        name: it.name,
        categoryKey: it.categoryKey,
        categoryLabel: BREAD_CATEGORIES[it.categoryKey]?.label || it.name,
        color: it.color,
        emoji: it.emoji,
        targetPrice: avgP,
        totalQuantity: it.quantity,
        totalRevenue: Math.round(it.revenue),
        ticketsCount: it.ticketsSet.size,
        avgPrice: Number(avgP.toFixed(2)),
        percentageOfQuantity: Number(pctQty.toFixed(1)),
        percentageOfRevenue: Number(pctRev.toFixed(1)),
        trays: isBolillo ? Number((it.quantity / bolillosPerTray).toFixed(1)) : undefined
      };
    });

    // Ordenar lista según la métrica elegida
    list.sort((a, b) => {
      if (metricSort === 'quantity') return b.totalQuantity - a.totalQuantity;
      return b.totalRevenue - a.totalRevenue;
    });

    const top = list.length > 0 ? list[0] : null;

    // Preparar timeline formateado ordenado cronológicamente
    const sortedDates = Object.keys(timelineByDate).sort();
    const formattedTimeline = sortedDates.map(d => {
      const [yy, mm, dd] = d.split('-');
      const dObj = new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd));
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const dayName = dayNames[dObj.getDay()];

      const row: any = {
        date: d,
        label: `${dayName} ${dd}/${mm}`,
        totalDayPieces: 0
      };

      // Agregar los top 4 productos al timeline
      list.slice(0, 4).forEach(prod => {
        const q = timelineByDate[d][prod.name] || 0;
        row[prod.name] = q;
        row.totalDayPieces += q;
      });

      return row;
    });

    return {
      productList: list,
      totalPieces: sumPieces,
      totalRevenue: sumRevenue,
      topProduct: top,
      timelineData: formattedTimeline
    };
  }, [periodTickets, metricSort, bolillosPerTray]);

  // Lista filtrada por el buscador
  const displayedProductList = useMemo(() => {
    if (!searchFilter.trim()) return productList;
    const q = searchFilter.toLowerCase();
    return productList.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.categoryLabel.toLowerCase().includes(q)
    );
  }, [productList, searchFilter]);

  // Datos para la gráfica de barras de ranking
  const chartData = useMemo(() => {
    // Tomar los top 8 productos para que la gráfica sea legible y contundente
    return productList.slice(0, 8).map((prod, idx) => ({
      rank: idx + 1,
      name: prod.name,
      shortName: prod.name.replace(/\s*\(\$.*?\)/, ''), // Quitar ($X) para etiquetas compactas
      quantity: prod.totalQuantity,
      revenue: prod.totalRevenue,
      emoji: prod.emoji,
      color: prod.color,
      percentage: prod.percentageOfQuantity,
      trays: prod.trays
    }));
  }, [productList]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* ========================================================================= */}
      {/* 1. SELECTOR DE GRANULARIDAD: POR DÍA, POR SEMANA O POR MES                */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-100 pb-4">
          <div>
            <div className="flex items-center gap-2 text-amber-800 text-xs font-black uppercase tracking-wider mb-1">
              <Trophy className="w-4 h-4 text-amber-600" />
              <span>Ranking de Ventas y Preferencia del Cliente</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-amber-950">
              ¿Qué Producto se Vende Más en Panadería Santa Fé?
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
              Visualiza en gráfica la cantidad exacta de piezas y dinero que genera cada tipo de pan.
            </p>
          </div>

          {/* Selector Principal: Día / Semana / Mes */}
          <div className="bg-stone-100 p-1.5 rounded-2xl flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setGranularity('dia')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                granularity === 'dia'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-700 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <span>📅</span>
              <span>Por Día</span>
            </button>

            <button
              type="button"
              onClick={() => setGranularity('semana')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                granularity === 'semana'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-700 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <span>📆</span>
              <span>Por Semana</span>
            </button>

            <button
              type="button"
              onClick={() => setGranularity('mes')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                granularity === 'mes'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-700 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <span>🗓️</span>
              <span>Por Mes</span>
            </button>
          </div>
        </div>

        {/* Sub-opciones según la granularidad seleccionada */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* Sub-filtros para DÍA */}
          {granularity === 'dia' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-stone-500">Seleccionar Día:</span>
              <button
                type="button"
                onClick={() => setSelectedDayOption('hoy')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedDayOption === 'hoy'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-black'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                ⚡ Hoy
              </button>
              <button
                type="button"
                onClick={() => setSelectedDayOption('ayer')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedDayOption === 'ayer'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-black'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                ⏪ Ayer
              </button>
              <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-xl px-2 py-1">
                <span className="text-stone-500 font-medium">Fecha:</span>
                <input
                  type="date"
                  value={customDayDate}
                  onChange={(e) => {
                    setCustomDayDate(e.target.value);
                    setSelectedDayOption('custom');
                  }}
                  className="text-stone-800 font-bold bg-transparent focus:outline-hidden cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Sub-filtros para SEMANA */}
          {granularity === 'semana' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-stone-500">Rango Semanal:</span>
              <button
                type="button"
                onClick={() => setSelectedWeekOption('ultimos_7dias')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedWeekOption === 'ultimos_7dias'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-black'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                🔥 Últimos 7 Días
              </button>
              <button
                type="button"
                onClick={() => setSelectedWeekOption('esta_semana')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedWeekOption === 'esta_semana'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-black'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                📅 Esta Semana (Lun-Dom)
              </button>
              <button
                type="button"
                onClick={() => setSelectedWeekOption('semana_pasada')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedWeekOption === 'semana_pasada'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-black'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                ⏪ Semana Pasada
              </button>
            </div>
          )}

          {/* Sub-filtros para MES */}
          {granularity === 'mes' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-stone-500">Período Mensual:</span>
              <button
                type="button"
                onClick={() => setSelectedMonthOption('ultimos_30dias')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedMonthOption === 'ultimos_30dias'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-black'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                🗓️ Últimos 30 Días
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonthOption('este_mes')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedMonthOption === 'este_mes'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-black'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                ⚡ Este Mes en Curso
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonthOption('mes_anterior')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedMonthOption === 'mes_anterior'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-black'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                ⏪ Mes Anterior
              </button>
            </div>
          )}

          {/* Métrica Activa del Gráfico (Cantidad vs Ingresos) */}
          <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl">
            <span className="text-[11px] font-bold text-stone-500 px-1">Ver por:</span>
            <button
              type="button"
              onClick={() => setMetricSort('quantity')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                metricSort === 'quantity'
                  ? 'bg-white text-stone-900 shadow-2xs font-black'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              🥖 Cantidad (Piezas)
            </button>
            <button
              type="button"
              onClick={() => setMetricSort('revenue')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                metricSort === 'revenue'
                  ? 'bg-white text-stone-900 shadow-2xs font-black'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              💰 Dinero ($ MXN)
            </button>
          </div>
        </div>

        {/* Badge de Rango Seleccionado */}
        <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200/80 flex items-center justify-between text-xs text-amber-950 font-medium">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
            <span>Período evaluado: <strong className="font-black text-amber-900">{targetDateRange.label}</strong></span>
          </div>
          <div>
            <span className="text-stone-600 font-bold">{periodTickets.length} tickets registrados</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TARJETAS DE IMPACTO: #1 MÁS VENDIDO & TOTALES                          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Tarjeta Ganadora: PRODUCTO #1 MÁS VENDIDO */}
        <div className="md:col-span-2 bg-gradient-to-br from-amber-600 via-orange-600 to-amber-700 text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none text-9xl">
            🏆
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="bg-amber-300 text-amber-950 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
                <span>🥇</span>
                <span>Producto Más Vendido ({targetDateRange.type.toUpperCase()})</span>
              </span>
              <span className="text-amber-200 text-xs font-bold">
                {topProduct?.percentageOfQuantity || 0}% de todo el pan
              </span>
            </div>

            {topProduct ? (
              <div className="mt-4">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl sm:text-4xl font-black font-serif tracking-tight">
                    {topProduct.emoji} {topProduct.name}
                  </span>
                  <span className="text-sm font-bold bg-white/20 px-2.5 py-0.5 rounded-lg text-amber-100">
                    Precio prom: ${topProduct.avgPrice.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/20">
                  <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3 border border-white/15">
                    <div className="text-[11px] font-bold text-amber-200 uppercase">Cantidad Vendida</div>
                    <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-0.5">
                      {topProduct.totalQuantity.toLocaleString()} <span className="text-xs font-normal">pzas</span>
                    </div>
                    {topProduct.trays !== undefined && (
                      <div className="text-[11px] text-amber-200 font-bold mt-0.5">
                        ~{topProduct.trays} charolas ({bolillosPerTray} pz/ch)
                      </div>
                    )}
                  </div>

                  <div className="bg-white/10 backdrop-blur-xs rounded-2xl p-3 border border-white/15">
                    <div className="text-[11px] font-bold text-amber-200 uppercase">Ingresos Totales</div>
                    <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-0.5">
                      ${topProduct.totalRevenue.toLocaleString()} <span className="text-xs font-normal">MXN</span>
                    </div>
                    <div className="text-[11px] text-amber-200 font-medium mt-0.5">
                      {topProduct.percentageOfRevenue}% de las ventas en $
                    </div>
                  </div>

                  <div className="col-span-2 sm:col-span-1 bg-white/10 backdrop-blur-xs rounded-2xl p-3 border border-white/15">
                    <div className="text-[11px] font-bold text-amber-200 uppercase">Frecuencia en Tickets</div>
                    <div className="text-2xl sm:text-3xl font-black text-white font-mono mt-0.5">
                      {topProduct.ticketsCount} <span className="text-xs font-normal">tickets</span>
                    </div>
                    <div className="text-[11px] text-amber-200 font-medium mt-0.5">
                      Presente en {periodTickets.length > 0 ? Math.round((topProduct.ticketsCount / periodTickets.length) * 100) : 0}% de compras
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-amber-100">
                No hay ventas registradas en el período seleccionado.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-amber-100">
            <span>💡 <strong>Estrategia Santa Fé:</strong> Mantén siempre abasto y charolas calientes de tu producto líder.</span>
            <span className="font-mono text-amber-200 font-bold">12 bolillos/charola fijo</span>
          </div>
        </div>

        {/* Tarjeta de Resumen Global */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-stone-500 uppercase tracking-wider">
              <span>Volumen Total Panadería</span>
              <PieChartIcon className="w-4 h-4 text-amber-600" />
            </div>

            <div className="mt-3 space-y-4">
              <div>
                <div className="text-xs text-stone-500 font-bold">Total de Piezas Vendidas</div>
                <div className="text-3xl font-black text-stone-900 font-mono">
                  {totalPieces.toLocaleString()} <span className="text-sm font-bold text-stone-500">piezas</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-stone-500 font-bold">Venta Bruta Acumulada</div>
                <div className="text-3xl font-black text-emerald-800 font-mono">
                  ${totalRevenue.toLocaleString()} <span className="text-sm font-bold text-emerald-600">MXN</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-stone-500 font-bold">Variedades con Venta</div>
                <div className="text-xl font-black text-amber-900 font-mono">
                  {productList.length} tipos de pan
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-stone-100 text-xs text-stone-500 flex items-center justify-between">
            <span>Bolillos por charola:</span>
            <span className="bg-amber-100 text-amber-900 font-black px-2 py-0.5 rounded-md font-mono">
              {bolillosPerTray} piezas (Fijo)
            </span>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. PODIO DE HONOR: TOP 1, TOP 2 Y TOP 3                                   */}
      {/* ========================================================================= */}
      {productList.length >= 2 && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-base sm:text-lg text-amber-950 flex items-center gap-2">
              <span>🏅 Podio de Preferencia de Clientes</span>
              <span className="text-xs font-bold text-stone-500 font-normal">
                (Los 3 productos más pedidos)
              </span>
            </h3>
            <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              {targetDateRange.label}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {productList.slice(0, 3).map((item, idx) => {
              const medals = ['🥇 1er Lugar (Oro)', '🥈 2do Lugar (Plata)', '🥉 3er Lugar (Bronce)'];
              const borderColors = ['border-amber-400 bg-amber-50/50', 'border-slate-300 bg-slate-50/50', 'border-orange-300 bg-orange-50/50'];
              const badgeColors = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-900', 'bg-orange-300 text-orange-950'];

              return (
                <div 
                  key={item.name}
                  className={`rounded-2xl p-4 border-2 ${borderColors[idx]} flex flex-col justify-between relative overflow-hidden`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${badgeColors[idx]}`}>
                        {medals[idx]}
                      </span>
                      <span className="text-xl">{item.emoji}</span>
                    </div>

                    <h4 className="font-black text-stone-900 text-base leading-snug">
                      {item.name}
                    </h4>
                    <span className="text-xs text-stone-500 font-medium">
                      {item.categoryLabel}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-200/70 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-600 font-bold">Cantidad:</span>
                      <span className="font-black text-stone-950 text-base font-mono">
                        {item.totalQuantity.toLocaleString()} <span className="text-xs font-normal">pzas</span>
                      </span>
                    </div>
                    {item.trays !== undefined && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-800 font-medium">Charolas:</span>
                        <span className="font-black text-amber-900 font-mono">
                          ~{item.trays} ch
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-600 font-bold">Total $:</span>
                      <span className="font-black text-emerald-800 font-mono">
                        ${item.totalRevenue.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span>Participación:</span>
                      <span className="font-bold">{item.percentageOfQuantity}% del total</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. GRÁFICA PRINCIPAL: RANKING DE PRODUCTOS (PIEZAS Y DINERO)               */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
          <div>
            <h3 className="text-base sm:text-lg font-black text-amber-950 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-600" />
              <span>Gráfica de Productos Más Vendidos</span>
              <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-black">
                {metricSort === 'quantity' ? 'Cantidad de Piezas' : 'Venta en Dinero ($)'}
              </span>
            </h3>
            <p className="text-xs text-stone-600 mt-0.5">
              Comparativa visual de los panes con mayor rotación en el mostrador para el período seleccionado.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-500">Ordenar por:</span>
            <button
              type="button"
              onClick={() => setMetricSort('quantity')}
              className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${
                metricSort === 'quantity'
                  ? 'bg-amber-600 text-white font-black'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              Piezas
            </button>
            <button
              type="button"
              onClick={() => setMetricSort('revenue')}
              className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${
                metricSort === 'revenue'
                  ? 'bg-amber-600 text-white font-black'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              Pesos ($)
            </button>
          </div>
        </div>

        {/* Gráfica de Barras Recharts */}
        <div className="h-80 w-full pt-2">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData} 
                margin={{ top: 20, right: 20, left: -10, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis 
                  dataKey="shortName" 
                  tick={{ fontSize: 11, fill: '#4B5563', fontWeight: 600 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickFormatter={(val) => metricSort === 'quantity' ? `${val} pz` : `$${val}`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-stone-900 text-white p-3.5 rounded-2xl shadow-xl border border-stone-700 text-xs space-y-1.5 z-50">
                          <div className="font-black text-sm text-amber-300 flex items-center gap-1.5">
                            <span>{data.emoji}</span>
                            <span>{data.name}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 pt-1 border-t border-stone-800">
                            <span className="text-stone-400">Cantidad:</span>
                            <span className="font-black text-amber-400 font-mono text-sm">
                              {data.quantity.toLocaleString()} pzas
                            </span>
                          </div>
                          {data.trays !== undefined && (
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-stone-400">Charolas (12 pz c/u):</span>
                              <span className="font-bold text-amber-200 font-mono">
                                ~{data.trays} ch
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-stone-400">Ventas ($):</span>
                            <span className="font-black text-emerald-400 font-mono text-sm">
                              ${data.revenue.toLocaleString()} MXN
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-[11px] text-stone-400">
                            <span>Participación:</span>
                            <span className="font-bold text-white">{data.percentage}%</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey={metricSort === 'quantity' ? 'quantity' : 'revenue'}
                  radius={[8, 8, 0, 0]}
                  name={metricSort === 'quantity' ? 'Cantidad (Piezas)' : 'Venta ($)'}
                >
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-stone-400 text-sm">
              No hay suficientes datos de venta para generar la gráfica.
            </div>
          )}
        </div>

        {/* Leyenda con colores y cantidades rápidas */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-3 border-t border-stone-100 text-xs">
          {chartData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5 bg-stone-50 px-2.5 py-1 rounded-xl border border-stone-200">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
              <span className="font-bold text-stone-800">{item.shortName}:</span>
              <span className="font-black text-amber-900 font-mono">
                {metricSort === 'quantity' ? `${item.quantity} pz` : `$${item.revenue.toLocaleString()}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. GRÁFICA DE EVOLUCIÓN TEMPORAL DE LOS TOP PRODUCTOS                      */}
      {/* ========================================================================= */}
      {timelineData.length > 1 && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
            <div>
              <h3 className="text-base sm:text-lg font-black text-amber-950 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-600" />
                <span>Evolución Temporal de los Panes Más Vendidos</span>
              </h3>
              <p className="text-xs text-stone-600 mt-0.5">
                Observa cómo se comportó la venta de cada producto día tras día para detectar patrones de consumo.
              </p>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 10, right: 15, left: -15, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-stone-900 text-white p-3 rounded-2xl shadow-xl border border-stone-700 text-xs space-y-1.5">
                          <div className="font-black text-amber-300">{label}</div>
                          {payload.map((p: any, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-4">
                              <span style={{ color: p.color }} className="font-bold">{p.name}:</span>
                              <span className="font-mono font-black">{p.value} pzas</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                />
                {productList.slice(0, 4).map((prod, idx) => (
                  <Area
                    key={prod.name}
                    type="monotone"
                    dataKey={prod.name}
                    name={prod.name.replace(/\s*\(\$.*?\)/, '')}
                    stroke={prod.color}
                    fill={prod.color}
                    fillOpacity={0.2}
                    strokeWidth={2.5}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. TABLA COMPLETA DE PRODUCTOS CON CANTIDADES Y DESGLOSE                  */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div>
            <h3 className="text-base sm:text-lg font-black text-stone-900">
              Desglose Detallado de Todos los Productos Vendidos
            </h3>
            <p className="text-xs text-stone-500">
              {displayedProductList.length} variedades vendidas en el período seleccionado.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar pan..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-hidden focus:border-amber-400 font-medium"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 font-black uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Posición</th>
                <th className="py-2.5 px-3">Producto</th>
                <th className="py-2.5 px-3">Categoría</th>
                <th className="py-2.5 px-3 text-right">Cantidad (Piezas)</th>
                <th className="py-2.5 px-3 text-right">Charolas (12 pz)</th>
                <th className="py-2.5 px-3 text-right">Total ($ MXN)</th>
                <th className="py-2.5 px-3 text-right">% Volumen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium text-stone-800">
              {displayedProductList.map((item, idx) => {
                const maxQty = productList[0]?.totalQuantity || 1;
                const barWidthPct = Math.round((item.totalQuantity / maxQty) * 100);

                return (
                  <tr key={item.name} className="hover:bg-amber-50/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-black text-stone-500">
                      {idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{item.emoji}</span>
                        <div>
                          <span className="font-bold text-stone-900 block">{item.name}</span>
                          <span className="text-[10px] text-stone-500">Precio prom: ${item.avgPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md font-bold text-[11px]">
                        {item.categoryLabel}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="font-black font-mono text-sm text-amber-950">
                        {item.totalQuantity.toLocaleString()} <span className="text-[10px] font-normal text-stone-500">pz</span>
                      </div>
                      <div className="w-24 bg-stone-100 rounded-full h-1.5 ml-auto mt-1 overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ width: `${barWidthPct}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-stone-700">
                      {item.trays !== undefined ? (
                        <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-black">
                          ~{item.trays} ch
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-800">
                      ${item.totalRevenue.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-stone-600">
                      {item.percentageOfQuantity}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
