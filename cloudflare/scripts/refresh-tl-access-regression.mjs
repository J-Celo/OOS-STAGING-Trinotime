import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const core=fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js',import.meta.url),'utf8');
function extract(name){const start=core.search(new RegExp('        (?:async )?function '+name+'\\('));assert(start>=0,name);const end=core.indexOf('\n        }',start);return core.slice(start,end+10);}
const element=()=>({hidden:false,disabled:false,style:{setProperty(k,v,p){this[k]=v;this.priority=p;}}});
const wrap=element(),button=element(),select={...element(),innerHTML:'',value:'Leader Two',closest:()=>wrap};
const ctx=vm.createContext({isAdmin:false,$:id=>id==='teamLeaderSecuritySelect'?select:button,TEAM_LEADER_ROSTER:[{name:'Leader One',pod:'P1'},{name:'Leader Two',pod:'P1'},{name:'Elsewhere',pod:'P2'}],teamIdForPod:p=>p==='P1'?'T1':'T2',activeTeam:'T1',escapeHtml:s=>s,agentDisplayName:s=>s,podDisplayName:s=>s,TrinoPermissions:{can:()=>true}});
vm.runInContext(extract('renderTeamLeaderTemporaryAccess')+';renderTeamLeaderTemporaryAccess();',ctx);
assert.equal(wrap.hidden,true);assert.equal(wrap.style.display,'none');assert.equal(wrap.style.priority,'important');assert.equal(button.hidden,true);assert.equal(select.disabled,true);assert.equal(select.innerHTML,'');
ctx.isAdmin=true;vm.runInContext('renderTeamLeaderTemporaryAccess()',ctx);assert.equal(wrap.hidden,false);assert.equal(select.disabled,false);assert(select.innerHTML.includes('Leader One'));assert(!select.innerHTML.includes('Elsewhere'));assert.equal(select.value,'Leader Two');assert.equal(button.disabled,false);
ctx.activeTeam='empty';vm.runInContext('renderTeamLeaderTemporaryAccess()',ctx);assert.equal(select.disabled,true);assert.equal(button.disabled,true);assert(select.innerHTML.includes('No Team Leaders'));
const render=extract('renderAgentSecurityPanel');assert(render.indexOf('renderTeamLeaderTemporaryAccess()')<render.indexOf('if (agentSecurityCollapsed) return'));
console.log('PASS: TL controls hidden despite important CSS; Admin options scoped, selection retained, empty state disabled, collapsed panel initializes options');
// Execute the actual snapshot policy block that previously reset secure policy to defaults.
const snapshot=extract('applyKvSnapshot');assert(snapshot.includes('governanceSecureReadActive && isGovernanceLegacyMutationKey(key)'));
const start=snapshot.indexOf('            // Secure policy is not part');const end=snapshot.indexOf('            premiumBeblessLegacyEntitlementDetected',start);assert(start>=0&&end>start);
const policyContext=vm.createContext({governanceSecureReadActive:true,premiumPodAccessPolicy:{enabled:true},newPremiumAccessPolicy:{enabled:false},premiumPolicyServerConfirmed:false,normalizePremiumAccessPolicy:x=>x,markPremiumPodPolicyTrust:()=>{throw Error('legacy snapshot must not invalidate secure trust')}});
vm.runInContext(snapshot.slice(start,end),policyContext);assert.equal(policyContext.premiumPodAccessPolicy.enabled,true);
policyContext.governanceSecureReadActive=false;policyContext.markPremiumPodPolicyTrust=(status)=>{policyContext.status=status;};vm.runInContext(snapshot.slice(start,end),policyContext);assert.equal(policyContext.premiumPodAccessPolicy.enabled,false);assert.equal(policyContext.status,'missing');
console.log('PASS: legacy snapshot preserves secure policy; legacy-only missing policy still fails closed');
for(const enabled of [true,false]){
 const c=vm.createContext({governanceSecureReadActive:true,governanceAuthorityFetch:async()=>({verified:true,policy:{enabled},source:'secure-governance'}),FIREBASE_READ_TIMEOUT_MS:100,normalizePremiumAccessPolicy:x=>x,setLocalMirrorForKey:()=>{},PREMIUM_ACCESS_POLICY_KEY:'premium',markPremiumPodPolicyTrust:status=>{c.trust=status;},premiumEntitlementLastServerRefreshAt:0,premiumPodAccessPolicy:null,Date,ensureFirebaseReady:()=>{throw Error('verified governance must win over stale legacy')},appStorage:{get:async()=>null},PREMIUM_BEBLESS_LEGACY_ACCESS_KEY:'old',premiumBeblessLegacyEntitlementDetected:false,loadBeblessSecurePremiumAccess:async()=>{},applyPremiumModeForCurrentSession:()=>{},renderPremiumAccessManager:()=>{},handleStorageError:e=>{throw e}});
 vm.runInContext(extract('loadPremiumAccessPolicy'),c);await vm.runInContext('loadPremiumAccessPolicy()',c);assert.equal(c.premiumPodAccessPolicy.enabled,enabled);assert.equal(c.trust,'server-confirmed');
}
console.log('PASS: secure Premium grant AND revocation override stale legacy policy');
const manual=extract('manualRefreshReloadApp');
assert(manual.indexOf("await refreshPremiumEntitlementsFromServer('manual-app-refresh')")>manual.indexOf('revalidateActiveCredentialSession'));
assert(manual.indexOf("await refreshPremiumEntitlementsFromServer('manual-app-refresh')")<manual.indexOf('updateAdminUI()'));
assert(manual.includes('restorePersistentNavigation(nav)'));assert(!manual.includes("setCustomizedWorkspacePreview('premium')"));
console.log('PASS: refresh revalidates session and awaits entitlement authority before repaint; preserves navigation without forcing Premium');
