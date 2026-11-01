/** Local room-isolation regression checks. Storage is mocked; no school writes. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../',import.meta.url));
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const ROOMS=[['ม.4/1',30],['ม.4/3',30],['ม.4/4',39],['ม.4/5',39]];
function app(){
  let time=1793520000000;
  const tables=Object.fromEntries(['sessions','students','submissions','config','audit'].map(k=>[k,new Map()]));
  const cache=new Map(),book={};
  class ServerDate extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  const c=vm.createContext({Date:ServerDate,Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,text)=>Array.from(createHash('sha256').update(String(text)).digest(),n=>n>127?n-256:n)},SpreadsheetApp:{flush(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})}});
  vm.runInContext(readFileSync(root+'apps-script/Content.gs','utf8')+'\n'+readFileSync(root+'apps-script/Code.gs','utf8'),c);
  c.book_=()=>book;c.table_=()=>({});
  c.rows_=(_b,kind)=>[...tables[kind]].map(([key,value])=>({key,value:clone(value)}));
  c.find_=(_b,kind,key)=>clone(tables[kind].get(key)||null);
  c.put_=(_b,kind,key,value)=>tables[kind].set(key,clone(value));
  const teacherToken='f'.repeat(64);cache.set('teacher:'+c.digest_(teacherToken),JSON.stringify({expiresAt:time+86400000}));
  const call=(action,data={},teacher=false)=>clone(c.api({action,data,teacherToken:teacher?teacherToken:undefined}));
  const ok=(action,data={},teacher=false)=>{const r=call(action,data,teacher);assert.equal(r.ok,true,JSON.stringify(r));return r.data;};
  const join=(classroom,no)=>{const s=ok('status',{classroom});const claimToken=createHash('sha256').update(classroom+':'+no).digest('hex');const data={classroom,studentNo:no,studentName:'LOCAL FIXTURE',sessionCode:s.sessionCode,sessionId:s.sessionId,claimToken};ok('join',data);return data;};
  return {c,tables,call,ok,join,advance:n=>{time+=n;}};
}
test('four independent sessions expose exactly the specified class sizes',()=>{
  const a=app(),ids=[];for(const [classroom,rosterSize] of ROOMS){const s=a.ok('status',{classroom});assert.equal(s.classroom,classroom);assert.equal(s.rosterSize,rosterSize);assert.equal(s.classrooms.length,4);ids.push(s.sessionId);}
  assert.equal(new Set(ids).size,4);
  assert.equal(a.call('status',{classroom:'ม.4/2'}).code,'INVALID_ROOM');
});
test('server enforces 30/39 boundaries and allows the same seat number in different rooms',()=>{
  const a=app();for(const [room,max] of ROOMS){a.join(room,1);a.join(room,max);const s=a.ok('status',{classroom:room});assert.equal(a.call('join',{classroom:room,studentNo:max+1,studentName:'LOCAL',sessionCode:s.sessionCode,claimToken:'a'.repeat(64)}).code,'INVALID_STUDENT');assert.equal(a.ok('dashboard',{classroom:room},true).readyCount,2);}
});
test('start, answers, receipts and histograms remain scoped to each classroom',()=>{
  const a=app(),left=a.join('ม.4/1',1),right=a.join('ม.4/4',1);
  const started=a.ok('start',{classroom:'ม.4/1'},true);
  assert.equal(a.ok('status',{classroom:'ม.4/4'}).state,'LOBBY');
  a.advance(1000);const other=a.ok('start',{classroom:'ม.4/4'},true);assert.equal(other.deadlineAt-started.deadlineAt,1000);
  const answers=Object.fromEntries(a.c.MC_CONTENT.questions.map(q=>[q.question_id,q.choices[0].choice_id]));
  assert.equal(a.call('submit',{...left,classroom:'ม.4/4',submissionKey:'left-submission-key',answers}).code,'INVALID_ROOM');
  const receipt=a.ok('submit',{...left,submissionKey:'left-submission-key',answers});
  assert.equal(a.ok('dashboard',{classroom:'ม.4/1'},true).submittedCount,1);
  assert.equal(a.ok('dashboard',{classroom:'ม.4/4'},true).submittedCount,0);
  a.ok('submit',{...right,submissionKey:'right-submission-key',answers});
  for(const room of ['ม.4/1','ม.4/4']){const d=a.ok('dashboard',{classroom:room},true);assert.equal(d.submittedCount,1);for(const q of d.items)assert.equal(q.choices.reduce((n,c)=>n+c.count,0),1);}
  a.ok('close',{classroom:'ม.4/1'},true);
  assert.equal(a.ok('status',{classroom:'ม.4/4'}).state,'LIVE');
  assert.equal(a.ok('submit',{...left,submissionKey:'left-submission-key',answers}).submissionId,receipt.submissionId);
});
test('paper counts and new rounds affect only the selected classroom',()=>{
  const a=app(),left=a.join('ม.4/1',1),right=a.join('ม.4/4',39);
  a.ok('paper',{classroom:'ม.4/4',count:39,studentNos:[39]},true);
  assert.equal(a.ok('dashboard',{classroom:'ม.4/1'},true).paperFallbackCount,0);
  assert.equal(a.call('paper',{classroom:'ม.4/1',count:31,studentNos:[]},true).code,'INVALID_PAPER');
  const next=a.ok('newSession',{classroom:'ม.4/4'},true);assert.notEqual(next.sessionId,right.sessionId);
  assert.equal(a.ok('status',{classroom:'ม.4/1'}).sessionId,left.sessionId);
  assert.equal(a.ok('dashboard',{classroom:'ม.4/4'},true).paperFallbackCount,0);
});
test('upgrade retains the original 4/1 session and its existing claim',()=>{
  const a=app(),existing=a.join('ม.4/1',1);
  a.tables.config.delete('activeSession:ม.4/1');a.tables.config.set('activeSession',{sessionId:existing.sessionId});
  assert.equal(a.ok('status',{classroom:'ม.4/1'}).sessionId,existing.sessionId);
  assert.equal(a.ok('snapshot',existing).studentNo,1);
  assert.notEqual(a.ok('status',{classroom:'ม.4/5'}).sessionId,existing.sessionId);
});
