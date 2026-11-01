// TRINOTIME production — ONE-TIME, ADMIN-confirmed, three-person QA team promotion.
// It DOES change current team assignments; historical attendance and passwords remain.
// First complete and review the read-only preview. Never run this twice.
(async () => {
  'use strict';
  if(location.origin!=='https://oos.trinotime.com')throw Error('WRONG ORIGIN. Open production first.');
  const user=window.firebase?.auth?.().currentUser;
  if(!user||user.isAnonymous||typeof user.getIdToken!=='function')throw Error('Sign in as an authorized Admin.');
  const token=await user.getIdToken(false);
  const invoke=async payload=>{
    const response=await fetch('/api/workforce/qa-team/promote',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw Error(`STOP: HTTP ${response.status} ${String(data.error?.code||data.code||data.message||'')}. Do not blindly retry: check the current roster first.`);
    return data;
  };
  const preview=await invoke({dryRun:true});
  if(preview.alreadyPromoted){console.info('The three QA employees are already in their independent team. No writes.');return;}
  if(!preview.noWrites||preview.unchangedEmployees!==281||preview.credentialsVerified!==3||
     !Array.isArray(preview.transfers)||preview.transfers.length!==3||preview.teamLeader!==null||
     !preview.transfers.every(x=>['POD 0','POD 1','POD 2'].includes(x.from)&&x.to==='OOS Coverage Beta QAs'))
    throw Error('Unexpected read-only preview. Nothing was changed.');
  console.info('READY FOR HUMAN CONFIRMATION (no writes yet):',preview.transfers.map(x=>`${x.name}: ${x.from} → ${x.to}`));
  const phrase=prompt('PRODUCTION QA TEAM MIGRATION: Remove Jhan/March/Cabahug from their original active POD membership, assign them to OOS Coverage Beta QAs, keep their passwords, IDs and historical attendance. Admin-managed, no TL. Make sure ALL THREE are clocked out first. Type exactly PROMOTE 3 QAS to authorize ONE migration.');
  if(phrase!=='PROMOTE 3 QAS'){console.info('Canceled; zero writes.');return;}
  const receipt=await invoke({confirm:'PROMOTE_3_TO_INDEPENDENT_QA_TEAM',expectedVersion:preview.rosterVersion});
  if(receipt.promoted!==true||receipt.rosterCount!==281||receipt.members!==3)
    throw Error('Unexpected response. Do not retry; inspect production Admin roster.');
  console.info('PROMOTION CONFIRMED: 3 QAs transferred to independent QA team; 281 employee records preserved.');
  console.info('IMPORTANT: Do not rerun this snippet. Have each QA sign in through the QA portal selector and perform an attendance test.');
})().catch(e=>console.error('QA team promotion STOPPED:',e.message));
