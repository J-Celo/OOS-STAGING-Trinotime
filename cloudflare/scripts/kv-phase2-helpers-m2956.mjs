// Security QA only. Never return key names, stored values, or decoded identifiers in reports.
export const CATEGORY_ORDER = Object.freeze([
  'legacy-credential-risk', 'attendance-and-time', 'personnel-and-roster',
  'schedule-and-leave', 'overtime-and-payroll', 'presence-and-coaching',
  'configuration-and-entitlement', 'miscellaneous-or-unclassified'
]);

export function decodeFirebaseKvKey(encoded) {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > 2000) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return encoded;
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    if (Buffer.from(decoded, 'utf8').toString('base64url') !== encoded) return encoded;
    if (/[^\x20-\x7e]/.test(decoded)) return encoded;
    return decoded;
  } catch { return encoded; }
}

export function classifyFirebaseKvKey(key) {
  // Classification operates on names only; content must not be inspected or logged.
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

export function summarizeFirebaseKvKeys(keys) {
  if (!Array.isArray(keys) || !keys.every(k => typeof k === 'string')) throw new TypeError('Expected an array of key names, never values.');
  const categories = Object.fromEntries(CATEGORY_ORDER.map(k=>[k, 0]));
  for (const encoded of keys) categories[classifyFirebaseKvKey(decodeFirebaseKvKey(encoded))]++;
  return {schemaVersion:1, totalKeys:keys.length, categories,
    // This summary deliberately contains no raw or decoded key identifiers.
    containsOnlyCounts:true, source:'user-supplied-local-key-names-only'};
}
