// M2.9.61: read-only, staging-only key-name classification for manual cleanup planning.
// Do not pass Firebase /kv VALUES, hashes, account names or UIDs to this helper.
// The result intentionally contains only aggregate counts and NEVER authorizes deletion.
const CREDENTIAL_NAME_PATTERN = /^(?:agentauth:|tlauth:|adminauth:|auth:)|(?:password|passwd|credential|hash|salt|passcode)/i;
const LEGACY_AGENT_PATTERN = /^agentauth:.+/i;
const LEGACY_TL_PATTERN = /^tlauth:.+/i;
function strictBase64UrlKey(encoded) {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const padded = encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4);
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    const decoded = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    // Firebase /kv names are generated from UTF-8 text. Require canonical encoding.
    const canonical = btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return canonical === encoded ? decoded : null;
  } catch (_) { return null; }
}
export function summarizeLegacyCredentialCleanup(encodedKeys, activeLegacyEncodedKeys) {
  if (!Array.isArray(encodedKeys) || encodedKeys.length > 50000 ||
      !encodedKeys.every(k=>typeof k === 'string' && k.length <= 2000))
    throw new TypeError('Expected a bounded collection of shallow Firebase key names.');
  if (!(activeLegacyEncodedKeys instanceof Set) || activeLegacyEncodedKeys.size > 50000 ||
      ![...activeLegacyEncodedKeys].every(k=>typeof k === 'string' && k.length <= 2000))
    throw new TypeError('Expected a bounded set of canonical active credential key identifiers.');
  let recognizedActive=0,recognizedUnmatched=0,otherCredentialPatterns=0,invalidEncodedNames=0;
  let agentLegacy=0,teamLeaderLegacy=0;
  for (const encoded of encodedKeys) {
    const key = strictBase64UrlKey(encoded);
    if (key === null) { invalidEncodedNames++; continue; }
    if (!CREDENTIAL_NAME_PATTERN.test(key)) continue;
    if (LEGACY_AGENT_PATTERN.test(key) || LEGACY_TL_PATTERN.test(key)) {
      if (LEGACY_AGENT_PATTERN.test(key)) agentLegacy++; else teamLeaderLegacy++;
      if (activeLegacyEncodedKeys.has(encoded)) recognizedActive++;
      else recognizedUnmatched++;
    } else otherCredentialPatterns++;
  }
  const credentialPatternKeys=recognizedActive+recognizedUnmatched+otherCredentialPatterns;
  return {
    schemaVersion:1,
    totalKeys:encodedKeys.length,
    credentialPatternKeys,
    recognizedActiveLegacy:recognizedActive,
    recognizedUnmatchedLegacy:recognizedUnmatched,
    recognizedAgentLegacy:agentLegacy,
    recognizedTeamLeaderLegacy:teamLeaderLegacy,
    otherCredentialPatterns,
    invalidEncodedNames,
    containsOnlyCounts:true,
    // Key-name matches alone never prove credentials exist or authorize removal.
    reviewRequired:credentialPatternKeys>0 || invalidEncodedNames>0,
    deletionAuthorized:false,
    rulesCutoverReady:false
  };
}
