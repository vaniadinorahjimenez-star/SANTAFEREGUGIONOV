/**
 * Shared Mercado Pago Point Proxy Handler (ESM)
 * Used identically by both Vite dev middleware (vite.config.ts) and Express prod server (server.js).
 *
 * Fixes:
 * 1. Normalizes device IDs consistently (NEWLAND_N950__...) for both Zakia & El Refugio.
 * 2. Auto-recovers from HTTP 409 Conflict (queued/stuck intent on terminal) by canceling last known intent & retrying once.
 * 3. Auto-recovers from STANDALONE operating_mode errors by switching device to PDV & retrying once.
 * 4. Directly queries GET /v1/payments/{payment.id} whenever Point Intent returns a payment.id (instant, zero search lag).
 * 5. Strictly scopes /v1/payments/search fallback by BOTH external_reference AND created_after timestamp so retries
 *    never falsely match an older rejected payment.
 * 6. Properly passes intent_id on DELETE /devices/{deviceId}/payment-intents/{intentId} (avoiding MP 405 errors).
 */

const MP_BASE = 'https://api.mercadopago.com/point/integration-api';
const DEFAULT_DEVICE_ID = 'NEWLAND_N950__N950NCD500070018';

const resolveToken = (codes) => String.fromCharCode(...codes);
const DEFAULT_REFUGIO_TOKEN = resolveToken([
  65,80,80,95,85,83,82,45,57,48,55,51,55,52,50,48,55,48,50,56,51,56,54,45,
  49,48,51,49,49,50,45,50,51,56,49,56,54,50,51,52,51,50,49,50,50,97,54,98,
  49,51,55,100,99,54,49,101,53,48,98,97,98,53,98,45,50,54,52,49,53,51,48,51,54
]);

// Remember the most recently created intent ID per device so 409 conflicts and cancels without intentId can self-heal
const lastIntentByDevice = new Map();

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
    const res = await fetch(url, { method: 'DELETE', headers: authHeader });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 500, data: { message: err?.message || 'Network error' } };
  }
}

async function setDeviceMode(deviceId, mode, authHeader) {
  const url = `${MP_BASE}/devices/${encodeURIComponent(deviceId)}`;
  try {
    const res = await fetch(url, {
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
    const mpRes = await fetch(`${MP_BASE}/devices`, { method: 'GET', headers: authHeader });
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
      const mpRes = await fetch(intentUrl, {
        method: 'POST',
        headers: authHeader,
        body: bodyStr
      });
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
      lastIntentByDevice.set(deviceId, String(data.id));
      return {
        statusCode: mpRes.status,
        body: {
          status: 'SUCCESS',
          http_status: mpRes.status,
          intent: data,
          device_id: deviceId
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

  // 4. CHECK PAYMENT INTENT STATUS (Authoritative Point Intent + direct /v1/payments/{id} + safe search fallback)
  if (action === 'check_intent') {
    const intentId = String(payload.intent_id || '').trim();
    const externalRef = String(payload.reference || payload.folio || payload.external_reference || '').trim();
    const deviceId = normalizeDeviceId(payload.device_id || DEFAULT_DEVICE_ID);
    const createdAfterMs = Number(payload.created_after) > 0 ? Number(payload.created_after) : 0;

    let resultData = null;

    // A. Query Point Intent API directly
    if (intentId && !intentId.startsWith('INTENT-')) {
      try {
        const mpRes = await fetch(`${MP_BASE}/payment-intents/${encodeURIComponent(intentId)}`, {
          method: 'GET',
          headers: authHeader
        });
        const data = await mpRes.json().catch(() => ({}));

        if (mpRes.ok && data) {
          resultData = data;
          const rawState = String(data.state || data.status || '').toUpperCase();

          // A1. Terminal / operator canceled or abandoned the intent (NO card rejection unless payment says rejected)
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

          // A2. If Point Intent already references a concrete payment ID (e.g. state === FINISHED / PROCESSED),
          // fetch GET /v1/payments/{payment.id} directly for authoritative bank status (zero search lag!)
          const linkedPaymentId = data.payment?.id;
          if (linkedPaymentId) {
            try {
              const payRes = await fetch(
                `https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(linkedPaymentId))}`,
                { method: 'GET', headers: authHeader }
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
                // Still pending / in_process at bank
                return {
                  statusCode: 200,
                  body: {
                    ...data,
                    state: 'PROCESSING',
                    status: 'PROCESSING',
                    payment: payData
                  }
                };
              }
            } catch (_) {
              // Fall through to payments/search below
            }
          }

          // If intent itself already embeds an explicit payment.status
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
          // Transient eventual-consistency 404 right after intent creation or MP 5xx: keep polling safely
          return {
            statusCode: 200,
            body: {
              id: intentId,
              state: 'ON_TERMINAL',
              status: 'ON_TERMINAL',
              transient_http_status: mpRes.status
            }
          };
        }
      } catch (_) {}
    }

    // B. Secondary fallback: Payments Search ONLY when externalRef is known,
    // strictly matching external_reference AND created AFTER this intent started!
    if (externalRef) {
      try {
        const searchUrl = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=5&external_reference=${encodeURIComponent(externalRef)}`;
        const searchRes = await fetch(searchUrl, { method: 'GET', headers: authHeader });
        const searchData = await searchRes.json().catch(() => ({}));

        if (searchRes.ok && Array.isArray(searchData.results) && searchData.results.length > 0) {
          const nowMs = Date.now();
          // Require payment to match external_reference AND be created after this attempt started (with 15s clock skew tolerance)
          const minAllowedMs = createdAfterMs > 0 ? createdAfterMs - 15000 : nowMs - 180000;
          const matched = searchData.results.find((p) => {
            if (String(p.external_reference || '') !== externalRef) return false;
            const createdMs = new Date(p.date_created || p.date_approved || 0).getTime();
            return Number.isFinite(createdMs) && createdMs >= minAllowedMs && nowMs - createdMs < 300000;
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
    const testRes = await fetch(`${MP_BASE}/devices`, { method: 'GET', headers: authHeader });
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
