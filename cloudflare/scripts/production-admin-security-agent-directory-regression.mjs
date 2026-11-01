/** Offline production regression: Account Security must show the verified directory
 * even when an Admin browser's legacy attendance roster has not hydrated.
 * This test never calls Firebase, Cloudflare, or a password-write endpoint. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const segment=(start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a+start.length);assert(a>=0&&b>a,`could not isolate ${start}`);return src.slice(a,b);};
const fetchPart=segment('async function refreshCredentialSecurityStateCache(', 'function agentAuthRequiresCredentialReset(');
const renderPart=segment('function renderAgentSecurityPanel()', 'function renderTeamLeaderTemporaryAccess()');
const resetPart=segment('async function generateAgentTemporaryPassword(', 'async function saveAgentPassword');
assert.match(html,/id="agentSecurityRefresh"/);
assert.match(html,/agent-security-directory=20261021/);
assert.match(renderPart,/directoryReady \? credentialSecurityDirectory : labelerRosterEmployees\(\)/);
assert.match(renderPart,/!!verifiedAgentSecurityTarget\(emp\.name, emp\.pod\)/);
assert.match(renderPart,/data-agent-security-reset-pod=/);
assert.match(resetPart,/verifiedAgentSecurityTarget\(targetName, String\(pod \|\| ''\)\)/);
assert.match(src,/agentSecurityExpandOnOpen = true/);

const verifiedRows=[
 {role:'agent',name:'First Agent',pod:'POD 0',credential:{active:true}},
 {role:'agent',name:'Second Agent',pod:'POD 2',credential:{active:true}},
 {role:'agent',name:'First Agent',pod:'POD 0',credential:{active:true}}, // Duplicate must not stack.
 {role:'team_leader',name:'Leader',pod:'POD 0',credential:{active:true}}
];

function fixture({admin=true,rows=verifiedRows,fail=false}={}) {
 const elements={};
 const el=(id)=>elements[id] ||= {id, textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}},parentNode:null,previousElementSibling:null};
 const panel=el('agentSecurityPanel');
 panel.querySelector=(sel)=>sel==='.agent-security-eyebrow'?el('eyebrow'):sel==='.agent-security-sub'?el('subtitle'):sel==='.agent-security-head'?el('head'):null;
 panel.appendChild=()=>{};panel.insertBefore=()=>{};
 const sandbox={
  isAdmin:admin,isTeamLeader:!admin,teamLeaderName:'Leader',lockedPod:'POD 0',
  activeTeam:'CWH',workforceAuthoritySessionExpiredAt:0,
  credentialSecurityListLoadedAt:0,credentialSecurityListInFlight:null,
  credentialSecurityRetryAt:0,credentialSecurityFailureCount:0,credentialSecurityBackoffContext:'',
  credentialSecurityDirectory:[],credentialSecurityDirectoryError:false,
  agentSecurityCollapsed:false,agentSecurityExpandOnOpen:false,
  agentSecuritySearchQuery:'',agentSecurityRefreshTimer:1,
  agentPasswordResetRequests:new Map(),agentPasswordResetRequestPods:new Map(),agentSecurityStateCache:new Map(),
  employees:[],
  $:el, document:{body:{classList:{contains:()=>false}}},
  setInterval:()=>1,clearInterval:()=>{},
  secureCredentialList:async()=>{if(fail)throw Object.assign(new Error('network error'),{status:503});return {ok:true,credentials:rows};},
  currentAuthenticatedAdminId:()=>admin?'test-admin':'',
  workforceSecuritySessionToken:()=>admin?'':'test-tl-session',
  agentAuthStorageKey:(x)=>'test-'+x,
  cachedAgentSecurityRecord:()=>null,
  agentAuthNowMs:()=>Date.now(),
  updateNotifBadge:()=>{},reportAppError:()=>{},
  maybeShowTeamLeaderPasswordResetToast:()=>{},
  scheduleAgentSecurityPanelRender:()=>{},
  setupAgentSecurityPanel:()=>{},setupFirebaseIdentityMigrationPanel:()=>{},renderFirebaseIdentityMigrationPanel:()=>{},
  adminCommandSecuritySurfaceActive:()=>true,renderTeamLeaderTemporaryAccess:()=>{},
  labelerRosterEmployees:()=>[],
  agentDisplayName:x=>x,podDisplayName:x=>x,
  getAgentSecurityState:()=>({active:true,needsSetup:false,legacySharedCredential:false,temporaryPassword:false,passwordChanged:true,legacyMigration:false,locked:false,invalid:false,resetRequestedAt:null,lastLoginAt:null}),
  TrinoPermissions:{can:(_action,ctx)=>admin || ctx?.pod==='POD 0'},
  profilePhotoMarkup:()=>'',escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  formatAgentSecurityLastLogin:()=> 'Never',
  securityBadge:x=>x,
  console,
 };
 vm.createContext(sandbox);
 vm.runInContext(`function verifiedAgentSecurityTarget(name,pod){if(!credentialSecurityListLoadedAt)return null;return credentialSecurityDirectory.find(e=>e.name===name&&e.pod===pod)||null;}\n${fetchPart}\n${renderPart}`,sandbox);
 return {sandbox,el};
}

{
 const f=fixture();
 assert.equal(await f.sandbox.refreshCredentialSecurityStateCache(true),true);
 f.sandbox.renderAgentSecurityPanel();
 const table=f.el('agentSecurityTbody').innerHTML;
 assert.match(table,/First Agent/);assert.match(table,/Second Agent/);
 assert.doesNotMatch(table,/Leader/);
 assert.equal((table.match(/data-agent-security-reset=/g)||[]).length,2);
 assert.equal(f.el('agentSecurityViewCount').textContent,'2 agents');
 assert.equal(f.sandbox.verifiedAgentSecurityTarget('First Agent','POD 0').pod,'POD 0');
 assert.equal(f.sandbox.verifiedAgentSecurityTarget('First Agent','POD 2'),null);
 console.log('PASS: Admin shows verified Agent accounts with empty local attendance roster; duplicate/server role filtered.');
}
{
 const f=fixture({admin:false});
 assert.equal(await f.sandbox.refreshCredentialSecurityStateCache(true),true);
 f.sandbox.renderAgentSecurityPanel();
 const table=f.el('agentSecurityTbody').innerHTML;
 assert.match(table,/First Agent/);
 assert.doesNotMatch(table,/Second Agent/);
 assert.equal(f.el('agentSecurityViewCount').textContent,'1 agents');
 console.log('PASS: TL receives only their authorized POD; Admin scope is separate.');
}
{
 const f=fixture({fail:true});
 assert.equal(await f.sandbox.refreshCredentialSecurityStateCache(true),false);
 f.sandbox.renderAgentSecurityPanel();
 assert.match(f.el('agentSecurityTbody').innerHTML,/Unable to verify Agent accounts/);
 assert.equal(f.sandbox.verifiedAgentSecurityTarget('First Agent','POD 0'),null);
 console.log('PASS: Credential API failure is visible; no password reset target is inferred from stale roster.');
}
console.log('Production Agent Account Security regression passed (offline, synthetic identities only).');
