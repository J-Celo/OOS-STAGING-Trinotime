// TRINOTIME production: SAFE READ-ONLY preview of the three QA promotions.
// Requires a verified Admin Firebase session at https://oos.trinotime.com.
// No employee, credential, directory, attendance, or other writes.
(async () => {
  'use strict';
  if(location.origin!=='https://oos.trinotime.com')throw Error('WRONG ORIGIN. Sign in on production first.');
  const user=window.firebase?.auth?.().currentUser;
  if(!user||user.isAnonymous||typeof user.getIdToken!=='function')throw Error('You must be signed in as an Admin.');
  const token=await user.getIdToken(false);
  const response=await fetch('/api/workforce/qa-team/promote',{
    method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({dryRun:true})
  });
  const info=await response.json().catch(()=>({}));
  if(!response.ok||info.ok!==true||info.dryRun!==true||info.noWrites!==true)
    throw Error(`PREVIEW BLOCKED — HTTP ${response.status} ${String(info.error?.code||info.code||info.message||'')}. No transfer requested.`);
  console.info('INDEPENDENT QA TEAM PREFLIGHT — ZERO WRITES:',{
    employees:info.unchangedEmployees,transfers:info.transfers?.map(x=>({name:x.name,from:x.from,to:x.to})),
    passwordsConfirmed:info.credentialsVerified,previousCounts:info.previousCounts,nextCounts:info.nextCounts,
    adminManaged:info.adminManaged,noTL:info.teamLeader===null,alreadyPromoted:info.alreadyPromoted
  });
  if(info.alreadyPromoted===true)console.info('Team already migrated. Do NOT rerun the promotion script.');
  else if(info.unchangedEmployees!==281||info.transfers?.length!==3||info.credentialsVerified!==3)
    console.warn('STOP — expected 281 employees and 3 reviewed transfers. Do not approve migration.');
  else console.info('Preview passed. NO accounts moved. Take a screenshot and review before approving migration.');
})().catch(e=>console.error('QA team preflight stopped:',e.message));
