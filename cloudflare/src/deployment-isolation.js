export const PRODUCTION_RESOURCE_IDS = Object.freeze({
  workerName: 'oostrinotime',
  firebaseProjectId: 'cwh-timeclock',
  firebaseDatabaseHost: 'cwh-timeclock-default-rtdb.asia-southeast1.firebasedatabase.app',
  r2BucketName: 'trinotime-chat-files'
});

export function deploymentEnvironment(env = {}) {
  return String(env.DEPLOYMENT_ENV || 'production').trim().toLowerCase() || 'production';
}
export function isStagingPlaceholder(value) {
  const text=String(value || '').trim();
  return !text || /REPLACE_|CHANGEME|YOUR_/i.test(text);
}
export function validateDeploymentIsolation(env = {}) {
  const mode=deploymentEnvironment(env);
  if(mode !== 'staging') return { ok:true, mode };
  const projectId=String(env.FIREBASE_PROJECT_ID || '').trim();
  const databaseUrl=String(env.FIREBASE_DATABASE_URL || '').trim();
  if(isStagingPlaceholder(projectId) || isStagingPlaceholder(databaseUrl)) {
    return { ok:false, mode, error:'STAGING_ISOLATION_VIOLATION', message:'Staging is not configured with a dedicated Firebase project/database.' };
  }
  let databaseHost='';
  try { databaseHost=new URL(databaseUrl).hostname.toLowerCase(); }
  catch (_) { return { ok:false, mode, error:'STAGING_ISOLATION_VIOLATION', message:'Staging Firebase database URL is invalid.' }; }
  if(projectId === PRODUCTION_RESOURCE_IDS.firebaseProjectId || databaseHost === PRODUCTION_RESOURCE_IDS.firebaseDatabaseHost) {
    return { ok:false, mode, error:'STAGING_ISOLATION_VIOLATION', message:'Staging is blocked because it points at a production Firebase resource.' };
  }
  return { ok:true, mode, projectId, databaseHost };
}
