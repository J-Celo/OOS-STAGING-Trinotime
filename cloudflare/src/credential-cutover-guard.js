// M2.9.60 — pure, privacy-preserving credential cutover safety gate.
// This file accepts only COUNTS. Never pass names, password records, hashes,
// Firebase UIDs, encoded /kv key names, or live values to this function.
export function assessCredentialCutover(counts) {
  const names = ['activeMembers','alreadySecure','candidates','invalidLegacy','missing','unreviewedCredentialRisk'];
  const safe = {};
  for (const name of names) {
    const n = counts?.[name];
    if (!Number.isSafeInteger(n) || n < 0) throw new TypeError(`Invalid credential cutover count: ${name}`);
    safe[name] = n;
  }
  if (safe.activeMembers !== safe.alreadySecure + safe.candidates + safe.invalidLegacy + safe.missing)
    throw new TypeError('Credential cutover counts do not reconcile with the active roster.');
  const blockers = [];
  if (safe.activeMembers === 0) blockers.push('NO_ACTIVE_ROSTER');
  if (safe.candidates > 0) blockers.push('PREPARE_VAULT_REQUIRED');
  if (safe.invalidLegacy > 0) blockers.push('INVALID_ACTIVE_CREDENTIALS');
  if (safe.missing > 0) blockers.push('MISSING_ACTIVE_CREDENTIALS');
  if (safe.unreviewedCredentialRisk > 0) blockers.push('UNREVIEWED_CREDENTIAL_PATTERN_KEYS');
  return {ready:blockers.length===0,blockers};
}

// The base64url-encoded /kv names are processed only in server memory. Report
// aggregate counts, never any individual key or identifier. This tally is
// intentionally stricter than the broad M2.9.59 heuristic: anything that
// looks credential-related outside the known Agent/TL legacy key namespaces
// must be reviewed rather than silently left readable after vault cutover.
export function classifyCredentialRiskNames(encodedKeys) {
  if (!Array.isArray(encodedKeys) || encodedKeys.length > 50000 ||
      !encodedKeys.every(k => typeof k === 'string' && k.length <= 2000))
    throw new TypeError('Expected bounded Firebase shallow key-name strings.');
  let recognizedLegacy = 0, unreviewed = 0;
  for (const encoded of encodedKeys) {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) continue;
    let key = '';
    try {
      const base64 = encoded.replace(/-/g,'+').replace(/_/g,'/');
      const bytes = Uint8Array.from(atob(base64 + '='.repeat((4-encoded.length%4)%4)), c=>c.charCodeAt(0));
      key = new TextDecoder('utf-8',{fatal:true}).decode(bytes).toLowerCase();
    } catch (_) { continue; }
    if (!/^(?:agentauth:|tlauth:|adminauth:|auth:)|(?:password|passwd|credential|hash|salt|passcode)/.test(key)) continue;
    if (/^(?:agentauth|tlauth):.+/.test(key)) recognizedLegacy++;
    else unreviewed++;
  }
  return {recognizedLegacy,unreviewed};
}
