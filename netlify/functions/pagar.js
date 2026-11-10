/**
 * Netlify Serverless Function: pagar.js
 * Ruta: /.netlify/functions/pagar y /api/pagar
 * 
 * Reenvía al controlador integrado de terminales de punto de venta Mercado Pago Point.
 */

export { handler, default } from './mercadopago-point.js';
