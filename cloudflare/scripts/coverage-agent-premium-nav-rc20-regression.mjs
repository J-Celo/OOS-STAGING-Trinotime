import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const index = read('../public/index.html');
const coverage = read('../public/assets/js/j-coverage-dashboard-rc20.js');
const premium = read('../public/assets/js/j-d91d2b3b0f5b.js');
const headers = read('../public/_headers');
assert(index.includes('assets/js/j-coverage-dashboard-rc20.js?v=2.0.3-coverage-rc20'), 'production index must load RC20 Coverage client');
assert(coverage.includes("window.__ttCoverageDashboardBuild = 'RC20'"), 'RC20 Coverage build marker');
assert(coverage.includes('function shellIdentityActor()'), 'Agent/TL shell fallback must exist');
assert(coverage.includes("_source:'premium-shell'"), 'Premium shell identity fallback must be used');
assert(coverage.includes("const shellSignedIn=['admin','team_leader','agent'].includes(shellRole);"), 'Coverage nav visibility must follow signed-in shell role');
assert(!coverage.includes('if(sideBtn)sideBtn.hidden=!a;'), 'Coverage nav must not disappear only because Messaging actor is late');
assert(premium.includes('data-tt-nav="coverage"'), 'Premium sidebar must contain Coverage entry by default');
assert(premium.includes("window.__ttPremiumCoverageNavBuild = 'RC20'"), 'Premium nav RC20 marker');
assert(/\/assets\/js\/j-coverage-dashboard-rc20\.js[\s\S]*Cache-Control: no-store, max-age=0/.test(headers), 'RC20 Coverage client must be no-store');

// Execute the actual RC20 identity helpers without booting the UI.
const prefix = coverage.slice(0, coverage.indexOf("  document.addEventListener('click',event=>{"));
function profileNode(name, roleLine){
  return {querySelector(sel){
    if(sel==='strong') return {textContent:name};
    if(sel==='.tt-profile-role') return {textContent:roleLine};
    return null;
  }};
}
function actorFor({bodyRole, profileName='', roleLine='', indicatorText='', messaging=null}){
  const body={dataset:{trinoRole:bodyRole}};
  const document={
    addEventListener(){},
    body,
    getElementById(id){
      if(id==='sessionIndicator') return {dataset:{role:bodyRole==='team_leader'?'teamleader':bodyRole},textContent:indicatorText};
      if(id==='executiveStatusRole') return {textContent:''};
      return null;
    },
    querySelector(sel){
      if(sel==='#agentProfileHeaderBtn .tt-profile-header-copy' && profileName) return profileNode(profileName,roleLine);
      return null;
    }
  };
  const window={TrinoTimeMessagingSessionContext:{getActor:()=>messaging},TrinoTimeAdminProfile:{current:()=>null}};
  const context=vm.createContext({window,document,Intl,Date,console,setTimeout,clearTimeout,setInterval,clearInterval,fetch:async()=>{throw new Error('not used')}});
  vm.runInContext(prefix+"window.__rc20test={actor,shellRoleHint,shellIdentityActor};})();",context);
  return JSON.parse(JSON.stringify(context.window.__rc20test.actor()));
}
assert.deepEqual(actorFor({bodyRole:'agent',profileName:'Jhan Roi Celo',roleLine:'Data Labeler · POD 2'}),{role:'agent',name:'Jhan Roi Celo',pod:'POD 2',_source:'premium-shell'},'Premium Agent shell must resolve without Messaging actor');
assert.deepEqual(actorFor({bodyRole:'teamleader',indicatorText:'TL - Vanessa Belara - POD 2'}),{role:'team_leader',name:'Vanessa Belara',pod:'POD 2',_source:'premium-shell'},'Premium TL shell must resolve without Messaging actor');
assert.equal(actorFor({bodyRole:'agent-pending'}),null,'Unauthenticated/pending Agent must not gain Coverage actor');
console.log('PASS — RC20 Premium Agent/TL Coverage navigation and actual shell-identity fallback');
