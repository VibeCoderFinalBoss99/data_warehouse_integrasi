import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { env } from './env.js';

let pool;

function resolveSslOptions() {
  const caValue = env('DB_SSL_CA', '').trim();
  const sslMode = env('DB_SSL_MODE', 'required').toLowerCase();

  if (!caValue) {
    return sslMode === 'disabled'
      ? undefined
      : {
          rejectUnauthorized: true
        };
  }

  const pemLike = caValue.includes('BEGIN CERTIFICATE');
  const ca = pemLike
    ? caValue
    : fs.existsSync(caValue)
      ? fs.readFileSync(caValue, 'utf8')
      : caValue;

  return {
    ca,
    rejectUnauthorized: true
  };
}

export function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: env('DB_HOST', 'localhost'),
    port: Number(env('DB_PORT', '3306')),
    user: env('DB_USER', 'root'),
    password: env('DB_PASS', ''),
    database: env('DB_NAME', ''),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: env('DB_CHARSET', 'utf8mb4'),
    ssl: resolveSslOptions()
  });

  return pool;
}
