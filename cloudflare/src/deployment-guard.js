export const PRODUCTION_RESOURCE_IDS = Object.freeze({
  workerName: 'oostrinotime',
  firebaseProjectId: 'cwh-timeclock',
  firebaseDatabaseHost: 'cwh-timeclock-default-rtdb.asia-southeast1.firebasedatabase.app',
  r2BucketName: 'trinotime-chat-files'
});

export function validateProductionDeployment(env = {}) {
  const mode = String(env.DEPLOYMENT_ENV || 'production').trim().toLowerCase() || 'production';
  if (mode !== 'production') {
    return { ok:false, mode, error:'PRODUCTION_ENV_REQUIRED', message:'This release package is production-only.' };
  }
  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();
  const databaseUrl = String(env.FIREBASE_DATABASE_URL || '').trim();
  if (projectId && projectId !== PRODUCTION_RESOURCE_IDS.firebaseProjectId) {
    return { ok:false, mode, error:'PRODUCTION_FIREBASE_PROJECT_MISMATCH', message:'Production Firebase project does not match the approved TrinoTime resource.' };
  }
  if (databaseUrl) {
    let host = '';
    try { host = new URL(databaseUrl).hostname.toLowerCase(); }
    catch (_) { return { ok:false, mode, error:'PRODUCTION_FIREBASE_DATABASE_INVALID', message:'Production Firebase database URL is invalid.' }; }
    if (host !== PRODUCTION_RESOURCE_IDS.firebaseDatabaseHost) {
      return { ok:false, mode, error:'PRODUCTION_FIREBASE_DATABASE_MISMATCH', message:'Production Firebase database does not match the approved TrinoTime resource.' };
    }
  }
  return { ok:true, mode };
}
