// M2.9.63 — prepare an employee-roster edit using an authoritative server snapshot.
// Clients submit one limited intent, never the complete cross-POD employee document.
// The caller must still pass Worker workforce authentication and the existing
// authorizeRosterEmployeeMutationServer before an atomic, version-checked commit.
const norm = value => String(value ?? '').trim();
const lowered = value => norm(value).toLocaleLowerCase('en');
function denied(message) { const error=new Error(message); error.code='SCOPED_ROSTER_PATCH_DENIED'; throw error; }
function cleanName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\r\n\t\x00-\x1f]/.test(value)) denied('Invalid roster display name.');
  return value.trim();
}
export function scopedRosterEmployeePatchM2963(state, actor, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) denied('Invalid roster edit.');
  if (!state?.employees?.verified || !state?.podDirectory?.verified || !state?.teamLeaderDirectory?.verified)
    denied('Verified authoritative roster required.');
  const role=norm(actor?.role),pod=norm(actor?.pod),actorName=norm(actor?.name);
  if (!['agent','team_leader'].includes(role) || !pod || !actorName) denied('Verified workforce identity required.');
  const operation=norm(body.operation);
  if (!['rename','transfer'].includes(operation) || (operation==='transfer' && role!=='team_leader')) denied('Operation not permitted.');
  const allowedFields=operation==='rename' ? ['operation','targetName','newName','baseVersion','targetVersion','mutationId'] : ['operation','targetName','newPod','baseVersion','targetVersion','mutationId'];
  if (Object.keys(body).some(key=>!allowedFields.includes(key))) denied('Unrecognized roster edit field.');
  const baseVersion=norm(body.baseVersion),targetVersion=norm(body.targetVersion),mutationId=norm(body.mutationId);
  if (!baseVersion || !targetVersion || baseVersion===targetVersion || !mutationId || targetVersion.length>180 || mutationId.length>180)
    denied('Valid roster base, target version and mutation ID required.');
  if (baseVersion!==String(state.employees.version||'')) denied('Roster version changed. Refresh before editing.');
  const targetName=role==='agent'?actorName:cleanName(body.targetName);
  if (role==='agent' && body.targetName!==undefined && lowered(body.targetName)!==lowered(actorName)) denied('Agents may edit only their own identity.');
  const entries=Array.isArray(state.employees.entries)?state.employees.entries:[];
  const matches=entries.map((value,index)=>({value,index})).filter(({value})=>lowered(value?.name)===lowered(targetName));
  if (matches.length!==1 || norm(matches[0].value.pod)!==pod || matches[0].value.active===false) denied('Target not found in authorized active POD.');
  const after={...matches[0].value};
  if(operation==='rename'){
    const newName=cleanName(body.newName);
    if (lowered(newName)===lowered(after.name)) denied('No roster rename was requested.');
    after.name=newName;
  } else {
    const newPod=norm(body.newPod);
    const pods=Array.isArray(state.podDirectory.entries)?state.podDirectory.entries:[];
    const from=pods.find(x=>x?.id===pod && x.active!==false);
    const to=pods.find(x=>x?.id===newPod && x.active!==false);
    if(!from || !to || pod===newPod || !norm(from.team) || norm(from.team)!==norm(to.team)) denied('Transfers must stay within the authorized team.');
    after.pod=newPod;
    // Make server, not the browser, own transfer history. Preserves existing
    // history and avoids user-supplied time/actor impersonation.
    const history=Array.isArray(after.podTransferHistory)?after.podTransferHistory.slice():[];
    after.podTransferHistory=[...history,{
      fromPod:pod,toPod:newPod,at:new Date().toISOString(),by:actorName
    }].slice(-20);
  }
  const next=entries.slice();next[matches[0].index]=after;
  return {operation,entries:next,baseVersion,targetVersion,mutationId};
}
export function scopedRosterPatchReceiptM2963(result) {
  // Never send a full cross-POD document back to Agent/TL clients, even on conflict.
  return {remoteSaved:result?.remoteSaved===true,alreadyCommitted:result?.alreadyCommitted===true,
    conflict:result?.conflict===true,remoteVersion:result?.conflict?String(result?.remoteVersion||''):undefined,
    version:result?.remoteSaved?String(result?.version||''):undefined,
    scope:result?.scope||'authorized-roster-patch',rosterRefreshRequired:true};
}
