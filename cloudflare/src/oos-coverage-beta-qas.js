/**
 * Admin-managed QA team, initially activated as a secondary workgroup.
 * The independently authorized promotion operation moves its three verified
 * employees into a first-class QA team while preserving immutable employee IDs,
 * credentials and historical POD assignments. No TL/Admin role is granted.
 * Jhan's independently verified owner/Premium identity must be preserved.
 */
export const OOS_COVERAGE_BETA_QA_ID = 'oos-coverage-beta-qas';
export const OOS_COVERAGE_BETA_QA_LABEL = 'OOS Coverage Beta QAs';
export const OOS_QA_INDEPENDENT_POD = 'OOS Coverage Beta QAs';
export const OOS_QA_PROMOTE_CONFIRM = 'PROMOTE_3_TO_INDEPENDENT_QA_TEAM';
export const OOS_COVERAGE_BETA_QA_DB_PATH = 'workforceQaTeams/v1/oosCoverageBetaQas';
export const OOS_COVERAGE_BETA_QA_ACTIVATE_CONFIRM = 'ACTIVATE_OOS_COVERAGE_BETA_QAS';

export const OOS_COVERAGE_BETA_QA_TARGETS = Object.freeze([
  Object.freeze({ name: 'Jhan Roi Celo', originalPod: 'POD 2', match: 'exact' }),
  Object.freeze({ name: 'March sheen Jacildo', originalPod: 'POD 0', match: 'exact' }),
  // Only a surname was supplied. Require exactly one active POD 1 surname match;
  // never guess a first name or match multiple employees.
  Object.freeze({ name: 'Cabahug', originalPod: 'POD 1', match: 'unique-surname' })
]);

const clean = s => String(s || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const isActive = e => e && e.active !== false && typeof e.name === 'string';
const nameMatches = (member, target) => {
  const n = clean(member.name), wanted = clean(target.name);
  return target.match === 'unique-surname' ? n.split(' ').at(-1) === wanted : n === wanted;
};

export function resolveOosCoverageBetaQas(roster) {
  const entries = Array.isArray(roster?.employees?.entries) ? roster.employees.entries : [];
  const verified = roster?.employees?.verified === true;
  return {
    id: OOS_COVERAGE_BETA_QA_ID,
    label: OOS_COVERAGE_BETA_QA_LABEL,
    workstream: 'OOS',
    teamLeader: null,
    access: 'independent QA team, Admin-managed; no cross-POD personnel access',
    rosterVerified: verified,
    members: OOS_COVERAGE_BETA_QA_TARGETS.map(t => {
      const matches = entries.filter(e => isActive(e) && [clean(t.originalPod),clean(OOS_QA_INDEPENDENT_POD)].includes(clean(e.pod)) && nameMatches(e,t));
      const match = verified && matches.length === 1 ? matches[0] : null;
      return {
        requestedName: t.name,
        originalPod: t.originalPod,
        // An ambiguous surname, mismatched POD, or unverified roster is never applied.
        status: !verified ? 'unverified' : matches.length === 1 ? 'verified' : matches.length > 1 ? 'ambiguous' : 'not_found',
        ...(match ? { name: match.name, currentPod:match.pod, employeeId: String(match.employeeId || match.id || '') } : {})
      };
    })
  };
}

/** Messaging-only POD guest grants for the three independently promoted QAs.
 * The authoritative roster must already be verified. We bind the grant to the
 * unique, active QA employee ID, exact roster name and independent QA pod;
 * no workforce POD membership, TL role, DM capability, or attendance scope changes.
 * This does not authorize former POD records or anyone who shares a surname.
 */
export function qaMessagingGuestPodForMember(roster, member) {
  if (!member || member.active !== true || member.role !== 'agent' ||
      member.identityKind !== 'legacy-agent' ||
      clean(member.pod) !== clean(OOS_QA_INDEPENDENT_POD)) return '';
  const employeeId = String(member.employeeId || '').trim();
  if (!employeeId || roster?.employees?.verified !== true) return '';
  const resolved = resolveOosCoverageBetaQas(roster);
  // The full independent QA team must still resolve to three distinct, active
  // roster identities. An incomplete or ambiguous promotion fails closed.
  if (resolved.members.length !== 3 ||
      resolved.members.some(candidate => candidate.status !== 'verified' || !String(candidate.employeeId || '').trim()) ||
      new Set(resolved.members.map(candidate => String(candidate.employeeId).trim())).size !== 3) return '';
  const matches = resolved.members.filter(candidate =>
    candidate.status === 'verified' &&
    clean(candidate.currentPod) === clean(OOS_QA_INDEPENDENT_POD) &&
    clean(candidate.name) === clean(member.name) &&
    String(candidate.employeeId || '').trim() === employeeId);
  // Do not allow duplicate or ambiguous employee identities to gain access.
  if (matches.length !== 1) return '';
  const target = matches[0];
  return ['POD 0', 'POD 1', 'POD 2'].includes(target.originalPod) ? target.originalPod : '';
}

/** The actor must have already passed TrinoTime's server identity and roster checks. */
export function getOosCoverageBetaQasForActor(roster, actor) {
  const resolved = resolveOosCoverageBetaQas(roster);
  if (actor?.role === 'admin') return { ...resolved, authorized: true, scope: 'admin-preview' };
  if (actor?.role !== 'agent') return null;
  const member = resolved.members.find(m => m.status === 'verified' && clean(m.name) === clean(actor.name) && clean(m.currentPod) === clean(actor.pod));
  if (!member) return null;
  return { id:resolved.id, label:resolved.label, workstream:'OOS', teamLeader:null,
    authorized:true,scope:'self-only',member:{name:member.name,originalPod:member.originalPod,currentPod:member.currentPod},
    crossPodAccessGranted:false };
}

/** The initial QA activation is an audited membership manifest; it does not
 * change the workforce roster. The independent team migration is a separate,
 * Admin-confirmed transaction that preserves historical records. */
export function buildOosQaActivation(roster, {byUid='',at=''}={}) {
  const resolved=resolveOosCoverageBetaQas(roster);
  if(!resolved.rosterVerified || resolved.members.length!==3 || resolved.members.some(m=>m.status!=='verified'||!m.employeeId))return null;
  if(new Set(resolved.members.map(m=>m.employeeId)).size!==3)return null;
  return {schemaVersion:1,id:resolved.id,label:resolved.label,workstream:'OOS',teamLeader:null,
    status:'active',members:resolved.members.map(m=>({name:m.name,originalPod:m.originalPod,employeeId:m.employeeId})),
    activatedAt:at,activatedByUid:byUid};
}
export function oosQaManifestCurrent(manifest,roster) {
  const expected=buildOosQaActivation(roster);
  if(!expected||manifest?.schemaVersion!==1||manifest?.id!==expected.id||manifest?.status!=='active'||!Array.isArray(manifest.members)||manifest.members.length!==expected.members.length)return false;
  return expected.members.every(m=>manifest.members.some(v=>clean(v.name)===clean(m.name)&&clean(v.originalPod)===clean(m.originalPod)&&String(v.employeeId)===m.employeeId));
}
export function oosQaActorAuthorized(manifest,roster,actor) {
  if(!oosQaManifestCurrent(manifest,roster)||actor?.role!=='agent')return false;
  const resolved=getOosCoverageBetaQasForActor(roster,actor);
  if(!resolved||resolved.scope!=='self-only')return false;
  return manifest.members.some(m=>clean(m.name)===clean(actor.name)&&clean(m.originalPod)===clean(resolved.member.originalPod));
}
export function oosQaAggregateByPod(rosterAgents,coverageDaily,confirmationDaily,keyForAgent,date) {
  const pods=Array.from({length:17},(_,i)=>({pod:`POD ${i}`,agents:0,coverageSubmissions:0,confirmationSubmissions:0,activeCoverageAgents:0,activeConfirmationAgents:0}));
  const byName=new Map(pods.map((p,i)=>[p.pod,i]));
  for(const agent of rosterAgents||[]){
    const index=byName.get(String(agent.pod||''));
    if(index===undefined||!agent.name)continue;
    const row=pods[index],key=keyForAgent(agent.name);
    row.agents++;
    const c=coverageDaily?.[key],f=confirmationDaily?.[key];
    const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(100000,Math.floor(Number(value)))):0;
    if(c&&typeof c==='object'){row.activeCoverageAgents++;row.coverageSubmissions+=count(c.submitted);}
    if(f&&typeof f==='object'){row.activeConfirmationAgents++;row.confirmationSubmissions+=count(f.submitted);}
  }
  const totals=pods.reduce((a,p)=>({agents:a.agents+p.agents,coverageSubmissions:a.coverageSubmissions+p.coverageSubmissions,
    confirmationSubmissions:a.confirmationSubmissions+p.confirmationSubmissions,activeCoverageAgents:a.activeCoverageAgents+p.activeCoverageAgents,
    activeConfirmationAgents:a.activeConfirmationAgents+p.activeConfirmationAgents}),{agents:0,coverageSubmissions:0,confirmationSubmissions:0,activeCoverageAgents:0,activeConfirmationAgents:0});
  return {date,pods,totals};
}

// One-time, Admin-reviewed TrinoTime INTERNAL identifiers for QA roster members
// whose authoritative record never had an employeeId. These are not employer
// personnel numbers and are never used to change a login UID, original POD,
// payroll rate, attendance identity, or workforce role.
export const OOS_QA_INTERNAL_ID_CONFIRM = 'ISSUE_TRINOTIME_QA_IDS';
export function planOosQaInternalIds(roster, issueId=()=> '') {
  const entries=roster?.employees?.entries;
  const result={ready:false,reason:'',pending:[],entries:null};
  if(roster?.employees?.verified!==true || !Array.isArray(entries) || entries.length!==281){
    return {...result,reason:'Expected the verified, recovered 281-person production roster.'};
  }
  const team=resolveOosCoverageBetaQas(roster);
  if(team.members.length!==3 || team.members.some(m=>m.status!=='verified')){
    return {...result,reason:'Three unique active QA name/POD records are required.'};
  }
  const used=new Set();
  for(const entry of entries){
    const id=String(entry?.employeeId||entry?.id||'').trim();
    if(!id)continue;
    if(used.has(id.toLowerCase()))return {...result,reason:'An existing employee ID is duplicated.'};
    used.add(id.toLowerCase());
  }
  const lookup=(name,pod)=>entries.map((entry,index)=>({entry,index})).filter(x=>
    clean(x.entry?.name)===clean(name)&&clean(x.entry?.pod)===clean(pod)&&isActive(x.entry));
  const jhan=lookup('Jhan Roi Celo','POD 2');
  if(jhan.length!==1 || !String(jhan[0].entry.employeeId||jhan[0].entry.id||'').trim()){
    return {...result,reason:'Jhan’s existing stable roster employee ID must be preserved.'};
  }
  const pending=[];
  for(const [name,pod] of [['March Sheen Jacildo','POD 0'],['Cabahug','POD 1']]){
    const found=lookup(name,pod);
    if(found.length!==1)return {...result,reason:'Expected one exact existing QA record in its original POD.'};
    if(!String(found[0].entry.employeeId||found[0].entry.id||'').trim())pending.push({name,pod,index:found[0].index});
  }
  const next=entries.map(entry=>({...entry}));
  for(const target of pending){
    const id=String(issueId(target.name,target.pod)||'').trim();
    if(!id)continue; // Read-only preview calls do not mint an ID.
    if(!/^tt_emp_internal_[a-f0-9]{32}$/.test(id)||used.has(id.toLowerCase())){
      return {...result,reason:'Generated internal ID failed format or uniqueness checks.'};
    }
    used.add(id.toLowerCase());
    next[target.index].employeeId=id;
  }
  return {ready:true,reason:'',pending:pending.map(({name,pod})=>({name,pod})),entries:next};
}

/** Pure preview: no DB writes and no generated IDs. Never infer a surname from
 * a different POD, replace a credential, or change more than these three rows. */
export function planIndependentOosQaPromotion(roster, manifest) {
  const rows=roster?.employees?.entries;
  const fail = reason => ({ready:false,reason,noWrites:true});
  if(roster?.employees?.verified!==true || !Array.isArray(rows) || rows.length!==281)
    return fail('Expected a verified 281-employee recovered roster; refresh the production backup before review.');
  if(!oosQaManifestCurrent(manifest,roster))return fail('The existing three-member QA activation must still match the roster.');
  const members=resolveOosCoverageBetaQas(roster).members;
  if(members.some(m=>m.status!=='verified'||!m.employeeId)||new Set(members.map(m=>m.employeeId.toLowerCase())).size!==3)
    return fail('All three QAs must have unique stable employee IDs.');
  if(rows.filter(x=>x && x.pod===OOS_QA_INDEPENDENT_POD && x.active!==false).some(x=>!members.some(m=>m.name===x.name)))
    return fail('Unreviewed members already exist in the protected QA team.');
  const updated=rows.map(x=>({...x}));
  const transfers=[];
  for(const member of members){
    const index=updated.findIndex(x=>x.name===member.name&&String(x.employeeId||x.id||'')===member.employeeId);
    if(index<0)return fail('A QA employee identity changed.');
    const before=updated[index];
    if(before.pod!==member.originalPod && before.pod!==OOS_QA_INDEPENDENT_POD)
      return fail('A QA current POD is outside the approved historical transfer or target QA team.');
    if(before.pod===OOS_QA_INDEPENDENT_POD){
      if(String(before.role||'').toLowerCase()!=='qa')return fail('An existing QA-team row has an unexpected role.');
      continue;
    }
    transfers.push({name:before.name,employeeId:member.employeeId,from:before.pod,to:OOS_QA_INDEPENDENT_POD});
    updated[index]={...before,pod:OOS_QA_INDEPENDENT_POD,role:'qa',jobTitle:'Quality Assurance',
      previousPod:before.pod,qaWorkgroup:'oos-coverage-beta-qas',supervisorRole:'admin'};
  }
  if(!transfers.length)return {ready:true,alreadyPromoted:true,noWrites:true,transfers:[],entries:updated,expectedCount:281};
  if(transfers.length!==3)return fail('A partial team migration was detected; review manually before writing.');
  const countPerPod=(list,pod)=>list.filter(x=>x&&x.active!==false&&x.pod===pod).length;
  for(const pod of ['POD 0','POD 1','POD 2'])if(countPerPod(updated,pod)!==countPerPod(rows,pod)-1)
    return fail('A non-target POD count changed unexpectedly.');
  if(updated.length!==rows.length)return fail('Employee roster count changed unexpectedly.');
  return {ready:true,alreadyPromoted:false,noWrites:true,transfers,entries:updated,expectedCount:281,
    previousCounts:{'POD 0':countPerPod(rows,'POD 0'),'POD 1':countPerPod(rows,'POD 1'),'POD 2':countPerPod(rows,'POD 2')},
    nextCounts:{'POD 0':countPerPod(updated,'POD 0'),'POD 1':countPerPod(updated,'POD 1'),'POD 2':countPerPod(updated,'POD 2'),[OOS_QA_INDEPENDENT_POD]:countPerPod(updated,OOS_QA_INDEPENDENT_POD)}};
}
