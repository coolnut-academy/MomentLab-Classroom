/** Focused check of the actual Code.gs HTML output; no Google calls or student writes. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const context=vm.createContext({
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
    computeDigest:(_algorithm,value)=>Array.from(createHash('sha256').update(String(value)).digest(),b=>b>127?b-256:b)},
  HtmlService:{createHtmlOutput(html){return {getContent:()=>html,setTitle(){return this;},addMetaTag(){return this;}};}}
});
vm.runInContext(readFileSync(root+'Code.gs','utf8'),context,{timeout:5000});
const html=context.doGet().getContent();
const folder=root+'.private/render-review/';mkdirSync(folder,{recursive:true});
writeFileSync(folder+'actual.html',html,'utf8');
const expected=readFileSync(root+'index.html','utf8').replace(/const DEPLOYED_URL = [^;]+;/,"const DEPLOYED_URL = ''; ".trimEnd());
const normalize=value=>value.replace(/\r\n/g,'\n').trimEnd();
const stats={actualLines:html.split('\n').length,literalSlashN:(html.match(/\\n/g)||[]).length};
console.log(JSON.stringify(stats));
if(normalize(html)!==normalize(expected)){
  const a=normalize(html),b=normalize(expected);let first=0;while(first<a.length&&first<b.length&&a[first]===b[first])first++;
  console.log(JSON.stringify({first,actual:a.slice(Math.max(0,first-45),first+100),expected:b.slice(Math.max(0,first-45),first+100)}));
}
assert.equal(normalize(html),normalize(expected),'Bundled HTML must round-trip to the original page with real line breaks.');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.ok(scripts.length>0,'Expected the inline application script.');
for(const [index,script] of scripts.entries())new vm.Script(script[1],{filename:'bundled-browser-'+index+'.js'});
assert.ok(html.includes('พร้อมแล้ว มาเริ่มกัน'),'Thai entry copy must remain intact.');
assert.ok(!html.includes(context.TEACHER_SECRET_CODE),'Teacher secret must stay out of HTML.');
console.log('PASS: Code.gs doGet HTML matches the frontend, browser scripts parse, Thai text survives, teacher secret stays server-side.');
