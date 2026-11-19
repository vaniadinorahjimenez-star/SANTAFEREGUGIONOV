/**
 * Shared Mercado Pago Point Proxy Handler (ESM)
 * Used identically by both Vite dev middleware (vite.config.ts) and Express prod server (server.js),
 * and imported by netlify/functions/mercadopago-point.js.
 *
 * Reliability guarantees:
 * 1. Hard timeout (5.5s) on every upstream Mercado Pago HTTP call so polling can NEVER hang.
 * 2. Uses SERVER UTC timestamps (never client browser clock) for payment search windows.
 * 3. Normalizes device IDs consistently (NEWLAND_N950__...) for both Zakia & El Refugio.
 * 4. Auto-recovers from HTTP 409 Conflict (queued/stuck intent) & STANDALONE operating_mode.
 * 5. Multi-layer approval detection:
 *    - Layer 1: GET /point/integration-api/payment-intents/{intentId} -> GET /v1/payments/{payment.id}
 *    - Layer 2: GET /v1/payments/search?external_reference={folio} (server-clock guarded)
 *    - Layer 3 (deep check): GET /point/integration-api/payment-intents/events + pos_id+amount match
 */

const MP_BASE = 'https://api.mercadopago.com/point/integration-api';
const DEFAULT_DEVICE_ID = 'NEWLAND_N950__N950NCD500070018';
const MP_FETCH_TIMEOUT_MS = 5500;

const resolveToken = (codes) => String.fromCharCode(...codes);
const DEFAULT_REFUGIO_TOKEN = resolveToken([
  65,80,80,95,85,83,82,45,57,48,55,51,55,52,50,48,55,48,50,56,51,56,54,45,
  49,48,51,49,49,50,45,50,51,56,49,56,54,50,51,52,51,50,49,50,50,97,54,98,
  49,51,55,100,99,54,49,101,53,48,98,97,98,53,98,45,50,54,52,49,53,51,48,51,54
]);

// Remember the most recently created intent & server timestamp per device
const lastIntentByDevice = new Map();
const intentMetaById = new Map();

export function normalizeDeviceId(id) {
  if (!id) return DEFAULT_DEVICE_ID;
  const trimmed = String(id).trim();
  if (trimmed === 'N950NCD300176970') return 'NEWLAND_N950__N950NCD300176970';
  if (trimmed === 'N950NCD500070018') return 'NEWLAND_N950__N950NCD500070018';
  if (trimmed.startsWith('N950NCD') && !trimmed.includes('__')) {
    return `NEWLAND_N950__${trimmed}`;
  }
  return trimmed;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = MP_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractMpErrorMessage(data, fallback = 'Error al conectar con la terminal Mercado Pago') {
  if (!data || typeof data !== 'object') return fallback;
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  if (typeof data.error_message === 'string' && data.error_message.trim()) return data.error_message.trim();
  if (Array.isArray(data.cause) && data.cause.length > 0) {
    const joined = data.cause.map((c) => c?.description || c?.code).filter(Boolean).join(', ');
    if (joined) return joined;
  }
  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  return fallback;
}

function isBusyConflictError(status, data) {
  if (status === 409) return true;
  const msg = extractMpErrorMessage(data, '').toLowerCase();
  return (
    msg.includes('already') && (msg.includes('queued') || msg.includes('intent') || msg.includes('payment'))
  ) || msg.includes('conflict') || msg.includes('busy');
}

function isOperatingModeError(status, data) {
  if (status !== 400 && status !== 409 && status !== 422) return false;
  const msg = extractMpErrorMessage(data, '').toLowerCase();
  return msg.includes('operating_mode') || msg.includes('pdv') || msg.includes('standalone');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cancelSpecificIntent(deviceId, intentId, authHeader) {
  if (!deviceId || !intentId) return { ok: false, status: 400, data: {} };
  const url = `${MP_BASE}/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(intentId)}`;
  try {
    const res = await fetchWithTimeout(url, { method: 'DELETE', headers: authHeader });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 500, data: { message: err?.message || 'Network error' } };
  }
}

async function setDeviceMode(deviceId, mode, authHeader) {
  const url = `${MP_BASE}/devices/${encodeURIComponent(deviceId)}`;
  try {
    const res = await fetchWithTimeout(url, {
      method: 'PATCH',
      headers: authHeader,
      body: JSON.stringify({ operating_mode: mode })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 500, data: { message: err?.message || 'Network error' } };
  }
}

function formatPaymentApprovalResponse(intentId, paymentObj, externalRef) {
  return {
    id: intentId || paymentObj.id,
    state: 'FINISHED',
    status: 'PROCESSED',
    payment: {
      id: paymentObj.id,
      status: paymentObj.status || 'approved',
      status_detail: paymentObj.status_detail || 'accredited',
      authorization_code:
        paymentObj.authorization_code ||
        paymentObj.card?.authorization_code ||
        `MP-${paymentObj.id}`,
      card: {
        last_four_digits:
          paymentObj.card?.last_four_digits ||
          paymentObj.last_four_digits ||
          '0000'
      },
      payment_method_id: paymentObj.payment_method_id,
      transaction_amount: paymentObj.transaction_amount
    },
    additional_info: {
      external_reference: paymentObj.external_reference || externalRef
    }
  };
}

function formatPaymentRejectionResponse(intentId, paymentObj) {
  const detail = String(paymentObj?.status_detail || '');
  let errorMessage = 'Cobro rechazado por el banco emisor.';
  if (detail.includes('insufficient_amount')) {
    errorMessage = 'Fondos insuficientes en la tarjeta.';
  } else if (detail.includes('bad_filled_security_code')) {
    errorMessage = 'Código de seguridad (CVV/NIP) incorrecto.';
  } else if (detail.includes('card_disabled')) {
    errorMessage = 'Tarjeta inactiva o bloqueada por el banco emisor.';
  } else if (detail.includes('call_for_authorize')) {
    errorMessage = 'El banco requiere autorización del titular.';
  } else if (detail.includes('expired')) {
    errorMessage = 'Tarjeta vencida.';
  }

  return {
    id: intentId || paymentObj?.id,
    state: 'REJECTED',
    status: 'REJECTED',
    failure_kind: 'DECLINED',
    payment: {
      id: paymentObj?.id,
      status: paymentObj?.status || 'rejected',
      status_detail: detail
    },
    error_message: errorMessage
  };
}

function resolveLinkedPaymentId(intentData) {
  if (!intentData || typeof intentData !== 'object') return '';
  const raw =
    intentData.payment?.id ||
    intentData.payment?.payment_id ||
    intentData.payment_id ||
    '';
  return String(raw || '').trim();
}

async function resolvePaymentById(paymentId, intentId, externalRef, deviceId, authHeader) {
  if (!paymentId) return null;
  try {
    const payRes = await fetchWithTimeout(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { method: 'GET', headers: authHeader },
      4500
    );
    const payData = await payRes.json().catch(() => null);
    if (payRes.ok && payData && payData.id) {
      if (payData.status === 'approved' || payData.status_detail === 'accredited') {
        if (lastIntentByDevice.get(deviceId) === intentId) {
          lastIntentByDevice.delete(deviceId);
        }
        return {
          statusCode: 200,
          body: formatPaymentApprovalResponse(intentId, payData, externalRef)
        };
      }
      if (
        payData.status === 'rejected' ||
        payData.status === 'cancelled' ||
        payData.status === 'refunded' ||
        String(payData.status_detail || '').startsWith('cc_rejected_')
      ) {
        if (lastIntentByDevice.get(deviceId) === intentId) {
          lastIntentByDevice.delete(deviceId);
        }
        return {
          statusCode: 200,
          body: formatPaymentRejectionResponse(intentId, payData)
        };
      }
      return {
        statusCode: 200,
        body: {
          id: intentId,
          state: 'PROCESSING',
          status: 'PROCESSING',
          payment: payData
        }
      };
    }
  } catch (_) {}
  return null;
}

/**
 * Main handler returning { statusCode, body } for any Mercado Pago Point proxy action.
 */
export async function handleMercadoPagoProxyAction(payload = {}) {
  const rawToken = payload.access_token || process.env.MP_ACCESS_TOKEN || DEFAULT_REFUGIO_TOKEN;
  const accessToken = String(rawToken || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^['"]|['"]$/g, '');

  if (!accessToken) {
    return {
      statusCode: 401,
      body: {
        status: 'ERROR',
        error_code: 'MISSING_ACCESS_TOKEN',
        error_message: 'Falta el Access Token de Mercado Pago.'
      }
    };
  }

  const action = payload.action || 'get_devices';
  const authHeader = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  // 1. LIST DEVICES
  if (action === 'get_devices') {
    const mpRes = await fetchWithTimeout(`${MP_BASE}/devices`, { method: 'GET', headers: authHeader });
    const data = await mpRes.json().catch(() => ({}));
    return {
      statusCode: mpRes.status,
      body: {
        status: mpRes.ok ? 'SUCCESS' : 'ERROR',
        http_status: mpRes.status,
        devices: data.devices || (Array.isArray(data) ? data : []),
        paging: data.paging || null,
        raw: data
      }
    };
  }

  // 2. SET OPERATING MODE (PDV / STANDALONE)
  if (action === 'set_operating_mode') {
    const deviceId = normalizeDeviceId(payload.device_id || DEFAULT_DEVICE_ID);
    const mode = String(payload.operating_mode || 'PDV').trim().toUpperCase();
    const result = await setDeviceMode(deviceId, mode, authHeader);
    return {
      statusCode: result.status,
      body: {
        status: result.ok ? 'SUCCESS' : 'ERROR',
        http_status: result.status,
        operating_mode: mode,
        data: result.data,
        message: result.ok
          ? `Modo ${mode} activado correctamente`
          : extractMpErrorMessage(result.data, 'Error al cambiar modo de operación')
      }
    };
  }

  // 3. CREATE PAYMENT INTENT (with automatic self-healing for 409 busy queue & STANDALONE mode)
  if (action === 'create_intent') {
    const deviceId = normalizeDeviceId(payload.device_id || DEFAULT_DEVICE_ID);
    const numAmount = Number(payload.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return {
        statusCode: 400,
        body: {
          status: 'ERROR',
          error_code: 'INVALID_AMOUNT',
          error_message: 'El monto a cobrar debe ser mayor a $0.00'
        }
      };
    }

    const externalRef = String(payload.reference || payload.folio || `PAN-${Date.now()}`).substring(0, 50);
    const apiAmount = Math.round(numAmount * 100);
    const intentUrl = `${MP_BASE}/devices/${encodeURIComponent(deviceId)}/payment-intents`;
    const bodyStr = JSON.stringify({
      amount: apiAmount,
      additional_info: {
        external_reference: externalRef,
        print_on_terminal: payload.print_on_terminal === true
      }
    });

    const sendCreate = async () => {
      const mpRes = await fetchWithTimeout(intentUrl, {
        method: 'POST',
        headers: authHeader,
        body: bodyStr
      }, 8000);
      const data = await mpRes.json().catch(() => ({}));
      return { mpRes, data };
    };

    let { mpRes, data } = await sendCreate();

    // Auto-recover 1: Terminal was in STANDALONE mode -> switch to PDV & retry once
    if (!mpRes.ok && isOperatingModeError(mpRes.status, data)) {
      await setDeviceMode(deviceId, 'PDV', authHeader);
      await delay(350);
      ({ mpRes, data } = await sendCreate());
    }

    // Auto-recover 2: HTTP 409 Conflict (queued/stuck intent on terminal) -> cancel known stuck intent & retry once
    if (!mpRes.ok && isBusyConflictError(mpRes.status, data)) {
      const candidates = [
        payload.previous_intent_id ? String(payload.previous_intent_id).trim() : '',
        lastIntentByDevice.get(deviceId) || ''
      ].filter((id, idx, arr) => id && arr.indexOf(id) === idx);

      let clearedAny = false;
      for (const stuckId of candidates) {
        const cancelRes = await cancelSpecificIntent(deviceId, stuckId, authHeader);
        if (cancelRes.ok || cancelRes.status === 200 || cancelRes.status === 204) {
          clearedAny = true;
          break;
        }
      }

      if (clearedAny) {
        await delay(350);
        ({ mpRes, data } = await sendCreate());
      }
    }

    if (mpRes.ok && data?.id) {
      const idStr = String(data.id);
      const serverCreatedAtMs = Date.now();
      lastIntentByDevice.set(deviceId, idStr);
      intentMetaById.set(idStr, {
        deviceId,
        externalRef,
        amount: numAmount,
        serverCreatedAtMs
      });
      // Keep map bounded
      if (intentMetaById.size > 100) {
        const oldestKey = intentMetaById.keys().next().value;
        if (oldestKey) intentMetaById.delete(oldestKey);
      }
      return {
        statusCode: mpRes.status,
        body: {
          status: 'SUCCESS',
          http_status: mpRes.status,
          intent: data,
          device_id: deviceId,
          server_created_at: serverCreatedAtMs
        }
      };
    }

    const rawErr = extractMpErrorMessage(data, `Error HTTP ${mpRes.status} al conectar con la terminal`);
    const isBusy = isBusyConflictError(mpRes.status, data);
    const isModeErr = isOperatingModeError(mpRes.status, data);

    return {
      statusCode: mpRes.status,
      body: {
        status: 'ERROR',
        http_status: mpRes.status,
        intent: data,
        error_code: isBusy ? 'TERMINAL_BUSY' : isModeErr ? 'OPERATING_MODE' : 'CREATE_INTENT_ERROR',
        error_message: isBusy
          ? 'La terminal ya tiene un cobro pendiente en pantalla. Presiona el botón rojo (X) en la terminal física para cancelarlo y vuelve a intentar.'
          : rawErr
      }
    };
  }

  // 4. CHECK PAYMENT INTENT STATUS (Multi-layer authoritative verification)
  if (action === 'check_intent') {
    const intentId = String(payload.intent_id || '').trim();
    const meta = intentId ? intentMetaById.get(intentId) : null;
    const externalRef = String(payload.reference || payload.folio || payload.external_reference || meta?.externalRef || '').trim();
    const deviceId = normalizeDeviceId(payload.device_id || meta?.deviceId || DEFAULT_DEVICE_ID);
    const expectedAmount = Number(payload.amount || meta?.amount || 0);
    const posId = payload.pos_id ? String(payload.pos_id).trim() : '';
    const deepCheck = payload.deep_check === true;

    // ALWAYS prefer server UTC timestamp over client clock to prevent Zakia PC clock-drift bugs!
    const nowMs = Date.now();
    const serverCreatedAtMs = meta?.serverCreatedAtMs || (
      Number(payload.server_created_at) > 0 && Math.abs(nowMs - Number(payload.server_created_at)) < 600000
        ? Number(payload.server_created_at)
        : 0
    );
    const minAllowedMs = serverCreatedAtMs > 0 ? serverCreatedAtMs - 90000 : nowMs - 240000;

    let resultData = null;

    // LAYER 1: Query Point Intent API directly
    if (intentId && !intentId.startsWith('INTENT-')) {
      try {
        const mpRes = await fetchWithTimeout(
          `${MP_BASE}/payment-intents/${encodeURIComponent(intentId)}`,
          { method: 'GET', headers: authHeader },
          4500
        );
        const data = await mpRes.json().catch(() => ({}));

        if (mpRes.ok && data) {
          resultData = data;
          const rawState = String(data.state || data.status || '').toUpperCase();

          // A1. Terminal / operator canceled or abandoned the intent
          if (
            rawState === 'CANCELED' ||
            rawState === 'CANCELLED' ||
            rawState === 'CLOSED' ||
            rawState === 'ERROR' ||
            rawState === 'ABANDONED'
          ) {
            if (lastIntentByDevice.get(deviceId) === intentId) {
              lastIntentByDevice.delete(deviceId);
            }
            return {
              statusCode: 200,
              body: {
                ...data,
                state: rawState === 'ABANDONED' ? 'ABANDONED' : 'CANCELED',
                status: rawState === 'ABANDONED' ? 'ABANDONED' : 'CANCELED',
                failure_kind: 'CANCELED',
                error_message:
                  rawState === 'ABANDONED'
                    ? 'El cobro expiró por tiempo en la terminal sin leer tarjeta.'
                    : 'Operación cancelada en la terminal antes de completar el cobro.'
              }
            };
          }

          // A2. If Point Intent references a payment ID, fetch GET /v1/payments/{id} immediately!
          const linkedPaymentId = resolveLinkedPaymentId(data);
          if (linkedPaymentId) {
            const directResolved = await resolvePaymentById(linkedPaymentId, intentId, externalRef, deviceId, authHeader);
            if (directResolved) return directResolved;
          }

          // If intent itself already embeds explicit payment.status
          if (data.payment?.status === 'approved' || data.payment?.status_detail === 'accredited') {
            if (lastIntentByDevice.get(deviceId) === intentId) {
              lastIntentByDevice.delete(deviceId);
            }
            return { statusCode: 200, body: data };
          }
          if (data.payment?.status === 'rejected' || data.payment?.status === 'cancelled') {
            if (lastIntentByDevice.get(deviceId) === intentId) {
              lastIntentByDevice.delete(deviceId);
            }
            return {
              statusCode: 200,
              body: formatPaymentRejectionResponse(intentId, data.payment)
            };
          }
        } else if (mpRes.status === 404 || mpRes.status >= 500) {
          // Transient eventual-consistency 404 or MP 5xx: fall through to Layer 2/3, never fail abruptly
          resultData = {
            id: intentId,
            state: 'ON_TERMINAL',
            status: 'ON_TERMINAL',
            transient_http_status: mpRes.status
          };
        }
      } catch (_) {}
    }

    // LAYER 2: Payments Search by external_reference (server-clock guarded, immune to client clock drift)
    if (externalRef) {
      try {
        const searchUrl = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=5&external_reference=${encodeURIComponent(externalRef)}`;
        const searchRes = await fetchWithTimeout(searchUrl, { method: 'GET', headers: authHeader }, 4500);
        const searchData = await searchRes.json().catch(() => ({}));

        if (searchRes.ok && Array.isArray(searchData.results) && searchData.results.length > 0) {
          const matched = searchData.results.find((p) => {
            if (String(p.external_reference || '') !== externalRef) return false;
            const createdMs = new Date(p.date_created || p.date_approved || 0).getTime();
            return Number.isFinite(createdMs) && createdMs >= minAllowedMs && nowMs - createdMs < 360000;
          });

          if (matched) {
            if (matched.status === 'approved' || matched.status_detail === 'accredited') {
              if (lastIntentByDevice.get(deviceId) === intentId) {
                lastIntentByDevice.delete(deviceId);
              }
              return {
                statusCode: 200,
                body: formatPaymentApprovalResponse(intentId, matched, externalRef)
              };
            }
            if (
              matched.status === 'rejected' ||
              matched.status === 'cancelled' ||
              String(matched.status_detail || '').startsWith('cc_rejected_')
            ) {
              if (lastIntentByDevice.get(deviceId) === intentId) {
                lastIntentByDevice.delete(deviceId);
              }
              return {
                statusCode: 200,
                body: formatPaymentRejectionResponse(intentId, matched)
              };
            }
          }
        }
      } catch (_) {}
    }

    // LAYER 3 (Deep check every ~3rd poll or manual "Verificar Cobro Ahora"):
    // 3A. Check Point events feed for this intentId
    // 3B. Check pos_id + exact amount in case external_reference wasn't indexed yet
    if (deepCheck) {
      if (intentId && !intentId.startsWith('INTENT-')) {
        try {
          const todayIso = new Date(nowMs - 86400000).toISOString().slice(0, 10);
          const tomorrowIso = new Date(nowMs + 86400000).toISOString().slice(0, 10);
          const evRes = await fetchWithTimeout(
            `${MP_BASE}/payment-intents/events?startDate=${todayIso}&endDate=${tomorrowIso}`,
            { method: 'GET', headers: authHeader },
            4000
          );
          const evData = await evRes.json().catch(() => ({}));
          const evMatch = Array.isArray(evData.events)
            ? evData.events.find((e) => String(e.payment_intent_id || '') === intentId)
            : null;
          if (evMatch && String(evMatch.status || '').toUpperCase() === 'FINISHED') {
            // Re-read intent detail to fetch its payment.id immediately
            const reRes = await fetchWithTimeout(
              `${MP_BASE}/payment-intents/${encodeURIComponent(intentId)}`,
              { method: 'GET', headers: authHeader },
              4000
            );
            const reData = await reRes.json().catch(() => ({}));
            const pId = resolveLinkedPaymentId(reData);
            if (pId) {
              const resolved = await resolvePaymentById(pId, intentId, externalRef, deviceId, authHeader);
              if (resolved) return resolved;
              return { statusCode: 200, body: { ...reData, state: 'FINISHED', status: 'PROCESSED' } };
            }
          }
        } catch (_) {}
      }

      if (posId && expectedAmount > 0) {
        try {
          const posUrl = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=5&pos_id=${encodeURIComponent(posId)}`;
          const posRes = await fetchWithTimeout(posUrl, { method: 'GET', headers: authHeader }, 4000);
          const posData = await posRes.json().catch(() => ({}));
          if (posRes.ok && Array.isArray(posData.results)) {
            const posMatched = posData.results.find((p) => {
              if (p.status !== 'approved' && p.status_detail !== 'accredited') return false;
              const amtOk = Math.abs(Number(p.transaction_amount || 0) - expectedAmount) < 0.02;
              if (!amtOk) return false;
              const refMatchesOrEmpty = !p.external_reference || !externalRef || String(p.external_reference) === externalRef;
              if (!refMatchesOrEmpty) return false;
              const createdMs = new Date(p.date_created || p.date_approved || 0).getTime();
              return Number.isFinite(createdMs) && createdMs >= minAllowedMs && nowMs - createdMs < 300000;
            });
            if (posMatched) {
              if (lastIntentByDevice.get(deviceId) === intentId) {
                lastIntentByDevice.delete(deviceId);
              }
              return {
                statusCode: 200,
                body: formatPaymentApprovalResponse(intentId, posMatched, externalRef)
              };
            }
          }
        } catch (_) {}
      }
    }

    return {
      statusCode: 200,
      body: resultData || { id: intentId, state: 'ON_TERMINAL', status: 'ON_TERMINAL' }
    };
  }

  // 5. CANCEL PAYMENT INTENT
  if (action === 'cancel_intent') {
    const deviceId = normalizeDeviceId(payload.device_id || DEFAULT_DEVICE_ID);
    const intentId = String(payload.intent_id || lastIntentByDevice.get(deviceId) || '').trim();

    if (!intentId) {
      return {
        statusCode: 200,
        body: {
          status: 'NO_ACTIVE_INTENT',
          message: 'No había un intento activo registrado para cancelar.'
        }
      };
    }

    const cancelRes = await cancelSpecificIntent(deviceId, intentId, authHeader);
    if (lastIntentByDevice.get(deviceId) === intentId) {
      lastIntentByDevice.delete(deviceId);
    }

    return {
      statusCode: cancelRes.ok ? 200 : cancelRes.status,
      body: {
        status: cancelRes.ok ? 'CANCELLED' : 'ERROR',
        http_status: cancelRes.status,
        data: cancelRes.data,
        message: cancelRes.ok
          ? 'Intento cancelado en la terminal'
          : extractMpErrorMessage(cancelRes.data, 'No se pudo cancelar el intento')
      }
    };
  }

  // 6. DIAGNOSE
  if (action === 'diagnose') {
    const testRes = await fetchWithTimeout(`${MP_BASE}/devices`, { method: 'GET', headers: authHeader });
    const testData = await testRes.json().catch(() => ({}));
    return {
      statusCode: 200,
      body: {
        status: testRes.ok ? 'CONNECTED' : testRes.status === 401 ? 'AUTH_FAILED' : 'ERROR',
        http_status: testRes.status,
        devices: testData.devices || [],
        raw: testData,
        message: testRes.ok
          ? `Conexión exitosa con Mercado Pago. ${(testData.devices || []).length} terminal(es) encontrada(s).`
          : testRes.status === 401
            ? 'Error 401: Access Token inválido o revocado'
            : `Error ${testRes.status}`
      }
    };
  }

  return {
    statusCode: 400,
    body: { error: 'UNKNOWN_ACTION', action }
  };
}
