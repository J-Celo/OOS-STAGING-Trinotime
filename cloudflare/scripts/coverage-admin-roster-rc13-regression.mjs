import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const worker=read('../src/worker.js');
const html=read('../public/index.html');
const client=read('../public/assets/js/j-coverage-dashboard-rc20.js');
const must=(ok,msg)=>{if(!ok){console.error('FAIL — '+msg);process.exitCode=1}else console.log('PASS — '+msg)};

must(worker.includes('async function coverageVisibleAgentsServer(env, actor)'),'Coverage roster resolver is present');
must(worker.includes('canonicalWorkforceAuthorizationRosterServer(env)'),'Coverage visibility uses the canonical server-authorized workforce roster');
must(worker.includes("credentialRole(item.role) === 'agent'"),'Coverage roster includes Agent identities only');
must(worker.includes("else if (role !== 'admin') agents = []"),'Admin remains organization-wide while non-workforce roles fail closed');
must(worker.includes("else if (role === 'team_leader') agents = agents.filter(item => item.pod === cleanText(actor.pod"),'Team Leaders remain restricted to their authenticated POD');
must(worker.includes("trackerState:cleanText(row.trackerState || (daily ? 'unknown' : 'offline')"),'Unsynced roster Agents still render as OFFLINE instead of disappearing');
must(client.includes("a.role==='admin'")&&client.includes('adminPods(d)'),'Admin client renders server-returned POD groups');
must(html.includes('coverage-rc23'),'RC23 Coverage assets are cache-busted');

// Execute the exact resolver body against a small canonical roster fixture so
// the regression proves role behavior, not only source-string presence.
const start=worker.indexOf('async function coverageVisibleAgentsServer(env, actor)');
const end=worker.indexOf('\nfunction coverageDashboardRowServer',start);
const fnSource=worker.slice(start,end);
const canonical={entries:{
  a:{role:'agent',name:'Tanjiro Kamado',pod:'pod-demon',employeeId:'A1',active:true},
  b:{role:'agent',name:'Zenitsu Agatsuma',pod:'pod-demon',employeeId:'A2',active:true},
  c:{role:'agent',name:'Nezuko Kamado',pod:'pod-night',employeeId:'A3',active:true},
  tl:{role:'team_leader',name:'TL Vanessa',pod:'pod-demon',active:true},
  inactive:{role:'agent',name:'Archived Agent',pod:'pod-night',active:false}
}};
const state={podDirectory:{entries:[]},employees:{entries:[]}}; // raw employee doc intentionally empty
const factory=new Function(
  'rosterResolvedStateServer','canonicalWorkforceAuthorizationRosterServer','credentialRole','coverageViewerRoleServer','rosterCleanNameServer','cleanText','normalizePersonName',
  `${fnSource}; return coverageVisibleAgentsServer;`
);
const resolver=factory(
  async()=>state,
  async()=>canonical,
  v=>['agent','team_leader'].includes(v)?v:'',
  new Function(`${worker.slice(worker.indexOf('function normalizeRole('),worker.indexOf('function teamIdForPod('))}; return ${worker.slice(worker.indexOf('function coverageViewerRoleServer'),worker.indexOf('async function coverageVisibleAgentsServer'))}`)(),
  v=>String(v||'').trim(),
  v=>String(v||'').trim(),
  v=>String(v||'').trim()
);
const admin=await resolver({}, {role:'admin',name:'Administrator',pod:''});
const tl=await resolver({}, {role:'team_leader',name:'TL Vanessa',pod:'pod-demon'});
const agent=await resolver({}, {role:'agent',name:'Tanjiro Kamado',pod:'pod-demon'});
must(admin.agents.length===3,'Admin sees every active canonical Agent even when the raw employee document is empty');
must(tl.agents.length===2&&tl.agents.every(x=>x.pod==='pod-demon'),'TL sees only active Agents in own POD');
must(agent.agents.length===1&&agent.agents[0].name==='Tanjiro Kamado','Agent sees self only');

if(process.exitCode)process.exit(process.exitCode);
