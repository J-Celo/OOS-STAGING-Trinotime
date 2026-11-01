// Production safety invariant: a filtered/partial roster must not replace the organization roster.
// Pure preflight; no database reads or writes. Intentional broad restructures require a separate reviewed workflow.
function key(row) {
  const id=String(row?.employeeId||row?.id||'').trim().toLocaleLowerCase('en');
  const name=String(row?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
  // Name is used as a fallback because most historic employees have no immutable employeeId.
  return id?`id:${id}`:`name:${name}`;
}
export function assessBulkRosterRemoval(currentEntries, nextEntries) {
  const before=Array.isArray(currentEntries)?currentEntries:[];
  const after=Array.isArray(nextEntries)?nextEntries:[];
  if(before.length<10)return {blocked:false,previousCount:before.length,nextCount:after.length,removedCount:0,emptiedPods:[]};
  const afterKeys=new Set(after.map(key));
  const removed=before.filter(row=>!afterKeys.has(key(row)));
  const countByPod=(entries)=>{
    const counts=new Map();for(const e of entries){const p=String(e?.pod||'').trim();if(p)counts.set(p,(counts.get(p)||0)+1);}
    return counts;
  };
  const prevPods=countByPod(before),newPods=countByPod(after);
  const emptiedPods=[...prevPods].filter(([pod,count])=>count>=3&&!newPods.has(pod)).map(([pod])=>pod);
  const maxNormalRemoval=Math.max(5,Math.ceil(before.length*0.15));
  return {blocked:removed.length>=maxNormalRemoval||emptiedPods.length>0,previousCount:before.length,nextCount:after.length,removedCount:removed.length,emptiedPods};
}
