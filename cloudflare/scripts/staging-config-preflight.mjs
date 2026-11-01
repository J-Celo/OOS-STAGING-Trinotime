/**
 * TrinoTime M2.9.54 — fail-closed staging deployment preflight.
 * Runs locally only, never contacts Cloudflare/Firebase or prints secret values.
 * Review with: node scripts/staging-config-security-regression.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_STAGING_PROJECT = 'trinotime-staging-qa';

function stripJsonComments(input) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    const n = input[i + 1];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && n === '/') {
      while (i < input.length && input[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    out += c;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

export function parseJsonc(text) {
  return JSON.parse(stripJsonComments(String(text).replace(/^\uFEFF/, '')));
}

function val(value) { return String(value ?? '').trim(); }
function same(a, b) { return val(a).toLowerCase() === val(b).toLowerCase(); }
function isStageTagged(name) { return /(?:^|[-_])(staging|stage|qa|test)(?:$|[-_])/i.test(name); }

function checkedHttpsUrl(value, label) {
  let parsed;
  try { parsed = new URL(val(value)); } catch { throw new Error(`${label} must be an absolute HTTPS URL.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} requires HTTPS and must not have embedded credentials, query strings or fragments.`);
  }
  return parsed;
}

/** Pure validator for runtime/deployment config — no secrets, network, or files. */
export function validateStagingConfig(staging, production) {
  const problems = [];
  const requireSafe = (condition, reason) => { if (!condition) problems.push(reason); };
  const sw = val(staging?.name), pw = val(production?.name);
  const vars = staging?.vars || {}, pvars = production?.vars || {};
  const project = val(vars.FIREBASE_PROJECT_ID);

  requireSafe(Boolean(sw && pw), 'Worker names are required in both configs.');
  requireSafe(sw && !same(sw,pw) && isStageTagged(sw), 'Staging Worker name must be distinct and clearly staging/QA-labelled.');
  requireSafe(val(vars.DEPLOYMENT_ENV) === 'staging', 'DEPLOYMENT_ENV must be exactly staging, never production or implicit.');
  requireSafe(project === EXPECTED_STAGING_PROJECT, `FIREBASE_PROJECT_ID must be exactly ${EXPECTED_STAGING_PROJECT}.`);
  requireSafe(Boolean(val(staging?.main) && val(staging?.assets?.directory)), 'Worker main and assets.directory are required.');

  for (const key of ['FIREBASE_WEB_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_DATABASE_URL','FIREBASE_STORAGE_BUCKET','FIREBASE_MESSAGING_SENDER_ID','FIREBASE_APP_ID']) {
    requireSafe(Boolean(val(vars[key])), `Missing staging web config: ${key}.`);
  }
  const forbidden = Object.keys(vars).filter(k => /^(FIREBASE_PRIVATE_KEY|FIREBASE_CLIENT_EMAIL|CHAT_SESSION_SECRET|.*PASSWORD|.*TOKEN|.*PRIVATE_KEY)$/i.test(k));
  requireSafe(!forbidden.length, 'Credentials/secrets must use staging-only secrets, never Wrangler vars.');
  requireSafe(val(vars.FIREBASE_AUTH_DOMAIN).toLowerCase() === `${EXPECTED_STAGING_PROJECT}.firebaseapp.com`, 'Auth domain must be the staging Firebase app domain.');
  requireSafe([`${EXPECTED_STAGING_PROJECT}.firebasestorage.app`, `${EXPECTED_STAGING_PROJECT}.appspot.com`].includes(val(vars.FIREBASE_STORAGE_BUCKET).toLowerCase()), 'Storage bucket must be associated with the staging Firebase project.');
  requireSafe(!same(project,pvars.FIREBASE_PROJECT_ID), 'Firebase project must be distinct from production.');

  try {
    const db = checkedHttpsUrl(vars.FIREBASE_DATABASE_URL, 'Firebase Realtime Database URL');
    const host = db.hostname.toLowerCase();
    const expectedPrefix = `${EXPECTED_STAGING_PROJECT}-default-rtdb.`;
    const accepted = host === `${EXPECTED_STAGING_PROJECT}.firebaseio.com` ||
      (host.startsWith(expectedPrefix) && host.endsWith('.firebasedatabase.app'));
    requireSafe(accepted, 'Realtime Database hostname must belong to the expected staging Firebase project.');
    requireSafe(db.pathname === '/' || db.pathname === '', 'Realtime Database URL must target its root, not a nested path.');
    requireSafe(!same(vars.FIREBASE_DATABASE_URL,pvars.FIREBASE_DATABASE_URL), 'Realtime Database URL must not equal production.');
  } catch(e) { problems.push(e.message); }

  if (val(vars.LEAVE_API_ENDPOINT)) {
    try {
      const leave = checkedHttpsUrl(vars.LEAVE_API_ENDPOINT, 'Leave API URL');
      requireSafe(leave.hostname.toLowerCase().includes(EXPECTED_STAGING_PROJECT), 'Leave API must identify the dedicated staging project in its hostname.');
    } catch(e) { problems.push(e.message); }
  }

  const routes=staging?.assets?.run_worker_first;
  const routed=p=>routes===true||(Array.isArray(routes)&&routes.some(r=>r===p||r==='/api/workforce/*'||r==='/api/*'||r==='/*'||(r.endsWith('*')&&p.startsWith(r.slice(0,-1)))));
  requireSafe(['/api/workforce/workspace-read','/api/workforce/login-directory','/api/workforce/login-directory/bootstrap'].every(routed),'Worker-first asset routes must cover workspace-read and login-directory endpoints.');
  const stageBuckets = (staging?.r2_buckets || []).map(x=>val(x?.bucket_name));
  const prodBuckets = (production?.r2_buckets || []).map(x=>val(x?.bucket_name));
  for (const name of stageBuckets) {
    requireSafe(Boolean(name && isStageTagged(name)), 'Every staging R2 bucket must have a staging/QA-specific name.');
    requireSafe(!prodBuckets.some(p=>same(p,name)), 'Staging R2 bucket must not equal a production R2 bucket.');
  }
  const projectAsString = JSON.stringify(staging?.vars || {}).toLowerCase();
  requireSafe(!projectAsString.includes('cwh-timeclock'), 'A staging variable still references the known production Firebase project.');

  return { ok: problems.length === 0, problems, worker: sw, firebaseProject: project };
}

export function verifyStagingFromDirectory(directory) {
  const stagingPath = path.join(directory, 'wrangler.staging.jsonc');
  const productionPath = path.join(directory, 'wrangler.jsonc');
  if (!fs.existsSync(stagingPath)) throw new Error('Dedicated wrangler.staging.jsonc is missing. Never substitute production wrangler.jsonc.');
  if (!fs.existsSync(productionPath)) throw new Error('Default deployment config is missing.');
  const staging = parseJsonc(fs.readFileSync(stagingPath,'utf8'));
  const defaultConfig = parseJsonc(fs.readFileSync(productionPath,'utf8'));
  if (defaultConfig.name !== staging.name || defaultConfig.vars?.DEPLOYMENT_ENV !== 'staging' ||
      defaultConfig.vars?.FIREBASE_PROJECT_ID !== staging.vars?.FIREBASE_PROJECT_ID ||
      defaultConfig.vars?.FIREBASE_DATABASE_URL !== staging.vars?.FIREBASE_DATABASE_URL ||
      JSON.stringify(defaultConfig.r2_buckets||[]) !== JSON.stringify(staging.r2_buckets||[]))
    throw new Error('Default Worker config must be staging-only and match wrangler.staging.jsonc.');
  const production = {name:'oostrinotime',vars:{FIREBASE_PROJECT_ID:'cwh-timeclock',FIREBASE_DATABASE_URL:'https://cwh-timeclock-default-rtdb.asia-southeast1.firebasedatabase.app'},
    r2_buckets:[{bucket_name:'trinotime-chat-files'}]};
  const result = validateStagingConfig(staging,production);
  if (!result.ok) throw new Error(result.problems.join('\n - '));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const check = verifyStagingFromDirectory(process.cwd());
    console.log('[STAGING SECURITY PREFLIGHT] PASS');
    console.log(`  Staging Worker: ${check.worker}`);
    console.log(`  Firebase project: ${check.firebaseProject}`);
    console.log('  Firebase Auth, RTDB, Storage, Leave API and R2 are staging-isolated.');
    console.log('  Secrets not printed. No deployment or remote calls performed.');
  } catch (error) {
    console.error('[STAGING SECURITY PREFLIGHT] FAIL (deployment blocked):');
    // Errors are structural descriptions only, never resource values/secret contents.
    console.error(` - ${error.message}`);
    process.exitCode=1;
  }
}
