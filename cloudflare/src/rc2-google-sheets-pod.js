// PRODUCTION PILOT ONLY: OOS POD 11. No staging keys, no auto-sync, no browser credentials.
// All sync operations remain disabled unless separate server-side approvals are configured.
// RC2-derived one-way POD Sheets exporter. Service credentials never go to a browser.
// Caller must explicitly authorize the POD and require the production opt-in flag.
const idPattern=/^[A-Za-z0-9_-]{20,160}$/;
const requireValue=(ok,message)=>{if(!ok)throw Error(message)};
const utf8=text=>new TextEncoder().encode(text);
const encode=bytes=>{
  let raw='';for(const b of bytes)raw+=String.fromCharCode(b);
  return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
// This is the private Sheet's non-secret document ID, not a credential.
// Publishing its link to an authenticated POD 11 viewer does NOT grant Google access.
// Production writes still require two explicit opt-in flags and service-account auth.
export const PROD_PILOT_POD='POD 11';
export const PROD_PILOT_SPREADSHEET_ID='12vO25JLIIIRTBo8tIJaHQzrJOZJz3V89g9MB9sfGrgo';
export function podSheetMap(env) {
  if(!env.TT_GOOGLE_SHEETS_POD_MAP_JSON)
    return {[PROD_PILOT_POD]:PROD_PILOT_SPREADSHEET_ID};
  let input;
  try { input=JSON.parse(env.TT_GOOGLE_SHEETS_POD_MAP_JSON); }
  catch { throw Error('Invalid POD spreadsheet map.'); }
  requireValue(input&&typeof input==='object'&&!Array.isArray(input),'POD spreadsheet map must be an object.');
  requireValue(Object.keys(input).length<=60,'Maximum 60 POD spreadsheets.');
  const map=Object.create(null);
  for(const [pod,id] of Object.entries(input)) {
    requireValue(pod.trim()===pod&&pod.length>0&&pod.length<=120&&idPattern.test(String(id)),
      'Invalid POD or Google spreadsheet ID.');
    map[pod]=String(id);
  }
  requireValue(new Set(Object.values(map)).size===Object.keys(map).length,
    'Multiple PODs cannot share one spreadsheet.');
  // Fail closed: neither Albertsons nor the other 16 OOS PODs may be mapped in the pilot.
  const pilotId=PROD_PILOT_SPREADSHEET_ID;
  requireValue(Object.keys(map).length===0 ||
    (Object.keys(map).length===1 && map[PROD_PILOT_POD]===pilotId),
    'Production pilot allows only the verified OOS POD 11 spreadsheet.');
  return map;
}
export function podSheetEnabled(env,pod) {
  // Never turn this on from Wrangler defaults or a user-supplied HTTP parameter.
  return pod==='POD 11' && env.DEPLOYMENT_ENV==='production' &&
    env.TT_PRODUCTION_POD11_RELEASE_APPROVED==='approved' &&
    env.TT_GOOGLE_SHEETS_MANUAL_SYNC_ENABLED==='approved' &&
    env.TT_GOOGLE_SHEETS_CRON_ENABLED!=='approved' &&
    Boolean(env.TT_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON&&podSheetMap(env)[pod]);
}
export function podSheetUrl(env,pod) {
  const id=podSheetMap(env)[pod];
  return id?'https://docs.google.com/spreadsheets/d/'+id+'/edit':null;
}
function cell(value) {
  if(value==null)return '';
  if(typeof value==='number')return Number.isFinite(value)?value:'';
  const text=String(value).slice(0,500);
  // Google RAW protects against formula execution; prefix for CSV/Excel reuse.
  return /^\s*[=+\-@]/.test(text)?"'"+text:text;
}
const table=(head,rows)=>[head,...rows.map(row=>row.map(cell))];
export function snapshotTables(snapshot) {
  const p=snapshot.performance||{},q=snapshot.queue||{},d=snapshot.dispatch||{};
  const label=String(snapshot.podLabel||snapshot.pod||'Assigned POD').slice(0,90);
  const jobs=Array.isArray(p.jobs)?p.jobs:[];
  const stores=Array.isArray(p.stores)?p.stores:[];
  const trends=Array.isArray(p.trends)?p.trends:[];
  return {
    'Overview':table(['Field','Value'],[
      ['TrinoTime store reporting','read only'],['POD',label],
      ['Date',snapshot.date],['Period',snapshot.period],['Generated',snapshot.generatedAt],
      ['Live store',d.active?d.store:'No active instruction'],
      ['Workflow',d.active?d.workflow:'standby'],
      ['Confirmed',stores.reduce((sum,row)=>sum+(Number(row.submitted)||0),0)],
      ['Source','TrinoTime server-authorized Tracker observations, not direct Augmoto data'],
      ['Ledger limitation',p.jobRowsTruncated?'Truncated by server':'None reported']
    ]),
    'Store Queue':table(['Order','Store','Planned jobs','Job IDs'],
      (q.entries||[]).map((x,i)=>[x.order||i+1,x.store||'',x.plannedJobs||0,(x.jobIds||[]).join(' | ')])),
    'Store Performance':table(['POD','Date','Store','Workflow','Jobs','Confirmed','Active ms','Mapping','Seconds/submit','Agents'],
      stores.map(x=>[label,snapshot.date,x.storeName,x.workflow,x.jobs,x.submitted,x.activeMs,x.mappingStatus,x.paceSec,x.agents])),
    'Job Ledger':table(['Date','POD','Store','Agent','Workflow','Job ID','Submitted','Active ms','Mapping','Status'],
      jobs.map(x=>[x.date,label,x.storeName,x.agent,x.workflow,x.jobId,x.submitted,x.activeMs,x.mappingStatus,x.status])),
    'History':table(['Date','Store','Workflow','Jobs','Confirmed','Active ms','Mapping'],
      trends.map(x=>[x.date,x.storeName,x.workflow,x.jobs,x.submitted,x.activeMs,x.mappingStatus]))
  };
}
async function oauthToken(env) {
  let sa;
  try {sa=JSON.parse(env.TT_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON||'');}
  catch {throw Error('Invalid Google service account secret.');}
  requireValue(sa?.type==='service_account'&&typeof sa.client_email==='string'&&
    typeof sa.private_key==='string','Google service account missing required fields.');
  requireValue(sa.client_email==='trinotime-sheets-production@trinotime-cloud.iam.gserviceaccount.com',
    'Staging or unexpected service-account credentials are forbidden in production.');
  const seconds=Math.floor(Date.now()/1000);
  const header=encode(utf8(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const payload=encode(utf8(JSON.stringify({iss:sa.client_email,
    scope:'https://www.googleapis.com/auth/spreadsheets',
    aud:'https://oauth2.googleapis.com/token',iat:seconds,exp:seconds+3600})));
  const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const der=Uint8Array.from(atob(pem),char=>char.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',der,
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signed=header+'.'+payload,signature=encode(new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',key,utf8(signed))));
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signed+'.'+signature})});
  const token=await res.json().catch(()=>null);
  requireValue(res.ok&&token?.access_token,'Google authorization failed.');
  return token.access_token;
}
async function googleRequest(token,url,method='GET',body) {
  const res=await fetch(url,{method,headers:{
    authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  const result=await res.json().catch(()=>null);
  requireValue(res.ok,'Google Sheets API request failed (HTTP '+res.status+').');
  return result;
}
export async function writePodSheet(env,pod,snapshot) {
  requireValue(podSheetEnabled(env,pod),'Google Sheets sync is not approved or configured.');
  requireValue(pod==='POD 11'&&snapshot?.pod===pod,
    'Production pilot snapshot must belong to OOS POD 11 only.');
  const id=podSheetMap(env)[pod];
  const tabs=snapshotTables(snapshot);
  // Reject truncated/out-of-scope export before sending ANY Google write.
  requireValue(snapshot.performance?.jobRowsTruncated!==true,'Truncated job ledgers cannot be synced.');
  requireValue((snapshot.performance?.jobs||[]).every(row=>row.pod===pod),
    'Cross-POD job data cannot be exported.');
  for(const rows of Object.values(tabs)) {
    requireValue(rows.length<=1500&&rows.every(row=>row.length<=20),
      'Spreadsheet export exceeds safe row/column limits.');
  }
  const token=await oauthToken(env);
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id);
  const infoUrl=base+'?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))';
  let meta=await googleRequest(token,infoUrl);
  const found=new Map((meta.sheets||[]).map(item=>[item.properties.title,item.properties]));
  const missing=Object.keys(tabs).filter(name=>!found.has(name));
  if(missing.length) {
    await googleRequest(token,base+':batchUpdate','POST',{
      requests:missing.map(title=>({addSheet:{properties:{
        title,gridProperties:{rowCount:1200,columnCount:16}
      }}}))
    });
    meta=await googleRequest(token,infoUrl);
    for(const item of meta.sheets||[])found.set(item.properties.title,item.properties);
  }
  const requests=[];
  for(const [name,rows] of Object.entries(tabs)) {
    const props=found.get(name);
    requireValue(Number.isSafeInteger(props?.sheetId),'Missing required Google worksheet: '+name);
    const width=Math.max(...rows.map(row=>row.length));
    const oldRows=Math.max(1,Number(props.gridProperties?.rowCount)||1);
    const oldCols=Math.max(1,Number(props.gridProperties?.columnCount)||1);
    const height=Math.max(oldRows,rows.length+20),columns=Math.max(oldCols,width+2);
    // Enlarge grid before updateCells; clear old rows so stale PII is not left.
    if(oldRows<height||oldCols<columns)requests.push({updateSheetProperties:{
      properties:{sheetId:props.sheetId,gridProperties:{rowCount:height,columnCount:columns}},
      fields:'gridProperties.rowCount,gridProperties.columnCount'}});
    requests.push({updateCells:{
      range:{sheetId:props.sheetId,startRowIndex:0,endRowIndex:height,
        startColumnIndex:0,endColumnIndex:columns},
      rows:rows.map(row=>({values:row.map(value=>typeof value==='number'?
        {userEnteredValue:{numberValue:value}}:{userEnteredValue:{stringValue:String(value)}})})),
      fields:'userEnteredValue'}});
  }
  await googleRequest(token,base+':batchUpdate','POST',{requests});
  return {syncedAt:new Date().toISOString(),rows:Object.fromEntries(
    Object.entries(tabs).map(([name,rows])=>[name,rows.length-1]))};
}
