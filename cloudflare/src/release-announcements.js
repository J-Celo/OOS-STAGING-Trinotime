/** Version 3 optional welcome tour. All state is written by the authenticated Worker.
 * Firebase If-Match makes the first display claim atomic across tabs/devices.
 * No browser database permissions or user-selected target identifiers are accepted.
 */
export const ANNOUNCEMENT_VERSION = '3.0.0';
export const ANNOUNCEMENT_ROOT = 'workforceReleaseAnnouncements/v1';

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

export function releaseIdentity(actor) {
  // The canonical login name is this app's credential/profile identity. Do not key
  // by POD, an anonymous Firebase UID, or a security-session token: those change.
  const name = String(actor?.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (actor?.role !== 'agent' || !name) return '';
  return `agent:${name}`;
}

/** Dependencies use the Worker's existing verified actor and privileged RTDB helpers. */
export async function claimReleaseAnnouncement(request, env, deps) {
  if (request.method !== 'POST') fail(405, 'RELEASE_METHOD_NOT_ALLOWED', 'Use POST to claim a release announcement.');
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) fail(403, 'RELEASE_ORIGIN_FORBIDDEN', 'A same-origin request is required.');
  const actor = await deps.requireActor(request, env);
  const identity = releaseIdentity(actor);
  if (!identity) fail(403, 'RELEASE_AGENT_REQUIRED', 'The welcome tour is available only to an active Agent account.');
  const body = await deps.parseBody(request);
  if (!body || body.version !== ANNOUNCEMENT_VERSION) fail(400, 'RELEASE_VERSION_INVALID', 'Choose the current release announcement.');
  // A client may request its own receipt only; neither identity nor timestamp is trusted.
  const keys = Object.keys(body);
  if (keys.some(key => key !== 'version')) fail(400, 'RELEASE_BODY_INVALID', 'Only the release version may be supplied.');
  deps.enforceRate(identity, 'release-announcement', 30, 10 * 60 * 1000);
  const path = `${ANNOUNCEMENT_ROOT}/${deps.encodeKey(ANNOUNCEMENT_VERSION)}/${deps.encodeKey(identity)}`;
  const current = await deps.read(env, path);
  const reply = (show, seenAt = null) => ({ ok:true, version:ANNOUNCEMENT_VERSION, show, seenAt });
  // Existing receipts are immutable. Even an old/malformed non-null receipt must
  // not accidentally reopen the introduction on every login.
  if (current.value !== null && current.value !== undefined) return reply(false, current.value?.seenAt || null);
  if (!current.etag) fail(503, 'RELEASE_ETAG_UNAVAILABLE', 'The welcome-tour receipt could not be verified.');
  const receipt = { version:ANNOUNCEMENT_VERSION, seenAt:new Date().toISOString(), schemaVersion:1 };
  const result = await deps.writeIfMatch(env, path, receipt, current.etag);
  if (result.preconditionFailed) return reply(false, result.value?.seenAt || null);
  if (result.committed !== true) fail(503, 'RELEASE_RECEIPT_UNCONFIRMED', 'The welcome-tour receipt was not confirmed.');
  return reply(true, receipt.seenAt);
}
