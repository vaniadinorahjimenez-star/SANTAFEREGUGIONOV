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

import { handleMercadoPagoProxyAction } from '../../server/mercadoPagoProxy.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
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
    if (!payload.action && event.queryStringParameters?.action) {
      payload.action = event.queryStringParameters.action;
    }
    if (!payload.intent_id && event.queryStringParameters?.intent_id) {
      payload.intent_id = event.queryStringParameters.intent_id;
    }

    const result = await handleMercadoPagoProxyAction(payload);
    return {
      statusCode: result.statusCode || 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result.body)
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

export default handler;
