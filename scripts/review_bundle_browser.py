"""Inspect rendered Code.gs HTML locally with a mocked bridge; no cloud calls."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'.private/render-review'

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*_):
        pass

def main():
    contract=json.loads((ROOT/'KH3_DOCUMENTS_V9_3Q_3MIN/documents/Q0_CONTENT_CONTRACT_V9_3Q_3MIN_DRAFT.json').read_text(encoding='utf-8'))
    questions=[{'question_id':q['question_id'],'stem':q['prompt'],'choices':[{'choice_id':c['choice_id'],'text':c['text']} for c in q['choices']]} for q in contract['questions']]
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ARTIFACTS)))
    Thread(target=server.serve_forever,daemon=True).start()
    reports=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch()
            for width,height in [(1440,1000),(390,844),(320,740)]:
                page=browser.new_page(viewport={'width':width,'height':height})
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                rooms=[{'classroom':'ม.4/1','rosterSize':30},{'classroom':'ม.4/3','rosterSize':30},{'classroom':'ม.4/4','rosterSize':39},{'classroom':'ม.4/5','rosterSize':39}]
                fixture={'sessionId':'render-only','sessionCode':'123456','classroom':'ม.4/1','rosterSize':30,'classrooms':rooms,'state':'LOBBY','startAt':None,'deadlineAt':None,'contentReady':True}
                page.add_init_script('''
                window.fixture='''+json.dumps(fixture,ensure_ascii=False)+''';
                window.publicQuestions='''+json.dumps(questions,ensure_ascii=False)+''';
                window.google={script:{run:{withSuccessHandler(fn){this.ok=fn;return this},withFailureHandler(fn){this.fail=fn;return this},api(request){
                  const room=fixture.classrooms.find(c=>c.classroom===request.data.classroom)||fixture.classrooms[0];
                  const data={...fixture,...room,sessionId:'render-only-'+room.classroom,serverNow:Date.now()};
                  if(request.action==='dashboard'){this.ok({ok:true,data:{session:data,readyCount:0,submittedCount:0,paperFallbackCount:0,paperStudentNos:[],overlapStudentNos:[],students:[],items:publicQuestions.map(q=>({...q,choices:q.choices.map(c=>({...c,count:0,percentage:0}))})),answerKey:[]}});return;}
                  if(request.action==='snapshot')Object.assign(data,{studentName:'ผู้เรียนทดสอบหน้าจอ',studentNo:1,questions:publicQuestions});
                  this.ok({ok:true,data});
                }}}};
                ''')
                page.goto(f'http://127.0.0.1:{server.server_port}/actual.html',wait_until='networkidle')
                assert page.locator('.topbar .brand-name').is_visible()
                assert page.locator('#studentName').is_visible()
                assert page.locator('#studentNo').is_visible()
                assert not page.locator('#joinButton').is_disabled()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                assert page.locator('#classroom').input_value()=='ม.4/1'
                assert page.locator('#classroom option').count()==4
                for room in rooms:
                    page.locator('#classroom').select_option(room['classroom'])
                    assert page.locator('#studentNo').get_attribute('max')==str(room['rosterSize'])
                page.locator('#studentNo').fill('39')
                page.locator('#classroom').select_option('ม.4/1')
                assert page.locator('#studentNo').input_value()==''
                assert page.locator('#studentName').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=16
                page.screenshot(path=str(ARTIFACTS/f'fixed-entry-{width}.png'),full_page=True)
                page.locator('#teacherEntry').click()
                assert page.locator('#teacherCode').is_visible()
                assert page.locator('#loginButton').is_visible()
                page.screenshot(path=str(ARTIFACTS/f'fixed-login-{width}.png'),full_page=True)
                page.locator('[data-action="dismiss"]').click()
                page.evaluate("teacherToken='render-only';navigate('teacher')")
                page.locator('#teacherClassroom').select_option('ม.4/4')
                assert page.locator('.seat-summary .seat').count()==39
                assert page.locator('.metric-number').first.inner_text().replace(' ','').find('/39')>=0
                page.locator('#teacherClassroom').select_option('ม.4/3')
                assert page.locator('.seat-summary .seat').count()==30
                page.screenshot(path=str(ARTIFACTS/f'fixed-teacher-{width}.png'),full_page=True)
                page.evaluate("teacherToken='';view='student';selectedClassroom='ม.4/1';claim=null;snapshot=null")
                page.evaluate('''() => {
                  fixture.state='LIVE';fixture.startAt=Date.now();fixture.deadlineAt=Date.now()+180000;
                  claim={sessionId:'render-only',studentNo:1,claimToken:'0'.repeat(64),classroom:'ม.4/1'};
                }''')
                page.evaluate('refresh(true)')
                assert page.locator('.quiz-card').count()==3
                assert page.locator('input[type="radio"]').count()==12
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.screenshot(path=str(ARTIFACTS/f'fixed-quiz-{width}.png'),full_page=True)
                assert not errors,errors
                reports.append({'viewport':[width,height],'entry':'PASS','fourClassrooms':'PASS','rosterLimits30and39':'PASS','teacherClassroomPicker':'PASS','teacherDialog':'PASS','quiz3x4':'PASS','horizontalOverflow':False,'pageErrors':errors})
                page.close()
            browser.close()
        result={'environment':'Local Chromium, HTML returned by actual Code.gs doGet, mocked Google bridge; no school database writes','results':reports}
        (ARTIFACTS/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False,indent=2))
    finally:
        server.shutdown()

if __name__=='__main__':
    main()
