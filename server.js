'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
const OWNER_TOKEN = process.env.TERMINAL_AI_OWNER_TOKEN || '';
const STORE_PATH = process.env.TERMINAL_AI_STORE || path.join(__dirname, 'data', 'store.json');
const PAIR_TTL_MS = 5 * 60 * 1000;
const MAX_OUTPUT = 16000;
const ALLOWED_TASKS = new Set(['system_info', 'list_files', 'working_directory', 'git_status']);
function sha(v) { return crypto.createHash('sha256').update(v).digest('hex'); }
function safeEqual(a,b) { const x=Buffer.from(String(a)), y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function randomToken(n=32) { return crypto.randomBytes(n).toString('base64url'); }
function emptyStore() { return {pairCodes:{},devices:{},jobs:{},audit:[]}; }
function loadStore(file) { try { return {...emptyStore(),...JSON.parse(fs.readFileSync(file,'utf8'))}; } catch(e) { if(e.code!=='ENOENT') throw e; return emptyStore(); } }
function saveStore(file,s) { fs.mkdirSync(path.dirname(file),{recursive:true}); const tmp=`${file}.${process.pid}.tmp`; fs.writeFileSync(tmp,JSON.stringify(s,null,2),{mode:0o600}); fs.renameSync(tmp,file); }
function createServer(opts={}) {
 const ownerToken=opts.ownerToken??OWNER_TOKEN, file=opts.storePath??STORE_PATH, store=opts.store??loadStore(file);
 const persist=()=>saveStore(file,store); const audit=(event,detail={})=>{store.audit.push({at:new Date().toISOString(),event,...detail});if(store.audit.length>1000)store.audit.shift();};
 async function handler(req,res) {
  res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json; charset=utf-8');
  const send=(status,obj)=>{res.statusCode=status;res.end(JSON.stringify(obj));};
  let body={}; try { if(['POST','PUT','PATCH'].includes(req.method)){let raw='';for await(const c of req){raw+=c;if(raw.length>32768)throw Error('large');}body=raw?JSON.parse(raw):{};} } catch { return send(400,{error:{code:'BAD_REQUEST',message:'Invalid request'}}); }
  const url=new URL(req.url,'http://localhost'), p=url.pathname;
  const auth=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const isOwner=()=>Boolean(ownerToken)&&safeEqual(auth,ownerToken);
  const deviceId=req.headers['x-device-id']; const d=store.devices[deviceId];
  const isDevice=()=>Boolean(d&&!d.revoked&&safeEqual(d.tokenHash,sha(auth)));
  if(req.method==='GET'&&p==='/health')return send(200,{ok:true,service:'terminal-ai-relay',version:'2.0.0'});
  if(req.method==='POST'&&p==='/api/devices/pair'){
   const code=String(body.code||''), key=sha(code), entry=store.pairCodes[key]; if(!entry||entry.expiresAt<Date.now())return send(401,{error:{code:'PAIR_CODE_INVALID',message:'Pair code invalid or expired'}});
   delete store.pairCodes[key]; const id=randomToken(12),token=randomToken();store.devices[id]={label:entry.label,tokenHash:sha(token),createdAt:new Date().toISOString(),revoked:false};audit('device_paired',{deviceId:id});persist();return send(201,{deviceId:id,deviceToken:token,message:'Store this token securely; it will not be shown again.'});
  }
  if(p.startsWith('/api/device/')){
   if(!isDevice())return send(401,{error:{code:'DEVICE_UNAUTHORIZED',message:'Valid device token required'}});
   if(req.method==='GET'&&p==='/api/device/jobs/next') {const job=Object.values(store.jobs).find(j=>j.deviceId===deviceId&&j.status==='queued');if(!job)return send(200,{job:null});job.status='running';job.startedAt=new Date().toISOString();persist();return send(200,{job:{id:job.id,taskId:job.taskId,args:job.args}});}
   const m=p.match(/^\/api\/device\/jobs\/([^/]+)\/result$/);if(req.method==='POST'&&m){const job=store.jobs[m[1]];if(!job||job.deviceId!==deviceId||job.status!=='running')return send(404,{error:{code:'JOB_NOT_FOUND',message:'Assigned running job not found'}});job.output=String(body.output||'').slice(0,MAX_OUTPUT);job.status=body.ok===false?'failed':'completed';job.finishedAt=new Date().toISOString();audit('job_finished',{jobId:job.id,status:job.status});persist();return send(200,{ok:true,status:job.status});}
   return send(404,{error:{code:'NOT_FOUND',message:'Route not found'}});
  }
  if(p.startsWith('/api/')&&!isOwner())return send(401,{error:{code:'UNAUTHORIZED',message:'Owner authentication required'}});
  if(req.method==='POST'&&p==='/api/pair-codes'){const code=randomToken(6).toUpperCase();store.pairCodes[sha(code)]={expiresAt:Date.now()+PAIR_TTL_MS,label:String(body.label||'My device').slice(0,60)};audit('pair_code_created');persist();return send(201,{code,expiresInSeconds:PAIR_TTL_MS/1000});}
  if(req.method==='GET'&&p==='/api/devices')return send(200,{data:Object.entries(store.devices).map(([id,x])=>({id,label:x.label,createdAt:x.createdAt,revoked:x.revoked}))});
  let m=p.match(/^\/api\/devices\/([^/]+)\/revoke$/);if(req.method==='POST'&&m){const x=store.devices[m[1]];if(!x)return send(404,{error:{code:'NOT_FOUND',message:'Device not found'}});x.revoked=true;audit('device_revoked',{deviceId:m[1]});persist();return send(200,{ok:true});}
  if(req.method==='POST'&&p==='/api/jobs'){const {deviceId:target,taskId}=body;if(!store.devices[target]||store.devices[target].revoked)return send(404,{error:{code:'DEVICE_NOT_FOUND',message:'Active device not found'}});if(!ALLOWED_TASKS.has(taskId))return send(422,{error:{code:'TASK_NOT_ALLOWED',message:'Only predefined task IDs are accepted'}});const id=randomToken(12);store.jobs[id]={id,deviceId:target,taskId,args:{},status:'queued',createdAt:new Date().toISOString(),output:null};audit('job_queued',{jobId:id,deviceId:target,taskId});persist();return send(202,{id,status:'queued'});}
  m=p.match(/^\/api\/jobs\/([^/]+)$/);if(req.method==='GET'&&m){const job=store.jobs[m[1]];return job?send(200,{data:job}):send(404,{error:{code:'NOT_FOUND',message:'Job not found'}});}
  if(req.method==='POST'&&p==='/api/ai/interpret'){const text=String(body.text||'').toLowerCase();let taskId=null;if(/whoami|system info|ข้อมูลระบบ|สเปกเครื่อง/.test(text))taskId='system_info';else if(/list files|show files|ดูไฟล์|แสดงไฟล์/.test(text))taskId='list_files';else if(/where am i|pwd|โฟลเดอร์ปัจจุบัน|อยู่โฟลเดอร์ไหน/.test(text))taskId='working_directory';else if(/git status|สถานะ git/.test(text))taskId='git_status';return taskId?send(200,{taskId,requiresApproval:true,explanation:`แปลงคำขอเป็นงาน ${taskId}; ต้องเลือกอุปกรณ์และยืนยันก่อนส่ง`}):send(422,{error:{code:'INTENT_NOT_SUPPORTED',message:'คำขอนี้ยังไม่มี task ที่อนุญาตให้รัน'}});}
  return send(404,{error:{code:'NOT_FOUND',message:'Route not found'}});
 }
 return http.createServer((req,res)=>handler(req,res).catch(()=>{if(!res.headersSent){res.statusCode=500;res.end(JSON.stringify({error:{code:'INTERNAL_ERROR',message:'Internal server error'}}));}}));
}
if(require.main===module){if(!OWNER_TOKEN){console.error('Set TERMINAL_AI_OWNER_TOKEN before starting.');process.exit(1);}createServer().listen(PORT,'0.0.0.0',()=>console.log(`Terminal AI relay listening on :${PORT}`));}
module.exports={createServer,ALLOWED_TASKS};
