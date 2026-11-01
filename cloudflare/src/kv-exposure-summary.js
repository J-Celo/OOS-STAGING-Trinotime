// M2.9.59: privacy-preserving inventory of base64url-encoded legacy /kv key NAMES.
// Accept only shallow key strings. Do not accept or inspect Firebase values.
const CATEGORIES = Object.freeze([
  'legacy-credential-risk','attendance-and-time','personnel-and-roster',
  'schedule-and-leave','overtime-and-payroll','presence-and-coaching',
  'configuration-and-entitlement','miscellaneous-or-unclassified'
]);
function decodedKey(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return '';
  try {
    const text = new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(
      atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4)),c=>c.charCodeAt(0)));
    if (/[^\x20-\x7e]/.test(text)) return '';
    return text;
  } catch (_) { return ''; }
}
function categoryFor(key) {
  const k = String(key || '').toLowerCase();
  if (/^(agentauth:|tlauth:|adminauth:|auth:)|(?:password|passwd|credential|hash|salt|passcode)/.test(k)) return 'legacy-credential-risk';
  if (/(attendance|timeclock|timesheet|shiftpunch|punch|clockin|clockout|checkin|timeout|server-time)/.test(k)) return 'attendance-and-time';
  if (/(employees|roster|staff|profile|personnel|agentlist|directory|member)/.test(k)) return 'personnel-and-roster';
  if (/(schedule|dayoff|shift_settings|shiftsettings|leave|holiday|availability)/.test(k)) return 'schedule-and-leave';
  if (/(overtime|otpayroll|payroll|salary|wage|payrate|payperiod)/.test(k)) return 'overtime-and-payroll';
  if (/(presence|speedtest|coaching|handoff|performance)/.test(k)) return 'presence-and-coaching';
  if (/(premium|entitlement|policy|featureflag|settings|config|version)/.test(k)) return 'configuration-and-entitlement';
  return 'miscellaneous-or-unclassified';
}
export function summarizeShallowKvKeys(keys) {
  if (!Array.isArray(keys) || keys.length > 50000 || !keys.every(k=>typeof k === 'string'))
    throw new TypeError('Only bounded lists of Firebase shallow key names are permitted.');
  const categories=Object.fromEntries(CATEGORIES.map(k=>[k,0]));
  for (const encoded of keys) categories[categoryFor(decodedKey(encoded))]++;
  // Never return individual encoded or decoded identifiers, values, or sample records.
  return {schemaVersion:1,totalKeys:keys.length,categories,containsOnlyCounts:true,
    credentialNamedKeysDetected:categories['legacy-credential-risk'] > 0};
}
