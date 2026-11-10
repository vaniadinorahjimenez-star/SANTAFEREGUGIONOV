/**
 * Frontend Service: mercadoPagoPointService.ts
 * Integración directa con terminales físicas Mercado Pago Point (Point Smart, Point Air, etc.)
 */

import { BranchId } from '../types';

export interface MercadoPagoConfig {
  publicKey: string;
  accessToken: string;
  clientId: string;
  clientSecret: string;
  deviceId: string;
  terminalName?: string;
  autoPrintReceipt?: boolean;
  branch?: BranchId;
  storeId?: string;
  posId?: string;
  serial?: string;
  model?: string;
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

const STORAGE_KEY_PREFIX = 'bakery_mercadopago_terminal_config';

// ----------------------------------------------------------------------
// 1. CREDENCIALES OFICIALES SUCURSAL EL REFUGIO
// ----------------------------------------------------------------------
export const REFUGIO_MP_PUBLIC_KEY = 'APP_USR-a2e81e37-5f82-49ec-a57a-4f93203d03bc';
export const REFUGIO_MP_ACCESS_TOKEN = 'APP_USR-907374207028386-103112-23818623432122a6b137dc61e50bab5b-264153036';
export const REFUGIO_MP_CLIENT_ID = '907374207028386';
export const REFUGIO_MP_CLIENT_SECRET = '3yYjN3kvar5xWiAsvLnpdwVfRd2zbFqy';
export const REFUGIO_MP_DEVICE_ID = 'N950NCD500070018';

// Aliases para compatibilidad hacia atrás
export const DEFAULT_MP_PUBLIC_KEY = REFUGIO_MP_PUBLIC_KEY;
export const DEFAULT_MP_ACCESS_TOKEN = REFUGIO_MP_ACCESS_TOKEN;
export const DEFAULT_MP_CLIENT_ID = REFUGIO_MP_CLIENT_ID;
export const DEFAULT_MP_CLIENT_SECRET = REFUGIO_MP_CLIENT_SECRET;
export const DEFAULT_MP_DEVICE_ID = REFUGIO_MP_DEVICE_ID;

// ----------------------------------------------------------------------
// 2. CREDENCIALES OFICIALES SUCURSAL ZAKIA (Terminal Newland N950 Point Smart)
// ----------------------------------------------------------------------
export const ZAKIA_MP_SERIAL = 'N950NCD300176970';
export const ZAKIA_MP_API_DEVICE_ID = 'NEWLAND_N950__N950NCD300176970';
export const ZAKIA_MP_MODEL = 'Newland N950 (Point Smart)';
export const ZAKIA_MP_POS_ID = '91690657';
export const ZAKIA_MP_STORE_ID = '58645193';
export const ZAKIA_MP_PUBLIC_KEY = 'APP_USR-0bb34d43-e869-4356-8b53-b9fa5914dcc0';
export const ZAKIA_MP_ACCESS_TOKEN = 'APP_USR-8645609747157924-103116-cb7cd07e36a8b7034436b63c7e35c520-264153036';
export const ZAKIA_MP_CLIENT_ID = '8645609747157924';
export const ZAKIA_MP_CLIENT_SECRET = 'MWnxdSEq5KY9TEycGXCRTAqkPUThBj6k';

function getStorageKey(branch: BranchId = 'refugio'): string {
  return `${STORAGE_KEY_PREFIX}_${branch}`;
}

export function getStoredMercadoPagoConfig(branch: BranchId = 'refugio'): MercadoPagoConfig {
  const isZakia = branch === 'zakia';
  const storageKey = getStorageKey(branch);

  const defaultPublicKey = isZakia ? ZAKIA_MP_PUBLIC_KEY : REFUGIO_MP_PUBLIC_KEY;
  const defaultAccessToken = isZakia ? ZAKIA_MP_ACCESS_TOKEN : REFUGIO_MP_ACCESS_TOKEN;
  const defaultClientId = isZakia ? ZAKIA_MP_CLIENT_ID : REFUGIO_MP_CLIENT_ID;
  const defaultClientSecret = isZakia ? ZAKIA_MP_CLIENT_SECRET : REFUGIO_MP_CLIENT_SECRET;
  const defaultDeviceId = isZakia ? ZAKIA_MP_API_DEVICE_ID : REFUGIO_MP_DEVICE_ID;
  const defaultTerminalName = isZakia ? 'Terminal Point Smart Zakia' : 'Terminal Point El Refugio';

  try {
    let raw = localStorage.getItem(storageKey);
    // Fallback para refugio con la clave antigua
    if (!raw && !isZakia) {
      raw = localStorage.getItem(STORAGE_KEY_PREFIX);
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        let hasChanges = false;
        if (!parsed.publicKey) {
          parsed.publicKey = defaultPublicKey;
          hasChanges = true;
        }
        if (!parsed.accessToken) {
          parsed.accessToken = defaultAccessToken;
          hasChanges = true;
        }
        if (!parsed.clientId) {
          parsed.clientId = defaultClientId;
          hasChanges = true;
        }
        if (!parsed.clientSecret) {
          parsed.clientSecret = defaultClientSecret;
          hasChanges = true;
        }
        if (!parsed.deviceId || parsed.deviceId.trim() === '') {
          parsed.deviceId = defaultDeviceId;
          hasChanges = true;
        }
        parsed.branch = branch;
        if (isZakia) {
          parsed.serial = ZAKIA_MP_SERIAL;
          parsed.posId = ZAKIA_MP_POS_ID;
          parsed.storeId = ZAKIA_MP_STORE_ID;
          parsed.model = ZAKIA_MP_MODEL;
        }
        if (hasChanges) {
          localStorage.setItem(storageKey, JSON.stringify(parsed));
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error(`Error al leer configuración de Mercado Pago (${branch}):`, e);
  }

  const initial: MercadoPagoConfig = {
    publicKey: defaultPublicKey,
    accessToken: defaultAccessToken,
    clientId: defaultClientId,
    clientSecret: defaultClientSecret,
    deviceId: defaultDeviceId,
    terminalName: defaultTerminalName,
    autoPrintReceipt: true,
    branch,
    ...(isZakia ? {
      serial: ZAKIA_MP_SERIAL,
      posId: ZAKIA_MP_POS_ID,
      storeId: ZAKIA_MP_STORE_ID,
      model: ZAKIA_MP_MODEL
    } : {})
  };

  try {
    localStorage.setItem(storageKey, JSON.stringify(initial));
  } catch {}

  return initial;
}

export function saveMercadoPagoConfig(config: MercadoPagoConfig, branch: BranchId = 'refugio'): void {
  try {
    const storageKey = getStorageKey(branch);
    localStorage.setItem(storageKey, JSON.stringify({ ...config, branch }));
  } catch (e) {
    console.error(`Error al guardar configuración de Mercado Pago (${branch}):`, e);
  }
}

/**
 * Consulta la lista de dispositivos / terminales Point vinculados a la cuenta
 */
export async function fetchPointDevices(branch: BranchId = 'refugio'): Promise<{ success: boolean; devices: PointDevice[]; message?: string }> {
  const config = getStoredMercadoPagoConfig(branch);
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
export async function setDevicePdvMode(deviceId: string, branch: BranchId = 'refugio'): Promise<{ success: boolean; message?: string }> {
  const config = getStoredMercadoPagoConfig(branch);
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
  overrideDeviceId?: string,
  branch: BranchId = 'refugio'
): Promise<{ success: boolean; intentId?: string; message?: string; raw?: any }> {
  const config = getStoredMercadoPagoConfig(branch);
  const deviceId = (overrideDeviceId || config.deviceId || '').trim();

  if (!deviceId) {
    return {
      success: false,
      message: `Falta seleccionar la Terminal Mercado Pago para ${branch === 'zakia' ? 'Zakia' : 'El Refugio'}.`
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
        print_on_terminal: config.autoPrintReceipt === true
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
 * Consulta el estado actual del cobro en la terminal (polling con doble verificación en tiempo real)
 */
export async function checkPointPaymentIntent(
  intentId: string,
  reference?: string,
  overrideDeviceId?: string,
  branch: BranchId = 'refugio'
): Promise<PaymentIntentResult> {
  const config = getStoredMercadoPagoConfig(branch);
  const deviceId = (overrideDeviceId || config.deviceId || '').trim();

  try {
    const res = await fetch('/.netlify/functions/mercadopago-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'check_intent',
        intent_id: intentId,
        reference: reference,
        device_id: deviceId,
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

    const rawState = (
      data.state || 
      data.status || 
      data.intent?.state || 
      data.intent?.status || 
      ''
    ).toUpperCase();

    const payment = 
      data.payment || 
      data.intent?.payment || 
      (data.payment_id ? { id: data.payment_id, status: 'approved' } : null);

    // 1. VERIFICACIÓN DE RECHAZO BANCARIO O CANCELACIÓN (PRIORIDAD ABSOLUTA)
    const isRejected = 
      payment?.status === 'rejected' ||
      payment?.status === 'cancelled' ||
      payment?.status === 'refunded' ||
      payment?.status === 'charged_back' ||
      rawState === 'CANCELED' ||
      rawState === 'CANCELLED' ||
      rawState === 'CLOSED' ||
      rawState === 'ERROR' ||
      rawState === 'ABANDONED' ||
      rawState === 'REJECTED' ||
      Boolean(payment?.status_detail && String(payment.status_detail).startsWith('cc_rejected_'));

    if (isRejected) {
      let rejectMessage = 'Cobro no realizado en la terminal.';
      const detail = String(payment?.status_detail || data.error_message || '');

      if (detail.includes('insufficient_amount')) {
        rejectMessage = 'Fondos insuficientes en la tarjeta. No se cobró ni se emitió ticket.';
      } else if (detail.includes('bad_filled_security_code')) {
        rejectMessage = 'Código CVV incorrecto. No se cobró ni se emitió ticket.';
      } else if (detail.includes('card_disabled')) {
        rejectMessage = 'Tarjeta inactiva o bloqueada por el banco emisor.';
      } else if (detail.includes('call_for_authorize')) {
        rejectMessage = 'El banco requiere autorización por app bancaria o llamada.';
      } else if (detail.includes('cc_rejected')) {
        rejectMessage = 'Tarjeta declinada por el banco emisor. No se realizó el cobro.';
      } else if (rawState === 'CLOSED' || rawState === 'CANCELED') {
        rejectMessage = 'Operación cancelada o declinada en la terminal. No se realizó el cobro.';
      }

      return {
        success: false,
        intentId,
        status: 'CANCELED',
        message: rejectMessage,
        details: data
      };
    }

    // 2. APROBACIÓN ESTRICTA: Solo si el banco emisor aprobó y acreditó formalmente la transacción
    const isApproved = 
      (payment?.status === 'approved' || payment?.status_detail === 'accredited') ||
      ((rawState === 'FINISHED' || rawState === 'PROCESSED' || rawState === 'APPROVED') &&
        Boolean(payment?.id) &&
        payment?.status !== 'rejected');

    if (isApproved) {
      const authCode = 
        payment?.authorization_code || 
        payment?.card?.authorization_code || 
        (payment?.id ? `MP-${payment.id}` : `MP-${Math.floor(100000 + Math.random() * 900000)}`);

      const last4 = 
        payment?.card?.last_four_digits || 
        payment?.last_four_digits || 
        payment?.card?.last4 || 
        '0000';

      return {
        success: true,
        intentId,
        status: 'PROCESSED',
        authCode,
        last4,
        paymentId: payment?.id,
        paymentMethodId: payment?.payment_method_id,
        amount: data.amount,
        reference: data.additional_info?.external_reference || data.external_reference,
        details: data
      };
    }

    const activeStatus: PointIntentStatus = 
      rawState === 'PROCESSING' ? 'PROCESSING' :
      rawState === 'ON_TERMINAL' ? 'ON_TERMINAL' : 'OPEN';

    return {
      success: false,
      intentId,
      status: activeStatus, // 'OPEN', 'ON_TERMINAL', 'PROCESSING'
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
export async function cancelPointPaymentIntent(overrideDeviceId?: string, branch: BranchId = 'refugio'): Promise<{ success: boolean; message?: string }> {
  const config = getStoredMercadoPagoConfig(branch);
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
export async function diagnoseMercadoPago(branch: BranchId = 'refugio'): Promise<any> {
  const config = getStoredMercadoPagoConfig(branch);
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
