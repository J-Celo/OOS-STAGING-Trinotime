import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');
const fail=m=>{console.error('V2.0.3 PROD CLEAN FAIL:',m);process.exit(1)};
const files=[
  'public/assets/js/j-coverage-dashboard-rc20.js',
  'public/assets/js/j-confirmation-dashboard-rc21.js',
  'public/assets/js/j-agent-metrics-rc22.js',
  'public/assets/js/j-tracker-download-rc33.js'
];
for(const rel of files){
  const s=fs.readFileSync(path.join(root,rel),'utf8');
  if(/oostrinotime-staging-qa|trinoadmin\.workers\.dev|staging API deployment|\bSTAGING QA\b|\bSTG\b/i.test(s)) fail(`staging marker leaked into ${rel}`);
}
const meta=JSON.parse(fs.readFileSync(path.join(root,'public/downloads/qc-tracker.json'),'utf8'));
if(meta.environment!=='PRODUCTION') fail('Tracker metadata is not PRODUCTION.');
console.log('V2.0.3 Coverage + Confirmation production-clean regression: PASS');
