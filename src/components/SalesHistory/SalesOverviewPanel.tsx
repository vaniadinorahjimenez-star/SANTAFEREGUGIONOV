import React, { useMemo, useState, useEffect } from 'react';
import { SaleTicket, BakeryOrder, CashOutflowItem, DriverCustomer } from '../../types';
import {
  buildAnalyticsDateIndex,
  calculateDailyMetrics,
  calculateWeeklyMetrics,
  calculateMonthlyFinancialSummary,
  extractTicketDate,
  getMondayOfWeek,
  isDeliveryTicket,
  MONTH_NAMES_ES
} from '../../utils/salesAnalyticsUtils';
import {
  formatLocalDate,
  getTodayString,
  getYesterdayString,
  getDailyDeliverySheet,
  getNormalizedDriverCustomerItems
} from '../../utils/storage';
import { isNonBreadProduct } from '../../utils/productClassification';
import { homologateProductDisplay, parseTicketHour24 } from '../../utils/productionAnalytics';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Award, Search, Clock } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';

export type OverviewPeriod = 'hoy' | 'ayer' | 'semana' | 'mes';

interface SalesOverviewPanelProps {
  tickets: SaleTicket[];
  orders: BakeryOrder[];
  outflows: CashOutflowItem[];
  driverCustomers: DriverCustomer[];
  branchFilter: 'todas' | 'refugio' | 'zakia';
  initialPeriod?: OverviewPeriod;
  onSelectDay?: (dateStr: string) => void;
}

export const SalesOverviewPanel: React.FC<SalesOverviewPanelProps> = ({
  tickets,
  orders,
  outflows,
  driverCustomers,
  branchFilter,
  initialPeriod = 'semana',
  onSelectDay
}) => {
  const [period, setPeriod] = useState<OverviewPeriod>(initialPeriod);
  useEffect(() => {
    setPeriod(initialPeriod);
  }, [initialPeriod]);

  const [chartView, setChartView] = useState<'dias' | 'horas'>('dias');
  const [homologatedMode, setHomologatedMode] = useState<boolean>(true);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [productLimit, setProductLimit] = useState<number>(15);
  const [productQuery, setProductQuery] = useState<string>('');

  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();
  const isRefugio = branchFilter === 'refugio';

  const scopedTickets = useMemo(() => {
    return tickets.filter(t => {
      const isDel = isDeliveryTicket(t);
      if (!isRefugio && isDel) return false;
      if (branchFilter === 'todas') return true;
      const b = t.branch || 'refugio';
      return b === branchFilter;
    });
  }, [tickets, branchFilter, isRefugio]);

  const scopedOrders = useMemo(() => {
    return isRefugio ? orders : [];
  }, [orders, isRefugio]);

  const scopedOutflows = useMemo(() => {
    return outflows.filter(o => {
      if (branchFilter === 'todas') return true;
      return (o.branch || 'refugio') === branchFilter;
    });
  }, [outflows, branchFilter]);

  const analyticsOptions = useMemo(() => ({
    includeRepartos: isRefugio,
    includeStoreOrders: isRefugio
  }), [isRefugio]);

  const analyticsIndex = useMemo(() => {
    return buildAnalyticsDateIndex(scopedTickets, scopedOrders, scopedOutflows);
  }, [scopedTickets, scopedOrders, scopedOutflows]);

  const mondayDate = useMemo(() => getMondayOfWeek(todayStr), [todayStr]);

  const weekMetrics = useMemo(() => {
    if (period !== 'semana') return null;
    return calculateWeeklyMetrics(mondayDate, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex);
  }, [period, mondayDate, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex]);

  const monthMetrics = useMemo(() => {
    if (period !== 'mes') return null;
    return calculateMonthlyFinancialSummary(selectedYear, selectedMonthIdx, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex);
  }, [period, selectedYear, selectedMonthIdx, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex]);

  const todayMetric = useMemo(() => {
    if (period !== 'hoy') return null;
    return calculateDailyMetrics(todayStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex);
  }, [period, todayStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex]);

  const yesterdayMetric = useMemo(() => {
    if (period !== 'ayer') return null;
    return calculateDailyMetrics(yesterdayStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex);
  }, [period, yesterdayStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex]);

  // Construir gráfica de días, gráfica de horas y KPIs contundentes
  const { dayChartData, hourlyChartData, highlights, activeDateRange } = useMemo(() => {
    let rangeDates: string[] = [];
    let totalSales = 0;
    let ticketsCount = 0;
    let piecesCount = 0;
    let contextNote = '';
    let maxDay: { label: string; amount: number; date: string; pctVsAvg: number } | null = null;
    let minDay: { label: string; amount: number; date: string; pctVsAvg: number } | null = null;
    let dData: Array<{ label: string; fullLabel: string; ventas: number; pieces: number; date: string; isMax?: boolean; isMin?: boolean }> = [];

    if (period === 'hoy' || period === 'ayer') {
      const targetDate = period === 'hoy' ? todayStr : yesterdayStr;
      const metric = (period === 'hoy' ? todayMetric : yesterdayMetric) ||
        calculateDailyMetrics(targetDate, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex);
      rangeDates = [targetDate];
      totalSales = metric.totalSales;
      ticketsCount = metric.ticketsCount;
      piecesCount = metric.piecesCount;
      contextNote = period === 'hoy' ? 'Hoy' : 'Ayer';

      // Comparativo de últimos 7 días para identificar mayor y menor día
      const recentDays = [];
      const curD = new Date(todayStr + 'T12:00:00');
      for (let i = 6; i >= 0; i--) {
        const d = new Date(curD);
        d.setDate(d.getDate() - i);
        const dStr = formatLocalDate(d);
        recentDays.push(calculateDailyMetrics(dStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex));
      }
      const pastOrActiveDays = recentDays.filter(d => d.date <= todayStr);
      const nonZeroDays = pastOrActiveDays.filter(d => d.totalSales > 0);
      const pool = nonZeroDays.length > 0 ? nonZeroDays : pastOrActiveDays;
      const avg7 = pool.length > 0 ? pool.reduce((s, d) => s + d.totalSales, 0) / pool.length : 0;
      const best = pool.reduce((b, d) => (!b || d.totalSales > b.totalSales ? d : b), pool[0] || null);
      const low = pool.reduce((l, d) => (!l || d.totalSales < l.totalSales ? d : l), pool[0] || null);
      if (best) {
        maxDay = {
          label: `${best.dayShort} ${best.date.slice(5)}`,
          amount: Math.round(best.totalSales),
          date: best.date,
          pctVsAvg: avg7 > 0 ? Math.round(((best.totalSales - avg7) / avg7) * 100) : 0
        };
      }
      if (low) {
        minDay = {
          label: `${low.dayShort} ${low.date.slice(5)}`,
          amount: Math.round(low.totalSales),
          date: low.date,
          pctVsAvg: avg7 > 0 ? Math.round(((low.totalSales - avg7) / avg7) * 100) : 0
        };
      }
    } else if (period === 'semana' && weekMetrics) {
      const days = weekMetrics.days;
      rangeDates = days.map(d => d.date);
      totalSales = weekMetrics.totalSales;
      ticketsCount = weekMetrics.totalTickets;
      piecesCount = weekMetrics.totalPieces;
      contextNote = weekMetrics.weekLabel;

      const elapsedDays = days.filter(d => d.date <= todayStr);
      const activeDays = elapsedDays.filter(d => d.totalSales > 0);
      const pool = activeDays.length > 0 ? activeDays : elapsedDays;
      const avgWeek = pool.length > 0 ? pool.reduce((s, d) => s + d.totalSales, 0) / pool.length : 0;
      const best = pool.reduce((b, d) => (!b || d.totalSales > b.totalSales ? d : b), pool[0] || null);
      const low = pool.reduce((l, d) => (!l || d.totalSales < l.totalSales ? d : l), pool[0] || null);

      if (best) {
        maxDay = {
          label: `${best.dayName} ${best.dayNumber}`,
          amount: Math.round(best.totalSales),
          date: best.date,
          pctVsAvg: avgWeek > 0 ? Math.round(((best.totalSales - avgWeek) / avgWeek) * 100) : 0
        };
      }
      if (low) {
        minDay = {
          label: `${low.dayName} ${low.dayNumber}`,
          amount: Math.round(low.totalSales),
          date: low.date,
          pctVsAvg: avgWeek > 0 ? Math.round(((low.totalSales - avgWeek) / avgWeek) * 100) : 0
        };
      }

      dData = days.map(d => ({
        label: `${d.dayShort} ${d.dayNumber}`,
        fullLabel: `${d.dayName} ${d.date}`,
        ventas: Math.round(d.totalSales),
        pieces: d.piecesCount,
        date: d.date,
        isMax: best?.date === d.date && d.totalSales > 0,
        isMin: low?.date === d.date && pool.length > 1
      }));
    } else {
      const resolvedMonth = monthMetrics ||
        calculateMonthlyFinancialSummary(selectedYear, selectedMonthIdx, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex);
      const days = resolvedMonth.days;
      rangeDates = days.map(d => d.date);
      totalSales = resolvedMonth.totalSales;
      ticketsCount = resolvedMonth.ticketsCount;
      piecesCount = resolvedMonth.totalPieces;
      contextNote = `${resolvedMonth.monthName} ${selectedYear}`;

      const elapsedDays = days.filter(d => d.date <= todayStr);
      const activeDays = elapsedDays.filter(d => d.totalSales > 0);
      const pool = activeDays.length > 0 ? activeDays : elapsedDays;
      const avgMonth = pool.length > 0 ? pool.reduce((s, d) => s + d.totalSales, 0) / pool.length : 0;
      const best = pool.reduce((b, d) => (!b || d.totalSales > b.totalSales ? d : b), pool[0] || null);
      const low = pool.reduce((l, d) => (!l || d.totalSales < l.totalSales ? d : l), pool[0] || null);

      if (best) {
        maxDay = {
          label: `${best.dayName} ${best.dayNumber}`,
          amount: Math.round(best.totalSales),
          date: best.date,
          pctVsAvg: avgMonth > 0 ? Math.round(((best.totalSales - avgMonth) / avgMonth) * 100) : 0
        };
      }
      if (low) {
        minDay = {
          label: `${low.dayName} ${low.dayNumber}`,
          amount: Math.round(low.totalSales),
          date: low.date,
          pctVsAvg: avgMonth > 0 ? Math.round(((low.totalSales - avgMonth) / avgMonth) * 100) : 0
        };
      }

      dData = days.map(d => ({
        label: String(d.dayNumber),
        fullLabel: `${d.dayName} ${d.dayNumber} ${resolvedMonth.monthName}`,
        ventas: Math.round(d.totalSales),
        pieces: d.piecesCount,
        date: d.date,
        isMax: best?.date === d.date && d.totalSales > 0,
        isMin: low?.date === d.date && pool.length > 1
      }));
    }

    // Cálculo horario (06:00 a 22:00) y Balance Mañana vs Noche para el período
    const dateSet = new Set(rangeDates);
    const hourlyMap = new Map<number, { sales: number; tickets: number; pieces: number }>();
    for (let h = 6; h <= 22; h++) {
      hourlyMap.set(h, { sales: 0, tickets: 0, pieces: 0 });
    }

    let morningSales = 0;
    let nightSales = 0;
    let morningPieces = 0;
    let nightPieces = 0;

    rangeDates.forEach(dStr => {
      const tList = analyticsIndex.ticketsByDate.get(dStr) || [];
      tList.forEach(t => {
        if (!isRefugio && isDeliveryTicket(t)) return;
        const h = parseTicketHour24(t);
        const hKey = Math.min(22, Math.max(6, h));
        const cur = hourlyMap.get(hKey) || { sales: 0, tickets: 0, pieces: 0 };
        const tRev = Number(t.total) || 0;
        const tPcs = t.items.reduce((s, it) => s + (it.quantity || 0), 0);
        cur.sales += tRev;
        cur.tickets += 1;
        cur.pieces += tPcs;
        hourlyMap.set(hKey, cur);

        if (h < 15) {
          morningSales += tRev;
          morningPieces += tPcs;
        } else {
          nightSales += tRev;
          nightPieces += tPcs;
        }
      });
    });

    const maxHourSales = Math.max(...Array.from(hourlyMap.values()).map(v => v.sales), 0);
    const hData = Array.from(hourlyMap.entries()).map(([h, v]) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}h`,
      fullLabel: `${String(h).padStart(2, '0')}:00 hrs`,
      ventas: Math.round(v.sales),
      tickets: v.tickets,
      pieces: v.pieces,
      shift: h < 15 ? 'manana' : 'noche',
      isPeak: v.sales > 0 && v.sales >= maxHourSales * 0.75
    }));

    const sortedHours = [...hData].filter(h => h.ventas > 0).sort((a, b) => b.ventas - a.ventas);
    const peakHour = sortedHours[0] || null;
    const secondHour = sortedHours[1] || null;

    const shiftTotal = morningSales + nightSales;
    const morningPct = shiftTotal > 0 ? Math.round((morningSales / shiftTotal) * 100) : 0;
    const nightPct = shiftTotal > 0 ? Math.max(0, 100 - morningPct) : 0;

    return {
      dayChartData: dData,
      hourlyChartData: hData,
      highlights: {
        totalSales: Math.round(totalSales),
        ticketsCount,
        piecesCount,
        maxDay,
        minDay,
        peakHour,
        secondHour,
        morningSales: Math.round(morningSales),
        nightSales: Math.round(nightSales),
        morningPieces,
        nightPieces,
        morningPct,
        nightPct,
        contextNote
      },
      activeDateRange: rangeDates.filter(d => dateSet.has(d))
    };
  }, [period, todayStr, yesterdayStr, todayMetric, yesterdayMetric, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, analyticsIndex, weekMetrics, monthMetrics, selectedYear, selectedMonthIdx, isRefugio]);

  const effectiveView = period === 'hoy' || period === 'ayer' ? 'horas' : chartView;
  const activeChartData = effectiveView === 'horas' ? hourlyChartData : dayChartData;

  // Productos Más Vendidos (con Homologación $12 Tradicional, $18 Relleno, $50 Roscas)
  const topProducts = useMemo(() => {
    const dateSet = new Set(activeDateRange);
    const productMap = new Map<string, { name: string; quantity: number; revenue: number; isPan: boolean }>();

    const addItem = (rawName: string, qty: number, rev: number, unitPrice?: number) => {
      if (!qty || qty <= 0) return;
      const price = unitPrice != null && unitPrice > 0 ? unitPrice : rev / qty;

      if (homologatedMode) {
        const h = homologateProductDisplay({ name: rawName, price });
        const key = h.displayName.toLowerCase();
        const cur = productMap.get(key) || {
          name: h.displayName,
          quantity: 0,
          revenue: 0,
          isPan: h.isBread
        };
        cur.quantity += qty;
        cur.revenue += rev;
        productMap.set(key, cur);
      } else {
        const cleanName = (rawName || 'Pan').trim();
        const key = cleanName.toLowerCase();
        const cur = productMap.get(key) || {
          name: cleanName,
          quantity: 0,
          revenue: 0,
          isPan: !isNonBreadProduct({ name: cleanName })
        };
        cur.quantity += qty;
        cur.revenue += rev;
        productMap.set(key, cur);
      }
    };

    scopedTickets.forEach(t => {
      const tDate = extractTicketDate(t);
      if (!dateSet.has(tDate)) return;
      t.items.forEach(it => addItem(it.name, it.quantity, it.total, it.price));
    });

    if (isRefugio) {
      const ticketSheetKeys = new Set(
        scopedTickets
          .filter(t => isDeliveryTicket(t) && dateSet.has(extractTicketDate(t)))
          .map(t => t.id)
      );

      activeDateRange.forEach(dStr => {
        if (dStr > todayStr) return;
        (['madrugada', 'manana', 'tarde'] as const).forEach(shift => {
          const sheet = getDailyDeliverySheet(dStr, shift);
          driverCustomers.forEach(client => {
            if (client.driverId !== 'osvaldo' && client.driverId !== 'simon') return;
            const repId = `rep_${dStr}_${shift}_${client.id}`;
            if (ticketSheetKeys.has(repId)) return;
            const clientQ = sheet[client.id];
            if (!clientQ) return;
            const items = getNormalizedDriverCustomerItems(client);
            items.forEach(it => {
              const q = clientQ[it.breadName] || 0;
              if (q > 0) addItem(it.breadName, q, q * it.unitPrice, it.unitPrice);
            });
          });
        });
      });
    }

    const totalRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0);
    const list = Array.from(productMap.values())
      .filter(p => !productQuery.trim() || p.name.toLowerCase().includes(productQuery.trim().toLowerCase()))
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      .map(p => ({
        ...p,
        pct: totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 100) : 0
      }));

    return {
      items: list.slice(0, productLimit),
      totalCount: list.length
    };
  }, [activeDateRange, scopedTickets, isRefugio, todayStr, driverCustomers, productLimit, productQuery, homologatedMode]);

  return (
    <div className="space-y-4">
      {/* 1. GRÁFICA + MAYOR / MENOR DÍA + HORAS PICO + BALANCE MAÑANA/NOCHE */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#D95D39]" />
            <h2 className="text-sm font-black text-slate-900">
              Números Clave ({highlights.contextNote})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(period === 'semana' || period === 'mes') && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setChartView('dias')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                    chartView === 'dias' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Por Día
                </button>
                <button
                  type="button"
                  onClick={() => setChartView('horas')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                    chartView === 'horas' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Por Hora
                </button>
              </div>
            )}

            {period === 'mes' && (
              <div className="flex items-center gap-1">
                <select
                  value={selectedMonthIdx}
                  onChange={e => setSelectedMonthIdx(Number(e.target.value))}
                  className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  {MONTH_NAMES_ES.map((m, idx) => (
                    <option key={m} value={idx}>{m}</option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              {([
                { id: 'hoy', label: 'Hoy' },
                { id: 'ayer', label: 'Ayer' },
                { id: 'semana', label: 'Semana' },
                { id: 'mes', label: 'Mes' }
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPeriod(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    period === tab.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4 KPIs Contundentes */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
            <div className="text-[10px] font-bold uppercase text-slate-500">Total · Mañana vs Noche</div>
            <div className="text-lg font-black text-slate-900 tabular-nums mt-0.5">
              ${highlights.totalSales.toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] font-bold text-slate-700 tabular-nums">
              Mañana {highlights.morningPct}% · Noche {highlights.nightPct}%
            </div>
          </div>

          <button
            type="button"
            onClick={() => highlights.maxDay && onSelectDay?.(highlights.maxDay.date)}
            className="bg-emerald-50/80 hover:bg-emerald-100/70 rounded-xl p-2.5 border border-emerald-200 text-left transition-colors cursor-pointer"
          >
            <div className="text-[10px] font-black uppercase text-emerald-800 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Día Mayor Venta</span>
            </div>
            <div className="text-lg font-black text-emerald-900 tabular-nums mt-0.5">
              ${(highlights.maxDay?.amount || 0).toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] font-bold text-emerald-800 truncate tabular-nums">
              {highlights.maxDay ? `${highlights.maxDay.label} (${highlights.maxDay.pctVsAvg >= 0 ? '+' : ''}${highlights.maxDay.pctVsAvg}%)` : 'Sin datos'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => highlights.minDay && onSelectDay?.(highlights.minDay.date)}
            className="bg-rose-50/80 hover:bg-rose-100/70 rounded-xl p-2.5 border border-rose-200 text-left transition-colors cursor-pointer"
          >
            <div className="text-[10px] font-black uppercase text-rose-800 flex items-center gap-1">
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>Día Menor Venta</span>
            </div>
            <div className="text-lg font-black text-rose-900 tabular-nums mt-0.5">
              ${(highlights.minDay?.amount || 0).toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] font-bold text-rose-800 truncate tabular-nums">
              {highlights.minDay ? `${highlights.minDay.label} (${highlights.minDay.pctVsAvg}%)` : 'Sin datos'}
            </div>
          </button>

          <div className="bg-amber-50/80 rounded-xl p-2.5 border border-amber-200">
            <div className="text-[10px] font-black uppercase text-amber-900 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Hora Mayor Venta</span>
            </div>
            <div className="text-lg font-black text-amber-950 tabular-nums mt-0.5">
              {highlights.peakHour ? `${highlights.peakHour.fullLabel}` : 'Sin datos'}
            </div>
            <div className="text-[11px] font-bold text-amber-800 truncate tabular-nums">
              {highlights.peakHour
                ? `$${highlights.peakHour.ventas.toLocaleString('es-MX')}${highlights.secondHour ? ` · #2 ${highlights.secondHour.label}` : ''}`
                : '0 tickets'}
            </div>
          </div>
        </div>

        {/* Gráfica (Por Día o Por Hora) */}
        <div className="h-[215px] w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={activeChartData}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              onClick={(state: any) => {
                const payload = state?.activePayload?.[0]?.payload;
                if (effectiveView === 'dias' && payload?.date && onSelectDay && (period === 'semana' || period === 'mes')) {
                  onSelectDay(payload.date);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#475569', fontWeight: 700 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                  fontWeight: 700
                }}
                formatter={(value: any, _name: any, item: any) => [
                  `$${Number(value || 0).toLocaleString('es-MX')} (${item?.payload?.pieces || 0} pzs)`,
                  'Venta'
                ]}
                labelFormatter={(_label, items) => items?.[0]?.payload?.fullLabel || _label}
              />
              <Bar dataKey="ventas" radius={[4, 4, 0, 0]} maxBarSize={36} className="cursor-pointer">
                {activeChartData.map((entry: any, idx: number) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={
                      effectiveView === 'horas'
                        ? (entry.isPeak ? '#E11D48' : entry.shift === 'manana' ? '#F59E0B' : '#D95D39')
                        : (entry.isMax ? '#10b981' : entry.isMin ? '#f43f5e' : '#D95D39')
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. PRODUCTOS MÁS VENDIDOS (HOMOLOGADO $12 TRADICIONAL / $18 RELLENO / $50 ROSCAS) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              Productos Vendidos ({period.toUpperCase()})
            </h3>
            <span className="text-[11px] font-bold text-slate-500 tabular-nums">
              {topProducts.totalCount} grupos
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] font-black">
              <button
                type="button"
                onClick={() => setHomologatedMode(true)}
                className={`px-2 py-0.5 rounded-md cursor-pointer ${
                  homologatedMode ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                Homologado
              </button>
              <button
                type="button"
                onClick={() => setHomologatedMode(false)}
                className={`px-2 py-0.5 rounded-md cursor-pointer ${
                  !homologatedMode ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                Detallado
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar..."
                value={productQuery}
                onChange={e => setProductQuery(e.target.value)}
                className="pl-7 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 w-32 sm:w-40 font-medium"
              />
            </div>

            <button
              type="button"
              onClick={() => setProductLimit(prev => (prev === 15 ? 50 : 15))}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-black text-slate-700 cursor-pointer"
            >
              {productLimit === 15 ? 'Ver 50' : 'Top 15'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="bg-slate-100/80 text-slate-600 font-black uppercase text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-1.5 px-3 w-10">#</th>
                <th className="py-1.5 px-3">Producto</th>
                <th className="py-1.5 px-2.5">Tipo</th>
                <th className="py-1.5 px-3 text-right">Piezas</th>
                <th className="py-1.5 px-3 text-right">Venta ($)</th>
                <th className="py-1.5 px-3 text-right w-16">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topProducts.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 font-bold">
                    Sin ventas registradas en este período
                  </td>
                </tr>
              ) : (
                topProducts.items.map((p, idx) => (
                  <tr key={p.name} className="hover:bg-amber-50/40">
                    <td className="py-1.5 px-3 font-black text-slate-500">{idx + 1}</td>
                    <td className="py-1.5 px-3 font-bold text-slate-900">{p.name}</td>
                    <td className="py-1.5 px-2.5 text-[11px] font-bold text-slate-600">
                      {p.isPan ? 'Pan' : 'Otros'}
                    </td>
                    <td className="py-1.5 px-3 text-right font-black text-slate-800">{p.quantity.toLocaleString('es-MX')}</td>
                    <td className="py-1.5 px-3 text-right font-black text-emerald-700">
                      ${Math.round(p.revenue).toLocaleString('es-MX')}
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold text-slate-500">{p.pct}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
