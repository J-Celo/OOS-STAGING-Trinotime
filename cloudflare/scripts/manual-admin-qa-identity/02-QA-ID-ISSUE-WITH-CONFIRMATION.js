// TrinoTime OOS — one-time audited, Admin-authorized QA internal IDs.
// Requires the server-side QA internal-ID fix and an exact confirmation phrase.
// Only TWO existing employeeId fields may be issued (March/POD0 and Cabahug/POD1).
// No new user accounts, external corporate IDs, profile or original POD changes.
(async () => {
  'use strict';
  const origin='https://oos.trinotime.com';
  if(location.origin!==origin)throw new Error('Wrong site. Open production first.');
  const user=window.firebase?.auth?.().currentUser;
  if(!user||user.isAnonymous||typeof user.getIdToken!=='function')throw new Error('Sign in as production Admin first.');
  const token=await user.getIdToken(false);
  const req=async body=>{
    const response=await fetch(origin+'/api/workforce/qa-team/internal-ids',{
      method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw new Error(`Server HTTP ${response.status}: ${String(data.error?.code||data.code||'no success receipt')}. If you already clicked confirm, check Admin before retrying.`);
    return data;
  };
  const preflight=await req({dryRun:true});
  if(preflight.currentCount!==281||preflight.assignCount!==2||!preflight.noWrites)
    throw new Error('STOP: The live roster or pending assignment count differs from the reviewed 281/2 snapshot. No write.');
  console.info('QA ID preflight passed: 281 employees; exactly 2 missing TrinoTime internal IDs. No write yet.');
  const confirmation=prompt('Authorized TrinoTime INTERNAL employee identifiers ONLY (not employer IDs). March remains POD 0; Cabahug remains POD 1. Type exactly ISSUE 2 QA IDS to approve this ONE roster update. Cancel makes no changes.');
  if(confirmation!=='ISSUE 2 QA IDS'){console.info('Canceled. No data changed.');return;}
  const receipt=await req({confirm:'ISSUE_TRINOTIME_QA_IDS'});
  if(receipt.assigned!==2||receipt.rosterCount!==281||receipt.readyToActivate!==true)
    throw new Error('Server response unexpected. Do not retry; review live roster and QA preview.');
  console.info('QA INTERNAL IDS CONFIRMED: 2 new TrinoTime-only IDs persisted. 281 employee records preserved. QA not yet activated.');
  console.info('Now refresh QA card and click Activate verified QA team once. Do not rerun this snippet.');
})().catch(error=>console.error('QA internal IDs stopped:',error.message));
