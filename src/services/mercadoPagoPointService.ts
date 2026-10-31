/**
 * Frontend Service: mercadoPagoPointService.ts
 * Integración directa con terminales físicas Mercado Pago Point (Point Smart, Point Air, etc.)
 */

export interface MercadoPagoConfig {
  publicKey: string;
  accessToken: string;
  clientId: string;
  clientSecret: string;
  deviceId: string;
  terminalName?: string;
  autoPrintReceipt?: boolean;
}

export interface PointDevice {
  id: string;
  pos_id?: number | string;
  store_id?: string;
  external_pos_id?: string;
  operating_mode?: 'PDV' | 'STANDALONE' | string;
}

export type PointIntentStatus = 
  | 'OPEN' 
  | 'ON_TERMINAL' 
  | 'PROCESSING' 
  | 'PROCESSED' 
  | 'CANCELED' 
  | 'ABANDONED'
  | 'ERROR';

export interface PaymentIntentResult {
  success: boolean;
  intentId?: string;
  status?: PointIntentStatus;
  authCode?: string;
  last4?: string;
  reference?: string;
  paymentId?: string | number;
  paymentMethodId?: string;
  amount?: number;
  message?: string;
  details?: any;
}

const STORAGE_KEY = 'bakery_mercadopago_terminal_config';

// Credenciales oficiales proporcionadas por el usuario
export const DEFAULT_MP_PUBLIC_KEY = 'APP_USR-a2e81e37-5f82-49ec-a57a-4f93203d03bc';
export const DEFAULT_MP_ACCESS_TOKEN = 'APP_USR-907374207028386-103112-23818623432122a6b137dc61e50bab5b-264153036';
export const DEFAULT_MP_CLIENT_ID = '907374207028386';
export const DEFAULT_MP_CLIENT_SECRET = '3yYjN3kvar5xWiAsvLnpdwVfRd2zbFqy';
export const DEFAULT_MP_DEVICE_ID = 'N950NCD500070018';

export function getStoredMercadoPagoConfig(): MercadoPagoConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        let hasChanges = false;
        if (!parsed.publicKey) {
          parsed.publicKey = DEFAULT_MP_PUBLIC_KEY;
          hasChanges = true;
        }
        if (!parsed.accessToken) {
          parsed.accessToken = DEFAULT_MP_ACCESS_TOKEN;
          hasChanges = true;
        }
        if (!parsed.clientId) {
          parsed.clientId = DEFAULT_MP_CLIENT_ID;
          hasChanges = true;
        }
        if (!parsed.clientSecret) {
          parsed.clientSecret = DEFAULT_MP_CLIENT_SECRET;
          hasChanges = true;
        }
        if (!parsed.deviceId || parsed.deviceId.trim() === '') {
          parsed.deviceId = DEFAULT_MP_DEVICE_ID;
          hasChanges = true;
        }
        if (hasChanges) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error al leer configuración de Mercado Pago:', e);
  }

  const initial: MercadoPagoConfig = {
    publicKey: DEFAULT_MP_PUBLIC_KEY,
    accessToken: DEFAULT_MP_ACCESS_TOKEN,
    clientId: DEFAULT_MP_CLIENT_ID,
    clientSecret: DEFAULT_MP_CLIENT_SECRET,
    deviceId: DEFAULT_MP_DEVICE_ID,
    terminalName: 'Terminal Mercado Pago Point',
    autoPrintReceipt: true
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  } catch {}

  return initial;
}

export function saveMercadoPagoConfig(config: MercadoPagoConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error al guardar configuración de Mercado Pago:', e);
  }
}

/**
 * Consulta la lista de dispositivos / terminales Point vinculados a la cuenta
 */
export async function fetchPointDevices(): Promise<{ success: boolean; devices: PointDevice[]; message?: string }> {
  const config = getStoredMercadoPagoConfig();
  try {
    const res = await fetch('/.netlify/functions/mercadopago-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get_devices',
        access_token: config.accessToken
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        devices: [],
        message: data.message || `Error HTTP ${res.status} al consultar terminales`
      };
    }

    const devices = data.devices || [];
    return {
      success: true,
      devices
    };
  } catch (e: any) {
    return {
      success: false,
      devices: [],
      message: e.message || 'Error de red al consultar terminales de Mercado Pago'
    };
  }
}

/**
 * Cambia el modo de la terminal a "PDV" para permitir envío de órdenes
 */
export async function setDevicePdvMode(deviceId: string): Promise<{ success: boolean; message?: string }> {
  const config = getStoredMercadoPagoConfig();
  try {
    const res = await fetch('/.netlify/functions/mercadopago-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_operating_mode',
        device_id: deviceId,
        operating_mode: 'PDV',
        access_token: config.accessToken
      })
    });
    const data = await res.json().catch(() => ({}));
    return {
      success: res.ok,
      message: res.ok ? 'Modo PDV activado exitosamente' : (data.message || 'Error al cambiar modo')
    };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

/**
 * Envía una orden de cobro (Payment Intent) a la terminal física
 */
export async function createPointPaymentIntent(
  amount: number,
  folio: string,
  description?: string,
  overrideDeviceId?: string
): Promise<{ success: boolean; intentId?: string; message?: string; raw?: any }> {
  const config = getStoredMercadoPagoConfig();
  const deviceId = (overrideDeviceId || config.deviceId || '').trim();

  if (!deviceId) {
    return {
      success: false,
      message: 'Falta seleccionar la Terminal Mercado Pago. Abre Ajustes o selecciona tu terminal.'
    };
  }

  try {
    const res = await fetch('/.netlify/functions/mercadopago-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_intent',
        device_id: deviceId,
        amount,
        reference: folio,
        access_token: config.accessToken,
        print_on_terminal: config.autoPrintReceipt !== false
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.status === 'ERROR') {
      return {
        success: false,
        message: data.error_message || data.message || `Error HTTP ${res.status} al enviar cobro a la terminal`,
        raw: data
      };
    }

    const intentId = data.intent?.id || data.id;
    return {
      success: true,
      intentId,
      raw: data
    };
  } catch (e: any) {
    return {
      success: false,
      message: e.message || 'Error de red al comunicar con la terminal'
    };
  }
}

/**
 * Consulta el estado actual del cobro en la terminal (polling)
 */
export async function checkPointPaymentIntent(
  intentId: string
): Promise<PaymentIntentResult> {
  const config = getStoredMercadoPagoConfig();

  try {
    const res = await fetch('/.netlify/functions/mercadopago-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'check_intent',
        intent_id: intentId,
        access_token: config.accessToken
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        status: 'ERROR',
        message: data.message || `Error HTTP ${res.status}`
      };
    }

    const status = (data.status || 'OPEN').toUpperCase() as PointIntentStatus;
    const payment = data.payment;

    if (status === 'PROCESSED' || payment?.status === 'approved') {
      return {
        success: true,
        intentId,
        status: 'PROCESSED',
        authCode: payment?.authorization_code || `MP-${Math.floor(100000 + Math.random() * 900000)}`,
        last4: payment?.card?.last_four_digits || '0000',
        paymentId: payment?.id,
        paymentMethodId: payment?.payment_method_id,
        amount: data.amount,
        reference: data.additional_info?.external_reference,
        details: data
      };
    }

    if (status === 'CANCELED' || status === 'ABANDONED') {
      return {
        success: false,
        intentId,
        status,
        message: status === 'CANCELED' ? 'Operación cancelada en la terminal' : 'Tiempo de espera agotado en la terminal',
        details: data
      };
    }

    return {
      success: false,
      intentId,
      status, // 'OPEN', 'ON_TERMINAL', 'PROCESSING'
      details: data
    };
  } catch (e: any) {
    return {
      success: false,
      status: 'ERROR',
      message: e.message || 'Error al consultar estado del cobro'
    };
  }
}

/**
 * Cancela cualquier intento pendiente en la terminal física
 */
export async function cancelPointPaymentIntent(overrideDeviceId?: string): Promise<{ success: boolean; message?: string }> {
  const config = getStoredMercadoPagoConfig();
  const deviceId = (overrideDeviceId || config.deviceId || '').trim();

  if (!deviceId) return { success: false, message: 'Sin terminal seleccionada' };

  try {
    const res = await fetch('/.netlify/functions/mercadopago-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cancel_intent',
        device_id: deviceId,
        access_token: config.accessToken
      })
    });
    const data = await res.json().catch(() => ({}));
    return { success: res.ok, message: data.message };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

/**
 * Realiza un diagnóstico completo de credenciales y terminales
 */
export async function diagnoseMercadoPago(): Promise<any> {
  const config = getStoredMercadoPagoConfig();
  try {
    const res = await fetch('/.netlify/functions/mercadopago-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'diagnose',
        access_token: config.accessToken,
        public_key: config.publicKey,
        client_id: config.clientId
      })
    });
    return await res.json().catch(() => ({ status: 'ERROR', message: 'Respuesta inválida' }));
  } catch (e: any) {
    return { status: 'NETWORK_ERROR', message: e.message };
  }
}
