/** UX18P30: Admin single-Agent roster addition planning (pure, fail closed).
 * The caller commits through the existing ETag CAS roster writer; it never
 * trusts or replaces a browser-side whole-roster draft.
 */
export class AdminRosterAddError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
const reject=(status,code,message)=>{throw new AdminRosterAddError(status,code,message)};
const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
// A TL can also work as an Agent for a different workstream. Existing
// TrinoTime authentication still keys many sessions by account name, so
// NEVER put the same account name in both TL and Agent rosters. The explicit
// Admin opt-in instead creates an independent Agent login identity.
export const DUAL_ROLE_AGENT_SUFFIX = ' [Albertsons Agent]';
export function dualRoleAgentLoginName(fullName,pod){
  const name=clean(fullName),dest=clean(pod);
  return dest.startsWith('Albertsons · POD ')?name+DUAL_ROLE_AGENT_SUFFIX:'';
}
export function isCrossWorkstreamDualRoleAllowed(tlPod,agentPod){
  return !clean(tlPod).startsWith('Albertsons · ') && clean(agentPod).startsWith('Albertsons · POD ');
}
export function planAdminRosterAdd(state,actor,body){
  if(actor?.role!=='admin')reject(403,'ROSTER_ADMIN_REQUIRED','Admin authorization is required to add an Agent.');
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['name','pod','mutationId','separateAgentRole'].includes(k)))
    reject(400,'ROSTER_ADD_INVALID','Invalid roster add request.');
  const requestedName=clean(body.name),pod=clean(body.pod),mutationId=clean(body.mutationId);
  if(!requestedName||requestedName.length>60||/[\x00-\x1f]/.test(requestedName)||!pod||!mutationId||mutationId.length>180||
     (body.separateAgentRole!==undefined&&body.separateAgentRole!==true&&body.separateAgentRole!==false))
    reject(400,'ROSTER_ADD_INVALID','Agent name, POD, and mutation ID are required.');
  if(state?.employees?.verified!==true||state?.podDirectory?.verified!==true||state?.teamLeaderDirectory?.verified!==true||!clean(state.employees.version))
    reject(503,'ROSTER_ADD_UNVERIFIED','The verified server roster is unavailable. No Agent was added.');
  const allowed=(state.podDirectory.entries||[]).some(e=>e?.active!==false&&clean(e?.id)===pod&&!/qa|coverage beta qa/i.test(clean(e?.id)));
  if(!allowed)reject(400,'ROSTER_ADD_INVALID_POD','The selected Agent POD is unavailable or protected.');
  const key=requestedName.toLocaleLowerCase('en-US');
  const tl=(state.teamLeaderDirectory.entries||[]).find(e=>e?.active!==false&&clean(e?.name).toLocaleLowerCase('en-US')===key);
  if(tl && (!body.separateAgentRole || !isCrossWorkstreamDualRoleAllowed(tl.pod,pod)))
    reject(409,'ROSTER_ADD_TL_COLLISION','This name belongs to a Team Leader. To create a separate Albertsons Agent login, use the explicit dual-role confirmation.');
  if(!tl&&body.separateAgentRole)reject(400,'ROSTER_DUAL_ROLE_TL_REQUIRED','Dual-role Agent creation requires a verified Team Leader identity.');
  // Separate role-scoped login name prevents the TL authorization/session keys
  // from being reused for Agent Attendance, Tracker and credentials.
  const name=tl?dualRoleAgentLoginName(requestedName,pod):requestedName;
  if(!name||name.length>60)reject(400,'ROSTER_DUAL_ROLE_NAME_LENGTH','The role-separated Agent login would exceed the 60-character limit. No Agent was added.');
  const accountKey=name.toLocaleLowerCase('en-US');
  if((state.teamLeaderDirectory.entries||[]).some(e=>e?.active!==false&&clean(e?.name).toLocaleLowerCase('en-US')===accountKey))
    reject(409,'ROSTER_ADD_TL_COLLISION','The proposed Agent login collides with a Team Leader.');
  const matches=(state.employees.entries||[]).filter(e=>clean(e?.name).toLocaleLowerCase('en-US')===accountKey);
  if(matches.length){
    if(matches.length>1)reject(409,'ROSTER_ADD_DUPLICATE','The verified roster has duplicate names; Admin review is required.');
    const existing=matches[0];
    if(clean(existing.pod)!==pod||existing.active===false)reject(409,'ROSTER_ADD_EXISTS_OTHER_POD','This Agent account exists in another POD. Review it; do not add a duplicate.');
    if(tl && (clean(existing.fullName).toLocaleLowerCase('en-US')!==key || clean(existing.separateRoleFromTlPod)!==clean(tl.pod)))
      reject(409,'ROSTER_DUAL_ROLE_ACCOUNT_CONFLICT','The separate Agent account already exists with different identity evidence. Admin review required.');
    return {alreadyAssigned:true,name,pod,...(tl?{displayName:requestedName,separateAgentRole:true}:{}),version:String(state.employees.version)};
  }
  if(tl && (state.employees.entries||[]).some(e=>e?.active!==false&&clean(e?.pod)===pod&&
        clean(e?.fullName).toLocaleLowerCase('en-US')===key && clean(e?.name).toLocaleLowerCase('en-US')!==accountKey))
    reject(409,'ROSTER_DUAL_ROLE_EXISTING_IDENTITY','An Agent record with this display name already exists in the destination POD; review it before creating another account.');
  // A raw Agent with this exact account name would be ambiguous even with a
  // role-scoped alias, so reject rather than silently relocating/renaming it.
  if(tl && (state.employees.entries||[]).some(e=>clean(e?.name).toLocaleLowerCase('en-US')===key))
    reject(409,'ROSTER_DUAL_ROLE_EXISTING_IDENTITY','An Agent identity already uses the TL account name. Reconcile it before creating a separate Agent login.');
  const addition=tl
    ? {name,pod,fullName:requestedName,role:'agent',separateRoleFromTlPod:clean(tl.pod),separateRoleFromTlName:requestedName}
    : {name,pod};
  return {alreadyAssigned:false,name,pod,...(tl?{displayName:requestedName,separateAgentRole:true}:{}),baseVersion:String(state.employees.version),
    targetVersion:mutationId,mutationId,entries:[...state.employees.entries,addition]};
}

/** UX18P31: plan a one-time canonical TL verification, without changing any
 * Team Leader identity/assignment. Reject missing, mismatched or stale evidence.
 * Callers must ETag-CAS the *single TL document* and verify its readback.
 */
export function planAdminTlDirectoryVerification(state, legacy, secure){
  if(state?.policy?.secureReadsEnabled===false || state?.policy?.allowLegacyFallback===false ||
     state?.employees?.verified!==true || state?.podDirectory?.verified!==true ||
     state?.teamLeaderDirectory?.verified===true || state?.teamLeaderDirectory?.source!=='legacy-kv')
    reject(503,'ROSTER_TL_VERIFICATION_BLOCKED','Team Leader verification needs trusted server roster sources. No Agent was added.');
  const rows=legacy?.entries;
  if(!Array.isArray(rows)||rows.length<1||rows.length>100 || rows.some(row=>!row||typeof row!=='object'))
    reject(409,'ROSTER_TL_VERIFICATION_CONFLICT','The legacy Team Leader directory is unavailable or invalid; Admin reconciliation is required.');
  const comparable=doc=>JSON.stringify({revision:Number(doc?.revision)||0,entries:doc?.entries||[]});
  if(comparable(legacy)!==comparable(state.teamLeaderDirectory))
    reject(409,'ROSTER_TL_VERIFICATION_CONFLICT','The Team Leader source changed; refresh before adding an Agent.');
  if(secure && comparable(secure)!==comparable(legacy))
    reject(409,'ROSTER_TL_VERIFICATION_CONFLICT','The secure and legacy Team Leader directories disagree; no roster change was made.');
  const employees=new Set((state.employees.entries||[]).map(row=>clean(row?.name).toLocaleLowerCase('en-US')));
  const pods=new Set((state.podDirectory.entries||[]).filter(row=>row?.active!==false).map(row=>clean(row?.id)));
  const names=new Set(),activePods=new Set();
  for(const row of rows){
    const name=clean(row?.name),pod=clean(row?.pod),key=name.toLocaleLowerCase('en-US');
    if(!name||!pod||!pods.has(pod)||/qa|coverage beta qa/i.test(pod)||names.has(key)||
       employees.has(key)||(row.active!==false&&activePods.has(pod)))
      reject(409,'ROSTER_TL_VERIFICATION_CONFLICT','Team Leader identities or POD assignments need review before any Agent addition.');
    names.add(key);if(row.active!==false)activePods.add(pod);
  }
  return {revision:Number(legacy.revision)||0,entries:legacy.entries};
}
