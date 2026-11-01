import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const metrics=fs.readFileSync(path.join(root,'public/assets/js/j-agent-metrics-rc22.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');

assert.match(metrics,/__ttMetricsDefaultTargetBuild='M2\.9\.16'/,'M2.9.16 default-target marker');
assert.match(metrics,/const DEFAULT_TARGET_SECONDS=70;/,'default target seconds must be 70');
assert.match(metrics,/id="ttMetricsTarget"[^>]*value="70"/,'new target field should render with 70 by default');
assert.match(metrics,/Number\.isFinite\(saved\)&&saved>0\?saved:DEFAULT_TARGET_SECONDS/,'saved target must override the 70 default while empty targets fall back to 70');
assert.match(index,/metrics-default-target-m2916=1/,'Metrics asset cache bust must include M2.9.16 default target marker');

console.log('PASS M2.9.16 Metrics target default: new POD/job targets start at 70 sec/task while existing saved targets still load unchanged.');
