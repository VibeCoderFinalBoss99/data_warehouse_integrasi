import http from 'node:http';
import dimJenisKelamin from './api/dim_jenis_kelamin.js';
import dimKabupatenKota from './api/dim_kabupaten_kota.js';
import dimKeterangan from './api/dim_keterangan.js';
import dimLamaStudi from './api/dim_lama_studi.js';
import dimSekolah from './api/dim_sekolah.js';

const handlers = {
  '/dim_jenis_kelamin': dimJenisKelamin,
  '/dim_kabupaten_kota': dimKabupatenKota,
  '/dim_keterangan': dimKeterangan,
  '/dim_lama_studi': dimLamaStudi,
  '/dim_sekolah': dimSekolah,
  '/api/dim_jenis_kelamin': dimJenisKelamin,
  '/api/dim_kabupaten_kota': dimKabupatenKota,
  '/api/dim_keterangan': dimKeterangan,
  '/api/dim_lama_studi': dimLamaStudi,
  '/api/dim_sekolah': dimSekolah
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  
  const handler = handlers[pathname];
  if (handler) {
    try {
      await handler(req, res);
    } catch (err) {
      console.error('Server Handler Error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'error', message: 'Internal Server Error', error: err.message }));
    }
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'error', message: 'Route not found' }));
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Test server is running locally on http://localhost:${PORT}`);
});
