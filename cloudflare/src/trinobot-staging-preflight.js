/** V1.0.7 staging-only, self-scoped, read-only preflight. NOT account linking. */
export function assertTrinoBotPreviewGate({isolation,enabled}){
  if(isolation?.ok!==true||isolation?.mode!=='staging'||enabled!=='true')throw Object.assign(Error('TRINOBOT_PREVIEW_DISABLED'),{status:404});
  return true;
}
export function renderTrinoBotIdentityPreview(actor){
  if(!actor||!['firebase','security-session'].includes(actor.kind)||
     !['admin','team_leader','agent','qa'].includes(actor.role)||
     (actor.role!=='admin' && !String(actor.pod||'').trim()))
    throw Object.assign(Error('TRINOBOT_WORKFORCE_IDENTITY_NOT_VERIFIED'),{status:403});
  return Object.freeze({
    ok:true,mode:'staging-workforce-preflight',sessionVerified:true,
    role:actor.role,pod:actor.role==='admin'?null:String(actor.pod),
    realDiscordLinkCreated:false,discordUserVerified:false,
    storePublishing:false,authority:'current-trinotime-staging-session'
  });
}
