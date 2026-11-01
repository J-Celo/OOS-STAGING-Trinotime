/* TrinoTime QC Tracker | Store Assignment Queue v1 (Legacy helper; disabled in production)
 * Read-only RTA plan projection. This module NEVER mutates job metrics,
 * store observations, Tracker sessions or server-side records.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.TrinoTimeStoreQueue=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const JOB=/^JOB_[A-Z0-9_-]{4,64}$/;
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const folded=s=>clean(s).toLocaleLowerCase('en');
  const storeIsValid=s=>s.length>=3&&s.length<=120&&!/[<>\x00-\x1f]/.test(s)&&! /^(unknown|unknown store|all|all stores|select a store)$/i.test(s);
  function splitCsv(text){
    if(typeof text!=='string'||text.length>64000)throw Error('RTA CSV must be 64 KB or smaller.');
    const rows=[];let row=[],field='',quoted=false,afterQuote=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;afterQuote=true;}else field+=c;continue;}
      if(c==='"'&&field===''){quoted=true;continue;}
      if(afterQuote&&c!==' '&&c!=='\t'&&c!==','&&c!=='\r'&&c!=='\n')throw Error('Invalid CSV quote formatting.');
      if(c===','){row.push(field);field='';afterQuote=false;continue;}
      if(c==='\r'||c==='\n'){
        if(c==='\r'&&text[i+1]==='\n')i++;
        row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';afterQuote=false;continue;
      }
      if(afterQuote&&c===' ')continue;
      field+=c;
    }
    if(quoted)throw Error('Unclosed CSV quote.');
    row.push(field);if(row.some(v=>v.trim()))rows.push(row);
    return rows;
  }
  function parsePlan(csv){
    const rows=splitCsv(csv);
    if(!rows.length)throw Error('Paste an RTA plan first.');
    const hdr=rows[0].map(v=>folded(v).replace(/[\s_-]+/g,''));
    const pos=name=>hdr.indexOf(name);
    if(pos('order')<0||pos('store')<0||pos('plannedjobs')<0)
      throw Error('CSV header must include order,store,plannedJobs (optional jobIds).');
    const idx={order:pos('order'),store:pos('store'),planned:pos('plannedjobs'),ids:pos('jobids')};
    const rowsIn=rows.slice(1);if(!rowsIn.length||rowsIn.length>80)throw Error('Plan requires 1–80 store rows.');
    const plans=[],orders=new Set(),assigned=new Map();let totalIds=0;
    for(let i=0;i<rowsIn.length;i++){
      const row=rowsIn[i],line=i+2;
      if(row.length>hdr.length)throw Error('Unexpected extra CSV columns on line '+line+'. Quote jobIds containing commas.');
      const store=clean(row[idx.store]);
      if(!storeIsValid(store))throw Error('Invalid store name on line '+line+'.');
      const orderRaw=clean(row[idx.order]);const order=Number(orderRaw);
      if(!/^\d+$/.test(orderRaw)||order<1||order>999||orders.has(order))throw Error('Invalid or repeated store order on line '+line+'.');
      orders.add(order);
      const countRaw=clean(row[idx.planned]),plannedJobs=Number(countRaw);
      if(!/^\d+$/.test(countRaw)||plannedJobs<1||plannedJobs>9999)throw Error('Invalid planned job count on line '+line+'.');
      const rawIds=idx.ids<0?'':clean(row[idx.ids]);
      const jobIds=rawIds?rawIds.split(/[|;\s]+/).map(s=>s.trim().toUpperCase()).filter(Boolean):[];
      if(new Set(jobIds).size!==jobIds.length)throw Error('Duplicate Job ID on line '+line+'.');
      if(jobIds.length>plannedJobs)throw Error('More mapped Job IDs than planned jobs on line '+line+'.');
      for(const jobId of jobIds){
        if(!JOB.test(jobId))throw Error('Invalid Job ID '+jobId+' on line '+line+'.');
        if(assigned.has(jobId))throw Error('Job ID '+jobId+' is assigned twice (orders '+assigned.get(jobId)+' and '+order+').');
        assigned.set(jobId,order);
      }
      totalIds+=jobIds.length;if(totalIds>1200)throw Error('Too many Job IDs in one plan.');
      plans.push({order,store,plannedJobs,jobIds});
    }
    plans.sort((a,b)=>a.order-b.order);
    return plans;
  }
  function scope(_coverage){
    // Disabled in production: never authorize the legacy agent-local CSV plan.
    return null;
  }
  function project(plan,jobs){
    if(!Array.isArray(plan)||!plan.length)return [];
    const observed=jobs&&typeof jobs==='object'&&!Array.isArray(jobs)?jobs:{};
    const byId=new Map();
    for(const [id,job] of Object.entries(observed)){
      if(!JOB.test(String(id).toUpperCase()))continue;
      byId.set(id.toUpperCase(),{store:clean(job?.storeName),submitted:Math.max(0,Number(job?.submitted)||0)});
    }
    return plan.map(entry=>{
      const actual=[...byId].filter(([,r])=>folded(r.store)===folded(entry.store));
      const mapped=new Set(entry.jobIds||[]);
      const conflicts=[...mapped].filter(id=>{
        const seen=byId.get(id);return seen&&seen.store&&folded(seen.store)!==folded(entry.store);
      });
      const unknownMapped=[...mapped].filter(id=>!byId.has(id));
      return {...entry,observedJobs:actual.length,submittedJobs:actual.filter(([,r])=>r.submitted>0).length,
        conflicts,unknownMapped};
    });
  }
  return Object.freeze({parsePlan,project,scope});
});
