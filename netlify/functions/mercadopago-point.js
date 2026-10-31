/**
 * Netlify Serverless Function: mercadopago-point.js
 * Ruta: /.netlify/functions/mercadopago-point
 * 
 * Conexión 100% REAL con la API de Mercado Pago Point (Terminales Físicas):
 * Endpoint base: https://api.mercadopago.com/point/integration-api
 * 
 * Permite:
 * 1. Listar dispositivos / terminales Point vinculados a la cuenta.
 * 2. Cambiar modo de operación a "PDV" (punto de venta integrado).
 * 3. Enviar orden de cobro (Payment Intent) directamente a la terminal física.
 * 4. Monitorear en tiempo real el estado del cobro en la pantalla de la terminal.
 * 5. Cancelar un intento de pago en la terminal.
 */

const MP_BASE_URL = 'https://api.mercadopago.com/point/integration-api';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

// Credenciales oficiales proporcionadas por el usuario
const DEFAULT_ACCESS_TOKEN = 'APP_USR-907374207028386-103112-23818623432122a6b137dc61e50bab5b-264153036';
const DEFAULT_PUBLIC_KEY = 'APP_USR-a2e81e37-5f82-49ec-a57a-4f93203d03bc';
const DEFAULT_CLIENT_ID = '907374207028386';
const DEFAULT_CLIENT_SECRET = '3yYjN3kvar5xWiAsvLnpdwVfRd2zbFqy';

function getAccessToken(payload) {
  let token = (payload?.access_token || process.env.MP_ACCESS_TOKEN || DEFAULT_ACCESS_TOKEN || '').trim();
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1).trim();
  }
  if (token.toLowerCase().startsWith('bearer ')) {
    token = token.substring(7).trim();
  }
  return token;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  try {
    let payload = {};
    if (event.body) {
      try {
        payload = JSON.parse(event.body);
      } catch (e) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'INVALID_JSON', message: 'El cuerpo de la petición no es un JSON válido' })
        };
      }
    }

    const action = payload.action || event.queryStringParameters?.action || 'get_devices';
    const accessToken = getAccessToken(payload);

    if (!accessToken) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'MISSING_ACCESS_TOKEN',
          message: 'Falta el Access Token de Mercado Pago. Configúralo en Ajustes de la Panadería.'
        })
      };
    }

    const authHeader = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    // ==============================================================
    // 1. OBTENER TERMINALES DISPONIBLES (GET DEVICES)
    // ==============================================================
    if (action === 'get_devices') {
      const url = `${MP_BASE_URL}/devices`;
      const res = await fetch(url, { method: 'GET', headers: authHeader });
      const data = await res.json().catch(() => ({}));

      return {
        statusCode: res.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          status: res.ok ? 'SUCCESS' : 'ERROR',
          http_status: res.status,
          devices: data.devices || (Array.isArray(data) ? data : []),
          paging: data.paging || null,
          raw: data
        })
      };
    }

    // ==============================================================
    // 2. CAMBIAR MODO DE OPERACIÓN A PDV (NECESARIO PARA COBRAR VÍA API)
    // ==============================================================
    if (action === 'set_operating_mode') {
      const deviceId = (payload.device_id || '').trim();
      const mode = (payload.operating_mode || 'PDV').trim().toUpperCase();

      if (!deviceId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'MISSING_DEVICE_ID', message: 'Indica el ID de la terminal Mercado Pago' })
        };
      }

      const url = `${MP_BASE_URL}/devices/${encodeURIComponent(deviceId)}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: authHeader,
        body: JSON.stringify({ operating_mode: mode })
      });
      const data = await res.json().catch(() => ({}));

      return {
        statusCode: res.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          status: res.ok ? 'SUCCESS' : 'ERROR',
          http_status: res.status,
          operating_mode: mode,
          data
        })
      };
    }

    // ==============================================================
    // 3. CREAR INTENTO DE PAGO (MANDAR ORDEN A LA TERMINAL)
    // ==============================================================
    if (action === 'create_intent') {
      const deviceId = (payload.device_id || '').trim();
      const amount = Number(payload.amount);
      const description = (payload.description || 'Panadería Santa Fé').substring(0, 100);
      const externalReference = (payload.reference || payload.folio || `PAN-${Date.now()}`).substring(0, 50);

      if (!deviceId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'MISSING_DEVICE_ID', message: 'Falta el ID o Número de Serie de la Terminal Mercado Pago' })
        };
      }

      if (isNaN(amount) || amount <= 0) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'INVALID_AMOUNT', message: 'El monto a cobrar debe ser mayor a $0' })
        };
      }

      const url = `${MP_BASE_URL}/devices/${encodeURIComponent(deviceId)}/payment-intents`;
      const bodyPayload = {
        amount: Math.round(amount * 100) / 100, // Número con 2 decimales
        description: description,
        additional_info: {
          external_reference: externalReference,
          print_on_terminal: payload.print_on_terminal !== false
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json().catch(() => ({}));

      return {
        statusCode: res.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          status: res.ok ? 'SUCCESS' : 'ERROR',
          http_status: res.status,
          intent: data,
          error_message: !res.ok ? (data.message || data.error || 'No se pudo enviar la orden a la terminal Mercado Pago') : undefined
        })
      };
    }

    // ==============================================================
    // 4. CONSULTAR ESTADO DEL INTENTO DE PAGO (POLLING REAL)
    // ==============================================================
    if (action === 'check_intent') {
      const intentId = (payload.intent_id || event.queryStringParameters?.intent_id || '').trim();

      if (!intentId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'MISSING_INTENT_ID', message: 'Falta el ID del intento de pago' })
        };
      }

      const url = `${MP_BASE_URL}/payment-intents/${encodeURIComponent(intentId)}`;
      const res = await fetch(url, { method: 'GET', headers: authHeader });
      const data = await res.json().catch(() => ({}));

      return {
        statusCode: res.status,
        headers: CORS_HEADERS,
        body: JSON.stringify(data)
      };
    }

    // ==============================================================
    // 5. CANCELAR INTENTO DE PAGO EN LA TERMINAL
    // ==============================================================
    if (action === 'cancel_intent') {
      const deviceId = (payload.device_id || '').trim();

      if (!deviceId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'MISSING_DEVICE_ID', message: 'Falta el ID de la terminal Mercado Pago a cancelar' })
        };
      }

      const url = `${MP_BASE_URL}/devices/${encodeURIComponent(deviceId)}/payment-intents`;
      const res = await fetch(url, { method: 'DELETE', headers: authHeader });
      const data = await res.json().catch(() => ({}));

      return {
        statusCode: res.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          status: res.ok ? 'CANCELLED' : 'ERROR',
          http_status: res.status,
          data
        })
      };
    }

    // ==============================================================
    // 6. DIAGNÓSTICO EN VIVO
    // ==============================================================
    if (action === 'diagnose') {
      try {
        const testRes = await fetch(`${MP_BASE_URL}/devices`, { method: 'GET', headers: authHeader });
        const testData = await testRes.json().catch(() => ({}));

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            status: testRes.ok ? 'CONNECTED' : (testRes.status === 401 ? 'AUTH_FAILED' : 'ERROR'),
            http_status: testRes.status,
            public_key_configured: Boolean(payload.public_key || DEFAULT_PUBLIC_KEY),
            client_id_configured: Boolean(payload.client_id || DEFAULT_CLIENT_ID),
            devices: testData.devices || [],
            raw: testData,
            message: testRes.ok 
              ? `Conexión con Mercado Pago Point exitosa. Se detectaron ${(testData.devices || []).length} terminal(es).`
              : (testRes.status === 401 ? 'Error 401: Access Token inválido o revocado en Mercado Pago.' : `Error HTTP ${testRes.status} al consultar Mercado Pago.`)
          })
        };
      } catch (err) {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            status: 'NETWORK_ERROR',
            message: `Error de red al conectar con Mercado Pago: ${err.message}`
          })
        };
      }
    }

    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'UNKNOWN_ACTION', message: `Acción '${action}' no soportada` })
    };

  } catch (error) {
    console.error('Error en Netlify function mercadopago-point:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'INTERNAL_ERROR',
        message: error.message || 'Error interno en mercadopago-point'
      })
    };
  }
};
