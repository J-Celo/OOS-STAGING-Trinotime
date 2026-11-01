// Pure server-side attendance reward rules. Dates are normalized Manila calendar dates (YYYY-MM-DD).
// Phase 2 separates permanent earned recognition from current streak momentum.
export const ATTENDANCE_REWARDS = Object.freeze([
  {id:'blaze', days:7, name:'Blaze Name Effect', slot:'name', equippable:true, material:'brushed-copper'},
  {id:'resonance', days:14, name:'14-Day Resonance', slot:null, equippable:false, material:'graphite-accent'},
  {id:'flame', days:30, name:'Attendance Distinction Border', slot:'border', equippable:true, material:'champagne-metal'}
]);

export function attendanceGrade(rate) {
  if (rate === null) return {letter:'—', next:null};
  for (const [letter, minimum, next] of [['A',95,null],['B',90,['A',95]],['C',80,['B',90]],['D',70,['C',80]],['F',0,['D',70]]]) {
    if (rate >= minimum) return {letter,next:next && {letter:next[0],minimum:next[1],gap:Math.max(0,next[1]-rate)}};
  }
}

function normalizeEarned(previous={}) {
  const source=previous.earnedAchievements&&typeof previous.earnedAchievements==='object'?previous.earnedAchievements:{};
  const out={};
  for (const reward of ATTENDANCE_REWARDS) {
    const prior=source[reward.id];
    if (prior===true) out[reward.id]={earned:true,earnedAt:'',days:reward.days};
    else if (prior&&typeof prior==='object'&&prior.earned!==false) out[reward.id]={...prior,earned:true,days:reward.days};
    else if (previous.unlocked?.[reward.id]) out[reward.id]={earned:true,earnedAt:'',days:reward.days,legacy:true};
  }
  return out;
}

export function calculateAttendanceAchievement(days, previous = {}, periodStart = '') {
  // De-duplicate by date before counting; authoritative/present evidence wins over an empty duplicate.
  const unique = new Map();
  for (const day of days) {
    const old=unique.get(day.date);
    unique.set(day.date,{...old,...day,present:Boolean(day.present||old?.present)});
  }
  let pendingCount=0, pendingSince=null, blocked=false, confirmedRun=0;
  let currentStreak=0, longestStreak=Number(previous.longestStreak)||0, present=0, absent=0, lastAttendanceDate=null, atRisk=false;
  const earnedAchievements=normalizeEarned(previous),thresholdDates={};
  for (const day of [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date))) {
    if (day.pending) {
      pendingCount++;
      pendingSince ||= day.date;
      blocked=true;
      confirmedRun=0;
      continue; // Neither an absence nor a bridge across unverified attendance.
    }
    if (day.present) {
      confirmedRun++;
      if(!blocked) currentStreak++;
      else currentStreak=Math.max(currentStreak,confirmedRun);
      longestStreak=Math.max(longestStreak,confirmedRun);
      lastAttendanceDate=day.date;
      for (const reward of ATTENDANCE_REWARDS) if (confirmedRun===reward.days&&!thresholdDates[reward.id]) thresholdDates[reward.id]=day.date;
    } else if (day.expected && day.closed) { currentStreak=0; confirmedRun=0; blocked=false; }
    if(day.date>=periodStart && (day.present || (day.expected && day.closed))) {if(day.present)present++;else absent++;}
    if(day.expected && !day.closed && !day.present && currentStreak>0) atRisk=true;
  }
  const expected=present+absent, rate=expected?present/expected*100:null;
  const unlocked={...(previous.unlocked||{})};
  for(const reward of ATTENDANCE_REWARDS){
    if(longestStreak>=reward.days){
      unlocked[reward.id]=true;
      if(!earnedAchievements[reward.id]) earnedAchievements[reward.id]={earned:true,earnedAt:thresholdDates[reward.id]||'',days:reward.days,calculationVersion:4};
    }
  }
  return {currentStreak,longestStreak,pendingCount,pendingSince,verificationStatus:pendingCount?'pending':'verified',streakHeld:blocked,lastAttendanceDate,present,absent,expected,rate,grade:attendanceGrade(rate),atRisk,unlocked,earnedAchievements};
}

export function mutateAttendanceReward(state, action, id) {
  const reward=ATTENDANCE_REWARDS.find(r=>r.id===id);
  if(!reward || !['claim','equip','unequip'].includes(action))throw new Error('Invalid reward action.');
  const next={...state,claimed:{...(state.claimed||{})},equipped:{...(state.equipped||{})}};
  if(action==='claim') {
    if(!state.unlocked?.[id])throw new Error('This reward is locked.');
    next.claimed[id]=true;
  } else {
    if(reward.equippable===false||!reward.slot)throw new Error('This achievement is permanent recognition and does not use an equipment slot.');
    if(!next.claimed[id])throw new Error('Claim this reward before equipping it.');
    if(action==='equip')next.equipped[reward.slot]=id;
    else if(next.equipped[reward.slot]===id)delete next.equipped[reward.slot];
  }
  return next;
}

// Keep evidence classification independent of storage and UI for behavioral tests.
export function attendanceVerification(record, {expected, closed} = {}) {
  if(!expected && !record?.restDayWork) return {pending:false, reason:''};
  if(record?.voided===true) return {pending:false, reason:'Attendance record voided by an authorized reviewer'};
  const review=record?.streakReview?.status;
  if(review==='pending') return {pending:true, reason:'Attendance correction is under review'};
  if(review==='confirmed_absence') return {pending:false, reason:'Absence confirmed by an authorized reviewer'};
  if(!closed&&!record?.timeIn) return {pending:false, reason:''};
  if(!closed&&record?.timeIn&&!record?.logOut) return {pending:true, reason:'Shift in progress; waiting for Time Out'};
  if(!record?.timeIn) return {pending:true, reason:'Time In is missing; awaiting attendance review'};
  if(!record?.logOut) return {pending:true, reason:'Time Out is missing; awaiting attendance review'};
  if(!Number.isFinite(Date.parse(record.timeIn)) || !Number.isFinite(Date.parse(record.logOut)) || Date.parse(record.logOut)<=Date.parse(record.timeIn))
    return {pending:true, reason:'Punch times need correction'};
  return {pending:false, reason:''};
}

// Called only after normal attendance scope authorization, against the CAS record.
export function validateStreakReviewChange(actor, record, previous = {}) {
  const next=record?.streakReview??null, prior=previous?.streakReview??null;
  if(JSON.stringify(next)===JSON.stringify(prior)) return;
  if(actor.role!=='admin' && !(actor.role==='team_leader' && actor.targetFamily==='agent'))
    throw new Error('Only an authorized Admin or Team Leader may review attendance streak eligibility.');
  if(next!==null && (!['auto','pending','confirmed_absence'].includes(next.status) || typeof next.reason!=='string' || next.reason.trim().length<3 || next.reason.length>240))
    throw new Error('Choose a valid streak review status and enter a reason (3–240 characters).');
  if(next?.status==='confirmed_absence' && record?.timeIn && !record?.voided)
    throw new Error('Correct or void the existing Time In before confirming an absence.');
}

export function attendanceCorrectionSummary(entries, history, previous, next, at) {
  const changes=[];
  for(const row of entries) {
    const before=history.get(row.date);
    if(before && before.classification!==row.classification && (before.closed||before.pending) && row.closed)
      changes.push({date:row.date,from:before.classification,to:row.classification,reason:row.reason});
  }
  if(!changes.length) return previous.lastAdjustment||null;
  return {at,previousStreak:Number(previous.currentStreak)||0,currentStreak:next.currentStreak,
    restored:next.currentStreak>(Number(previous.currentStreak)||0),changes:changes.slice(-31)};
}
