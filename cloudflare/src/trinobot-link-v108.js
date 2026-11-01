/** TrinoBot V1.0.8: staging-only confirmation; the browser never calls the bot directly. */
const HANDOFF=/^[0-9a-f]{64}$/;
export function assertStagingLinkGate({isolation,enabled,botOrigin,bridgeSecret}){
  if(isolation?.ok!==true || isolation?.mode!=='staging'||enabled!=='true')throw Object.assign(Error('TRINOBOT_LINK_DISABLED'),{status:404});
  let u;try{u=new URL(botOrigin)}catch{throw Object.assign(Error('TRINOBOT_BAD_QA_ORIGIN'),{status:503})}
  if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!/^trinotime-discord-bot-qa\.[a-z0-9-]+\.workers\.dev$/.test(u.hostname))throw Object.assign(Error('TRINOBOT_BAD_QA_ORIGIN'),{status:503});
  if(typeof bridgeSecret!=='string'||bridgeSecret.length<32)throw Object.assign(Error('TRINOBOT_BRIDGE_NOT_CONFIGURED'),{status:503});
  return u.origin;
}
export function assertStagingLinkActor(actor){
  if(!actor||!['firebase','security-session'].includes(actor.kind)|| !['admin','team_leader','agent','qa'].includes(actor.role)||
     typeof actor.uid!=='string'||actor.uid.length<4||actor.uid.length>128||
     (actor.role!=='admin'&&!String(actor.pod||'').trim()))throw Object.assign(Error('TRINOBOT_STAGING_IDENTITY_UNVERIFIED'),{status:403});
  return actor.uid;
}
export async function makeBridgeSignature(secret,body,at){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${at}.${body}`));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function submitStagingLink({actor,handoff,botOrigin,bridgeSecret,fetcher=fetch,now=Date.now}={}){
  const subject=assertStagingLinkActor(actor);
  if(!HANDOFF.test(handoff||''))throw Object.assign(Error('TRINOBOT_INVALID_HANDOFF'),{status:400});
  const raw=JSON.stringify({handoff,subject});const time=String(now());
  const signature=await makeBridgeSignature(bridgeSecret,raw,time);
  let reply;
  try{reply=await fetcher(botOrigin+'/bridge/confirm',{
    method:'POST',headers:{'content-type':'application/json','x-trinobot-timestamp':time,'x-trinobot-signature':signature},
    body:raw,redirect:'error',signal:AbortSignal.timeout(7000)
  })}catch{throw Object.assign(Error('TRINOBOT_QA_BRIDGE_UNAVAILABLE'),{status:503})}
  if(!reply?.ok)throw Object.assign(Error('TRINOBOT_VERIFICATION_NOT_CONFIRMED'),{status:reply?.status===409?409:503});
  let data;try{data=await reply.json()}catch{throw Object.assign(Error('TRINOBOT_QA_INVALID_RESPONSE'),{status:503})}
  if(data?.ok!==true||data?.linked!==true||data?.mode!=='staging-only'||data?.storePublishing!==false)throw Object.assign(Error('TRINOBOT_QA_INVALID_RESPONSE'),{status:503});
  return {ok:true,linked:true,mode:'staging-only',storePublishing:false};
}
