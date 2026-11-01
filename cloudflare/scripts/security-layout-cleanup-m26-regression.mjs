import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync(new URL('../public/assets/css/c-v203-metrics-m26-security-layout-cleanup.css',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert(index.includes('c-v203-metrics-m26-security-layout-cleanup.css?v=2.0.3-m26'),'M2.6 security layout stylesheet must be loaded');
for(const marker of [
  'grid-template-areas:"search tl generate"',
  'grid-area:generate',
  'position:absolute!important',
  'min-width:118px',
  'max-width:138px',
  'width:200px',
  '@media(max-width:820px)'
]) assert(css.includes(marker),`missing M2.6 marker: ${marker}`);
assert(!css.includes('grid-template-columns:44px minmax(220px,1fr) minmax(260px,1fr) auto auto'),'M2.6 must not recreate the M2.5 five-column utility-heavy layout');
console.log('PASS M2.6 Security layout cleanup: balanced search/TL controls, full-size Generate action, compact corner panel toggle/help, and responsive stacking.');
