import { getPool } from './db.js';
import { clearCache, getCache, setCache } from './cache.js';
import { env } from './env.js';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload, null, 2));
}

function getMethod(req) {
  return (req.method || 'GET').toUpperCase();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function toRow(row, tableDef) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[tableDef.alias[key] || key] = value;
  }
  return result;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPagination(req) {
  const url = new URL(req.url, 'http://localhost');
  const defaultLimit = parsePositiveInt(env('API_DEFAULT_LIMIT', '50'), 50);
  const maxLimit = parsePositiveInt(env('API_MAX_LIMIT', '200'), 200);
  const limit = Math.min(parsePositiveInt(url.searchParams.get('limit'), defaultLimit), maxLimit);
  const offset = Math.max(Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  return { limit, offset };
}

function getCacheKey(tableDef, pagination) {
  return `crud:${tableDef.table}:${pagination.limit}:${pagination.offset}`;
}

export async function handleCrud(req, res, tableDef) {
  try {
    const pool = getPool();
    const method = getMethod(req);

    if (method === 'GET') {
      const pagination = getPagination(req);
      const cacheKey = getCacheKey(tableDef, pagination);
      const cached = getCache(cacheKey);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return sendJson(res, 200, cached);
      }

      const [rows] = await pool.query(
        `SELECT * FROM \`${tableDef.table}\` ORDER BY \`${tableDef.id}\` DESC LIMIT ? OFFSET ?`,
        [pagination.limit, pagination.offset]
      );

      const payload = {
        status: 'success',
        message: `Data ${tableDef.table} berhasil diambil`,
        meta: {
          limit: pagination.limit,
          offset: pagination.offset,
          count: rows.length
        },
        data: rows.map((row) => toRow(row, tableDef))
      };

      setCache(cacheKey, payload, Number(env('API_CACHE_TTL', '60')));
      res.setHeader('X-Cache', 'MISS');
      return sendJson(res, 200, {
        ...payload
      });
    }

    if (method === 'POST') {
      const body = await readBody(req);
      const column = tableDef.columns[0];
      const value = body[tableDef.alias[column]];
      const [result] = await pool.query(`INSERT INTO \`${tableDef.table}\` (\`${column}\`) VALUES (?)`, [value ?? null]);
      clearCache(`crud:${tableDef.table}:`);

      return sendJson(res, 201, {
        status: 'success',
        message: `Data ${tableDef.table} berhasil ditambahkan`,
        data: {
          id: result.insertId,
          [tableDef.alias[column]]: value ?? null
        }
      });
    }

    if (method === 'PUT') {
      const body = await readBody(req);
      const id = body.id;
      const column = tableDef.columns[0];
      const value = body[tableDef.alias[column]];

      if (id === undefined || id === null) {
        return sendJson(res, 400, {
          status: 'error',
          message: 'Field id wajib diisi'
        });
      }

      await pool.query(`UPDATE \`${tableDef.table}\` SET \`${column}\` = ? WHERE \`${tableDef.id}\` = ?`, [value ?? null, id]);
      clearCache(`crud:${tableDef.table}:`);

      return sendJson(res, 200, {
        status: 'success',
        message: `Data ${tableDef.table} berhasil diperbarui`,
        data: {
          id,
          [tableDef.alias[column]]: value ?? null
        }
      });
    }

    if (method === 'DELETE') {
      const body = await readBody(req);
      const id = body.id ?? new URL(req.url, 'http://localhost').searchParams.get('id');

      if (id === undefined || id === null || id === '') {
        return sendJson(res, 400, {
          status: 'error',
          message: 'Field id wajib diisi'
        });
      }

      await pool.query(`DELETE FROM \`${tableDef.table}\` WHERE \`${tableDef.id}\` = ?`, [id]);
      clearCache(`crud:${tableDef.table}:`);

      return sendJson(res, 200, {
        status: 'success',
        message: `Data ${tableDef.table} berhasil dihapus`,
        data: { id: Number.isNaN(Number(id)) ? id : Number(id) }
      });
    }

    return sendJson(res, 405, {
      status: 'error',
      message: 'Method tidak didukung'
    });
  } catch (error) {
    return sendJson(res, 500, {
      status: 'error',
      message: 'Koneksi database gagal',
      error: error.message
    });
  }
}
