import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertTrinoBotPreviewGate,renderTrinoBotIdentityPreview} from '../src/trinobot-staging-preflight.js';
for(const mode of ['production',undefined,'staging-test',''])test('rejects non-staging mode '+mode,()=>assert.throws(()=>assertTrinoBotPreviewGate({isolation:{ok:true,mode},enabled:'true'})));
for(const enabled of [undefined,'false',true,'TRUE','1',''])test('rejects absent explicit feature opt-in '+enabled,()=>assert.throws(()=>assertTrinoBotPreviewGate({isolation:{ok:true,mode:'staging'},enabled})));
test('only an exact staging opt-in enables read-only preflight',()=>assert.equal(assertTrinoBotPreviewGate({isolation:{ok:true,mode:'staging'},enabled:'true'}),true));
test('rejects anonymous and unknown actors, missing POD scope',()=>{
 for(const actor of [null,{kind:'anonymous',role:'admin'},{kind:'firebase',role:'unknown'},{kind:'firebase',role:'agent',pod:''},{kind:'security-session',role:'agent'}])assert.throws(()=>renderTrinoBotIdentityPreview(actor));
});
for(const actor of [{kind:'firebase',role:'admin',uid:'secret-uid',name:'Sensitive Name'}, {kind:'security-session',role:'agent',pod:'POD 2',name:'Sensitive Name',uid:'secret-uid'}, {kind:'security-session',role:'team_leader',pod:'POD 3',name:'Sensitive Name'}])test('staging preflight is minimally scoped, not a verified Discord link',()=>{
 const r=renderTrinoBotIdentityPreview(actor),json=JSON.stringify(r);
 assert.equal(r.sessionVerified,true);assert.equal(r.realDiscordLinkCreated,false);assert.equal(r.discordUserVerified,false);assert.equal(r.storePublishing,false);assert.equal(json.includes('Sensitive'),false);assert.equal(json.includes('secret-uid'),false);
});
test('worker route calls existing roster-verified workforce actor, not client role claims',()=>{
 const src=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
 assert.match(src,/\/api\/workforce\/trinobot\/staging-preflight/);assert.match(src,/requireWorkforceAttendanceActor\(request,env\)/);
 assert.match(src,/TRINOBOT_STAGING_PREFLIGHT_ENABLED/);assert.match(src,/validateDeploymentIsolation\(env\)/);
});

test('staging assets route and explicit disabled-default variable registered',()=>{
 const cfg=JSON.parse(readFileSync(new URL('../wrangler.staging.jsonc',import.meta.url),'utf8'));
 assert.ok(cfg.assets.run_worker_first.includes('/api/workforce/trinobot/*'));
 assert.equal(cfg.vars.TRINOBOT_STAGING_PREFLIGHT_ENABLED,'false');
 assert.equal(cfg.vars.DEPLOYMENT_ENV,'staging');
});

test('feature rejects staging configuration pointing to production resources',()=>{
 assert.throws(()=>assertTrinoBotPreviewGate({isolation:{ok:false,mode:'staging'},enabled:'true'}));
});
