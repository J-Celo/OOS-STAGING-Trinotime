// Server-only proposal state; Attendance remains authoritative. No chat dependency.
export const TIMEOUT_REQUEST_ROOT = 'workforceTimeoutCorrectionsV1';
const pendingStates = new Set(['pending', 'approving']);
const error = (status, code, message) => { throw Object.assign(new Error(message), {status, code}); };
export function unresolvedShift(record) {
  if (!record || record._deleted || !Number.isFinite(Date.parse(record.timeIn || ''))) return false;
  if ((record.voided || record.isVoided || String(record.status).toLowerCase() === 'voided') && String(record.voidReason || '').trim()) return false;
  const out = Date.parse(record.logOut || '');
  return !(Number.isFinite(out) && out > Date.parse(record.timeIn));
}
export function expectedShiftEnd(date, record) {
  const p = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date || '');
  const clock = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? Number(v.slice(0,2))*60+Number(v.slice(3)) : NaN;
  const start = clock(record?.shiftStart), end = clock(record?.shiftEnd);
  if (!p || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Date.UTC(+p[3], +p[1]-1, +p[2], 0, end + (end <= start ? 1440 : 0)) - 8*3600000;
}
export function openShiftTiming({date, record, now, overtimeHours = 0}) {
  if (!unresolvedShift(record)) return {due:false};
  const scheduledEnd = expectedShiftEnd(date, record), age = now - Date.parse(record.timeIn);
  const extendedEnd = scheduledEnd === null ? null : scheduledEnd + Math.max(0, Number(overtimeHours)||0)*3600000;
  // Unknown historical schedules are not replaced with today's schedule.
  const due = extendedEnd === null ? age >= 18*3600000 : now >= extendedEnd + 30*60000;
  return {due, scheduledEnd, extendedEnd, age};
}
export function validateProposedTimeout(record, proposed, now, review = true) {
  const ms = Date.parse(proposed || ''), start = Date.parse(record.timeIn || '');
  if (!Number.isFinite(ms) || ms <= start || ms > now || ms - start > 36*3600000) error(400, 'TIMEOUT_TIME_INVALID', 'Enter the actual Time Out after Time In, no later than now, within 36 hours of Time In. Longer shifts need manual Attendance review.');
  if(!review)return new Date(ms).toISOString();
  for (const field of ['startBreak','endBreak']) {
    if (record[field] && (!Number.isFinite(Date.parse(record[field])) || Date.parse(record[field]) > ms)) error(409, 'TIMEOUT_BREAK_CONFLICT', 'A break timestamp conflicts with this Time Out. Use the Attendance correction dialog.');
  }
  if (record.startBreak && !record.endBreak) error(409, 'TIMEOUT_BREAK_OPEN', 'The meal break is still open. A TL/Admin must review the break in Attendance first.');
  return new Date(ms).toISOString();
}
const actorStamp = actor => ({uid:String(actor.uid||''), name:String(actor.name||actor.role), role:actor.role, pod:String(actor.pod||'')});
const sameActor = (a,b) => a.uid && b.uid ? a.uid === b.uid : a.role === b.role && a.name === b.name;
const reasonText = value => {
  const text = String(value||'').trim();
  if (text.length < 5 || text.length > 1000) error(400,'TIMEOUT_REASON_REQUIRED','Enter a reason of 5–1000 characters.');
  return text;
};
const publicRequest = value => value ? Object.fromEntries(['id','revision','status','proposedTimeOut','reason','note','submittedBy','submittedAt','reviewedBy','reviewedAt','reviewReason'].map(k=>[k,value[k]??null])) : null;
export function createTimeoutCorrectionService(d) {
  const path = key => `${TIMEOUT_REQUEST_ROOT}/${d.encode(key)}`;
  async function load(key, actor) {
    if(typeof key!=='string'||key.length>512)error(400,'TIMEOUT_KEY_INVALID','Choose a valid Attendance record.');
    const parsed = d.parse(key);
    if (!parsed || parsed.family !== 'agent') error(400,'TIMEOUT_KEY_INVALID','Choose an Agent Attendance record.');
    // Scope is established before any record/proposal is returned.
    await d.authorize(actor, parsed);
    const state = await d.readAttendance(key);
    return {parsed, ...state};
  }
  async function readProposal(key) {
    const current = await d.getWithEtag(path(key));
    if (!current.etag) error(503,'TIMEOUT_ETAG_UNAVAILABLE','Correction request concurrency protection is unavailable.');
    return current;
  }
  async function put(key, value, etag) {
    const result = await d.setIfMatch(path(key), value, etag);
    if (result.preconditionFailed) error(409,'TIMEOUT_REQUEST_CHANGED','The correction request changed. Refresh and retry.');
    const got = await d.get(path(key));
    if (!got || got.id !== value.id || got.status !== value.status || got.revision !== value.revision) error(503,'TIMEOUT_CONFIRMATION_PENDING','The request could not be confirmed. Retry the same operation.');
    return got;
  }
  async function list(actor, keys) {
    if (!Array.isArray(keys) || keys.length > 50) error(400,'TIMEOUT_BATCH_INVALID','Review up to 50 Attendance records at a time.');
    const rows = [];
    // Bounded batches; never scan historical Attendance or all proposal nodes.
    for (let i=0;i<keys.length;i+=5) {
      rows.push(...await Promise.all([...new Set(keys.slice(i,i+5))].map(async key => {
        try {
          const {record, parsed} = await load(key, actor), request = await d.get(path(key));
          return {key, date:parsed.date, name:parsed.name, pod:record.pod||'', timeIn:record.timeIn||null,
            expectedEnd:expectedShiftEnd(parsed.date,record), unresolved:unresolvedShift(record),
            request:publicRequest(request), revision:d.revision(record)};
        } catch (e) { if (e.status === 403) return null; throw e; }
      })));
    }
    return {ok:true, rows:rows.filter(Boolean), serverNow:d.now()};
  }
  async function submit(actor, body) {
    if (actor.role !== 'agent') error(403,'TIMEOUT_SELF_ONLY','Only an Agent may submit their own Time Out proposal.');
    const {key} = body, {record, parsed} = await load(key, actor);
    const operation = String(body.operationId||'');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(operation)) error(400,'TIMEOUT_OPERATION_REQUIRED','A valid request operation ID is required.');
    const current = await readProposal(key), prior = current.value;
    if (prior?.operationId === operation || pendingStates.has(prior?.status)) {
      await d.audit(prior.id+'_submitted','attendance_timeout_requested',prior.submittedBy,{key,request:publicRequest(prior)});
      return {ok:true, duplicate:true, request:publicRequest(prior)};
    }
    if (!unresolvedShift(record)) error(409,'TIMEOUT_ALREADY_RESOLVED','This Attendance record is already resolved.');
    if (record.voided || record.isVoided || String(record.status).toLowerCase()==='voided') error(409,'TIMEOUT_VOID_REVIEW','A voided record needs manual Attendance review.');
    const proposedTimeOut = validateProposedTimeout(record,body.proposedTimeOut,d.now(),false), reason = reasonText(body.reason);
    const revision = Number(prior?.revision||0)+1, id = await d.id(`${key}|${revision}|${operation}`);
    const next = {schemaVersion:1,id,revision,key,operationId:operation,status:'pending',proposedTimeOut,reason,note:String(body.note||'').trim().slice(0,1000),
      submittedBy:actorStamp(actor),submittedAt:new Date(d.now()).toISOString(),originalTimeIn:record.timeIn,
      attendanceRevision:d.revision(record),expectedEnd:expectedShiftEnd(parsed.date,record)};
    const saved = await put(key,next,current.etag);
    // Each revision is archived in immutable audit events, not a growing hot record.
    await d.audit(id+'_submitted','attendance_timeout_requested',next.submittedBy,{key,request:publicRequest(saved),originalTimeIn:record.timeIn});
    return {ok:true,request:publicRequest(saved)};
  }
  async function review(actor, body) {
    if (!['admin','team_leader'].includes(actor.role)) error(403,'TIMEOUT_REVIEW_FORBIDDEN','A Team Leader or Admin must review Time Out corrections.');
    const {key} = body, state = await load(key, actor), current = await readProposal(key);
    let value = current.value;
    if (!value || value.id !== body.requestId) error(409,'TIMEOUT_REQUEST_CHANGED','Refresh the correction request before reviewing it.');
    if (!['approve','reject'].includes(body.decision)) error(400,'TIMEOUT_DECISION_INVALID','Choose approve or reject.');
    if (value.status === 'approved' || value.status === 'rejected') {
      if(value.status!==(body.decision==='approve'?'approved':'rejected'))error(409,'TIMEOUT_ALREADY_REVIEWED','This request already has a different review decision.');
      // Replay may still need to finish an audit after a lost acknowledgement.
      await d.audit(value.id+'_'+value.status,value.status==='approved'?'edit':'attendance_timeout_rejected',value.reviewedBy,
        {key,request:publicRequest(value),...(value.approvalAudit||{})});
      return {ok:true,duplicate:true,request:publicRequest(value)};
    }
    const reason = reasonText(body.reason);
    if (value.status === 'approving' && (body.decision !== 'approve' || !sameActor(value.reviewedBy,actor))) error(409,'TIMEOUT_REVIEW_IN_PROGRESS','The approving reviewer must retry this correction to finish its acknowledgement.');
    if (value.status !== 'approving') {
      if (!unresolvedShift(state.record)) error(409,'TIMEOUT_ALREADY_RESOLVED','Attendance was resolved elsewhere. Refresh the queue.');
      if (body.decision === 'approve' && state.record.timeIn !== value.originalTimeIn) error(409,'TIMEOUT_SHIFT_CHANGED','Time In changed after submission. Use manual Attendance review.');
      if (body.decision === 'approve') validateProposedTimeout(state.record,value.proposedTimeOut,d.now());
      value = await put(key,{...value,status:body.decision==='approve'?'approving':'rejected',reviewReason:reason,
        reviewedBy:actorStamp(actor),reviewedAt:new Date(d.now()).toISOString(),
        ...(body.decision==='approve'?{approvalAttempt:Number(value.approvalAttempt||0)+1,approvalAudit:{old:state.record,reason,requestId:value.id},approvalBaseRevision:d.revision(state.record)}:{})},current.etag);
    }
    if (value.status === 'rejected') {
      await d.audit(value.id+'_rejected','attendance_timeout_rejected',value.reviewedBy,{key,request:publicRequest(value)});
      return {ok:true,request:publicRequest(value)};
    }
    await d.audit(value.id+'_approval_prepared_'+value.approvalAttempt,'attendance_timeout_approval_prepared',value.reviewedBy,{key,request:publicRequest(value),...value.approvalAudit});
    // Commit through the existing revision/CAS, metadata, mirror, and coaching guards.
    // A durable receipt allows safe retry even if acknowledgement was interrupted.
    let result;
    try {
      result = await d.correct(actor,key,value);
      if (!result.remoteSaved) error(409,'TIMEOUT_ATTENDANCE_CHANGED','Attendance changed. Refresh and use manual Attendance review if needed.');
    } catch (e) {
      // Only known pre-commit rejections release the review reservation. Ambiguous
      // network/readback failures retain it so the same reviewer can reconcile.
      if (['TIMEOUT_ATTENDANCE_CHANGED','TIMEOUT_PAYROLL_LOCKED','TIMEOUT_SHIFT_OVERLAP','TIMEOUT_BREAK_OPEN','TIMEOUT_BREAK_CONFLICT','TIMEOUT_TIME_INVALID','ATTENDANCE_COACHING_ACTIVE','ATTENDANCE_RECORD_POD_MISMATCH'].includes(e.code)) {
        const fresh = await readProposal(key);
        if (fresh.value?.id===value.id && fresh.value.status==='approving') await put(key,{...value,status:'pending',lastReviewError:e.code},fresh.etag);
      }
      throw e;
    }
    await d.audit(value.id+'_approved','edit',value.reviewedBy,{key,request:publicRequest({...value,status:'approved'}),...value.approvalAudit,new:result.record});
    const latest = await readProposal(key);
    if (latest.value?.id !== value.id) error(409,'TIMEOUT_REQUEST_CHANGED','The request changed during approval.');
    if (latest.value.status !== 'approved') value = await put(key,{...value,status:'approved',approvalAudit:{...value.approvalAudit,new:result.record}},latest.etag);
    else value = latest.value;
    return {ok:true,request:publicRequest(value),remoteSaved:true,reconciliationPending:!!result.reconciliationPending};
  }
  return {list,submit,review};
}
