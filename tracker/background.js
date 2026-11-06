// Chrome OS-wide idle is not tab focus: second monitor input remains ACTIVE.
// No pointer/keyboard contents, window titles, or cross-app activity are collected.
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type!=='tt-system-presence')return;
  (async()=>{
    if(!String(sender?.url||'').startsWith('https://labeling-tools.augmoto.com/'))return {state:'unknown'};
    try{return {state:await chrome.idle.queryState(300)};}
    catch(_){return {state:'unknown'};}
  })().then(sendResponse).catch(()=>sendResponse({state:'unknown'}));
  return true;
});
importScripts('activity-owner-core.js', 'availability-core.js');
const ttActivityOwner = TrinoTimeActivityOwnerCore.create({
  storage:chrome.storage.session,
  getTab:id=>chrome.tabs.get(id),
  notify:(old,message)=>chrome.tabs.sendMessage(old.tabId,message).catch(()=>{}),
});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='tt-activity-owner-request')return false;
  const tab=sender?.tab;
  if(!Number.isInteger(tab?.id) || !String(sender?.url||'').startsWith('https://labeling-tools.augmoto.com/')){
    reply({owned:false,at:Date.now()});return false;
  }
  ttActivityOwner.request({tabId:tab.id,workflow:message.workflow,active:message.active===true,
    foreground:message.foreground===true}).then(reply).catch(()=>reply({owned:false,at:Date.now()}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{ttActivityOwner.releaseTab(tabId).catch(()=>{});});
importScripts('coverage-background.js', 'confirmation-background.js', 'qa-recovery-background.js');
