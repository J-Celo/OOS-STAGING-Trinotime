(()=>{
 'use strict';
 const status=document.getElementById('status'),button=document.getElementById('confirm'),check=document.getElementById('check'),selection=document.getElementById('identitySource');
 const set=s=>{status.textContent=s};
 const input=location.hash.match(/^#handoff=([0-9a-f]{64})$/)?.[1]||'';
 if(input){try{sessionStorage.setItem('trinobot_staging_handoff_v108',JSON.stringify({value:input,at:Date.now()}))}catch{}}
 if(location.hash)history.replaceState(null,'',location.pathname);
 let handoff=null;try{handoff=JSON.parse(sessionStorage.getItem('trinobot_staging_handoff_v108')||'null')}catch{}
 if(!handoff||!/^[a-f0-9]{64}$/.test(handoff.value)||Date.now()-handoff.at>150000){set('Verification expired or absent. Return to Discord and run /link again.');check.disabled=true;return}
 const runtime=window.TRINOTIME_RUNTIME_CONFIG;
 if(runtime?.deploymentEnv!=='staging'||!runtime?.firebase){set('Staging identity configuration unavailable.');check.disabled=true;return}
 let auth=null;
 try{
   if(!window.firebase?.auth||!window.firebase?.initializeApp)throw Error('SDK unavailable');
   const app=window.firebase.apps.find(a=>a.options?.projectId===runtime.firebase.projectId)||window.firebase.initializeApp(runtime.firebase,'trinobot-link-staging');
   auth=app.auth();
 }catch{set('Authentication could not be initialized. Sign in to the TrinoTime staging workspace first.');check.disabled=true;return}
 // Never silently use an old TL security session in place of a signed-in Admin.
 let selectedProof=null;
 selection.addEventListener('change',()=>{selectedProof=null;button.disabled=true;set('Check the selected account before confirming.')});
 async function buildHeaders(){
   const headers={'content-type':'application/json','accept':'application/json'};
   if(selection.value==='workforce'){
     let record=null;try{record=JSON.parse(sessionStorage.getItem('trinotime_workforce_security_session_v1')||'null')}catch{}
     if(!record?.token||Date.parse(record.expiresAt)<=Date.now())throw Error('No active TL/Agent/QA session in this tab. Sign in to staging in this tab first.');
     headers['x-tt-security-session']=record.token;
   }else{
     const user=auth.currentUser;if(!user)throw Error('No active Firebase workforce session. Sign in to staging first.');
     headers.authorization='Bearer '+await user.getIdToken(false);
   }
   return headers;
 }
 check.addEventListener('click',async()=>{
   button.disabled=true;check.disabled=true;selectedProof=null;set('Verifying your current staging workforce identity…');
   try{
     const headers=await buildHeaders();const r=await fetch('/api/workforce/trinobot/link/preview',{method:'POST',headers,body:'{}',cache:'no-store',credentials:'same-origin'});
     if(!r.ok)throw Error('Staging cannot verify that workforce session. Sign in to the correct account.');
     const data=await r.json();if(data.ok!==true||data.mode!=='staging-only')throw Error('Invalid staging identity result.');
     selectedProof=selection.value;
     set('Verified account '+(data.name||'(unnamed)')+' • '+data.role+(data.pod?' • '+data.pod:'')+'. Confirm ONLY if this is the exact account you want linked to Discord.');button.disabled=false;
   }catch(e){set(e.message||'Identity verification failed.')}finally{check.disabled=false}
 });
 button.addEventListener('click',async()=>{
   if(selectedProof!==selection.value)return;
   button.disabled=true;check.disabled=true;set('Confirming the selected staging account…');
   try{
     const headers=await buildHeaders();const res=await fetch('/api/workforce/trinobot/link/confirm',{method:'POST',headers,cache:'no-store',credentials:'same-origin',body:JSON.stringify({handoff:handoff.value})});
     if(!res.ok)throw Error(res.status===401||res.status===403?'Your account could not be verified.':res.status===410?'This link expired; run /link again.':'The link was not confirmed. Please check your staging configuration.');
     const data=await res.json();if(data.ok!==true||data.linked!==true)throw Error('Link confirmation could not be verified.');
     sessionStorage.removeItem('trinobot_staging_handoff_v108');handoff=null;selectedProof=null;
     set('Success! Discord is associated with your verified TrinoTime STAGING identity. Store commands are still synthetic-only.');
   }catch(e){set(e.message||'Link confirmation failed.');button.disabled=false}finally{check.disabled=false}
 });
 set('Select the account you currently use in staging, then click Check signed-in identity.');
})();
