import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');
const fail=m=>{console.error('RC33 FAIL:',m);process.exit(1)};
const meta=JSON.parse(fs.readFileSync(path.join(root,'public/downloads/qc-tracker-current.json'),'utf8'));
const zip=path.join(root,'public/downloads',meta.file);
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const js=fs.readFileSync(path.join(root,'public/assets/js/j-tracker-download-rc33.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
if(!fs.existsSync(zip))fail('Runtime-only Tracker ZIP missing.');
const sha=createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
if(meta.sha256!==sha || meta.channel!=='staging-qa')fail('Tracker release feed checksum or channel mismatch.');
if(!worker.includes("headers.set('x-trinotime-sha256','"+sha+"')"))fail('Download response checksum mismatch.');
if(meta.downloadUrl!=='/api/workforce/governance/qc-tracker-download')fail('QA ZIP fallback metadata does not use first-party route.');
// The default CTA must install the approved Web Store BETA; legacy ZIP remains
// available via the existing authenticated route, never as the default CTA.
if(!js.includes("const TRACKER_STORE_URL = 'https://chromewebstore.google.com/detail/lhglagmphokkpfkkdckogjlniipneill'")) fail('Web Store URL does not match owner-approved staging listing.');
if(!js.includes("link.target = '_blank'") || !js.includes("link.rel = 'noopener noreferrer'")) fail('Store link must safely open a new tab.');
if(js.includes('function startDownload()') || js.includes('startDownload();')) fail('The default sidebar must not download a ZIP.');
if(!js.includes('data-tt-tracker-download') || !js.includes('STG')) fail('Expected Standard/Premium beta navigation is missing.');
if(!index.includes('j-tracker-download-rc33.js'))fail('RC33 download JS not loaded.');
for(const needle of ['application/zip','content-disposition','no-transform','x-trinotime-sha256']) if(!worker.includes(needle))fail('Worker is missing hardened download header: '+needle);
// Binary package internals are intentionally left untouched.
if(meta.channel!=='staging-qa')fail('Tracker release channel must be staging-qa.');
if(!worker.includes(`qc-tracker-v${meta.version}-staging`))fail('Worker package channel is not staging.');
if(!js.includes("TRACKER_ENV = 'STAGING QA'"))fail('Client Tracker environment is not staging.');
if(!index.includes('chrome-web-store-staging=1'))fail('Web Store CTA cache-bust marker missing.');
console.log('V2.0.3 staging Chrome Web Store CTA and preserved QA ZIP fallback: PASS');
