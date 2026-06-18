import { getPool } from './db.js';
import { clearCache, getCache, setCache } from './cache.js';
import { env } from './env.js';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const bodyStr = JSON.stringify(payload, null, 2);
  safeLog(`Response [${statusCode}]: ${bodyStr}`);
  res.end(bodyStr);
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
      if (!raw.trim()) return resolve({});
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

function safeLog(message, ...args) {
  const cleanArgs = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      const copy = { ...arg };
      for (const key of Object.keys(copy)) {
        if (/pass|token|secret|auth|key/i.test(key)) {
          copy[key] = '***REDACTED***';
        }
      }
      return JSON.stringify(copy);
    }
    return arg;
  });
  console.log(`[DEBUG] [${new Date().toISOString()}] ${message}`, ...cleanArgs);
}

function isValidPositiveInt(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'string') {
    if (!/^\d+$/.test(val)) return false;
  }
  const num = Number(val);
  return Number.isInteger(num) && num > 0;
}

function isNonEmptyString(val) {
  if (val === undefined || val === null) return false;
  return typeof val === 'string' && val.trim() !== '';
}

export async function handleCrud(req, res, tableDef) {
  const method = getMethod(req);
  const url = new URL(req.url, 'http://localhost');
  
  // Safe Logging of request details
  safeLog(`Incoming request: ${method} ${req.url}`);
  safeLog(`Query params: ${url.search}`);

  try {
    const pool = getPool();

    if (method === 'GET') {
      const pagination = getPagination(req);
      const cacheKey = getCacheKey(tableDef, pagination);
      const cached = getCache(cacheKey);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        safeLog(`Cache HIT for key: ${cacheKey}`);
        return sendJson(res, 200, cached);
      }

      const sqlQuery = `SELECT * FROM \`${tableDef.table}\` ORDER BY \`${tableDef.id}\` DESC LIMIT ? OFFSET ?`;
      safeLog(`Executing query: ${sqlQuery} with params: [${pagination.limit}, ${pagination.offset}]`);
      
      const [rows] = await pool.query(sqlQuery, [pagination.limit, pagination.offset]);
      safeLog(`Query result rows count: ${rows.length}`);

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
      return sendJson(res, 200, payload);
    }

    if (method === 'POST') {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        safeLog(`Error parsing JSON body: ${err.message}`);
        return sendJson(res, 400, {
          status: 'error',
          message: 'JSON input tidak valid'
        });
      }
      
      safeLog(`Request body:`, body);

      const column = tableDef.columns[0];
      const aliasName = tableDef.alias[column];
      const value = body[aliasName];

      // POST Input Validation
      if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
        safeLog(`Validation failed: Field '${aliasName}' is empty or invalid`);
        return sendJson(res, 400, {
          status: 'error',
          message: `Field '${aliasName}' wajib diisi dan tidak boleh kosong`
        });
      }

      const insertSql = `INSERT INTO \`${tableDef.table}\` (\`${column}\`) VALUES (?)`;
      safeLog(`Executing query: ${insertSql} with params: [${value}]`);
      
      const [result] = await pool.query(insertSql, [value]);
      safeLog(`Insert successful, affectedRows: ${result.affectedRows}, insertId: ${result.insertId}`);
      
      clearCache(`crud:${tableDef.table}:`);

      return sendJson(res, 201, {
        status: 'success',
        message: 'Data berhasil ditambahkan',
        data: {
          id: result.insertId,
          [aliasName]: value
        }
      });
    }

    if (method === 'PUT') {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        safeLog(`Error parsing JSON body: ${err.message}`);
        return sendJson(res, 400, {
          status: 'error',
          message: 'JSON input tidak valid'
        });
      }
      
      safeLog(`Request body:`, body);

      const id = body.id;
      const column = tableDef.columns[0];
      const aliasName = tableDef.alias[column];
      const value = body[aliasName];

      // PUT Input Validation
      if (!isValidPositiveInt(id)) {
        safeLog(`Validation failed: Field 'id' must be a valid positive integer`);
        return sendJson(res, 400, {
          status: 'error',
          message: "Field id wajib ada dan harus merupakan integer positif"
        });
      }

      if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
        safeLog(`Validation failed: Field '${aliasName}' is empty or invalid`);
        return sendJson(res, 400, {
          status: 'error',
          message: `Field '${aliasName}' wajib diisi dan tidak boleh kosong`
        });
      }

      // Existence Validation (SELECT first)
      const selectSql = `SELECT \`${tableDef.id}\` FROM \`${tableDef.table}\` WHERE \`${tableDef.id}\` = ?`;
      safeLog(`Checking existence query: ${selectSql} with params: [${id}]`);
      const [existsRows] = await pool.query(selectSql, [id]);
      
      if (existsRows.length === 0) {
        safeLog(`Validation failed: Record with id ${id} not found in ${tableDef.table}`);
        return sendJson(res, 404, {
          status: 'error',
          message: 'Data tidak ditemukan'
        });
      }

      const updateSql = `UPDATE \`${tableDef.table}\` SET \`${column}\` = ? WHERE \`${tableDef.id}\` = ?`;
      safeLog(`Executing query: ${updateSql} with params: [${value}, ${id}]`);
      
      const [result] = await pool.query(updateSql, [value, id]);
      safeLog(`Update successful, affectedRows: ${result.affectedRows}`);
      
      clearCache(`crud:${tableDef.table}:`);

      return sendJson(res, 200, {
        status: 'success',
        message: 'Data berhasil diperbarui',
        data: {
          id: Number(id),
          [aliasName]: value
        }
      });
    }

    if (method === 'DELETE') {
      let body = {};
      try {
        body = await readBody(req);
      } catch (err) {
        // Fallback or ignore, as DELETE may pass id in query
      }

      const idRaw = body.id ?? url.searchParams.get('id');

      // DELETE Input Validation
      if (!isValidPositiveInt(idRaw)) {
        safeLog(`Validation failed: ID must be a valid positive integer`);
        return sendJson(res, 400, {
          status: 'error',
          message: "Field id wajib ada dan harus merupakan integer positif"
        });
      }

      const id = Number(idRaw);

      // Existence Validation (SELECT first)
      const selectSql = `SELECT \`${tableDef.id}\` FROM \`${tableDef.table}\` WHERE \`${tableDef.id}\` = ?`;
      safeLog(`Checking existence query: ${selectSql} with params: [${id}]`);
      const [existsRows] = await pool.query(selectSql, [id]);

      if (existsRows.length === 0) {
        safeLog(`Validation failed: Record with id ${id} not found in ${tableDef.table}`);
        return sendJson(res, 404, {
          status: 'error',
          message: `Data dengan ID ${id} tidak ditemukan`
        });
      }

      const deleteSql = `DELETE FROM \`${tableDef.table}\` WHERE \`${tableDef.id}\` = ?`;
      safeLog(`Executing query: ${deleteSql} with params: [${id}]`);
      
      const [result] = await pool.query(deleteSql, [id]);
      safeLog(`Delete successful, affectedRows: ${result.affectedRows}`);

      if (result.affectedRows === 0) {
        return sendJson(res, 404, {
          status: 'error',
          message: `Data dengan ID ${id} tidak ditemukan`
        });
      }

      clearCache(`crud:${tableDef.table}:`);

      return sendJson(res, 200, {
        status: 'success',
        message: 'Data berhasil dihapus'
      });
    }

    safeLog(`Method ${method} not allowed`);
    return sendJson(res, 405, {
      status: 'error',
      message: 'Method tidak didukung'
    });
  } catch (error) {
    safeLog(`Database or internal error: ${error.stack}`);
    return sendJson(res, 500, {
      status: 'error',
      message: 'Koneksi database gagal',
      error: error.message
    });
  }
}

