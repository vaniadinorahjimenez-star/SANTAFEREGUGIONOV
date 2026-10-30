import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  BarChart2, 
  PieChart as PieChartIcon, 
  Flame, 
  Clock, 
  Calendar, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Filter, 
  Printer, 
  ArrowUpRight, 
  ArrowDownRight,
  Info,
  RotateCcw,
  Zap,
  Sliders,
  Award,
  CloudRain,
  MapPin,
  Coffee,
  Trophy,
  Lock
} from 'lucide-react';
import { ProductRankingChart } from './ProductRankingChart';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
} from 'recharts';
import { SaleTicket } from '../../types';
import { 
  calculateProductionStats, 
  generateSampleWeekTickets,
  BREAD_CATEGORIES, 
  BreadClassificationKey 
} from '../../utils/productionAnalytics';
import { getTodayString } from '../../utils/storage';
import { ZakiaWeatherDemandWidget } from './ZakiaWeatherDemandWidget';
import { fetchZakiaBreadWeather, BreadDemandForecast } from '../../utils/weatherService';

interface ProductionAnalyticsProps {
  tickets: SaleTicket[];
}

type PeriodFilterMode = 'hoy' | 'ayer' | '7dias' | '30dias' | 'todos' | 'custom';
type AnalyticsSubTab = 'mas_vendidos' | 'bolillo' | 'clima' | 'semana' | 'tandas' | 'categorias';

export const ProductionAnalytics: React.FC<ProductionAnalyticsProps> = ({ tickets }) => {
  const todayStr = useMemo(() => getTodayString(), []);
  
  // Tab activo dentro de Estadísticas: arranca por defecto en Más Vendidos
  const [activeSubTab, setActiveSubTab] = useState<AnalyticsSubTab>('mas_vendidos');

  // Estado meteorológico de Zakia Querétaro (CP 76269)
  const [weatherInfo, setWeatherInfo] = useState<BreadDemandForecast | null>(null);
  const [applyWeatherBoost, setApplyWeatherBoost] = useState<boolean>(true);

  useEffect(() => {
    let isSubscribed = true;
    fetchZakiaBreadWeather(false)
      .then(res => {
        if (isSubscribed) setWeatherInfo(res);
      })
      .catch((err) => console.log('Weather init error:', err));
    return () => {
      isSubscribed = false;
    };
  }, []);

  // Filtro de período
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterMode>('todos');
  const [customDateStart, setCustomDateStart] = useState<string>(todayStr);
  const [customDateEnd, setCustomDateEnd] = useState<string>(todayStr);

  // Piezas por charola de bolillo: FIJO A 12 PIEZAS POR CHAROLA (Estándar Panadería Santa Fé)
  const bolillosPerTray = 12;

  useEffect(() => {
    localStorage.setItem('santafe_bolillos_per_tray', '12');
  }, []);

  // Calcular ayer en formato YYYY-MM-DD
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Calcular fecha de hace 7 días
  const sevenDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Calcular fecha de hace 30 días
  const thirtyDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Filtrar tickets por período seleccionado
  const filteredTickets = useMemo(() => {
    if (periodFilter === 'hoy') {
      return tickets.filter(t => t.date === todayStr);
    }
    if (periodFilter === 'ayer') {
      return tickets.filter(t => t.date === yesterdayStr);
    }
    if (periodFilter === '7dias') {
      return tickets.filter(t => t.date >= sevenDaysAgoStr && t.date <= todayStr);
    }
    if (periodFilter === '30dias') {
      return tickets.filter(t => t.date >= thirtyDaysAgoStr && t.date <= todayStr);
    }
    if (periodFilter === 'custom') {
      return tickets.filter(t => t.date >= customDateStart && t.date <= customDateEnd);
    }
    // 'todos'
    return tickets;
  }, [tickets, periodFilter, todayStr, yesterdayStr, sevenDaysAgoStr, thirtyDaysAgoStr, customDateStart, customDateEnd]);

  // Modo de simulación de 1 semana si hay pocos datos iniciales
  const [showSimulation, setShowSimulation] = useState<boolean>(() => tickets.length < 5);

  // Tickets activos para el análisis (reales o proyección de ejemplo)
  const activeTickets = useMemo(() => {
    if (showSimulation) {
      return generateSampleWeekTickets(todayStr);
    }
    return filteredTickets;
  }, [showSimulation, todayStr, filteredTickets]);

  // Ejecutar el motor de analítica de producción
  const stats = useMemo(() => {
    return calculateProductionStats(activeTickets, bolillosPerTray);
  }, [activeTickets, bolillosPerTray]);

  // Datos para gráfica de pastel de categorías
  const pieChartData = useMemo(() => {
    return stats.categoryList
      .filter(c => c.totalPieces > 0)
      .map(c => ({
        name: c.shortLabel,
        value: c.totalPieces,
        color: c.chartColor,
        revenue: c.totalRevenue,
        percentage: c.percentageOfPieces
      }));
  }, [stats.categoryList]);

  // Preparar datos para gráfica de charolas por hora
  const hourlyChartData = useMemo(() => {
    return stats.hourlyBolillo.map(h => ({
      hour: h.label,
      piezas: h.pieces,
      charolas: h.trays,
      esPico: h.isPeakHour
    }));
  }, [stats.hourlyBolillo]);

  // Preparar datos para comparativa semanal de días
  const weekChartData = useMemo(() => {
    return stats.dayOfWeekStats.map(d => ({
      dia: d.dayShort,
      nombre: d.dayName,
      piezas: d.avgPiecesPerDay,
      charolas: d.avgTraysPerDay,
      variacion: d.percentVsAverage,
      estado: d.status
    }));
  }, [stats.dayOfWeekStats]);

  return (
    <div className="space-y-5 pb-16 animate-in fade-in duration-200">
      
      {/* Top Banner: Título, Explicación y Filtros de Fecha */}
      <div className="bg-gradient-to-r from-amber-800 via-amber-900 to-stone-900 text-white rounded-3xl p-5 sm:p-7 shadow-lg border border-amber-700/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-200 border border-amber-400/30 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>Inteligencia de Producción & Horneado</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>Producción de Bolillo y Panadería</span>
              <span className="text-xl">🥖📊</span>
            </h1>
            <p className="text-sm text-amber-100/90 leading-relaxed font-medium">
              Analiza la venta por hora de tu producto ancla (<span className="text-amber-300 font-bold">Bolillo $5</span>) convertido a <span className="text-amber-300 font-bold">charolas</span>, estima la demanda semanal para saber qué días producir más o menos, y conoce el desglose exacto de pan tradicional y especialidades.
            </p>
          </div>

          {/* Capacidad Estándar Fija de Charola */}
          <div className="bg-black/30 backdrop-blur-md rounded-2xl p-3.5 border border-amber-400/25 flex flex-col justify-center gap-1.5 shrink-0">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-amber-200 font-bold flex items-center gap-1.5">
                <span>🥖</span>
                <span>Capacidad por Charola:</span>
              </span>
              <span className="bg-amber-400 text-stone-950 font-black text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-xs font-mono">
                <Lock className="w-3 h-3 text-stone-900" />
                <span>12 pzas / charola (Fijo)</span>
              </span>
            </div>
            <p className="text-[11px] text-amber-200/80 font-medium">
              Estándar Panadería Santa Fé (12 bolillos por charola de horneado).
            </p>
          </div>
        </div>

        {/* Filtros de Rango de Fecha */}
        <div className="mt-5 pt-4 border-t border-amber-700/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <span className="text-xs font-black uppercase text-amber-300/80 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Período:</span>
            </span>

            {[
              { id: 'todos' as PeriodFilterMode, label: 'Todo el Historial' },
              { id: 'hoy' as PeriodFilterMode, label: 'Hoy' },
              { id: 'ayer' as PeriodFilterMode, label: 'Ayer' },
              { id: '7dias' as PeriodFilterMode, label: 'Últimos 7 Días' },
              { id: '30dias' as PeriodFilterMode, label: 'Últimos 30 Días' },
              { id: 'custom' as PeriodFilterMode, label: 'Rango de Fecha' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriodFilter(tab.id)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  periodFilter === tab.id
                    ? 'bg-white text-stone-900 shadow-md font-black'
                    : 'bg-white/10 hover:bg-white/20 text-amber-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Rango Personalizado si está activo */}
          {periodFilter === 'custom' && (
            <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-xl border border-white/15 text-xs text-white">
              <span>Desde:</span>
              <input
                type="date"
                value={customDateStart}
                onChange={e => setCustomDateStart(e.target.value)}
                className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-white"
              />
              <span>Hasta:</span>
              <input
                type="date"
                value={customDateEnd}
                onChange={e => setCustomDateEnd(e.target.value)}
                className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-white"
              />
            </div>
          )}

          {/* Tickets analizados contador y Simulación */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowSimulation(!showSimulation)}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                showSimulation 
                  ? 'bg-amber-400 text-stone-950 border-amber-300 font-black shadow-sm' 
                  : 'bg-white/10 hover:bg-white/20 text-amber-100 border-white/20'
              }`}
              title="Alternar entre datos reales cobrados o una semana de simulación realista de panadería"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{showSimulation ? '🧪 Proyección de Ejemplo Activa' : '📋 Ver Solo Ventas Reales'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 flex items-center gap-1.5 cursor-pointer no-print"
              title="Imprimir hoja de producción para el taller de panadería"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Hoja</span>
            </button>

            <div className="text-xs text-amber-200/90 font-medium flex items-center gap-2 pl-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>{stats.totalTicketsAnalyzed} tickets ({stats.totalDaysAnalyzed} {stats.totalDaysAnalyzed === 1 ? 'día' : 'días'})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerta si está en modo simulación para que el panadero sepa cómo funciona */}
      {showSimulation && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 px-4 flex items-center justify-between gap-3 text-amber-950 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">💡</span>
            <div>
              <strong className="font-black text-amber-900">Modo de Aprendizaje / Proyección Activado:</strong>{' '}
              <span>
                Estás viendo una semana proyectada con el comportamiento de una panadería típica (~350 bolillos/día, picos matutinos y vespertinos). Puedes desactivarlo en cualquier momento para ver únicamente los tickets reales registrados en tu caja.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSimulation(false)}
            className="text-xs font-black text-amber-900 underline hover:text-amber-950 shrink-0 cursor-pointer"
          >
            Ver mis ventas reales ({filteredTickets.length})
          </button>
        </div>
      )}

      {/* Banner de Pronóstico del Clima en Zakia CP 76269 y Antojo de Pan Dulce */}
      {weatherInfo && (
        <div 
          onClick={() => setActiveSubTab('clima')}
          className="cursor-pointer bg-gradient-to-r from-blue-950 via-slate-900 to-amber-950 text-white rounded-2xl p-3.5 px-4.5 flex flex-wrap items-center justify-between gap-3 border border-blue-500/30 hover:border-blue-400/60 transition-all shadow-sm group"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl filter drop-shadow-sm group-hover:scale-110 transition-transform select-none">
              {weatherInfo.current.weatherEmoji}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-white/15 px-2 py-0.5 rounded-md text-[11px] font-black text-amber-200 border border-white/10 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-amber-400" />
                  <span>Zakia, Querétaro (CP 76269)</span>
                </span>
                <strong className="text-sm font-black font-mono text-white">
                  {weatherInfo.current.temperature}°C
                </strong>
                <span className="text-xs text-stone-300">
                  ({weatherInfo.current.weatherDescription})
                </span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-emerald-500 text-stone-950">
                  {weatherInfo.badgeText}
                </span>
              </div>
              <p className="text-xs text-amber-100/90 font-medium mt-0.5">
                {weatherInfo.headline} — {weatherInfo.categoryAdvice.bolillo.extraTraysRecommended > 0 ? `Se sugiere hornear +${weatherInfo.categoryAdvice.bolillo.extraTraysRecommended} charolas de bolillo y reforzar conchas para la merienda.` : 'Producción regular en equilibrio.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-black bg-white/10 group-hover:bg-white/20 text-white px-3 py-1.5 rounded-xl border border-white/20 shrink-0 transition-colors">
            <span>Ver Pronóstico 7 Días & Antojo</span>
            <span>→</span>
          </div>
        </div>
      )}

      {/* Sub-navegación Visual de Secciones */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto">
        {[
          { id: 'mas_vendidos' as AnalyticsSubTab, label: '🏆 Más Vendidos en Gráfica', desc: 'Por día, semana o mes y cantidad' },
          { id: 'bolillo' as AnalyticsSubTab, label: '🥖 Bolillo por Charolas y Horas', desc: '12 pz / charola estándar fija' },
          { id: 'clima' as AnalyticsSubTab, label: '🌦️ Clima Zakia (CP 76269)', desc: weatherInfo ? `${weatherInfo.current.temperature}°C · ${weatherInfo.badgeText}` : 'Lluvia, frío y antojo' },
          { id: 'semana' as AnalyticsSubTab, label: '📅 Demanda Semanal (Lunes a Domingo)', desc: '¿Qué días hornear más?' },
          { id: 'tandas' as AnalyticsSubTab, label: '🔥 Plan de Tandas & Turnos', desc: 'Horarios de horneado caliente' },
          { id: 'categorias' as AnalyticsSubTab, label: '🥐 Todas las Categorías de Pan', desc: '$5, $12, $18, $20, $25, $35' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex flex-col text-left px-4 py-2.5 rounded-2xl transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === tab.id
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
            }`}
          >
            <span className="font-black text-xs sm:text-sm">{tab.label}</span>
            <span className={`text-[10px] ${activeSubTab === tab.id ? 'text-amber-100' : 'text-stone-500'}`}>
              {tab.desc}
            </span>
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* PESTAÑA 0: PRODUCTOS MÁS VENDIDOS EN GRÁFICA (DÍA, SEMANA, MES & CANTIDAD) */}
      {/* ========================================================================= */}
      {activeSubTab === 'mas_vendidos' && (
        <ProductRankingChart 
          tickets={showSimulation ? generateSampleWeekTickets(todayStr) : tickets} 
          bolillosPerTray={bolillosPerTray} 
        />
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA CLIMA: PRONÓSTICO METEOROLÓGICO & DEMANDA DE PAN EN ZAKIA CP 76269 */}
      {/* ========================================================================= */}
      {activeSubTab === 'clima' && (
        <ZakiaWeatherDemandWidget 
          bolillosPerTray={bolillosPerTray} 
          onApplyWeatherBoost={(boost) => setApplyWeatherBoost(boost > 1.0)}
        />
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 1: BOLILLO & CHAROLAS POR HORA (PRODUCTO ANCLA)                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'bolillo' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          
          {/* Tarjetas Clave de Producción de Bolillo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Bolillo */}
            <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-800">Total Bolillo</span>
                  <span className="text-xl">🥖</span>
                </div>
                <div className="text-3xl font-black text-amber-950 mt-1 font-mono">
                  {stats.bolilloTotalPieces.toLocaleString()} <span className="text-sm font-bold text-amber-700">pzas</span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-amber-100 flex items-center justify-between text-xs">
                <span className="text-stone-600 font-medium">Equivalente en charolas:</span>
                <span className="font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md font-mono">
                  ~{stats.bolilloTotalTrays} charolas
                </span>
              </div>
            </div>

            {/* Promedio Diario */}
            <div className="bg-white rounded-2xl p-4 border border-orange-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-orange-800">Promedio Diario</span>
                  <span className="text-xl">📈</span>
                </div>
                <div className="text-3xl font-black text-orange-950 mt-1 font-mono">
                  {stats.bolilloDailyAvgPieces.toLocaleString()} <span className="text-sm font-bold text-orange-700">pzas/día</span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-orange-100 flex items-center justify-between text-xs">
                <span className="text-stone-600 font-medium">Charolas por día:</span>
                <span className="font-black text-orange-800 bg-orange-100 px-2 py-0.5 rounded-md font-mono">
                  ~{stats.bolilloDailyAvgTrays} charolas/día
                </span>
              </div>
            </div>

            {/* Hora Pico de Bolillo */}
            <div className="bg-white rounded-2xl p-4 border border-rose-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-rose-800">Hora de Mayor Venta</span>
                  <span className="text-xl">🕒</span>
                </div>
                <div className="text-2xl font-black text-rose-950 mt-1 flex items-baseline gap-1">
                  <span>{stats.bolilloPeakHour ? `${stats.bolilloPeakHour.label} hrs` : '07:00 hrs'}</span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-rose-100 flex items-center justify-between text-xs">
                <span className="text-stone-600 font-medium">Demanda máxima:</span>
                <span className="font-black text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md font-mono">
                  {stats.bolilloPeakHour ? `${stats.bolilloPeakHour.pieces} pz (~${stats.bolilloPeakHour.trays} ch)` : '0 pz'}
                </span>
              </div>
            </div>

            {/* Participación en la Panadería */}
            <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-800">% de Venta Total</span>
                  <span className="text-xl">⭐</span>
                </div>
                <div className="text-3xl font-black text-emerald-950 mt-1 font-mono">
                  {stats.categoryTotals.bolillo ? `${stats.categoryTotals.bolillo.percentageOfPieces}%` : '0%'}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-emerald-100 flex items-center justify-between text-xs">
                <span className="text-stone-600 font-medium">Ingresos Bolillo ($5):</span>
                <span className="font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md font-mono">
                  ${stats.categoryTotals.bolillo ? stats.categoryTotals.bolillo.totalRevenue.toLocaleString() : 0}.00
                </span>
              </div>
            </div>

          </div>

          {/* Gráfica Principal: CHAROLAS DE BOLILLO POR HORA */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-black text-amber-950 flex items-center gap-2">
                  <span>Charolas de Bolillo Vendidas por Hora</span>
                  <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    06:00 a 22:00 hrs
                  </span>
                </h3>
                <p className="text-xs text-stone-600 mt-0.5">
                  Muestra cuántas charolas completas ({bolillosPerTray} pz c/u) se consumen en cada lapso de tiempo para sincronizar el horno.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-amber-800 font-bold">
                  <span className="w-3 h-3 rounded-xs bg-[#D95D39]"></span>
                  <span>Charolas</span>
                </span>
                <span className="flex items-center gap-1 text-stone-600">
                  <span className="w-3 h-3 rounded-xs bg-rose-500"></span>
                  <span>Hora Pico de Venta</span>
                </span>
              </div>
            </div>

            {/* Render de la Gráfica Recharts */}
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    allowDecimals={true}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-stone-900 text-white rounded-xl p-3 shadow-xl text-xs space-y-1 border border-stone-700">
                            <div className="font-black text-amber-400 border-b border-stone-700 pb-1 flex items-center justify-between gap-3">
                              <span>Hora: {data.hour} hrs</span>
                              {data.esPico && <span className="bg-rose-600 text-white text-[9px] px-1.5 py-0.2 rounded">🔥 Hora Pico</span>}
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-stone-300">Bolillos vendidos:</span>
                              <span className="font-bold font-mono">{data.piezas} pzas</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-stone-300">Charolas estimadas:</span>
                              <span className="font-black text-amber-300 font-mono text-sm">~{data.charolas} charolas</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="charolas" radius={[6, 6, 0, 0]}>
                    {hourlyChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.esPico ? '#E11D48' : '#D95D39'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tabla Compacta de Horas Clave */}
            <div className="bg-amber-50/60 rounded-2xl p-3.5 border border-amber-200/80">
              <div className="text-xs font-black text-amber-950 uppercase mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                <span>Desglose Rápido por Franja Horaria de Bolillo:</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {stats.hourlyBolillo
                  .filter(h => h.hour >= 7 && h.hour <= 21)
                  .map(h => (
                    <div 
                      key={h.hour}
                      className={`p-2 rounded-xl text-center border transition-all ${
                        h.isPeakHour
                          ? 'bg-rose-100 border-rose-300 shadow-2xs'
                          : 'bg-white border-stone-200'
                      }`}
                    >
                      <div className="text-[10px] font-black text-stone-500">{h.label}</div>
                      <div className="text-base font-black text-stone-900 mt-0.5 font-mono">
                        {h.pieces} <span className="text-[10px] font-normal text-stone-600">pz</span>
                      </div>
                      <div className={`text-[10px] font-bold mt-0.5 px-1 py-0.2 rounded-md ${
                        h.isPeakHour ? 'bg-rose-600 text-white font-black' : 'bg-amber-100 text-amber-900'
                      }`}>
                        ~{h.trays} ch
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Comparación de Turnos de Bolillo: Turno 1 vs Turno 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Turno 1 */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-5 border border-amber-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black">
                    🌅
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-stone-900">Turno 1 - Matutino</h4>
                    <span className="text-[11px] text-stone-500 font-bold">07:00 a 15:00 hrs</span>
                  </div>
                </div>
                <span className="bg-amber-200 text-amber-950 font-black text-xs px-2.5 py-1 rounded-full border border-amber-300">
                  Desayunos y Comidas
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="bg-white rounded-2xl p-3 border border-amber-100">
                  <div className="text-[10px] font-black uppercase text-stone-500">Bolillo Matutino</div>
                  <div className="text-2xl font-black text-amber-950 font-mono mt-0.5">
                    {stats.shiftBreakdown.turno1.bolilloPieces} <span className="text-xs font-bold text-amber-700">pz</span>
                  </div>
                  <div className="text-xs text-amber-800 font-bold mt-1">
                    ~{stats.shiftBreakdown.turno1.bolilloTrays} charolas
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-3 border border-amber-100">
                  <div className="text-[10px] font-black uppercase text-stone-500">Recomendación Horneado</div>
                  <div className="text-xl font-black text-stone-900 font-mono mt-0.5">
                    {stats.productionRecommendation.turno1BolilloTrays} charolas
                  </div>
                  <div className="text-[11px] text-stone-600 font-medium mt-1">
                    Divididas en 2 tandas calientes
                  </div>
                </div>
              </div>
            </div>

            {/* Turno 2 */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl p-5 border border-indigo-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                    🌆
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-stone-900">Turno 2 - Vespertino</h4>
                    <span className="text-[11px] text-stone-500 font-bold">15:00 a 22:00 hrs</span>
                  </div>
                </div>
                <span className="bg-indigo-200 text-indigo-950 font-black text-xs px-2.5 py-1 rounded-full border border-indigo-300">
                  Merienda y Cena
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="bg-white rounded-2xl p-3 border border-indigo-100">
                  <div className="text-[10px] font-black uppercase text-stone-500">Bolillo Vespertino</div>
                  <div className="text-2xl font-black text-indigo-950 font-mono mt-0.5">
                    {stats.shiftBreakdown.turno2.bolilloPieces} <span className="text-xs font-bold text-indigo-700">pz</span>
                  </div>
                  <div className="text-xs text-indigo-800 font-bold mt-1">
                    ~{stats.shiftBreakdown.turno2.bolilloTrays} charolas
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-3 border border-indigo-100">
                  <div className="text-[10px] font-black uppercase text-stone-500">Recomendación Horneado</div>
                  <div className="text-xl font-black text-stone-900 font-mono mt-0.5">
                    {stats.productionRecommendation.turno2BolilloTrays} charolas
                  </div>
                  <div className="text-[11px] text-stone-600 font-medium mt-1">
                    Divididas en 2 tandas calientes
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: DEMANDA SEMANAL (¿QUÉ DÍAS HORNEAR MÁS O MENOS?)               */}
      {/* ========================================================================= */}
      {activeSubTab === 'semana' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          
          {/* Banner de Guía para el Maestro Panadero */}
          <div className="bg-gradient-to-r from-stone-900 to-amber-950 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-amber-600/30">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-wider mb-1">
                  <Award className="w-4 h-4" />
                  <span>Semáforo de Producción Semanal</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black">
                  ¿Qué días debes producir más y qué días reducir masa?
                </h3>
                <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-2xl font-medium">
                  Compara el promedio de venta de cada día de la semana. Los días en <strong className="text-emerald-400">Verde</strong> requieren amasar charolas extra para no quedarte sin pan; los días en <strong className="text-rose-400">Rojo</strong> te ayudan a prevenir merma y desperdicio.
                </p>
              </div>

              {/* Días destacados */}
              <div className="flex items-center gap-3 shrink-0">
                {stats.strongestDay && (
                  <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-2xl p-3 text-center">
                    <div className="text-[10px] font-bold text-emerald-400 uppercase">Día Más Fuerte</div>
                    <div className="text-lg font-black text-emerald-300">{stats.strongestDay.dayName}</div>
                    <div className="text-xs text-emerald-100 font-mono">~{stats.strongestDay.avgTraysPerDay} charolas</div>
                  </div>
                )}
                {stats.lowestDay && (
                  <div className="bg-rose-950/80 border border-rose-500/50 rounded-2xl p-3 text-center">
                    <div className="text-[10px] font-bold text-rose-400 uppercase">Día Más Bajo</div>
                    <div className="text-lg font-black text-rose-300">{stats.lowestDay.dayName}</div>
                    <div className="text-xs text-rose-100 font-mono">~{stats.lowestDay.avgTraysPerDay} charolas</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Gráfica de Barras por Día de la Semana */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-base text-stone-900">
                  Promedio de Charolas de Bolillo por Día (Lunes a Domingo)
                </h4>
                <p className="text-xs text-stone-500">
                  Variación porcentual respecto al promedio general diario
                </p>
              </div>
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full">
                Promedio general: ~{stats.bolilloDailyAvgTrays} ch/día
              </span>
            </div>

            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekChartData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis 
                    dataKey="dia" 
                    tick={{ fontSize: 12, fill: '#374151', fontWeight: 700 }}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    allowDecimals={true}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-stone-900 text-white rounded-xl p-3 shadow-xl text-xs space-y-1">
                            <div className="font-black text-amber-400 border-b border-stone-700 pb-1">
                              {data.nombre}
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-stone-300">Promedio piezas:</span>
                              <span className="font-bold font-mono">{data.piezas} pzas</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-stone-300">Charolas promedio:</span>
                              <span className="font-black text-amber-300 font-mono">~{data.charolas} charolas</span>
                            </div>
                            <div className="flex justify-between gap-3 pt-1 border-t border-stone-800">
                              <span className="text-stone-300">Variación vs promedio:</span>
                              <span className={`font-black ${data.variacion >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {data.variacion >= 0 ? `+${data.variacion}%` : `${data.variacion}%`}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="charolas" radius={[6, 6, 0, 0]}>
                    {weekChartData.map((entry, idx) => (
                      <Cell 
                        key={`week-cell-${idx}`}
                        fill={
                          entry.estado === 'alto' 
                            ? '#10B981' 
                            : entry.estado === 'bajo' 
                              ? '#F43F5E' 
                              : '#F59E0B'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tarjetas Detalladas: Lunes a Domingo con Recomendación Específica */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
            {stats.dayOfWeekStats.map(day => {
              const isHigh = day.status === 'alto';
              const isLow = day.status === 'bajo';

              return (
                <div 
                  key={day.dayIndex}
                  className={`rounded-2xl p-3.5 border flex flex-col justify-between transition-all ${
                    isHigh
                      ? 'bg-emerald-50/80 border-emerald-300 shadow-xs ring-2 ring-emerald-500/20'
                      : isLow
                        ? 'bg-rose-50/80 border-rose-300 shadow-xs'
                        : 'bg-white border-stone-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm text-stone-900">{day.dayName}</span>
                      <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${
                        isHigh ? 'bg-emerald-600 text-white' : isLow ? 'bg-rose-600 text-white' : 'bg-stone-200 text-stone-700'
                      }`}>
                        {day.percentVsAverage >= 0 ? `+${day.percentVsAverage}%` : `${day.percentVsAverage}%`}
                      </span>
                    </div>

                    <div className="mt-2.5">
                      <div className="text-xl font-black text-stone-900 font-mono">
                        ~{day.avgTraysPerDay} <span className="text-xs font-bold text-stone-500">ch</span>
                      </div>
                      <div className="text-xs text-stone-600 font-medium mt-0.5">
                        {day.avgPiecesPerDay} bolillos/día
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-stone-200/80 text-[11px] font-bold">
                    <span className={isHigh ? 'text-emerald-800' : isLow ? 'text-rose-800' : 'text-stone-600'}>
                      {day.recommendation}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 3: PLAN DE TANDAS DE HORNEADO & HORARIOS CALIENTES                 */}
      {/* ========================================================================= */}
      {activeSubTab === 'tandas' && (() => {
        const weatherExtraTrays = (applyWeatherBoost && weatherInfo) ? weatherInfo.categoryAdvice.bolillo.extraTraysRecommended : 0;
        const totalSuggestedTrays = stats.productionRecommendation.suggestedDailyBolilloTrays + weatherExtraTrays;
        const totalSuggestedPieces = totalSuggestedTrays * bolillosPerTray;

        return (
          <div className="space-y-5 animate-in fade-in duration-150">
            
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-3xl p-5 sm:p-6 shadow-md">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-amber-200 text-xs font-black uppercase tracking-wider mb-1">
                    <Flame className="w-4 h-4" />
                    <span>Estrategia de Pan Recién Horneado</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black">
                    Horarios y Tandas Sugeridas para el Bolillo
                  </h3>
                  <p className="text-xs sm:text-sm text-amber-100 mt-1 max-w-xl font-medium">
                    El cliente prefiere el bolillo crujiente y caliente. En lugar de hornear todo de un solo golpe, divide la producción en 4 tandas estratégicas para maximizar ventas y frescura.
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 text-center shrink-0">
                  <div className="text-[11px] uppercase font-bold text-amber-200">Meta Sugerida Diaria</div>
                  <div className="text-2xl font-black text-white font-mono mt-0.5">
                    ~{totalSuggestedTrays} charolas
                  </div>
                  <div className="text-[11px] text-amber-100 font-medium">
                    (~{totalSuggestedPieces} piezas)
                    {weatherExtraTrays > 0 && <span className="block text-amber-300 font-bold">(+{weatherExtraTrays} ch por clima)</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Ajuste Meteorológico para Zakia en Tandas */}
            {weatherInfo && (
              <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
                weatherExtraTrays > 0 
                  ? 'bg-blue-50/90 border-blue-200 text-blue-950' 
                  : 'bg-stone-50 border-stone-200 text-stone-700'
              }`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl select-none">{weatherInfo.current.weatherEmoji}</span>
                  <div>
                    <div className="flex items-center gap-1.5 font-black">
                      <span>Pronóstico Meteorológico Zakia (CP 76269):</span>
                      <span className="text-blue-700 font-mono">{weatherInfo.current.temperature}°C</span>
                      <span className="text-stone-600 font-medium">({weatherInfo.current.weatherDescription})</span>
                    </div>
                    <p className="text-[11px] text-stone-600 mt-0.5 font-medium">
                      {weatherExtraTrays > 0 
                        ? `Por lluvia o temperatura fresca se añadieron +${weatherExtraTrays} charolas a las tandas de la tarde (16:00 y 18:30 hrs) para el antojo de merienda y cena.`
                        : 'Condiciones templadas estándar; tandas regulares programadas.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('clima')}
                    className="text-xs font-bold text-blue-800 underline hover:text-blue-950 cursor-pointer"
                  >
                    Ver análisis de clima
                  </button>
                  <label className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-stone-300 font-bold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyWeatherBoost}
                      onChange={(e) => setApplyWeatherBoost(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>Ajustar tandas al clima de hoy</span>
                  </label>
                </div>
              </div>
            )}

            {/* 4 Tandas Recomendadas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.productionRecommendation.bakingBatches.map((batch, idx) => {
                // Si hay charolas extra por clima, sumarlas en las tandas vespertinas
                let extraInThisBatch = 0;
                if (weatherExtraTrays > 0) {
                  if (idx === 2) extraInThisBatch = Math.floor(weatherExtraTrays / 2);
                  if (idx === 3) extraInThisBatch = Math.ceil(weatherExtraTrays / 2);
                }
                const batchTrays = batch.suggestedTrays + extraInThisBatch;

                return (
                  <div 
                    key={idx}
                    className="bg-white rounded-3xl p-5 border border-amber-200 shadow-xs flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-black text-lg">
                          {idx === 0 ? '🥖' : idx === 1 ? '☀️' : idx === 2 ? '🌆' : '🌙'}
                        </div>
                        <div>
                          <h4 className="font-black text-sm text-stone-900">{batch.label}</h4>
                          <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            ⏰ Meter al horno: {batch.time}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-2xl font-black text-amber-950 font-mono">
                          ~{batchTrays} <span className="text-xs font-bold text-stone-500">ch</span>
                        </div>
                        <div className="text-[11px] text-stone-500 font-medium">
                          ~{batchTrays * bolillosPerTray} piezas
                          {extraInThisBatch > 0 && (
                            <span className="block text-blue-600 font-black text-[10px]">
                              (+{extraInThisBatch} ch por clima)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/70 text-xs text-stone-700 font-medium flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <span>{batch.notes}</span>
                    </div>
                  </div>
                );
              })}
            </div>

          {/* Consejos Clave para el Taller de Panadería */}
          <div className="bg-stone-50 rounded-3xl p-5 border border-stone-200 space-y-3">
            <h4 className="font-black text-sm text-stone-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Reglas de Oro para la Producción de Bolillo en Panadería Santa Fé:</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-medium text-stone-700">
              <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
                <span className="font-black text-stone-900 block mb-1">1. Tanda de las 06:30 AM</span>
                Asegura que a las 07:00 AM ya haya canastos llenos para los clientes que van al trabajo o preparan tortas escolares.
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
                <span className="font-black text-stone-900 block mb-1">2. Pico de las 18:30 PM</span>
                La tarde-noche representa el 45% de la venta diaria. Nunca dejes que el canasto se vacíe antes de las 20:30 hrs.
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
                <span className="font-black text-stone-900 block mb-1">3. Control de Merma</span>
                Si a las 20:30 hrs quedan más de 2 charolas sin vender, reduce 1 charola en la última tanda del día siguiente.
              </div>
            </div>
          </div>

        </div>
      );
      })()}

      {/* ========================================================================= */}
      {/* PESTAÑA 4: TODAS LAS CATEGORÍAS (PRECIOS EXACTOS Y DESGLOSE)              */}
      {/* ========================================================================= */}
      {activeSubTab === 'categorias' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          
          {/* Tarjetas de las 6 Categorías Requeridas por el Usuario */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {stats.categoryList.map(cat => (
              <div 
                key={cat.key}
                className="bg-white rounded-3xl p-4 border shadow-xs flex flex-col justify-between hover:shadow-md transition-all"
                style={{ borderColor: cat.color }}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{cat.emoji}</span>
                      <div>
                        <h4 className="font-black text-sm text-stone-900">{cat.label}</h4>
                        <span className="text-[10px] text-stone-500 font-semibold">
                          Precio base: ${cat.targetPrice > 0 ? `${cat.targetPrice}.00` : 'Variable'}
                        </span>
                      </div>
                    </div>
                    <span 
                      className="font-black text-xs px-2.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                    >
                      {cat.percentageOfPieces}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3.5">
                    <div className="bg-stone-50 rounded-xl p-2 text-center">
                      <div className="text-[10px] uppercase font-bold text-stone-500">Piezas Vendidas</div>
                      <div className="text-xl font-black text-stone-900 font-mono mt-0.5">
                        {cat.totalPieces.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-stone-50 rounded-xl p-2 text-center">
                      <div className="text-[10px] uppercase font-bold text-stone-500">Ingresos Totales</div>
                      <div className="text-lg font-black font-mono mt-0.5" style={{ color: cat.color }}>
                        ${cat.totalRevenue.toLocaleString()}.00
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
                  <span>Promedio diario:</span>
                  <span className="font-black text-stone-900 font-mono">
                    ~{cat.dailyAvgPieces} pzas/día
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Gráficas Comparativas: Distribución de Piezas y Ventas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Gráfica de Dona / Pastel */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-3">
              <h4 className="font-black text-base text-stone-900 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-amber-600" />
                <span>Distribución Porcentual de Piezas Producidas</span>
              </h4>
              <p className="text-xs text-stone-500">
                Participación de cada variedad sobre el volumen total de la panadería.
              </p>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-stone-900 text-white rounded-xl p-2.5 shadow-lg text-xs space-y-0.5">
                              <div className="font-black text-amber-300">{data.name}</div>
                              <div>{data.value} piezas ({data.percentage}%)</div>
                              <div className="text-stone-300 font-mono">${data.revenue}.00 mxn</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabla Resumen de Rentabilidad y Volumen */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs flex flex-col justify-between">
              <div>
                <h4 className="font-black text-base text-stone-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <span>Resumen Ejecutivo de Producción</span>
                </h4>
                <p className="text-xs text-stone-500 mb-3">
                  Totales consolidados analizados en el período.
                </p>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl text-xs">
                    <span className="text-stone-600 font-medium">Piezas Totales de Pan:</span>
                    <span className="font-black text-stone-900 font-mono text-sm">
                      {stats.totalPiecesProduced.toLocaleString()} pzas
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl text-xs">
                    <span className="text-stone-600 font-medium">Ingresos Totales en Mostrador:</span>
                    <span className="font-black text-emerald-800 font-mono text-sm">
                      ${stats.totalRevenue.toLocaleString()}.00
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl text-xs border border-amber-200">
                    <span className="text-amber-900 font-bold">Charolas de Bolillo Totales:</span>
                    <span className="font-black text-amber-900 font-mono text-sm">
                      ~{stats.bolilloTotalTrays} charolas
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-500 italic">
                * Conforme se registren nuevas ventas cada día en el mostrador, estos indicadores se recalculan automáticamente sin necesidad de recargar.
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Nota Informativa al Pie */}
      <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-200 text-xs text-amber-950 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black">
            💡
          </div>
          <div>
            <span className="font-black">Sistema de Auto-Alimentación Continua:</span>
            <span className="text-stone-700 ml-1">
              Todos los cobros de $5, $12, $18, $20, $25 y $35 pesos alimentan de inmediato esta pantalla. Mientras más días pasen, tus estimaciones por día y por hora serán cada vez más exactas.
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};
