"""Deploy the complete GAS application using existing local clasp authorization.
Credentials stay in memory / existing private clasp config; never log credentials.
"""
from pathlib import Path
import json, time, urllib.request, urllib.parse, urllib.error
from build import build, ROOT

PRIVATE = ROOT / '.private'
STATE_FILE = PRIVATE / 'deployment.json'
API = 'https://script.googleapis.com/v1'

def authorization():
    path = Path.home() / '.clasprc.json'
    config = json.loads(path.read_text(encoding='utf-8'))
    credentials = config['tokens']['default']
    if credentials.get('expiry_date', 0) < time.time() * 1000 + 60000:
        fields = {'client_id': credentials['client_id'], 'client_secret': credentials.get('client_secret', ''), 'refresh_token': credentials['refresh_token'], 'grant_type': 'refresh_token'}
        req = urllib.request.Request('https://oauth2.googleapis.com/token', data=urllib.parse.urlencode(fields).encode())
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.load(response)
        credentials.update(result)
        credentials['expiry_date'] = int(time.time()*1000) + result.get('expires_in', 3600)*1000
        path.write_text(json.dumps(config), encoding='utf-8')
    return credentials['access_token']

def main():
    PRIVATE.mkdir(exist_ok=True)
    access = authorization()
    account_config=ROOT/'deployment-account.json'
    expected=json.loads(account_config.read_text(encoding='utf-8'))['productionDeployerEmail']
    identity_request=urllib.request.Request('https://www.googleapis.com/oauth2/v2/userinfo',headers={'Authorization':'Bearer '+access})
    with urllib.request.urlopen(identity_request,timeout=30) as response:
        account=json.load(response).get('email','').strip().lower()
    if account!=expected.lower():
        raise SystemExit('Production deploy account must be '+expected+'. Current local account is '+account+'. No script or deployment was changed.')
    state = json.loads(STATE_FILE.read_text(encoding='utf-8')) if STATE_FILE.exists() else {}
    if state.get('scriptId') and state.get('projectOwnerEmail')!=expected:
        raise SystemExit('The saved managed project is not bound to the school account. Link the school project before uploading. No script or deployment was changed.')
    def save():
        STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    def request(method, path, data=None):
        req = urllib.request.Request(API+path, method=method, data=json.dumps(data).encode() if data is not None else None, headers={'Authorization':'Bearer '+access,'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            details = json.loads(error.read().decode())
            safe = {'http_status':error.code,'message':details.get('error',{}).get('message','API request failed')}
            state['lastError'] = safe
            save()
            print(json.dumps(safe, ensure_ascii=False))
            raise SystemExit(1)
    if not state.get('scriptId'):
        result = request('POST','/projects',{'title':'MomentCheck Classroom'})
        state['scriptId'] = result['scriptId']
        state['projectOwnerEmail'] = expected
        save()
        print('Created MomentCheck Apps Script project.')
    script_id = state['scriptId']
    index = build()
    files = [{'name':name,'type':'SERVER_JS','source':(ROOT/'apps-script'/(name+'.gs')).read_text(encoding='utf-8')} for name in ['Code','Content','Secrets']]
    files += [{'name':'Index','type':'HTML','source':index},{'name':'appsscript','type':'JSON','source':(ROOT/'apps-script/appsscript.json').read_text(encoding='utf-8')}]
    request('PUT','/projects/'+script_id+'/content',{'files':files})
    print('Uploaded the student page, private supplied questions, server auth and Sheet backend.')
    version = request('POST','/projects/'+script_id+'/versions',{'description':'Student-first MomentCheck: supplied 3Q, server teacher code, live Sheet dashboard'})
    state['versionNumber'] = version['versionNumber']
    save()
    config = {'versionNumber':version['versionNumber'],'manifestFileName':'appsscript','description':'MomentCheck Classroom'}
    if state.get('deploymentId'):
        result = request('PUT','/projects/'+script_id+'/deployments/'+state['deploymentId'],{'deploymentConfig':config})
    else:
        result = request('POST','/projects/'+script_id+'/deployments',config)
    state['deploymentId'] = result['deploymentId']
    state['entryPoints'] = result.get('entryPoints',[])
    for entry in result.get('entryPoints',[]):
        if entry.get('webApp',{}).get('url'):
            state['url'] = entry['webApp']['url']
    state.pop('lastError',None)
    save()
    if state.get('url'):
        linked=ROOT/'.private/linked-webapp.json'
        frontend_url=json.loads(linked.read_text(encoding='utf-8'))['url'] if linked.exists() else state['url']
        path = ROOT/'web/app.js'
        source = path.read_text(encoding='utf-8')
        start = source.index('const DEPLOYED_URL = ')
        end = source.index(';',start)
        source = source[:start]+'const DEPLOYED_URL = '+json.dumps(frontend_url)+source[end:]
        path.write_text(source,encoding='utf-8')
        build()
        (ROOT/'OPEN_CLASSROOM.url').write_text('[InternetShortcut]\nURL='+frontend_url+'\n',encoding='utf-8')
        print('Deployed URL: '+state['url'])
    else:
        print('Deployment created; no web-app URL was returned. See private deployment metadata.')

if __name__ == '__main__':
    main()
