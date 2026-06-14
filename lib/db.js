import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from './env.js';

let pool;

function resolveSslOptions() {
  const caValue = env('DB_SSL_CA', '').trim();
  const sslMode = env('DB_SSL_MODE', 'required').toLowerCase();
  const certPath = env('DB_SSL_CERT_PATH', '').trim();

  if (!caValue) {
    if (sslMode === 'disabled') return undefined;

    if (certPath && fs.existsSync(certPath)) {
      return {
        ca: fs.readFileSync(certPath, 'utf8'),
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      };
    }

    const rootCert = path.join(process.cwd(), 'isrgrootx1.pem');
    if (fs.existsSync(rootCert)) {
      return {
        ca: fs.readFileSync(rootCert, 'utf8'),
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      };
    }

    return {
      minVersion: 'TLSv1.2',
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
    minVersion: 'TLSv1.2',
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
    connectionLimit: Number(env('DB_CONNECTION_LIMIT', '4')),
    maxIdle: Number(env('DB_MAX_IDLE', '2')),
    idleTimeout: Number(env('DB_IDLE_TIMEOUT', '60000')),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: Number(env('DB_KEEPALIVE_DELAY', '0')),
    charset: env('DB_CHARSET', 'utf8mb4'),
    ssl: resolveSslOptions()
  });

  return pool;
}
