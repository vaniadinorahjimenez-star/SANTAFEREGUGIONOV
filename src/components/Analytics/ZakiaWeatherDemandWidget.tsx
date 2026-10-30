import React, { useState, useEffect, useCallback } from 'react';
import { 
  CloudRain, 
  Cloud, 
  Sun, 
  Thermometer, 
  Droplets, 
  Wind, 
  RefreshCw, 
  MapPin, 
  Sparkles, 
  Coffee, 
  Flame, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Sliders,
  TrendingUp,
  Compass
} from 'lucide-react';
import { 
  BreadDemandForecast, 
  fetchZakiaBreadWeather, 
  ZAKIA_COORDINATES, 
  DayForecast,
  interpretWmoCode
} from '../../utils/weatherService';

interface ZakiaWeatherDemandWidgetProps {
  onApplyWeatherBoost?: (boostMultiplier: number) => void;
  bolillosPerTray?: number;
}

type SimulationScenario = 'real' | 'lluvia' | 'frio_nublado' | 'calor';

export const ZakiaWeatherDemandWidget: React.FC<ZakiaWeatherDemandWidgetProps> = ({
  onApplyWeatherBoost,
  bolillosPerTray = 12
}) => {
  const [weatherData, setWeatherData] = useState<BreadDemandForecast | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<SimulationScenario>('real');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Cargar datos meteorológicos reales de Zakia
  const loadWeather = useCallback(async (force: boolean = false) => {
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await fetchZakiaBreadWeather(force);
      setWeatherData(data);
    } catch (err: any) {
      console.error('Error cargando clima de Zakia:', err);
      setError(err?.message || 'No se pudo conectar con el servicio meteorológico.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWeather(false);
  }, [loadWeather]);

  // Si se selecciona un escenario simulado para capacitación o prueba del panadero
  const activeForecast: BreadDemandForecast | null = React.useMemo(() => {
    if (!weatherData) return null;
    if (scenario === 'real') return weatherData;

    // Clonar y simular condiciones
    const cloned: BreadDemandForecast = JSON.parse(JSON.stringify(weatherData));

    if (scenario === 'lluvia') {
      cloned.current.temperature = 16;
      cloned.current.apparentTemperature = 15;
      cloned.current.weatherCode = 61;
      cloned.current.weatherDescription = 'Lluvia Constante & Frío';
      cloned.current.weatherEmoji = '🌧️';
      cloned.current.cloudCover = 95;
      cloned.current.rainProbability = 85;
      cloned.current.precipitationMm = 8.4;
      cloned.demandLevel = 'muy_alto';
      cloned.demandMultiplier = 1.35;
      cloned.percentageChange = 35;
      cloned.badgeText = '🌧️☕ Demanda Muy Alta (+35%)';
      cloned.headline = '¡Día Lluvioso en Zakia! Antojo Máximo de Pan Dulce';
      cloned.summary = 'La lluvia y el aire fresco en Zakia provocan un incremento marcado en la compra de conchas, cuernos, donas, pan con relleno y bolillo caliente para la cena.';
      cloned.categoryAdvice.bolillo.boostPct = 25;
      cloned.categoryAdvice.bolillo.extraTraysRecommended = 6;
      cloned.categoryAdvice.bolillo.actionText = 'Hornear +6 charolas adicionales repartidas en las tandas de 16:00 y 18:30 hrs';
      cloned.categoryAdvice.tradicional.boostPct = 40;
      cloned.categoryAdvice.tradicional.actionText = 'Aumentar conchas de vainilla/chocolate y cuernos (+40% de piezas)';
      cloned.categoryAdvice.relleno.boostPct = 35;
      cloned.categoryAdvice.relleno.actionText = 'Hornear más piezas de queso con zarzamora y crema chantilly (+35%)';
      cloned.categoryAdvice.muerto.boostPct = 40;
      cloned.categoryAdvice.muerto.actionText = 'Exhibir pan de muerto tradicional y relleno en charolas principales';
    } else if (scenario === 'frio_nublado') {
      cloned.current.temperature = 15;
      cloned.current.apparentTemperature = 14;
      cloned.current.weatherCode = 3;
      cloned.current.weatherDescription = 'Cielo Nublado y Fresco';
      cloned.current.weatherEmoji = '☁️';
      cloned.current.cloudCover = 85;
      cloned.current.rainProbability = 30;
      cloned.current.precipitationMm = 0;
      cloned.demandLevel = 'alto';
      cloned.demandMultiplier = 1.25;
      cloned.percentageChange = 25;
      cloned.badgeText = '☁️🧥 Demanda Alta (+25%)';
      cloned.headline = 'Día Fresco y Nublado: Excelente Venta de Pan';
      cloned.summary = 'El cielo cubierto y la brisa fresca de Zakia estimulan la compra vespertina de pan dulce tradicional y piezas calientes.';
      cloned.categoryAdvice.bolillo.boostPct = 15;
      cloned.categoryAdvice.bolillo.extraTraysRecommended = 4;
      cloned.categoryAdvice.bolillo.actionText = 'Preparar +4 charolas de bolillo para el pico de las 18:30 hrs';
      cloned.categoryAdvice.tradicional.boostPct = 25;
      cloned.categoryAdvice.tradicional.actionText = 'Hornear +25% de piezas tradicionales (conchas, orejas, mantecadas)';
      cloned.categoryAdvice.relleno.boostPct = 25;
      cloned.categoryAdvice.relleno.actionText = 'Mayor salida de pan con crema y zarzamora';
      cloned.categoryAdvice.muerto.boostPct = 30;
    } else if (scenario === 'calor') {
      cloned.current.temperature = 30;
      cloned.current.apparentTemperature = 31;
      cloned.current.weatherCode = 0;
      cloned.current.weatherDescription = 'Soleado y Caluroso';
      cloned.current.weatherEmoji = '☀️';
      cloned.current.cloudCover = 10;
      cloned.current.rainProbability = 5;
      cloned.current.precipitationMm = 0;
      cloned.demandLevel = 'moderado';
      cloned.demandMultiplier = 0.90;
      cloned.percentageChange = -10;
      cloned.badgeText = '☀️ Moderar Pan Dulce (-10%)';
      cloned.headline = 'Día Soleado: El Bolillo se Mantiene, Moderar Dulce';
      cloned.summary = 'Con calor las familias prefieren bebidas heladas. El bolillo mantiene su demanda como alimento diario, pero cuida no hornear de más en panes muy dulces o con chocolate.';
      cloned.categoryAdvice.bolillo.boostPct = 0;
      cloned.categoryAdvice.bolillo.extraTraysRecommended = 0;
      cloned.categoryAdvice.bolillo.actionText = 'Producción regular de bolillo (el consumo de tortas y comida se mantiene)';
      cloned.categoryAdvice.tradicional.boostPct = -10;
      cloned.categoryAdvice.tradicional.actionText = 'Hornear tandas justas para evitar merma por calor';
      cloned.categoryAdvice.relleno.boostPct = -10;
      cloned.categoryAdvice.relleno.actionText = 'Cuidar refrigeración y rotación de cremas';
      cloned.categoryAdvice.muerto.boostPct = -5;
    }

    return cloned;
  }, [weatherData, scenario]);

  if (loading && !weatherData) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-amber-200 shadow-xs flex flex-col items-center justify-center text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-amber-600 animate-spin" />
        <p className="text-sm font-bold text-stone-700">
          Consultando estación meteorológica en tiempo real para Zakia, Querétaro (CP 76269)...
        </p>
        <span className="text-xs text-stone-500">Analizando temperatura, nubosidad y probabilidad de lluvia</span>
      </div>
    );
  }

  if (error && !weatherData) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-6 text-rose-900 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
          <h4 className="font-black text-sm">No se pudo cargar el pronóstico del clima</h4>
        </div>
        <p className="text-xs">{error}</p>
        <button
          type="button"
          onClick={() => loadWeather(true)}
          className="text-xs font-black bg-rose-600 text-white px-3.5 py-1.5 rounded-xl hover:bg-rose-700 transition-all cursor-pointer"
        >
          Reintentar conexión con Zakia
        </button>
      </div>
    );
  }

  if (!activeForecast) return null;

  const { current, dailyForecast, demandMultiplier, percentageChange, badgeText, headline, summary, categoryAdvice } = activeForecast;

  // Determinar paleta de color según el semáforo de demanda
  const isHighDemand = activeForecast.demandLevel === 'muy_alto' || activeForecast.demandLevel === 'alto';
  const isExtremeRain = activeForecast.demandLevel === 'muy_alto';

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      
      {/* 1. HERO CARD: Clima en Tiempo Real en Zakia & Semáforo de Demanda */}
      <div className={`rounded-3xl p-5 sm:p-7 shadow-lg border text-white transition-all ${
        isExtremeRain 
          ? 'bg-gradient-to-r from-blue-950 via-indigo-950 to-stone-950 border-blue-600/40' 
          : isHighDemand 
            ? 'bg-gradient-to-r from-amber-950 via-stone-900 to-amber-900 border-amber-600/40'
            : 'bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 border-stone-700'
      }`}>
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          
          {/* Lado izquierdo: Ubicación + Temperatura + Estado */}
          <div className="space-y-3 max-w-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-black text-amber-200 border border-white/20">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>Zakia, El Marqués, Qro. (C.P. 76269)</span>
              </span>
              <span className="text-[11px] text-stone-300 font-mono">
                Altitud: 2,003 msnm · Actualizado: {current.updatedAt} hrs
              </span>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <span className="text-5xl sm:text-6xl drop-shadow-md select-none">
                {current.weatherEmoji}
              </span>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white">
                    {current.temperature}°C
                  </span>
                  <span className="text-sm text-stone-300 font-medium">
                    (Sensación: {current.apparentTemperature}°C)
                  </span>
                </div>
                <div className="text-base sm:text-lg font-bold text-amber-200 flex items-center gap-2">
                  <span>{current.weatherDescription}</span>
                  {current.cloudCover >= 70 && (
                    <span className="text-xs bg-amber-500/30 border border-amber-400/30 text-amber-200 px-2 py-0.5 rounded-md font-black">
                      ☁️ Nublado {current.cloudCover}%
                    </span>
                  )}
                  {current.rainProbability >= 40 && (
                    <span className="text-xs bg-blue-500/40 border border-blue-400/40 text-blue-200 px-2 py-0.5 rounded-md font-black">
                      🌧️ Lluvia {current.rainProbability}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-stone-200 leading-relaxed font-medium pt-1">
              {summary}
            </p>
          </div>

          {/* Lado derecho: Tarjeta de Impacto de Demanda & Factor Multiplicador */}
          <div className="bg-black/40 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/15 flex flex-col justify-between gap-4 shrink-0 lg:w-80">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black tracking-wider text-amber-300">
                  Impacto en Panadería
                </span>
                <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                  isHighDemand ? 'bg-emerald-500 text-stone-950' : 'bg-stone-700 text-stone-200'
                }`}>
                  {badgeText}
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono flex items-baseline gap-1 mt-1">
                <span>{percentageChange >= 0 ? `+${percentageChange}%` : `${percentageChange}%`}</span>
                <span className="text-xs font-normal text-stone-300">demanda de pan</span>
              </div>
              <p className="text-xs text-stone-300 font-medium">
                {isHighDemand 
                  ? '☕ El frío/lluvia genera alto antojo de café con pan dulce y bolillo recién horneado.'
                  : 'Producción habitual en sus niveles estándar.'}
              </p>
            </div>

            {/* Métricas meteorológicas secundarias */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center text-xs">
              <div className="bg-white/5 rounded-xl p-1.5">
                <div className="text-[9px] text-stone-400 uppercase font-bold flex items-center justify-center gap-1">
                  <Cloud className="w-3 h-3 text-stone-300" /> Nubes
                </div>
                <div className="font-mono font-black text-white mt-0.5">{current.cloudCover}%</div>
              </div>
              <div className="bg-white/5 rounded-xl p-1.5">
                <div className="text-[9px] text-stone-400 uppercase font-bold flex items-center justify-center gap-1">
                  <Droplets className="w-3 h-3 text-blue-400" /> Humedad
                </div>
                <div className="font-mono font-black text-white mt-0.5">{current.humidity}%</div>
              </div>
              <div className="bg-white/5 rounded-xl p-1.5">
                <div className="text-[9px] text-stone-400 uppercase font-bold flex items-center justify-center gap-1">
                  <Wind className="w-3 h-3 text-stone-300" /> Viento
                </div>
                <div className="font-mono font-black text-white mt-0.5">{current.windSpeed} km/h</div>
              </div>
            </div>

            {/* Botón Refrescar en Vivo */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => loadWeather(true)}
                disabled={isRefreshing}
                className="w-full text-xs font-bold py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Actualizando Zakia...' : 'Actualizar Clima en Vivo'}</span>
              </button>
            </div>

          </div>

        </div>

        {/* Simulador de Escenarios Climáticos para el Taller */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-amber-300 font-bold flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5" />
              <span>Simulador de Escenarios:</span>
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: 'real' as SimulationScenario, label: '📡 Clima Real Zakia', emoji: '📍' },
                { id: 'lluvia' as SimulationScenario, label: '🌧️ Día con Lluvia', emoji: '☔' },
                { id: 'frio_nublado' as SimulationScenario, label: '☁️ Frío y Nublado', emoji: '🧥' },
                { id: 'calor' as SimulationScenario, label: '☀️ Soleado Caluroso', emoji: '🕶️' }
              ].map(sc => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setScenario(sc.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                    scenario === sc.id
                      ? 'bg-amber-400 text-stone-950 font-black shadow-sm'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <span>{sc.label}</span>
                </button>
              ))}
            </div>
          </div>

          <span className="text-[11px] text-amber-200/80">
            {scenario === 'real' ? 'Mostrando datos meteorológicos en directo' : 'Modo de prueba activo'}
          </span>
        </div>

      </div>

      {/* 2. RECOMENDACIONES DE PRODUCCIÓN POR TIPO DE PAN EN ZAKIA */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
          <div>
            <h3 className="text-base sm:text-lg font-black text-amber-950 flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-600" />
              <span>Ajuste de Producción por Clima para Panadería Santa Fé</span>
            </h3>
            <p className="text-xs text-stone-600 mt-0.5">
              Recomendación de horneado para hoy calculada con base en la temperatura y cielo de Zakia.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-black px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
              Factor Clima: {percentageChange >= 0 ? `+${percentageChange}%` : `${percentageChange}%`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          
          {/* Bolillo $5 */}
          <div className="bg-amber-50/80 rounded-2xl p-4 border border-amber-300/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-black text-xs uppercase text-amber-900">Bolillo ($5)</span>
                <span className="text-2xl">🥖</span>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-amber-950 font-mono">
                  {categoryAdvice.bolillo.boostPct > 0 ? `+${categoryAdvice.bolillo.boostPct}%` : 'Normal'}
                </div>
                <div className="text-xs text-amber-800 font-bold mt-0.5">
                  {categoryAdvice.bolillo.extraTraysRecommended > 0 
                    ? `~+${categoryAdvice.bolillo.extraTraysRecommended} charolas extra` 
                    : 'Mantener charolas base'}
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-amber-200 text-xs text-amber-950 font-medium">
              {categoryAdvice.bolillo.actionText}
            </div>
          </div>

          {/* Pan Tradicional $12 */}
          <div className="bg-orange-50/80 rounded-2xl p-4 border border-orange-300/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-black text-xs uppercase text-orange-900">Tradicional ($12)</span>
                <span className="text-2xl">🥐</span>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-orange-950 font-mono">
                  {categoryAdvice.tradicional.boostPct > 0 ? `+${categoryAdvice.tradicional.boostPct}%` : `${categoryAdvice.tradicional.boostPct}%`}
                </div>
                <div className="text-xs text-orange-800 font-bold mt-0.5">
                  Conchas, Cuernos y Donas
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-orange-200 text-xs text-orange-950 font-medium">
              {categoryAdvice.tradicional.actionText}
            </div>
          </div>

          {/* Pan de Relleno $18 */}
          <div className="bg-purple-50/80 rounded-2xl p-4 border border-purple-300/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-black text-xs uppercase text-purple-900">Con Relleno ($18)</span>
                <span className="text-2xl">🥯</span>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-purple-950 font-mono">
                  {categoryAdvice.relleno.boostPct > 0 ? `+${categoryAdvice.relleno.boostPct}%` : `${categoryAdvice.relleno.boostPct}%`}
                </div>
                <div className="text-xs text-purple-800 font-bold mt-0.5">
                  Queso zarzamora & Crema
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-purple-200 text-xs text-purple-950 font-medium">
              {categoryAdvice.relleno.actionText}
            </div>
          </div>

          {/* Pan de Muerto $25 y $35 */}
          <div className="bg-rose-50/80 rounded-2xl p-4 border border-rose-300/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-black text-xs uppercase text-rose-900">P. Muerto ($25-$35)</span>
                <span className="text-2xl">💀</span>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-rose-950 font-mono">
                  {categoryAdvice.muerto.boostPct > 0 ? `+${categoryAdvice.muerto.boostPct}%` : `${categoryAdvice.muerto.boostPct}%`}
                </div>
                <div className="text-xs text-rose-800 font-bold mt-0.5">
                  Tradicional y Relleno
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-rose-200 text-xs text-rose-950 font-medium">
              {categoryAdvice.muerto.actionText}
            </div>
          </div>

        </div>
      </div>

      {/* 3. PRONÓSTICO DE LOS PRÓXIMOS 7 DÍAS EN ZAKIA (PLANIFICACIÓN DE COMPRAS Y HORNEADO) */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
          <div>
            <h3 className="text-base sm:text-lg font-black text-amber-950 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-700" />
              <span>Pronóstico Meteorológico & Antojo Semanal en Zakia</span>
            </h3>
            <p className="text-xs text-stone-600 mt-0.5">
              Anticipa qué días lloverá o bajará la temperatura para abastecer harina, azúcar, levadura y rellenos antes de que empiece la alta demanda.
            </p>
          </div>

          <span className="text-xs font-bold text-stone-500 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-amber-600" />
            <span>Datos Open-Meteo Oficiales (7 Días)</span>
          </span>
        </div>

        {/* Tarjetas de cada día de la semana */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
          {dailyForecast.map((day, idx) => {
            const isDayHigh = day.demandLevel === 'muy_alto' || day.demandLevel === 'alto';
            const isRainy = day.rainProbability >= 45 || day.weatherCode >= 51;

            return (
              <div
                key={day.date}
                className={`rounded-2xl p-3.5 border flex flex-col justify-between transition-all ${
                  day.demandLevel === 'muy_alto'
                    ? 'bg-blue-50/90 border-blue-300 shadow-xs ring-2 ring-blue-500/20'
                    : day.demandLevel === 'alto'
                      ? 'bg-amber-50/90 border-amber-300 shadow-xs'
                      : day.demandLevel === 'moderado'
                        ? 'bg-stone-50 border-stone-200'
                        : 'bg-white border-stone-200'
                }`}
              >
                <div>
                  {/* Encabezado Día */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-black text-sm text-stone-900 block">{day.dayName}</span>
                      <span className="text-[10px] text-stone-500 font-mono">{day.date.slice(5)}</span>
                    </div>
                    <span className="text-2xl select-none">{day.weatherEmoji}</span>
                  </div>

                  {/* Temperaturas y Lluvia */}
                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-baseline gap-1.5 font-mono">
                      <span className="font-black text-base text-stone-900">{day.tempMax}°</span>
                      <span className="text-xs text-stone-500">{day.tempMin}°</span>
                    </div>

                    <div className="text-[11px] font-bold text-stone-700 flex items-center gap-1">
                      {isRainy ? (
                        <span className="text-blue-700 font-black flex items-center gap-0.5">
                          <CloudRain className="w-3 h-3" /> {day.rainProbability}% lluvia
                        </span>
                      ) : (
                        <span className="text-stone-600">{day.weatherDescription}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Badge de Demanda de Pan */}
                <div className="mt-3 pt-2.5 border-t border-stone-200/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-stone-500">Demanda:</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${
                      day.demandLevel === 'muy_alto'
                        ? 'bg-blue-600 text-white'
                        : day.demandLevel === 'alto'
                          ? 'bg-amber-500 text-stone-950'
                          : 'bg-stone-200 text-stone-700'
                    }`}>
                      {day.percentLabel}
                    </span>
                  </div>

                  <p className="text-[10px] leading-tight text-stone-700 font-medium line-clamp-3 mt-1">
                    {day.advice}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* 4. GUÍA PRÁCTICA DEL PANADERO: ¿POR QUÉ EL CLIMA DE ZAKIA AFECTA TANTO EL PAN? */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-5 sm:p-6 border border-amber-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-amber-950 font-black text-sm sm:text-base">
          <Coffee className="w-4 h-4 text-amber-700" />
          <span>La Psicología del Pan Dulce en Zakia, Querétaro:</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-medium text-stone-700">
          <div className="bg-white p-3.5 rounded-2xl border border-amber-100 shadow-2xs">
            <span className="font-black text-stone-900 block mb-1">🌧️ 1. Lluvia y Merienda Familiar</span>
            Cuando llueve por la tarde en Zakia, las familias no salen a restaurantes lejanos; en su lugar, mandan a comprar pan para tomar con café de olla, chocolate abuelita o té caliente. El volumen de pan dulce se dispara de +25% a +40%.
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-amber-100 shadow-2xs">
            <span className="font-black text-stone-900 block mb-1">🥖 2. Bolillo Caliente Vespertino</span>
            En días nublados y frescos, el bolillo crujiente recién sacado del horno a las 18:30 hrs vuela de los canastos para acompañar cenas, frijoles y tortas calientes. Se deben preparar de 4 a 6 charolas adicionales.
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-amber-100 shadow-2xs">
            <span className="font-black text-stone-900 block mb-1">📦 3. Anticipación en Compras de Insumos</span>
            Revisa el pronóstico de 7 días arriba: si ves que jueves y viernes viene lluvia con probabilidad &gt;60%, pide bultos adicionales de harina y mantequilla desde el martes para no quedarte sin stock.
          </div>
        </div>
      </div>

    </div>
  );
};
