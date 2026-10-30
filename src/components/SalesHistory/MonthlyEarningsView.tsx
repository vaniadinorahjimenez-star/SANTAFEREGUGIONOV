import React, { useState, useMemo } from 'react';
import { SaleTicket, BakeryOrder, CashOutflowItem } from '../../types';
import { 
  MONTH_NAMES_ES, 
  calculateMonthlyFinancialSummary, 
  calculateYearFinancialSummary,
  formatFriendlyDate 
} from '../../utils/salesAnalyticsUtils';
import { 
  TrendingUp, 
  Banknote, 
  CreditCard, 
  Receipt, 
  Calendar, 
  Award, 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  PieChart as PieIcon, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  CheckCircle2, 
  Wheat, 
  ShoppingBag,
  Info
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
  AreaChart,
  Area
} from 'recharts';

interface MonthlyEarningsViewProps {
  tickets: SaleTicket[];
  orders: BakeryOrder[];
  outflows?: CashOutflowItem[];
  onSelectDay?: (dateStr: string) => void;
}

export const MonthlyEarningsView: React.FC<MonthlyEarningsViewProps> = ({
  tickets,
  orders,
  outflows,
  onSelectDay
}) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(currentMonthIdx);

  // Resumen del mes seleccionado
  const monthData = useMemo(() => {
    return calculateMonthlyFinancialSummary(selectedYear, selectedMonthIdx, tickets, orders, outflows);
  }, [selectedYear, selectedMonthIdx, tickets, orders, outflows]);

  // Resumen anual completo
  const yearData = useMemo(() => {
    return calculateYearFinancialSummary(selectedYear, tickets, orders, outflows);
  }, [selectedYear, tickets, orders, outflows]);

  // Datos para el gráfico anual de los 12 meses
  const annualChartData = useMemo(() => {
    return yearData.months.map(m => ({
      name: m.monthName.slice(0, 3),
      fullName: m.monthName,
      ventas: m.totalSales,
      gastos: m.totalOutflows,
      ganancia: Math.max(0, m.netProfit),
      isCurrent: m.isCurrentMonth,
      isSelected: m.monthIndex === selectedMonthIdx
    }));
  }, [yearData, selectedMonthIdx]);

  // Datos para el gráfico de semanas del mes
  const weeksChartData = useMemo(() => {
    return monthData.weeks.map(w => ({
      name: `Sem ${w.weekNumber}`,
      ventas: w.totalSales,
      gastos: w.totalOutflows,
      ganancia: Math.max(0, w.netProfit),
      label: w.weekLabel
    }));
  }, [monthData]);

  return (
    <div className="space-y-6">
      {/* 1. Header con Selector de Año y Meses */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📈</span>
              <h2 className="text-xl font-black text-slate-900">
                Ganancias Mensuales Panadería Santa Fé
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Desglose de ingresos, salidas de caja a proveedores y utilidad neta mes por mes
            </p>
          </div>

          {/* Selector de Año */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => setSelectedYear(prev => prev - 1)}
              className="p-1.5 hover:bg-white rounded-xl text-slate-600 transition-colors"
              title="Año anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-black text-sm text-slate-800">
              Año {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => setSelectedYear(prev => prev + 1)}
              className="p-1.5 hover:bg-white rounded-xl text-slate-600 transition-colors"
              title="Año siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de 12 Meses (Enero, Febrero, Marzo, etc.) */}
        <div className="pt-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Selecciona el mes para ver sus ganancias:
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {MONTH_NAMES_ES.map((name, idx) => {
              const isSelected = selectedMonthIdx === idx;
              const isCurrent = selectedYear === currentYear && currentMonthIdx === idx;
              const monthSummary = yearData.months[idx];
              const hasSales = monthSummary.totalSales > 0;

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedMonthIdx(idx)}
                  className={`p-2.5 rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer text-center relative ${
                    isSelected
                      ? 'bg-gradient-to-b from-[#D95D39] to-amber-600 text-white shadow-md scale-102 ring-2 ring-orange-300'
                      : isCurrent
                      ? 'bg-amber-50 text-amber-950 border border-amber-300 hover:bg-amber-100'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {isCurrent && !isSelected && (
                    <span className="absolute -top-1.5 -right-1 px-1 bg-emerald-500 text-white text-[8px] font-black rounded-full uppercase tracking-tighter">
                      Actual
                    </span>
                  )}
                  <span className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                    {name}
                  </span>
                  <span className={`text-[10px] font-bold mt-0.5 ${
                    isSelected 
                      ? 'text-amber-100' 
                      : hasSales 
                      ? 'text-emerald-700 font-extrabold' 
                      : 'text-slate-400'
                  }`}>
                    ${monthSummary.totalSales.toLocaleString('es-MX')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Tarjetas Métricas Ejecutivas del Mes Seleccionado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Ventas Brutas del Mes */}
        <div className="bg-white p-4.5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span>🥖 Ventas Brutas ({monthData.monthName})</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-sm font-bold">
              💰
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              ${monthData.totalSales.toLocaleString('es-MX')}.00
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="text-emerald-700">💵 Efec: ${monthData.cashSales.toLocaleString('es-MX')}</span>
              <span className="text-blue-700">💳 Tarj: ${monthData.cardSales.toLocaleString('es-MX')}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span>Mostrador: ${monthData.mostradorSales.toLocaleString('es-MX')}</span>
              <span>Encargos: ${monthData.ordersSales.toLocaleString('es-MX')}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Salidas y Gastos a Proveedores */}
        <div className="bg-white p-4.5 rounded-3xl border border-rose-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
              <span>🧾 Gastos y Salidas del Mes</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center text-sm font-bold">
              📉
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-rose-700 tracking-tight">
              ${monthData.totalOutflows.toLocaleString('es-MX')}.00
            </div>
            <div className="mt-2 pt-2 border-t border-rose-100 text-xs text-rose-800 font-medium">
              Pagos registrados de harina, gas, mantenimiento y proveedores.
            </div>
          </div>
        </div>

        {/* Card 3: Ganancia Neta Real (Utilidad) */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 text-white p-4.5 rounded-3xl shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-100 flex items-center gap-1.5">
              <span>🏆 Ganancia Neta Real</span>
            </span>
            <span className="bg-white/20 backdrop-blur-xs text-white text-[10px] font-black px-2 py-0.5 rounded-full">
              {monthData.profitMargin}% Margen
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              ${monthData.netProfit.toLocaleString('es-MX')}.00
            </div>
            <div className="mt-2 pt-2 border-t border-white/20 text-xs text-emerald-100 font-medium flex items-center justify-between">
              <span>Utilidad libre en caja</span>
              <span>{monthData.ticketsCount} ventas</span>
            </div>
          </div>
        </div>

        {/* Card 4: Volumen de Pan y Ticket Promedio */}
        <div className="bg-white p-4.5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span>🍞 Piezas y Ticket Promedio</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center text-sm font-bold">
              🧺
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {monthData.totalPieces.toLocaleString('es-MX')} <span className="text-base font-normal text-slate-500">piezas</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Ticket Promedio:</span>
              <span className="text-[#D95D39] text-sm font-black">${monthData.averageTicket}.00</span>
            </div>
            {monthData.bestDay && (
              <div className="mt-1 text-[11px] text-emerald-700 font-bold truncate">
                Día récord: {monthData.bestDay.dayName} (${monthData.bestDay.amount.toLocaleString('es-MX')})
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Gráficos Comparativos: Ganancias por Mes a lo largo del Año y Desglose por Semanas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Gráfico 1: Evolución Anual Mes por Mes (2 Columnas) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-black text-slate-900 text-base">
                Comparativa Anual de Ventas vs Ganancias ({selectedYear})
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Ventas brutas y ganancia neta mes con mes de Enero a Diciembre
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
              <BarChart data={annualChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                    name === 'ventas' ? 'Ventas Brutas' : 'Ganancia Neta'
                  ]}
                  labelFormatter={(label, payload) => {
                    const item = payload && payload[0] ? (payload[0].payload as any) : null;
                    return item ? `${item.fullName} ${selectedYear}` : label;
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

        {/* Gráfico 2: Desglose por Semanas del Mes Seleccionado */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <h3 className="font-black text-slate-900 text-base">
              Ganancias por Semana ({monthData.monthName})
            </h3>
            <p className="text-xs text-slate-500 font-medium mb-3">
              Rendimiento semanal del mes seleccionado
            </p>

            <div className="space-y-3">
              {monthData.weeks.map(w => {
                const maxWeekSales = Math.max(...monthData.weeks.map(item => item.totalSales), 1);
                const percent = Math.min(100, Math.round((w.totalSales / maxWeekSales) * 100));

                return (
                  <div key={w.weekNumber} className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-800">{w.weekLabel}</span>
                      <span className="text-emerald-700 font-black">
                        +${w.netProfit.toLocaleString('es-MX')}
                      </span>
                    </div>
                    {/* Barra de progreso */}
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium mt-1">
                      <span>Ventas: ${w.totalSales.toLocaleString('es-MX')}</span>
                      <span>Gastos: ${w.totalOutflows.toLocaleString('es-MX')}</span>
                      <span>{w.totalPieces} pzs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-slate-700">
            <span>Total Ganancia {monthData.monthName}:</span>
            <span className="text-emerald-700 text-base">${monthData.netProfit.toLocaleString('es-MX')}.00</span>
          </div>
        </div>
      </div>

      {/* 4. Tabla Anual Consolidada de los 12 Meses */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-black text-slate-900 text-base">
              Tabla Anual Consolidada de Ganancias ({selectedYear})
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Ventas brutas, salidas y utilidad neta mes por mes
            </p>
          </div>
          {yearData.bestMonth && (
            <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-950 px-3 py-1.5 rounded-xl text-xs font-black">
              <span>🥇 Mejor Mes:</span>
              <strong className="text-amber-800">{yearData.bestMonth.name}</strong>
              <span className="text-emerald-700">(${yearData.bestMonth.profit.toLocaleString('es-MX')} ganancia)</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-black border-y border-slate-200">
                <th className="py-3 px-3">Mes</th>
                <th className="py-3 px-3 text-right">Venta Mostrador + Pedidos</th>
                <th className="py-3 px-3 text-right">Efectivo</th>
                <th className="py-3 px-3 text-right">Tarjeta</th>
                <th className="py-3 px-3 text-right">Gastos / Proveedores</th>
                <th className="py-3 px-3 text-right text-emerald-800 font-black">Ganancia Neta</th>
                <th className="py-3 px-3 text-center">Margen</th>
                <th className="py-3 px-3 text-center">Piezas</th>
                <th className="py-3 px-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {yearData.months.map((m) => {
                const isSelected = m.monthIndex === selectedMonthIdx;
                const isBest = yearData.bestMonth && yearData.bestMonth.name === m.monthName;

                return (
                  <tr 
                    key={m.monthName}
                    className={`transition-colors ${
                      isSelected ? 'bg-amber-50/60 font-bold' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-3 font-black text-slate-900 flex items-center gap-1.5">
                      <span>{m.monthName}</span>
                      {isBest && <span title="Mes récord del año">🥇</span>}
                      {m.isCurrentMonth && (
                        <span className="text-[9px] font-black bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full">
                          Actual
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-slate-900">
                      ${m.totalSales.toLocaleString('es-MX')}.00
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-700 font-semibold">
                      ${m.cashSales.toLocaleString('es-MX')}.00
                    </td>
                    <td className="py-3 px-3 text-right text-blue-700 font-semibold">
                      ${m.cardSales.toLocaleString('es-MX')}.00
                    </td>
                    <td className="py-3 px-3 text-right text-rose-700 font-semibold">
                      ${m.totalOutflows.toLocaleString('es-MX')}.00
                    </td>
                    <td className="py-3 px-3 text-right font-black text-emerald-700 text-sm">
                      ${m.netProfit.toLocaleString('es-MX')}.00
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        m.profitMargin >= 30 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {m.profitMargin}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center text-slate-600">
                      {m.totalPieces.toLocaleString('es-MX')}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedMonthIdx(m.monthIndex)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-[#D95D39] text-white shadow-2xs' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {isSelected ? 'Viendo' : 'Ver Mes'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-black text-xs">
                <td className="py-3.5 px-3">TOTAL ANUAL {selectedYear}</td>
                <td className="py-3.5 px-3 text-right text-amber-300 font-black">
                  ${yearData.totalSales.toLocaleString('es-MX')}.00
                </td>
                <td className="py-3.5 px-3 text-right text-slate-300">
                  -
                </td>
                <td className="py-3.5 px-3 text-right text-slate-300">
                  -
                </td>
                <td className="py-3.5 px-3 text-right text-rose-300 font-black">
                  ${yearData.totalOutflows.toLocaleString('es-MX')}.00
                </td>
                <td className="py-3.5 px-3 text-right text-emerald-400 font-black text-sm">
                  ${yearData.netProfit.toLocaleString('es-MX')}.00
                </td>
                <td className="py-3.5 px-3 text-center text-emerald-300">
                  {yearData.averageMargin}% Prom
                </td>
                <td className="py-3.5 px-3 text-center text-slate-200">
                  {yearData.totalPieces.toLocaleString('es-MX')} pzs
                </td>
                <td className="py-3.5 px-3 text-center text-slate-400">
                  {yearData.totalTickets} ventas
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
