// Explicit presentation mapping. Inputs must come from authorized domain services.
// Unknown /kv keys, credentials, audit logs and lock internals are never exported.
export function workspaceReadModel(parts) {
  const out = Object.create(null);
  const put = (key, value, raw=false) => { if(value !== null && value !== undefined) out[key]=raw?String(value):JSON.stringify(value); };
  const r=parts.roster;
  put('employees',r.employees.entries); put('employees_v',r.employees.version || '',true);
  put('pod_directory_v1',r.podDirectory); put('team_leader_directory_v1',r.teamLeaderDirectory);
  for(const [key,raw] of Object.entries(parts.attendance.records || {})) put(key,raw,true);
  for(const [key,rec] of Object.entries(parts.overtime.records || {})) put('ot:'+key,rec);
  for(const [key,rec] of Object.entries(parts.overtime.locks || {})) put('otpayrolllock:'+key,rec);
  const s=parts.schedule;
  put('dayoff_schedule',s.dayOffSchedule); put('dayoff_schedule_v',s.dayOffVersion || '',true);
  put('shift_settings',s.shiftSettings); put('shift_settings_v',s.shiftSettingsVersion || '',true);
  for(const [id,rec] of Object.entries(s.dayOffSwaps || {})) put('dayswap:'+id,rec);
  for(const [id,rec] of Object.entries(s.shiftOverrides || {})) put('shiftoverride:'+id,rec);
  for(const [id,rec] of Object.entries(parts.leave.records || {})) put('leave:'+id,rec);
  for(const rec of parts.speed.records || []) put('speedtest:'+rec.id,rec);
  for(const rec of parts.coaching.records || []) put('coaching:'+rec.id,rec);
  put('announcements',parts.announcements.entries); put('announcements_v',parts.announcements.revision || 0,true);
  put('network_quality_settings',parts.network.settings);
  put('leave_policy_v3',parts.leavePolicy.policy);
  for(const [id,rec] of Object.entries(parts.hrProfiles || {})) put('leaveprofile:'+id,rec);
  for(const rec of parts.ledger || []) put('leaveledger:'+rec.id,rec);
  for(const rec of parts.directory.entries || []) {
    // Directory service supplies only public display/photo fields.
    const id=encodeURIComponent(String(rec.name).trim().toLowerCase().replace(/\s+/g,' ')).replace(/\./g,'%2E');
    put('profile:'+id,{agentName:rec.name,fullName:rec.displayName,pod:rec.pod,photoUrl:rec.photoUrl,photoDataUrl:rec.photoDataUrl});
  }
  if(parts.selfProfile?.key) put(parts.selfProfile.key,parts.selfProfile.raw,true);
  return out;
}
