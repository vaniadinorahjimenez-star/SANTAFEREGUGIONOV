import React, { useState, useMemo } from 'react';
import { SaleTicket, BakeryOrder, CashOutflowItem } from '../../types';
import { 
  calculateWeeklyMetrics, 
  getMondayOfWeek, 
  formatFriendlyDate,
  DayMetricItem
} from '../../utils/salesAnalyticsUtils';
import { 
  Calendar, 
  TrendingUp, 
  DollarSign, 
  ChevronLeft, 
  ChevronRight, 
  Award, 
  Receipt, 
  Banknote, 
  CreditCard,
  Wheat,
  Clock,
  ArrowRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';

interface WeeklySalesViewProps {
  tickets: SaleTicket[];
  orders: BakeryOrder[];
  outflows?: CashOutflowItem[];
  onSelectDay?: (dateStr: string) => void;
}

export const WeeklySalesView: React.FC<WeeklySalesViewProps> = ({
  tickets,
  orders,
  outflows,
  onSelectDay
}) => {
  // Offset de semanas relativas a la actual (0 = semana actual, -1 = semana anterior, etc.)
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Calcular el lunes correspondiente al offset
  const mondayDate = useMemo(() => {
    const today = new Date();
    today.setDate(today.getDate() + (weekOffset * 7));
    const todayStr = today.toISOString().split('T')[0];
    return getMondayOfWeek(todayStr);
  }, [weekOffset]);

  // Métricas de la semana seleccionada
  const weekData = useMemo(() => {
    return calculateWeeklyMetrics(mondayDate, tickets, orders, outflows);
  }, [mondayDate, tickets, orders, outflows]);

  // Datos para el gráfico de barras de los 7 días
  const chartData = useMemo(() => {
    return weekData.days.map(d => ({
      name: d.dayShort,
      fullName: d.dayName,
      date: d.date,
      ventas: d.totalSales,
      gastos: d.outflows,
      ganancia: Math.max(0, d.netProfit),
      isBest: d.isBestDay
    }));
  }, [weekData]);

  return (
    <div className="space-y-6">
      {/* 1. Header con Selector de Semanas */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📆</span>
              <h2 className="text-xl font-black text-slate-900">
                Historial de Ventas Semanal
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Comparativa de ventas, gastos y utilidades de Lunes a Domingo
            </p>
          </div>

          {/* Navegación de Semanas */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => setWeekOffset(prev => prev - 1)}
              className="p-1.5 hover:bg-white rounded-xl text-slate-700 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
              title="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Anterior</span>
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className={`px-3 py-1 text-xs font-black rounded-xl transition-all ${
                weekOffset === 0 ? 'bg-[#D95D39] text-white shadow-2xs' : 'hover:bg-white text-slate-700'
              }`}
            >
              Esta Semana
            </button>

            <button
              type="button"
              onClick={() => setWeekOffset(prev => prev + 1)}
              className="p-1.5 hover:bg-white rounded-xl text-slate-700 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
              title="Semana siguiente"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Banner de Rango de Fechas */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-black text-slate-800">
            <Calendar className="w-4 h-4 text-[#D95D39]" />
            <span className="text-sm text-slate-900">{weekData.weekLabel}</span>
            <span className="text-slate-400 font-normal">({weekData.startDate} al {weekData.endDate})</span>
          </div>

          {weekData.bestDay && (
            <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-950 border border-amber-300 px-3 py-1 rounded-xl text-xs font-black">
              <span>🏆 Mejor Día:</span>
              <span className="text-amber-800 font-black">{weekData.bestDay.dayName}</span>
              <span className="text-emerald-700">(${weekData.bestDay.sales.toLocaleString('es-MX')})</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Tarjetas Métricas Semanales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Ventas Totales de la Semana */}
        <div className="bg-white p-4.5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Ventas de la Semana
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-sm font-bold">
              🥖
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              ${weekData.totalSales.toLocaleString('es-MX')}.00
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
              <span className="text-emerald-700">💵 Efec: ${weekData.totalCash.toLocaleString('es-MX')}</span>
              <span className="text-blue-700">💳 Tarj: ${weekData.totalCard.toLocaleString('es-MX')}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Salidas y Gastos a Proveedores */}
        <div className="bg-white p-4.5 rounded-3xl border border-rose-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-rose-800">
              Gastos Semanales
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center text-sm font-bold">
              📉
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-rose-700 tracking-tight">
              ${weekData.totalOutflows.toLocaleString('es-MX')}.00
            </div>
            <div className="mt-2 pt-2 border-t border-rose-100 text-xs text-rose-800 font-medium">
              Pagos de harina, gas, mantenimiento e insumos.
            </div>
          </div>
        </div>

        {/* Card 3: Ganancia Neta Semanal */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 text-white p-4.5 rounded-3xl shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-100">
              Ganancia Neta Semanal
            </span>
            <span className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
              {weekData.profitMargin}% Margen
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              ${weekData.netProfit.toLocaleString('es-MX')}.00
            </div>
            <div className="mt-2 pt-2 border-t border-white/20 text-xs text-emerald-100 font-medium flex items-center justify-between">
              <span>Utilidad libre de la semana</span>
              <span>{weekData.totalTickets} ventas</span>
            </div>
          </div>
        </div>

        {/* Card 4: Promedio Diario y Piezas */}
        <div className="bg-white p-4.5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Promedio Diario & Piezas
            </span>
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center text-sm font-bold">
              📊
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              ${weekData.averageDailySales.toLocaleString('es-MX')} <span className="text-sm font-bold text-slate-500">/ día</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Total Piezas:</span>
              <span className="text-[#D95D39] font-black">{weekData.totalPieces.toLocaleString('es-MX')} pzs</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Gráfico Interactivo de los 7 Días de la Semana */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-black text-slate-900 text-base">
              Ventas y Ganancias de Lunes a Domingo
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Comportamiento diario de la semana seleccionada
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-amber-600">
              <span className="w-3 h-3 rounded-md bg-[#D95D39]"></span>
              Ventas
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="w-3 h-3 rounded-md bg-emerald-500"></span>
              Ganancias
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fontWeight: 700, fill: '#64748B' }}
                axisLine={{ stroke: '#E2E8F0' }}
              />
              <YAxis 
                tick={{ fontSize: 11, fontWeight: 600, fill: '#94A3B8' }}
                axisLine={{ stroke: '#E2E8F0' }}
                tickFormatter={(val) => `$${val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                formatter={(value: any, name: any) => [
                  `$${Number(value || 0).toLocaleString('es-MX')}.00`,
                  name === 'ventas' ? 'Venta Total' : 'Ganancia Neta'
                ]}
                labelFormatter={(label, payload) => {
                  const item = payload && payload[0] ? (payload[0].payload as any) : null;
                  return item ? `${item.fullName} (${item.date})` : label;
                }}
                contentStyle={{
                  backgroundColor: '#1E293B',
                  borderRadius: '16px',
                  color: '#FFF',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  border: 'none',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)'
                }}
              />
              <Bar dataKey="ventas" name="ventas" fill="#D95D39" radius={[6, 6, 0, 0]} />
              <Bar dataKey="ganancia" name="ganancia" fill="#10B981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Tabla Comparativa de los 7 Días */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
        <h3 className="font-black text-slate-900 text-base mb-3">
          Detalle Diario de la Semana
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-black border-y border-slate-200">
                <th className="py-3 px-3">Día</th>
                <th className="py-3 px-3">Fecha</th>
                <th className="py-3 px-3 text-right">Venta Mostrador</th>
                <th className="py-3 px-3 text-right">Pedidos / Reparto</th>
                <th className="py-3 px-3 text-right text-slate-900 font-black">Total Ventas</th>
                <th className="py-3 px-3 text-right text-rose-700">Gastos</th>
                <th className="py-3 px-3 text-right text-emerald-800 font-black">Ganancia Neta</th>
                <th className="py-3 px-3 text-center">Piezas</th>
                <th className="py-3 px-3 text-center">Tickets</th>
                <th className="py-3 px-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {weekData.days.map((d) => (
                <tr 
                  key={d.date}
                  className={`hover:bg-slate-50 transition-colors ${
                    d.isBestDay ? 'bg-amber-50/40' : ''
                  }`}
                >
                  <td className="py-3 px-3 font-black text-slate-900 flex items-center gap-1.5">
                    <span>{d.dayName}</span>
                    {d.isBestDay && (
                      <span className="text-[9px] bg-amber-400 text-amber-950 font-black px-1.5 py-0.2 rounded-full uppercase" title="Día con más venta de la semana">
                        🏆 Mejor
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500 font-mono">
                    {d.date}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 font-semibold">
                    ${d.mostradorSales.toLocaleString('es-MX')}.00
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 font-semibold">
                    ${d.orderSales.toLocaleString('es-MX')}.00
                  </td>
                  <td className="py-3 px-3 text-right font-black text-slate-900">
                    ${d.totalSales.toLocaleString('es-MX')}.00
                  </td>
                  <td className="py-3 px-3 text-right text-rose-700 font-semibold">
                    ${d.outflows.toLocaleString('es-MX')}.00
                  </td>
                  <td className="py-3 px-3 text-right font-black text-emerald-700 text-sm">
                    ${d.netProfit.toLocaleString('es-MX')}.00
                  </td>
                  <td className="py-3 px-3 text-center text-slate-600 font-bold">
                    {d.piecesCount}
                  </td>
                  <td className="py-3 px-3 text-center text-slate-500">
                    {d.ticketsCount}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {onSelectDay ? (
                      <button
                        type="button"
                        onClick={() => onSelectDay(d.date)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-[#D95D39] hover:text-white rounded-lg text-[11px] font-black text-slate-700 transition-colors cursor-pointer"
                        title="Ver detalle por día"
                      >
                        <span>Ver Día</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-black text-xs">
                <td className="py-3.5 px-3" colSpan={4}>TOTAL DE LA SEMANA</td>
                <td className="py-3.5 px-3 text-right text-amber-300 font-black">
                  ${weekData.totalSales.toLocaleString('es-MX')}.00
                </td>
                <td className="py-3.5 px-3 text-right text-rose-300 font-black">
                  ${weekData.totalOutflows.toLocaleString('es-MX')}.00
                </td>
                <td className="py-3.5 px-3 text-right text-emerald-400 font-black text-sm">
                  ${weekData.netProfit.toLocaleString('es-MX')}.00
                </td>
                <td className="py-3.5 px-3 text-center text-slate-200">
                  {weekData.totalPieces} pzs
                </td>
                <td className="py-3.5 px-3 text-center text-slate-200">
                  {weekData.totalTickets}
                </td>
                <td className="py-3.5 px-3 text-center text-emerald-300">
                  {weekData.profitMargin}% Margen
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
