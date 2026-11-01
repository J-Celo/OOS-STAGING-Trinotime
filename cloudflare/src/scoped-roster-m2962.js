// M2.9.62: Authorization-specific presentation of the *existing* roster snapshot.
// No Firebase reads/writes here. This gate is server-side; never trust a pod
// requested by a client as the actor's actual authorized POD.
const normalized = value => String(value ?? '').trim();
const doc = (source, entries) => ({
  schemaVersion: source?.schemaVersion ?? 1,
  ...(source?.version === undefined ? {} : { version: source.version }),
  ...(source?.revision === undefined ? {} : { revision: source.revision }),
  verified: source?.verified === true,
  entries
});
const samePod = (record, pod) => record && normalized(record.pod) === pod;
// Never include credential material in any client-facing roster document, even
// for Admins or when a legacy employee record accidentally carries those fields.
const privateField = key => /(?:password|passwd|credential|(?:^|_)secret|privatekey|private_key|token|salt|hash|apikey|api_key|recoverycode|recovery_code)/i.test(key);
export function redactRosterSecretsM2966(value) {
  if (Array.isArray(value)) return value.map(redactRosterSecretsM2966);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !privateField(key))
    .map(([key,entry]) => [key,redactRosterSecretsM2966(entry)]));
}

// Editing a redacted Admin projection must not erase hidden legacy fields.
// Credentials still belong to the vault service; roster edits cannot change them.
export function preserveRosterSecretsM2966(original, incoming) {
  if (Array.isArray(original)) return Array.isArray(incoming)
    ? incoming.map((entry,index)=>preserveRosterSecretsM2966(original[index],entry)) : incoming;
  if (!original || typeof original !== 'object' || !incoming || typeof incoming !== 'object') return incoming;
  const out={...incoming};
  for(const [key,value] of Object.entries(original)) {
    if(privateField(key)) out[key]=structuredClone(value);
    else if(Object.hasOwn(out,key)) out[key]=preserveRosterSecretsM2966(value,out[key]);
  }
  return out;
}

export function scopeRosterSnapshotM2962(state, actor) {
  const role = normalized(actor?.role);
  if (!['admin','team_leader','agent'].includes(role)) throw new Error('Authorized workforce role required');
  if (role === 'admin') return { ...redactRosterSecretsM2966(state), scope: 'all-pods' };
  const pod = normalized(actor?.pod);
  const name = normalized(actor?.name).toLowerCase();
  if (!pod || !name) throw new Error('Verified workforce POD and identity required');
  const pods = (Array.isArray(state?.podDirectory?.entries) ? state.podDirectory.entries : [])
    .filter(item => item && normalized(item.id) === pod)
    .map(item => ({ id:item.id, name:item.name, team:item.team,
      active:item.active !== false, system:item.system === true,
      shiftGroupId:item.shiftGroupId ?? null }));
  if (pods.length !== 1) throw new Error('Workforce POD not found in authoritative directory');
  const leaderEntries = (Array.isArray(state?.teamLeaderDirectory?.entries) ? state.teamLeaderDirectory.entries : [])
    .filter(item => samePod(item,pod))
    .map(item => ({ name:item.name, pod:item.pod, active:item.active !== false }));
  const employeeEntries = (Array.isArray(state?.employees?.entries) ? state.employees.entries : [])
    .filter(item => samePod(item,pod))
    .map(item => {
      if (role === 'team_leader' || normalized(item.name).toLowerCase() === name) return redactRosterSecretsM2966(item);
      // Agents may see coworker names for staffing, but not other employees'
      // HR/payroll/contact fields or internal metadata from the roster document.
      return { name:item.name, pod:item.pod, active:item.active !== false, role:'agent' };
    });
  return {
    authority: 'workforce-roster-v1',
    scope: role === 'team_leader' ? 'own-pod' : 'own-pod-minimal-coworkers',
    transferDestinations:role==='team_leader'?(state.podDirectory.entries||[]).filter(p=>p.active!==false&&p.id!==pod&&normalized(p.id)!=='OOS Coverage Beta QAs'&&normalized(p.team)===normalized(pods[0].team)).map(p=>({id:p.id,name:p.name,team:p.team,active:true,shiftGroupId:p.shiftGroupId??null})):[],
    podDirectory:doc(state.podDirectory,pods),
    teamLeaderDirectory:doc(state.teamLeaderDirectory,leaderEntries),
    employees:doc(state.employees,employeeEntries)
  };
}
