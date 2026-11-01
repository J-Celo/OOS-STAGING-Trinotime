// Pure identity migration planner. No I/O, network, or credential response data.
// The caller must commit the returned root with the ETag of the input root.
const norm=v=>String(v||'').trim().replace(/\s+/g,' ');
const lower=v=>norm(v).toLowerCase();
const reject=(code,message)=>{throw Object.assign(new Error(message),{code,status:409});};
const uri=v=>encodeURIComponent(lower(v)).replace(/\./g,'%2E');
const slug=v=>lower(v).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'unknown';
const get=(root,path)=>path.split('/').reduce((v,k)=>v?.[k],root);
const set=(root,path,value)=>{const a=path.split('/');let p=root;for(const k of a.slice(0,-1))p=p[k]??={};p[a.at(-1)]=value;};
const FIELDS=new Set(['name','agentName','employeeName','targetName','offAgent','workAgent','senderName','recipientName','author','coachName','assignedAgent','agent','ownerName']);
const IDS=new Set(['id','key','agentId','agentKey','actorKey','identityKey','senderKey','recordKey','storageKey','attendanceKey']);
const ROOTS=['workforceAttendance','workforceOvertime','workforceProfiles','workforceSchedule','workforceLeave','workforcePersonnel','workforceAuthorization','workforceGovernance','workforceCoverage','workforceConfirmation','workforceTrackerShift','workforceMetrics','workforceAchievements','workforceBioBreaksV2','workforceBioBreakStateV2','workforceBioBreaksV1','agentPresence','identityMigrationRequests'];
export function planIdentityRename(root,{actor,oldName,newName,pod,operationId,actorBinding,now,encode,decode,recoveryAdminAuthorized=false,parseCredential}){
  oldName=norm(oldName);newName=norm(newName);pod=norm(pod);
  if(!oldName||!newName||newName.length>60||/[\x00-\x1f|]/.test(newName)||lower(oldName)===lower(newName)||!/^[A-Za-z0-9_.:-]{8,180}$/.test(operationId||''))reject('IDENTITY_INPUT_INVALID','Choose distinct valid names and an operation identifier.');
  const receiptPath=`workforceIdentity/v1/renames/${encode(operationId)}`;
  const receipt=get(root,receiptPath);
  if(receipt){
    if(receipt.actorBinding!==actorBinding||receipt.oldName!==oldName||receipt.newName!==newName||receipt.pod!==pod)reject('IDENTITY_RECEIPT_MISMATCH','The operation identifier belongs to another request.');
    return {receipt};
  }
  const roster=root.workforceRoster?.v1;
  if(!roster?.employees?.verified||!roster.podDirectory?.verified||!roster.teamLeaderDirectory?.verified)reject('IDENTITY_ROSTER_UNVERIFIED','All canonical roster documents must be verified.');
  const rows=roster.employees.entries||[],matches=rows.filter(x=>lower(x.name)===lower(oldName)&&x.active!==false);
  if(matches.length!==1||matches[0].pod!==pod)reject('IDENTITY_TARGET_AMBIGUOUS','The source identity or POD changed.');
  const target=matches[0];
  if(rows.some(x=>lower(x.name)===lower(newName))||(roster.teamLeaderDirectory.entries||[]).some(x=>lower(x.name)===lower(newName)))reject('IDENTITY_TARGET_EXISTS','The destination name is already reserved.');
  const own=actor.role==='agent'&&lower(actor.name)===lower(oldName)&&actor.pod===pod;
  const tl=(roster.teamLeaderDirectory.entries||[]).find(x=>x.active!==false&&lower(x.name)===lower(actor.name));
  const leader=actor.role==='team_leader'&&tl?.pod===pod&&actor.pod===pod;
  const admin=actor.role==='admin'&&((root.roles?.[actor.uid]?.active===true&&root.roles[actor.uid].role==='admin')||recoveryAdminAuthorized===true);
  if(!own&&!leader&&!admin)reject('IDENTITY_SCOPE_FORBIDDEN','This employee is outside your current authority.');
  const oldKey=encode(lower(oldName)),newKey=encode(lower(newName)),vaultSource=root.secureCredentials?.agent?.[oldKey];
  // Follow the existing credential fallback policy exactly. A present retired
  // vault entry must never resurrect a legacy password. Legacy conversion, when
  // allowed, is part of this same atomic commit and retains the original proof.
  const allowLegacy=String(root.securityConfig?.credentialVault?.mode||'').toLowerCase()!=='vault-only';
  const source=vaultSource??(allowLegacy&&parseCredential?parseCredential(root.kv?.[encode('agentauth:'+uri(oldName))],oldName):null);
  if(!source?.hash||!source?.salt||source.active===false)reject('IDENTITY_CREDENTIAL_UNVERIFIED','The source credential could not be verified under the current vault policy.');
  if(root.secureCredentials?.agent?.[newKey]||root.kv?.[encode('agentauth:'+uri(newName))])reject('IDENTITY_CREDENTIAL_TARGET_EXISTS','A destination credential already exists.');
  // UX18P22: copy on write. A Firebase root may contain many megabytes of
  // unrelated history. A full structuredClone followed by another full walk
  // doubles the retained object graph before JSON serialization. Keep the
  // original root immutable and copy only branches this migration touches.
  const next={...root},changes=[];
  next.workforceRoster={...root.workforceRoster,v1:structuredClone(root.workforceRoster.v1)};
  next.roles={...(root.roles||{})};
  next.kv={...(root.kv||{})};
  next.secureCredentials={...(root.secureCredentials||{}),agent:{...(root.secureCredentials?.agent||{})}};
  next.workforceIdentity={...(root.workforceIdentity||{})};
  next.workforceIdentity.v1={...(root.workforceIdentity?.v1||{})};
  for(const name of ['renames','retiredCredentials','current'])
    next.workforceIdentity.v1[name]={...(root.workforceIdentity?.v1?.[name]||{})};
  const generatedId=String(target.employeeId||target.id||`${lower(oldName)}|${lower(pod)}`).slice(0,120);
  const oldChatUid='legacy_agent_'+encode(`${lower(oldName)}|${lower(pod)}`).slice(0,120);
  const oldBioKey=encode(`uid:${oldChatUid.toLowerCase()}`),newBioKey=encode(`employeeId:${generatedId.toLowerCase()}`);
  const mapping=new Map([[oldName,newName],[lower(oldName),lower(newName)],[uri(oldName),uri(newName)]]);
  const token=s=>mapping.get(s)||s;
  const keyText=s=>{
    if(mapping.has(s))return mapping.get(s);
    if(s===`agent:${slug(oldName)}`)return `agent:${slug(newName)}`;
    if(s===`coachlock:agent:${slug(oldName)}`)return `coachlock:agent:${slug(newName)}`;
    return s.split(/([:|])/).map(token).join('');
  };
  // Bare property names are schema, not identities (an employee can be named
  // "Name" or "Records"). Only encoded keys and delimited identity keys move.
  const key=k=>{if(!target.employeeId&&!target.id&&k===oldBioKey)return newBioKey;let decoded;try{decoded=decode(k);}catch{}if(decoded&&encode(decoded)===k){const transformed=keyText(decoded);return transformed===decoded?k:encode(transformed);}return /[:|]/.test(k)?keyText(k):k;};
  const targetKey=k=>{let text=k,encoded=false;try{const d=decode(k);if(encode(d)===k){text=d;encoded=true;}}catch{}return (encoded||/[:|]/.test(k))&&text.split(/[:|]/).some(part=>[newName,lower(newName),uri(newName)].includes(part));};
  function walk(value,path,field=''){
    if(typeof value==='string'){
      if(FIELDS.has(field)&&lower(value)===lower(newName))reject('IDENTITY_HISTORY_TARGET_EXISTS','The destination name already owns historical data.');
      if((FIELDS.has(field)||field==='mentions')&&lower(value)===lower(oldName))return newName;
      if(IDS.has(field))return mapping.has(value)?mapping.get(value):key(value);
      if(value.startsWith('{')||value.startsWith('[')){let parsed;try{parsed=JSON.parse(value);}catch{return value;}const updated=walk(parsed,path);return JSON.stringify(parsed)===JSON.stringify(updated)?value:JSON.stringify(updated);}
      return value;
    }
    if(Array.isArray(value)){
      let changed=false;
      const out=value.map((v,i)=>{const updated=walk(v,`${path}/${i}`,field);if(updated!==v)changed=true;return updated;});
      return changed?out:value;
    }
    if(!value||typeof value!=='object')return value;
    const out=Object.create(null);let changed=false;
    for(const [k,v]of Object.entries(value)){
      if(targetKey(k))reject('IDENTITY_HISTORY_TARGET_EXISTS','The destination name already has a history key.');
      const mapped=key(k);
      if(mapped!==k&&Object.hasOwn(value,mapped))reject('IDENTITY_HISTORY_COLLISION','A destination history key already exists.');
      const updated=walk(v,`${path}/${mapped}`,k);
      if(mapped!==k||updated!==v)changed=true;
      out[mapped]=updated;
    }
    if(!changed)return value;
    {
      if(Number.isInteger(out._rev))out._rev++;
      if(Number.isInteger(out.revision))out.revision++;
      if(typeof out.version==='string')out.version=`identity:${operationId}`;
      if(Object.hasOwn(out,'_mutationId'))out._mutationId=`identity:${operationId}`;
    }
    if(!target.employeeId&&!target.id&&value.agentKey===oldBioKey){out.agentKey=newBioKey;out.employeeId=generatedId;out.identityKind='employeeId';out.identityValue=generatedId;}
    if(path.includes('/bridges/')&&value.active===true&&lower(value.name)===lower(oldName)){
      out.identityRename={operationId,previousName:value.identityRename?.previousName||oldName,previousPod:pod,tokenId:value.tokenId,uid:value.uid,deviceId:value.deviceId};
    }
    return out;
  }
  for(const name of ROOTS){if(next[name]){const updated=walk(next[name],name);if(updated!==next[name]){next[name]=updated;changes.push(name);}}}
  for(const [id,role] of Object.entries(next.roles||{})){if(role.role==='agent'&&lower(role.name)===lower(oldName)){if(role.pod!==pod)reject('IDENTITY_ROLE_CONFLICT','A role mapping has a conflicting POD.');next.roles[id]={...role,name:newName};}}
  // KV remains a private compatibility mirror. Credential values are never
  // copied to new legacy keys. The retired vault tombstone blocks fallback.
  if(next.kv){const out=Object.create(null);for(const [k,v]of Object.entries(next.kv)){let decoded='';try{decoded=decode(k);}catch{}
    if(/^(agentauth:|tlauth:)/.test(decoded)){out[k]=v;continue;}
    const mapped=key(k);if(mapped!==k&&Object.hasOwn(next.kv,mapped))reject('IDENTITY_HISTORY_COLLISION','A legacy destination history key already exists.');out[mapped]=walk(v,`kv/${mapped}`);
  }next.kv=out;}
  const oldLast=oldName.split(' ').at(-1),newLast=newName.split(' ').at(-1);
  if(lower(oldLast)!==lower(newLast)&&!rows.some(e=>lower(e.name)!==lower(oldName)&&e.pod===pod&&lower(norm(e.name).split(' ').at(-1))===lower(oldLast))){
    const updateSchedule=value=>{
      if(typeof value==='string'){try{const parsed=JSON.parse(value),updated=updateSchedule(parsed);return JSON.stringify(parsed)===JSON.stringify(updated)?value:JSON.stringify(updated);}catch{return value;}}
      if(!value||typeof value!=='object')return value;
      const copy=structuredClone(value);
      if(copy[pod])for(const kind of ['rows','extraRows'])if(Array.isArray(copy[pod][kind]))copy[pod][kind]=copy[pod][kind].map(row=>Array.isArray(row)?row.map(cell=>lower(cell)===lower(oldLast)?newLast:cell):row);
      for(const k of Object.keys(copy))if(k!==pod)copy[k]=updateSchedule(copy[k]);
      if(JSON.stringify(copy)!==JSON.stringify(value)&&typeof copy.version==='string')copy.version=`identity:${operationId}`;
      return copy;
    };
    if(next.workforceSchedule?.v1?.blobs){
      const blobs=updateSchedule(next.workforceSchedule.v1.blobs);
      if(blobs!==next.workforceSchedule.v1.blobs)
        next.workforceSchedule={...next.workforceSchedule,v1:{...next.workforceSchedule.v1,blobs}};
    }
    const scheduleKey=encode('dayoff_schedule');if(next.kv?.[scheduleKey])next.kv[scheduleKey]=updateSchedule(next.kv[scheduleKey]);
  }
  for(const family of ['dayoff_schedule','shift_settings','announcements']){
    const encoded=encode(family);if(next.kv?.[encoded]!==root.kv?.[encoded])next.kv[encode(family+'_v')]=`identity:${operationId}`;
  }
  const renamed=next.workforceRoster.v1.employees.entries.find(x=>lower(x.name)===lower(oldName));
  // Preserve the pre-rename Messaging UID even for legacy rows without IDs.
  // Chat messages, receipts, attachments and DM membership continue using that
  // same UID; historical message author labels remain immutable.
  renamed.employeeId=generatedId;
  renamed.name=newName;
  const document=next.workforceRoster.v1.employees;
  document.version=`identity:${operationId}`;document._mutationId=document.version;document.updatedAt=now;
  next.kv??={};next.kv[encode('employees')]=JSON.stringify(document.entries);next.kv[encode('employees_v')]=document.version;
  next.secureCredentials??={};next.secureCredentials.agent??={};
  next.secureCredentials.agent[newKey]={...source,agentName:newName,firebaseIdentityName:source.firebaseIdentityName||oldName,_vaultVersion:1,_vaultRenameOperationId:operationId,_vaultPreviousName:oldName,_vaultUpdatedAt:now};
  next.secureCredentials.agent[oldKey]={active:false,_vaultRetiredBy:operationId,renamedTo:newName,retiredAt:now};
  // The private archive retains original credential evidence. No employee or
  // financial record is purged; history is re-keyed in the same atomic commit.
  set(next,`workforceIdentity/v1/retiredCredentials/${encode(operationId)}`,source);
  const committedReceipt={operationId,actorBinding,actorUid:actor.uid,actorRole:actor.role,oldName,newName,pod,employeeId:renamed.employeeId,committedAt:now,changes,state:'committed'};
  set(next,receiptPath,committedReceipt);
  set(next,`workforceIdentity/v1/current/${encode(renamed.employeeId)}`,{operationId,oldName,newName,pod,employeeId:renamed.employeeId});
  return {next,committedReceipt};
}
