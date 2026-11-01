// Versioned edits are merged into the canonical roster, never into a client projection.
const name = v => String(v ?? '').trim();
const lower = v => name(v).toLowerCase();
const reject = () => { throw new Error('Invalid or unauthorized roster intent'); };
export function mergeRosterIntents(state, actor, body, now = new Date().toISOString()) {
  if (!['agent','team_leader'].includes(actor?.role) || !actor.name || !actor.pod) reject();
  if (!state.employees?.verified || !state.podDirectory?.verified || !state.teamLeaderDirectory?.verified) reject();
  if (!body || Object.keys(body).some(k => !['operations','baseVersion','targetVersion','mutationId'].includes(k))) reject();
  if (!Array.isArray(body.operations) || !body.operations.length || body.operations.length > 100) reject();
  if (!name(body.baseVersion) || body.baseVersion !== String(state.employees.version || '') ||
      !name(body.targetVersion) || body.targetVersion === body.baseVersion || !name(body.mutationId) ||
      body.targetVersion.length > 180 || body.mutationId.length > 180) reject();
  if (actor.role === 'agent' && (body.operations.length !== 1 || body.operations[0].operation !== 'rename')) reject();
  const entries = structuredClone(state.employees.entries || []), touched = new Set();
  const validName = v => typeof v === 'string' && v.trim() && v.trim().length <= 120 && !/[\x00-\x1f]/.test(v);
  for (const op of body.operations) {
    const fields = {add:['operation','newName'], remove:['operation','targetName'], rename:['operation','targetName','newName'], transfer:['operation','targetName','newPod']}[op?.operation];
    if (!fields || Object.keys(op).some(k => !fields.includes(k))) reject();
    if (op.operation === 'add') {
      if (actor.role !== 'team_leader' || !validName(op.newName) || entries.some(e => lower(e.name) === lower(op.newName))) reject();
      entries.push({name:name(op.newName),pod:actor.pod}); continue;
    }
    if (!validName(op.targetName) || touched.has(lower(op.targetName))) reject();
    touched.add(lower(op.targetName));
    const matches = entries.map((e,i)=>({e,i})).filter(x=>lower(x.e.name)===lower(op.targetName));
    if (matches.length !== 1 || matches[0].e.pod !== actor.pod || matches[0].e.active === false) reject();
    const {e,i} = matches[0];
    if (actor.role === 'agent' && lower(e.name) !== lower(actor.name)) reject();
    if (op.operation === 'remove') { entries.splice(i,1); continue; }
    if (op.operation === 'rename') {
      if (!validName(op.newName) || name(op.newName)===name(e.name) || entries.some((x,j)=>j!==i&&lower(x.name)===lower(op.newName))) reject();
      e.name=name(op.newName); continue;
    }
    const pods=state.podDirectory.entries || [], from=pods.find(p=>p.id===actor.pod&&p.active!==false), to=pods.find(p=>p.id===op.newPod&&p.active!==false);
    if (actor.role!=='team_leader' || !from?.team || from.team!==to?.team || from.id===to.id) reject();
    e.pod=to.id;
    e.podTransferHistory=[...(Array.isArray(e.podTransferHistory)?e.podTransferHistory:[]),{fromPod:from.id,toPod:to.id,at:now,by:actor.name}].slice(-20);
  }
  return {entries,baseVersion:body.baseVersion,targetVersion:body.targetVersion,mutationId:body.mutationId};
}
