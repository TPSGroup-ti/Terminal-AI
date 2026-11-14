'use strict';
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const BASE_URL = process.env.TERMINAL_AI_URL;
const DEVICE_ID = process.env.TERMINAL_AI_DEVICE_ID;
const DEVICE_TOKEN = process.env.TERMINAL_AI_DEVICE_TOKEN;
const INTERVAL_MS = Math.max(1000, Number(process.env.POLL_INTERVAL_MS || 3000));
const MAX_RUNTIME_MS = 10000;
const MAX_OUTPUT = 16000;
const COMMANDS = {
  system_info: () => ({ file: process.execPath, args: ['-e', "console.log(JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,cpus:require('os').cpus().length,totalmem:require('os').totalmem(),freemem:require('os').freemem()}))"] }),
  list_files: () => process.platform === 'win32' ? ({ file: 'cmd.exe', args: ['/d', '/s', '/c', 'dir /a'] }) : ({ file: 'ls', args: ['-la'] }),
  working_directory: () => process.platform === 'win32' ? ({ file: 'cmd.exe', args: ['/d', '/s', '/c', 'cd'] }) : ({ file: 'pwd', args: [] }),
  git_status: () => ({ file: 'git', args: ['status', '--short', '--branch'] })
};
function runTask(taskId) {
  const make = COMMANDS[taskId]; if (!make) return Promise.resolve({ ok: false, output: 'Task not allowed' });
  const { file, args } = make();
  return new Promise(resolve => {
    const child = spawn(file, args, { cwd: process.cwd(), shell: false, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    let output = ''; let settled = false;
    const finish = result => { if (!settled) { settled = true; resolve(result); } };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish({ ok: false, output: (output + '\nTimed out').slice(0, MAX_OUTPUT) }); }, MAX_RUNTIME_MS);
    child.stdout.on('data', b => { output = (output + b.toString()).slice(0, MAX_OUTPUT); });
    child.stderr.on('data', b => { output = (output + b.toString()).slice(0, MAX_OUTPUT); });
    child.on('error', e => { clearTimeout(timer); finish({ ok: false, output: e.message.slice(0, MAX_OUTPUT) }); });
    child.on('close', code => { clearTimeout(timer); finish({ ok: code === 0, output: (output || `(exit ${code})`).slice(0, MAX_OUTPUT) }); });
  });
}
async function request(route, method = 'GET', body) {
  const response = await fetch(new URL(route, BASE_URL), { method, headers: { Authorization: `Bearer ${DEVICE_TOKEN}`, 'X-Device-Id': DEVICE_ID, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`Relay HTTP ${response.status}`);
  return response.json();
}
async function main() {
  if (!BASE_URL || !DEVICE_ID || !DEVICE_TOKEN) throw new Error('Set TERMINAL_AI_URL, TERMINAL_AI_DEVICE_ID and TERMINAL_AI_DEVICE_TOKEN');
  console.log(`Terminal AI local agent online: ${os.platform()} ${os.arch()} at ${process.cwd()}`);
  while (true) {
    try {
      const { job } = await request('/api/device/jobs/next');
      if (job) {
        console.log(`Running approved task: ${job.taskId}`);
        const result = await runTask(job.taskId);
        await request(`/api/device/jobs/${encodeURIComponent(job.id)}/result`, 'POST', result);
      }
    } catch (e) { console.error(`Relay error: ${e.message}`); }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { runTask };
