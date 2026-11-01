// TrinoTime OOS — read-only server preflight for internally-issued QA IDs.
// Run ONLY as Admin on https://oos.trinotime.com/ after deploying the
// production QA internal-ID fix. This script writes NOTHING.
(async () => {
  'use strict';
  const origin='https://oos.trinotime.com';
  if(location.origin!==origin)throw new Error('Wrong site. Open production first.');
  const user=window.firebase?.auth?.().currentUser;
  if(!user||user.isAnonymous||typeof user.getIdToken!=='function')throw new Error('Sign in as an authorized production Admin.');
  const token=await user.getIdToken(false);
  const response=await fetch(origin+'/api/workforce/qa-team/internal-ids',{
    method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({dryRun:true})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok||data.dryRun!==true||data.noWrites!==true)
    throw new Error(`PREFLIGHT STOPPED: HTTP ${response.status}; ${String(data.error?.code||data.code||'check deployment/Admin role')}. No writes.`);
  console.info(`QA ID READ-ONLY PREFLIGHT PASSED: ${data.currentCount} employee records; ${data.assignCount} internal IDs need to be issued. ZERO writes.`);
  if(data.assignCount!==2)console.warn('Expected two missing IDs. STOP and ask for review before running assignment.');
  console.info('Original PODs are unchanged. Do not run the assignment script until this result is reviewed.');
})().catch(error=>console.error('QA ID preflight stopped:',error.message));
