/** MomentCheck: one authoritative GAS project, Sheet storage, server-verified teacher code.
 * Public entry points are doGet and api only. All helpers are bridge-private.
 */
var MC_CONFIG = {
  spreadsheetId: '1CjMrPQTPRJry-UijJDhsn2SifqSGJk02IjjUrFecEeA',
  exportFolderId: '1qXathtGUhJyxQzuf_zYLcaUWuTXIiZUD',
  durationMs: 180000, rosterSize: 30, classroom: 'ม.4/1'
};
var MC_TABS = {sessions:'MC_Sessions',students:'MC_Students',submissions:'MC_Submissions',config:'MC_Config',audit:'MC_Audit'};

/** One-time owner run in the Apps Script editor to grant Google's OAuth consent. */
function setup() {
  var active=String(Session.getActiveUser().getEmail()||'');
  var effective=String(Session.getEffectiveUser().getEmail()||'');
  if(!active||active!==effective)throw new Error('SETUP_OWNER_ONLY');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{ensure_(book_());DriveApp.getFolderById(MC_CONFIG.exportFolderId).getName();Logger.log('MomentCheck setup complete.');}
  finally{lock.releaseLock();}
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('MomentCheck | แบบทดสอบโมเมนต์')
    .addMetaTag('viewport','width=device-width,initial-scale=1');
}

function api(request) {
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request)) fail_('INVALID_REQUEST');
    var action=String(request.action||''), data=request.data||{};
    if (JSON.stringify(data).length>24000) fail_('INVALID_REQUEST');
    var publicActions=['status','join','snapshot','submit','login'];
    var teacherActions=['dashboard','start','close','review','archive','paper','resetSeat','newSession','export','logout'];
    if (publicActions.indexOf(action)<0 && teacherActions.indexOf(action)<0) fail_('INVALID_REQUEST');
    if (teacherActions.indexOf(action)>=0) requireTeacher_(request.teacherToken);
    var value;
    if (action==='login') value=login_(data);
    else if (action==='logout') {CacheService.getScriptCache().remove('teacher:'+digest_(request.teacherToken));value={loggedOut:true};}
    else if (action==='status') value=publicStatus_();
    else if (action==='snapshot') value=snapshot_(data);
    else if (action==='dashboard') value=dashboard_();
    else value=writeAction_(action,data);
    return {ok:true,data:value};
  } catch(error) {
    var code=String(error&&error.message||'');
    var known=['INVALID_REQUEST','INVALID_STUDENT','INVALID_ROOM','SEAT_TAKEN','CLAIM_INVALID','SESSION_CHANGED','NOT_OPEN','NOT_LIVE','DEADLINE_PASSED','INVALID_ANSWERS','SUBMISSION_CONFLICT','CONTENT_PENDING','ALREADY_STARTED','BAD_STATE','INVALID_PAPER','TEACHER_DENIED','TEACHER_EXPIRED','TOO_MANY_ATTEMPTS','BUSY','NOT_CONFIGURED','STORAGE_UNCONFIRMED'];
    return {ok:false,code:known.indexOf(code)>=0?code:'SERVICE_UNAVAILABLE'};
  }
}

function fail_(code){throw new Error(code);}
function digest_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function random_(){return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function equal_(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;var result=0;for(var i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);return result===0;}

function login_(data){
  if(typeof data.code!=='string'||data.code.length<6||data.code.length>200)fail_('TEACHER_DENIED');
  var device=String(data.deviceId||'');if(!/^[a-zA-Z0-9_-]{16,100}$/.test(device))fail_('INVALID_REQUEST');
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))fail_('BUSY');
  try {
    var cache=CacheService.getScriptCache(),now=Date.now(),key='login:'+digest_(device),globalKey='login:all';
    var attempt=JSON.parse(cache.get(key)||'{"count":0,"until":0}');
    var global=JSON.parse(cache.get(globalKey)||'{"count":0,"until":0}');
    if(attempt.until<now)attempt={count:0,until:now+300000};
    if(global.until<now)global={count:0,until:now+60000};
    if(attempt.count>=5||global.count>=60)fail_('TOO_MANY_ATTEMPTS');
    if(typeof MC_SECRET_SALT==='undefined'||typeof MC_SECRET_HASH==='undefined')fail_('NOT_CONFIGURED');
    if(!equal_(digest_(MC_SECRET_SALT+data.code),MC_SECRET_HASH)){
      attempt.count++;global.count++;cache.put(key,JSON.stringify(attempt),300);cache.put(globalKey,JSON.stringify(global),60);fail_('TEACHER_DENIED');
    }
    cache.remove(key);var token=random_(),expiresAt=now+21600000;
    cache.put('teacher:'+digest_(token),JSON.stringify({expiresAt:expiresAt}),21600);
    return {teacherToken:token,expiresAt:expiresAt};
  } finally {lock.releaseLock();}
}
function requireTeacher_(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail_('TEACHER_EXPIRED');
  var raw=CacheService.getScriptCache().get('teacher:'+digest_(token));
  if(!raw||JSON.parse(raw).expiresAt<=Date.now())fail_('TEACHER_EXPIRED');
}

function book_(){return SpreadsheetApp.openById(MC_CONFIG.spreadsheetId);}
function table_(book,kind){return book.getSheetByName(MC_TABS[kind]);}
function rows_(book,kind){var sheet=table_(book,kind);if(!sheet||sheet.getLastRow()<2)return [];return sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues().filter(function(r){return r[0]&&r[1];}).map(function(r){return {key:String(r[0]),value:JSON.parse(r[1])};});}
function find_(book,kind,key){var all=rows_(book,kind);for(var i=0;i<all.length;i++)if(all[i].key===key)return all[i].value;return null;}
function put_(book,kind,key,value){
  var sheet=table_(book,kind),last=sheet.getLastRow(),row=0;
  if(last>1){var keys=sheet.getRange(2,1,last-1,1).getValues();for(var i=0;i<keys.length;i++)if(String(keys[i][0])===key){row=i+2;break;}}
  var target=row||last+1;
  if(target>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),500);
  sheet.getRange(target,1,1,2).setValues([[key,JSON.stringify(value)]]);
}
function appendAudit_(book,sessionId,action){var entry={id:Utilities.getUuid(),sessionId:sessionId,action:action,serverAt:new Date().toISOString()};put_(book,'audit',entry.id,entry);}
function contentReady_(){return MC_CONTENT.questions.length===3&&['Q0-01','Q0-02','Q0-03'].every(function(id){var q=MC_CONTENT.questions.filter(function(q){return q.question_id===id;})[0];return q&&typeof q.stem==='string'&&q.stem&&q.choices.length===4&&new Set(q.choices.map(function(c){return c.choice_id;})).size===4;});}
function state_(s,now){return s.state==='LIVE'&&now>=s.deadlineAt?'CLOSED':s.state;}
function active_(book){var config=find_(book,'config','activeSession');return config?find_(book,'sessions',config.sessionId):null;}
function newSession_(book){
  var s={sessionId:Utilities.getUuid(),sessionCode:String(Math.floor(100000+parseInt(Utilities.getUuid().replace(/-/g,'').slice(0,8),16)/4294967296*900000)),classroom:MC_CONFIG.classroom,rosterSize:30,state:'LOBBY',contentVersion:MC_CONTENT.version,openedAt:Date.now(),startAt:null,deadlineAt:null,closedAt:null,reviewAt:null,archivedAt:null,paperFallbackCount:0,paperStudentNos:[]};
  put_(book,'sessions',s.sessionId,s);put_(book,'config','activeSession',{sessionId:s.sessionId});appendAudit_(book,s.sessionId,'CREATE_SESSION');SpreadsheetApp.flush();return s;
}
function ensure_(book){
  Object.keys(MC_TABS).forEach(function(kind){var sheet=table_(book,kind);if(!sheet){sheet=book.insertSheet(MC_TABS[kind]);sheet.getRange(1,1,1,2).setValues([['recordId','recordJson']]);sheet.setFrozenRows(1);sheet.getRange(1,1,1,2).setBackground('#164d42').setFontColor('#ffffff').setFontWeight('bold');sheet.setColumnWidth(1,310);sheet.setColumnWidth(2,800);}});
  SpreadsheetApp.flush();return active_(book)||newSession_(book);
}
function safeSession_(s){return {sessionId:s.sessionId,sessionCode:s.sessionCode,classroom:s.classroom,rosterSize:30,state:state_(s,Date.now()),contentVersion:s.contentVersion,serverNow:Date.now(),startAt:s.startAt,deadlineAt:s.deadlineAt,contentReady:contentReady_()};}
function publicStatus_(){
  var book=book_(),s=active_(book);
  if(!s){var lock=LockService.getScriptLock();if(!lock.tryLock(10000))fail_('BUSY');try{s=ensure_(book);}finally{lock.releaseLock();}}
  return safeSession_(s);
}
function studentKey_(sessionId,no){return sessionId+':'+no;}
function validateNo_(no){if(!Number.isInteger(no)||no<1||no>30)fail_('INVALID_STUDENT');}
function claim_(book,data){
  validateNo_(data.studentNo);if(typeof data.sessionId!=='string'||typeof data.claimToken!=='string'||!/^[a-f0-9]{64}$/.test(data.claimToken))fail_('CLAIM_INVALID');
  var student=find_(book,'students',studentKey_(data.sessionId,data.studentNo));
  if(!student||!equal_(student.claimHash,digest_(data.claimToken)))fail_('CLAIM_INVALID');return student;
}
function studentSnapshot_(book,s,student){
  var result=safeSession_(s),response=find_(book,'submissions',studentKey_(s.sessionId,student.studentNo));
  result.studentNo=student.studentNo;result.studentName=student.studentName;
  if(response){result.receipt={submissionId:response.submissionId,submittedAtServer:response.submittedAtServer,sessionId:response.sessionId};return result;}
  if(result.state==='LIVE'&&contentReady_())result.questions=MC_CONTENT.questions.map(function(q){return {question_id:q.question_id,stem:q.stem,choices:student.orders[q.question_id].map(function(id){var c=q.choices.filter(function(c){return c.choice_id===id;})[0];return {choice_id:c.choice_id,text:c.text};})};});
  return result;
}
function snapshot_(data){var book=book_(),current=active_(book);if(!current||current.sessionId!==data.sessionId)fail_('SESSION_CHANGED');var student=claim_(book,data),s=current;return studentSnapshot_(book,s,student);}
function orders_(){var orders={};MC_CONTENT.questions.forEach(function(q){var choices=q.choices.map(function(c){return {id:c.choice_id,seed:Utilities.getUuid()};});choices.sort(function(a,b){return a.seed<b.seed?-1:a.seed>b.seed?1:0;});orders[q.question_id]=choices.map(function(c){return c.id;});});return orders;}
function writeAction_(action,data){
  var lock=LockService.getScriptLock();if(!lock.tryLock(20000))fail_('BUSY');
  try {
    var book=book_(),s=ensure_(book),now=Date.now(),p=state_(s,now),value;
    if(action==='join'){
      validateNo_(data.studentNo);if(String(data.sessionCode)!==s.sessionCode)fail_('INVALID_ROOM');
      if(p!=='LOBBY'&&p!=='LIVE')fail_('NOT_OPEN');
      if(typeof data.studentName!=='string'||!data.studentName.trim()||data.studentName.length>120||data.classroom!==s.classroom)fail_('INVALID_STUDENT');
      var key=studentKey_(s.sessionId,data.studentNo),student=find_(book,'students',key),token=data.claimToken;
      if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail_('CLAIM_INVALID');
      if(student&&student.reset)student=null;
      if(student&&!equal_(student.claimHash,digest_(token)))fail_('SEAT_TAKEN');
      if(!student){student={sessionId:s.sessionId,studentNo:data.studentNo,studentName:data.studentName.trim(),classroom:data.classroom,claimHash:digest_(token),joinedAt:now,orders:orders_()};put_(book,'students',key,student);SpreadsheetApp.flush();var saved=find_(book,'students',key);if(!saved||saved.claimHash!==student.claimHash)fail_('STORAGE_UNCONFIRMED');appendAudit_(book,s.sessionId,'STUDENT_JOIN');}
      return studentSnapshot_(book,s,student);
    }
    if(action==='submit'){
      var claimant=claim_(book,data),session=find_(book,'sessions',data.sessionId);if(!session)fail_('SESSION_CHANGED');
      var submissionKey=String(data.submissionKey||'');if(!/^[a-zA-Z0-9_-]{16,100}$/.test(submissionKey))fail_('INVALID_REQUEST');
      var existing=find_(book,'submissions',studentKey_(data.sessionId,data.studentNo));
      var ids=['Q0-01','Q0-02','Q0-03'];
      if(existing){if(existing.claimHash===claimant.claimHash&&existing.submissionKey===submissionKey&&data.answers&&Object.keys(data.answers).length===3&&ids.every(function(id){return existing.answers[id]===data.answers[id];}))return {accepted:true,submissionId:existing.submissionId,submittedAtServer:existing.submittedAtServer,sessionId:existing.sessionId};fail_('SUBMISSION_CONFLICT');}
      now=Date.now();if(state_(session,now)!=='LIVE')fail_('NOT_LIVE');if(now>=session.deadlineAt)fail_('DEADLINE_PASSED');
      if(!contentReady_()||session.contentVersion!==MC_CONTENT.version)fail_('CONTENT_PENDING');
      if(!data.answers||typeof data.answers!=='object'||Array.isArray(data.answers)||Object.keys(data.answers).length!==3||!MC_CONTENT.questions.every(function(q){return q.choices.some(function(c){return c.choice_id===data.answers[q.question_id];});}))fail_('INVALID_ANSWERS');
      var response={sessionId:session.sessionId,studentNo:data.studentNo,claimHash:claimant.claimHash,submissionKey:submissionKey,answers:ids.reduce(function(o,id){o[id]=data.answers[id];return o;},{}),submissionId:Utilities.getUuid(),submittedAtServer:now,contentVersion:session.contentVersion};
      var responseKey=studentKey_(session.sessionId,data.studentNo);put_(book,'submissions',responseKey,response);SpreadsheetApp.flush();
      var confirmed=find_(book,'submissions',responseKey);if(!confirmed||confirmed.submissionId!==response.submissionId)fail_('STORAGE_UNCONFIRMED');
      return {accepted:true,submissionId:confirmed.submissionId,submittedAtServer:confirmed.submittedAtServer,sessionId:confirmed.sessionId};
    }
    if(action==='newSession'){if(p==='LIVE')fail_('BAD_STATE');return safeSession_(newSession_(book));}
    if(action==='start'){
      if(s.state!=='LOBBY'||s.startAt)fail_('ALREADY_STARTED');if(!contentReady_())fail_('CONTENT_PENDING');
      rows_(book,'students').filter(function(r){return r.value.sessionId===s.sessionId;}).forEach(function(r){if(Object.keys(r.value.orders).length!==3){r.value.orders=orders_();put_(book,'students',r.key,r.value);}});
      now=Date.now();s.state='LIVE';s.startAt=now;s.deadlineAt=now+180000;
    }else if(action==='close'){if(p!=='LIVE'&&p!=='CLOSED')fail_('BAD_STATE');s.state='CLOSED';s.closedAt=now>=s.deadlineAt?s.deadlineAt:now;}
    else if(action==='review'){if(p!=='CLOSED')fail_('BAD_STATE');s.state='REVIEW';s.closedAt=s.closedAt||s.deadlineAt;s.reviewAt=now;}
    else if(action==='archive'){if(s.state!=='REVIEW'&&p!=='CLOSED')fail_('BAD_STATE');s.state='ARCHIVED';s.archivedAt=now;}
    else if(action==='paper'){
      if(!Number.isInteger(data.count)||data.count<0||data.count>30||!Array.isArray(data.studentNos)||data.studentNos.length>data.count||new Set(data.studentNos).size!==data.studentNos.length||data.studentNos.some(function(no){return !Number.isInteger(no)||no<1||no>30;}))fail_('INVALID_PAPER');
      s.paperFallbackCount=data.count;s.paperStudentNos=data.studentNos;
    }else if(action==='resetSeat'){
      validateNo_(data.studentNo);var resetKey=studentKey_(s.sessionId,data.studentNo);if(find_(book,'submissions',resetKey))fail_('SUBMISSION_CONFLICT');
      var old=find_(book,'students',resetKey);if(old){old.claimHash=digest_(random_());old.reset=true;old.resetAt=now;put_(book,'students',resetKey,old);}appendAudit_(book,s.sessionId,'RESET_SEAT');SpreadsheetApp.flush();return {reset:true};
    }else if(action==='export')return export_(book,s);
    else fail_('INVALID_REQUEST');
    put_(book,'sessions',s.sessionId,s);appendAudit_(book,s.sessionId,action.toUpperCase());SpreadsheetApp.flush();return safeSession_(s);
  } finally {lock.releaseLock();}
}
function dashboardData_(book,s){
  var students=rows_(book,'students').map(function(r){return r.value;}).filter(function(r){return r.sessionId===s.sessionId&&!r.reset;});
  var responses=rows_(book,'submissions').map(function(r){return r.value;}).filter(function(r){return r.sessionId===s.sessionId;});
  var items=MC_CONTENT.questions.map(function(q){var counts={};q.choices.forEach(function(c){counts[c.choice_id]=0;});responses.forEach(function(r){if(Object.prototype.hasOwnProperty.call(counts,r.answers[q.question_id]))counts[r.answers[q.question_id]]++;});return {question_id:q.question_id,stem:q.stem,choices:q.choices.map(function(c){return {choice_id:c.choice_id,text:c.text,count:counts[c.choice_id],percentage:responses.length?counts[c.choice_id]/responses.length*100:0,misconception_tag:c.misconception_tag||null};})};});
  return {session:safeSession_(s),readyCount:students.length,submittedCount:responses.length,paperFallbackCount:s.paperFallbackCount,paperStudentNos:s.paperStudentNos,overlapStudentNos:s.paperStudentNos.filter(function(no){return responses.some(function(r){return r.studentNo===no;});}),students:students.map(function(c){var r=responses.filter(function(r){return r.studentNo===c.studentNo;})[0];return {studentNo:c.studentNo,studentName:c.studentName,classroom:c.classroom,joinedAt:c.joinedAt,submittedAt:r?r.submittedAtServer:null,submissionId:r?r.submissionId:null};}),items:items,answerKey:state_(s,Date.now())==='REVIEW'?MC_CONTENT.questions.map(function(q){return {question_id:q.question_id,correct_choice_id:q.correct_choice_id||null,explanation:q.explanation||''};}):[]};
}
function dashboard_(){var book=book_(),s=active_(book);if(!s){var lock=LockService.getScriptLock();if(!lock.tryLock(10000))fail_('BUSY');try{s=ensure_(book);}finally{lock.releaseLock();}}return dashboardData_(book,s);}
function export_(book,s){
  var dashboard=dashboardData_(book,s),responses=rows_(book,'submissions').map(function(r){return r.value;}).filter(function(r){return r.sessionId===s.sessionId;});
  var data={schemaVersion:'MOMENTCHECK_RESULT_1',session_id:s.sessionId,contentVersion:s.contentVersion,generatedAt:new Date().toISOString(),timestamps:{openedAt:s.openedAt,startAt:s.startAt,deadlineAt:s.deadlineAt,closedAt:s.closedAt,reviewAt:s.reviewAt,archivedAt:s.archivedAt},nDigital:responses.length,nPaper:s.paperFallbackCount,paperStudentNos:s.paperStudentNos,items:dashboard.items.flatMap(function(q){return q.choices.map(function(c){return {question_id:q.question_id,canonical_choice_id:c.choice_id,count:c.count,percentage:c.percentage,misconception_tag:c.misconception_tag};});}),responses:responses.map(function(r){return {studentNo:r.studentNo,answers:r.answers,submissionId:r.submissionId,submittedAtServer:r.submittedAtServer};})};
  var folder=DriveApp.getFolderById(MC_CONFIG.exportFolderId),file=folder.createFile('MomentCheck-'+s.sessionCode+'-'+Date.now()+'.json',JSON.stringify(data,null,2),MimeType.PLAIN_TEXT);
  appendAudit_(book,s.sessionId,'EXPORT');SpreadsheetApp.flush();return {url:file.getUrl(),fileName:file.getName(),nDigital:responses.length,nPaper:s.paperFallbackCount};
}
