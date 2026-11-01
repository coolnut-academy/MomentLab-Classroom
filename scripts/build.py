"""Assemble the public single-file index.html; no network, tests or secret content."""
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]

def build():
    web = ROOT / 'web'
    read = lambda name: (web / name).read_text(encoding='utf-8')
    page = '<!doctype html>\n<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#153f39"><title>MomentCheck · แบบทดสอบโมเมนต์</title>\n<style>\n'
    page += read('base.css') + '\n' + read('extra.css')
    page += '\n</style></head><body>\n' + read('icons.html') + '\n' + read('body.html')
    app=read('app.js')
    linked=ROOT/'.private/linked-webapp.json'
    if linked.exists():
        url=json.loads(linked.read_text(encoding='utf-8'))['url']
        app=re.sub(r'const DEPLOYED_URL = [^;]+;',lambda _: 'const DEPLOYED_URL = '+json.dumps(url)+';',app,count=1)
    page += '\n<script>\n' + read('beam.js') + '\n' + app + '\n</script>\n</body></html>\n'
    (ROOT / 'index.html').write_text(page, encoding='utf-8')
    return page

if __name__ == '__main__':
    build()
    print('Built index.html. No tests run.')
