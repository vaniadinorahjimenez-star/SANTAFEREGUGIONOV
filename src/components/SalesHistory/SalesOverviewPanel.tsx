import React, { useMemo, useState } from 'react';
import { SaleTicket, BakeryOrder, CashOutflowItem, DriverCustomer } from '../../types';
import {
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
  getDailyDeliverySheet
} from '../../utils/storage';
import { isNonBreadProduct } from '../../utils/productClassification';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Award, Search } from 'lucide-react';
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

function parseTicketHour(t: SaleTicket): number {
  const timeStr = (t.time || '').trim().toUpperCase();
  if (timeStr) {
    const clean = timeStr.replace(/[^0-9:]/g, '');
    const parts = clean.split(':');
    let h = parseInt(parts[0] || '0', 10);
    if ((timeStr.includes('PM') || timeStr.includes('P.M.')) && h < 12) h += 12;
    if ((timeStr.includes('AM') || timeStr.includes('A.M.')) && h === 12) h = 0;
    if (!isNaN(h) && h >= 0 && h <= 23) return h;
  }
  if (t.timestamp) {
    const d = new Date(t.timestamp);
    if (!isNaN(d.getTime())) return d.getHours();
  }
  return 12;
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
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [productLimit, setProductLimit] = useState<number>(15);
  const [productQuery, setProductQuery] = useState<string>('');

  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();
  const isZakia = branchFilter === 'zakia';

  // Tickets filtrados estrictamente por sucursal (en Zakia solo mostrador)
  const scopedTickets = useMemo(() => {
    return tickets.filter(t => {
      const isDel = isDeliveryTicket(t);
      if (isZakia && isDel) return false;
      if (branchFilter === 'todas') return true;
      const b = t.branch || 'refugio';
      return b === branchFilter;
    });
  }, [tickets, branchFilter, isZakia]);

  const scopedOrders = useMemo(() => {
    return isZakia ? [] : orders;
  }, [orders, isZakia]);

  const scopedOutflows = useMemo(() => {
    return outflows.filter(o => {
      if (branchFilter === 'todas') return true;
      return (o.branch || 'refugio') === branchFilter;
    });
  }, [outflows, branchFilter]);

  const analyticsOptions = useMemo(() => ({
    includeRepartos: !isZakia,
    includeStoreOrders: !isZakia
  }), [isZakia]);

  // Datos diarios para Semana / Mes (también usados para Mayor y Menor día)
  const mondayDate = useMemo(() => getMondayOfWeek(todayStr), [todayStr]);

  const weekMetrics = useMemo(() => {
    return calculateWeeklyMetrics(mondayDate, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions);
  }, [mondayDate, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions]);

  const monthMetrics = useMemo(() => {
    return calculateMonthlyFinancialSummary(selectedYear, selectedMonthIdx, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions);
  }, [selectedYear, selectedMonthIdx, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions]);

  const todayMetric = useMemo(() => {
    return calculateDailyMetrics(todayStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions);
  }, [todayStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions]);

  const yesterdayMetric = useMemo(() => {
    return calculateDailyMetrics(yesterdayStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions);
  }, [yesterdayStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions]);

  // Construir gráfica + Mayor/Menor día según período
  const { chartData, highlights, activeDateRange } = useMemo(() => {
    if (period === 'hoy' || period === 'ayer') {
      const targetDate = period === 'hoy' ? todayStr : yesterdayStr;
      const metric = period === 'hoy' ? todayMetric : yesterdayMetric;
      const dayTickets = scopedTickets.filter(t => extractTicketDate(t) === targetDate && !isDeliveryTicket(t));

      // Agrupar ventas por franjas horarias de 07:00 a 22:00
      const hourlyMap = new Map<number, { sales: number; tickets: number; pieces: number }>();
      for (let h = 7; h <= 22; h++) {
        hourlyMap.set(h, { sales: 0, tickets: 0, pieces: 0 });
      }
      dayTickets.forEach(t => {
        const h = Math.min(22, Math.max(7, parseTicketHour(t)));
        const cur = hourlyMap.get(h) || { sales: 0, tickets: 0, pieces: 0 };
        cur.sales += t.total || 0;
        cur.tickets += 1;
        cur.pieces += t.items.reduce((s, it) => s + (it.quantity || 0), 0);
        hourlyMap.set(h, cur);
      });

      const hours = Array.from(hourlyMap.entries()).map(([h, v]) => ({
        label: `${String(h).padStart(2, '0')}h`,
        fullLabel: `${String(h).padStart(2, '0')}:00 hrs`,
        ventas: Math.round(v.sales),
        tickets: v.tickets,
        pieces: v.pieces,
        date: targetDate
      }));

      // También comparar contra los últimos 7 días para dar Día Mayor / Menor útil si ven un día solo
      const recentDays = [];
      const curD = new Date(todayStr + 'T12:00:00');
      for (let i = 6; i >= 0; i--) {
        const d = new Date(curD);
        d.setDate(d.getDate() - i);
        const dStr = formatLocalDate(d);
        recentDays.push(calculateDailyMetrics(dStr, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions));
      }
      const pastOrActiveDays = recentDays.filter(d => d.date <= todayStr);
      const nonZeroDays = pastOrActiveDays.filter(d => d.totalSales > 0);
      const pool = nonZeroDays.length > 0 ? nonZeroDays : pastOrActiveDays;
      const maxDay = pool.reduce((best, d) => (!best || d.totalSales > best.totalSales ? d : best), pool[0] || null);
      const minDay = pool.reduce((low, d) => (!low || d.totalSales < low.totalSales ? d : low), pool[0] || null);

      return {
        chartData: hours,
        highlights: {
          totalSales: metric.totalSales,
          ticketsCount: metric.ticketsCount,
          piecesCount: metric.piecesCount,
          average: dayTickets.length > 0 ? Math.round(metric.mostradorSales / dayTickets.length) : 0,
          avgLabel: 'Ticket promedio',
          maxDay: maxDay ? { label: `${maxDay.dayShort} ${maxDay.date.slice(5)}`, amount: maxDay.totalSales, date: maxDay.date } : null,
          minDay: minDay ? { label: `${minDay.dayShort} ${minDay.date.slice(5)}`, amount: minDay.totalSales, date: minDay.date } : null,
          contextNote: 'Comparativo últimos 7 días'
        },
        activeDateRange: [targetDate]
      };
    }

    if (period === 'semana') {
      const days = weekMetrics.days;
      const elapsedDays = days.filter(d => d.date <= todayStr);
      const activeDays = elapsedDays.filter(d => d.totalSales > 0);
      const pool = activeDays.length > 0 ? activeDays : elapsedDays;

      const maxDay = pool.reduce((best, d) => (!best || d.totalSales > best.totalSales ? d : best), pool[0] || null);
      const minDay = pool.reduce((low, d) => (!low || d.totalSales < low.totalSales ? d : low), pool[0] || null);

      const data = days.map(d => ({
        label: `${d.dayShort} ${d.dayNumber}`,
        fullLabel: `${d.dayName} ${d.date}`,
        ventas: Math.round(d.totalSales),
        mostrador: Math.round(d.mostradorSales),
        reparto: Math.round(d.orderSales),
        tickets: d.ticketsCount,
        pieces: d.piecesCount,
        date: d.date,
        isMax: maxDay?.date === d.date && d.totalSales > 0,
        isMin: minDay?.date === d.date && elapsedDays.length > 1
      }));

      return {
        chartData: data,
        highlights: {
          totalSales: weekMetrics.totalSales,
          ticketsCount: weekMetrics.totalTickets,
          piecesCount: weekMetrics.totalPieces,
          average: pool.length > 0 ? Math.round(weekMetrics.totalSales / pool.length) : 0,
          avgLabel: 'Promedio diario',
          maxDay: maxDay ? { label: `${maxDay.dayName} ${maxDay.dayNumber}`, amount: maxDay.totalSales, date: maxDay.date } : null,
          minDay: minDay ? { label: `${minDay.dayName} ${minDay.dayNumber}`, amount: minDay.totalSales, date: minDay.date } : null,
          contextNote: weekMetrics.weekLabel
        },
        activeDateRange: days.map(d => d.date)
      };
    }

    // MES
    const days = monthMetrics.days;
    const elapsedDays = days.filter(d => d.date <= todayStr);
    const activeDays = elapsedDays.filter(d => d.totalSales > 0);
    const pool = activeDays.length > 0 ? activeDays : elapsedDays;

    const maxDay = pool.reduce((best, d) => (!best || d.totalSales > best.totalSales ? d : best), pool[0] || null);
    const minDay = pool.reduce((low, d) => (!low || d.totalSales < low.totalSales ? d : low), pool[0] || null);

    const data = days.map(d => ({
      label: String(d.dayNumber),
      fullLabel: `${d.dayName} ${d.dayNumber} ${monthMetrics.monthName}`,
      ventas: Math.round(d.totalSales),
      tickets: d.ticketsCount,
      pieces: d.piecesCount,
      date: d.date,
      isMax: maxDay?.date === d.date && d.totalSales > 0,
      isMin: minDay?.date === d.date && elapsedDays.length > 1
    }));

    return {
      chartData: data,
      highlights: {
        totalSales: monthMetrics.totalSales,
        ticketsCount: monthMetrics.ticketsCount,
        piecesCount: monthMetrics.totalPieces,
        average: pool.length > 0 ? Math.round(monthMetrics.totalSales / pool.length) : 0,
        avgLabel: 'Promedio diario',
        maxDay: maxDay ? { label: `${maxDay.dayName} ${maxDay.dayNumber}`, amount: maxDay.totalSales, date: maxDay.date } : null,
        minDay: minDay ? { label: `${minDay.dayName} ${minDay.dayNumber}`, amount: minDay.totalSales, date: minDay.date } : null,
        contextNote: `${monthMetrics.monthName} ${selectedYear}`
      },
      activeDateRange: days.map(d => d.date)
    };
  }, [period, todayStr, yesterdayStr, todayMetric, yesterdayMetric, scopedTickets, scopedOrders, scopedOutflows, analyticsOptions, weekMetrics, monthMetrics, selectedYear]);

  // Productos Más Vendidos en el período activo de la gráfica
  const topProducts = useMemo(() => {
    const dateSet = new Set(activeDateRange);
    const productMap = new Map<string, { name: string; quantity: number; revenue: number; isPan: boolean }>();

    const addItem = (rawName: string, qty: number, rev: number) => {
      if (!qty || qty <= 0) return;
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
    };

    // 1. Tickets de Mostrador (+ tickets de reparto si no es Zakia)
    scopedTickets.forEach(t => {
      const tDate = extractTicketDate(t);
      if (!dateSet.has(tDate)) return;
      t.items.forEach(it => addItem(it.name, it.quantity, it.total));
    });

    // 2. Hojas de Reparto diarias (solo El Refugio / Todas) si no están duplicadas en tickets
    if (!isZakia) {
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
            const items = client.items && client.items.length > 0 ? client.items : [
              { breadName: 'Bolillo', unitPrice: 4.00 },
              { breadName: 'Dulce', unitPrice: 8.50 }
            ];
            items.forEach(it => {
              const q = clientQ[it.breadName] || 0;
              if (q > 0) addItem(it.breadName, q, q * it.unitPrice);
            });
          });
        });
      });
    }

    const totalRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0);
    const list = Array.from(productMap.values())
      .filter(p => !productQuery.trim() || p.name.toLowerCase().includes(productQuery.trim().toLowerCase()))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .map(p => ({
        ...p,
        pct: totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 100) : 0
      }));

    return {
      items: list.slice(0, productLimit),
      totalCount: list.length
    };
  }, [activeDateRange, scopedTickets, isZakia, todayStr, driverCustomers, productLimit, productQuery]);

  return (
    <div className="space-y-4">
      {/* 1. GRÁFICA + DATOS RELEVANTES + MAYOR / MENOR VENTA */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#D95D39]" />
            <h2 className="text-sm font-black text-slate-900">
              Ventas y Tendencia ({highlights.contextNote})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {period === 'mes' && (
              <div className="flex items-center gap-1 mr-1">
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

        {/* 4 KPIs relevantes: Total, Promedio, Mayor Venta, Menor Venta */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
            <div className="text-[10px] font-bold uppercase text-slate-500">Total Período</div>
            <div className="text-lg font-black text-slate-900 tabular-nums mt-0.5">
              ${highlights.totalSales.toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] font-bold text-slate-500">
              {highlights.ticketsCount} tks • {highlights.piecesCount} pzs
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
            <div className="text-[10px] font-bold uppercase text-slate-500">{highlights.avgLabel}</div>
            <div className="text-lg font-black text-slate-900 tabular-nums mt-0.5">
              ${highlights.average.toLocaleString('es-MX')}
            </div>
            <div className="text-[11px] font-bold text-slate-500">
              {isZakia ? 'Solo Mostrador' : 'Mostrador + Reparto + VIP'}
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
            <div className="text-[11px] font-bold text-emerald-700 truncate">
              {highlights.maxDay?.label || 'Sin datos'}
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
            <div className="text-[11px] font-bold text-rose-700 truncate">
              {highlights.minDay?.label || 'Sin datos'}
            </div>
          </button>
        </div>

        {/* Gráfica */}
        <div className="h-[220px] w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              onClick={(state: any) => {
                const payload = state?.activePayload?.[0]?.payload;
                if (payload?.date && onSelectDay && (period === 'semana' || period === 'mes')) {
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
                formatter={(value: any) => [`$${Number(value || 0).toLocaleString('es-MX')}`, 'Ventas']}
                labelFormatter={(_label, items) => items?.[0]?.payload?.fullLabel || _label}
              />
              <Bar dataKey="ventas" radius={[4, 4, 0, 0]} maxBarSize={36} className="cursor-pointer">
                {chartData.map((entry: any, idx: number) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={
                      entry.isMax
                        ? '#10b981'
                        : entry.isMin
                        ? '#f43f5e'
                        : '#D95D39'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. PRODUCTOS MÁS VENDIDOS (FILAS COMPACTAS) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              Productos Más Vendidos ({period.toUpperCase()})
            </h3>
            <span className="text-[11px] font-bold text-slate-500">
              {topProducts.totalCount} productos
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar producto..."
                value={productQuery}
                onChange={e => setProductQuery(e.target.value)}
                className="pl-7 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 w-36 sm:w-44 font-medium"
              />
            </div>
            <button
              type="button"
              onClick={() => setProductLimit(prev => (prev === 15 ? 50 : 15))}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-black text-slate-700 cursor-pointer"
            >
              {productLimit === 15 ? 'Ver Top 50' : 'Ver Top 15'}
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
                    <td className="py-1.5 px-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.isPan ? 'bg-amber-100 text-amber-900' : 'bg-purple-100 text-purple-900'
                      }`}>
                        {p.isPan ? 'Pan' : 'Otros'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-right font-black text-slate-800">{p.quantity}</td>
                    <td className="py-1.5 px-3 text-right font-black text-emerald-700">
                      ${p.revenue.toLocaleString('es-MX')}
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
