import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

const endpoints = [
  { path: '/dim_jenis_kelamin', field: 'jenis_kelamin', sampleVal: 'L', updateVal: 'P' },
  { path: '/dim_kabupaten_kota', field: 'kabupaten_kota', sampleVal: 'KOTA BANDUNG', updateVal: 'KOTA JAKARTA' },
  { path: '/dim_keterangan', field: 'ket', sampleVal: 'Tugas Belajar', updateVal: 'Izin Belajar' },
  { path: '/dim_lama_studi', field: 'lama_studi', sampleVal: '4 Tahun', updateVal: '6 Tahun' },
  { path: '/dim_sekolah', field: 'nama_sekolah', sampleVal: 'SMAN 1 BANDUNG', updateVal: 'SMAN 2 BANDUNG' }
];

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, options);
  let body;
  try {
    body = await response.json();
  } catch (err) {
    body = null;
  }
  return { status: response.status, body };
}

async function runTests() {
  console.log('=== STARTING API AUDIT TEST SUITE ===\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(err);
      failed++;
    }
  }

  for (const ep of endpoints) {
    console.log(`\n--- Testing endpoint: ${ep.path} ---`);

    // 1. GET standard list
    await test(`GET ${ep.path} should return 200 and success status`, async () => {
      const res = await request(ep.path);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'success');
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.meta);
    });

    // 2. GET pagination
    await test(`GET ${ep.path} with limit & offset should paginate`, async () => {
      const res = await request(`${ep.path}?limit=2&offset=0`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'success');
      assert.ok(res.body.data.length <= 2);
      assert.strictEqual(res.body.meta.limit, 2);
    });

    // 3. POST valid data
    let createdId;
    await test(`POST ${ep.path} with valid data should return 201 and insertId`, async () => {
      const res = await request(ep.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [ep.field]: ep.sampleVal })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.status, 'success');
      assert.ok(res.body.data.id > 0);
      assert.strictEqual(res.body.data[ep.field], ep.sampleVal);
      createdId = res.body.data.id;
    });

    // 4. POST empty data
    await test(`POST ${ep.path} with empty data should return 400`, async () => {
      const res = await request(ep.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [ep.field]: '' })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.status, 'error');
    });

    // 4b. POST null value
    await test(`POST ${ep.path} with null value should return 400`, async () => {
      const res = await request(ep.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [ep.field]: null })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.status, 'error');
    });

    // 4c. POST missing key
    await test(`POST ${ep.path} with missing key should return 400`, async () => {
      const res = await request(ep.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.status, 'error');
    });

    // 5. PUT valid update
    await test(`PUT ${ep.path} with valid id and data should return 200`, async () => {
      assert.ok(createdId, 'Requires a created record ID');
      const res = await request(ep.path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: createdId, [ep.field]: ep.updateVal })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'success');
      assert.strictEqual(res.body.data.id, createdId);
      assert.strictEqual(res.body.data[ep.field], ep.updateVal);
    });

    // 6. PUT ID not found
    await test(`PUT ${ep.path} with non-existent ID should return 404`, async () => {
      const res = await request(ep.path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 9999999, [ep.field]: ep.updateVal })
      });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.status, 'error');
    });

    // 7. PUT ID invalid (negative / non-integer)
    await test(`PUT ${ep.path} with invalid ID should return 400`, async () => {
      const res = await request(ep.path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: -5, [ep.field]: ep.updateVal })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.status, 'error');

      const resString = await request(ep.path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'invalid_id', [ep.field]: ep.updateVal })
      });
      assert.strictEqual(resString.status, 400);
      assert.strictEqual(resString.body.status, 'error');
    });

    // 8. PUT JSON rusak
    await test(`PUT ${ep.path} with malformed JSON should return 400`, async () => {
      const res = await request(ep.path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{ id: 5, value: '
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.status, 'error');
    });

    // 9. DELETE ID not found
    await test(`DELETE ${ep.path} with non-existent ID should return 404`, async () => {
      const res = await request(ep.path, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 9999999 })
      });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.status, 'error');
    });

    // 10. DELETE ID invalid
    await test(`DELETE ${ep.path} with invalid ID should return 400`, async () => {
      const res = await request(ep.path, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: -2 })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.status, 'error');
    });

    // 11. DELETE valid record (cleanup)
    await test(`DELETE ${ep.path} with valid ID in body should delete and return 200`, async () => {
      assert.ok(createdId, 'Requires a created record ID');
      const res = await request(ep.path, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: createdId })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'success');
    });

    // 12. DELETE valid record via query param
    await test(`DELETE ${ep.path} via query param should work`, async () => {
      // First create a new one to delete
      const postRes = await request(ep.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [ep.field]: ep.sampleVal })
      });
      const tempId = postRes.body.data.id;
      
      const delRes = await request(`${ep.path}?id=${tempId}`, {
        method: 'DELETE'
      });
      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.body.status, 'success');
    });

    // 13. Method not allowed
    await test(`PATCH ${ep.path} should return 405`, async () => {
      const res = await request(ep.path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1 })
      });
      assert.strictEqual(res.status, 405);
      assert.strictEqual(res.body.status, 'error');
    });
  }

  console.log('\n=== TEST SUITE COMPLETED ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal testing error:', err);
  process.exit(1);
});
