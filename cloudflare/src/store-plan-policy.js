/* Server-side store assignment validation: no RTA role, no client-authoritative jobs.
 * Imported by the existing staging Worker.  This module cannot write task metrics.
 */
const norm=s=>String(s??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
const clean=s=>String(s??'').trim().replace(/\s+/g,' ');
export class StorePlanError extends Error {
  constructor(code,message){super(message);this.code=code;this.status=400;}
}
const invalid=(code,msg)=>{throw new StorePlanError(code,msg);};
export function storePlanDate(value,now=new Date()){
  const date=String(value||'');
  const n=Date.parse(date+'T12:00:00.000Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==date)invalid('STORE_PLAN_DATE_INVALID','Use a real YYYY-MM-DD date.');
  if(Math.abs(n-now.getTime())>31*86400000)invalid('STORE_PLAN_DATE_RANGE','Store plans must be within 31 days of today.');
  return date;
}
export function validateStorePlanEntries(entries){
  if(!Array.isArray(entries)||entries.length>80)invalid('STORE_PLAN_ENTRIES_INVALID','Store plan must contain at most 80 ordered stores.');
  const seenOrders=new Set(),seenJobIds=new Set();let totalIds=0;
  return entries.map((raw,i)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid('STORE_PLAN_ROW_INVALID',`Invalid store row ${i+1}.`);
    const store=clean(raw.store),order=raw.order,plannedJobs=raw.plannedJobs;
    if(!store||store.length<3||store.length>120||/[<>\u0000-\u001f]/.test(store)||/^(unknown|unknown store|all|all stores|select a store)$/i.test(store))invalid('STORE_PLAN_STORE_INVALID',`Invalid store on row ${i+1}.`);
    if(!Number.isSafeInteger(order)||order<1||order>999||seenOrders.has(order))invalid('STORE_PLAN_ORDER_INVALID',`Invalid or duplicate order on row ${i+1}.`);
    if(!Number.isSafeInteger(plannedJobs)||plannedJobs<1||plannedJobs>9999)invalid('STORE_PLAN_COUNT_INVALID',`Invalid planned job count on row ${i+1}.`);
    if(!Array.isArray(raw.jobIds)||raw.jobIds.length>1200||raw.jobIds.length>plannedJobs)invalid('STORE_PLAN_JOBS_INVALID',`Invalid assigned job IDs on row ${i+1}.`);
    const jobIds=raw.jobIds.map(job=>clean(job).toUpperCase());
    for(const job of jobIds){
      if(!/^JOB_[A-Z0-9_-]{4,64}$/.test(job)||seenJobIds.has(job))invalid('STORE_PLAN_JOB_ID_INVALID',`Invalid or repeated job ID on row ${i+1}.`);
      seenJobIds.add(job);
    }
    totalIds+=jobIds.length;
    if(totalIds>1200)invalid('STORE_PLAN_TOO_MANY_JOBS','At most 1,200 assigned job IDs per Agent/date.');
    seenOrders.add(order);
    return {order,store,plannedJobs,jobIds};
  }).sort((a,b)=>a.order-b.order);
}
export function canManageStorePlan(actor,target){
  if(!actor||!target||target.role!=='agent'||target.active===false||!target.pod)return false;
  if(actor.role==='admin')return true;
  return actor.role==='team_leader'&&Boolean(actor.pod)&&norm(actor.pod)===norm(target.pod);
}
export function storePlanIdentityKey(name){
  const value=norm(name);
  if(value.length<2||value.length>120)return '';
  return 'agent:'+value;
}
