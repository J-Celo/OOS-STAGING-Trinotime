// Coverage-only Store Sequence Monitor V1. Pure, read-only task classification.
// Never infer a store from a queue, filter, or an unverified job name.
export const COVERAGE_SEQUENCE_GRACE_MS = 10 * 60 * 1000;
export const COVERAGE_SEQUENCE_MAX_STORES = 12;
export const COVERAGE_SEQUENCE_TTL_MS = 14 * 60 * 60 * 1000;
export const coverageStoreKey = value => String(value ?? '').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
export function validateCoverageSequenceStores(stores) {
  if (!Array.isArray(stores) || stores.length > COVERAGE_SEQUENCE_MAX_STORES) throw Error('COVERAGE_SEQUENCE_STORES_INVALID');
  const result=[],seen=new Set();
  for (const raw of stores) {
    if (typeof raw !== 'string') throw Error('COVERAGE_SEQUENCE_STORES_INVALID');
    const name=raw.trim().replace(/\s+/g,' '),key=coverageStoreKey(name);
    if (name.length<4 || name.length>120 || /[<>\x00-\x1f\x7f]/.test(name) || /^(unknown store|needs review|unmapped)$/i.test(name) || seen.has(key))
      throw Error('COVERAGE_SEQUENCE_STORES_INVALID');
    seen.add(key);result.push(name);
  }
  return result;
}
// Each snapshot has its own non-overlapping effective window and hard expiry.
export function coverageSequenceSnapshotAt(history, ms) {
  if (!Number.isFinite(ms) || ms<=0) return null;
  const snapshots=(Array.isArray(history)?history:[]).filter(s=>s&&s.workflow==='coverage'&&Number.isSafeInteger(s.revision));
  let hit=null;
  for(const s of snapshots){
    if(!Number.isFinite(s.effectiveAtMs)||!Number.isFinite(s.expiresAtMs))continue;
    if(ms>=s.effectiveAtMs && ms<Math.min(s.expiresAtMs,Number.isFinite(s.endedAtMs)?s.endedAtMs:Infinity)){
      if(!hit || s.revision>hit.revision)hit=s;
    }
  }
  return hit;
}
// Task timestamps, not aggregate job timestamps, determine the sequence review result.
export function classifyCoverageSequenceTask({task, mapping, timeline, nowMs=Date.now(), graceMs=COVERAGE_SEQUENCE_GRACE_MS}) {
  if (!task || task.submitted!==true) return {status:'not-eligible',reason:'No verified submitted task'};
  if(mapping?.mappingStatus==='conflict')return {status:'mapping-conflict',reason:'Conflicting store evidence'};
  if (!mapping || mapping.workflow!=='coverage' || !mapping.known || !coverageStoreKey(mapping.storeName) || mapping.mappingStatus==='unknown')
    return {status:'mapping-required',reason:'No verified Coverage Job ID/store pair'};
  const begin=Number(task.startedAt),end=Number(task.endedAt);
  if (!Number.isSafeInteger(begin)||!Number.isSafeInteger(end)||begin<1500000000000||end<begin||end>nowMs+300000 || end-begin>14*3600000)
    return {status:'insufficient-evidence',reason:'Task start/end times are missing or unreliable'};
  const assignedAtStart=coverageSequenceSnapshotAt(timeline,begin);
  if (!assignedAtStart) return {status:'insufficient-evidence',reason:'No verified Coverage authorization at task start'};
  const store=coverageStoreKey(mapping.storeName);
  const approved=Array.isArray(assignedAtStart.stores)&&assignedAtStart.stores.some(s=>coverageStoreKey(s)===store);
  const assignedAtEnd=coverageSequenceSnapshotAt(timeline,end===begin?end:end-1);
  if (!assignedAtEnd) return {status:'insufficient-evidence',reason:'Authorization at task completion is not verifiable'};
  const endApproved=Array.isArray(assignedAtEnd.stores)&&assignedAtEnd.stores.some(s=>coverageStoreKey(s)===store);
  if(approved && endApproved)return {status:'in-sequence',reason:'Authorized during recorded task'};
  // A task started under an active authorization can finish shortly after a TL switch.
  if(approved && !endApproved && assignedAtStart.endedAtMs && end<=assignedAtStart.endedAtMs+graceMs)
    return {status:'authorized-transition',reason:'Started before TL change, completed within transition allowance'};
  // If the TL authorized it midway through, don't characterize earlier work as wrongdoing.
  if(!approved && endApproved)return {status:'insufficient-evidence',reason:'Authorization changed during this task'};
  if(approved && !endApproved) return {status:'review-needed',reason:'Completion exceeded authorized transition allowance'};
  if(!approved && !endApproved)return {status:'review-needed',reason:'Verified store was outside the published Coverage list'};
  return {status:'insufficient-evidence',reason:'Assignment changed during task'};
}
