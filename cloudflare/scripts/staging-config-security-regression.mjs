import assert from 'node:assert/strict';
import { parseJsonc, validateStagingConfig } from './staging-config-preflight.mjs';
const stageProject='trinotime-staging-qa';
const production={name:'oostrinotime',vars:{DEPLOYMENT_ENV:'production',FIREBASE_PROJECT_ID:'cwh-timeclock',FIREBASE_DATABASE_URL:'https://cwh-timeclock-default-rtdb.asia-southeast1.firebasedatabase.app'},r2_buckets:[{bucket_name:'trinotime-chat-files'}]};
const good=()=>({
  name:'oostrinotime-staging-qa',main:'./src/worker.js',assets:{directory:'./public',run_worker_first:['/api/workforce/*']},
  vars:{DEPLOYMENT_ENV:'staging',FIREBASE_PROJECT_ID:stageProject,FIREBASE_WEB_API_KEY:'staging-web-key-public',FIREBASE_AUTH_DOMAIN:`${stageProject}.firebaseapp.com`,FIREBASE_DATABASE_URL:`https://${stageProject}-default-rtdb.asia-southeast1.firebasedatabase.app`,FIREBASE_STORAGE_BUCKET:`${stageProject}.firebasestorage.app`,FIREBASE_MESSAGING_SENDER_ID:'123456',FIREBASE_APP_ID:'1:123456:web:staging'},
  r2_buckets:[{bucket_name:'trinotime-chat-files-staging-qa'}]
});
const check=(mutate, description)=>{
  const config=good(); mutate(config);
  assert.equal(validateStagingConfig(config,production).ok,false,`Did not reject ${description}`);
  console.log(`PASS rejects ${description}`);
};
assert.equal(validateStagingConfig(good(),production).ok,true);
console.log('PASS accepts isolated staging config');
const commented=`{ // example \n "name": "staging", /* comment */ "vars": { "note": "https://example.com/path", }, }`;
assert.equal(parseJsonc(commented).vars.note,'https://example.com/path');
console.log('PASS parses quoted URLs in JSONC');
check(s=>{delete s.vars.FIREBASE_PROJECT_ID},'missing Firebase project');
check(s=>{s.vars.FIREBASE_PROJECT_ID='cwh-timeclock'},'production Firebase project');
check(s=>{s.vars.FIREBASE_PROJECT_ID='other-staging'},'unexpected staging Firebase project');
check(s=>{s.vars.DEPLOYMENT_ENV='production'},'production environment setting');
check(s=>{s.name=production.name},'production Worker name');
check(s=>{s.vars.FIREBASE_DATABASE_URL=production.vars.FIREBASE_DATABASE_URL},'production Realtime Database');
check(s=>{s.vars.FIREBASE_DATABASE_URL='http://trinotime-staging-qa-default-rtdb.asia-southeast1.firebasedatabase.app'},'non-HTTPS RTDB URL');
check(s=>{s.vars.FIREBASE_DATABASE_URL='https://trinotime-staging-qa-default-rtdb.asia-southeast1.firebasedatabase.app/other'},'nested RTDB path');
check(s=>{s.vars.FIREBASE_AUTH_DOMAIN='cwh-timeclock.firebaseapp.com'},'production Auth domain');
check(s=>{s.vars.FIREBASE_STORAGE_BUCKET='cwh-timeclock.firebasestorage.app'},'production Firebase Storage bucket');
check(s=>{s.vars.LEAVE_API_ENDPOINT='https://asia-southeast1-cwh-timeclock.cloudfunctions.net/leaveApi'},'production Leave endpoint');
check(s=>{s.r2_buckets=[{bucket_name:'trinotime-chat-files'}]},'production R2 bucket');
check(s=>{s.vars.FIREBASE_PRIVATE_KEY='do-not-commit-this'},'embedded credentials in public configuration');
check(s=>{delete s.vars.FIREBASE_WEB_API_KEY},'missing Firebase web configuration');
console.log('STAGING CONFIG SECURITY REGRESSION PASS (14 malicious/malformed cases rejected).');

check(s=>{s.assets.run_worker_first=[]},'missing authorized read API routing');
