import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Regression: smooth-scroll.js assigns tt-active-scroller to nested dialogs.
// The original global performance rule uses transform:none!important for all
// active scrollers, which canceled Bio Break's translate(-50%,-50%) and made
// the modal jump down/right during wheel/touchpad scrolling.
const dir=resolve(fileURLToPath(new URL('.',import.meta.url)),'..');
const read=rel=>readFileSync(resolve(dir,rel),'utf8');
const bio=read('public/assets/css/bio-breaks.css');
const scrollJs=read('../assets/js/11-smooth-scroll.js');
const global=read('../assets/css/06-features-responsive-hardening.css');
const cssRule=/html\.tt-is-scrolling\s+dialog\.tt-bio-dialog\.tt-active-scroller\s*\{\s*transform:\s*translate\(-50%,\s*-50%\)\s*!important\s*;/;
assert.match(bio,cssRule,'Bio Break must retain its centering transform as active scroller');
assert.match(bio,/\.tt-bio-dialog\{[^}]*position:fixed;inset:50% auto auto 50%;transform:translate\(-50%,-50%\)/,'Bio Break centered modal positioning remains unchanged');
assert.match(scrollJs,/activeScroller\.classList\.add\('tt-active-scroller'\)/,'scroll runtime behavior remains in place');
assert.match(global,/html\.tt-is-scrolling \.tt-active-scroller:not\(html\):not\(body\)\s*\{\s*transform:\s*none\s*!important/,'global performance rule remains intact');
assert.match(read('public/assets/css/c-v1128-rc82-dark-modal-ui-polish.css'),/\.tt-bio-dialog \{ overscroll-behavior:contain; \}/,'background scroll remains locked');
const html=read('public/index.html');
assert.match(html,/bio-breaks\.css[^"\n]*rc2-biobreak-scroll-fix=20261101/,'updated stylesheet is cache-busted');
assert.equal(read('../index.html').includes('rc2-biobreak-scroll-fix=20261101'),true,'source and served entrypoints cache-busted');
assert.equal(read('public/assets/js/bio-breaks.js').includes("window.TrinoTimeBioBreaks=Object.freeze({open,close,message})"),true,'Bio Break API intact');
const fp='TT-3.0.4-RC2-STAGING-UX18P46-TRACKER-2.2.63-20261106';
for(const rel of ['src/worker.js','public/sw.js','public/index.html','public/version.json','public/manifest.json','public/downloads/qc-tracker.json','../index.html','../version.json','../manifest.json']){
  assert.ok(read(rel).includes(fp),`consistent staging fingerprint: ${rel}`);
}
assert.ok(read('wrangler.staging.jsonc').includes('oostrinotime-staging-qa'),'staging Worker unchanged');
console.log('PASS Bio Break scroll hotfix: centered modal wins over global scroller transform override; CSS cache and staging fingerprint aligned');
