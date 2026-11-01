"""Build one private, self-contained Code.gs for pasting into school Apps Script."""
from pathlib import Path
import json
import re
from build import ROOT, build

def js_string(value):
    return json.dumps(value, ensure_ascii=False).replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')

def main():
    html=build()
    # The embedded page is already hosted by this script. It must never redirect
    # back to a different deployment copied from the local launcher configuration.
    html=re.sub(r'const DEPLOYED_URL = [^;]+;', "const DEPLOYED_URL = '';", html, count=1)
    backend=(ROOT/'apps-script/Code.gs').read_text(encoding='utf-8')
    old="HtmlService.createHtmlOutputFromFile('Index')"
    if backend.count(old)!=1:
        raise SystemExit('Expected one HTML entry point; bundle was not changed.')
    backend=backend.replace(old,'HtmlService.createHtmlOutput(momentCheckHtml_())')
    content=(ROOT/'apps-script/Content.gs').read_text(encoding='utf-8')
    verifier=(ROOT/'apps-script/Secrets.gs').read_text(encoding='utf-8')
    salt_match=re.search(r"var MC_SECRET_SALT\s*=\s*(['\"])(.*?)\1\s*;",verifier)
    if not salt_match:
        raise SystemExit('Private teacher verifier is missing; bundle was not changed.')
    secret=(ROOT/'.private/teacher-access.txt').read_text(encoding='utf-8').splitlines()[0].strip()
    header='''/**
 * MomentCheck — all application code in one Code.gs.
 * Paste this ENTIRE file into the school Apps Script project.
 * No Index.html, Content.gs or Secrets.gs file is required.
 * This file contains the teacher secret and answer key. Keep it server-side.
 * Deploy a NEW VERSION after replacing the project code.
 */
// Change only this value to set the teacher's login code.
'''
    settings='var TEACHER_SECRET_CODE = '+js_string(secret)+';\n'
    settings+='var MC_SECRET_SALT = '+js_string(salt_match.group(2))+';\n'
    settings+='var MC_SECRET_HASH = digest_(MC_SECRET_SALT + TEACHER_SECRET_CODE);\n\n'
    embedded='\n/** Private HTML renderer: emits only frontend code, never server keys/content. */\n'
    embedded+='function momentCheckHtml_() {\n  return [\n'
    embedded+=',\n'.join('    '+js_string(line) for line in html.splitlines())
    embedded+='\n  ].join("\\n");\n}\n'
    result=header+settings+content+'\n'+backend+embedded
    target=ROOT/'Code.gs'
    target.write_text(result,encoding='utf-8')
    print('Created Code.gs: backend + supplied 3 questions + teacher verifier + embedded HTML/CSS/JS.')
    print('doGet serves the embedded page. No separate HTML file required. No tests run.')

if __name__=='__main__':
    main()
