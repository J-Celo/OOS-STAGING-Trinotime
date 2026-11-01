import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { qaMessagingGuestPodForMember, OOS_QA_INDEPENDENT_POD } from '../src/oos-coverage-beta-qas.js';

const dir=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(dir,'../src/worker.js'),'utf8');
const extract=(name,next)=>{
 const from=source.indexOf(`function ${name}(`), to=source.indexOf(`\nfunction ${next}(`,from);
 assert(from>=0&&to>from,`worker must contain ${name} before ${next}`);
 return source.slice(from,to);
};
const context={OOS_QA_INDEPENDENT_POD, PREMIUM_BEBLESS_EMPLOYEE_ID:'tt_emp_bebless_velasco_p0_001', CHAT_NOTIFICATION_MODES:new Set(['all','mentions','muted'])};
vm.createContext(context);
vm.runInContext([extract('messagingTeamIds','visibleTeamsForMember'),extract('visibleTeamsForMember','canDirectMessage'),extract('canDirectMessage','visiblePeopleForMember'),extract('conversationAccess','reactionSummary')].join('\n'),context);
const slug=pod=>String(pod).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-+$/g,'');
const qaEntries=[
 {name:'Jhan Roi Celo',employeeId:'tt_emp_jhan_roi_celo_p2_001',pod:OOS_QA_INDEPENDENT_POD,active:true},
 {name:'Lousie Cabahug',employeeId:'tt_emp_cabahug_qa_002',pod:OOS_QA_INDEPENDENT_POD,active:true},
 {name:'March Sheen Jacildo',employeeId:'tt_emp_jacildo_qa_003',pod:OOS_QA_INDEPENDENT_POD,active:true}
];
const roster={employees:{verified:true,entries:qaEntries}};
const members=qaEntries.map((r,i)=>({uid:`agent:qa:${i}`,name:r.name,pod:r.pod,employeeId:r.employeeId,teamId:slug(r.pod),role:'agent',active:true,identityKind:'legacy-agent',globalDm:false}));
const expected=['POD 2','POD 1','POD 0'];
for(let i=0;i<3;i++){
 const member=members[i];
 assert.equal(qaMessagingGuestPodForMember(roster,member),expected[i]);
 member.messagingGuestTeamIds=[slug(qaMessagingGuestPodForMember(roster,member))];
 assert.deepEqual([...context.messagingTeamIds(member)].sort(),[slug(OOS_QA_INDEPENDENT_POD),slug(expected[i])].sort());
 const sessions={role:member.role,uid:member.uid,teamIds:context.messagingTeamIds(member),elevated:false};
 assert.equal(context.visibleTeamsForMember(member,[...members,...expected.map(pod=>({pod,podLabel:pod,teamId:slug(pod),role:'agent'}))]).length,2);
 for(const pod of ['POD 0','POD 1','POD 2','POD 3']){
   const room={type:'team',teamId:slug(pod)};
   assert.equal(Boolean(context.conversationAccess(room,sessions)),pod===expected[i],`${member.name} team access ${pod}`);
 }
 assert.equal(Boolean(context.conversationAccess({type:'team',teamId:slug(OOS_QA_INDEPENDENT_POD)},sessions)),true);
 assert.equal(sessions.elevated,false);
}
const one=members[0];
const normal={uid:'agent:pod:2',name:'Normal Agent',role:'agent',teamId:'pod-2',pod:'POD 2',active:true,identityKind:'legacy-agent',employeeId:'normal-id'};
assert.equal(context.canDirectMessage(one,normal),false,'Guest POD group access must not confer cross-POD DM');
const unauthorized={...normal,teamId:'pod-1',pod:'POD 1',name:'Cabahug',employeeId:'fake-id'};
assert.equal(qaMessagingGuestPodForMember(roster,unauthorized),'','Only independent QA records get a guest grant');
assert.equal(qaMessagingGuestPodForMember({...roster,employees:{verified:false,entries:qaEntries}},members[1]),'','Unverified roster denied');
assert.equal(qaMessagingGuestPodForMember(roster,{...members[0],active:false}),'','Inactive denied');
assert.equal(qaMessagingGuestPodForMember(roster,{...members[0],identityKind:'firebase-admin',role:'admin'}),'','No admin or other-role grant');
assert.equal(qaMessagingGuestPodForMember(roster,{...members[0],employeeId:'wrong-id'}),'','Wrong stable identity denied');
assert.equal(qaMessagingGuestPodForMember(roster,{...members[1],name:'Other Cabahug'}),'','Unverified same-surname name denied');
assert.equal(qaMessagingGuestPodForMember(roster,{...members[1],pod:'POD 1'}),'','Old POD membership not a QA guest grant');
assert.equal(qaMessagingGuestPodForMember({employees:{verified:true,entries:[...qaEntries,{...qaEntries[1],employeeId:'duplicate'}]}},members[1]),'','Ambiguous surname denied');
assert.equal(qaMessagingGuestPodForMember(roster,{...members[1],employeeId:''}),'','Missing immutable employee ID denied');
assert.equal(qaMessagingGuestPodForMember(roster,{...members[1],name:'Lousie Cabahug',role:'team_leader'}),'','TL role cannot use QA guest grant');
assert(!source.includes('member.pod = guestPod'),'Guest must never change canonical pod');
assert(source.includes('member.messagingGuestTeamIds = guestPod ? [teamIdForPod(guestPod)] : [];'),'Directory must attach verified guest grant');
assert(source.includes('messagingTeamIds(member).includes(teamId)'),'Mentions must honor guest team membership');
assert(source.includes("'x-tt-chat-teams'"),'Socket ticket must carry team ids');
console.log('PASS: 3 QA verified identities granted only POD 2/1/0 team chat; websocket/team token model unchanged; cross-POD DM/TL denied; unverified/duplicate/moved accounts fail closed.');
