// Bio breaks are isolated from standard Attendance/payroll state.
// RC41 stores report rows in bounded monthly partitions and keeps only a
// compact per-agent active/retry state for concurrency + idempotency.
export const BIO_BREAK_ROOT = 'workforceBioBreaksV2';
export const BIO_BREAK_STATE_ROOT = 'workforceBioBreakStateV2';
export const BIO_BREAK_LEGACY_ROOT = 'workforceBioBreaksV1';
export const BIO_BREAK_RECEIPT_LIMIT = 32;

export function bioCommand(text) {
  const value = String(text || '').trim().toLowerCase();
  return value === 'biobreak' ? 'start' : value === 'bioback' ? 'stop' : null;
}

export function bioDay(ms) {
  return new Date(Number(ms) + 8 * 3600000).toISOString().slice(0, 10);
}

export function bioMonth(value) {
  const date = typeof value === 'number' ? bioDay(value) : String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : '';
}

export function bioRangeMonths(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || '')) || from > to) return [];
  const out = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return out;
}

function receiptEntries(receipts) {
  return Object.entries(receipts && typeof receipts === 'object' ? receipts : {})
    .filter(([, value]) => value && typeof value === 'object')
    .sort((a, b) => Number(a[1].at || 0) - Number(b[1].at || 0));
}

function boundedReceipts(receipts) {
  const entries = receiptEntries(receipts);
  while (entries.length > BIO_BREAK_RECEIPT_LIMIT) entries.shift();
  return Object.fromEntries(entries);
}

export function transitionBioBreak(previous, {
  command,
  eventId,
  now,
  name,
  pod,
  uid,
  employeeId = '',
  agentKey = '',
  closeReason = ''
}) {
  if (!['start', 'stop'].includes(command)) throw Object.assign(new Error('Invalid bio-break command.'), { status:400 });
  if (!eventId) throw Object.assign(new Error('Bio-break event identifier is required.'), { status:400 });
  if (!agentKey) throw Object.assign(new Error('A stable workforce identity is required for Bio Break.'), { status:409 });

  const state = structuredClone(previous && typeof previous === 'object' ? previous : {});
  state.version = 2;
  state.receipts = state.receipts && typeof state.receipts === 'object' ? state.receipts : {};
  state.active = state.active && typeof state.active === 'object' ? state.active : null;

  const prior = state.receipts[eventId];
  if (prior) {
    if (prior.command !== command) throw Object.assign(new Error('This command identifier was already used.'), { status:409 });
    return { state, event:prior.event, session:prior.session, duplicate:true };
  }

  if (command === 'start' && state.active) throw Object.assign(new Error('A bio break is already running. Type Bioback to finish it.'), { status:409 });
  if (command === 'stop' && !state.active) throw Object.assign(new Error('No bio break is running. Type Biobreak to start one.'), { status:409 });

  const at = Math.max(0, Number(now) || Date.now());
  let session;
  if (command === 'start') {
    const date = bioDay(at);
    session = {
      id:eventId,
      agentKey,
      employeeId:String(employeeId || ''),
      uid:String(uid || ''),
      name:String(name || ''),
      pod:String(pod || ''),
      date,
      month:bioMonth(date),
      startedAt:at,
      endedAt:null,
      endedReason:null
    };
    state.active = session;
  } else {
    session = {
      ...state.active,
      endedAt:Math.max(Number(state.active.startedAt) || 0, at),
      endedReason:String(closeReason || 'bioback')
    };
    state.active = null;
  }

  const event = {
    command,
    sessionId:session.id,
    agentKey,
    month:session.month,
    date:session.date,
    startedAt:session.startedAt,
    endedAt:session.endedAt,
    endedReason:session.endedReason,
    at
  };
  state.receipts[eventId] = { command, at, event, session };
  state.receipts = boundedReceipts(state.receipts);
  state.agentKey = agentKey;
  state.employeeId = String(employeeId || state.employeeId || '');
  state.uid = String(uid || state.uid || '');
  state.currentName = String(name || state.currentName || '');
  state.currentPod = String(pod || state.currentPod || '');
  state.updatedAt = at;
  return { state, event, session, duplicate:false };
}

export function bioSummary(sessions, from, to, now) {
  const rows = new Map();
  for (const s of sessions || []) {
    if (!s || s.date < from || s.date > to) continue;
    // V2.0.0 RC2: daily reporting is authoritative at the server summary layer.
    // A break belongs to its Philippine start date, so the same Agent can have a
    // separate count and duration row for today, yesterday, and every selected day.
    const date=String(s.date || '');
    const key = JSON.stringify([date, String(s.pod || ''), String(s.name || ''), String(s.agentKey || s.employeeId || s.uid || '')]);
    const row = rows.get(key) || { date, pod:String(s.pod || ''), name:String(s.name || ''), count:0, totalMs:0, active:0 };
    row.count += 1;
    row.totalMs += Math.max(0, (s.endedAt ?? now) - Number(s.startedAt || 0));
    if (s.endedAt == null) row.active += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) =>
    b.date.localeCompare(a.date) ||
    a.pod.localeCompare(b.pod, undefined, { numeric:true }) ||
    a.name.localeCompare(b.name)
  );
}
