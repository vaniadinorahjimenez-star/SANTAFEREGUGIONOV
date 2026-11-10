/**
 * Netlify Serverless Function: clip-payment.js
 * Ruta: /.netlify/functions/clip-payment
 * 
 * Controlador compatible con ESM para Netlify Functions.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      status: 'SUCCESS',
      message: 'Terminal service ready (Mercado Pago Point activo)'
    })
  };
};

export default handler;
