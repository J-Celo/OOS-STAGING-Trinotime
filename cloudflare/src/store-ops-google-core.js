/* TrinoTime Store Operations — staging-only, per-POD, one-way Google Sheets.
   Pure integration helpers; no Google credentials are exposed to the browser. */
const idPattern=/^[A-Za-z0-9_-]{20,160}$/;
const b64url=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const utf8=s=>new TextEncoder().encode(s);
const required=(condition,msg)=>{if(!condition)throw Error(msg);};
export function podSheetMap(env){
  if(!env.TT_GOOGLE_SHEETS_POD_MAP_JSON)return {};
  let obj;try{obj=JSON.parse(env.TT_GOOGLE_SHEETS_POD_MAP_JSON);}catch{throw Error('POD Sheet map configuration is invalid.');}
  required(obj&&typeof obj==='object'&&!Array.isArray(obj),'POD Sheet map must be an object.');
  required(Object.keys(obj).length<=60,'Maximum 60 configured POD Sheets.');
  const result=Object.create(null);
  for(const [pod,id] of Object.entries(obj)){
    required(pod.trim()===pod&&pod.length>0&&pod.length<=120&&idPattern.test(String(id)),'POD Sheet map has an invalid POD or spreadsheet ID.');
    result[pod]=id;
  }
  required(new Set(Object.values(result)).size===Object.values(result).length,'A spreadsheet must not be shared between two PODs.');
  return result;
}
export const googleConfigured=(env,pod)=>Boolean(env.TT_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON&&podSheetMap(env)[pod]);
export function sheetUrl(env,pod){const id=podSheetMap(env)[pod];return id?`https://docs.google.com/spreadsheets/d/${id}/edit`:null;}
export async function googleAccessToken(env){
  let sa;try{sa=JSON.parse(env.TT_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON||'');}catch{throw Error('Google Sheets service account secret is not configured.');}
  required(sa?.type==='service_account'&&typeof sa.client_email==='string'&&typeof sa.private_key==='string','Google Sheets service account secret is missing or invalid.');
  const now=Math.floor(Date.now()/1000),head=b64url(utf8(JSON.stringify({alg:'RS256',typ:'JWT'}))),body=b64url(utf8(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})));
  const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const der=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const data=`${head}.${body}`,sig=b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,utf8(data))));
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${data}.${sig}`})});
  const token=await res.json().catch(()=>null);
  if(!res.ok||!token?.access_token)throw Error(`Google authorization failed (HTTP ${res.status}). Check service account and Sheets API.`);
  return token.access_token;
}
const cell=v=>{if(v===null||v===undefined)return '';if(typeof v==='number')return Number.isFinite(v)?v:'';const s=String(v).slice(0,500);return /^[\s]*[=+\-@]/.test(s)?"'"+s:s;};
const table=(columns,rows)=>[columns,...rows.map(r=>r.map(cell))];
const publicPodName=v=>{const name=String(v||'').trim();return !name||/^(?:tt[-_:]?custom[-_:]?pod|custom[-_:]?pod|tt[-_:]?pod|pod[:_-])/i.test(name)||name.length>90?'Assigned POD':name;};
export function snapshotTables(snapshot){
  const p=snapshot.performance||{},d=snapshot.dispatch||{},q=snapshot.queue||{};
  const jobs=Array.isArray(p.jobs)?p.jobs:[],stores=Array.isArray(p.stores)?p.stores:[],trends=Array.isArray(p.trends)?p.trends:[];
  const label=publicPodName(snapshot.podLabel);
  const notes=[['TrinoTime store reporting — read only'],['POD',label],['Report date (PHT)',snapshot.date],['Period',snapshot.period],['Generated at',snapshot.generatedAt],['Current store',d.active?d.store:'No active instruction'],['Workflow',d.active?d.workflow:'standby'],['Published by',d.updatedBy||''],['Dispatch revision',d.revision||0],['Queue updated',q.updatedAt||''],['Confirmed',stores.reduce((n,r)=>n+(Number(r.submitted)||0),0)],['Source','Server-authorized Tracker observations (not verified directly with Augmoto)'],['Data limitation',p.jobRowsTruncated?'Job ledger truncated by server; export is partial':'None reported'],['Store mappings','Unknown/conflicting mappings are not assigned to another store']];
  const headers=['POD','Date','Store','Workflow','Jobs','Confirmed','Active ms','Mapping','Active seconds/submit','Agents'];
  const sheet={
    'Overview':table(['Field','Value'],notes),
    'Store Queue':table(['Position','Store','Planned jobs','Job IDs'],(q.entries||[]).map((r,i)=>[r.order||i+1,r.store||'',r.plannedJobs||'',Array.isArray(r.jobIds)?r.jobIds.join(' | '):''])),
    'Store Performance':table(headers,stores.map(r=>[label,snapshot.date,r.storeName,r.workflow,r.jobs,r.submitted,r.activeMs,r.mappingStatus,r.paceSec,r.agents])),
    'Job Ledger':table(['Date','POD','Store','Agent','Workflow','Job ID','Submitted','Active ms','Mapping','Status','Last task','Total tasks'],jobs.map(j=>[j.date,label,j.storeName,j.agent,j.workflow,j.jobId,j.submitted,j.activeMs,j.mappingStatus,j.status,j.lastTask,j.totalTasks])),
    'History':table(['Date','Store','Workflow','Jobs','Confirmed','Active ms','Mapping'],trends.map(t=>[t.date,t.storeName,t.workflow,t.jobs,t.submitted,t.activeMs,t.mappingStatus]))
  };
  return sheet;
}
async function requestGoogle(token,url,method='GET',body){
  const res=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>null);
  if(!res.ok)throw Error(`Google Sheets API HTTP ${res.status}${data?.error?.status?' ('+data.error.status+')':''}. Check spreadsheet permissions and API configuration.`);
  return data;
}
export async function writePodSheet(env,pod,snapshot){
  const id=podSheetMap(env)[pod];required(id,'No Google spreadsheet configured for this POD.');
  const token=await googleAccessToken(env),base=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
  const meta=await requestGoogle(token,`${base}?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))`);
  const tabs=snapshotTables(snapshot),existing=new Map((meta.sheets||[]).map(s=>[s.properties.title,s.properties]));
  const add=Object.keys(tabs).filter(title=>!existing.has(title));
  if(add.length){await requestGoogle(token,`${base}:batchUpdate`,'POST',{requests:add.map(title=>({addSheet:{properties:{title,gridProperties:{rowCount:1200,columnCount:16}}}}))});
    const update=await requestGoogle(token,`${base}?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))`);
    for(const s of update.sheets||[])existing.set(s.properties.title,s.properties);
  }
  const writes=[];
  for(const [title,rows] of Object.entries(tabs)){
    const prop=existing.get(title);required(prop?.sheetId!==undefined,`Google worksheet missing: ${title}`);
    const height=rows.length,width=Math.max(...rows.map(r=>r.length));required(height<=1500&&width<=20,'Report exceeds bounded Google Sheet export limits.');
    const changes=[];
    if(prop.gridProperties.rowCount<height)changes.push({updateSheetProperties:{properties:{sheetId:prop.sheetId,gridProperties:{rowCount:height+20}},fields:'gridProperties.rowCount'}});
    if(prop.gridProperties.columnCount<width)changes.push({updateSheetProperties:{properties:{sheetId:prop.sheetId,gridProperties:{columnCount:width+2}},fields:'gridProperties.columnCount'}});
    if(changes.length)await requestGoogle(token,`${base}:batchUpdate`,'POST',{requests:changes});
    // Full-range updateCells both writes the latest data and clears stale rows. RAW values, never formulas.
    writes.push({updateCells:{range:{sheetId:prop.sheetId,startRowIndex:0,endRowIndex:Math.max(prop.gridProperties.rowCount,height+20),startColumnIndex:0,endColumnIndex:Math.max(prop.gridProperties.columnCount,width+2)},rows:rows.map(r=>({values:r.map(v=>typeof v==='number'?{userEnteredValue:{numberValue:v}}:{userEnteredValue:{stringValue:String(v)}})})),fields:'userEnteredValue'}});
  }
  await requestGoogle(token,`${base}:batchUpdate`,'POST',{requests:writes});
  return {syncedAt:new Date().toISOString(),spreadsheetId:id,rows:Object.fromEntries(Object.entries(tabs).map(([name,r])=>[name,r.length-1]))};
}
