import React, { useState, useMemo, useEffect } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  DollarSign, 
  Package, 
  Trophy, 
  TrendingUp, 
  Clock, 
  RefreshCw,
  Award,
  Sun,
  Moon
} from 'lucide-react';
import { SaleTicket, BakeryOrder, DriverCustomer } from '../../types';
import { loadTickets, loadOrders, loadDriverCustomers, getTodayString } from '../../utils/storage';
import { calculateDailyRepartoDetails, MONTH_NAMES_ES, SHORT_DAY_NAMES_ES } from '../../utils/salesAnalyticsUtils';
import { fetchDailyDeliveryFromFirestore } from '../../services/firebase';

interface DeliveryComparisonChartProps {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  driverCustomers?: DriverCustomer[];
  onSelectDate?: (dateStr: string) => void;
  currentSelectedDate?: string;
}

export const DeliveryComparisonChart: React.FC<DeliveryComparisonChartProps> = ({
  tickets: propTickets,
  orders: propOrders,
  driverCustomers: propDriverCustomers,
  onSelectDate,
  currentSelectedDate
}) => {
  const todayStr = getTodayString();
  const [anchorDate, setAnchorDate] = useState<string>(currentSelectedDate || todayStr);
  const [periodMode, setPeriodMode] = useState<'semana' | 'mes' | 'dia'>('semana');
  const [metricMode, setMetricMode] = useState<'dinero' | 'piezas'>('dinero');
  const [syncVersion, setSyncVersion] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Escuchar sincronización en tiempo real
  useEffect(() => {
    const handleUpdate = () => {
      setSyncVersion(v => v + 1);
    };
    window.addEventListener('dailyDeliveryUpdated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('dailyDeliveryUpdated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const allTickets = propTickets || loadTickets();
  const allOrders = propOrders || loadOrders();

  // Calcular lista de fechas a mostrar según el modo (Semana, Mes, Día)
  const dateRange = useMemo(() => {
    const cur = new Date(`${anchorDate}T12:00:00`);

    if (periodMode === 'dia') {
      return [anchorDate];
    }

    if (periodMode === 'semana') {
      // Calcular Lunes de la semana
      const day = cur.getDay(); // 0 es Domingo
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(cur);
      monday.setDate(cur.getDate() + diffToMonday);

      const days: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dt = String(d.getDate()).padStart(2, '0');
        days.push(`${y}-${m}-${dt}`);
      }
      return days;
    }

    // Modo Mes (Todas las fechas del mes)
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: string[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const m = String(month + 1).padStart(2, '0');
      const dt = String(i).padStart(2, '0');
      days.push(`${year}-${m}-${dt}`);
    }
    return days;
  }, [anchorDate, periodMode]);

  // Asegurar que las fechas visibles descarguen datos de Firestore si faltan
  useEffect(() => {
    dateRange.slice(0, 14).forEach(dStr => {
      fetchDailyDeliveryFromFirestore(dStr, 'manana').catch(() => {});
      fetchDailyDeliveryFromFirestore(dStr, 'tarde').catch(() => {});
    });
  }, [dateRange]);

  // Generar datos para la gráfica
  const chartData = useMemo(() => {
    return dateRange.map(dStr => {
      const details = calculateDailyRepartoDetails(dStr, allTickets, allOrders);
      const dObj = new Date(`${dStr}T12:00:00`);
      const dayShort = SHORT_DAY_NAMES_ES[dObj.getDay()];
      const dayNum = dObj.getDate();
      const monthShort = MONTH_NAMES_ES[dObj.getMonth()]?.substring(0, 3) || '';

      const isToday = dStr === todayStr;
      const isSelected = dStr === anchorDate;

      // Simón
      const simonManana = metricMode === 'dinero' ? details.simonMananaMoney : details.simonMananaPieces;
      const simonTarde = metricMode === 'dinero' ? details.simonTardeMoney : details.simonTardePieces;
      const simonTotal = metricMode === 'dinero' ? details.simonTotal : details.simonPieces;

      // Osvaldo
      const osvaldoManana = metricMode === 'dinero' ? details.osvaldoMananaMoney : details.osvaldoMananaPieces;
      const osvaldoTarde = metricMode === 'dinero' ? details.osvaldoTardeMoney : details.osvaldoTardePieces;
      const osvaldoTotal = metricMode === 'dinero' ? details.osvaldoTotal : details.osvaldoPieces;

      const label = periodMode === 'mes'
        ? `${dayNum}`
        : `${dayShort} ${dayNum}`;

      return {
        date: dStr,
        label,
        fullDateLabel: `${dayShort} ${dayNum} de ${monthShort}`,
        isToday,
        isSelected,
        // Simón (Barra 1)
        simonManana,
        simonTarde,
        simonTotal,
        // Osvaldo (Barra 2)
        osvaldoManana,
        osvaldoTarde,
        osvaldoTotal,
        // Ganador del día
        leader: simonTotal > osvaldoTotal ? 'simon' : (osvaldoTotal > simonTotal ? 'osvaldo' : 'empate'),
        diff: Math.abs(simonTotal - osvaldoTotal)
      };
    });
  }, [dateRange, allTickets, allOrders, metricMode, periodMode, todayStr, anchorDate, syncVersion]);

  // Totales consolidados del período para estadísticas y toma de decisiones
  const summaryStats = useMemo(() => {
    let simonMoney = 0;
    let simonPieces = 0;
    let simonMananaMoney = 0;
    let simonTardeMoney = 0;
    let simonDaysWon = 0;

    let osvaldoMoney = 0;
    let osvaldoPieces = 0;
    let osvaldoMananaMoney = 0;
    let osvaldoTardeMoney = 0;
    let osvaldoDaysWon = 0;

    chartData.forEach(item => {
      const details = calculateDailyRepartoDetails(item.date, allTickets, allOrders);
      simonMoney += details.simonTotal;
      simonPieces += details.simonPieces;
      simonMananaMoney += details.simonMananaMoney;
      simonTardeMoney += details.simonTardeMoney;

      osvaldoMoney += details.osvaldoTotal;
      osvaldoPieces += details.osvaldoPieces;
      osvaldoMananaMoney += details.osvaldoMananaMoney;
      osvaldoTardeMoney += details.osvaldoTardeMoney;

      if (details.simonTotal > details.osvaldoTotal) simonDaysWon++;
      else if (details.osvaldoTotal > details.simonTotal) osvaldoDaysWon++;
    });

    const totalMoney = simonMoney + osvaldoMoney;
    const totalPieces = simonPieces + osvaldoPieces;

    const simonMoneyPct = totalMoney > 0 ? Math.round((simonMoney / totalMoney) * 100) : 0;
    const osvaldoMoneyPct = totalMoney > 0 ? Math.max(0, 100 - simonMoneyPct) : 0;

    const simonPiecesPct = totalPieces > 0 ? Math.round((simonPieces / totalPieces) * 100) : 0;
    const osvaldoPiecesPct = totalPieces > 0 ? Math.max(0, 100 - simonPiecesPct) : 0;

    const daysCount = chartData.length || 1;
    const simonAvgMoney = Math.round(simonMoney / daysCount);
    const osvaldoAvgMoney = Math.round(osvaldoMoney / daysCount);

    const winner = simonMoney > osvaldoMoney ? 'simon' : (osvaldoMoney > simonMoney ? 'osvaldo' : 'empate');
    const moneyDiff = Math.abs(simonMoney - osvaldoMoney);
    const piecesDiff = Math.abs(simonPieces - osvaldoPieces);

    return {
      simonMoney,
      simonPieces,
      simonMananaMoney,
      simonTardeMoney,
      simonMoneyPct,
      simonPiecesPct,
      simonAvgMoney,
      simonDaysWon,
      osvaldoMoney,
      osvaldoPieces,
      osvaldoMananaMoney,
      osvaldoTardeMoney,
      osvaldoMoneyPct,
      osvaldoPiecesPct,
      osvaldoAvgMoney,
      osvaldoDaysWon,
      totalMoney,
      totalPieces,
      winner,
      moneyDiff,
      piecesDiff
    };
  }, [chartData, allTickets, allOrders]);

  // Controles de navegación temporal
  const handleNavigatePeriod = (delta: number) => {
    const cur = new Date(`${anchorDate}T12:00:00`);
    if (periodMode === 'dia') {
      cur.setDate(cur.getDate() + delta);
    } else if (periodMode === 'semana') {
      cur.setDate(cur.getDate() + (delta * 7));
    } else if (periodMode === 'mes') {
      cur.setMonth(cur.getMonth() + delta);
    }
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    setAnchorDate(`${y}-${m}-${d}`);
  };

  const periodTitle = useMemo(() => {
    const cur = new Date(`${anchorDate}T12:00:00`);
    const monthName = MONTH_NAMES_ES[cur.getMonth()];
    const year = cur.getFullYear();

    if (periodMode === 'dia') {
      const dayShort = SHORT_DAY_NAMES_ES[cur.getDay()];
      return `${dayShort} ${cur.getDate()} de ${monthName} ${year}`;
    }
    if (periodMode === 'mes') {
      return `${monthName} ${year} (Mes Completo)`;
    }
    if (dateRange.length >= 7) {
      const first = new Date(`${dateRange[0]}T12:00:00`);
      const last = new Date(`${dateRange[6]}T12:00:00`);
      return `Semana: ${first.getDate()} ${MONTH_NAMES_ES[first.getMonth()]?.substring(0, 3)} - ${last.getDate()} ${MONTH_NAMES_ES[last.getMonth()]?.substring(0, 3)} ${year}`;
    }
    return `${monthName} ${year}`;
  }, [anchorDate, periodMode, dateRange]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setSyncVersion(v => v + 1);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-4">
      {/* 1. BARRA SUPERIOR DE CONTROL: TÍTULO, SELECTOR DE PERÍODO Y SELECTOR DE MÉTRICA */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Comparativa de Ventas: Simón vs Osvaldo
            </h2>
            <span className="bg-blue-100 text-blue-900 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-200 uppercase">
              Rutas y Choferes
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Desglose apilado de entregas por turno (Mañana + Tarde) para tomar decisiones de ventas
          </p>
        </div>

        {/* Controles de Vista: Semana, Mes, Día + Métrica ($ o Piezas) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Modo de Tiempo */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPeriodMode('semana')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                periodMode === 'semana'
                  ? 'bg-white text-slate-900 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📅 Semana
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('mes')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                periodMode === 'mes'
                  ? 'bg-white text-slate-900 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🗓️ Mes (30 días)
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('dia')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                periodMode === 'dia'
                  ? 'bg-white text-slate-900 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📍 Día
            </button>
          </div>

          {/* Selector de Métrica: Dinero vs Piezas */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMetricMode('dinero')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                metricMode === 'dinero'
                  ? 'bg-emerald-600 text-white shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Ver montos en dinero ($)"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Dinero ($)</span>
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('piezas')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                metricMode === 'piezas'
                  ? 'bg-amber-600 text-white shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Ver cantidad de piezas de pan"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Piezas (pzs)</span>
            </button>
          </div>

          {/* Navegador Temporal */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-1.5 py-1 text-xs">
            <button
              type="button"
              onClick={() => handleNavigatePeriod(-1)}
              className="p-1 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
              title="Período anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-800 px-1 text-[11.5px] whitespace-nowrap">
              {periodTitle}
            </span>
            <button
              type="button"
              onClick={() => handleNavigatePeriod(1)}
              className="p-1 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
              title="Período siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate(todayStr)}
              className="ml-1 text-[10.5px] font-bold text-blue-700 hover:underline px-1"
              title="Regresar a hoy"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer ml-1"
              title="Actualizar datos en tiempo real"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. BANNER DE LIDERAZGO Y TARJETAS DE DECISIÓN: QUIÉN VENDE MÁS */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
        {/* Banner de Ganador / Líder */}
        <div className={`md:col-span-4 rounded-2xl p-4 flex flex-col justify-between text-white shadow-xs ${
          summaryStats.winner === 'simon'
            ? 'bg-gradient-to-br from-blue-700 via-indigo-700 to-blue-900'
            : summaryStats.winner === 'osvaldo'
            ? 'bg-gradient-to-br from-amber-600 via-orange-600 to-amber-800'
            : 'bg-gradient-to-br from-slate-700 to-slate-900'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/80 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
              <span>Líder en Ventas del Período</span>
            </span>
            <span className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
              {summaryStats.winner === 'simon' ? `${summaryStats.simonMoneyPct}% Cuota` : `${summaryStats.osvaldoMoneyPct}% Cuota`}
            </span>
          </div>

          <div className="my-2">
            <h3 className="text-2xl font-black tracking-tight flex items-center gap-2">
              <span>{summaryStats.winner === 'simon' ? '🚴 Simón' : (summaryStats.winner === 'osvaldo' ? '🛵 Osvaldo' : '🤝 Empate Técnico')}</span>
            </h3>
            <p className="text-xs text-white/90 font-medium mt-1">
              {summaryStats.winner !== 'empate' ? (
                <>
                  Lidera por <strong className="text-amber-200 font-black">${summaryStats.moneyDiff.toLocaleString('es-MX')}</strong> y <strong className="text-white font-black">{summaryStats.piecesDiff} piezas</strong> más.
                </>
              ) : (
                'Ambos repartidores registran exactamente las mismas ventas.'
              )}
            </p>
          </div>

          <div className="pt-2 border-t border-white/20 flex items-center justify-between text-[11px] font-medium text-white/90">
            <span>Días ganados: Simón ({summaryStats.simonDaysWon})</span>
            <span>Osvaldo ({summaryStats.osvaldoDaysWon})</span>
          </div>
        </div>

        {/* Tarjeta Detallada Simón */}
        <div className="md:col-span-4 bg-blue-50/70 border-2 border-blue-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-lg">🚴</span>
              <div>
                <h4 className="font-black text-sm text-blue-950 leading-none">Simón (Ruta 2)</h4>
                <span className="text-[10.5px] font-bold text-blue-700">{summaryStats.simonMoneyPct}% del total de reparto</span>
              </div>
            </div>
            <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md">
              ${summaryStats.simonMoney.toLocaleString('es-MX')}.00
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="bg-white rounded-xl p-2 border border-blue-100">
              <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                <Sun className="w-3 h-3 text-blue-500" />
                <span>Mañana</span>
              </div>
              <div className="text-sm font-black text-blue-900 mt-0.5">
                ${summaryStats.simonMananaMoney.toLocaleString('es-MX')}
              </div>
            </div>
            <div className="bg-white rounded-xl p-2 border border-blue-100">
              <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                <Moon className="w-3 h-3 text-indigo-700" />
                <span>Tarde</span>
              </div>
              <div className="text-sm font-black text-indigo-900 mt-0.5">
                ${summaryStats.simonTardeMoney.toLocaleString('es-MX')}
              </div>
            </div>
          </div>

          <div className="pt-1.5 border-t border-blue-200/60 flex items-center justify-between text-[11px] font-bold text-blue-900">
            <span>Total piezas: <strong className="font-mono">{summaryStats.simonPieces.toLocaleString('es-MX')} pzs</strong></span>
            <span>Prom/día: <strong className="font-mono">${summaryStats.simonAvgMoney}</strong></span>
          </div>
        </div>

        {/* Tarjeta Detallada Osvaldo */}
        <div className="md:col-span-4 bg-amber-50/70 border-2 border-amber-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-lg">🛵</span>
              <div>
                <h4 className="font-black text-sm text-amber-950 leading-none">Osvaldo (Ruta 1)</h4>
                <span className="text-[10.5px] font-bold text-amber-800">{summaryStats.osvaldoMoneyPct}% del total de reparto</span>
              </div>
            </div>
            <span className="bg-amber-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md">
              ${summaryStats.osvaldoMoney.toLocaleString('es-MX')}.00
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="bg-white rounded-xl p-2 border border-amber-100">
              <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                <Sun className="w-3 h-3 text-amber-500" />
                <span>Mañana</span>
              </div>
              <div className="text-sm font-black text-amber-950 mt-0.5">
                ${summaryStats.osvaldoMananaMoney.toLocaleString('es-MX')}
              </div>
            </div>
            <div className="bg-white rounded-xl p-2 border border-amber-100">
              <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                <Moon className="w-3 h-3 text-orange-700" />
                <span>Tarde</span>
              </div>
              <div className="text-sm font-black text-orange-950 mt-0.5">
                ${summaryStats.osvaldoTardeMoney.toLocaleString('es-MX')}
              </div>
            </div>
          </div>

          <div className="pt-1.5 border-t border-amber-200/60 flex items-center justify-between text-[11px] font-bold text-amber-950">
            <span>Total piezas: <strong className="font-mono">{summaryStats.osvaldoPieces.toLocaleString('es-MX')} pzs</strong></span>
            <span>Prom/día: <strong className="font-mono">${summaryStats.osvaldoAvgMoney}</strong></span>
          </div>
        </div>
      </div>

      {/* 3. LEYENDA VISUAL CLARA DE LOS COLORES POR TURNO */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold text-slate-700">Guía de Colores por Chofer y Turno:</span>
          {/* Simón */}
          <div className="flex items-center gap-2">
            <span className="font-black text-blue-900">Simón:</span>
            <span className="flex items-center gap-1 font-bold text-slate-700">
              <span className="w-3 h-3 rounded-xs bg-[#3B82F6]"></span>
              Mañana
            </span>
            <span className="flex items-center gap-1 font-bold text-slate-700">
              <span className="w-3 h-3 rounded-xs bg-[#1D4ED8]"></span>
              Tarde
            </span>
          </div>

          <div className="w-px h-4 bg-slate-300 hidden sm:block"></div>

          {/* Osvaldo */}
          <div className="flex items-center gap-2">
            <span className="font-black text-amber-950">Osvaldo:</span>
            <span className="flex items-center gap-1 font-bold text-slate-700">
              <span className="w-3 h-3 rounded-xs bg-[#F59E0B]"></span>
              Mañana
            </span>
            <span className="flex items-center gap-1 font-bold text-slate-700">
              <span className="w-3 h-3 rounded-xs bg-[#C2410C]"></span>
              Tarde
            </span>
          </div>
        </div>

        <div className="text-[11px] font-bold text-slate-500">
          *Cada día muestra la barra de Simón junto a la barra de Osvaldo
        </div>
      </div>

      {/* 4. GRÁFICA DE BARRAS APILADAS COMPARATIVAS */}
      <div className="h-72 sm:h-80 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 12, right: 10, left: -10, bottom: 5 }}
            onClick={(state: any) => {
              if (state && state.activePayload && state.activePayload.length > 0) {
                const clickedDate = state.activePayload[0].payload.date;
                if (onSelectDate) onSelectDate(clickedDate);
                setAnchorDate(clickedDate);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: periodMode === 'mes' ? 10 : 11, fontWeight: 700, fill: '#475569' }} 
              axisLine={{ stroke: '#CBD5E1' }}
              tickLine={false}
              interval={0}
            />
            <YAxis 
              tick={{ fontSize: 11, fontWeight: 600, fill: '#64748B' }} 
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => metricMode === 'dinero' ? `$${v}` : `${v}`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  const isSimonLead = d.simonTotal > d.osvaldoTotal;
                  const isOsvaldoLead = d.osvaldoTotal > d.simonTotal;
                  return (
                    <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl text-xs space-y-2 border border-slate-700 min-w-[210px]">
                      <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 font-bold">
                        <span>{d.fullDateLabel}</span>
                        {d.isToday && <span className="bg-blue-600 text-[9px] px-1.5 py-0.2 rounded font-black">HOY</span>}
                      </div>

                      {/* Simón */}
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between font-black text-blue-300">
                          <span>🚴 Simón Total:</span>
                          <span className="font-mono">
                            {metricMode === 'dinero' ? `$${d.simonTotal.toFixed(2)}` : `${d.simonTotal} pzs`}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-slate-300 flex justify-between pl-3">
                          <span>• Mañana: {metricMode === 'dinero' ? `$${d.simonManana}` : `${d.simonManana} pzs`}</span>
                          <span>• Tarde: {metricMode === 'dinero' ? `$${d.simonTarde}` : `${d.simonTarde} pzs`}</span>
                        </div>
                      </div>

                      {/* Osvaldo */}
                      <div className="space-y-0.5 pt-1 border-t border-slate-800">
                        <div className="flex items-center justify-between font-black text-amber-300">
                          <span>🛵 Osvaldo Total:</span>
                          <span className="font-mono">
                            {metricMode === 'dinero' ? `$${d.osvaldoTotal.toFixed(2)}` : `${d.osvaldoTotal} pzs`}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-slate-300 flex justify-between pl-3">
                          <span>• Mañana: {metricMode === 'dinero' ? `$${d.osvaldoManana}` : `${d.osvaldoManana} pzs`}</span>
                          <span>• Tarde: {metricMode === 'dinero' ? `$${d.osvaldoTarde}` : `${d.osvaldoTarde} pzs`}</span>
                        </div>
                      </div>

                      {/* Ganador del día */}
                      <div className="pt-1 border-t border-slate-800 flex items-center justify-between font-bold text-[10.5px]">
                        <span className="text-slate-400">Líder del día:</span>
                        <span className={isSimonLead ? 'text-blue-400' : (isOsvaldoLead ? 'text-amber-400' : 'text-slate-300')}>
                          {isSimonLead ? `🏆 Simón (+${metricMode === 'dinero' ? '$' : ''}${d.diff})` : (isOsvaldoLead ? `🏆 Osvaldo (+${metricMode === 'dinero' ? '$' : ''}${d.diff})` : 'Empate')}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* BARRA APILADA 1: SIMÓN (Mañana + Tarde en la misma barra stackId="simon") */}
            <Bar 
              dataKey="simonManana" 
              name="Simón (Mañana)" 
              stackId="simon" 
              fill="#3B82F6" 
              radius={[0, 0, 0, 0]} 
            />
            <Bar 
              dataKey="simonTarde" 
              name="Simón (Tarde)" 
              stackId="simon" 
              fill="#1D4ED8" 
              radius={[4, 4, 0, 0]} 
            />

            {/* BARRA APILADA 2: OSVALDO (Mañana + Tarde en la misma barra stackId="osvaldo") */}
            <Bar 
              dataKey="osvaldoManana" 
              name="Osvaldo (Mañana)" 
              stackId="osvaldo" 
              fill="#F59E0B" 
              radius={[0, 0, 0, 0]} 
            />
            <Bar 
              dataKey="osvaldoTarde" 
              name="Osvaldo (Tarde)" 
              stackId="osvaldo" 
              fill="#C2410C" 
              radius={[4, 4, 0, 0]} 
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
