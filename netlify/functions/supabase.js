import {
  getSupabaseStatus,
  fetchCollectionFromSupabase,
  upsertCollectionToSupabase,
  deleteRecordsFromSupabase,
} from '../../server/supabaseStore.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod === 'GET') {
    const status = await getSupabaseStatus();
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(status),
    };
  }

  if (event.httpMethod === 'POST') {
    try {
      const payload = event.body ? JSON.parse(event.body) : {};
      const { action, collection, record, records, id, ids } = payload;
      if (!collection) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: false, error: 'missing_collection' }),
        };
      }
      if (action === 'upsert') {
        const items = Array.isArray(records) ? records : record ? [record] : [];
        const result = await upsertCollectionToSupabase(collection, items);
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
      }
      if (action === 'delete') {
        const delList = Array.isArray(ids) ? ids : id ? [id] : [];
        const result = await deleteRecordsFromSupabase(collection, delList);
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
      }
      if (action === 'fetch') {
        const data = await fetchCollectionFromSupabase(collection);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: Array.isArray(data), data: data || [] }),
        };
      }
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: 'unknown_action' }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: err?.message || 'supabase_error' }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Método no permitido' }),
  };
};

export default handler;
