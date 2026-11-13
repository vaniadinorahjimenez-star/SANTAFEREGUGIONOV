import React, { useState, useMemo } from 'react';
import { SaleTicket, BakeryOrder, CashOutflowItem, OperationalExpense, SupplierBill } from '../../types';
import { 
  calculateWeeklyMetrics, 
  getMondayOfWeek, 
  formatFriendlyDate,
  DayMetricItem,
  calculateDailyRepartoDetails
} from '../../utils/salesAnalyticsUtils';
import { getTodayString } from '../../utils/storage';
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
  ArrowRight,
  PackageCheck,
  Milk,
  IceCream2,
  PieChart,
  Truck,
  ShoppingBag
} from 'lucide-react';
import { isNonBreadProduct } from '../../utils/productClassification';
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
  operationalExpenses?: OperationalExpense[];
  supplierBills?: SupplierBill[];
  hideRepartos?: boolean;
  onSelectDay?: (dateStr: string) => void;
}

export const WeeklySalesView: React.FC<WeeklySalesViewProps> = ({
  tickets,
  orders,
  outflows,
  operationalExpenses,
  supplierBills,
  hideRepartos = false,
  onSelectDay
}) => {
  // Fecha de referencia para elegir cualquier semana (por defecto hoy)
  const [referenceDateStr, setReferenceDateStr] = useState<string>(() => getTodayString());
  const [chartMode, setChartMode] = useState<'rubros' | 'financiero'>('rubros');

  // Calcular el lunes correspondiente a la fecha de referencia
  const mondayDate = useMemo(() => {
    return getMondayOfWeek(referenceDateStr);
  }, [referenceDateStr]);

  const isCurrentWeek = useMemo(() => {
    const thisMondayStr = getMondayOfWeek(getTodayString()).toISOString().split('T')[0];
    const curMondayStr = mondayDate.toISOString().split('T')[0];
    return thisMondayStr === curMondayStr;
  }, [mondayDate]);

  const handlePrevWeek = () => {
    const d = new Date(referenceDateStr + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    setReferenceDateStr(d.toISOString().split('T')[0]);
  };

  const handleNextWeek = () => {
    const d = new Date(referenceDateStr + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    setReferenceDateStr(d.toISOString().split('T')[0]);
  };

  const handleThisWeek = () => {
    setReferenceDateStr(getTodayString());
  };

  const handleQuickWeek = (weeksAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - (weeksAgo * 7));
    setReferenceDateStr(d.toISOString().split('T')[0]);
  };

  // Métricas de la semana seleccionada
  const weekData = useMemo(() => {
    return calculateWeeklyMetrics(mondayDate, tickets, orders, outflows);
  }, [mondayDate, tickets, orders, outflows]);

  const sundayDateStr = useMemo(() => {
    return weekData.days[6]?.date || mondayDate.toISOString().split('T')[0];
  }, [weekData, mondayDate]);

  const mondayDateStr = useMemo(() => {
    return weekData.days[0]?.date || mondayDate.toISOString().split('T')[0];
  }, [weekData, mondayDate]);

  // Sumas por Rubro Semanal
  const totalMostrador = useMemo(() => {
    return weekData.days.reduce((acc, d) => acc + d.mostradorSales, 0);
  }, [weekData]);

  const totalReparto = useMemo(() => {
    return weekData.days.reduce((acc, d) => acc + d.orderSales, 0);
  }, [weekData]);

  const mostradorPct = weekData.totalSales > 0 ? Math.round((totalMostrador / weekData.totalSales) * 100) : 0;
  const repartoPct = weekData.totalSales > 0 ? Math.round((totalReparto / weekData.totalSales) * 100) : 0;

  // Desglose semanal de choferes de reparto (Simón vs Osvaldo: números reales del módulo de reparto)
  const driverWeeklyStats = useMemo(() => {
    let simonTotal = 0;
    let simonPieces = 0;
    let osvaldoTotal = 0;
    let osvaldoPieces = 0;
    let totalRoutes = 0;

    weekData.days.forEach(d => {
      const details = calculateDailyRepartoDetails(d.date, tickets, orders);
      simonTotal += details.simonTotal;
      simonPieces += details.simonPieces;
      osvaldoTotal += details.osvaldoTotal;
      osvaldoPieces += details.osvaldoPieces;
      totalRoutes += details.routesCount;
    });

    const driversTotal = simonTotal + osvaldoTotal;
    const simonPct = driversTotal > 0 ? Math.round((simonTotal / driversTotal) * 100) : 0;
    const osvaldoPct = driversTotal > 0 ? Math.max(0, 100 - simonPct) : 0;

    const piecesTotal = simonPieces + osvaldoPieces;
    const simonPiecesPct = piecesTotal > 0 ? Math.round((simonPieces / piecesTotal) * 100) : 0;
    const osvaldoPiecesPct = piecesTotal > 0 ? Math.max(0, 100 - simonPiecesPct) : 0;

    return {
      simon: { total: simonTotal, pieces: simonPieces, pct: simonPct, piecesPct: simonPiecesPct },
      osvaldo: { total: osvaldoTotal, pieces: osvaldoPieces, pct: osvaldoPct, piecesPct: osvaldoPiecesPct },
      combined: driversTotal,
      combinedPieces: piecesTotal,
      totalRoutes
    };
  }, [weekData, tickets, orders]);

  // Gastos operativos semanales registrados en el nuevo módulo
  const weekOperationalExpenses = useMemo(() => {
    return (operationalExpenses || [])
      .filter(e => e.date >= mondayDateStr && e.date <= sundayDateStr)
      .reduce((acc, e) => acc + e.amount, 0);
  }, [operationalExpenses, mondayDateStr, sundayDateStr]);

  const totalWeekGastos = weekData.totalOutflows + weekOperationalExpenses;
  const netProfitWeek = weekData.totalSales - totalWeekGastos;
  const profitMarginWeek = weekData.totalSales > 0 ? Math.round((netProfitWeek / weekData.totalSales) * 100) : 0;

  // Datos para el gráfico de barras de los 7 días
  const chartData = useMemo(() => {
    return weekData.days.map(d => {
      const dayOps = (operationalExpenses || [])
        .filter(e => e.date === d.date)
        .reduce((sum, e) => sum + e.amount, 0);
      const dayGastos = d.outflows + dayOps;
      const dayNet = d.totalSales - dayGastos;
      return {
        name: d.dayShort,
        fullName: d.dayName,
        date: d.date,
        mostrador: d.mostradorSales,
        reparto: d.orderSales,
        total: d.totalSales,
        gastos: dayGastos,
        utilidad: Math.max(0, dayNet),
        isBest: d.isBestDay
      };
    });
  }, [weekData, operationalExpenses]);

  // Desglose de Productos No Pan (Para Pago a Proveedores: Paletas, Quesos, Natas, Postres, etc.)
  const vendorProductsSummary = useMemo(() => {
    const sundayDate = weekData.days[6]?.date || mondayDate;
    const weekTickets = tickets.filter(t => t.date >= mondayDate && t.date <= sundayDate);
    
    const productMap = new Map<string, {
      name: string;
      category: string;
      quantity: number;
      total: number;
    }>();

    weekTickets.forEach(ticket => {
      ticket.items.forEach(it => {
        if (isNonBreadProduct(it)) {
          const rawName = (it.name || '').trim();
          const cleanName = rawName.replace(/\(\$\d+(\.\d+)?\)/g, '').trim();
          const lower = cleanName.toLowerCase();

          let category = 'Otros Proveedores';
          if (lower.includes('paleta')) category = 'Paletas Heladas';
          else if (lower.includes('queso')) category = 'Quesos';
          else if (lower.includes('nata') || lower.includes('miel') || lower.includes('cajeta') || lower.includes('cafe') || lower.includes('café') || lower.includes('complemento')) category = 'Complementos';
          else if (lower.includes('gelatina') || lower.includes('arroz') || lower.includes('postre') || lower.includes('pastel') || lower.includes('tarta') || lower.includes('domo')) category = 'Postres & Gelatinas';
          else if (lower.includes('leche') || lower.includes('alpura') || lower.includes('santa clara') || lower.includes('lala') || lower.includes('yogurt') || lower.includes('crema')) category = 'Lácteos';
          else if (lower.includes('coca') || lower.includes('refresco') || lower.includes('jugo') || lower.includes('agua') || lower.includes('bebida')) category = 'Refrescos & Bebidas';

          const key = cleanName.toLowerCase();
          const existing = productMap.get(key);
          const itemTotal = it.total || (it.quantity * it.price);

          if (existing) {
            existing.quantity += it.quantity;
            existing.total += itemTotal;
          } else {
            productMap.set(key, {
              name: cleanName,
              category,
              quantity: it.quantity,
              total: itemTotal
            });
          }
        }
      });
    });

    const list = Array.from(productMap.values()).sort((a, b) => b.total - a.total);
    const totalVendorPieces = list.reduce((sum, item) => sum + item.quantity, 0);
    const totalVendorMoney = list.reduce((sum, item) => sum + item.total, 0);

    const categoriesMap: Record<string, { pieces: number; total: number; icon: string }> = {
      'Paletas Heladas': { pieces: 0, total: 0, icon: '🍦' },
      'Quesos': { pieces: 0, total: 0, icon: '🧀' },
      'Complementos': { pieces: 0, total: 0, icon: '🍯' },
      'Natas': { pieces: 0, total: 0, icon: '🥛' },
      'Postres & Gelatinas': { pieces: 0, total: 0, icon: '🍮' },
      'Lácteos': { pieces: 0, total: 0, icon: '🍶' },
      'Refrescos & Bebidas': { pieces: 0, total: 0, icon: '🥤' },
      'Otros Proveedores': { pieces: 0, total: 0, icon: '📦' }
    };

    list.forEach(p => {
      const cat = categoriesMap[p.category] || categoriesMap['Otros Proveedores'];
      cat.pieces += p.quantity;
      cat.total += p.total;
    });

    return {
      list,
      totalVendorPieces,
      totalVendorMoney,
      categoriesMap
    };
  }, [tickets, mondayDate, weekData]);

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

          {/* Navegación y Selector de Semanas */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Selector por fecha exacta */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl">
              <label htmlFor="week-date-picker" className="text-[11px] font-bold text-slate-500 whitespace-nowrap flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#D95D39]" />
                <span className="hidden sm:inline">Elegir Semana:</span>
              </label>
              <input
                id="week-date-picker"
                type="date"
                value={referenceDateStr}
                onChange={(e) => {
                  if (e.target.value) setReferenceDateStr(e.target.value);
                }}
                className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-black text-slate-800 cursor-pointer focus:ring-2 focus:ring-[#D95D39] focus:outline-none"
                title="Selecciona cualquier día para ver su semana correspondiente"
              />
            </div>

            {/* Navegación rápida */}
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1">
              <button
                type="button"
                onClick={handlePrevWeek}
                className="p-1.5 hover:bg-white rounded-xl text-slate-700 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                title="Semana anterior (-7 días)"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden md:inline">Anterior</span>
              </button>

              <button
                type="button"
                onClick={handleThisWeek}
                className={`px-3 py-1 text-xs font-black rounded-xl transition-all cursor-pointer ${
                  isCurrentWeek ? 'bg-[#D95D39] text-white shadow-2xs' : 'hover:bg-white text-slate-700'
                }`}
                title="Ir a la semana en curso"
              >
                Esta Semana
              </button>

              <button
                type="button"
                onClick={() => handleQuickWeek(1)}
                className="hidden lg:inline-block px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title="Semana pasada"
              >
                -1 Sem
              </button>

              <button
                type="button"
                onClick={() => handleQuickWeek(2)}
                className="hidden lg:inline-block px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title="Hace 2 semanas"
              >
                -2 Sem
              </button>

              <button
                type="button"
                onClick={handleNextWeek}
                className="p-1.5 hover:bg-white rounded-xl text-slate-700 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                title="Semana siguiente (+7 días)"
              >
                <span className="hidden md:inline">Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Banner de Rango de Fechas */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-black text-slate-800">
            <Calendar className="w-4 h-4 text-[#D95D39]" />
            <span className="text-sm text-slate-900">{weekData.weekLabel}</span>
            <span className="text-slate-500 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
              {weekData.startDate} al {weekData.endDate}
            </span>
            {isCurrentWeek && (
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Semana Actual
              </span>
            )}
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

      {/* 2. Tarjetas Métricas Semanales por Rubro y Totales */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${hideRepartos ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-3.5`}>
        {/* Card 1: Mostrador Semanal */}
        <div className="bg-white p-4.5 rounded-3xl border border-amber-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <span>🥖 Mostrador Semanal</span>
            </span>
            <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
              {mostradorPct}% Total
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              ${totalMostrador.toLocaleString('es-MX')}.00
            </div>
            <div className="mt-2 pt-2 border-t border-amber-100 flex items-center justify-between text-xs font-bold">
              <span className="text-emerald-700">💵 Efec: ${weekData.totalCash.toLocaleString('es-MX')}</span>
              <span className="text-blue-700">💳 Tarj: ${weekData.totalCard.toLocaleString('es-MX')}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Reparto Semanal (Simón & Osvaldo) */}
        {!hideRepartos && (
          <div className="bg-white p-4.5 rounded-3xl border border-blue-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                <span>🛵 Reparto Semanal</span>
              </span>
              <span className="text-[10px] font-black bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full">
                {repartoPct}% Total
              </span>
            </div>
            <div className="mt-2.5">
              <div className="text-2xl sm:text-3xl font-black text-blue-900 tracking-tight">
                ${totalReparto.toLocaleString('es-MX')}.00
              </div>
              <div className="mt-2 pt-2 border-t border-blue-100 space-y-1 text-[11px] font-bold">
                <div className="flex items-center justify-between text-indigo-950">
                  <span>🛵 Simón: <strong>${driverWeeklyStats.simon.total.toLocaleString('es-MX')}</strong> <span className="text-indigo-600 font-extrabold">({driverWeeklyStats.simon.pct}%)</span></span>
                  <span className="text-slate-600 text-[10px]">{driverWeeklyStats.simon.pieces} pzs ({driverWeeklyStats.simon.piecesPct}%)</span>
                </div>
                <div className="flex items-center justify-between text-cyan-950">
                  <span>🛵 Osvaldo: <strong>${driverWeeklyStats.osvaldo.total.toLocaleString('es-MX')}</strong> <span className="text-cyan-700 font-extrabold">({driverWeeklyStats.osvaldo.pct}%)</span></span>
                  <span className="text-slate-600 text-[10px]">{driverWeeklyStats.osvaldo.pieces} pzs ({driverWeeklyStats.osvaldo.piecesPct}%)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Card 3: Suma Total General Semanal */}
        <div className="bg-white p-4.5 rounded-3xl border-2 border-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <span>💰 Suma Total General</span>
            </span>
            <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-full">
              100% Venta
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              ${weekData.totalSales.toLocaleString('es-MX')}.00
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Total Piezas: <strong className="text-[#D95D39]">{weekData.totalPieces.toLocaleString('es-MX')} pzs</strong></span>
              <span>{weekData.totalTickets} operaciones</span>
            </div>
          </div>
        </div>

        {/* Card 4: Gastos & Utilidad Neta Semanal */}
        <div className={`p-4.5 rounded-3xl shadow-md relative overflow-hidden ${
          netProfitWeek >= 0 
            ? 'bg-gradient-to-br from-emerald-600 to-teal-800 text-white' 
            : 'bg-gradient-to-br from-rose-600 to-red-800 text-white'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/90">
              Utilidad Neta Semanal
            </span>
            <span className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
              {profitMarginWeek}% Margen
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              ${netProfitWeek.toLocaleString('es-MX')}.00
            </div>
            <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between text-xs text-white/90 font-medium">
              <span>Gastos: -${totalWeekGastos.toLocaleString('es-MX')}.00</span>
              <span className="text-[11px] bg-white/20 px-1.5 py-0.5 rounded font-black">
                {netProfitWeek >= 0 ? 'Rentable' : 'Déficit'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Gráficas Semanales por Rubro y Financiero */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-black text-slate-900 text-base">
              {chartMode === 'rubros'
                ? (hideRepartos ? 'Gráfica de Ventas Mostrador Semanal' : 'Gráfica por Rubros: Mostrador vs Reparto vs Total')
                : 'Gráfica Financiera: Ventas vs Gastos vs Utilidad Neta'}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Comportamiento diario de Lunes a Domingo con desglose exacto
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 text-xs font-black">
              <button
                type="button"
                onClick={() => setChartMode('rubros')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  chartMode === 'rubros' 
                    ? 'bg-white text-slate-900 shadow-xs font-black' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {hideRepartos ? '🥖 Mostrador' : '🥖🛵 Por Rubro'}
              </button>
              <button
                type="button"
                onClick={() => setChartMode('financiero')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  chartMode === 'financiero' 
                    ? 'bg-white text-slate-900 shadow-xs font-black' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                💰📉 Financiero
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-3 text-xs font-bold pl-2">
              {chartMode === 'rubros' ? (
                <>
                  <span className="flex items-center gap-1 text-amber-700">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#D95D39]"></span>
                    Mostrador
                  </span>
                  {!hideRepartos && (
                    <span className="flex items-center gap-1 text-blue-700">
                      <span className="w-2.5 h-2.5 rounded-sm bg-blue-600"></span>
                      Reparto
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-slate-900">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-800"></span>
                    Total
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1 text-[#D95D39]">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#D95D39]"></span>
                    Venta
                  </span>
                  <span className="flex items-center gap-1 text-rose-600">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
                    Gastos
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
                    Utilidad
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="h-68 w-full">
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
                formatter={(value: any, name: any) => {
                  const labelMap: Record<string, string> = {
                    mostrador: 'Mostrador',
                    reparto: 'Reparto',
                    total: 'Venta Total',
                    gastos: 'Gastos Operativos',
                    utilidad: 'Utilidad Neta'
                  };
                  return [
                    `$${Number(value || 0).toLocaleString('es-MX')}.00`,
                    labelMap[name] || name
                  ];
                }}
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
              {chartMode === 'rubros' ? (
                <>
                  <Bar dataKey="mostrador" name="mostrador" fill="#D95D39" radius={[5, 5, 0, 0]} />
                  {!hideRepartos && <Bar dataKey="reparto" name="reparto" fill="#3B82F6" radius={[5, 5, 0, 0]} />}
                  <Bar dataKey="total" name="total" fill="#0F172A" radius={[5, 5, 0, 0]} />
                </>
              ) : (
                <>
                  <Bar dataKey="total" name="total" fill="#D95D39" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="gastos" name="gastos" fill="#F43F5E" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="utilidad" name="utilidad" fill="#10B981" radius={[5, 5, 0, 0]} />
                </>
              )}
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
                {!hideRepartos && <th className="py-3 px-3 text-right">Pedidos / Reparto</th>}
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
                  {!hideRepartos && (
                    <td className="py-3 px-3 text-right text-slate-700 font-semibold">
                      ${d.orderSales.toLocaleString('es-MX')}.00
                    </td>
                  )}
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
                <td className="py-3.5 px-3" colSpan={hideRepartos ? 3 : 4}>
                  {hideRepartos ? 'TOTAL DE LA SEMANA (Mostrador)' : 'TOTAL DE LA SEMANA (Mostrador + Reparto)'}
                </td>
                <td className="py-3.5 px-3 text-right text-amber-300 font-black">
                  ${weekData.totalSales.toLocaleString('es-MX')}.00
                </td>
                <td className="py-3.5 px-3 text-right text-rose-300 font-black">
                  ${totalWeekGastos.toLocaleString('es-MX')}.00
                </td>
                <td className="py-3.5 px-3 text-right text-emerald-400 font-black text-sm">
                  ${netProfitWeek.toLocaleString('es-MX')}.00
                </td>
                <td className="py-3.5 px-3 text-center text-slate-200">
                  {weekData.totalPieces} pzs
                </td>
                <td className="py-3.5 px-3 text-center text-slate-200">
                  {weekData.totalTickets}
                </td>
                <td className="py-3.5 px-3 text-center text-emerald-300">
                  {profitMarginWeek}% Margen
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 5. SECCIÓN PROVEEDORES: DESGLOSE DE PRODUCTOS NO PAN (Paletas, Quesos, Natas, Postres, etc.) */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-900 border border-purple-300 flex items-center justify-center font-bold text-lg">
              📦
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base leading-tight">
                Desglose para Pago a Proveedores (Productos No Pan)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Ventas de paletas, quesos, natas, postres y bebidas para liquidar a proveedores esta semana
              </p>
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 px-3.5 py-1.5 rounded-2xl flex items-center gap-2">
            <span className="text-xs text-purple-900 font-bold">Total a Proveedores:</span>
            <span className="text-base font-black font-mono text-purple-950">
              ${vendorProductsSummary.totalVendorMoney.toLocaleString('es-MX')}.00
            </span>
            <span className="text-[11px] text-purple-700 font-bold">
              ({vendorProductsSummary.totalVendorPieces} arts)
            </span>
          </div>
        </div>

        {/* Resumen Rápido por Categoría (Tarjetas Limpias) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          {Object.entries(vendorProductsSummary.categoriesMap).map(([catName, data]: [string, { pieces: number; total: number; icon: string }]) => {
            if (data.pieces === 0) return null;
            return (
              <div 
                key={catName}
                className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 space-y-1 hover:border-purple-300 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 truncate" title={catName}>
                  <span>{data.icon}</span>
                  <span className="truncate">{catName}</span>
                </div>
                <div className="text-base font-black font-mono text-slate-900">
                  ${data.total.toLocaleString('es-MX')}.00
                </div>
                <div className="text-[10px] font-bold text-slate-500">
                  {data.pieces} vendidos
                </div>
              </div>
            );
          })}
        </div>

        {/* Tabla Limpia de Artículos No Pan */}
        <div className="overflow-x-auto">
          {vendorProductsSummary.list.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 font-bold">
              No se registraron ventas de productos no pan (paletas, quesos, etc.) en esta semana.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-black border-y border-slate-200">
                  <th className="py-2.5 px-3">Proveedor / Categoría</th>
                  <th className="py-2.5 px-3">Producto</th>
                  <th className="py-2.5 px-3 text-center">Unidades Vendidas</th>
                  <th className="py-2.5 px-3 text-right">Total a Liquidar ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {vendorProductsSummary.list.map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <span className="inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-900">
                        {it.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {it.name}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                      {it.quantity} pzs
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                      ${it.total.toLocaleString('es-MX')}.00
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black text-xs text-slate-900 border-t-2 border-slate-200">
                  <td colSpan={2} className="py-3 px-3">TOTAL GENERAL A PROVEEDORES</td>
                  <td className="py-3 px-3 text-center font-mono">
                    {vendorProductsSummary.totalVendorPieces} piezas
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-purple-900 text-sm">
                    ${vendorProductsSummary.totalVendorMoney.toLocaleString('es-MX')}.00
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
