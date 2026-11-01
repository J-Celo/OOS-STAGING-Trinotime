/** Role-based QA shift policy. Historical records use their stamped policy;
 * never infer a past QA policy from an employee's CURRENT team.
 * All timestamps are UTC instants; the scheduled wall clock is Asia/Manila.
 */
export const QA_SHIFT_POLICY = Object.freeze({
  id:'oos-qa-8h-flex-60-v1', team:'OOS Coverage Beta QAs',
  timeZone:'Asia/Manila', start:'10:00', end:'19:00',
  breakAllowanceMinutes:60, targetNetMinutes:480, windowMinutes:540
});
export function isQaShiftRecord(record) {return record?.timekeepingPolicy===QA_SHIFT_POLICY.id;}
export function qaShiftStamp() {
  return {timekeepingPolicy:QA_SHIFT_POLICY.id,shiftPreset:'qa-standard',shiftStart:QA_SHIFT_POLICY.start,
    shiftEnd:QA_SHIFT_POLICY.end,shiftLabel:'QA · 10:00 AM–7:00 PM PHT',
    breakPolicyMinutes:60,regularShiftCreditHours:8,standardShiftWindowMinutes:540};
}
function finiteInstant(value) {if(!value) return null;const t=Date.parse(value);return Number.isFinite(t)?t:null;}
export function qaShiftMetrics(record,{nowMs=Date.now()}={}) {
  if(!isQaShiftRecord(record)||!record?.timeIn||record?._deleted===true||record?.voided===true)return null;
  const started=finiteInstant(record.timeIn), ended=finiteInstant(record.logOut);
  if(started===null)return null;
  const now=Number(nowMs);
  const end=ended===null?(Number.isFinite(now)?now:started):ended;
  const grossMinutes=Math.max(0,(end-started)/60000);
  const breakStart=finiteInstant(record.startBreak),breakEnd=finiteInstant(record.endBreak);
  const actualBreakMinutes=breakStart===null?0:Math.max(0,((breakEnd===null?end:Math.min(end,breakEnd))-breakStart)/60000);
  const netMinutes=Math.max(0,grossMinutes-actualBreakMinutes);
  const roundedGross=Math.round(grossMinutes),roundedBreak=Math.round(actualBreakMinutes),roundedNet=Math.round(netMinutes);
  const incompleteBreak=breakStart!==null&&breakEnd===null&&ended!==null;
  // Actual working time does not include *any* break minutes, even the permitted 60.
  // Extra work beyond 480m is tracked separately; no automatic paid overtime.
  return {policyId:QA_SHIFT_POLICY.id,team:QA_SHIFT_POLICY.team,targetMinutes:480,
    scheduledStart:'10:00',scheduledEnd:'19:00',breakAllowanceMinutes:60,
    grossMinutes:roundedGross,breakMinutes:roundedBreak,netWorkedMinutes:roundedNet,
    regularCreditMinutes:Math.min(480,roundedNet),remainingMinutes:Math.max(0,480-roundedNet),
    extraWorkedMinutes:Math.max(0,roundedNet-480),breakOverageMinutes:Math.max(0,roundedBreak-60),
    breakInProgress:breakStart!==null&&breakEnd===null&&ended===null,
    incompleteBreak,finished:ended!==null,
    breakNotRecorded:breakStart===null&&ended!==null,
    recordedTimeIn:record.timeIn,recordedTimeOut:record.logOut||null};
}
