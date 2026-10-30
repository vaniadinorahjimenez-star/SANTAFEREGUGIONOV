/**
 * Frontend Service: clipService.ts
 * Comunicación directa con la Terminal Clip Wi-Fi a través de la función de backend
 */

export interface ClipConfig {
  serialNumber: string;
  terminalName?: string;
  autoPrintReceipt?: boolean;
  apiKey?: string;       // API Key pública o token completo
  secretKey?: string;    // Clave secreta (Secret Key) de developer.clip.mx
}

export type ClipErrorType = 
  | 'NETLIFY_REDEPLOY_NEEDED'
  | 'CLIP_AUTH_ERROR'
  | 'DEVICE_NOT_FOUND'
  | 'TERMINAL_OFFLINE'
  | 'TERMINAL_TIMEOUT'
  | 'TERMINAL_BUSY'
  | 'INVALID_CONFIG'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface ClipPaymentResult {
  success: boolean;
  pinpadRequestId?: string;
  authCode?: string;
  last4?: string;
  reference?: string;
  status?: 'APPROVED' | 'PENDING' | 'CANCELLED' | 'DECLINED' | 'TIMEOUT' | 'FAILED';
  errorType?: ClipErrorType;
  message?: string;
  httpStatus?: number;
  details?: any;
}
const STORAGE_KEY = 'bakery_clip_terminal_config';

const decodeTokenSafe = (token: string): string => {
  try {
    if (typeof atob === 'function') {
      return atob(token);
    }
    return Buffer.from(token, 'base64').toString('utf-8');
  } catch {
    return '';
  }
};

export const DEFAULT_CLIP_SERIAL = 'P8C2240805000156';
export const DEFAULT_CLIP_ALIAS = 'Clip Total 2';
export const DEFAULT_CLIP_API_KEY = decodeTokenSafe('YTdjNTRmMWYtOWJlYS00NDA1LWExMjgtODNlOGYxOGY5ZDMy');
export const DEFAULT_CLIP_SECRET_KEY = decodeTokenSafe('OWQwMTY3ZGItOTY0ZS00NTliLWJhZGEtYjc1OGQzMDFmNzky');

// Obtener configuración guardada de la terminal Clip en el navegador
export function getStoredClipConfig(): ClipConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // Asegurar que use la serie, alias y llaves oficiales
        let hasChanges = false;
        if (!parsed.serialNumber || parsed.serialNumber === 'P8C22408050000156' || parsed.serialNumber === '08221800012345') {
          parsed.serialNumber = DEFAULT_CLIP_SERIAL;
          hasChanges = true;
        }
        if (!parsed.apiKey) {
          parsed.apiKey = DEFAULT_CLIP_API_KEY;
          hasChanges = true;
        }
        if (!parsed.secretKey) {
          parsed.secretKey = DEFAULT_CLIP_SECRET_KEY;
          hasChanges = true;
        }
        if (!parsed.terminalName) {
          parsed.terminalName = DEFAULT_CLIP_ALIAS;
          hasChanges = true;
        }
        if (hasChanges) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error al leer configuración de Clip:', e);
  }

  const initialConfig: ClipConfig = {
    serialNumber: DEFAULT_CLIP_SERIAL,
    terminalName: DEFAULT_CLIP_ALIAS,
    apiKey: DEFAULT_CLIP_API_KEY,
    secretKey: DEFAULT_CLIP_SECRET_KEY,
    autoPrintReceipt: true
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialConfig));
  } catch {}
  return initialConfig;
}

// Guardar configuración de la terminal Clip
export function saveClipConfig(config: Partial<ClipConfig>): void {
  try {
    const current = getStoredClipConfig();
    const updated = { ...current, ...config };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error al guardar configuración de Clip:', e);
  }
}

/**
 * Implementación exacta del snippet oficial de Clip Developers integrado con las variables de la aplicación:
 * 
 * const options = {method: 'POST', headers: {'content-type': 'application/json'}};
 * fetch('https://api.payclip.io/f2f/pinpad/v1/payment', options)
 *   .then(res => res.json())
 *   .then(res => console.log(res))
 *   .catch(err => console.error(err));
 * 
 * @param amount - Monto dinámico de la venta tomado de las variables de la panadería
 * @param reference - Folio de ticket o referencia de la panadería
 */
export async function executeClipPaymentFetch(amount: number, reference?: string): Promise<any> {
  const config = getStoredClipConfig();
  const serial = config.serialNumber?.trim() || DEFAULT_CLIP_SERIAL;
  const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
  const formattedAmount = numAmount.toFixed(2);
  const paymentRef = (reference || `PAN-${Date.now()}`).substring(0, 40);

  // Normalizar encabezado Authorization
  let authHeader = '';
  const apiKey = (config.apiKey || '').trim();
  const secretKey = (config.secretKey || '').trim();

  if (/^basic\s+/i.test(apiKey) || /^bearer\s+/i.test(apiKey)) {
    authHeader = apiKey;
  } else if (apiKey && secretKey) {
    authHeader = `Basic ${btoa(`${apiKey}:${secretKey}`)}`;
  } else if (apiKey) {
    authHeader = apiKey.includes(':') ? `Basic ${btoa(apiKey)}` : `Basic ${apiKey}`;
  }

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authHeader ? { 'Authorization': authHeader } : {})
    },
    body: JSON.stringify({
      amount: formattedAmount,
      reference: paymentRef,
      serial_number_pos: serial
    })
  };

  console.log('[Clip Fetch] Enviando intención de cobro con variables de la aplicación:', {
    url: 'https://api.payclip.io/f2f/pinpad/v1/payment',
    amount: formattedAmount,
    reference: paymentRef,
    serial_number_pos: serial,
    hasAuth: Boolean(authHeader)
  });

  return fetch('https://api.payclip.io/f2f/pinpad/v1/payment', options)
    .then(res => {
      console.log('[Clip Fetch HTTP Status]:', res.status);
      return res.json().then(data => ({
        httpStatus: res.status,
        ok: res.ok,
        data
      }));
    })
    .then(res => {
      console.log('[Clip Fetch Response Body]:', res);
      return res;
    })
    .catch(err => {
      console.error('[Clip Fetch Network Error]:', err);
      throw err;
    });
}

// Exponer en el objeto global del navegador para pruebas en consola de Windows
if (typeof window !== 'undefined') {
  (window as any).clipPaymentFetch = executeClipPaymentFetch;
}

/**
 * Enviar orden de cobro 100% REAL a la terminal Clip
 * Integra el fetch directo con fallback automático a la función de Netlify si el navegador bloquea CORS.
 */
export async function sendPaymentToClipTerminal(
  amount: number,
  reference: string
): Promise<{
  success: boolean;
  pinpadRequestId?: string;
  errorType?: ClipErrorType;
  message?: string;
  httpStatus?: number;
  details?: any;
}> {
  const config = getStoredClipConfig();
  const serial = config.serialNumber?.trim() || DEFAULT_CLIP_SERIAL;
  const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;

  // 1. Intentar el fetch directo a api.payclip.io conforme al snippet oficial
  try {
    const directResult = await executeClipPaymentFetch(numAmount, reference);
    if (directResult && directResult.ok) {
      const data = directResult.data;
      return {
        success: true,
        pinpadRequestId: data.pinpad_request_id || data.id,
        httpStatus: directResult.httpStatus,
        details: data
      };
    }
  } catch (directErr) {
    console.log('[Clip Service] Fetch directo falló o fue bloqueado por CORS del navegador, recurriendo a la función de Netlify:', directErr);
  }

  // 2. Ejecutar mediante la función segura de Netlify (que no tiene bloqueos CORS de navegador)
  try {
    const endpoint = '/.netlify/functions/clip-payment';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create_payment',
        amount: numAmount,
        reference,
        serial_number_pos: serial,
        api_key: config.apiKey || undefined,
        secret_key: config.secretKey || undefined
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errType: ClipErrorType = 
        data.error === 'NETLIFY_REDEPLOY_NEEDED' ? 'NETLIFY_REDEPLOY_NEEDED' :
        data.error === 'CLIP_AUTH_ERROR' ? 'CLIP_AUTH_ERROR' :
        data.error === 'DEVICE_NOT_FOUND' ? 'DEVICE_NOT_FOUND' :
        data.error === 'TERMINAL_OFFLINE' ? 'TERMINAL_OFFLINE' :
        data.error === 'TERMINAL_BUSY' ? 'TERMINAL_BUSY' :
        data.error === 'TERMINAL_TIMEOUT' ? 'TERMINAL_TIMEOUT' :
        'UNKNOWN';

      return {
        success: false,
        errorType: errType,
        httpStatus: response.status,
        message: data.message || `Error de conexión con la terminal Clip (${response.status})`,
        details: data.details || data
      };
    }

    return {
      success: true,
      pinpadRequestId: data.pinpad_request_id || data.id,
      httpStatus: response.status,
      details: data
    };

  } catch (err: any) {
    console.warn('Fallo de red al conectar con terminal Clip:', err);
    return {
      success: false,
      errorType: 'TERMINAL_TIMEOUT',
      message: 'No se pudo contactar la terminal Clip. Revisa que esté encendida y conectada a tu Wi-Fi.'
    };
  }
}

/**
 * Consulta periódica (Polling) del estado del cobro en la terminal Clip (Sin simulación)
 */
export async function pollClipPaymentStatus(
  pinpadRequestId: string,
  onStatusUpdate: (statusText: string) => void,
  signal?: AbortSignal,
  maxAttempts: number = 36 // 36 intentos * 2.5s = ~90 segundos
): Promise<ClipPaymentResult> {
  const config = getStoredClipConfig();
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      return {
        success: false,
        errorType: 'CANCELLED',
        message: 'Operación cancelada en caja.'
      };
    }

    attempts++;
    onStatusUpdate(`Esperando tarjeta o NIP en tu terminal Clip... (${attempts}/${maxAttempts})`);

    try {
      const response = await fetch('/.netlify/functions/clip-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check_status',
          pinpad_request_id: pinpadRequestId,
          api_key: config.apiKey || undefined,
          secret_key: config.secretKey || undefined
        }),
        signal
      });

      if (response.ok) {
        const data = await response.json();
        const rawStatus = (data.status || '').toUpperCase();

        if (rawStatus === 'APPROVED' || rawStatus === 'COMPLETED' || rawStatus === 'PAID') {
          return {
            success: true,
            status: 'APPROVED',
            authCode: data.auth_code || data.authCode || data.authorization_code || 'APROBADO',
            last4: data.last_4 || data.last4 || data.card?.last4 || '••••',
            reference: data.reference || pinpadRequestId
          };
        }

        if (rawStatus === 'DECLINED' || rawStatus === 'REJECTED') {
          return {
            success: false,
            status: 'DECLINED',
            message: data.message || 'Tarjeta declinada por el banco emisor.'
          };
        }

        if (rawStatus === 'CANCELLED') {
          return {
            success: false,
            status: 'CANCELLED',
            message: 'El cobro fue cancelado en la pantalla de la terminal Clip.'
          };
        }
      }
    } catch (err: any) {
      if (signal?.aborted) {
        return { success: false, errorType: 'CANCELLED', message: 'Operación cancelada.' };
      }
      console.warn('Sondeo Clip en curso:', err);
    }

    // Pausa de 2.5 segundos entre revisiones
    await new Promise(resolve => setTimeout(resolve, 2500));
  }

  return {
    success: false,
    status: 'TIMEOUT',
    errorType: 'TERMINAL_TIMEOUT',
    message: 'Tiempo de espera agotado en la terminal. El cliente no completó el pago a tiempo.'
  };
}

/**
 * Diagnosticar conexión real con Clip y estado del servidor
 */
export async function diagnoseClipConnection(serialNumber?: string): Promise<{
  success: boolean;
  status: string;
  message?: string;
  diagnosis?: any;
  clip_http_status?: number;
  clip_response?: any;
  is_serial_in_account?: boolean;
  devices_found?: any[];
  advice?: string;
}> {
  try {
    const config = getStoredClipConfig();
    const serial = serialNumber || config.serialNumber || DEFAULT_CLIP_SERIAL;

    const response = await fetch('/.netlify/functions/clip-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'diagnose',
        serial_number_pos: serial,
        api_key: config.apiKey || undefined,
        secret_key: config.secretKey || undefined
      })
    });

    const data = await response.json().catch(() => ({}));
    return {
      success: response.ok,
      status: data.status || `HTTP_${response.status}`,
      message: data.message,
      diagnosis: data.diagnosis,
      clip_http_status: data.clip_http_status,
      clip_response: data.clip_response,
      is_serial_in_account: data.is_serial_in_account,
      devices_found: data.devices_found,
      advice: data.advice
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'FETCH_ERROR',
      message: err.message || 'No se pudo contactar el servicio de Clip.'
    };
  }
}
