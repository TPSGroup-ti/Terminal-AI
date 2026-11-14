'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-ai-'));
  const server = createServer({ ownerToken: 'owner-secret-for-test', storePath: path.join(dir, 'store.json') });
  server.listen(0); await new Promise(r => server.once('listening', r));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (url, method = 'GET', body, token = 'owner-secret-for-test', deviceId) => fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(deviceId ? { 'X-Device-Id': deviceId } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { call };
}

test('health endpoint is available', async t => { const { call } = await setup(t); const r = await call('/health', 'GET', null, null); assert.equal(r.status, 200); assert.equal((await r.json()).ok, true); });
test('owner-only endpoints reject missing credentials', async t => { const { call } = await setup(t); assert.equal((await call('/api/pair-codes', 'POST', {}, null)).status, 401); });
test('pairing code is one-time and device can receive only assigned allowlisted job', async t => {
  const { call } = await setup(t);
  const pairRes = await call('/api/pair-codes', 'POST', { label: 'test phone' }); assert.equal(pairRes.status, 201);
  const { code } = await pairRes.json();
  const pairedRes = await call('/api/devices/pair', 'POST', { code }, null); assert.equal(pairedRes.status, 201);
  const paired = await pairedRes.json();
  assert.equal((await call('/api/devices/pair', 'POST', { code }, null)).status, 401);
  const jobRes = await call('/api/jobs', 'POST', { deviceId: paired.deviceId, taskId: 'working_directory' }); assert.equal(jobRes.status, 202);
  const job = await jobRes.json();
  const nextRes = await call('/api/device/jobs/next', 'GET', null, paired.deviceToken, paired.deviceId); assert.equal(nextRes.status, 200);
  const next = await nextRes.json(); assert.equal(next.job.id, job.id);
  assert.equal((await call(`/api/device/jobs/${job.id}/result`, 'POST', { ok: true, output: '/tmp' }, paired.deviceToken, paired.deviceId)).status, 200);
  const ownerResult = await (await call(`/api/jobs/${job.id}`)).json(); assert.equal(ownerResult.data.status, 'completed'); assert.equal(ownerResult.data.output, '/tmp');
});
test('arbitrary shell strings are rejected', async t => { const { call } = await setup(t); const p = await (await call('/api/pair-codes', 'POST', {})).json(); const d = await (await call('/api/devices/pair', 'POST', { code: p.code }, null)).json(); const r = await call('/api/jobs', 'POST', { deviceId: d.deviceId, taskId: 'echo hello; rm -rf /' }); assert.equal(r.status, 422); });
test('device token cannot access owner endpoints', async t => { const { call } = await setup(t); const p = await (await call('/api/pair-codes', 'POST', {})).json(); const d = await (await call('/api/devices/pair', 'POST', { code: p.code }, null)).json(); const r = await call('/api/devices', 'GET', null, d.deviceToken, d.deviceId); assert.equal(r.status, 401); });
test('revoked device loses access', async t => { const { call } = await setup(t); const p = await (await call('/api/pair-codes', 'POST', {})).json(); const d = await (await call('/api/devices/pair', 'POST', { code: p.code }, null)).json(); assert.equal((await call(`/api/devices/${d.deviceId}/revoke`, 'POST', {})).status, 200); assert.equal((await call('/api/device/jobs/next', 'GET', null, d.deviceToken, d.deviceId)).status, 401); });
