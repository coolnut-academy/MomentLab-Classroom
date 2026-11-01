"""Adopt the owner's Google-UI-created public web-app URL for this exact project."""
from pathlib import Path
import argparse, json, re, urllib.request
from deploy import authorization, ROOT
from build import build

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('url')
    args=parser.parse_args()
    supplied=args.url.strip().split('?',1)[0].split('#',1)[0].rstrip('/')
    match=re.fullmatch(r'https://script\.google\.com/(?:a/macros/[A-Za-z0-9.-]+|macros)/s/([A-Za-z0-9_-]+)/exec',supplied)
    if not match:
        raise SystemExit('Use the Web app URL returned by Google, ending in /exec.')
    state_file=ROOT/'.private/deployment.json'
    state=json.loads(state_file.read_text(encoding='utf-8'))
    req=urllib.request.Request('https://script.googleapis.com/v1/projects/'+state['scriptId']+'/deployments',headers={'Authorization':'Bearer '+authorization()})
    with urllib.request.urlopen(req,timeout=30) as response:
        deployments=json.load(response).get('deployments',[])
    selected=None
    for deployment in deployments:
        for entry in deployment.get('entryPoints',[]):
            observed=entry.get('webApp',{}).get('url','')
            if observed.rstrip('/').endswith('/s/'+match.group(1)+'/exec'):
                selected=deployment
    old_url=state.get('frontendUrl') or state.get('url','')
    if selected:
        if selected['deploymentId']!=state.get('deploymentId'):
            state['previousDeploymentId']=state.get('deploymentId')
        state.update(deploymentId=selected['deploymentId'],url=supplied,entryPoints=selected.get('entryPoints',[]),versionNumber=selected['deploymentConfig'].get('versionNumber'),ownerAuthorizationReported=True)
    # A school-account deployment can be explicitly designated by the owner even
    # when the local personal-account credential cannot manage that project.
    # Link the frontend without overwriting the known managed project identity.
    state.update(frontendUrl=supplied,frontendIsExternal=selected is None)
    linked={'url':supplied,'deploymentId':match.group(1),'managedProjectMatch':selected is not None,'source':'explicit user-provided deployment URL','accessStatus':'GOOGLE_SIGN_IN_REQUIRED'}
    (ROOT/'.private/linked-webapp.json').write_text(json.dumps(linked,ensure_ascii=False,indent=2),encoding='utf-8')
    state_file.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
    app=ROOT/'web/app.js'
    source=app.read_text(encoding='utf-8')
    source=re.sub(r'const DEPLOYED_URL = [^;]+;',lambda _: 'const DEPLOYED_URL = '+json.dumps(supplied)+';',source,count=1)
    app.write_text(source,encoding='utf-8')
    build()
    (ROOT/'OPEN_CLASSROOM.url').write_text('[InternetShortcut]\nURL='+supplied+'\n',encoding='utf-8')
    for name in ['README.md','DEPLOYMENT.md']:
        path=ROOT/name
        source=path.read_text(encoding='utf-8')
        if old_url:
            source=source.replace(old_url,supplied)
        path.write_text(source,encoding='utf-8')
    print('Updated index.html and the classroom shortcut: '+supplied)
    print('Local project management available for this deployment: '+str(selected is not None))

if __name__=='__main__':
    main()
