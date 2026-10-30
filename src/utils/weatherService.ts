/**
 * Servicio Meteorológico en tiempo real y Predictor de Demanda de Pan
 * para Panadería Santa Fé en Zakia, Querétaro (CP 76269).
 *
 * Utiliza Open-Meteo API (alta precisión geográfica a 2,003 msnm, sin API Key)
 * con cálculo del "Efecto Clima / Antojo de Pan Dulce y Bolillo":
 * - Días nublados, lluviosos o con frío disparan la demanda de pan con café o chocolate.
 * - Días despejados y calurosos mantienen la venta de bolillo básico pero moderan el pan dulce.
 */

export interface ZakiaCurrentWeather {
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  weatherDescription: string;
  weatherEmoji: string;
  cloudCover: number;
  rainProbability: number;
  precipitationMm: number;
  windSpeed: number;
  humidity: number;
  isDay: boolean;
  updatedAt: string;
}

export interface DayForecast {
  date: string;
  dayName: string;
  dayShort: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  weatherDescription: string;
  weatherEmoji: string;
  rainProbability: number;
  precipitationSum: number;
  demandLevel: 'muy_alto' | 'alto' | 'normal' | 'moderado';
  demandMultiplier: number; // Ej: 1.30 (+30%)
  percentLabel: string; // Ej: "+30%"
  advice: string;
  recommendedExtraTrays: number; // Charolas extra de bolillo
}

export interface BreadDemandForecast {
  location: string;
  postalCode: string;
  elevationMeters: number;
  current: ZakiaCurrentWeather;
  dailyForecast: DayForecast[];
  demandLevel: 'muy_alto' | 'alto' | 'normal' | 'moderado';
  demandMultiplier: number;
  percentageChange: number;
  badgeText: string;
  headline: string;
  summary: string;
  categoryAdvice: {
    bolillo: {
      boostPct: number;
      actionText: string;
      extraTraysRecommended: number;
    };
    tradicional: {
      boostPct: number;
      actionText: string;
    };
    relleno: {
      boostPct: number;
      actionText: string;
    };
    muerto: {
      boostPct: number;
      actionText: string;
    };
  };
}

// Coordenadas exactas para Zakia, El Marqués, Querétaro (CP 76269)
export const ZAKIA_COORDINATES = {
  latitude: 20.6552,
  longitude: -100.3140,
  name: 'Zakia, El Marqués',
  state: 'Querétaro',
  cp: '76269',
  elevation: 2003
};

const CACHE_KEY = 'santafe_zakia_weather_cache_v1';
const CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutos de caché

/**
 * Traduce el código WMO oficial de meteorología a descripción amigable y emoji
 */
export function interpretWmoCode(code: number): { description: string; emoji: string; isRain: boolean; isCloudy: boolean } {
  if (code === 0) return { description: 'Cielo Despejado', emoji: '☀️', isRain: false, isCloudy: false };
  if (code === 1) return { description: 'Mayormente Despejado', emoji: '🌤️', isRain: false, isCloudy: false };
  if (code === 2) return { description: 'Parcialmente Nublado', emoji: '⛅', isRain: false, isCloudy: true };
  if (code === 3) return { description: 'Nublado / Cubierto', emoji: '☁️', isRain: false, isCloudy: true };
  if (code === 45 || code === 48) return { description: 'Niebla / Neblina', emoji: '🌫️', isRain: false, isCloudy: true };
  if (code >= 51 && code <= 55) return { description: 'Llovizna / Chispeando', emoji: '🌦️', isRain: true, isCloudy: true };
  if (code >= 61 && code <= 65) return { description: 'Lluvia Constante', emoji: '🌧️', isRain: true, isCloudy: true };
  if (code >= 80 && code <= 82) return { description: 'Chubascos Fuertes', emoji: '🌧️', isRain: true, isCloudy: true };
  if (code >= 95 && code <= 99) return { description: 'Tormenta Eléctrica', emoji: '⛈️', isRain: true, isCloudy: true };
  return { description: 'Templado', emoji: '⛅', isRain: false, isCloudy: false };
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORTS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Evalúa las condiciones climáticas y calcula el factor multiplicador de demanda de pan
 */
function calculateBreadDemandFactor(
  temp: number,
  apparentTemp: number,
  cloudCover: number,
  rainProb: number,
  isRain: boolean
): {
  demandLevel: 'muy_alto' | 'alto' | 'normal' | 'moderado';
  multiplier: number;
  percentChange: number;
  badge: string;
  headline: string;
  summary: string;
  bolilloBoost: number;
  tradicionalBoost: number;
  rellenoBoost: number;
  muertoBoost: number;
} {
  // Condiciones clave en Querétaro (Zakia):
  // 1. Lluvia franca o llovizna: Antojo máximo de café con pan y bolillo calientito.
  // 2. Clima frío (< 16°C o sensación térmica baja): Antojo alto.
  // 3. Nublado cerrado (> 70% nubes): Mayor apetito por merienda dulce.
  // 4. Calor extremo (> 28°C despejado): Se busca más líquidos fríos, pan dulce se modera.

  let multiplier = 1.0;
  let headline = 'Demanda Habitual de Pan';
  let badge = '⚖️ Demanda Estándar';
  let summary = 'Condiciones templadas estándar. Mantén las tandas de horneado programadas.';

  let bolilloBoost = 0;
  let tradicionalBoost = 0;
  let rellenoBoost = 0;
  let muertoBoost = 0;

  if (isRain || rainProb >= 60) {
    // LLUVIA: El mayor disparador de ventas en panaderías mexicanas
    multiplier = 1.35;
    bolilloBoost = 25;
    tradicionalBoost = 40;
    rellenoBoost = 35;
    muertoBoost = 40;
    headline = '¡Día Lluvioso en Zakia! Antojo Máximo de Pan';
    badge = '🌧️☕ Demanda Muy Alta (+35%)';
    summary = `Con lluvia y humedad en Zakia, las familias buscan pan dulce para café, chocolate y merienda. Prepara charolas extra de conchas, cuernos, bolillo y pan de muerto para la tarde.`;
  } else if (cloudCover >= 70 || apparentTemp <= 17) {
    // NUBLADO O FRESCO
    multiplier = 1.25;
    bolilloBoost = 15;
    tradicionalBoost = 25;
    rellenoBoost = 25;
    muertoBoost = 30;
    headline = 'Clima Fresco y Nublado: Excelente Venta';
    badge = '☁️🧥 Demanda Alta (+25%)';
    summary = `El día nublado o fresco en Zakia aumenta el antojo de piezas tradicionales y de relleno. Hornea tandas calientes adicionales para el turno de la tarde (17:00 a 20:00 hrs).`;
  } else if (temp >= 29 && cloudCover < 30) {
    // CALOR DESPEJADO
    multiplier = 0.90;
    bolilloBoost = 0; // El bolillo nunca baja porque es comida diaria
    tradicionalBoost = -10;
    rellenoBoost = -10;
    muertoBoost = -5;
    headline = 'Día Soleado y Caluroso';
    badge = '☀️ Moderar Pan Dulce (-10%)';
    summary = `El calor hace que el consumo de pan dulce disminuya ligeramente. Mantén la producción de bolillo completa pero cuida no saturar las charolas de piezas con chocolate o rellenos cremosos.`;
  } else {
    // TEMPLADO AGRADABLE
    multiplier = 1.05;
    bolilloBoost = 5;
    tradicionalBoost = 5;
    rellenoBoost = 5;
    muertoBoost = 10;
    headline = 'Clima Favorable y Templado en Zakia';
    badge = '✨ Ritmo Óptimo (+5%)';
    summary = `Clima ideal para el flujo constante de clientes entre semana y fin de semana. Mantén el ritmo estándar con tandas frescas.`;
  }

  const percentChange = Math.round((multiplier - 1) * 100);

  let demandLevel: 'muy_alto' | 'alto' | 'normal' | 'moderado' = 'normal';
  if (multiplier >= 1.30) demandLevel = 'muy_alto';
  else if (multiplier >= 1.15) demandLevel = 'alto';
  else if (multiplier < 0.95) demandLevel = 'moderado';

  return {
    demandLevel,
    multiplier,
    percentChange,
    badge,
    headline,
    summary,
    bolilloBoost,
    tradicionalBoost,
    rellenoBoost,
    muertoBoost
  };
}

/**
 * Consulta la API oficial de Open-Meteo para Zakia, Querétaro
 */
export async function fetchZakiaBreadWeather(forceRefresh: boolean = false): Promise<BreadDemandForecast> {
  // 1. Revisar caché local si no se fuerza la actualización
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        if (age < CACHE_TTL_MS && parsed.data) {
          return parsed.data as BreadDemandForecast;
        }
      }
    } catch {
      // Ignorar error de lectura de caché
    }
  }

  const { latitude, longitude } = ZAKIA_COORDINATES;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=America%2FMexico_City`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error consultando clima de Zakia: ${response.statusText}`);
  }

  const data = await response.json();

  // Parsear estado actual
  const cur = data.current;
  const wmo = interpretWmoCode(cur.weather_code);
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const currentWeather: ZakiaCurrentWeather = {
    temperature: Math.round(cur.temperature_2m),
    apparentTemperature: Math.round(cur.apparent_temperature),
    weatherCode: cur.weather_code,
    weatherDescription: wmo.description,
    weatherEmoji: wmo.emoji,
    cloudCover: Math.round(cur.cloud_cover || 0),
    rainProbability: Math.round(data.hourly?.precipitation_probability?.[now.getHours()] || 0),
    precipitationMm: cur.precipitation || 0,
    windSpeed: Math.round(cur.wind_speed_10m || 0),
    humidity: Math.round(cur.relative_humidity_2m || 0),
    isDay: cur.is_day === 1,
    updatedAt: timeFormatted
  };

  // Calcular impacto de demanda de hoy
  const impact = calculateBreadDemandFactor(
    currentWeather.temperature,
    currentWeather.apparentTemperature,
    currentWeather.cloudCover,
    currentWeather.rainProbability,
    wmo.isRain
  );

  // Parsear pronóstico de 7 días
  const daily = data.daily || {};
  const dailyForecast: DayForecast[] = [];

  const times: string[] = daily.time || [];
  const weatherCodes: number[] = daily.weather_code || [];
  const tempMaxs: number[] = daily.temperature_2m_max || [];
  const tempMins: number[] = daily.temperature_2m_min || [];
  const precipSums: number[] = daily.precipitation_sum || [];
  const precipProbs: number[] = daily.precipitation_probability_max || [];

  for (let i = 0; i < times.length; i++) {
    const dStr = times[i];
    const [yr, mo, da] = dStr.split('-').map(n => parseInt(n, 10));
    const dt = new Date(yr, mo - 1, da);
    const dayIdx = dt.getDay();
    const dayWmo = interpretWmoCode(weatherCodes[i]);
    const maxT = Math.round(tempMaxs[i] || 22);
    const minT = Math.round(tempMins[i] || 12);
    const probRain = Math.round(precipProbs[i] || 0);

    const dayImpact = calculateBreadDemandFactor(
      maxT,
      minT,
      dayWmo.isCloudy ? 80 : 20,
      probRain,
      dayWmo.isRain
    );

    // Calcular charolas extra recomendadas según el multiplicador
    const extraTrays = Math.max(0, Math.round((dayImpact.multiplier - 1.0) * 12));

    let advice = 'Producción regular';
    if (dayImpact.demandLevel === 'muy_alto') {
      advice = `🌧️ Amasar +${dayImpact.percentChange}% de pan dulce y hornear ${extraTrays} charolas extra de bolillo para la tarde`;
    } else if (dayImpact.demandLevel === 'alto') {
      advice = `☁️ Aumentar conchas y piezas clásicas (+${dayImpact.percentChange}%)`;
    } else if (dayImpact.demandLevel === 'moderado') {
      advice = `☀️ Día caluroso: hornear tandas pequeñas de pan con relleno`;
    } else {
      advice = `⚖️ Tandas normales de horneado`;
    }

    dailyForecast.push({
      date: dStr,
      dayName: DAY_NAMES[dayIdx],
      dayShort: DAY_SHORTS[dayIdx],
      tempMax: maxT,
      tempMin: minT,
      weatherCode: weatherCodes[i],
      weatherDescription: dayWmo.description,
      weatherEmoji: dayWmo.emoji,
      rainProbability: probRain,
      precipitationSum: precipSums[i] || 0,
      demandLevel: dayImpact.demandLevel,
      demandMultiplier: dayImpact.multiplier,
      percentLabel: dayImpact.percentChange >= 0 ? `+${dayImpact.percentChange}%` : `${dayImpact.percentChange}%`,
      advice,
      recommendedExtraTrays: extraTrays
    });
  }

  // Charolas extra estimadas para hoy
  const todayExtraBolilloTrays = Math.max(0, Math.round((impact.multiplier - 1) * 8));

  const result: BreadDemandForecast = {
    location: `${ZAKIA_COORDINATES.name}, ${ZAKIA_COORDINATES.state}`,
    postalCode: ZAKIA_COORDINATES.cp,
    elevationMeters: ZAKIA_COORDINATES.elevation,
    current: currentWeather,
    dailyForecast,
    demandLevel: impact.demandLevel,
    demandMultiplier: impact.multiplier,
    percentageChange: impact.percentChange,
    badgeText: impact.badge,
    headline: impact.headline,
    summary: impact.summary,
    categoryAdvice: {
      bolillo: {
        boostPct: impact.bolilloBoost,
        actionText: impact.bolilloBoost > 0 
          ? `Hornear +${todayExtraBolilloTrays} charolas adicionales en turno vespertino (bolillo caliente para la cena)` 
          : 'Mantener tandas normales por turno',
        extraTraysRecommended: todayExtraBolilloTrays
      },
      tradicional: {
        boostPct: impact.tradicionalBoost,
        actionText: impact.tradicionalBoost > 0 
          ? `Aumentar conchas, cuernos y donas (+${impact.tradicionalBoost}%) por alto antojo de café con pan` 
          : 'Producción estándar balanceada'
      },
      relleno: {
        boostPct: impact.rellenoBoost,
        actionText: impact.rellenoBoost > 0 
          ? `Hornear más piezas de queso con zarzamora y crema pastelera (+${impact.rellenoBoost}%)` 
          : 'Mantener tandas estándar'
      },
      muerto: {
        boostPct: impact.muertoBoost,
        actionText: impact.muertoBoost > 0 
          ? `Día perfecto para exhibir pan de muerto con azúcar y relleno de nata al frente del mostrador (+${impact.muertoBoost}%)` 
          : 'Exhibición estándar en vitrina'
      }
    }
  };

  // Guardar en caché local
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: result
    }));
  } catch {
    // Ignore cache save issues
  }

  return result;
}
