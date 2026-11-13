import Pusher, { Channel } from 'pusher-js';

export type PusherConnectionState = 'unconfigured' | 'connecting' | 'connected' | 'disconnected';

export interface PusherStatusInfo {
  configured: boolean;
  serverTriggerConfigured?: boolean;
  state: PusherConnectionState;
  channel: string;
  cluster?: string | null;
  lastEventAt?: number;
}

export interface PusherDeltaPayload {
  clientId?: string;
  timestamp?: number;
  tickets?: any[];
  orders?: any[];
  shiftCuts?: any[];
  outflows?: any[];
  customers?: any[];
  operationalExpenses?: any[];
  supplierBills?: any[];
  supplierBankProfiles?: any[];
  vipCustomers?: any[];
  vipOrders?: any[];
  dailyDeliveries?: Array<{
    date: string;
    shift: 'madrugada' | 'manana' | 'tarde';
    quantities: Record<string, Record<string, number>>;
  }>;
  deletedIds?: {
    tickets?: string[];
    orders?: string[];
    operationalExpenses?: string[];
    supplierBills?: string[];
    vipCustomers?: string[];
    vipOrders?: string[];
  };
}

export interface PusherCustomEventPayload {
  channel: string;
  event: string;
  data: any;
  timestamp: number;
}

const DEFAULT_PUSHER_KEY = 'a71694905f8b6059ad83';
const DEFAULT_PUSHER_CLUSTER = 'mt1';
const DEFAULT_SYNC_CHANNEL = 'santafe-pos-sync';
const CUSTOM_EVENT_CHANNEL = 'my-channel';
const CUSTOM_EVENT_NAME = 'my-event';

const ENTITY_KEYS = [
  'tickets',
  'orders',
  'shiftCuts',
  'outflows',
  'customers',
  'operationalExpenses',
  'supplierBills',
  'supplierBankProfiles',
  'vipCustomers',
  'vipOrders',
  'dailyDeliveries',
  'deletedIds'
] as const;

// Identificador único por pestaña para evitar auto-eco o bucles infinitos de sincronización
const TAB_CLIENT_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export function getSyncClientId(): string {
  return TAB_CLIENT_ID;
}

let pusherClient: Pusher | null = null;
let syncChannel: Channel | null = null;
let customChannel: Channel | null = null;
let initialized = false;

let currentStatus: PusherStatusInfo = {
  configured: true,
  serverTriggerConfigured: false,
  state: 'connecting',
  channel: DEFAULT_SYNC_CHANNEL,
  cluster: DEFAULT_PUSHER_CLUSTER
};

type StatusListener = (status: PusherStatusInfo) => void;
type DeltaListener = (payload: PusherDeltaPayload) => void;
type RefreshListener = (info: { clientId?: string; timestamp?: number; entities?: string[] }) => void;
type CustomEventListener = (payload: PusherCustomEventPayload) => void;

const statusListeners = new Set<StatusListener>();
const deltaListeners = new Set<DeltaListener>();
const refreshListeners = new Set<RefreshListener>();
const customEventListeners = new Set<CustomEventListener>();

function emitStatus(partial: Partial<PusherStatusInfo>) {
  currentStatus = { ...currentStatus, ...partial };
  statusListeners.forEach((cb) => {
    try {
      cb(currentStatus);
    } catch {}
  });
}

export function getPusherStatus(): PusherStatusInfo {
  return currentStatus;
}

export function onPusherStatusChange(cb: StatusListener): () => void {
  cb(currentStatus);
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}

export function onPusherDelta(cb: DeltaListener): () => void {
  deltaListeners.add(cb);
  return () => {
    deltaListeners.delete(cb);
  };
}

export function onPusherRefresh(cb: RefreshListener): () => void {
  refreshListeners.add(cb);
  return () => {
    refreshListeners.delete(cb);
  };
}

export function onPusherCustomEvent(cb: CustomEventListener): () => void {
  customEventListeners.add(cb);
  return () => {
    customEventListeners.delete(cb);
  };
}

async function resolvePusherConfig(): Promise<{
  configured: boolean;
  serverTriggerConfigured: boolean;
  key: string;
  cluster: string;
  channel: string;
}> {
  const viteEnv = (import.meta as any)?.env || {};
  const fallbackKey = (viteEnv.VITE_PUSHER_KEY || DEFAULT_PUSHER_KEY).trim();
  const fallbackCluster = (viteEnv.VITE_PUSHER_CLUSTER || DEFAULT_PUSHER_CLUSTER).trim();

  try {
    const res = await fetch('/api/pusher/config', { method: 'GET' });
    if (res.ok) {
      const json = await res.json();
      if (json && json.key) {
        return {
          configured: Boolean(json.configured ?? true),
          serverTriggerConfigured: Boolean(json.serverTriggerConfigured),
          key: String(json.key).trim() || fallbackKey,
          cluster: String(json.cluster || fallbackCluster).trim(),
          channel: json.channel || DEFAULT_SYNC_CHANNEL
        };
      }
    }
  } catch {
    // Fallback to Vite build-time env vars or provided Pusher credentials
  }

  return {
    configured: Boolean(fallbackKey && fallbackCluster),
    serverTriggerConfigured: false,
    key: fallbackKey,
    cluster: fallbackCluster,
    channel: DEFAULT_SYNC_CHANNEL
  };
}

function parseIncomingData(rawData: any): any {
  if (typeof rawData === 'string') {
    try {
      return JSON.parse(rawData);
    } catch {
      return { message: rawData };
    }
  }
  return rawData;
}

function hasSyncEntities(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  return ENTITY_KEYS.some((key) => obj[key] !== undefined);
}

/**
 * Inicializa la conexión WebSocket con Pusher como complemento en tiempo real de Firebase.
 * Escucha tanto el canal principal de sincronización ('santafe-pos-sync') como 'my-channel' ('my-event').
 */
export async function initPusherClient(): Promise<void> {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const cfg = await resolvePusherConfig();
  if (!cfg.configured || !cfg.key || !cfg.cluster) {
    emitStatus({
      configured: false,
      serverTriggerConfigured: false,
      state: 'unconfigured',
      channel: cfg.channel,
      cluster: cfg.cluster
    });
    return;
  }

  try {
    emitStatus({
      configured: true,
      serverTriggerConfigured: cfg.serverTriggerConfigured,
      state: 'connecting',
      channel: cfg.channel,
      cluster: cfg.cluster
    });

    // Habilitar logs de Pusher únicamente en desarrollo (nunca en producción)
    Pusher.logToConsole = Boolean((import.meta as any)?.env?.DEV);

    pusherClient = new Pusher(cfg.key, {
      cluster: cfg.cluster,
      forceTLS: true
    });

    pusherClient.connection.bind('connected', () => {
      emitStatus({ state: 'connected' });
    });

    pusherClient.connection.bind('connecting', () => {
      emitStatus({ state: 'connecting' });
    });

    pusherClient.connection.bind('unavailable', () => {
      emitStatus({ state: 'disconnected' });
    });

    pusherClient.connection.bind('disconnected', () => {
      emitStatus({ state: 'disconnected' });
    });

    pusherClient.connection.bind('error', () => {
      emitStatus({ state: 'disconnected' });
    });

    // 1. Canal estructurado del POS (santafe-pos-sync)
    syncChannel = pusherClient.subscribe(cfg.channel);

    syncChannel.bind('pusher:subscription_succeeded', () => {
      emitStatus({ state: 'connected' });
    });

    syncChannel.bind('delta-update', (payload: PusherDeltaPayload) => {
      if (!payload || payload.clientId === TAB_CLIENT_ID) return;
      emitStatus({ lastEventAt: Date.now() });
      deltaListeners.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.warn('Error procesando delta Pusher:', err);
        }
      });
    });

    syncChannel.bind('sync-refresh', (info: { clientId?: string; timestamp?: number; entities?: string[] }) => {
      if (!info || info.clientId === TAB_CLIENT_ID) return;
      emitStatus({ lastEventAt: Date.now() });
      refreshListeners.forEach((cb) => {
        try {
          cb(info);
        } catch (err) {
          console.warn('Error procesando sync-refresh Pusher:', err);
        }
      });
    });

    // 2. Canal configurado por el usuario ('my-channel' -> 'my-event')
    customChannel = pusherClient.subscribe(CUSTOM_EVENT_CHANNEL);

    customChannel.bind('pusher:subscription_succeeded', () => {
      emitStatus({ state: 'connected' });
    });

    customChannel.bind(CUSTOM_EVENT_NAME, (rawData: any) => {
      const parsed = parseIncomingData(rawData);
      if (parsed && typeof parsed === 'object' && parsed.clientId === TAB_CLIENT_ID) return;

      const now = Date.now();
      emitStatus({ lastEventAt: now });

      if (hasSyncEntities(parsed)) {
        deltaListeners.forEach((cb) => {
          try {
            cb(parsed as PusherDeltaPayload);
          } catch (err) {
            console.warn('Error procesando entidad en my-event:', err);
          }
        });
      }

      refreshListeners.forEach((cb) => {
        try {
          cb({ clientId: parsed?.clientId, timestamp: now });
        } catch (err) {
          console.warn('Error refrescando tras my-event:', err);
        }
      });

      customEventListeners.forEach((cb) => {
        try {
          cb({
            channel: CUSTOM_EVENT_CHANNEL,
            event: CUSTOM_EVENT_NAME,
            data: parsed,
            timestamp: now
          });
        } catch (err) {
          console.warn('Error notificando my-event:', err);
        }
      });
    });
  } catch (err) {
    console.warn('No se pudo inicializar Pusher:', err);
    emitStatus({ state: 'disconnected' });
  }
}

/**
 * Envía un evento delta ligero a través del proxy del servidor hacia Pusher
 * (sin exponer secretos en el navegador).
 */
export async function broadcastPusherDelta(payload: Omit<PusherDeltaPayload, 'clientId' | 'timestamp'>): Promise<void> {
  if (!currentStatus.serverTriggerConfigured) return;
  try {
    await fetch('/api/pusher/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        clientId: TAB_CLIENT_ID,
        timestamp: Date.now()
      })
    });
  } catch {
    // Silencioso: Firebase + Express SSE respaldan la entrega
  }
}
