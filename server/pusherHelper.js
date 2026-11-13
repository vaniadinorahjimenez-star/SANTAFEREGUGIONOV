import Pusher from 'pusher';

export const PUSHER_CHANNEL = 'santafe-pos-sync';
export const PUSHER_EVENT_CHANNEL = 'my-channel';

const DEFAULT_PUSHER_KEY = 'a71694905f8b6059ad83';
const DEFAULT_PUSHER_CLUSTER = 'mt1';

let pusherInstance = null;
let lastConfigKey = '';

function readEnvConfig() {
  const appId = (process.env.PUSHER_APP_ID || '').trim();
  const key = (process.env.PUSHER_KEY || process.env.VITE_PUSHER_KEY || DEFAULT_PUSHER_KEY).trim();
  const secret = (process.env.PUSHER_SECRET || '').trim();
  const cluster = (process.env.PUSHER_CLUSTER || process.env.VITE_PUSHER_CLUSTER || DEFAULT_PUSHER_CLUSTER).trim();
  return { appId, key, secret, cluster };
}

export function getPusherInstance() {
  const { appId, key, secret, cluster } = readEnvConfig();
  if (!appId || !key || !secret || !cluster) {
    return null;
  }
  const configSignature = `${appId}:${key}:${secret}:${cluster}`;
  if (!pusherInstance || configSignature !== lastConfigKey) {
    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true
    });
    lastConfigKey = configSignature;
  }
  return pusherInstance;
}

export function getPusherPublicConfig() {
  const { appId, key, secret, cluster } = readEnvConfig();
  const configured = Boolean(key && cluster);
  const serverTriggerConfigured = Boolean(appId && key && secret && cluster);
  return {
    configured,
    serverTriggerConfigured,
    key: key || null,
    cluster: cluster || null,
    channel: PUSHER_CHANNEL,
    extraChannels: [PUSHER_EVENT_CHANNEL]
  };
}

/**
 * Emite actualizaciones en tiempo real por Pusher respetando el límite de 10KB por evento.
 * Si el payload delta excede ~9KB, envía eventos por entidad o una señal `sync-refresh`
 * para que los clientes consulten el estado combinado desde `/api/sync`.
 */
export async function triggerPusherSync(deltaPayload) {
  const pusher = getPusherInstance();
  if (!pusher) return { sent: false, reason: 'not_configured' };

  try {
    const baseMeta = {
      clientId: deltaPayload?.clientId || 'server',
      timestamp: deltaPayload?.timestamp || Date.now()
    };

    const fullPayload = { ...baseMeta, ...deltaPayload };
    const serialized = JSON.stringify(fullPayload);

    if (Buffer.byteLength(serialized, 'utf8') <= 9200) {
      await pusher.trigger(PUSHER_CHANNEL, 'delta-update', fullPayload);
      return { sent: true, mode: 'delta' };
    }

    // Si es grande, intentar enviar entidades ligeras o chunked, y/o emitir sync-refresh
    const entities = [];
    const entityKeys = [
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
    ];

    for (const k of entityKeys) {
      if (deltaPayload && deltaPayload[k] !== undefined) {
        entities.push(k);
      }
    }

    // Enviar señal compacta sync-refresh para que todos los dispositivos descarguen de /api/sync
    await pusher.trigger(PUSHER_CHANNEL, 'sync-refresh', {
      ...baseMeta,
      entities
    });
    return { sent: true, mode: 'refresh', entities };
  } catch (err) {
    console.warn('Error enviando evento Pusher:', err?.message || err);
    return { sent: false, reason: err?.message || 'trigger_failed' };
  }
}
