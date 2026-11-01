'use strict';
/* TrinoTime V2.0.0 RC10 — Durable Workspace Messaging
   Chat rendering is separate from attendance; explicit meal commands use the authorized attendance bridge. */
(() => {
  const RELEASE = '2.0.0-rc10';
  const LEGACY_IDENTITY_KEY = 'trinotime_chat_identity_v1';
  // Unicode Emoji 17.0 picker. Keep the newest stable Emoji 17.0 additions first,
  // then a broad CLDR-style category set so the picker stays fast and local.
  const EMOJI_CATEGORIES = [
    ['New 17.0',['🫪','🫯','🫈','🫍','🛘','🪊','🪎','🧑‍🩰']],
    ['Smileys',['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','🫠','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😶‍🌫️','😏','😒','🙄','😬','😮‍💨','🤥','🫨','🙂‍↔️','🙂‍↕️','😌','😔','😪','🤤','😴','🫩','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','😵‍💫','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','☹️','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👻','👽','👾','🤖']],
    ['People',['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','🫷','🫸','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','🫦','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','👷','💂','🕵️','👩‍⚕️','👨‍⚕️','👩‍🏫','👨‍🏫','👩‍💻','👨‍💻','👩‍🚀','👨‍🚀','👩‍🎨','👨‍🎨','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','👯','🕴️','🧖','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣','🏊','⛹️','🏋️','🚴','🚵','🤸','🤼','🤽','🤾','🤹','🧘']],
    ['Animals',['🐵','🐒','🦍','🦧','🐶','🐕','🦮','🐕‍🦺','🐩','🐺','🦊','🦝','🐱','🐈','🐈‍⬛','🦁','🐯','🐅','🐆','🐴','🫎','🫏','🐎','🦄','🦓','🦌','🦬','🐮','🐂','🐃','🐄','🐷','🐖','🐗','🐽','🐏','🐑','🐐','🐪','🐫','🦙','🦒','🐘','🦣','🦏','🦛','🐭','🐁','🐀','🐹','🐰','🐇','🐿️','🦫','🦔','🦇','🐻','🐻‍❄️','🐨','🐼','🦥','🦦','🦨','🦘','🦡','🐾','🦃','🐔','🐓','🐣','🐤','🐥','🐦','🐧','🕊️','🦅','🦆','🦢','🦉','🦤','🪶','🦩','🦚','🦜','🐦‍⬛','🪿','🐸','🐊','🐢','🦎','🐍','🐲','🐉','🦕','🦖','🐳','🐋','🐬','🦭','🐟','🐠','🐡','🦈','🐙','🐚','🪸','🪼','🐌','🦋','🐛','🐜','🐝','🪲','🐞','🦗','🪳','🕷️','🦂','🦟','🪰','🪱','🦠','💐','🌸','💮','🪷','🌹','🥀','🌺','🌻','🌼','🌷','🪻','🌱','🪴','🌲','🌳','🌴','🌵','🌾','🌿','☘️','🍀','🍁','🍂','🍃','🍄']],
    ['Food',['🍇','🍈','🍉','🍊','🍋','🍋‍🟩','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝','🍅','🫒','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🥜','🫘','🌰','🫚','🫛','🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🫔','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🫗','🥤','🧋','🧃','🧉','🧊']],
    ['Activities',['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','🎯','🪀','🪁','🎱','🔮','🪄','🎮','🕹️','🎰','🎲','🧩','🧸','🪅','🪩','🪆','♠️','♥️','♦️','♣️','♟️','🃏','🀄','🎴','🎭','🖼️','🎨','🧵','🪡','🧶','🪢','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🪈']],
    ['Travel',['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🦯','🦽','🦼','🛴','🚲','🛵','🏍️','🛺','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','🛟','⛽','🚧','🚦','🚥','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🛖','🏠','🏡','🏢','🏥','🏦','🏨','🏪','🏫','🏭','🏰','💒','🕌','🕍','⛩️','🕋','⛪']],
    ['Objects',['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💳','🧾','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','🪬','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚿','🛁','🪥','🪒','🧴','🧼','🪥','🧽','🧯','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓','🔑','🗝️']],
    ['Symbols',['❤️','🩷','🧡','💛','💚','💙','🩵','💜','🤎','🖤','🩶','🤍','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','🟰','♾️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪','🟫','⬛','⬜','◼️','◻️','◾','◽','▪️','▫️','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔳','🔲']],
    ['Flags',['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇵🇭','🇺🇸','🇨🇦','🇬🇧','🇦🇺','🇯🇵','🇰🇷','🇨🇳','🇸🇬','🇲🇾','🇹🇭','🇻🇳','🇮🇩','🇮🇳','🇦🇪','🇸🇦','🇪🇸','🇫🇷','🇩🇪','🇮🇹','🇳🇱','🇧🇷','🇲🇽','🇳🇿','🇿🇦','🇪🇺','🇺🇳']]
  ];
  const QUICK_REACTIONS = ['👍','❤️','😂','🎉','🙌'];
  const CHAT_EDIT_WINDOW_MS = 60 * 60 * 1000;
  const EMOJI_RECENT_KEY='trinotime_chat_recent_emoji_v17';
  // v1.1.95 quota guard: keep realtime instant while Messaging is actively used,
  // but avoid background Durable Object churn when chat is closed or the tab is hidden.
  const CHAT_SESSION_ACTIVE_REFRESH_SAFETY_MS = 2 * 60 * 1000;
  // RC20 voice reachability: bring the signaling socket up promptly after sign-in,
  // and keep a recently-active hidden tab reachable long enough for normal device switching.
  // Full sleep/suspension still requires a future Web Push/PWA wake path.
  const BACKGROUND_BADGE_INITIAL_MS = 1200;
  const BACKGROUND_BADGE_REFRESH_MS = 10 * 60 * 1000;
  const DISCONNECTED_FALLBACK_MS = 60 * 1000;
  const HIDDEN_SOCKET_GRACE_MS = 15 * 60 * 1000;
  const CALL_REACHABILITY_GRACE_MS = 8 * 1000;
  const CALL_REACHABILITY_RETRY_MS = 850;
  const SOCKET_HEARTBEAT_MS = 4 * 60 * 1000;
  const SOCKET_STALE_MS = 9 * 60 * 1000;
  const SOCKET_RECONNECT_MAX_MS = 2 * 60 * 1000;
  const state = {
    mealRetryBusy:new Set(),mealOutbox:new Map(),mealOutboxActor:'',hiddenChatRecords:new Set(),unsentChatRecords:new Map(),visibilityGenerations:new Map(),unsendBusy:new Set(),attachmentGeneration:0,
    dmMenuId:'', dmBusy:new Set(), historyGenerations:new Map(), searchGeneration:0, conversationSearchSeq:0, conversationSearchOpen:false, conversationSearchConversationId:'', conversationSearchQuery:'', conversationSearchHits:[], conversationSearchIndex:-1, conversationSearchNextOffset:null, conversationSearchBusy:false, favoriteBusy:false,
    epoch:0, viewEpoch:0, loadSeq:0, threadSeq:0, inboxSeq:0, socketSeq:0,
    drafts:new Map(), threadDrafts:new Map(), replyAttempts:new Map(), readSent:new Map(),
    dirtyConversations:new Set(), dirtyMessages:new Map(), socketRefreshTimer:0,
    threadPageEpoch:0, threadCursor:null, threadLoadingOlder:false, threadContext:false, threadLoaded:false, latestIds:new Set(),
    nextCursor:null, loadingOlder:false, historyContext:false, loaded:false, hasNewMessages:false,
    latestAnchorEpoch:0, latestAnchorConversationId:'', latestAnchorReleased:false,

    sessionToken: '', sessionExpiresAt: 0, reauthPromise: null, actor: null, teams: [], people: [], mentionPeople: [], conversations: [], unreadTotal: 0,
    activeConversationId: '', activeConversation: null, messages: [], peerLastReadAt: null, readReceipts:[], pending: new Map(), failed: new Map(),
    socket: null, socketConnected: false, socketConnecting: false, socketTimer: 0, socketReconnects: 0, socketPing: 0, socketLastPongAt: 0, inboxFallbackTimer: 0, hiddenSocketTimer: 0, backgroundBadgeTimer: 0, lastVisibleAt: Date.now(),
    bootstrapPromise: null, refreshTimer: 0, activeRefreshTimer: 0, typingTimer: 0, typingSent: false, typingByConversation: new Map(),
    quotaMetrics:{bootstraps:0,inboxRefreshes:0,socketTickets:0,socketConnects:0,reconnectSchedules:0,fallbackRefreshes:0,heartbeats:0,backgroundBadgeRefreshes:0},
    threadRoot: null, threadReplies: [], threadPendingId: '', messageEdit: null, searchOpen: false, peopleOpen: false, governanceOpen: false, governanceTab: 'reports', reportTarget: null, lastErrorCode: '', destroyed: false, legacyIdentityToken: '', legacyIdentityExpiresAt: 0,
    capabilities:{attachments:false,gifUploads:false,giphy:false,polls:true,workforceLinks:true,voiceCalls:true,videoCalls:true,turnConfigured:false}, gifProvider:{name:'giphy',apiKey:''}, pendingGif:null, gifResults:[], gifQuery:'', gifSearchTimer:0, gifRequestSeq:0, gifCache:new Map(), emojiCategory:'Recent', pendingAttachments:[], pendingLocalFiles:[], pendingWorkforce:null, fileMode:'all', pollBusy:false, attachmentUploadBusy:false, dragDepth:0, attachmentUrls:new Map(), attachmentPromises:new Map(), backgroundScrollLock:null, call:null, callIceServers:null, callIceExpiresAt:0, callTimer:0, callRingTimer:0, callDisconnectTimer:0, callPendingCandidates:[], callEventSaved:new Set(), callControlPending:new Map(), callControlSeq:0
  };
  const $ = id => document.getElementById(id);
  const els = {};
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function attr(value) { return escapeHtml(value).replace(/`/g,'&#96;'); }
  function portalSurfaceActive() {
    try {
      const app=document.getElementById('appRoot'),gate=document.getElementById('gateOverlay');
      if(!app||app.hidden||app.inert||app.getAttribute('aria-hidden')==='true')return false;
      const style=window.getComputedStyle?window.getComputedStyle(app):null;
      if(style&&(style.display==='none'||style.visibility==='hidden'))return false;
      if(gate){const gateStyle=window.getComputedStyle?window.getComputedStyle(gate):null;if(gate.style.display!=='none'&&(!gateStyle||gateStyle.display!=='none'))return false;}
      return true;
    } catch (_) { return false; }
  }
  function legacySessionActive() {
    if(!portalSurfaceActive())return false;
    try { if (Boolean(isAdmin || isTeamLeader || agentSessionAuthenticated)) return true; } catch (_) {}
    try { return isPermanentUser(currentFirebaseUser()) || Boolean(state.legacyIdentityToken || state.sessionToken); } catch (_) { return false; }
  }
  function currentFirebaseUser() { try { return window.firebase && window.firebase.auth ? window.firebase.auth().currentUser : null; } catch (_) { return null; } }
  function isPermanentUser(user) { return Boolean(user && !user.isAnonymous); }
  function legacyActorContext() {
    try {
      const bridged = window.TrinoTimeMessagingSessionContext?.getActor?.();
      if (bridged && ['agent','team_leader'].includes(bridged.role) && bridged.name && bridged.pod) return { role:String(bridged.role), name:String(bridged.name), pod:String(bridged.pod) };
    } catch (_) {}
    try { if (agentSessionAuthenticated && agentSessionName) return { role:'agent', name:String(agentSessionName), pod:String(agentSessionPod || lockedPod || activePod || '') }; } catch (_) {}
    try { if (!isAdmin && isTeamLeader && teamLeaderName) return { role:'team_leader', name:String(teamLeaderName), pod:String(lockedPod || activePod || '') }; } catch (_) {}
    return null;
  }
  function discardStoredLegacyIdentity() {
    state.legacyIdentityToken=''; state.legacyIdentityExpiresAt=0;
    try { sessionStorage.removeItem(LEGACY_IDENTITY_KEY); } catch (_) {}
  }
  function loadLegacyIdentity() {
    try {
      const raw=sessionStorage.getItem(LEGACY_IDENTITY_KEY); if(!raw)return null;
      const parsed=JSON.parse(raw); if(!parsed?.token){discardStoredLegacyIdentity();return null;}
      const expiresAt=Number(parsed.expiresAt||0)||0;
      if(expiresAt && expiresAt<=Date.now()+5000){discardStoredLegacyIdentity();return null;}
      state.legacyIdentityToken=String(parsed.token||''); state.legacyIdentityExpiresAt=expiresAt; return parsed;
    } catch (_) { discardStoredLegacyIdentity(); return null; }
  }
  function saveLegacyIdentity(data) {
    const expiresAt=new Date(data?.expiresAt||0).getTime(); state.legacyIdentityToken=String(data?.identityToken||''); state.legacyIdentityExpiresAt=expiresAt;
    try { sessionStorage.setItem(LEGACY_IDENTITY_KEY,JSON.stringify({token:state.legacyIdentityToken,expiresAt,actor:data?.actor||null})); } catch (_) {}
  }
  function clearLegacyIdentity() {
    resetChatSession();
    state.legacyIdentityToken=''; state.legacyIdentityExpiresAt=0; state.sessionToken=''; state.sessionExpiresAt=0; state.actor=null; disconnectSocket(false);
    try { sessionStorage.removeItem(LEGACY_IDENTITY_KEY); } catch (_) {}
  }
  async function establishLegacyIdentity(role,name,password,pod) {
    const bridge=window.TrinoTimeMessagingIdentityBridge;
    if(bridge&&typeof bridge.activate==='function'){
      const result=await bridge.activate({role,name,pod,password});
      if(!result?.ok){const e=new Error(result?.message||'Your TrinoTime account could not be verified for Messaging.');e.code=result?.code||'CHAT_IDENTITY_REQUIRED';throw e;}
      clearLegacyIdentity(); state.lastErrorCode=''; return result;
    }
    const e=new Error('Reload TrinoTime to activate the current Messaging identity bridge.');e.code='CHAT_IDENTITY_BRIDGE_REQUIRED';throw e;
  }
  // RC10: send-time commands, account-scoped visibility and explicit link actions.
  // These are deliberately separate from read/replay handlers: receiving a chat
  // message can refresh attendance, but can never initiate an attendance write.
  const chatActions = () => window.TrinoTimeMessagingActions;
  let messageContextController = null;
  function exactMealCommand(text) { return chatActions()?.mealCommand(text) || null; }

  // Staging RC2: slash instruction commands are explicit send actions, never
  // side-effects from receiving, replaying, or rendering chat messages.
  let podInstructionBusy=false;
  function parsePodInstructionCommand(text){
    const match=/^\/instruction(?:\s+([\s\S]*))?$/i.exec(String(text||'').trim());
    if(!match)return null;
    const value=String(match[1]||'').trim();
    if(!value||/^help$/i.test(value))return {action:'help'};
    if(/^status$/i.test(value))return {action:'status'};
    if(/^clear$/i.test(value))return {action:'clear'};
    return {action:'publish',text:value};
  }
  async function sendPodInstructionCommand(command,id){
    // Client-side UX guard: command suggestions and submit are supervisor-only.
    // The Worker independently checks the authenticated directory role and POD.
    const authorizedSupervisor=['admin','team_leader'].includes(String(state.actor?.role||'').trim().toLowerCase());
    if(!authorizedSupervisor){showToast('Only Admins and Team Leaders can use /instruction.',true);return false;}
    if(podInstructionBusy)return false;
    if(command.action==='help'){showToast('POD commands: /instruction message · /instruction status · /instruction clear');return true;}
    if(!id||state.activeConversation?.type!=='team'){
      showToast('Open your authorized POD team chat to publish instructions.',true);return false;
    }
    if(command.action==='publish' && command.text.length>500){showToast('Instruction limit: 500 characters.',true);return false;}
    podInstructionBusy=true;
    try{
      const url='/api/chat/pod-instruction?conversationId='+encodeURIComponent(id);
      const status=await api(url,{method:'GET'});
      if(command.action==='status'){
        window.alert(status.active?`POD instruction (${status.updatedBy||'Team Leader'}):\n${status.text}`:'No active POD chat instruction.');
      } else {
        const result=await api('/api/chat/pod-instruction',{method:'POST',body:JSON.stringify({conversationId:id,action:command.action,text:command.action==='publish'?command.text:'',expectedRevision:status.revision})});
        if(result.saved!==true)throw Error('Instruction save was not confirmed.');
        showToast(command.action==='clear'?'POD instruction cleared.':'POD instruction published to your authorized team.');
      }
      if(els.composer && state.activeConversationId===id){
        els.composer.value='';state.drafts.set(id,'');closeMentionMenu();autoGrow();stopTyping();
      }
      return true;
    }catch(error){showToast(error.message||'POD instruction was not confirmed. Check /instruction status before retrying.',true);return false;}
    finally{podInstructionBusy=false;}
  }


  // STAGING RC2: non-invasive slash-command discovery. Permissions continue to
  // be enforced by the Worker; this popup never publishes or reads instructions.
  const podSlashOptions=Object.freeze([
    {label:'/instruction',insert:'/instruction ',detail:'Publish a message to this POD\u2019s Tracker'},
    {label:'/instruction status',insert:'/instruction status',detail:'Check the current POD instruction'},
    {label:'/instruction clear',insert:'/instruction clear',detail:'Remove the current POD instruction'},
    {label:'/instruction help',insert:'/instruction help',detail:'See how POD instructions work'}
  ]);
  let podSlashMenu=null,podSlashRows=[],podSlashIndex=0,podSlashSuppress=false;
  function podSlashAllowed(){
    return !els.overlay?.hidden && state.activeConversation?.type==='team' &&
      ['admin','team_leader'].includes(String(state.actor?.role||'').toLowerCase());
  }
  function podSlashCandidates(raw){
    const input=String(raw||'').trimStart();
    if(!input.startsWith('/') || /[\r\n]/.test(input) || input.length>90)return [];
    const needle=input.toLowerCase();
    if(needle==='/instruction ' || needle==='/instruction' || needle==='/')return [...podSlashOptions];
    if(needle.includes(' '))return podSlashOptions.filter(o=>o.label.toLowerCase().startsWith(needle));
    return podSlashOptions.filter(o=>o.label.toLowerCase().startsWith(needle));
  }
  function podSlashHide(){if(podSlashMenu)podSlashMenu.hidden=true;els.composer?.setAttribute('aria-expanded','false');podSlashRows=[];}
  function podSlashStyle(){
    if(document.getElementById('ttPodSlashStyle'))return;
    const st=document.createElement('style');st.id='ttPodSlashStyle';st.textContent=`
      #ttPodSlashMenu{position:fixed;z-index:2147483000;box-sizing:border-box;padding:8px;border:1px solid #d5dce9;
      border-radius:15px;background:#fff;color:#152540;box-shadow:0 18px 45px rgba(12,27,49,.20);max-height:340px;overflow:auto;
      font-family:Inter,system-ui,-apple-system,sans-serif}
      #ttPodSlashMenu[hidden]{display:none!important}
      #ttPodSlashMenu .tt-pod-slash-eyebrow{font-size:10px;letter-spacing:.1em;font-weight:800;color:#61748d;padding:6px 10px 8px}
      #ttPodSlashMenu .tt-pod-slash-option{display:block;width:100%;border:0;background:transparent;color:inherit;text-align:left;
      border-radius:10px;padding:11px 12px;cursor:pointer}
      #ttPodSlashMenu .tt-pod-slash-option:hover,#ttPodSlashMenu .tt-pod-slash-option.is-selected{background:#eaf2ff}
      #ttPodSlashMenu .tt-pod-slash-option strong{display:block;font-size:13px;font-weight:850;letter-spacing:.005em}
      #ttPodSlashMenu .tt-pod-slash-option small{display:block;margin-top:4px;font-size:11px;color:#63738d;font-weight:550}
      body.dark-mode #ttPodSlashMenu{background:#15243a;color:#f1f6ff;border-color:#3c5271}
      body.dark-mode #ttPodSlashMenu .tt-pod-slash-option:hover,body.dark-mode #ttPodSlashMenu .tt-pod-slash-option.is-selected{background:#24446b}
      body.dark-mode #ttPodSlashMenu .tt-pod-slash-option small{color:#afbed2}
    `;document.head.append(st);
  }
  function podSlashEnsure(){
    if(podSlashMenu)return;
    podSlashStyle();podSlashMenu=document.createElement('div');podSlashMenu.id='ttPodSlashMenu';podSlashMenu.hidden=true;
    podSlashMenu.setAttribute('role','listbox');podSlashMenu.setAttribute('aria-label','TrinoChat POD instruction commands');
    document.body.append(podSlashMenu);
    els.composer?.setAttribute('aria-controls',podSlashMenu.id);
    podSlashMenu.addEventListener('pointerdown',e=>e.preventDefault());
    podSlashMenu.addEventListener('click',e=>{
      const b=e.target.closest('[data-pod-slash-index]');if(!b)return;
      const i=Number(b.dataset.podSlashIndex);podSlashInsert(i);
    });
  }
  function podSlashPosition(){
    const rect=els.composerWrap?.getBoundingClientRect();if(!rect || !podSlashMenu)return;
    podSlashMenu.style.left=Math.max(8,Math.round(rect.left))+'px';
    podSlashMenu.style.width=Math.max(220,Math.min(Math.round(rect.width),window.innerWidth-16))+'px';
    podSlashMenu.style.bottom=Math.max(8,Math.round(window.innerHeight-rect.top+8))+'px';
  }
  function podSlashShow(){
    if(podSlashSuppress||!podSlashAllowed()||!els.composer){podSlashHide();return;}
    const found=podSlashCandidates(els.composer.value);
    if(!found.length){podSlashHide();return;}
    podSlashEnsure();podSlashRows=found;podSlashIndex=Math.min(podSlashIndex,found.length-1);
    podSlashMenu.replaceChildren();
    const heading=document.createElement('div');heading.className='tt-pod-slash-eyebrow';heading.textContent='POD COMMANDS · TL / ADMIN';podSlashMenu.append(heading);
    found.forEach((opt,i)=>{
      const b=document.createElement('button');b.type='button';b.className='tt-pod-slash-option'+(i===podSlashIndex?' is-selected':'');
      b.dataset.podSlashIndex=String(i);b.id='ttPodSlashOption'+i;b.setAttribute('role','option');
      b.setAttribute('aria-selected',i===podSlashIndex?'true':'false');
      const strong=document.createElement('strong');strong.textContent=opt.label;
      const desc=document.createElement('small');desc.textContent=opt.detail;b.append(strong,desc);podSlashMenu.append(b);
    });
    podSlashPosition();podSlashMenu.hidden=false;els.composer.setAttribute('aria-expanded','true');
    els.composer.setAttribute('aria-activedescendant','ttPodSlashOption'+podSlashIndex);
  }
  function podSlashInsert(i){
    if(!podSlashAllowed()||!podSlashRows[i]){podSlashHide();return;}
    const target=podSlashRows[i].insert;
    podSlashSuppress=true;els.composer.value=target;
    els.composer.dispatchEvent(new Event('input',{bubbles:true}));
    els.composer.focus({preventScroll:true});els.composer.setSelectionRange(target.length,target.length);
    podSlashHide();podSlashSuppress=false;
  }
  function podSlashOnInput(){podSlashIndex=0;podSlashSuppress=false;podSlashShow();}
  function podSlashOnKeydown(e){
    if(!podSlashMenu||podSlashMenu.hidden||!podSlashRows.length||e.isComposing)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();e.stopImmediatePropagation();podSlashIndex=(podSlashIndex+(e.key==='ArrowDown'?1:podSlashRows.length-1))%podSlashRows.length;podSlashShow();
    }else if(e.key==='Enter'||e.key==='Tab'){
      if(e.shiftKey)return;e.preventDefault();e.stopImmediatePropagation();podSlashInsert(podSlashIndex);
    }else if(e.key==='Escape'){
      e.preventDefault();e.stopImmediatePropagation();podSlashSuppress=true;podSlashHide();
    }
  }

  const TERMINAL_MEAL_REJECTION_CODES = new Set(['MEAL_NOT_ACTIVE','MEAL_ALREADY_STARTED','MEAL_SHIFT_INACTIVE','MEAL_RECORD_VOIDED','MEAL_TIME_INVALID','MEAL_REQUEST_EXPIRED','MEAL_MESSAGE_CONFLICT','ATTENDANCE_COACHING_ACTIVE','ATTENDANCE_RECORD_POD_MISMATCH','ATTENDANCE_TARGET_SCOPE_UNVERIFIED']);
  const CHAT_SESSION_RECOVERY_CODES = new Set(['CHAT_TOKEN_EXPIRED','CHAT_TOKEN_INVALID','CHAT_SESSION_MISMATCH','CHAT_SESSION_REVOKED']);
  function mealFailurePresentation(error) {
    const code=String(error?.code||'');
    if(TERMINAL_MEAL_REJECTION_CODES.has(code))return {retryable:false,uncertain:false,text:String(error?.message||'This meal shortcut no longer matches the current Attendance state. No new Attendance action was recorded.')};
    if(CHAT_SESSION_RECOVERY_CODES.has(code))return {retryable:true,uncertain:true,text:'Messaging authorization could not be refreshed. Reopen Messaging or sign in again, verify Attendance, then retry this same message.'};
    return {retryable:true,uncertain:true,text:'Attendance not confirmed — check Attendance before retrying this same message.'};
  }
  function chatText(text) { return chatActions()?.linkify(text) || escapeHtml(text); }
  function mealOutboxKey() { return 'tt:chat:meal-outbox:v1:' + encodeURIComponent(state.actor?.uid || ''); }
  function saveMealOutbox() {
    if (!state.actor?.uid) return;
    const rows = [...state.mealOutbox.values()];
    // sessionStorage survives reloads in this tab, is scoped to the actor, and
    // stores only the minimal retry request. No tokens or attendance snapshots.
    sessionStorage.setItem(mealOutboxKey(), JSON.stringify(rows));renderMealOutbox();
  }
  function rememberMealAttempt(item) {
    if (!exactMealCommand(item.text)) return;
    const key = item.messageId || item.replyId;
    if (!state.mealOutbox.has(key) && state.mealOutbox.size >= 20) throw new Error('Resolve your pending meal commands before sending another.');
    const previous = state.mealOutbox.get(key);
    state.mealOutbox.set(key, {messageId:item.messageId || '',replyId:item.replyId || '',rootMessageId:item.rootMessageId || '',conversationId:item.conversationId,text:item.text,commandRequestedAt:item.commandRequestedAt,createdAt:item.createdAt || new Date().toISOString(),committed:item.committed===true});
    try {saveMealOutbox();} catch (error) {if(previous)state.mealOutbox.set(key,previous);else state.mealOutbox.delete(key);throw new Error('This browser cannot save a safe retry receipt. Enable site storage before sending a meal shortcut.');}
  }
  function forgetMealAttempt(id) {
    state.mealOutbox.delete(id);try {saveMealOutbox();} catch (_) {}
  }
  function restoreMealOutbox() {
    if (!state.actor?.uid || state.mealOutboxActor === state.actor.uid) return;
    state.mealOutboxActor = state.actor.uid;state.mealOutbox.clear();
    let rows=[];try {rows=JSON.parse(sessionStorage.getItem(mealOutboxKey()) || '[]');} catch (_) {}
    for (const item of Array.isArray(rows) ? rows.slice(0,20) : []) {
      const id=item.messageId || item.replyId;
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(id||'') || !exactMealCommand(item.text) || !item.conversationId || !Number.isFinite(Number(item.commandRequestedAt))) continue;
      state.mealOutbox.set(id,item);
      if (item.replyId) {
        const key=threadDraftKey(item.conversationId,item.rootMessageId);
        state.replyAttempts.set(key,{...item,sending:false});state.threadDrafts.set(key,item.text);
      } else state.failed.set(id,{...item,senderUid:state.actor.uid,senderName:state.actor.name,_failed:true,_mealUnconfirmed:true,attachments:[],attachmentIds:[],reactions:{},replyCount:0});
    }
  }
  function renderMealOutbox() {
    const host=els.mealPending;if(!host)return;
    const items=[...state.mealOutbox.entries()];host.hidden=!items.length;
    if(!items.length){host.textContent='';host._mealMarkup='';return;}
    const html='<details><summary>Meal commands awaiting confirmation ('+items.length+')</summary><div class="tt-wm-meal-outbox-list">'+items.map(([id,item])=>{
      const title=state.conversations.find(c=>c.conversationId===item.conversationId)?.title||'Conversation';
      const busy=state.pending.has(id)||state.mealRetryBusy.has(id)||[...state.replyAttempts.values()].some(a=>a.replyId===id&&a.sending);
      return '<div><strong>'+escapeHtml(item.text.trim().toUpperCase())+'</strong> - '+escapeHtml(title)+(item.rootMessageId?' (thread)':'')+'<small>'+(item.committed?'Attendance saved; live confirmation pending.':'Check attendance before retrying. Keep the same request to avoid duplicates.')+'</small><button type="button" class="tt-wm-copy-link" data-chat-meal-retry="'+attr(id)+'"'+(busy?' disabled':'')+'>'+(busy?'Confirming...':'Retry same command')+'</button><button type="button" class="tt-wm-copy-link" data-chat-meal-dismiss="'+attr(id)+'"'+(busy?' disabled':'')+'>Dismiss retry</button></div>';
    }).join('')+'</div></details>';
    if(host._mealMarkup!==html){const open=host.querySelector('details')?.open;host.innerHTML=html;host._mealMarkup=html;if(open)host.querySelector('details').open=true;}
  }
  function dismissMealReceipt(id) {
    const item=state.mealOutbox.get(id);
    if(!item||state.pending.has(id)||state.mealRetryBusy.has(id)||[...state.replyAttempts.values()].some(a=>a.replyId===id&&a.sending))return;
    if(!window.confirm('Check your attendance first: this action may already be recorded. Dismiss only this retry receipt? This does not undo a break or unsend a message.'))return;
    forgetMealAttempt(id);state.failed.delete(id);
    for(const [key,attempt] of state.replyAttempts)if(attempt.replyId===id)state.replyAttempts.delete(key);
    renderMessages(false);showToast('Retry receipt dismissed. Attendance and any sent message are unchanged.');
  }

  function beginMealAttempt(text) {
    if (!exactMealCommand(text)) return null;
    if (!window.TrinoTimeChatAttendance?.begin) throw new Error('Reload the current TrinoTime build before using meal shortcuts.');
    return window.TrinoTimeChatAttendance.begin(state.actor);
  }
  function mealReceiptStatus(message) {
    const id=message.messageId||message.replyId,receipt=state.mealOutbox.get(id);
    if(!receipt || !message.mealBreak || message.unsentAt)return '';
    return '<div class="tt-wm-meal-hint" role="status">Attendance recorded; live-view confirmation is pending. <button type="button" class="tt-wm-copy-link" data-chat-meal-retry="'+attr(id)+'">Retry live synchronization</button></div>';
  }
  function finishMealReceipt(id,data) {
    if(!data?.attendanceSync?.reconciliationPending&&!data?.attendanceSync?.localRefreshPending){forgetMealAttempt(id);return;}
    const item=state.mealOutbox.get(id);if(item){item.committed=true;try{saveMealOutbox();}catch(_){}}
  }
  async function retryMealReceipt(id) {
    const item=state.mealOutbox.get(id),epoch=state.epoch;if(!item||state.mealRetryBusy.has(id))return;
    let lock=null;state.mealRetryBusy.add(id);
    try {
      lock=beginMealAttempt(item.text);
      const reply=Boolean(item.replyId),path=`/api/chat/conversations/${encodeURIComponent(item.conversationId)}/${reply?'replies':'messages'}`;
      const data=await api(path,{method:'POST',body:JSON.stringify(reply?{rootMessageId:item.rootMessageId,replyId:item.replyId,text:item.text,commandRequestedAt:item.commandRequestedAt}:{messageId:item.messageId,text:item.text,commandRequestedAt:item.commandRequestedAt})});
      if(epoch!==state.epoch)return;requireMealAcknowledgement(data);await reflectMealResult(data,lock);if(epoch!==state.epoch)return;finishMealReceipt(id,data);
      if(epoch!==state.epoch)return;
      state.failed.delete(id);await refreshInbox();
      if(state.activeConversationId===item.conversationId){await loadMessages(item.conversationId,false);if(state.threadRoot?.messageId===item.rootMessageId)await loadThreadReplies();}
      showToast((data?.attendanceSync?.reconciliationPending||data?.attendanceSync?.localRefreshPending)?'Attendance saved. Live synchronization is still pending.':'Attendance and message confirmed.');
    }catch(error){if(epoch===state.epoch)showToast(error.message,true);}
    finally{lock?.release();state.mealRetryBusy.delete(id);renderMealOutbox();}
  }

  function requireMealAcknowledgement(data) {
    const message=data?.message||data?.reply;
    if(!data?.attendanceSync?.key || !Number.isFinite(Number(data.attendanceSync.revision)) || Number(data.attendanceSync.revision)<1 || !(message?.mealBreak||message?.attendanceActionRetained))throw new Error('This server did not confirm an attendance action. Check attendance and confirm the matched RC10 Worker and app are deployed before retrying.');
  }
  async function reflectMealResult(data, lock) {
    const key=data?.attendanceSync?.key || lock?.key;
    if (!key || !window.TrinoTimeChatAttendance?.refresh) return;
    try {const refreshed=await window.TrinoTimeChatAttendance.refresh(key,data?.attendanceSync?.revision||0);if(refreshed==null)throw new Error('Local attendance refresh is pending.');}
    catch (_) {if(data.attendanceSync)data.attendanceSync.localRefreshPending=true;showToast('Attendance was saved on the server. This device is still refreshing its attendance view.');}
    if(data?.attendanceSync?.reconciliationPending)showToast('Attendance saved. Some live views are still awaiting synchronization.');
  }
  function visibilityKey(conversationId,messageId,replyId='') {return JSON.stringify([conversationId,messageId,replyId]);}
  function visibleMessages(rows,conversationId=state.activeConversationId) {
    const result=[];
    for (const row of rows || []) {
      if(!row)continue;const key=visibilityKey(conversationId,row.messageId);
      if(state.hiddenChatRecords.has(key))continue;
      if(row.unsentAt)state.unsentChatRecords.set(key,row);
      result.push(state.unsentChatRecords.get(key) || row);
    }
    return result;
  }
  function visibleReplies(rows,conversationId=state.activeConversationId,rootId=state.threadRoot?.messageId) {
    if(state.hiddenChatRecords.has(visibilityKey(conversationId,rootId)))return [];
    const result=[];
    for(const row of rows || []) {
      if(!row)continue;const key=visibilityKey(conversationId,rootId,row.replyId);
      if(state.hiddenChatRecords.has(key))continue;
      if(row.unsentAt)state.unsentChatRecords.set(key,row);
      result.push(state.unsentChatRecords.get(key) || row);
    }
    return result;
  }
  function revokeConversationAttachments(id) {
    state.attachmentGeneration++;
    for(const [key,url] of state.attachmentUrls)if(key.startsWith(id+'|')){try{URL.revokeObjectURL(url);}catch(_){}state.attachmentUrls.delete(key);}
    for(const key of state.attachmentPromises.keys())if(key.startsWith(id+'|'))state.attachmentPromises.delete(key);
  }
  function clearStaleChatSearch() {
    state.searchGeneration++;if(state.searchOpen && els.searchResults)els.searchResults.textContent='Messages changed. Search again for current results.';if(state.conversationSearchOpen&&state.conversationSearchConversationId===state.activeConversationId){state.conversationSearchSeq++;resetConversationSearchResults();if(els.conversationSearchStatus)els.conversationSearchStatus.textContent='Messages changed. Search again for current results.';if(els.conversationSearchResults)els.conversationSearchResults.innerHTML='<div class="tt-wm-conversation-search-empty">Search again to refresh these results.</div>';}
  }
  function renderThreadRoot() {
    const root=state.threadRoot;if(!root||!els.threadRoot)return;const editing=editingRecord(root.messageId);
    const content=editing?editComposerMarkup(root.messageId,'',root.text):`<div class="tt-wm-message-context-surface" data-message-context-surface>${richMessageContent(root)}${chatActions()?.menu(root,state.actor?.uid)||''}</div>`;
    els.threadRoot.innerHTML='<strong>'+chatProfileNameMarkup(root.senderUid,root.senderName,'tt-wm-reward-name','workspace-thread-root')+'</strong>'+content;
  }
  function invalidateChatVisibility(id) {
    state.visibilityGenerations.set(id,(state.visibilityGenerations.get(id)||0)+1);
    revokeConversationAttachments(id);clearStaleChatSearch();
    if(state.activeConversationId!==id)return;
    // A reconnect revision may describe a change whose socket event was missed.
    // Drop stale presentation, not drafts, pending writes or other conversations.
    state.viewEpoch++;state.loadSeq++;state.threadSeq++;state.threadPageEpoch++;
    state.messages=[];state.latestIds.clear();state.nextCursor=null;state.historyContext=false;state.loaded=false;
    closeThread();renderMessages(false);loadMessages(id,true,{replace:true}).catch(()=>{});
  }
  function applyMessageUnsend(event) {
    const id=event.conversationId,rootId=event.messageId,replyId=event.replyId||'';
    if(!id||!rootId)return;
    const key=visibilityKey(id,rootId,replyId);
    if(event.scope==='you')state.hiddenChatRecords.add(key);
    else if(event.message?.unsentAt)state.unsentChatRecords.set(key,event.message);
    else return;
    state.visibilityGenerations.set(id,(state.visibilityGenerations.get(id)||0)+1);
    state.loadSeq++;state.threadSeq++;revokeConversationAttachments(id);clearStaleChatSearch();
    const pendingId=replyId||rootId;state.pending.delete(pendingId);state.failed.delete(pendingId);
    // The receipt may still be needed if its attendance response is ambiguous.
    // An unsend changes presentation only; it never runs/undoes a punch.
    if(state.activeConversationId===id){
      state.messages=visibleMessages(state.messages,id);
      if(state.threadRoot?.messageId===rootId){
        if(!replyId && event.scope==='you')closeThread();
        else {state.threadRoot=visibleMessages([state.threadRoot],id)[0];state.threadReplies=visibleReplies(state.threadReplies,id,rootId);renderThreadRoot();renderThreadReplies(false);}
      }
      if(state.reportTarget?.messageId===rootId)closeReport();
      renderMessages(false);
    }
    const conversation=state.conversations.find(item=>item.conversationId===id);
    if(conversation?.lastMessageId===rootId)conversation.lastMessageText=event.scope==='everyone'?'Message unsent':'Messages updated';
    renderSidebar();
  }
  async function unsendMessage(rootId,replyId,scope) {
    if(scope==='pin'||scope==='unpin'){await pinMessage(rootId,scope);return;}
    const id=state.activeConversationId,epoch=state.epoch,key=visibilityKey(id,rootId,replyId);
    if(!id||state.unsendBusy.has(key))return;
    const record=replyId?state.threadReplies.find(row=>row.replyId===replyId):state.messages.find(row=>row.messageId===rootId)||state.threadRoot;
    if(!record || (scope==='everyone'&&record.senderUid!==state.actor?.uid))return;
    const detail=scope==='everyone'?'This removes the message from the shared chat. People may already have read or copied it. Existing moderation reports are retained.':'This hides the message only for your account, including your other devices.';
    const attendance=(record.mealBreak||record.bioBreak||record.attendanceActionRetained)?'\n\nThe attendance action stays recorded. This will not start, end or undo a break.':'';
    const thread=!replyId&&scope==='you'&&record.replyCount?'\nReplies in this thread will also be hidden from your account.':'';
    if(!window.confirm((scope==='everyone'?'Unsend for Everyone?':'Unsend for You?')+'\n\n'+detail+attendance+thread))return;
    state.unsendBusy.add(key);
    try {
      const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(rootId)}/unsend`,{method:'POST',body:JSON.stringify({scope,replyId:replyId||''})});
      if(epoch!==state.epoch)return;
      applyMessageUnsend({...data,conversationId:id,messageId:rootId,replyId:replyId||'',scope});
      await refreshInbox();showToast(scope==='everyone'?'Message unsent for everyone.':'Message hidden for your account.');
    } catch(error) {if(epoch===state.epoch)showToast(error.message+' The change is not yet confirmed; retry the same option.',true);}
    finally {state.unsendBusy.delete(key);}
  }
  function handleExtraMessageAction(button) {
    if(button.dataset.chatMealDismiss){dismissMealReceipt(button.dataset.chatMealDismiss);return true;}
    if(button.dataset.chatMealRetry){retryMealReceipt(button.dataset.chatMealRetry);return true;}
    if(button.dataset.chatCopyLink){chatActions()?.copyLink(button.dataset.chatCopyLink).then(copied=>{if(copied)showToast('Link copied.');}).catch(error=>showToast(error.message,true));return true;}
    if(button.dataset.chatUnsend){unsendMessage(button.dataset.unsendMessage,button.dataset.unsendReply||'',button.dataset.chatUnsend);return true;}
    return false;
  }
  function bindThreadMessageActions() {
    for(const container of [els.threadReplies,els.threadRoot,els.mealPending]){
      if(!container || container.dataset.rc10ActionsBound)continue;
      container.dataset.rc10ActionsBound='true';container.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&container.contains(button))handleExtraMessageAction(button);});
    }
  }
  function canEditChatRecord(record) {
    if(!record || record.senderUid!==state.actor?.uid || record.unsentAt || record.deletedAt || record._pending || record._failed)return false;
    if(!String(record.text||'').trim())return false;
    if(record.mealBreak||record.bioBreak||exactMealCommand(record.text))return false;
    if(record.poll||record.workforceCard||record.gif||record.callEvent||(Array.isArray(record.attachments)&&record.attachments.length))return false;
    const created=Date.parse(record.createdAt||'');
    return Number.isFinite(created) && Date.now()-created<=CHAT_EDIT_WINDOW_MS;
  }
  function editKey(rootId,replyId=''){return `${rootId||''}::${replyId||''}`;}
  function editingRecord(rootId,replyId=''){return state.messageEdit?.key===editKey(rootId,replyId)?state.messageEdit:null;}
  function cancelMessageEdit(){if(!state.messageEdit)return;state.messageEdit=null;renderMessages(false);renderThreadRoot();renderThreadReplies(false);}
  function beginMessageEdit(rootId,replyId=''){
    const record=replyId?state.threadReplies.find(row=>row.replyId===replyId):state.messages.find(row=>row.messageId===rootId)||state.threadRoot;
    if(!canEditChatRecord(record)){showToast('This message can no longer be edited.',true);return;}
    state.messageEdit={key:editKey(rootId,replyId),rootId,replyId,text:String(record.text||''),busy:false};
    renderMessages(false);renderThreadRoot();renderThreadReplies(false);
    requestAnimationFrame(()=>{const selector=replyId?`[data-reply-row="${CSS.escape(replyId)}"] .tt-wm-edit-input`:`[data-message-row="${CSS.escape(rootId)}"] .tt-wm-edit-input`;const input=document.querySelector(selector);input?.focus?.({preventScroll:true});try{input?.setSelectionRange?.(input.value.length,input.value.length);}catch(_){}});
  }
  function editComposerMarkup(rootId,replyId='',text=''){
    const edit=editingRecord(rootId,replyId);if(!edit)return '';
    return `<div class="tt-wm-inline-edit" data-edit-root="${attr(rootId)}" data-edit-reply="${attr(replyId)}"><textarea class="tt-wm-edit-input" maxlength="2000" rows="2" aria-label="Edit message">${escapeHtml(edit.text)}</textarea><div class="tt-wm-edit-actions"><span>Enter to save · Shift+Enter for a new line</span><button type="button" data-edit-cancel>Cancel</button><button type="button" class="is-primary" data-edit-save${edit.busy?' disabled':''}>${edit.busy?'Saving…':'Save'}</button></div></div>`;
  }
  async function saveMessageEdit(rootId,replyId='',value=''){
    const edit=editingRecord(rootId,replyId);if(!edit||edit.busy)return;
    const text=String(value||'').trim();if(!text){showToast('Type a message first.',true);return;}const current=replyId?state.threadReplies.find(row=>row.replyId===replyId):state.messages.find(row=>row.messageId===rootId)||state.threadRoot;if(text===String(current?.text||'').trim()){cancelMessageEdit();return;}
    edit.text=text;edit.busy=true;renderMessages(false);renderThreadRoot();renderThreadReplies(false);
    const id=state.activeConversationId,generation=state.viewEpoch;
    try{
      const path=replyId?`/api/chat/conversations/${encodeURIComponent(id)}/replies/${encodeURIComponent(replyId)}`:`/api/chat/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(rootId)}`;
      const body=replyId?{rootMessageId:rootId,text}:{text};
      const data=await api(path,{method:'PATCH',body:JSON.stringify(body)});if(!viewIsCurrent(id,generation))return;
      if(replyId){state.threadReplies=mergeReplies(state.threadReplies,[data.reply]);if(state.threadRoot?.messageId===rootId&&data.root)state.threadRoot={...state.threadRoot,...data.root};}
      else {state.messages=mergeMessages(state.messages,[data.message]);if(state.threadRoot?.messageId===rootId)state.threadRoot={...state.threadRoot,...data.message};}
      state.messageEdit=null;renderMessages(false);renderThreadRoot();renderThreadReplies(false);renderPinnedMessage();showToast('Message edited.');
    }catch(error){if(edit)edit.busy=false;if(viewIsCurrent(id,generation)){renderMessages(false);renderThreadRoot();renderThreadReplies(false);showToast(error.message,true);}}
  }
  function messageContextTarget(target) {
    if(!target?.closest || !state.actor?.uid)return null;
    if(target.closest('.tt-wm-inline-edit'))return null;
    const surface=target.closest('[data-message-context-surface]');
    if(!surface)return null;
    const messageRow=surface.closest('[data-message-row]');
    if(messageRow && els.messages?.contains(messageRow)){
      const rootId=messageRow.dataset.messageRow||'';
      const record=state.messages.find(row=>row.messageId===rootId);
      if(!record)return null;
      return {rootId,replyId:'',senderUid:record.senderUid||'',actorUid:state.actor.uid,unsentAt:record.unsentAt||'',pending:Boolean(record._pending),failed:Boolean(record._failed),canPin:state.activeConversation?.type==='team'&&['admin','team_leader'].includes(state.actor?.role),isPinned:state.activeConversation?.pinnedMessageId===rootId,canEdit:canEditChatRecord(record),anchor:messageRow};
    }
    const replyRow=surface.closest('[data-reply-row]');
    if(replyRow && els.threadReplies?.contains(replyRow)){
      const replyId=replyRow.dataset.replyRow||'',rootId=state.threadRoot?.messageId||'';
      const record=state.threadReplies.find(row=>row.replyId===replyId);
      if(!record||!rootId)return null;
      return {rootId,replyId,senderUid:record.senderUid||'',actorUid:state.actor.uid,unsentAt:record.unsentAt||'',pending:Boolean(record._pending),failed:Boolean(record._failed),canEdit:canEditChatRecord(record),anchor:replyRow};
    }
    if(els.threadRoot?.contains(surface) && state.threadRoot?.messageId){
      const record=state.threadRoot;
      return {rootId:record.messageId,replyId:'',senderUid:record.senderUid||'',actorUid:state.actor.uid,unsentAt:record.unsentAt||'',pending:Boolean(record._pending),failed:Boolean(record._failed),canPin:state.activeConversation?.type==='team'&&['admin','team_leader'].includes(state.actor?.role),isPinned:state.activeConversation?.pinnedMessageId===record.messageId,canEdit:canEditChatRecord(record),anchor:els.threadRoot};
    }
    return null;
  }
  function bindMessageContextActions() {
    if(messageContextController)return;
    const api=window.TrinoTimeMessageContextMenu;if(!api?.create)return;
    messageContextController=api.create({
      resolve:messageContextTarget,
      onAction:({rootId,replyId,scope})=>scope==='edit'?beginMessageEdit(rootId,replyId||''):unsendMessage(rootId,replyId||'',scope)
    });
    for(const container of [els.messages,els.threadRoot,els.threadReplies])messageContextController?.bind?.(container);
  }

  function actorPod() { return state.actor?.pod || ''; }
  function shortTime(value) { const d=new Date(value||0); if(!Number.isFinite(d.getTime()))return ''; return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}); }
  function shortDateTime(value) { const d=new Date(value||0); if(!Number.isFinite(d.getTime()))return ''; const now=new Date(); const same=now.toDateString()===d.toDateString(); return same?shortTime(value):d.toLocaleDateString([],{month:'short',day:'numeric'}); }
  function messageDay(value) { const d=new Date(value||0); if(!Number.isFinite(d.getTime()))return ''; const today=new Date(); const yesterday=new Date(Date.now()-86400000); if(d.toDateString()===today.toDateString())return 'Today'; if(d.toDateString()===yesterday.toDateString())return 'Yesterday'; return d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'}); }
  function debounce(fn, delay=180) { let t=0; return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),delay);}; }
  function showToast(message, error=false) { if(!els.toast)return; els.toast.textContent=String(message||'');els.toast.classList.toggle('is-error',error);els.toast.hidden=false;clearTimeout(showToast.t);showToast.t=setTimeout(()=>{els.toast.hidden=true;},3200); }
  function showLaunchBadge() { if(!els.launchBadge)return; els.launchBadge.textContent=state.unreadTotal>99?'99+':(state.unreadTotal?String(state.unreadTotal):''); }
  function setLive(live, text='') { if(!els.live)return; els.live.classList.toggle('is-live',!!live);els.live.textContent=text||(live?'Live':'Connecting'); }
  function chatOverlayOpen(){return !!els.overlay && !els.overlay.hidden;}
  function lockBackgroundScroll(){
    if(state.backgroundScrollLock?.active)return;
    const root=document.documentElement,body=document.body;
    const scrollX=Number(window.scrollX||window.pageXOffset||0)||0;
    const scrollY=Number(window.scrollY||window.pageYOffset||0)||0;
    state.backgroundScrollLock={
      active:true,scrollX,scrollY,
      rootOverflow:root?.style?.overflow||'',
      rootOverscroll:root?.style?.overscrollBehavior||'',
      bodyOverflow:body?.style?.overflow||'',
      bodyOverscroll:body?.style?.overscrollBehavior||''
    };
    root?.classList.add('tt-workspace-chat-open');
    if(root){root.style.overflow='hidden';root.style.overscrollBehavior='none';}
    if(body){body.style.overflow='hidden';body.style.overscrollBehavior='none';}
  }
  function unlockBackgroundScroll(){
    const lock=state.backgroundScrollLock;
    const root=document.documentElement,body=document.body;
    root?.classList.remove('tt-workspace-chat-open');
    if(lock?.active){
      if(root){root.style.overflow=lock.rootOverflow||'';root.style.overscrollBehavior=lock.rootOverscroll||'';}
      if(body){body.style.overflow=lock.bodyOverflow||'';body.style.overscrollBehavior=lock.bodyOverscroll||'';}
      state.backgroundScrollLock=null;
      try{window.scrollTo(lock.scrollX||0,lock.scrollY||0);}catch(_){}
      return;
    }
    if(root){root.style.removeProperty('overflow');root.style.removeProperty('overscroll-behavior');}
    if(body){body.style.removeProperty('overflow');body.style.removeProperty('overscroll-behavior');}
    state.backgroundScrollLock=null;
  }
  function pageVisible(){return !document.hidden && (!document.visibilityState || document.visibilityState==='visible');}
  function browserOnline(){try{return typeof navigator==='undefined'||navigator.onLine!==false;}catch(_){return true;}}
  function callReachabilityWindowOpen(){return state.capabilities.voiceCalls!==false && Date.now()-Number(state.lastVisibleAt||0)<HIDDEN_SOCKET_GRACE_MS;}
  function realtimeDesired(){return !state.destroyed && !!state.sessionToken && legacySessionActive() && (pageVisible()||callNeedsRealtime()||callReachabilityWindowOpen()||hasPendingCallControls()) && browserOnline();}
  function bumpMetric(name){if(Object.prototype.hasOwnProperty.call(state.quotaMetrics,name))state.quotaMetrics[name]++;}
  function quotaSnapshot(){return {...state.quotaMetrics,socketConnected:state.socketConnected,socketConnecting:state.socketConnecting,reconnects:state.socketReconnects,sessionExpiresAt:state.sessionExpiresAt,chatOpen:chatOverlayOpen(),pageVisible:pageVisible(),callReachabilityWindowOpen:callReachabilityWindowOpen()};}
  function setWelcomeVisible(visible) {
    if(!els.welcome)return;
    els.welcome.hidden=!visible;
    els.welcome.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if(visible){ els.welcome.style.removeProperty('display'); }
    else { els.welcome.style.setProperty('display','none','important'); }
  }
  function showLaunchIfSession() {
    if(!els.launch)return;
    const active=legacySessionActive();
    // Body-portaled controls must still obey the authenticated portal boundary.
    // Never remove [hidden] merely because an old role/session flag survived logout.
    els.launch.hidden=!active;
    els.launch.setAttribute('aria-hidden', active ? 'false' : 'true');
    els.launch.tabIndex = active ? 0 : -1;
    if(active){els.launch.style.removeProperty('display');els.launch.style.removeProperty('pointer-events');}
    else {els.launch.style.setProperty('display','none','important');els.launch.style.pointerEvents='none';if(state.legacyIdentityToken||state.sessionToken)clearLegacyIdentity();if(els.overlay && !els.overlay.hidden)closeChat();}
  }
  function displayRole(role) { return role==='admin'?'Admin':role==='team_leader'?'Team Leader':role==='contact'?'Workspace contact':'Agent'; }
  async function chatIdentityToken(user, epoch) {
    let timer;
    try {
      const token=await Promise.race([user.getIdToken(false),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Messaging identity confirmation timed out. Check attendance before retrying the same command.'),{code:'CHAT_IDENTITY_TIMEOUT'})),25000);})]);
      if(epoch!==state.epoch)throw Object.assign(new Error('Messaging session changed.'),{code:'CHAT_SESSION_CHANGED'});
      return token;
    } finally {clearTimeout(timer);}
    // The Auth SDK promise cannot be aborted; a late value has no side effects.
  }
  async function recoverChatSession(epoch) {
    if(state.reauthPromise)return state.reauthPromise;
    const recovery=(async()=>{
      state.sessionToken='';state.sessionExpiresAt=0;
      await bootstrap(true,{connectRealtime:false});
      if(epoch!==state.epoch){const e=new Error('Messaging session changed.');e.code='CHAT_SESSION_CHANGED';throw e;}
      return true;
    })();
    state.reauthPromise=recovery;
    try{return await recovery;}finally{if(state.reauthPromise===recovery)state.reauthPromise=null;}
  }
  async function api(path, options={}, retry=true) {
    const epoch=state.epoch;
    if(retry&&path!=='/api/chat/bootstrap'&&state.sessionToken&&Number(state.sessionExpiresAt)>0&&state.sessionExpiresAt-Date.now()<=CHAT_SESSION_ACTIVE_REFRESH_SAFETY_MS){
      await bootstrap(true,{connectRealtime:false});
      if(epoch!==state.epoch){const e=new Error('Messaging session changed.');e.code='CHAT_SESSION_CHANGED';throw e;}
    }
    const headers=new Headers(options.headers||{}); const isFormData=typeof FormData!=='undefined'&&options.body instanceof FormData; if(options.body!==undefined&&!isFormData&&!headers.has('content-type'))headers.set('content-type','application/json');
    if(path==='/api/chat/bootstrap') {
      loadLegacyIdentity();
      try {
        const securityToken=String(window.TrinoTimeMessagingSessionContext?.getSecuritySessionToken?.()||'');
        if(securityToken)headers.set('x-tt-security-session',securityToken);
      } catch (_) {}
      const user=currentFirebaseUser();
      // RC79: a permanent Firebase workforce identity is authoritative for Messaging.
      // Old sessionStorage chat-identity tokens are migration fallback only and must
      // never shadow a valid permanent identity after credential/session recovery.
      if(isPermanentUser(user)){
        const token=await chatIdentityToken(user,epoch);headers.set('authorization',`Bearer ${token}`);
        const ctx=legacyActorContext();if(ctx){const raw=JSON.stringify({role:ctx.role,name:ctx.name,pod:ctx.pod});headers.set('x-tt-workforce-context',btoa(unescape(encodeURIComponent(raw))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''));}
      } else if(state.legacyIdentityToken) headers.set('x-tt-chat-identity',state.legacyIdentityToken);
      else {const e=new Error('Confirm your existing TrinoTime password once to activate Workspace Messaging.');e.code='CHAT_CREDENTIAL_CONFIRM_REQUIRED';throw e;}
    } else if(state.sessionToken) headers.set('x-tt-chat-session',state.sessionToken);
    const bounded=path==='/api/chat/bootstrap'||String(options.method||'GET')==='GET'||String(options.body||'').includes('"commandRequestedAt"');
    const controller=bounded?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),25000):0;
    let response,data;
    try {
      response=await fetch(path,{...options,headers,cache:'no-store',...(controller?{signal:controller.signal}:{})});
      try {data=await response.json();} catch(error) {if(response.ok)throw Object.assign(new Error('The chat service returned an incomplete response. Check status and retry the same request.'),{code:'CHAT_RESPONSE_INVALID'});data={};}
    } catch(error) {
      if(error.code==='CHAT_RESPONSE_INVALID')throw error;
      throw Object.assign(new Error(controller?.signal.aborted?'Chat confirmation timed out. Check attendance before retrying the same meal message.':'Workspace Messaging could not reach the chat service. Its current sync state is unconfirmed.'),{code:controller?.signal.aborted?'CHAT_CONFIRMATION_TIMEOUT':'CHAT_NETWORK'});
    } finally {clearTimeout(timer);}
    if(epoch!==state.epoch){const e=new Error('Messaging session changed.');e.code='CHAT_SESSION_CHANGED';throw e;} if(response.ok)return data;
    if(path==='/api/chat/bootstrap' && response.status===401 && state.legacyIdentityToken){clearLegacyIdentity();const e=new Error('Confirm your existing TrinoTime password again to refresh Messaging access.');e.code='CHAT_CREDENTIAL_CONFIRM_REQUIRED';e.status=response.status;throw e;}
    if(retry && response.status===401 && path!=='/api/chat/bootstrap' && CHAT_SESSION_RECOVERY_CODES.has(data.error)){await recoverChatSession(epoch);return api(path,options,false);}
    const e=new Error(data.message||'Workspace Messaging request failed.');e.code=data.error||`HTTP_${response.status}`;e.status=response.status;throw e;
  }
  async function bootstrap(force=false, options={}) {
    if(!legacySessionActive())return null; loadLegacyIdentity(); const user=currentFirebaseUser();
    if(!isPermanentUser(user) && !state.legacyIdentityToken){const e=new Error('Confirm your existing TrinoTime password once to activate Workspace Messaging.');e.code='CHAT_CREDENTIAL_CONFIRM_REQUIRED';state.lastErrorCode=e.code;throw e;}
    const connectRealtime=options.connectRealtime!==false;
    if(!force && state.sessionToken && state.sessionExpiresAt-Date.now()>45000){scheduleSessionRefresh();if(connectRealtime&&realtimeDesired()&&!state.socketConnected&&!state.socketConnecting)await connectSocket();return state;}
    if(state.bootstrapPromise)return state.bootstrapPromise;
    const epoch=state.epoch;
    state.bootstrapPromise=(async()=>{
      try{
        bumpMetric('bootstraps');
        const inboxSequence=state.inboxSeq;const data=await api('/api/chat/bootstrap',{method:'POST'},false); if(state.actor&&state.actor.uid!==data.actor?.uid)resetChatSession(); state.sessionToken=data.sessionToken||'';state.sessionExpiresAt=new Date(data.expiresAt||0).getTime();state.actor=data.actor||null;restoreMealOutbox();state.teams=Array.isArray(data.teams)?data.teams:[];state.people=Array.isArray(data.people)?data.people:[];state.mentionPeople=Array.isArray(data.mentionPeople)?data.mentionPeople:[];state.capabilities={attachments:false,gifUploads:false,giphy:false,polls:true,workforceLinks:true,voiceCalls:true,videoCalls:true,turnConfigured:false,...(data.capabilities||{})};state.gifProvider={name:'giphy',apiKey:'',...(data.gifProvider||{})};if(isPermanentUser(currentFirebaseUser())&&state.legacyIdentityToken)discardStoredLegacyIdentity();syncComposerCapabilities();if(inboxSequence===state.inboxSeq){acceptInbox(data.conversations||[]);state.unreadTotal=Number(data.unreadTotal||0);}state.lastErrorCode='';if(els.governanceBtn)els.governanceBtn.hidden=!['admin','team_leader'].includes(state.actor?.role);renderSidebar();showLaunchBadge();scheduleSessionRefresh();if(connectRealtime&&realtimeDesired())await connectSocket();else if(!realtimeDesired())disconnectSocket(false);return state;
      }catch(error){if(epoch!==state.epoch)throw error;state.lastErrorCode=error.code||'CHAT_UNAVAILABLE';state.sessionToken='';state.sessionExpiresAt=0;disconnectSocket(false);setLive(false,'Unavailable');renderUnavailable(error);throw error;}
      finally{if(epoch===state.epoch)state.bootstrapPromise=null;}
    })(); return state.bootstrapPromise;
  }
  function normalizeConversations(list){return (Array.isArray(list)?list:[]).map(c=>{const team=c.type==='team'?state.teams.find(t=>t.teamId===c.teamId):null;return {...c,title:team?.name||c.title||(c.type==='team'?'POD Chat':'Direct message')};});}
  function scheduleSessionRefresh(){clearTimeout(state.refreshTimer);state.refreshTimer=0;if(!realtimeDesired()||!state.sessionExpiresAt)return;const delay=Math.max(60000,state.sessionExpiresAt-Date.now()-CHAT_SESSION_ACTIVE_REFRESH_SAFETY_MS);state.refreshTimer=setTimeout(()=>{if(realtimeDesired())bootstrap(true,{connectRealtime:true}).catch(()=>{});},delay);}
  async function refreshInbox(){
    if(!state.sessionToken)return; bumpMetric('inboxRefreshes');
    const epoch=state.epoch,sequence=++state.inboxSeq;
    try{const data=await api('/api/chat/inbox');if(epoch!==state.epoch||sequence!==state.inboxSeq)return;
      acceptInbox(data.conversations||[]);state.unreadTotal=Number(data.unreadTotal||0);
      if(state.activeConversationId){const current=state.conversations.find(c=>c.conversationId===state.activeConversationId);if(current)state.activeConversation={...(state.activeConversation||{}),...current};}
      renderSidebar();renderThreadHeader();showLaunchBadge();
    }catch(error){if(epoch===state.epoch&&error.status>=500)setLive(false,'Degraded');}
  }
  function socketUrl(ticket){const u=new URL('/api/chat/live',location.origin);u.protocol=location.protocol==='https:'?'wss:':'ws:';u.searchParams.set('ticket',ticket);return u.href;}
  function reconnectDelayMs(attempt){const base=Math.min(SOCKET_RECONNECT_MAX_MS,1500*Math.pow(2,Math.min(Math.max(0,attempt-1),7)));return Math.round(base*(0.8+Math.random()*0.4));}
  function scheduleSocketReconnect(reauthorize=false){
    clearTimeout(state.socketTimer);state.socketTimer=0;if(!realtimeDesired())return;
    state.socketReconnects++;bumpMetric('reconnectSchedules');const delay=reconnectDelayMs(state.socketReconnects);
    state.socketTimer=setTimeout(async()=>{state.socketTimer=0;if(!realtimeDesired())return;try{if(reauthorize||state.sessionExpiresAt-Date.now()<45000)await bootstrap(true,{connectRealtime:true});else await connectSocket();}catch(_){scheduleSocketReconnect(false);}},delay);
  }
  async function connectSocket(){
    if(state.destroyed||!state.sessionToken||!realtimeDesired())return;
    if(state.socketConnected&&state.socket?.readyState===1)return;
    if(state.socketConnecting)return;
    state.socketConnecting=true;disconnectSocket(false,{preserveConnecting:true});const socketSequence=state.socketSeq,epoch=state.epoch;
    try{
      bumpMetric('socketTickets');const data=await api('/api/chat/socket-ticket',{method:'POST'});if(socketSequence!==state.socketSeq||epoch!==state.epoch||!realtimeDesired())return;
      const ws=new WebSocket(socketUrl(data.ticket),'tt-chat');state.socket=ws;setLive(false,'Connecting');
      ws.onopen=()=>{if(state.socket!==ws)return;state.socketConnecting=false;state.socketConnected=true;state.socketReconnects=0;state.socketLastPongAt=Date.now();bumpMetric('socketConnects');setLive(true,'Live');state.readSent.clear();flushPendingCallControls();socketRefresh(state.activeConversationId);clearInterval(state.socketPing);state.socketPing=setInterval(()=>{try{if(!realtimeDesired()||ws.readyState!==1)return;if(Date.now()-state.socketLastPongAt>SOCKET_STALE_MS){ws.close(4000,'heartbeat-timeout');return;}bumpMetric('heartbeats');ws.send(JSON.stringify({type:'ping'}));}catch(_){}},SOCKET_HEARTBEAT_MS);};
      ws.onmessage=event=>{if(state.socket!==ws)return;let payload=null;try{payload=JSON.parse(event.data);}catch(_){return;}handleSocketEvent(payload);};
      ws.onclose=event=>{if(state.socket!==ws)return;state.socket=null;state.socketConnecting=false;state.socketConnected=false;clearInterval(state.socketPing);setLive(false,realtimeDesired()?(event.code===4001||event.code===4003||event.code===1012?'Reauthorizing':'Reconnecting'):'Paused');if(realtimeDesired())scheduleSocketReconnect(event.code===4001||event.code===4003||event.code===1012);};
      ws.onerror=()=>{if(state.socket!==ws)return;setLive(false,realtimeDesired()?'Reconnecting':'Paused');};
    }catch(error){if(socketSequence!==state.socketSeq||epoch!==state.epoch)return;state.socketConnecting=false;setLive(false,realtimeDesired()?'Offline':'Paused');if(realtimeDesired())scheduleSocketReconnect(false);}
    finally{if(socketSequence===state.socketSeq&&state.socket?.readyState!==0)state.socketConnecting=false;}
  }
  function disconnectSocket(reconnect=false,options={}){state.socketSeq++;const ws=state.socket;state.socket=null;state.socketConnected=false;if(!options.preserveConnecting)state.socketConnecting=false;clearInterval(state.socketPing);clearTimeout(state.socketTimer);state.socketTimer=0;if(ws){try{ws.onclose=null;ws.close(1000,'client-pause');}catch(_){}}if(reconnect&&realtimeDesired())scheduleSocketReconnect(false);}
  function socketRefresh(conversationId, messageId='') {
    if(conversationId)state.dirtyConversations.add(conversationId);
    if(conversationId&&messageId){if(!state.dirtyMessages.has(conversationId))state.dirtyMessages.set(conversationId,new Set());state.dirtyMessages.get(conversationId).add(messageId);}
    if(state.socketRefreshTimer)return;
    state.socketRefreshTimer=setTimeout(flushSocketRefresh,180);
  }
  async function flushSocketRefresh() {
    state.socketRefreshTimer=0;
    const dirty=new Set(state.dirtyConversations), changed=new Map(state.dirtyMessages);
    state.dirtyConversations.clear();state.dirtyMessages.clear();
    const epoch=state.epoch;
    await refreshInbox();if(epoch!==state.epoch)return;
    const id=state.activeConversationId,generation=state.viewEpoch;
    if(!id||!dirty.has(id))return;
    if(state.historyContext){state.hasNewMessages=true;updateHistoryControls();}
    else await loadMessages(id,false);
    if(!viewIsCurrent(id,generation))return;
    // Fetch explicitly changed older messages too, so edits/deletes/reactions
    // do not remain stale merely because a row is outside the latest page.
    for(const messageId of changed.get(id)||[]){
      if(!state.messages.some(m=>m.messageId===messageId)||(!state.historyContext&&state.latestIds.has(messageId)))continue;
      try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`);
        if(!viewIsCurrent(id,generation))return;
        state.messages=mergeMessages(state.messages,[data.message]);if(data.message?.bioBreak?.command==='stop'){for(const item of state.messages)if(item.bioBreak?.sessionId===data.message.bioBreak.sessionId&&item.bioBreak?.ledgerKey===data.message.bioBreak.ledgerKey)item.bioBreak.endedAt=data.message.bioBreak.endedAt;}renderMessages(false);
      }catch(error){if(viewIsCurrent(id,generation)&&error.status===404){state.messages=state.messages.filter(m=>m.messageId!==messageId);renderMessages(false);}}
    }
    if(state.threadRoot&&!els.threadPanel.hidden){
      const root=state.messages.find(m=>m.messageId===state.threadRoot.messageId);
      if(!root)closeThread();
      else{
        state.threadRoot=visibleMessages([root],id)[0]||state.threadRoot;renderThreadRoot();
        await loadThreadReplies();
      }
    }
    if(viewIsCurrent(id,generation))await markRead();
  }
  function handleSocketEvent(payload){if(!payload||!payload.type)return;if(payload.type==='chat.profile-updated'){applyCanonicalDisplayName(payload.uid,payload.displayName,false);try{window.dispatchEvent(new CustomEvent('trinotime:remote-admin-profile-updated',{detail:{uid:String(payload.uid||''),displayName:String(payload.displayName||'')}}));}catch(_){}return;}if(payload.type==='chat.attendance-updated'){window.TrinoTimeChatAttendance?.refresh(payload.key,payload.revision)?.catch(()=>{});return;}if(payload.type==='chat.message-unsent'){applyMessageUnsend(payload);socketRefresh(payload.conversationId||'');return;}if(/^call\./.test(payload.type)){handleCallSocketEvent(payload);return;}if(payload.type==='chat.connected'){setLive(true,'Live');return;}if(payload.type==='pong'){state.socketLastPongAt=Date.now();return;}if(payload.type==='chat.typing'){handleTyping(payload);return;}if(payload.type==='chat.read'){if(payload.conversationId===state.activeConversationId&&payload.readerUid!==state.actor?.uid){upsertReadReceipt({uid:payload.readerUid,readerName:payload.readerName||'',lastReadAt:payload.lastReadAt});state.peerLastReadAt=state.activeConversation?.type==='direct'?(payload.lastReadAt||state.peerLastReadAt):state.peerLastReadAt;renderMessages(false);}return;}if(payload.type==='chat.visibility'){state.inboxSeq++;}if(payload.type==='chat.visibility'&&payload.action!=='restore'){dismissDirect(payload.conversationId,payload.action==='delete');state.dmMenuId='';}if(/^chat\./.test(payload.type)){socketRefresh(payload.conversationId||'',payload.messageId||'');}}
  function handleTyping(payload){if(!payload.conversationId||payload.uid===state.actor?.uid)return;const key=payload.conversationId;if(payload.active){state.typingByConversation.set(key,{name:payload.displayName||'Someone',until:Date.now()+2500});}else state.typingByConversation.delete(key);renderTyping();setTimeout(()=>{const item=state.typingByConversation.get(key);if(item&&item.until<Date.now()){state.typingByConversation.delete(key);renderTyping();}},2700);}
  function sendSocket(payload){try{if(state.socket&&state.socket.readyState===1){state.socket.send(JSON.stringify(payload));return true;}}catch(_){}return false;}
  function voiceCallSupported(){return Boolean(window.RTCPeerConnection&&navigator.mediaDevices?.getUserMedia);}
  function videoCallSupported(){return voiceCallSupported()&&state.capabilities?.videoCalls!==false;}
  function ensureScreenShare(call){
    if(!call || call.media!=='video' || !window.TrinoTimeScreenShare) return null;
    if(!call.screenShare) call.screenShare=window.TrinoTimeScreenShare.create(call,{
      isCurrent:()=>state.call===call,
      changed:()=>renderScreenShare(call),
      signal:signal=>state.call===call && sendReliableCallControl('call.signal',call,{signalKind:'screen',signal})
    });
    return call.screenShare;
  }
  function renderScreenShare(call=state.call){
    const share=call?ensureScreenShare(call):null;
    const view=share?.snapshot();
    const visible=Boolean(view&&(view.active||view.remoteActive));
    els.callOverlay?.classList.toggle('is-screen-sharing',visible);
    if(els.callShare){
      els.callShare.hidden=!(call?.media==='video'&&call.status==='connected');
      const busy=Boolean(view&&(view.pending||view.phase==='stopping'));
      els.callShare.disabled=busy||(!view?.active&&(!view?.supported||!view?.available));
      const label=view?.active?'Stop Sharing':busy?'Selecting...':'Share Screen';
      els.callShare.querySelector('b')&&(els.callShare.querySelector('b').textContent=label);
      els.callShare.setAttribute('aria-label',label);els.callShare.setAttribute('aria-pressed',String(Boolean(view?.active)));
      els.callShare.title=view?.active?'Stop sharing your screen':!view?.supported?'Screen capture is unavailable in this browser':!view?.available?'Both participants need the updated app in a new connected call':'Share a screen, window, or tab';
    }
    if(els.callShareStage)els.callShareStage.hidden=!visible;
    if(els.callShareNotice){const text=view?.notice||'';els.callShareNotice.hidden=!text;els.callShareNotice.textContent=text;}
    if(els.callShareLabel)els.callShareLabel.textContent=view?.remoteActive?`${call.peerName||'Team member'} is sharing${view.active?' - your screen is also shared':''}`:view?.active?'You are sharing your screen':'';
    if(els.callShareQuality)els.callShareQuality.textContent=view?.active&&view.captured?`${view.captured.width} x ${view.captured.height} capture | up to 60 fps`:'Up to 720p / 60 fps';
    const stream=view?.remoteActive?view.remoteStream:view?.active?view.localStream:null;
    if(els.callShareVideo){
      els.callShareVideo.muted=true;els.callShareVideo.defaultMuted=true;
      if(syncCallMediaElement(els.callShareVideo,stream))els.callShareVideo.play?.().catch(()=>{if(els.callShareResume)els.callShareResume.hidden=false;});
      if(!visible&&els.callShareResume)els.callShareResume.hidden=true;
    }
    if(els.callShareWaiting)els.callShareWaiting.hidden=!(view?.remoteWaiting);
  }
  function toggleScreenShare(){const share=ensureScreenShare(state.call);if(!share)return;const view=share.snapshot();(view.active?share.stop():share.start()).catch(()=>showToast('Screen sharing could not be changed. Your call is still connected.',true));}
  function ensureBackgroundBlur(call){
    if(!call || call.media!=='video' || !window.TrinoTimeBackgroundBlur) return null;
    if(!call.backgroundBlur) call.backgroundBlur=window.TrinoTimeBackgroundBlur.create(call,{
      isCurrent:()=>state.call===call,
      changed:()=>renderVoiceCall(),
      replaceTrack:async(nextTrack,previousTrack)=>{
        if(state.call!==call||!call.pc||!nextTrack)return false;
        const videoTransceivers=(call.pc.getTransceivers?.()||[]).filter(item=>item?.receiver?.track?.kind==='video');
        const cameraSender=(call.pc.getSenders?.()||[]).find(sender=>sender?.track===previousTrack) || videoTransceivers[0]?.sender || null;
        if(!cameraSender?.replaceTrack)throw new Error('camera-sender-unavailable');
        await cameraSender.replaceTrack(nextTrack);
        await applyCallSenderBudget(cameraSender,nextTrack);
        return true;
      }
    });
    return call.backgroundBlur;
  }
  function renderBackgroundBlur(call=state.call){
    const blur=call?ensureBackgroundBlur(call):null;
    if(blur&&call?.localStream){const track=call.localStream.getVideoTracks?.()[0]||null;blur.bind(track);}
    const view=blur?.snapshot?.();
    if(els.callBlur){
      const visible=Boolean(call?.media==='video'&&call.status==='connected');
      els.callBlur.hidden=!visible;
      const active=Boolean(view?.active),busy=Boolean(view?.pending),controllable=Boolean(view?.controllable);
      els.callBlur.disabled=visible&&(busy||!controllable);
      els.callBlur.setAttribute('aria-pressed',String(active));
      const label=busy?'Preparing…':active?'Blur on':controllable?'Background':'Blur unavailable';
      els.callBlur.querySelector('b')&&(els.callBlur.querySelector('b').textContent=label);
      els.callBlur.setAttribute('aria-label',active?'Turn background blur off':'Turn background blur on');
      els.callBlur.title=!visible?'Background blur':busy?'Preparing background blur…':controllable?(active?'Turn off camera background blur':(view?.mode==='person-segmentation-ready'||view?.mode==='person-segmentation')?'Blur only the background while keeping you sharp on this device':(view?.mode==='local-ready'||view?.mode==='local-portrait')?'Blur your background locally without uploading camera frames':'Blur your camera background locally on this device'):view?.supported?'Background blur is controlled by your device or operating system':'Background blur is unavailable for this camera/browser';
    }
    if(els.callBlurNotice){const text=String(view?.notice||'');els.callBlurNotice.hidden=!text;els.callBlurNotice.textContent=text;}
  }
  async function toggleBackgroundBlur(){
    const call=state.call,blur=ensureBackgroundBlur(call);if(!call||call.media!=='video'||!blur)return;
    const ok=await blur.toggle();if(state.call!==call)return;renderBackgroundBlur(call);
    const view=blur.snapshot();
    if(ok)showToast(view.active?'Background blur is on.':'Background blur is off.');
    else if(view.notice)showToast(view.notice,true);
  }
  function callMediaLabel(call){return call?.media==='video'?'Video':'Voice';}
  function callNeedsRealtime(){return Boolean(state.call&&['preparing','calling','ringing','incoming','connecting','connected'].includes(state.call.status));}
  function voiceCallBlocksBackground(){return Boolean(els.callOverlay&&!els.callOverlay.hidden&&state.call&&!state.call.minimized);}
  function callPeer(conversation=state.activeConversation){if(conversation?.type!=='direct')return null;const uid=(Array.isArray(conversation.memberIds)?conversation.memberIds:[]).map(String).find(item=>item!==state.actor?.uid);if(!uid)return null;return {uid,name:profileName(uid,conversation.title||'Team member')||conversation.title||'Team member'};}
  function callPodContext(uid,pod='',podLabel=''){const person=state.people.find(item=>item.uid===uid);const candidate=String(person?.podLabel||podLabel||'').trim();if(candidate&&!/^tt-custom-pod:/i.test(candidate))return candidate;const teamId=String(person?.teamId||'');const team=state.teams.find(item=>String(item.teamId||'')===teamId);if(team?.name&&!/^tt-custom-pod:/i.test(String(team.name)))return String(team.name);const fallback=String(person?.pod||pod||'').trim();return fallback&&!/^tt-custom-pod:/i.test(fallback)?fallback:'';}
  function newCallId(){return `call_${crypto.randomUUID().replace(/-/g,'')}`;}
  function currentCallDuration(){return state.call?.connectedAt?Math.max(0,Math.floor((Date.now()-state.call.connectedAt)/1000)):0;}
  function callUiStatus(call){if(!call)return '';if(call.status==='preparing')return call.media==='video'?'Preparing camera & microphone…':'Preparing microphone…';if(call.status==='calling')return call.reachabilityWaiting?'Trying to reach this device…':'Calling…';if(call.status==='ringing')return 'Ringing…';if(call.status==='incoming')return `Incoming ${call.media==='video'?'video':'voice'} call`;if(call.status==='connecting')return 'Connecting securely…';if(call.status==='connected'){const states=[];if(call.muted)states.push('Microphone muted');if(call.media==='video'&&call.videoMuted)states.push('Camera off');return states.length?`Connected · ${states.join(' · ')}`:'Connected';}return `${callMediaLabel(call)} call`;}
  function syncCallMediaElement(element,stream){if(!element)return false;const next=stream||null;if(element.srcObject===next)return false;element.srcObject=next;return true;}
  function setCallPlaybackRecovery(call,blocked){
    if(call)call.playbackBlocked=Boolean(blocked);
    if(!els.callPlaybackResume)return;
    const show=Boolean(call&&call.media==='video'&&call.playbackBlocked&&call.status!=='incoming'&&!call.minimized);
    els.callPlaybackResume.hidden=!show;
  }
  function primeRemoteVideoPlayback(call){
    if(!call||call.media!=='video'||!els.callRemoteVideo)return;
    if(!call.remoteStream)call.remoteStream=new MediaStream();
    els.callRemoteVideo.autoplay=true;els.callRemoteVideo.playsInline=true;els.callRemoteVideo.muted=true;els.callRemoteVideo.defaultMuted=true;
    els.callRemoteVideo.setAttribute('playsinline','');els.callRemoteVideo.setAttribute('webkit-playsinline','');
    syncCallMediaElement(els.callRemoteVideo,call.remoteStream);
    const attempt=els.callRemoteVideo.play?.();if(attempt?.catch)attempt.catch(()=>{});
  }
  async function playRemoteCallMedia(call,{fromGesture=false}={}){
    if(!call||state.call!==call||!call.remoteStream)return false;
    const videoTracks=call.remoteStream.getVideoTracks?.()||[],audioTracks=call.remoteStream.getAudioTracks?.()||[];let videoOk=true,audioOk=true;
    if(call.media==='video'&&els.callRemoteVideo&&videoTracks.length){
      els.callRemoteVideo.autoplay=true;els.callRemoteVideo.playsInline=true;els.callRemoteVideo.muted=true;els.callRemoteVideo.defaultMuted=true;els.callRemoteVideo.setAttribute('playsinline','');els.callRemoteVideo.setAttribute('webkit-playsinline','');syncCallMediaElement(els.callRemoteVideo,call.remoteStream);
      try{await els.callRemoteVideo.play?.();}catch(_){videoOk=false;}
    }
    if(els.callRemoteAudio&&audioTracks.length){
      els.callRemoteAudio.autoplay=true;syncCallMediaElement(els.callRemoteAudio,call.remoteStream);
      try{await els.callRemoteAudio.play?.();els.callRemoteAudio.controls=false;}catch(_){audioOk=false;if(call.media!=='video')els.callRemoteAudio.controls=true;}
    }
    if(state.call===call){setCallPlaybackRecovery(call,!(videoOk&&audioOk));if(fromGesture&&videoOk&&audioOk)showToast('Call media resumed.');}
    return videoOk&&audioOk;
  }
  function resumeRemoteCallMedia(){const call=state.call;if(!call)return;playRemoteCallMedia(call,{fromGesture:true}).catch(()=>setCallPlaybackRecovery(call,true));}
  function renderVoiceCall(){
    const call=state.call;if(!els.callOverlay)return;
    call?.screenShare?.monitor();renderScreenShare(call);renderBackgroundBlur(call);
    if(!call){
      els.callOverlay.hidden=true;els.callOverlay.classList.remove('is-minimized','is-video');els.callOverlay.setAttribute('aria-modal','true');document.documentElement.classList.remove('tt-voice-call-minimized');
      if(els.callMinimize)els.callMinimize.hidden=true;if(els.callPlaybackResume)els.callPlaybackResume.hidden=true;if(els.callMeta){els.callMeta.hidden=true;els.callMeta.textContent='';}if(els.callAvatar)els.callAvatar.hidden=false;if(els.callVideoStage)els.callVideoStage.hidden=true;
      if(els.callBlur)els.callBlur.hidden=true;if(els.callBlurNotice){els.callBlurNotice.hidden=true;els.callBlurNotice.textContent='';}
      if(els.callRemoteAudio){els.callRemoteAudio.srcObject=null;els.callRemoteAudio.controls=false;}if(els.callRemoteVideo){els.callRemoteVideo.srcObject=null;els.callRemoteVideo.controls=false;}if(els.callLocalVideo)els.callLocalVideo.srcObject=null;
      if(els.overlay?.hidden)unlockBackgroundScroll();renderThreadHeader();return;
    }
    const connected=call.status==='connected',incoming=call.status==='incoming',video=call.media==='video';if(!connected)call.minimized=false;const minimized=connected&&Boolean(call.minimized);const showVideoStage=video&&!incoming;
    els.callOverlay.hidden=false;els.callOverlay.classList.toggle('is-minimized',minimized);els.callOverlay.classList.toggle('is-video',video);els.callOverlay.setAttribute('aria-modal',minimized?'false':'true');document.documentElement.classList.toggle('tt-voice-call-minimized',minimized);if(chatOverlayOpen()||!minimized)lockBackgroundScroll();else unlockBackgroundScroll();
    if(els.callVideoStage)els.callVideoStage.hidden=!showVideoStage;if(els.callAvatar)els.callAvatar.hidden=showVideoStage;if(els.callName)els.callName.textContent=call.peerName||'Team member';if(els.callKicker)els.callKicker.textContent=call.direction==='incoming'?`Incoming · TrinoTime ${callMediaLabel(call)}`:`TrinoTime ${callMediaLabel(call)}`;
    if(els.callMeta){const context=String(call.peerPodLabel||'').trim();els.callMeta.textContent=context;els.callMeta.hidden=!context;}if(els.callStatus)els.callStatus.textContent=callUiStatus(call);if(els.callAvatar)els.callAvatar.innerHTML=personAvatar(call.peerUid,call.peerName,'tt-call-avatar');
    if(els.callMinimize){els.callMinimize.hidden=!connected;const label=video?(minimized?'Restore video call':'Minimize video call'):(minimized?'Restore voice call':'Minimize voice call');els.callMinimize.setAttribute('aria-label',label);els.callMinimize.title=minimized?'Restore call':'Minimize call';}
    if(els.callMute)els.callMute.setAttribute('aria-pressed',String(Boolean(call.muted)));if(els.callCamera)els.callCamera.setAttribute('aria-pressed',String(Boolean(call.videoMuted)));if(els.callTimer){els.callTimer.hidden=!connected;els.callTimer.textContent=formatCallDuration(currentCallDuration());}
    if(els.callAccept)els.callAccept.hidden=!incoming;if(els.callDecline)els.callDecline.hidden=!incoming;if(els.callMute){els.callMute.hidden=!connected;els.callMute.querySelector('b')&&(els.callMute.querySelector('b').textContent=call.muted?'Unmute':'Mute');}
    if(els.callCamera){els.callCamera.hidden=!(connected&&video);els.callCamera.querySelector('b')&&(els.callCamera.querySelector('b').textContent=call.videoMuted?'Camera on':'Camera off');}if(els.callEnd)els.callEnd.hidden=incoming;
    const localPreview=video?(call.backgroundBlur?.snapshot?.().previewStream||call.localStream||null):null;if(els.callLocalVideo&&video&&syncCallMediaElement(els.callLocalVideo,localPreview)){els.callLocalVideo.play?.().catch(()=>{});}if(els.callRemoteVideo&&video&&call.remoteStream){els.callRemoteVideo.muted=true;els.callRemoteVideo.defaultMuted=true;syncCallMediaElement(els.callRemoteVideo,call.remoteStream);}if(els.callRemoteAudio&&call.remoteStream)syncCallMediaElement(els.callRemoteAudio,call.remoteStream);setCallPlaybackRecovery(call,Boolean(call.playbackBlocked));
    if(els.voiceCallBtn){els.voiceCallBtn.disabled=true;els.voiceCallBtn.title='A call is already in progress';}if(els.videoCallBtn){els.videoCallBtn.disabled=true;els.videoCallBtn.title='A call is already in progress';}
  }
  function toggleVoiceCallMinimized(){const call=state.call;if(!call||call.status!=='connected')return;call.minimized=!call.minimized;if(call.minimized&&chatOverlayOpen())closeChat();renderVoiceCall();if(els.callMinimize&&!els.callMinimize.hidden)els.callMinimize.focus?.({preventScroll:true});}
  function clearCallTimers(){clearInterval(state.callTimer);state.callTimer=0;clearTimeout(state.callRingTimer);state.callRingTimer=0;clearTimeout(state.callDisconnectTimer);state.callDisconnectTimer=0;const call=state.call;if(call?.reachabilityTimer){clearTimeout(call.reachabilityTimer);call.reachabilityTimer=0;}}
  function cleanupCallMedia(call=state.call){if(!call)return;call.screenShare?.dispose();call.backgroundBlur?.dispose();try{call.pc?.close();}catch(_){}try{for(const track of call.localStream?.getTracks?.()||[])track.stop();}catch(_){}try{for(const track of call.remoteStream?.getTracks?.()||[])track.stop();}catch(_){}call.pc=null;call.localStream=null;call.remoteStream=null;state.callPendingCandidates=[];if(els.callRemoteAudio){els.callRemoteAudio.srcObject=null;els.callRemoteAudio.controls=false;}if(els.callRemoteVideo){els.callRemoteVideo.srcObject=null;els.callRemoteVideo.controls=false;}if(els.callLocalVideo)els.callLocalVideo.srcObject=null;}
  function resetVoiceCall(message=''){const call=state.call;clearCallTimers();cleanupCallMedia(call);state.call=null;renderVoiceCall();if(message)showToast(message);}
  async function loadCallIceServers(){if(state.callIceServers&&state.callIceExpiresAt-Date.now()>60000)return state.callIceServers;try{const data=await api('/api/chat/calls/ice');const servers=Array.isArray(data.iceServers)?data.iceServers:[];state.callIceServers=servers.length?servers:[{urls:['stun:stun.cloudflare.com:3478']}];state.callIceExpiresAt=new Date(data.expiresAt||Date.now()+10*60*1000).getTime();return state.callIceServers;}catch(_){return [{urls:['stun:stun.cloudflare.com:3478']}];}}
  function armCallConnectionTimeout(call){clearTimeout(state.callRingTimer);state.callRingTimer=setTimeout(()=>{if(state.call===call&&!call.connectedAt)finishVoiceCall('failed',{message:`Could not connect the ${call.media==='video'?'video':'voice'} call. Please try again.`});},30000);}
  async function ensureCallSocket(){if(state.socketConnected&&state.socket?.readyState===1)return true;await bootstrap(false,{connectRealtime:true});if(!state.socketConnected)await connectSocket();for(let i=0;i<40;i++){if(state.socketConnected&&state.socket?.readyState===1)return true;await new Promise(resolve=>setTimeout(resolve,100));}return false;}
  function acquireVoiceOnlyMedia(){return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});}
  function acquireVideoMedia(){return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:{width:{ideal:960,max:1280},height:{ideal:540,max:720},frameRate:{ideal:20,max:24},facingMode:'user'}});}
  async function acquireCallMedia(call){if(call.localStream)return call.localStream;if(call.mediaPromise)return call.mediaPromise;call.mediaPromise=(async()=>{const stream=await (call.media==='video'?acquireVideoMedia():acquireVoiceOnlyMedia());if(state.call!==call){for(const track of stream.getTracks())track.stop();throw new Error('Call changed.');}call.localStream=stream;if(call.media==='video'){ensureBackgroundBlur(call)?.bind(stream.getVideoTracks?.()[0]||null);if(els.callLocalVideo){syncCallMediaElement(els.callLocalVideo,stream);els.callLocalVideo.play?.().catch(()=>{});}}renderVoiceCall();return stream;})();try{return await call.mediaPromise;}finally{call.mediaPromise=null;}}
  async function flushCallCandidates(call){if(!call?.pc?.remoteDescription)return;const pending=(call.pendingCandidates||[]).splice(0);for(const candidate of pending){if(state.call!==call)return;try{await call.pc.addIceCandidate(candidate);}catch(_){}}}
  function nextCallControlId(call,type){state.callControlSeq=Number(state.callControlSeq||0)+1;return `${call.callId}_${String(type||'control').replace(/[^a-z0-9]+/gi,'_')}_${state.callControlSeq}`.slice(0,120);}
  function hasPendingCallControls(){if(!(state.callControlPending instanceof Map)||!state.callControlPending.size)return false;const now=Date.now();for(const [controlId,item] of [...state.callControlPending.entries()])if(!item||Number(item.expiresAt||0)<=now)state.callControlPending.delete(controlId);return state.callControlPending.size>0;}
  function flushPendingCallControls(){if(!hasPendingCallControls())return;const now=Date.now();for(const [controlId,item] of [...state.callControlPending.entries()]){if(!item||Number(item.expiresAt||0)<=now){state.callControlPending.delete(controlId);continue;}if(sendSocket(item.payload))state.callControlPending.delete(controlId);}}
  function cancelPendingCallControls(callId,keepType=''){if(!(state.callControlPending instanceof Map))return;for(const [controlId,item] of [...state.callControlPending.entries()]){if(String(item?.payload?.callId||'')!==String(callId||''))continue;if(keepType&&item?.payload?.type===keepType)continue;state.callControlPending.delete(controlId);}}
  function sendReliableCallControl(type,call,extra={}){if(!call)return false;if(!(state.callControlPending instanceof Map))state.callControlPending=new Map();const payload={type,callId:call.callId,conversationId:call.conversationId,media:call.media==='video'?'video':'audio',controlId:nextCallControlId(call,type),...extra};if(sendSocket(payload))return true;state.callControlPending.set(payload.controlId,{payload,expiresAt:Date.now()+10000});ensureCallSocket().then(flushPendingCallControls).catch(()=>{});return true;}
  function sendCallSignal(kind,signal){const call=state.call;if(!call)return false;return sendSocket({type:'call.signal',callId:call.callId,conversationId:call.conversationId,media:call.media==='video'?'video':'audio',signalKind:kind,signal});}
  async function applyCallSenderBudget(sender,track){if(!sender?.getParameters||!sender?.setParameters||!track)return;try{const params=sender.getParameters()||{};params.encodings=Array.isArray(params.encodings)&&params.encodings.length?params.encodings:[{}];if(track.kind==='video'){params.encodings[0].maxBitrate=900000;params.encodings[0].maxFramerate=24;}else if(track.kind==='audio')params.encodings[0].maxBitrate=48000;await sender.setParameters(params);}catch(_){}}
  function attachCallLocalTracksToPeer(call,pc=call?.pc){if(!call||!pc||!call.localStream)return;const senderTrackIds=new Set((pc.getSenders?.()||[]).map(sender=>sender?.track?.id).filter(Boolean));for(const track of call.localStream.getTracks?.()||[]){if(track?.id&&senderTrackIds.has(track.id))continue;const sender=pc.addTrack?.(track,call.localStream);if(sender){if(track?.id)senderTrackIds.add(track.id);applyCallSenderBudget(sender,track).catch(()=>{});}}}
  async function ensurePeerConnection(call){if(call.pc)return call.pc;const iceServers=await loadCallIceServers();if(state.call!==call)throw new Error('Call changed.');if(call.pc)return call.pc;const pc=new RTCPeerConnection({iceServers,iceCandidatePoolSize:1});call.pc=pc;ensureScreenShare(call);if(!call.remoteStream)call.remoteStream=new MediaStream();if(call.media==='video'){if(els.callRemoteVideo){els.callRemoteVideo.muted=true;els.callRemoteVideo.defaultMuted=true;syncCallMediaElement(els.callRemoteVideo,call.remoteStream);}if(els.callRemoteAudio)syncCallMediaElement(els.callRemoteAudio,call.remoteStream);}else if(els.callRemoteAudio)syncCallMediaElement(els.callRemoteAudio,call.remoteStream);pc.ontrack=event=>{if(state.call!==call)return;if(call.screenShare?.routeTrack(event))return;const incoming=[];if(event.track)incoming.push(event.track);else for(const stream of event.streams||[])for(const track of stream.getTracks?.()||[])incoming.push(track);for(const track of incoming){if(!call.remoteStream.getTracks().some(item=>item===track||item.id===track.id))call.remoteStream.addTrack(track);track.addEventListener?.('unmute',()=>{if(state.call===call)playRemoteCallMedia(call).catch(()=>{});},{once:true});}if(call.media==='video'&&els.callRemoteVideo){els.callRemoteVideo.muted=true;els.callRemoteVideo.defaultMuted=true;syncCallMediaElement(els.callRemoteVideo,call.remoteStream);}if(els.callRemoteAudio)syncCallMediaElement(els.callRemoteAudio,call.remoteStream);playRemoteCallMedia(call).catch(()=>setCallPlaybackRecovery(call,true));};pc.onicecandidate=event=>{if(!event.candidate||state.call!==call)return;sendCallSignal('ice',{candidate:event.candidate.candidate,sdpMid:event.candidate.sdpMid||'',sdpMLineIndex:event.candidate.sdpMLineIndex||0});};pc.onconnectionstatechange=()=>{if(state.call!==call)return;const status=pc.connectionState;if(status==='connected'){clearTimeout(state.callRingTimer);clearTimeout(state.callDisconnectTimer);state.callDisconnectTimer=0;if(!call.connectedAt)call.connectedAt=Date.now();call.status='connected';call.screenShare?.publish();clearInterval(state.callTimer);state.callTimer=setInterval(()=>renderVoiceCall(),1000);renderVoiceCall();playRemoteCallMedia(call).catch(()=>{});}else if(status==='disconnected'){clearTimeout(state.callDisconnectTimer);state.callDisconnectTimer=setTimeout(()=>{if(state.call===call&&call.pc?.connectionState==='disconnected')finishVoiceCall('failed',{notifyPeer:true,message:`${callMediaLabel(call)} call disconnected.`});},8000);}else if(status==='failed'){finishVoiceCall('failed',{notifyPeer:true,message:`${callMediaLabel(call)} call could not reconnect.`});}};return pc;}
  async function persistCallHistory(status,call=state.call){if(!call||call.direction!=='outgoing'||state.callEventSaved.has(call.callId))return;state.callEventSaved.add(call.callId);try{await api(`/api/chat/conversations/${encodeURIComponent(call.conversationId)}/messages`,{method:'POST',body:JSON.stringify({messageId:call.callId,callEvent:{callId:call.callId,media:call.media==='video'?'video':'audio',status,durationSeconds:call.connectedAt?Math.max(0,Math.floor(((call.endedAt||Date.now())-call.connectedAt)/1000)):0,startedAt:new Date(call.createdAt||Date.now()).toISOString()}})});socketRefresh(call.conversationId,call.callId);}catch(error){state.callEventSaved.delete(call.callId);console.warn('Call history event was not saved.',error?.message||error);}}
  async function finishVoiceCall(status='ended',options={}){const call=state.call;if(!call)return;cancelPendingCallControls(call.callId);if(options.notifyPeer!==false)sendReliableCallControl('call.end',call,{reason:status});call.endedAt=Date.now();const peer=call.peerName;resetVoiceCall(options.message||((status==='ended'&&call.connectedAt)?`${callMediaLabel(call)} call with ${peer} ended.`:''));if(call.direction==='outgoing')await persistCallHistory(status,call);}
  function sendCallInvite(call){if(state.call!==call||call.direction!=='outgoing'||call.status!=='calling')return false;call.inviteAttempts=Number(call.inviteAttempts||0)+1;return sendSocket({type:'call.invite',callId:call.callId,conversationId:call.conversationId,media:call.media==='video'?'video':'audio'});}
  function retryCallReachability(call){if(state.call!==call||call.direction!=='outgoing'||call.status!=='calling')return;const remaining=Number(call.reachabilityDeadline||0)-Date.now();if(remaining<=0){finishVoiceCall('unavailable',{notifyPeer:false,message:`${call.peerName} is not reachable for calls right now.`});return;}call.reachabilityWaiting=true;renderVoiceCall();clearTimeout(call.reachabilityTimer);call.reachabilityTimer=setTimeout(()=>{if(state.call!==call||call.status!=='calling')return;call.reachabilityWaiting=false;renderVoiceCall();if(!sendCallInvite(call))finishVoiceCall('unavailable',{notifyPeer:false,message:`${call.peerName} is not reachable for calls right now.`});},Math.min(CALL_REACHABILITY_RETRY_MS,remaining));}
  async function startCall(media='audio'){const conversation=state.activeConversation,peer=callPeer(conversation);if(!conversation||conversation.type!=='direct'||!peer)return;if(state.call){showToast('Finish the current call first.',true);return;}const video=media==='video';if(video?!videoCallSupported():!voiceCallSupported()){showToast(video?'Video calling is unavailable in this browser. Voice calling may still be available.':'Voice calling is not supported by this browser.',true);return;}const call={callId:newCallId(),conversationId:conversation.conversationId,peerUid:peer.uid,peerName:peer.name,peerPodLabel:callPodContext(peer.uid),media:video?'video':'audio',direction:'outgoing',status:'preparing',createdAt:Date.now(),connectedAt:0,muted:false,videoMuted:false,minimized:false,pc:null,localStream:null,remoteStream:null,mediaPromise:null,inviteAttempts:0,reachabilityWaiting:false,reachabilityTimer:0,reachabilityDeadline:0,playbackBlocked:false};state.call=call;renderVoiceCall();if(video)primeRemoteVideoPlayback(call);try{if(!(await ensureCallSocket()))throw new Error('Realtime calling is unavailable.');if(state.call!==call)return;await acquireCallMedia(call);if(state.call!==call)return;call.status='calling';call.reachabilityDeadline=Date.now()+CALL_REACHABILITY_GRACE_MS;renderVoiceCall();if(!sendCallInvite(call))throw new Error('Realtime calling is unavailable.');state.callRingTimer=setTimeout(()=>{if(state.call===call&&!call.connectedAt){sendReliableCallControl('call.end',call,{reason:'no-answer'});finishVoiceCall('missed',{notifyPeer:false,message:`No answer from ${call.peerName}.`});}},35000);}catch(error){if(state.call!==call)return;resetVoiceCall();if(video)showToast(error?.name==='NotAllowedError'?'Camera and microphone permission are required for video calls. Voice calling is still available.':(error?.name==='NotFoundError'?'A camera was not found. Voice calling is still available.':(error.message||'Video call could not start. Voice calling is still available.')),true);else showToast(error?.name==='NotAllowedError'?'Microphone permission is required for voice calls.':(error.message||'Voice call could not start.'),true);}}
  async function startVoiceCall(){return startCall('audio');}
  async function startVideoCall(){return startCall('video');}
  async function acceptVoiceCall(){const call=state.call;if(!call||call.status!=='incoming')return;call.status='connecting';armCallConnectionTimeout(call);renderVoiceCall();if(call.media==='video')primeRemoteVideoPlayback(call);const mediaReady=acquireCallMedia(call);sendReliableCallControl('call.accept',call);try{await mediaReady;if(state.call!==call)return;await ensurePeerConnection(call);}catch(error){if(state.call!==call)return;cancelPendingCallControls(call.callId);sendReliableCallControl('call.decline',call,{reason:call.media==='video'?'camera':'microphone'});resetVoiceCall();showToast(call.media==='video'?'Video could not start. Voice calling is still available.':(error?.name==='NotAllowedError'?'Microphone permission is required to answer.':'Voice call could not be answered.'),true);}}
  function declineVoiceCall(){const call=state.call;if(!call||call.status!=='incoming')return;cancelPendingCallControls(call.callId);sendReliableCallControl('call.decline',call,{reason:'declined'});resetVoiceCall();}
  function toggleVoiceMute(){const call=state.call;if(!call?.localStream)return;call.muted=!call.muted;for(const track of call.localStream.getAudioTracks())track.enabled=!call.muted;renderVoiceCall();}
  function toggleCallCamera(){const call=state.call;if(!call?.localStream||call.media!=='video')return;const tracks=call.localStream.getVideoTracks?.()||[];if(!tracks.length)return;call.videoMuted=!call.videoMuted;for(const track of tracks)track.enabled=!call.videoMuted;call.backgroundBlur?.setCameraEnabled?.(!call.videoMuted);renderVoiceCall();}
  async function handleCallSignal(payload){const call=state.call;if(!call||payload.callId!==call.callId||payload.conversationId!==call.conversationId||!['connecting','connected'].includes(call.status))return;try{const pc=await ensurePeerConnection(call);if(payload.signalKind==='screen'){ensureScreenShare(call)?.receive(payload.signal);return;}if(payload.signalKind==='offer'){await pc.setRemoteDescription({type:'offer',sdp:String(payload.signal?.sdp||'')});if(state.call!==call)return;await flushCallCandidates(call);if(call.direction==='incoming'&&!call.localStream)await acquireCallMedia(call);if(state.call!==call)return;attachCallLocalTracksToPeer(call,pc);ensureScreenShare(call)?.prepare(true);const answer=await pc.createAnswer();if(state.call!==call)return;await pc.setLocalDescription(answer);if(state.call!==call)return;if(!sendCallSignal('answer',{sdp:answer.sdp}))throw new Error('Signaling unavailable.');call.screenShare?.publish();}else if(payload.signalKind==='answer'){await pc.setRemoteDescription({type:'answer',sdp:String(payload.signal?.sdp||'')});await flushCallCandidates(call);call.screenShare?.publish();}else if(payload.signalKind==='ice'){const candidate=new RTCIceCandidate(payload.signal||{});if(pc.remoteDescription)await pc.addIceCandidate(candidate);else (call.pendingCandidates ||= []).push(candidate);}}catch(error){if(state.call!==call)return;finishVoiceCall('failed',{notifyPeer:true,message:`${callMediaLabel(call)} call connection failed.`});}}
  async function handleCallSocketEvent(payload){
    if(!payload?.type||payload.senderUid===state.actor?.uid)return false;const type=payload.type;
    if(type==='call.invite'){
      const media=payload.media==='video'?'video':'audio',supported=media==='video'?videoCallSupported():voiceCallSupported();if(!supported){sendSocket({type:'call.decline',callId:payload.callId,conversationId:payload.conversationId,media,reason:'unsupported'});return true;}
      if(state.call?.callId===payload.callId&&state.call.direction==='incoming'){sendSocket({type:'call.ringing',callId:payload.callId,conversationId:payload.conversationId,media});return true;}if(state.call){sendSocket({type:'call.busy',callId:payload.callId,conversationId:payload.conversationId,media,reason:'busy'});return true;}
      const conversation=state.conversations.find(item=>item.conversationId===payload.conversationId);const peerName=payload.senderName||conversation?.title||profileName(payload.senderUid,'Team member');const peerPodLabel=callPodContext(payload.senderUid,payload.senderPod,payload.senderPodLabel);state.call={callId:payload.callId,conversationId:payload.conversationId,peerUid:payload.senderUid,peerName,peerPodLabel,media,direction:'incoming',status:'incoming',createdAt:Date.now(),connectedAt:0,muted:false,videoMuted:false,minimized:false,pc:null,localStream:null,remoteStream:null,mediaPromise:null,playbackBlocked:false};renderVoiceCall();loadCallIceServers().catch(()=>{});sendSocket({type:'call.ringing',callId:payload.callId,conversationId:payload.conversationId,media});state.callRingTimer=setTimeout(()=>{if(state.call?.callId===payload.callId&&state.call.status==='incoming')resetVoiceCall();},40000);return true;
    }
    const call=state.call;if(!call||payload.callId!==call.callId||payload.conversationId!==call.conversationId)return /^call\./.test(type);if(type==='call.claimed'){if(call.direction==='incoming')resetVoiceCall();return true;}if(type==='call.ringing'&&call.direction==='outgoing'&&call.status==='calling'){clearTimeout(call.reachabilityTimer);call.reachabilityTimer=0;call.reachabilityWaiting=false;call.status='ringing';renderVoiceCall();return true;}
    if(type==='call.accept'&&call.direction==='outgoing'&&['calling','ringing'].includes(call.status)){clearTimeout(state.callRingTimer);call.status='connecting';armCallConnectionTimeout(call);renderVoiceCall();try{const pc=await ensurePeerConnection(call);attachCallLocalTracksToPeer(call,pc);ensureScreenShare(call)?.prepare(false);const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:call.media==='video'});if(state.call!==call)return true;await pc.setLocalDescription(offer);if(state.call!==call)return true;if(!sendCallSignal('offer',{sdp:offer.sdp}))throw new Error('Signaling unavailable.');}catch(_){if(state.call!==call)return true;finishVoiceCall('failed',{notifyPeer:true,message:`${callMediaLabel(call)} call connection failed.`});}return true;}
    if(type==='call.signal'){await handleCallSignal(payload);return true;}if(type==='call.decline'){const videoUnavailable=call.media==='video'&&['camera','microphone','unsupported','video-disabled'].includes(String(payload.reason||''));await finishVoiceCall(videoUnavailable?'failed':'declined',{notifyPeer:false,message:videoUnavailable?`${call.peerName} could not start video. Voice calling is still available.`:`${call.peerName} declined the call.`});return true;}if(type==='call.busy'){await finishVoiceCall('busy',{notifyPeer:false,message:`${call.peerName} is already on another call.`});return true;}if(type==='call.unavailable'){if(call.direction==='outgoing'&&call.status==='calling'&&Date.now()<Number(call.reachabilityDeadline||0)&&payload.reason!=='video-disabled'){retryCallReachability(call);return true;}if(['ringing','connecting','connected'].includes(call.status))return true;await finishVoiceCall('unavailable',{notifyPeer:false,message:payload.reason==='video-disabled'?'Video calling is temporarily unavailable. Voice calling is still available.':`${call.peerName} is not reachable for calls right now.`});return true;}if(type==='call.end'){await finishVoiceCall(call.connectedAt?'ended':'canceled',{notifyPeer:false,message:call.connectedAt?`${callMediaLabel(call)} call ended.`:`${callMediaLabel(call)} call canceled.`});return true;}return false;
  }
  function renderTyping(){if(!els.typing)return;const item=state.typingByConversation.get(state.activeConversationId);els.typing.textContent=item&&item.until>Date.now()?`${item.name} is typing…`:'';}
  function conversationSections(){const favorites=[],teams=[],direct=[],groups=[];for(const c of state.conversations)if(!c.archived){if(c.favorite===true){favorites.push(c);continue;}(c.type==='team'?teams:c.type==='direct'?direct:groups).push(c);}groups.sort((a,b)=>(b.type==='general')-(a.type==='general'));return{favorites,teams,direct,groups};}
  function profileName(uid, fallback='') {
    if(uid&&uid===state.actor?.uid)return state.actor.name||fallback;
    const person=state.people.find(item=>item.uid===uid);if(person?.name)return person.name;
    const receipt=state.readReceipts.find(item=>item.uid===uid);if(receipt?.readerName)return receipt.readerName;
    const message=[...state.messages,...state.threadReplies].find(item=>item.senderUid===uid&&item.senderName);if(message?.senderName)return message.senderName;
    return fallback;
  }
  function personRewardProjection(uid,name=''){
    let reward=null;if(uid&&uid===state.actor?.uid)reward=state.actor?._attendanceReward;
    if(!reward&&uid)reward=state.people.find(item=>item.uid===uid)?._attendanceReward;
    if(!reward){try{reward=window.TrinoTimeRewardSurfaces?.projection?.(profileName(uid,name)||name);}catch(_){}}
    const equipped=reward&&typeof reward.equipped==='object'?reward.equipped:{},momentum=['foundation','blaze','resonance','distinction'].includes(String(reward?.momentumLevel||''))?String(reward.momentumLevel):'foundation';
    return {equipped:{name:equipped.name==='blaze'?'blaze':'',border:equipped.border==='flame'?'flame':''},momentumLevel:momentum};
  }
  function personNameMarkup(uid,name,extraClass=''){
    const canonical=profileName(uid,name)||name||'Team member',reward=personRewardProjection(uid,canonical),classes=[extraClass,reward.equipped.name==='blaze'?'tt-blaze':''].filter(Boolean).join(' ');
    return `<span${classes?` class="${attr(classes)}"`:''}${reward.equipped.name==='blaze'?` data-momentum="${attr(reward.momentumLevel)}"`:''}>${escapeHtml(canonical)}</span>`;
  }
  function chatAvatarFrameVariant(extraClass=''){
    const cls=String(extraClass||'');
    if(cls.includes('tt-wm-read-avatar-inner'))return 'chat-read';
    if(cls.includes('tt-wm-reply-avatar'))return 'chat-reply';
    if(cls.includes('tt-wm-message-avatar'))return 'chat-message';
    if(cls.includes('tt-call-avatar'))return 'call';
    return 'chat';
  }
  function personAvatar(uid, name, extraClass='') {
    const canonical=profileName(uid,name),classes='tt-wm-avatar is-direct'+(extraClass?' '+extraClass:''),reward=personRewardProjection(uid,canonical);let base='';
    try{const bridge=window.TrinoTimeChatProfiles;if(bridge?.avatarMarkup)base=bridge.avatarMarkup(canonical,classes);}catch(_){}
    if(!base){const initials=(canonical||'?').split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();base=`<span class="${classes}" data-agent-avatar="${attr(canonical)}">${escapeHtml(initials)}</span>`;}
    const variant=chatAvatarFrameVariant(extraClass);
    if(reward.equipped.border==='flame'&&variant!=='call'&&!String(base).includes('tt-avatar-frame'))return `<span class="tt-avatar-frame tt-reward-surface-avatar tt-avatar-frame--${variant} tt-flame" data-chat-reward-avatar="${attr(canonical)}" data-avatar-frame="${variant}">${base}</span>`;
    return base;
  }
  function directPeerUid(c){if(c?.type!=='direct')return '';return (Array.isArray(c.memberIds)?c.memberIds:[]).map(String).find(uid=>uid!==state.actor?.uid)||'';}
  function conversationTitleMarkup(c){if(!c)return '';if(c.type!=='direct')return escapeHtml(c.title||'Conversation');const uid=directPeerUid(c);return personNameMarkup(uid,c.memberNames?.[uid]||c.title||'Team member','tt-wm-reward-name');}
  function chatProfileTargetMarkup(markup,uid,name,source='workspace-message'){
    const canonical=profileName(uid,name)||String(name||'').trim()||'Team member',raw=String(markup||'');
    const attrs=` data-chat-profile-uid="${attr(uid||'')}" data-chat-profile-name="${attr(canonical)}" data-chat-profile-source="${attr(source)}" role="button" tabindex="0" aria-label="${attr('View profile for '+canonical)}"`;
    return raw.replace(/^<([a-zA-Z][\w:-]*)\b/,`<$1${attrs}`);
  }
  function chatProfileAvatarMarkup(uid,name,extraClass='',source='workspace-message-avatar'){return chatProfileTargetMarkup(personAvatar(uid,name,extraClass),uid,name,source);}
  function chatProfileNameMarkup(uid,name,extraClass='',source='workspace-message-name'){return chatProfileTargetMarkup(personNameMarkup(uid,name,extraClass),uid,name,source);}
  async function openChatProfile(uid,name,source='workspace-message'){
    const canonical=profileName(uid,name)||String(name||'').trim();if(!canonical)return false;
    const directory=window.TrinoTimeProfileDirectory;
    if(!directory){try{showToast('Profile is still loading. Please try again in a moment.');}catch(_){}return false;}
    try{
      let scoped=typeof directory.canOpen==='function'&&directory.canOpen(canonical);
      if(!scoped&&typeof directory.ensureCanOpen==='function')scoped=await directory.ensureCanOpen(canonical);
      if(scoped&&typeof directory.open==='function'){directory.open(canonical);return true;}
    }catch(_){}
    const conversation=state.activeConversation;
    if(!uid||!['general','group'].includes(conversation?.type)||typeof directory.openCoworker!=='function'){
      try{showToast('That profile is outside your authorized Profile Directory scope.');}catch(_){}
      return false;
    }
    try{
      const query=new URLSearchParams({conversationId:String(conversation.conversationId||''),targetUid:String(uid)});
      const data=await api('/api/chat/coworker-profile?'+query.toString());
      if(!data?.profile)throw new Error('Coworker profile is unavailable.');
      directory.openCoworker(data.profile,{conversationId:conversation.conversationId||'',conversationType:conversation.type,conversationTitle:conversation.title||'Shared conversation',source});
      return true;
    }catch(error){try{showToast(error?.message||'That coworker profile is not available from this conversation.',true);}catch(_){}return false;}
  }
  function upsertReadReceipt(receipt){
    if(!receipt?.uid||receipt.uid===state.actor?.uid||!receipt.lastReadAt)return;
    const next={uid:String(receipt.uid),readerName:String(receipt.readerName||''),lastReadAt:receipt.lastReadAt};
    const index=state.readReceipts.findIndex(item=>item.uid===next.uid);if(index>=0)state.readReceipts[index]=next;else state.readReceipts.push(next);
  }
  function receiptName(receipt){return profileName(receipt?.uid,receipt?.readerName||'Team member')||receipt?.readerName||'Team member';}
  function receiptAssignments(messages){
    const rows=new Map();if(!Array.isArray(messages)||!messages.length)return rows;
    for(const receipt of state.readReceipts){
      const readMs=new Date(receipt.lastReadAt||0).getTime();if(!readMs)continue;let target=null;
      for(const message of messages){const created=new Date(message.createdAt||0).getTime();if(created&&created<=readMs&&message.senderUid!==receipt.uid)target=message;else if(created>readMs)break;}
      if(!target)continue;const list=rows.get(target.messageId)||[];list.push(receipt);rows.set(target.messageId,list);
    }
    return rows;
  }
  function renderReadReceipts(receipts){
    if(!receipts?.length)return '';const sorted=[...receipts].sort((a,b)=>receiptName(a).localeCompare(receiptName(b)));const shown=sorted.slice(0,5),extra=sorted.slice(5);const allNames=sorted.map(receiptName);
    const avatars=shown.map(r=>`<span class="tt-wm-read-avatar" tabindex="0" data-tooltip="${attr('Seen by '+receiptName(r))}" aria-label="${attr('Seen by '+receiptName(r))}">${personAvatar(r.uid,receiptName(r),'tt-wm-read-avatar-inner')}</span>`).join('');
    const more=extra.length?`<span class="tt-wm-read-more" tabindex="0" data-tooltip="${attr('Seen by '+allNames.join(', '))}" aria-label="${attr('Seen by '+allNames.join(', '))}">+${extra.length}</span>`:'';
    return `<div class="tt-wm-read-receipts" aria-label="${attr('Seen by '+allNames.join(', '))}">${avatars}${more}</div>`;
  }
  function conversationAvatar(c) {
    if(c.type!=='direct')return `<span class="tt-wm-avatar">${escapeHtml(convAvatar(c))}</span>`;
    const uid=(c.memberIds||[]).find(id=>id!==state.actor?.uid)||'';
    return personAvatar(uid,c.memberNames?.[uid]||c.title||'');
  }
  function convAvatar(c){if(c.type==='team')return (c.title||'P').split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase();return (c.title||'D').split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase();}
  function renderSidebar(){if(!els.convList)return;const {favorites,teams,direct,groups}=conversationSections();const section=(label,items,extra='')=>items.length?`<div class="tt-wm-section-label${extra?' '+extra:''}">${escapeHtml(label)}</div>${items.map(renderSidebarConversation).join('')}`:'';els.convList.innerHTML=(state.actor?.role==='admin'?'<button type="button" class="tt-wm-newdm" id="ttChatCreateGroup">＋ Create group</button>':'')+section('Favorites',favorites,'is-favorites')+section('Group chats',groups)+section('POD channels',teams)+section('Direct messages',direct)||'<div class="tt-wm-empty">Your conversations will appear here.</div>';els.convList.querySelectorAll('[data-conv]').forEach(btn=>btn.addEventListener('click',()=>openConversation(btn.dataset.conv)));
    els.convList.querySelectorAll('[data-dm-menu]').forEach(btn=>btn.addEventListener('click',()=>{state.dmMenuId=state.dmMenuId===btn.dataset.dmMenu?'':btn.dataset.dmMenu;renderSidebar();els.convList.querySelector(`[data-dm-menu="${CSS.escape(btn.dataset.dmMenu)}"]`)?.focus();}));
    els.convList.querySelectorAll('[data-dm-action]').forEach(btn=>btn.addEventListener('click',()=>changeDirectVisibility(btn.dataset.dmId,btn.dataset.dmAction)));
    $('ttChatCreateGroup')?.addEventListener('click',()=>openGroupEditor());
    if(els.peopleList)renderPeople();
  }
  function renderSidebarConversation(c){
    const row=renderConversationItem(c);if(c.type!=='direct')return row;
    const open=state.dmMenuId===c.conversationId,busy=state.dmBusy.has(c.conversationId);
    return `<div class="tt-wm-dm-row">${row}<button type="button" class="tt-wm-dm-options" data-dm-menu="${attr(c.conversationId)}" aria-label="Options for ${attr(c.title||'direct message')}" aria-expanded="${open}">⋯</button>${open?`<div class="tt-wm-dm-menu"><button type="button" data-dm-action="archive" data-dm-id="${attr(c.conversationId)}" ${busy?'disabled':''}>Archive</button><button type="button" class="is-danger" data-dm-action="delete" data-dm-id="${attr(c.conversationId)}" ${busy?'disabled':''}>Delete for me</button></div>`:''}</div>`;
  }
  function dismissDirect(id, erase=false){
    if(state.activeConversationId===id){
      if(!erase)saveDraft();stopTyping();closeThread();closeReport();
      state.viewEpoch++;state.loadSeq++;state.activeConversationId='';state.activeConversation=null;
      state.messages=[];state.loaded=false;state.nextCursor=null;state.latestIds.clear();state.historyContext=false;state.hasNewMessages=false;
      state.threadRoot=null;state.threadReplies=[];
      if(els.composer)els.composer.value='';if(els.threadComposer)els.threadComposer.value='';
      if(els.messages)els.messages.replaceChildren();if(els.threadRoot)els.threadRoot.textContent='';if(els.threadReplies)els.threadReplies.replaceChildren();
      if(els.emojiPop)els.emojiPop.hidden=true;
      els.shell?.classList.remove('has-conversation');renderWelcome();renderThreadHeader();updateHistoryControls();
    }
    state.searchGeneration++;closeSearch();if(els.searchResults)els.searchResults.textContent='';
    if(erase){
      state.historyGenerations.set(id,(state.historyGenerations.get(id)||0)+1);
      state.drafts.delete(id);state.readSent.delete(id);
      for(const map of [state.threadDrafts,state.replyAttempts])for(const key of map.keys())if(JSON.parse(key)[0]===id)map.delete(key);
      for(const map of [state.pending,state.failed])for(const [key,item] of map)if(item.conversationId===id)map.delete(key);
    }
  }
  function acceptInbox(list){
    const next=normalizeConversations(list);
    for(const c of next){const old=state.conversations.find(item=>item.conversationId===c.conversationId);
      if(old&&c.historyRevision!==old.historyRevision&&c.historyRevision)dismissDirect(c.conversationId,true);
      else if(c.archived&&c.conversationId===state.activeConversationId)dismissDirect(c.conversationId);
      else if(old&&c.visibilityRevision!==old.visibilityRevision)invalidateChatVisibility(c.conversationId);
    }
    state.conversations=next;
    // Inbox membership already authorizes reading and replying to these DMs.
    // Include inbound contacts immediately, without another directory request.
    for(const c of next){
      if(c.type!=='direct'||!c.memberIds?.includes(state.actor?.uid))continue;
      const uid=c.memberIds.find(id=>id!==state.actor.uid);
      if(uid&&!state.people.some(p=>p.uid===uid))state.people.push({uid,name:c.memberNames?.[uid]||c.title||'Workspace contact',role:'contact',messagingLabel:'Existing conversation'});
    }
    if(state.peopleOpen)renderPeople();
  }
  async function changeDirectVisibility(id,action){
    const c=state.conversations.find(item=>item.conversationId===id);if(c?.type!=='direct'||state.dmBusy.has(id))return;
    if(action==='delete'&&!window.confirm(`Delete your chat history with ${c.title||'this person'}?\n\nThis permanently removes existing messages and replies for you only. The other person keeps their history. New messages can still arrive. This cannot be undone.`))return;
    const epoch=state.epoch;state.dmBusy.add(id);renderSidebar();
    try{
      const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/visibility`,{method:'POST',body:JSON.stringify({action,confirmDelete:action==='delete'})});
      if(epoch!==state.epoch)return;
      dismissDirect(id,action==='delete');Object.assign(c,data.conversation||{},data.preference||{});state.dmMenuId='';state.inboxSeq++;
      renderSidebar();await refreshInbox();showToast(action==='delete'?'Chat history deleted for you.':'Archived. Search for this person to reopen the conversation.');
    }catch(error){if(epoch===state.epoch)showToast(error.message,true);}
    finally{if(epoch===state.epoch){state.dmBusy.delete(id);renderSidebar();}}
  }
  function renderConversationItem(c){const active=c.conversationId===state.activeConversationId;const pref=c.notificationMode==='muted'?'🔕':c.notificationMode==='mentions'?'@':'';const favorite=c.favorite===true?'<span class="tt-wm-favorite-mark" title="Favorite" aria-label="Favorite">★</span>':'';const unreadCount=Math.max(0,Number(c.unreadCount||0)||0),unreadLabel=unreadCount>99?'99+':String(unreadCount||1);const unreadBadges=c.unread?`${c.mentionUnread?'<span class="tt-wm-mention-unread" title="Unread mention" aria-label="Unread mention">@</span>':''}<span class="tt-wm-unread" title="Unread messages">${escapeHtml(unreadLabel)}</span>`:'';return `<button class="tt-wm-conv${active?' is-active':''}" type="button" data-conv="${attr(c.conversationId)}">${conversationAvatar(c)}<span class="tt-wm-conv-main"><span class="tt-wm-conv-title">${favorite}${conversationTitleMarkup(c)} ${pref?`<span class="tt-wm-pref-mark">${escapeHtml(pref)}</span>`:''}</span><span class="tt-wm-conv-preview">${escapeHtml(c.lastMessageText|| (c.type==='team'?'POD conversation':'Start a conversation'))}</span></span><span class="tt-wm-conv-meta"><span class="tt-wm-conv-time">${escapeHtml(c.lastMessageAt?shortDateTime(c.lastMessageAt):'')}</span><span class="tt-wm-unread-stack">${unreadBadges}</span></span></button>`;}
  async function openConversation(id, options={}){
    if(!id)return;
    if(state.conversationSearchOpen&&state.conversationSearchConversationId&&state.conversationSearchConversationId!==id)closeConversationSearch();
    saveDraft();stopTyping();closeThread();closeReport();closeSearch();
    state.viewEpoch++;const generation=state.viewEpoch;
    state.activeConversationId=id;state.activeConversation=state.conversations.find(c=>c.conversationId===id)||null;
    state.dmMenuId='';
    if(state.activeConversation?.archived){
      try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/visibility`,{method:'POST',body:JSON.stringify({action:'restore'})});
        if(!viewIsCurrent(id,generation))return;Object.assign(state.activeConversation,data.conversation||{},data.preference||{});
      }catch(error){if(viewIsCurrent(id,generation)){dismissDirect(id);showToast(error.message,true);}return;}
    }
    state.messages=[];state.loaded=false;state.loadError='';state.nextCursor=null;state.loadingOlder=false;state.historyContext=false;state.hasNewMessages=false;state.peerLastReadAt=null;state.readReceipts=[];
    state.latestAnchorConversationId=id;state.latestAnchorReleased=false;state.latestAnchorEpoch++;
    if(els.composer){els.composer.value=state.drafts.get(id)||'';autoGrow();}closeMentionMenu();renderPendingShare();closeComposerMenus();
    if(els.notifyMenu)els.notifyMenu.hidden=true;
    if(els.shell)els.shell.classList.add('has-conversation');setWelcomeVisible(false);renderTyping();renderThreadHeader();renderSidebar();renderMessages(false);updateHistoryControls();
    const loaded=await loadMessages(id,!options.messageId,{replace:true,around:options.messageId||''});
    if(!loaded||!viewIsCurrent(id,generation))return;
    if(options.messageId){highlightMessage(options.messageId);if(options.replyId){await openThread(options.messageId,options.replyId);}}
    else if(!options.skipRead)await markRead();
    if(!options.messageId&&viewIsCurrent(id,generation))requestAnimationFrame(()=>{if(viewIsCurrent(id,generation)&&chatIsVisible())els.composer?.focus({preventScroll:true});});
  }
  function canManagePin(){return state.activeConversation?.type==='team'&&['admin','team_leader'].includes(state.actor?.role);}
  function renderPinnedMessage(){
    const c=state.activeConversation,bar=els.pinned;if(!bar)return;
    const messageId=String(c?.pinnedMessageId||'');if(!c||!messageId){bar.hidden=true;if(els.pinnedText)els.pinnedText.textContent='';return;}
    bar.hidden=false;if(els.pinnedText)els.pinnedText.textContent=c.pinnedMessageText||'Pinned message';
    if(els.pinnedMeta)els.pinnedMeta.textContent=[c.pinnedSenderName?`From ${c.pinnedSenderName}`:'',c.pinnedByName?`Pinned by ${c.pinnedByName}`:''].filter(Boolean).join(' · ');
    if(els.pinnedUnpin)els.pinnedUnpin.hidden=!canManagePin();
  }
  async function pinMessage(messageId,action='pin'){
    const id=state.activeConversationId,epoch=state.epoch,generation=state.viewEpoch;if(!id||!canManagePin()||!messageId)return;
    try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/pin`,{method:'POST',body:JSON.stringify({action,messageId})});if(epoch!==state.epoch)return;
      const local=state.conversations.find(c=>c.conversationId===id);if(local&&data.conversation)Object.assign(local,data.conversation);
      if(viewIsCurrent(id,generation)&&data.conversation){state.activeConversation={...(state.activeConversation||{}),...data.conversation};renderPinnedMessage();renderSidebar();showToast(action==='unpin'?'Pinned message removed.':'Message pinned for this POD.');}
    }catch(error){if(viewIsCurrent(id,generation))showToast(error.message,true);}
  }
  async function toggleConversationFavorite(){
    const c=state.activeConversation;if(!c||!c.conversationId||state.favoriteBusy)return;
    const id=c.conversationId,next=c.favorite!==true,generation=state.viewEpoch;state.favoriteBusy=true;
    const listed=state.conversations.find(item=>item.conversationId===id);if(listed)listed.favorite=next;c.favorite=next;renderThreadHeader();renderSidebar();
    try{
      const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/favorite`,{method:'POST',body:JSON.stringify({favorite:next})});
      if(!viewIsCurrent(id,generation))return;const saved=data?.preference?.favorite===true;if(listed)listed.favorite=saved;if(state.activeConversation?.conversationId===id)state.activeConversation.favorite=saved;renderThreadHeader();renderSidebar();showToast(saved?'Added to Favorites.':'Removed from Favorites.');
    }catch(error){if(listed)listed.favorite=!next;if(state.activeConversation?.conversationId===id)state.activeConversation.favorite=!next;if(viewIsCurrent(id,generation)){renderThreadHeader();renderSidebar();showToast(error.message,true);}}
    finally{state.favoriteBusy=false;}
  }
  function conversationSearchTextMarkup(text,query){const source=String(text||'');const q=String(query||'').trim();if(!q)return escapeHtml(source);const lower=source.toLocaleLowerCase(),needle=q.toLocaleLowerCase(),index=lower.indexOf(needle);if(index<0)return escapeHtml(source);return `${escapeHtml(source.slice(0,index))}<mark>${escapeHtml(source.slice(index,index+q.length))}</mark>${escapeHtml(source.slice(index+q.length))}`;}
  function resetConversationSearchResults(){state.conversationSearchHits=[];state.conversationSearchIndex=-1;state.conversationSearchNextOffset=null;}
  function closeNotifyMenu(){if(els.notifyMenu)els.notifyMenu.hidden=true;if(els.notifyBtn)els.notifyBtn.setAttribute('aria-expanded','false');}
  function closeConversationSearch(){state.conversationSearchSeq++;state.conversationSearchOpen=false;state.conversationSearchConversationId='';state.conversationSearchBusy=false;resetConversationSearchResults();if(els.conversationSearchPanel)els.conversationSearchPanel.hidden=true;if(els.conversationSearchBtn){els.conversationSearchBtn.classList.remove('is-active');els.conversationSearchBtn.setAttribute('aria-expanded','false');}}
  function openConversationSearch(){const c=state.activeConversation;if(!c||!els.conversationSearchPanel)return;closeThread();closeNotifyMenu();state.conversationSearchOpen=true;state.conversationSearchConversationId=c.conversationId;state.conversationSearchQuery='';resetConversationSearchResults();els.conversationSearchPanel.hidden=false;if(els.conversationSearchBtn){els.conversationSearchBtn.classList.add('is-active');els.conversationSearchBtn.setAttribute('aria-expanded','true');}if(els.conversationSearchInput){els.conversationSearchInput.value='';requestAnimationFrame(()=>els.conversationSearchInput?.focus());}renderConversationSearch();}
  function toggleConversationSearch(){if(state.conversationSearchOpen)closeConversationSearch();else openConversationSearch();}
  function renderConversationSearch(){
    if(!els.conversationSearchPanel)return;const query=state.conversationSearchQuery||'',hits=state.conversationSearchHits;
    if(els.conversationSearchTitle)els.conversationSearchTitle.textContent=state.activeConversation?.title?`Search ${state.activeConversation.title}`:'Search conversation';
    if(els.conversationSearchStatus){if(state.conversationSearchBusy)els.conversationSearchStatus.textContent='Searching…';else if(!query)els.conversationSearchStatus.textContent='Search message text and replies in this conversation.';else els.conversationSearchStatus.textContent=hits.length?`${hits.length}${state.conversationSearchNextOffset!==null?'+':''} result${hits.length===1?'':'s'} for “${query}”`:`No messages found for “${query}”.`;}
    if(els.conversationSearchPrev){els.conversationSearchPrev.disabled=!hits.length||state.conversationSearchIndex<=0;els.conversationSearchPrev.hidden=!hits.length;}
    if(els.conversationSearchNext){els.conversationSearchNext.disabled=!hits.length||state.conversationSearchIndex<0||(state.conversationSearchIndex>=hits.length-1&&state.conversationSearchNextOffset===null)||state.conversationSearchBusy;els.conversationSearchNext.hidden=!hits.length;}
    if(!els.conversationSearchResults)return;if(!query){els.conversationSearchResults.innerHTML='<div class="tt-wm-conversation-search-empty">Type a word or phrase, then press Enter.</div>';return;}if(state.conversationSearchBusy&&!hits.length){els.conversationSearchResults.innerHTML='<div class="tt-wm-conversation-search-empty">Searching this conversation…</div>';return;}if(!hits.length){els.conversationSearchResults.innerHTML='<div class="tt-wm-conversation-search-empty">No matching messages in this conversation.</div>';return;}
    els.conversationSearchResults.innerHTML=hits.map((hit,index)=>{const record=hit.message||hit.reply||{},selected=index===state.conversationSearchIndex;const sender=profileName(record.senderUid,record.senderName||'Team member')||record.senderName||'Team member',kind=hit.kind==='reply'?'Reply':'Message';return `<button type="button" class="tt-wm-conversation-search-hit${selected?' is-current':''}" data-conversation-search-index="${index}"><span class="tt-wm-conversation-search-meta"><strong>${escapeHtml(sender)}</strong><small>${escapeHtml(kind)} · ${escapeHtml(shortDateTime(record.createdAt))}</small></span><span class="tt-wm-conversation-search-preview">${conversationSearchTextMarkup(record.text||chatMessagePreviewClient(record),query)}</span></button>`;}).join('');
    els.conversationSearchResults.querySelectorAll('[data-conversation-search-index]').forEach(button=>button.addEventListener('click',()=>jumpConversationSearchResult(Number(button.dataset.conversationSearchIndex)||0)));
  }
  function chatMessagePreviewClient(record){if(record?.poll?.question)return `Poll: ${record.poll.question}`;if(record?.workforceCard?.title)return record.workforceCard.title;if(record?.gif?.title)return `GIF: ${record.gif.title}`;if(record?.callEvent)return 'Call event';if(record?.attachments?.length)return record.attachments[0]?.name||'Attachment';return 'Message';}
  async function runConversationSearch(){
    const c=state.activeConversation,q=String(els.conversationSearchInput?.value||'').trim();if(!c||!state.conversationSearchOpen)return;if(q.length<2){state.conversationSearchQuery=q;resetConversationSearchResults();renderConversationSearch();return;}
    const sequence=++state.conversationSearchSeq,conversationId=c.conversationId;state.conversationSearchConversationId=conversationId;state.conversationSearchQuery=q;state.conversationSearchBusy=true;resetConversationSearchResults();renderConversationSearch();
    try{const data=await api(`/api/chat/search?conversationId=${encodeURIComponent(conversationId)}&q=${encodeURIComponent(q)}`);if(sequence!==state.conversationSearchSeq||!state.conversationSearchOpen||state.activeConversationId!==conversationId)return;state.conversationSearchHits=Array.isArray(data?.hits)?data.hits:[];state.conversationSearchNextOffset=data?.nextOffset??null;state.conversationSearchIndex=state.conversationSearchHits.length?0:-1;}
    catch(error){if(sequence===state.conversationSearchSeq&&state.conversationSearchOpen){resetConversationSearchResults();showToast(error.message,true);}}
    finally{if(sequence===state.conversationSearchSeq){state.conversationSearchBusy=false;renderConversationSearch();}}
  }
  async function jumpConversationSearchResult(index){const hits=state.conversationSearchHits;if(!hits.length)return;const next=Math.min(hits.length-1,Math.max(0,index));const hit=hits[next],conversationId=state.conversationSearchConversationId||state.activeConversationId;if(!hit||!conversationId)return;state.conversationSearchIndex=next;renderConversationSearch();await openConversation(conversationId,{messageId:hit.rootMessageId||hit.message?.messageId||'',replyId:hit.kind==='reply'?(hit.reply?.replyId||''):''});}
  async function loadMoreConversationSearch(){
    const c=state.activeConversation,q=state.conversationSearchQuery,offset=state.conversationSearchNextOffset;if(!c||!q||offset===null||state.conversationSearchBusy)return false;
    const sequence=++state.conversationSearchSeq,conversationId=c.conversationId;state.conversationSearchBusy=true;renderConversationSearch();
    try{const data=await api(`/api/chat/search?conversationId=${encodeURIComponent(conversationId)}&q=${encodeURIComponent(q)}&offset=${encodeURIComponent(offset)}`);if(sequence!==state.conversationSearchSeq||!state.conversationSearchOpen||state.activeConversationId!==conversationId)return false;const more=Array.isArray(data?.hits)?data.hits:[];state.conversationSearchHits=[...state.conversationSearchHits,...more];state.conversationSearchNextOffset=data?.nextOffset??null;return more.length>0;}
    catch(error){if(sequence===state.conversationSearchSeq&&state.conversationSearchOpen)showToast(error.message,true);return false;}
    finally{if(sequence===state.conversationSearchSeq){state.conversationSearchBusy=false;renderConversationSearch();}}
  }
  async function moveConversationSearch(delta){if(!state.conversationSearchHits.length)return;const current=state.conversationSearchIndex<0?0:state.conversationSearchIndex;if(delta>0&&current>=state.conversationSearchHits.length-1&&state.conversationSearchNextOffset!==null){const oldLength=state.conversationSearchHits.length;if(await loadMoreConversationSearch()&&state.conversationSearchHits.length>oldLength)await jumpConversationSearchResult(oldLength);return;}const next=Math.min(state.conversationSearchHits.length-1,Math.max(0,current+delta));await jumpConversationSearchResult(next);}
  function notifyLabel(mode){return mode==='muted'?'🔕 Muted':mode==='mentions'?'@ Mentions':'🔔 All';}
  function renderThreadHeader(){
    const c=state.activeConversation;
    $('ttChatManageGroup')?.remove();
    if(c?.type==='group'&&state.actor?.role==='admin'&&els.threadActions){const button=document.createElement('button');button.id='ttChatManageGroup';button.type='button';button.className='tt-wm-icon-btn';button.textContent='Manage group';button.addEventListener('click',()=>openGroupEditor(c));els.threadActions.prepend(button);}
    if(!c){els.threadTitle.textContent='Workspace Messaging';els.threadSub.textContent='Select a conversation';if(els.threadActions)els.threadActions.hidden=true;if(els.voiceCallBtn)els.voiceCallBtn.hidden=true;if(els.videoCallBtn)els.videoCallBtn.hidden=true;if(els.favoriteBtn)els.favoriteBtn.hidden=true;if(els.conversationSearchBtn)els.conversationSearchBtn.hidden=true;closeConversationSearch();renderPinnedMessage();return;}
    if(c.type==='direct'){const uid=directPeerUid(c);els.threadTitle.innerHTML=chatProfileNameMarkup(uid,c.memberNames?.[uid]||c.title||'Team member','tt-wm-reward-name','workspace-direct-header');}else els.threadTitle.textContent=c.title||'Conversation';
    els.threadSub.textContent=c.type==='general'?'All Team Leaders and Agents':c.type==='group'?`${c.memberIds?.length||0} members · Custom group`:c.type==='team'?`${c.title||'POD'} · Shared team channel`:'Private direct message';
    if(els.threadActions)els.threadActions.hidden=false;
    if(els.favoriteBtn){els.favoriteBtn.hidden=false;els.favoriteBtn.disabled=state.favoriteBusy===true;els.favoriteBtn.classList.toggle('is-active',c.favorite===true);els.favoriteBtn.textContent=c.favorite===true?'★':'☆';els.favoriteBtn.setAttribute('aria-pressed',c.favorite===true?'true':'false');els.favoriteBtn.title=c.favorite===true?'Remove from Favorites':'Add to Favorites';els.favoriteBtn.setAttribute('aria-label',els.favoriteBtn.title);}
    if(els.conversationSearchBtn){els.conversationSearchBtn.hidden=false;const active=state.conversationSearchOpen&&state.conversationSearchConversationId===c.conversationId;els.conversationSearchBtn.classList.toggle('is-active',active);els.conversationSearchBtn.setAttribute('aria-expanded',active?'true':'false');}
    if(els.notifyBtn)els.notifyBtn.textContent=notifyLabel(c.notificationMode||'all');
    els.notifyMenu?.querySelectorAll('[data-notify-mode]').forEach(btn=>{const active=btn.dataset.notifyMode===(c.notificationMode||'all');btn.classList.toggle('is-active',active);btn.setAttribute('aria-checked',active?'true':'false');});
    renderPinnedMessage();
    if(els.voiceCallBtn){const available=c.type==='direct'&&state.capabilities.voiceCalls!==false&&voiceCallSupported();els.voiceCallBtn.hidden=!available;els.voiceCallBtn.disabled=Boolean(state.call);els.voiceCallBtn.title=state.call?'A call is already in progress':'Start voice call';}
    if(els.videoCallBtn){const available=c.type==='direct'&&state.capabilities.videoCalls!==false&&videoCallSupported();els.videoCallBtn.hidden=!available;els.videoCallBtn.disabled=Boolean(state.call);els.videoCallBtn.title=state.call?'A call is already in progress':'Start video call';}
  }

  async function loadMessages(id,scroll=true,options={}){
    if(!id||id!==state.activeConversationId)return false;
    const generation=state.viewEpoch,sequence=++state.loadSeq;
    try{
      const params=new URLSearchParams({limit:'100'});if(options.around)params.set('around',options.around);
      const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages?${params}`);
      if(!viewIsCurrent(id,generation)||sequence!==state.loadSeq)return false;
      const follow=scroll||atMessageBottom(), previousIds=new Set(state.messages.map(m=>m.messageId));
      const listed=state.conversations.find(c=>c.conversationId===id)||{};
      state.activeConversation={...data.conversation,notificationMode:listed.notificationMode||state.activeConversation?.notificationMode||'all',favorite:listed.favorite===true};
      if(options.replace||!state.loaded){state.messages=mergeMessages([],data.messages||[]);state.nextCursor=data.nextCursor||null;state.historyContext=!!options.around;}
      else state.messages=mergeMessages(state.messages,data.messages||[]);
      state.latestIds=new Set((data.messages||[]).map(m=>m.messageId));
      state.loadError='';state.loaded=true;state.peerLastReadAt=data.peerLastReadAt||null;state.readReceipts=(Array.isArray(data.readReceipts)?data.readReceipts:[]).filter(r=>r?.uid&&r.uid!==state.actor?.uid&&r.lastReadAt);
      if(!follow&&(data.messages||[]).some(m=>!previousIds.has(m.messageId)))state.hasNewMessages=true;
      if(follow&&!state.historyContext)state.hasNewMessages=false;
      renderMessages(follow);renderThreadHeader();updateHistoryControls();
      return true;
    }catch(error){if(viewIsCurrent(id,generation)&&sequence===state.loadSeq){showToast(error.message,true);if(!state.loaded){state.loadError=error.message;renderMessages(false);}updateHistoryControls();}return false;}
  }
  function latestOwnMessageId(){for(let i=state.messages.length-1;i>=0;i--){if(state.messages[i].senderUid===state.actor?.uid)return state.messages[i].messageId;}return '';}
  function renderedMessages(){const base=state.messages.slice();for(const p of state.pending.values())if(p.conversationId===state.activeConversationId&&!base.some(m=>m.messageId===p.messageId))base.push({...p,_pending:true});for(const f of state.failed.values())if(f.conversationId===state.activeConversationId&&!base.some(m=>m.messageId===f.messageId)&&!base.some(m=>m.messageId===f.messageId))base.push({...f,_failed:true});return visibleMessages(base).sort(compareMessageOrder);}
  function renderMessages(scroll=true){
    renderMealOutbox();if(!els.messages)return;
    const anchor=scroll?null:captureMessageAnchor();
    const list=renderedMessages(),entries=[];let lastDay='';
    const latestMine=latestOwnMessageId(),peerReadMs=new Date(state.peerLastReadAt||0).getTime(),receiptMap=receiptAssignments(list.filter(m=>!m._pending&&!m._failed));
    for(const m of list){const day=messageDay(m.createdAt);if(day!==lastDay){lastDay=day;entries.push({key:'day:'+m.messageId,html:`<div class="tt-wm-day">${escapeHtml(day)}</div>`});}entries.push({key:'message:'+m.messageId,html:renderMessage(m,m.messageId===latestMine,peerReadMs,receiptMap.get(m.messageId)||[])});}
    if(!entries.length)entries.push({key:'empty',html:`<div class="tt-wm-empty">${state.loaded?'No messages yet. Start the conversation.':state.loadError?escapeHtml(state.loadError)+' <button type="button" data-load-retry="true">Retry</button>':'Loading conversation…'}</div>`});
    patchMessageNodes(els.messages,entries);bindMessageActions();hydrateAttachmentImages();decorateMentions(els.messages);
    if(scroll)pinMessagesToLatest(true);else restoreMessageAnchor(anchor);
  }
  const messageMarkup=new WeakMap();
  function patchMessageNodes(host,entries){
    const existing=new Map(Array.from(host.children).map(node=>[node.dataset.chatNodeKey,node]));
    const wanted=new Set(entries.map(entry=>entry.key));
    for(const [key,node] of existing)if(!wanted.has(key))node.remove();
    let previous=null;
    for(const entry of entries){let node=existing.get(entry.key);
      if(!node||messageMarkup.get(node)!==entry.html){const template=document.createElement('template');template.innerHTML=entry.html;const next=template.content.firstElementChild;next.dataset.chatNodeKey=entry.key;messageMarkup.set(next,entry.html);if(node?.parentNode===host)node.replaceWith(next);node=next;}
      const cursor=previous?previous.nextElementSibling:host.firstElementChild;if(cursor!==node)host.insertBefore(node,cursor);previous=node;
    }
  }
  function formatBytes(value){const n=Number(value||0);if(!Number.isFinite(n)||n<=0)return '';if(n<1024)return `${n} B`;if(n<1048576)return `${Math.round(n/102.4)/10} KB`;return `${Math.round(n/104857.6)/10} MB`;}
  function attachmentKey(conversationId,attachmentId){return `${conversationId||''}|${attachmentId||''}`;}
  async function attachmentBlobUrl(conversationId,attachmentId){
    const key=attachmentKey(conversationId,attachmentId),epoch=state.epoch,attachmentGeneration=state.attachmentGeneration;const current=()=>epoch===state.epoch&&attachmentGeneration===state.attachmentGeneration;if(state.attachmentUrls.has(key))return state.attachmentUrls.get(key);if(state.attachmentPromises.has(key))return state.attachmentPromises.get(key);
    const promise=(async()=>{let response=await fetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}`,{headers:{'x-tt-chat-session':state.sessionToken},cache:'no-store'});if(response.status===401){if(!current())throw new Error('Attachment session changed.');await bootstrap(true);if(!current())throw new Error('Attachment session changed.');response=await fetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}`,{headers:{'x-tt-chat-session':state.sessionToken},cache:'no-store'});}if(!response.ok)throw new Error('Attachment unavailable.');const blob=await response.blob();if(!current())throw new Error('Attachment is no longer available in this view.');const url=URL.createObjectURL(blob);state.attachmentUrls.set(key,url);return url;})().finally(()=>{if(state.attachmentPromises.get(key)===promise)state.attachmentPromises.delete(key);});state.attachmentPromises.set(key,promise);return promise;
  }
  function renderAttachments(m){const items=Array.isArray(m.attachments)?m.attachments:[];if(!items.length)return '';const conv=m.conversationId||state.activeConversationId;return `<div class="tt-wm-attachments">${items.map(item=>{const image=String(item.mime||'').startsWith('image/');return image?`<button type="button" class="tt-wm-attachment-image-btn" data-attachment-open="${attr(item.attachmentId)}" data-attachment-conv="${attr(conv)}" aria-label="Open ${attr(item.name||'image')}"><img class="tt-wm-attachment-image" data-attachment-img="${attr(item.attachmentId)}" data-attachment-conv="${attr(conv)}" alt="${attr(item.name||'Shared image')}" loading="lazy"></button>`:`<button type="button" class="tt-wm-attachment" data-attachment-open="${attr(item.attachmentId)}" data-attachment-conv="${attr(conv)}"><span class="tt-wm-attachment-icon">📎</span><span><strong>${escapeHtml(item.name||'Attachment')}</strong><small>${escapeHtml(formatBytes(item.size))}${item.mime?' · '+escapeHtml(item.mime):''}</small></span></button>`;}).join('')}</div>`;}
  async function hydrateAttachmentImages(){for(const img of els.messages?.querySelectorAll('[data-attachment-img]')||[]){if(img.src)continue;try{img.src=await attachmentBlobUrl(img.dataset.attachmentConv||state.activeConversationId,img.dataset.attachmentImg);}catch(_){img.alt='Attachment unavailable';}}}
  async function openAttachment(conversationId,attachmentId){try{const url=await attachmentBlobUrl(conversationId,attachmentId);window.open(url,'_blank','noopener');}catch(error){showToast(error.message||'Attachment unavailable.',true);}}
  function renderWorkforceCard(m){const card=m.workforceCard;if(!card)return '';return `<div class="tt-wm-workforce-card"><small>SHARED WORKFORCE ITEM · SNAPSHOT</small><strong>${escapeHtml(card.title||'Workforce item')}</strong>${card.subtitle?`<span>${escapeHtml(card.subtitle)}</span>`:''}${card.status?`<b>${escapeHtml(card.status)}</b>`:''}</div>`;}
  function renderPoll(m){const poll=m.poll;if(!poll||!Array.isArray(poll.options))return '';const total=poll.options.reduce((sum,o)=>sum+Number(o.count||0),0);return `<div class="tt-wm-poll-card" data-poll-message="${attr(m.messageId)}"><strong>📊 ${escapeHtml(poll.question||'Poll')}</strong>${poll.options.map(o=>{const count=Number(o.count||0),pct=total?Math.round(count*100/total):0;return `<button type="button" class="tt-wm-poll-choice${o.mine?' is-mine':''}" data-poll-option="${attr(o.optionId)}" data-poll-message="${attr(m.messageId)}"><span class="tt-wm-poll-choice-fill" style="width:${Math.max(0,Math.min(100,pct))}%"></span><span class="tt-wm-poll-choice-content"><span>${escapeHtml(o.label||'Option')}</span><span>${count}${total?' · '+pct+'%':''}</span></span></button>`;}).join('')}<div class="tt-wm-poll-foot"><span>${total} ${total===1?'vote':'votes'}</span><span>${poll.mine?'Tap your choice to change/remove vote':'Tap to vote'}</span></div></div>`;}
  function renderGif(m){const gif=m?.gif;if(!gif?.url)return '';const alt=gif.alt||gif.title||'GIF';return `<a class="tt-wm-gif-message" href="${attr(gif.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open GIF: ${attr(alt)}"><img src="${attr(gif.url)}" alt="${attr(alt)}" loading="lazy" decoding="async"><span>GIPHY</span></a>`;}
  function formatCallDuration(seconds){const total=Math.max(0,Math.trunc(Number(seconds)||0)),m=Math.floor(total/60),s=String(total%60).padStart(2,'0');return `${m}:${s}`;}
  function renderCallEvent(m){const call=m?.callEvent;if(!call)return '';const mine=m.senderUid===state.actor?.uid,video=call.media==='video',kind=video?'Video call':'Voice call',icon=video?'▣':'☎';let title=kind,detail='';if(call.status==='ended'){title=kind;detail=call.durationSeconds?formatCallDuration(call.durationSeconds):'Ended';}else if(call.status==='missed'){title=mine?'No answer':`Missed ${kind.toLowerCase()}`;detail=kind;}else if(call.status==='declined'){title=mine?`${kind} declined`:`You declined a ${kind.toLowerCase()}`;detail=kind;}else if(call.status==='busy'){title='Line busy';detail=kind;}else if(call.status==='unavailable'){title='Unavailable';detail=kind;}else if(call.status==='canceled'){title=`Canceled ${kind.toLowerCase()}`;detail=kind;}else{title=`${kind} could not connect`;detail=video?'Voice calling may still be available.':'Try again later';}return `<div class="tt-wm-call-event is-${attr(call.status||'failed')}"><span class="tt-wm-call-event-icon">${icon}</span><span class="tt-wm-call-event-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span></div>`;}
  function richMessageContent(m){if(m.unsentAt)return chatActions()?.tombstone(m)||'<div class="tt-wm-bubble">Message unsent</div>';const parts=[];if(m.mealBreak){parts.push(chatActions()?.mealCard(m,shortTime)||'');parts.push(mealReceiptStatus(m));}if(m.callEvent)parts.push(renderCallEvent(m));if(m.bioBreak&&!m.deletedAt)parts.push(window.TrinoTimeBioBreaks?.message(m)||`<div class="tt-wm-bubble"><strong>${escapeHtml(m.text)}</strong></div>`);else if(m.text)parts.push(`<div class="tt-wm-bubble">${chatText(m.text)}</div>`);if(m.gif)parts.push(renderGif(m));if(m.poll)parts.push(renderPoll(m));if(m.workforceCard)parts.push(renderWorkforceCard(m));if(Array.isArray(m.attachments)&&m.attachments.length)parts.push(renderAttachments(m));return parts.length?`<div class="tt-wm-rich-stack">${parts.join('')}</div>`:'<div class="tt-wm-bubble">Message</div>';}
  function reactionTooltip(emoji,info){const uids=Array.isArray(info?.uids)?info.uids:[];const names=uids.map(uid=>uid===state.actor?.uid?'You':profileName(uid,'Team member'));if(!names.length)return `${Number(info?.count||0)} reacted ${emoji}`;if(names.length<=6)return `${names.join(', ')} reacted ${emoji}`;return `${names.slice(0,6).join(', ')} and ${names.length-6} others reacted ${emoji}`;}
  function renderMessage(m,isLatestMine,peerReadMs,receipts=[]){const mine=m.senderUid===state.actor?.uid;const seen=mine&&isLatestMine&&peerReadMs&&new Date(m.createdAt||0).getTime()<=peerReadMs;const reactions=m.reactions&&typeof m.reactions==='object'?m.reactions:{};const reactionHtml=Object.entries(reactions).map(([emoji,info])=>{const tip=reactionTooltip(emoji,info);return `<button type="button" class="tt-wm-reaction-chip${info?.mine?' is-mine':''}" data-reaction="${attr(emoji)}" data-msg="${attr(m.messageId)}" data-tooltip="${attr(tip)}" aria-label="${attr(tip)}">${escapeHtml(emoji)} ${Number(info?.count||0)}</button>`;}).join('');const actions=(m.callEvent||m.unsentAt||m._pending||m._failed)?'':QUICK_REACTIONS.map(e=>`<button type="button" class="tt-wm-react-btn" data-react="${attr(e)}" data-msg="${attr(m.messageId)}" title="React ${attr(e)}">${escapeHtml(e)}</button>`).join('')+`<button type="button" class="tt-wm-reply-btn" data-reply="${attr(m.messageId)}" title="Reply">↩</button>`+(!mine?`<button type="button" class="tt-wm-report-btn" data-report="${attr(m.messageId)}" title="Report message" aria-label="Report message">⚑</button>`:'');const failedText=escapeHtml(m._failureText||(m._mealUnconfirmed?'Attendance not confirmed — check Attendance before retrying this same message.':'Not sent'));const failedAction=m._failureRetryable===false?'<button class="tt-wm-retry" data-dismiss-failed="'+attr(m.messageId)+'">Dismiss</button>':'<button class="tt-wm-retry" data-retry="'+attr(m.messageId)+'">Retry</button>';const status=m._pending?(exactMealCommand(m.text)?'Confirming attendance...':'Sending…'):m._failed?'<span class="tt-wm-failed">'+failedText+'</span> '+failedAction:seen?'<span class="tt-wm-seen">Seen</span>':'Sent';return `<div class="tt-wm-msg-row${mine?' is-mine':''}${m._pending?' is-pending':''}${m._failed?' is-failed':''}" data-message-row="${attr(m.messageId)}">${chatProfileAvatarMarkup(m.senderUid,m.senderName,'tt-wm-message-avatar','workspace-message-avatar')}<div class="tt-wm-msg-block">${!mine&&state.activeConversation?.type!=='direct'?`<div class="tt-wm-sender">${chatProfileNameMarkup(m.senderUid,m.senderName,'tt-wm-reward-name','workspace-message-name')}</div>`:''}<div class="tt-wm-hover-actions">${actions}</div><div class="tt-wm-message-content${editingRecord(m.messageId)?'':' tt-wm-message-context-surface'}"${editingRecord(m.messageId)?'':' data-message-context-surface'}>${editingRecord(m.messageId)?editComposerMarkup(m.messageId,'',m.text):richMessageContent(m)}${editingRecord(m.messageId)?'':(chatActions()?.menu(m,state.actor?.uid)||'')}</div>${reactionHtml?`<div class="tt-wm-reactions">${reactionHtml}</div>`:''}${Number(m.replyCount||0)>0?`<button class="tt-wm-thread-count" data-reply="${attr(m.messageId)}">${Number(m.replyCount)} ${Number(m.replyCount)===1?'reply':'replies'} · View thread</button>`:''}<div class="tt-wm-msg-meta"><span>${escapeHtml(shortTime(m.createdAt))}</span>${m.editedAt?'<span class="tt-wm-edited">edited</span>':''}<span>${status}</span></div>${renderReadReceipts(receipts)}</div></div>`;}
  function bindMessageActions(){
    if(!els.messages||els.messages.dataset.actionsBound)return;
    els.messages.dataset.actionsBound='true';
    els.messages.addEventListener('click',event=>{const btn=event.target.closest('button');if(!btn||!els.messages.contains(btn))return;
      if(handleExtraMessageAction(btn))return;
      if(btn.dataset.loadRetry)openConversation(state.activeConversationId);
      else if(btn.dataset.attachmentOpen)openAttachment(btn.dataset.attachmentConv||state.activeConversationId,btn.dataset.attachmentOpen);
      else if(btn.dataset.pollOption)votePoll(btn.dataset.pollMessage,btn.dataset.pollOption);
      else if(btn.dataset.react)toggleReaction(btn.dataset.msg,btn.dataset.react);
      else if(btn.dataset.reaction)toggleReaction(btn.dataset.msg,btn.dataset.reaction);
      else if(btn.dataset.reply)openThread(btn.dataset.reply);
      else if(btn.dataset.report)openReport(btn.dataset.report);
      else if(btn.dataset.retry)retryMessage(btn.dataset.retry);
      else if(btn.dataset.dismissFailed)dismissFailedMessage(btn.dataset.dismissFailed);
    });
  }
  function bindMessageEditControls(){
    for(const container of [els.messages,els.threadRoot,els.threadReplies]){
      if(!container||container.dataset.editControlsBound)continue;container.dataset.editControlsBound='true';
      container.addEventListener('click',event=>{const wrap=event.target.closest?.('.tt-wm-inline-edit');if(!wrap||!container.contains(wrap))return;const rootId=wrap.dataset.editRoot||'',replyId=wrap.dataset.editReply||'',input=wrap.querySelector('.tt-wm-edit-input');if(event.target.closest('[data-edit-cancel]')){event.preventDefault();cancelMessageEdit();}else if(event.target.closest('[data-edit-save]')){event.preventDefault();saveMessageEdit(rootId,replyId,input?.value||'');}});
      container.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.shiftKey||event.isComposing)return;const input=event.target.closest?.('.tt-wm-edit-input');if(!input||!container.contains(input))return;event.preventDefault();const wrap=input.closest('.tt-wm-inline-edit');saveMessageEdit(wrap?.dataset.editRoot||'',wrap?.dataset.editReply||'',input.value);});
    }
  }
  async function votePoll(messageId,optionId){const id=state.activeConversationId,generation=state.viewEpoch;if(!id||!messageId||!optionId)return;try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/poll/vote`,{method:'POST',body:JSON.stringify({optionId})});if(!viewIsCurrent(id,generation))return;state.messages=mergeMessages(state.messages,[data.message]);renderMessages(false);}catch(error){if(viewIsCurrent(id,generation))showToast(error.message,true);}}
  async function toggleReaction(messageId,emoji){
    const id=state.activeConversationId,generation=state.viewEpoch;if(!id)return;
    try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/reactions`,{method:'POST',body:JSON.stringify({messageId,emoji})});
      if(!viewIsCurrent(id,generation))return;state.messages=mergeMessages(state.messages,[data.message]);renderMessages(false);
    }catch(error){if(viewIsCurrent(id,generation))showToast(error.message,true);}
  }
  async function uploadQueuedAttachments(conversationId, items){
    const uploaded=[];
    try{
      for(const item of items){
        const form=new FormData();form.append('file',item.file,item.name||item.file.name||'attachment');
        const data=await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments`,{method:'POST',body:form});
        if(!data?.attachment?.attachmentId)throw new Error('The attachment upload did not complete.');
        uploaded.push({...data.attachment,conversationId});
      }
      return uploaded;
    }catch(error){
      for(const item of uploaded){try{await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(item.attachmentId)}?pending=1`,{method:'DELETE'});}catch(_){} }
      throw error;
    }
  }
  async function sendMessage(existing=null, extras={}){
    const id=existing?.conversationId||state.activeConversationId,generation=state.viewEpoch,epoch=state.epoch,historyGeneration=state.historyGenerations.get(id)||0;
    if(!id||(!existing&&!state.loaded))return false;
    const localFiles=existing?[]:state.pendingLocalFiles.filter(a=>a.conversationId===id);
    const existingAttachmentIds=existing?.attachmentIds||extras.attachmentIds||state.pendingAttachments.filter(a=>a.conversationId===id).map(a=>a.attachmentId);
    const workforceCard=existing?.workforceCard||extras.workforceCard||state.pendingWorkforce||null;
    const poll=existing?.poll||extras.poll||null;
    const gif=existing?.gif||extras.gif||state.pendingGif||null;
    const text=String(poll?'':(existing?.text??els.composer.value??'')).trim();
    const instruction=!existing?parsePodInstructionCommand(text):null;
    if(instruction){
      if(existingAttachmentIds.length||localFiles.length||workforceCard||poll||gif){showToast('Send /instruction without attachments or polls.',true);return false;}
      return await sendPodInstructionCommand(instruction,id);
    }
    const meal=exactMealCommand(text);
    if(meal&&(existingAttachmentIds.length||localFiles.length||workforceCard||poll||gif)){showToast('Send MB or BFMB as an exact text-only message, without attachments.',true);return false;}
    if(!text&&!existingAttachmentIds.length&&!localFiles.length&&!workforceCard&&!poll&&!gif)return false;
    if(poll&&(existingAttachmentIds.length||localFiles.length||workforceCard||gif)){showToast('Send attachments, GIFs, or workforce items separately from a poll.',true);return false;}
    if(gif&&(existingAttachmentIds.length||localFiles.length||workforceCard)){showToast('Send a GIF with an optional text caption only.',true);return false;}
    let uploadedLocal=[];
    if(localFiles.length){
      if(state.attachmentUploadBusy){showToast('Your image is still preparing to send.');return false;}
      state.attachmentUploadBusy=true;if(els.send)els.send.disabled=true;
      try{uploadedLocal=await uploadQueuedAttachments(id,localFiles);}
      catch(error){showToast(error.message||'Could not upload the attachment.',true);return false;}
      finally{state.attachmentUploadBusy=false;updateHistoryControls();}
      if(epoch!==state.epoch){for(const item of uploadedLocal){try{await api(`/api/chat/conversations/${encodeURIComponent(id)}/attachments/${encodeURIComponent(item.attachmentId)}?pending=1`,{method:'DELETE'});}catch(_){} }return false;}
    }
    const attachmentIds=[...existingAttachmentIds,...uploadedLocal.map(a=>a.attachmentId)];
    const messageId=existing?.messageId||`msg_${crypto.randomUUID().replace(/-/g,'')}`;
    const visibilityGeneration=state.visibilityGenerations.get(id)||0;
    const commandRequestedAt=meal?(existing?.commandRequestedAt||Date.now()):undefined;
    if(state.pending.has(messageId))return false;
    const pendingAttachmentObjects=existing?.attachments||[...state.pendingAttachments.filter(a=>a.conversationId===id),...uploadedLocal];
    const optimisticPoll=poll?{question:String(poll.question||''),options:(Array.isArray(poll.options)?poll.options:[]).map((item,index)=>({optionId:String(item?.optionId||`pending_${index}`),label:String(typeof item==='string'?item:item?.label||''),count:Number(item?.count||0),mine:Boolean(item?.mine)})),mine:false}:null;
    const optimistic={messageId,senderUid:state.actor?.uid,senderName:state.actor?.name||'You',text,attachments:pendingAttachmentObjects,workforceCard,poll:optimisticPoll,gif,createdAt:existing?.createdAt||new Date().toISOString(),conversationId:id,reactions:{},replyCount:0,attachmentIds};
    if(meal)optimistic.commandRequestedAt=commandRequestedAt;
    let mealLock=null;try {mealLock=beginMealAttempt(text);if(meal)rememberMealAttempt(optimistic);}catch(error){mealLock?.release();showToast(error.message,true);return false;}
    state.failed.delete(messageId);state.pending.set(messageId,optimistic);
    if(!existing){
      state.drafts.set(id,'');
      if(id===state.activeConversationId&&els.composer){els.composer.value='';closeMentionMenu();autoGrow();stopTyping();}
      state.pendingAttachments=state.pendingAttachments.filter(a=>a.conversationId!==id);
      const removedLocal=state.pendingLocalFiles.filter(a=>a.conversationId===id);state.pendingLocalFiles=state.pendingLocalFiles.filter(a=>a.conversationId!==id);for(const item of removedLocal)revokeLocalPreview(item);
      state.pendingWorkforce=null;state.pendingGif=null;renderPendingShare();
    }
    if(viewIsCurrent(id,generation))renderMessages(true);
    try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages`,{method:'POST',body:JSON.stringify({messageId,text,attachmentIds,workforceCard,poll,gif,commandRequestedAt})});
      if(epoch!==state.epoch||historyGeneration!==(state.historyGenerations.get(id)||0))return false;state.pending.delete(messageId);state.failed.delete(messageId);if(meal){requireMealAcknowledgement(data);await reflectMealResult(data,mealLock);if(epoch!==state.epoch)return false;finishMealReceipt(messageId,data);}
      if(epoch!==state.epoch)return false;
      if(visibilityGeneration!==(state.visibilityGenerations.get(id)||0)){await refreshInbox();if(id===state.activeConversationId)await loadMessages(id,false,{replace:true});return true;}
      if(id===state.activeConversationId){if(!state.loaded)await loadMessages(id,true,{replace:true});else{state.loadSeq++;state.messages=mergeMessages(state.messages,[data.message]);renderMessages(atMessageBottom()&&!state.historyContext);}}
      await refreshInbox();if(gif?.analytics?.onsent)fireGiphyAnalytics(gif.analytics.onsent);return true;
    }catch(error){if(epoch!==state.epoch||historyGeneration!==(state.historyGenerations.get(id)||0))return false;state.pending.delete(messageId);const failure=meal?mealFailurePresentation(error):null;if(meal&&failure&&!failure.retryable)forgetMealAttempt(messageId);state.failed.set(messageId,{...optimistic,_failed:true,_mealUnconfirmed:Boolean(meal&&failure?.uncertain),_failureText:failure?.text||'',_failureRetryable:failure?failure.retryable:true,_failureCode:String(error?.code||'')});if(id===state.activeConversationId){renderMessages(false);showToast(failure?.text||error.message,true);}return false;}
    finally{mealLock?.release();renderMealOutbox();}
  }
  function retryMessage(messageId){const item=state.failed.get(messageId);if(item&&item._failureRetryable!==false)sendMessage(item);}
  function dismissFailedMessage(messageId){if(!state.failed.has(messageId))return;state.failed.delete(messageId);forgetMealAttempt(messageId);renderMessages(false);}
  async function markRead(){
    if(!state.loaded||!chatIsVisible()||!atMessageBottom()||state.historyContext)return;
    const conversationId=state.activeConversationId,epoch=state.epoch;
    let latest=state.messages[state.messages.length-1],replyId='';
    let messageId=latest?.messageId||'';
    if(state.threadLoaded&&!state.threadContext&&state.threadRoot&&!els.threadPanel.hidden&&els.threadReplies.scrollHeight-els.threadReplies.scrollTop-els.threadReplies.clientHeight<70){
      const reply=state.threadReplies[state.threadReplies.length-1];
      if(reply&&String(reply.createdAt)>String(latest?.createdAt||'')){latest=reply;messageId=state.threadRoot.messageId;replyId=reply.replyId;}
    }
    if(!latest||!messageId)return;
    const receiptKey=JSON.stringify([messageId,replyId]);
    if(state.readSent.get(conversationId)===receiptKey)return;
    state.readSent.set(conversationId,receiptKey);
    try{
      if(state.socketConnected){if(!sendSocket({type:'chat.read',conversationId,messageId,replyId}))throw new Error('Read receipt is waiting for reconnect.');}
      else await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/read`,{method:'POST',body:JSON.stringify({messageId,replyId})});
      if(epoch!==state.epoch)return;
      const local=state.conversations.find(c=>c.conversationId===conversationId);
      if(local&&String(local.lastMessageAt||'')<=String(latest.createdAt||'')){local.unread=false;local.unreadCount=0;local.mentionUnread=false;local.mentionCount=0;local.notificationUnread=false;state.unreadTotal=state.conversations.reduce((sum,c)=>sum+Number(c.unreadCount||0),0);renderSidebar();showLaunchBadge();}
    }catch(_){if(epoch===state.epoch&&state.readSent.get(conversationId)===receiptKey)state.readSent.delete(conversationId);}
  }
  function autoGrow(){if(!els.composer)return;els.composer.style.height='auto';els.composer.style.height=Math.min(120,els.composer.scrollHeight)+'px';}
  function typingInput(){saveDraft();autoGrow();if(!state.activeConversationId||!state.socketConnected)return;if(!state.typingSent){state.typingSent=true;sendSocket({type:'chat.typing',conversationId:state.activeConversationId,active:true});}clearTimeout(state.typingTimer);state.typingTimer=setTimeout(stopTyping,1100);}
  function stopTyping(){clearTimeout(state.typingTimer);if(state.typingSent&&state.activeConversationId)sendSocket({type:'chat.typing',conversationId:state.activeConversationId,active:false});state.typingSent=false;}
  function mentionCandidatesForConversation(conversation=state.activeConversation){
    if(!['team','general','group'].includes(conversation?.type))return [];
    const teamId=String(conversation.teamId||'');
    const rows=Array.isArray(state.mentionPeople)?state.mentionPeople:[];
    return rows.filter(person=>person?.uid&&person.uid!==state.actor?.uid&&(conversation.type==='general'||person.role==='admin'||(conversation.type==='group'?conversation.memberIds?.includes(person.uid):String(person.teamId||'')===teamId))).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  }
  function mentionTrigger(input){
    if(!input||input.selectionStart!==input.selectionEnd)return null;
    const caret=Number(input.selectionStart||0),before=String(input.value||'').slice(0,caret),at=before.lastIndexOf('@');
    if(at<0)return null;const previous=at>0?before.charAt(at-1):'';if(previous&&!/[\s([{]/.test(previous))return null;
    const raw=before.slice(at+1);if(raw.length>80||/[\r\n]/.test(raw)||/[,:;!?]/.test(raw))return null;
    return {start:at,end:caret,query:normalizeSearch(raw)};
  }
  function mentionPopForInput(input){return input===els.threadComposer?els.threadMentionPop:els.mentionPop;}
  function closeMentionMenu(){const menu=state.mentionMenu;state.mentionMenu=null;for(const pop of [els.mentionPop,els.threadMentionPop]){if(pop){pop.hidden=true;pop.innerHTML='';}}if(menu?.input){menu.input.removeAttribute('aria-activedescendant');menu.input.setAttribute('aria-expanded','false');}}
  function mentionCandidateScore(person,query){if(!query)return 1;const name=normalizeSearch(person?.name||''),tokens=name.split(/\s+/).filter(Boolean);if(name===query)return 100;if(name.startsWith(query))return 90;if(tokens.some(token=>token.startsWith(query)))return 75;if(name.includes(query))return 60;return 0;}
  function mentionInitials(name){return String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0)).join('').toUpperCase()||'@';}
  function renderMentionMenu(input){
    const pop=mentionPopForInput(input),trigger=mentionTrigger(input);if(state.mentionMenu?.input&&state.mentionMenu.input!==input)closeMentionMenu();if(!pop||!trigger||!['team','general','group'].includes(state.activeConversation?.type)){closeMentionMenu();return;}
    const candidates=mentionCandidatesForConversation().map(person=>({person,score:mentionCandidateScore(person,trigger.query)})).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||String(a.person.name||'').localeCompare(String(b.person.name||''))).slice(0,8).map(row=>row.person);
    if(!candidates.length){closeMentionMenu();return;}
    const previous=state.mentionMenu?.input===input?Number(state.mentionMenu.index||0):0,index=Math.min(previous,candidates.length-1);state.mentionMenu={input,pop,trigger,candidates,index};
    pop.innerHTML=candidates.map((person,i)=>`<button type="button" role="option" id="ttChatMentionOption${i}" class="tt-wm-mention-option${i===index?' is-active':''}" data-mention-index="${i}" aria-selected="${i===index?'true':'false'}"><span class="tt-wm-mention-avatar">${escapeHtml(mentionInitials(person.name||'@'))}</span><span><strong>@${escapeHtml(person.name||'Team member')}</strong><small>${escapeHtml(displayRole(person.role))}${(person.podLabel||person.pod)?' · '+escapeHtml(person.podLabel||person.pod):''}</small></span></button>`).join('');
    pop.hidden=false;input.setAttribute('aria-expanded','true');input.setAttribute('aria-controls',pop.id);input.setAttribute('aria-activedescendant',`ttChatMentionOption${index}`);
  }
  function setMentionMenuIndex(index){const menu=state.mentionMenu;if(!menu?.candidates?.length)return;menu.index=(index+menu.candidates.length)%menu.candidates.length;menu.pop.querySelectorAll('[data-mention-index]').forEach((button,i)=>{const active=i===menu.index;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',active?'true':'false');if(active){menu.input.setAttribute('aria-activedescendant',button.id);button.scrollIntoView?.({block:'nearest'});}});}
  function insertMention(index=state.mentionMenu?.index||0){
    const menu=state.mentionMenu,person=menu?.candidates?.[index];if(!menu||!person)return false;const input=menu.input,trigger=mentionTrigger(input)||menu.trigger;if(!trigger)return false;
    const value=String(input.value||''),replacement=`@${String(person.name||'').trim()} `;input.value=value.slice(0,trigger.start)+replacement+value.slice(trigger.end);const caret=trigger.start+replacement.length;input.selectionStart=input.selectionEnd=caret;
    if(input===els.composer){saveDraft();autoGrow();}else saveThreadDraft();closeMentionMenu();input.focus({preventScroll:true});return true;
  }
  function handleMentionKeydown(event,input){
    const menu=state.mentionMenu;if(!menu||menu.input!==input||menu.pop.hidden)return false;
    if(event.key==='ArrowDown'){event.preventDefault();setMentionMenuIndex(menu.index+1);return true;}
    if(event.key==='ArrowUp'){event.preventDefault();setMentionMenuIndex(menu.index-1);return true;}
    if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();insertMention();return true;}
    if(event.key==='Escape'){event.preventDefault();closeMentionMenu();return true;}return false;
  }
  function bindMentionPop(pop){if(!pop||pop.dataset.bound)return;pop.dataset.bound='true';pop.addEventListener('pointerdown',event=>{const option=event.target.closest?.('[data-mention-index]');if(option){event.preventDefault();insertMention(Number(option.dataset.mentionIndex)||0);}});}
  function regexEscape(value){return String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  function mentionLabels(){const labels=[];for(const person of mentionCandidatesForConversation()){const full=String(person.name||'').trim();if(!full)continue;labels.push(full);const first=full.split(/\s+/)[0];if(first&&first!==full)labels.push(first);}return [...new Set(labels)].sort((a,b)=>b.length-a.length);}
  function decorateMentions(host){
    if(!host||!['team','general','group'].includes(state.activeConversation?.type))return;const labels=mentionLabels();if(!labels.length)return;const pattern=new RegExp('@(?:'+labels.map(regexEscape).join('|')+')(?=$|[\\s.,!?;:)}\\]])','gi');
    const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT,{acceptNode(node){const parent=node.parentElement;if(!parent||parent.closest('a,button,.tt-wm-mention,[data-chat-edit-field]'))return NodeFilter.FILTER_REJECT;return node.nodeValue?.includes('@')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}}),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){const text=node.nodeValue||'';pattern.lastIndex=0;if(!pattern.test(text))continue;pattern.lastIndex=0;const fragment=document.createDocumentFragment();let cursor=0,match;while((match=pattern.exec(text))){fragment.append(document.createTextNode(text.slice(cursor,match.index)));const mark=document.createElement('span');mark.className='tt-wm-mention';mark.textContent=match[0];fragment.append(mark);cursor=match.index+match[0].length;}fragment.append(document.createTextNode(text.slice(cursor)));node.replaceWith(fragment);}
  }
  async function openGroupEditor(conversation=null){
    if(state.actor?.role!=='admin')return;
    const epoch=state.epoch,returnFocus=document.activeElement,isManaging=Boolean(conversation),existingIds=new Set((conversation?.memberIds||[]).map(String));
    $('ttChatGroupDialog')?.close();$('ttChatGroupDialog')?.remove();
    const dialog=document.createElement('dialog');dialog.id='ttChatGroupDialog';dialog.className='tt-wm-group-dialog';
    dialog.setAttribute('aria-labelledby','ttChatGroupHeading');dialog.setAttribute('aria-describedby','ttChatGroupDescription');
    dialog.innerHTML=`<form class="tt-wm-group-form">
      <header class="tt-wm-group-head">
        <div class="tt-wm-group-head-copy"><span class="tt-wm-group-eyebrow">Workspace group</span><h2 id="ttChatGroupHeading">${isManaging?'Manage group':'Create group'}</h2><p id="ttChatGroupDescription">${isManaging?'Rename this conversation or add more Agents and Team Leaders.':'Create a private workspace conversation for selected Agents and Team Leaders.'}</p></div>
        <button type="button" class="tt-wm-group-close" data-cancel aria-label="Close group editor">×</button>
      </header>
      <div class="tt-wm-group-body">
        <label class="tt-wm-group-field"><span>Group name</span><input name="title" maxlength="80" required autocomplete="off" placeholder="e.g. Quality Team"></label>
        <section class="tt-wm-group-picker" aria-labelledby="ttChatGroupMembersHeading">
          <div class="tt-wm-group-picker-head"><div><span class="tt-wm-group-field-label" id="ttChatGroupMembersHeading">Add members</span><small>${isManaging?'Current members stay in the group. Choose anyone else to add.':'Choose who can view and send messages in this group.'}</small></div><span class="tt-wm-group-count" aria-live="polite">${existingIds.size} ${existingIds.size===1?'member':'members'}</span></div>
          <label class="tt-wm-group-search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input name="search" type="search" placeholder="Search by name or POD" autocomplete="off" aria-label="Search group members"></label>
          <div class="tt-wm-group-filters" role="group" aria-label="Filter members"><button type="button" class="is-active" data-group-filter="all" aria-pressed="true">All</button><button type="button" data-group-filter="agent" aria-pressed="false">Agents</button><button type="button" data-group-filter="team_leader" aria-pressed="false">Team Leaders</button></div>
          <div class="tt-wm-group-members" role="list" aria-busy="true"><div class="tt-wm-group-loading"><span></span><span></span><span></span><em>Loading team members…</em></div></div>
          <div class="tt-wm-group-empty-filter" hidden>No team members match this search.</div>
          <p class="tt-wm-group-help">Admins automatically have management access and can participate in every custom group.${isManaging?' Existing members are preserved when you save changes.':''}</p>
        </section>
        <p role="status" aria-live="polite" class="tt-wm-group-status"></p>
      </div>
      <footer class="tt-wm-group-actions"><button type="button" class="tt-wm-group-secondary" data-cancel>Cancel</button><button type="submit" class="tt-wm-group-primary" disabled>${isManaging?'Save changes':'Create group'}</button></footer>
    </form>`;
    document.body.append(dialog);dialog.showModal();
    const form=dialog.querySelector('form'),title=form.elements.title,search=form.elements.search,list=dialog.querySelector('.tt-wm-group-members'),status=dialog.querySelector('[role="status"]'),save=dialog.querySelector('[type="submit"]'),count=dialog.querySelector('.tt-wm-group-count'),emptyFilter=dialog.querySelector('.tt-wm-group-empty-filter');
    title.value=conversation?.title||'';
    const id=conversation?.conversationId||'group_'+crypto.randomUUID();let membersReady=false,activeFilter='all';
    const closeDialog=()=>dialog.open&&dialog.close();dialog.querySelectorAll('[data-cancel]').forEach(button=>button.addEventListener('click',closeDialog));
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
    dialog.addEventListener('close',()=>{dialog.remove();returnFocus?.isConnected&&returnFocus.focus?.();},{once:true});
    const selectedIds=()=>[...list.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')].map(input=>input.value);
    const syncSelection=()=>{
      const added=selectedIds().length,total=existingIds.size+added;
      count.textContent=`${total} ${total===1?'member':'members'}`;
      for(const row of list.querySelectorAll('.tt-wm-group-member'))row.classList.toggle('is-selected',Boolean(row.querySelector('input:checked')));
      save.disabled=!membersReady||!title.value.trim()||(!isManaging&&total<1);
    };
    const applyFilter=()=>{
      const q=normalizeSearch(search.value),rows=[...list.querySelectorAll('.tt-wm-group-member')];let visible=0;
      for(const row of rows){const roleOk=activeFilter==='all'||row.dataset.role===activeFilter,searchOk=!q||normalizeSearch(row.dataset.search||row.textContent).includes(q),show=roleOk&&searchOk;row.hidden=!show;if(show)visible++;}
      emptyFilter.hidden=visible>0||rows.length===0;
    };
    search.addEventListener('input',applyFilter);
    title.addEventListener('input',syncSelection);
    dialog.querySelectorAll('[data-group-filter]').forEach(button=>button.addEventListener('click',()=>{activeFilter=button.dataset.groupFilter||'all';dialog.querySelectorAll('[data-group-filter]').forEach(item=>{const active=item===button;item.classList.toggle('is-active',active);item.setAttribute('aria-pressed',active?'true':'false');});applyFilter();}));
    try{
      const data=await api('/api/chat/groups');if(epoch!==state.epoch||!dialog.isConnected)return;
      list.replaceChildren();list.setAttribute('aria-busy','false');
      for(const member of data.members||[]){
        const uid=String(member.uid||''),already=existingIds.has(uid),row=document.createElement('label');row.className='tt-wm-group-member';row.dataset.role=String(member.role||'');row.dataset.search=[member.name,displayRole(member.role),member.pod].filter(Boolean).join(' ');row.setAttribute('role','listitem');
        const input=document.createElement('input');input.type='checkbox';input.value=uid;input.checked=already;input.disabled=already;input.setAttribute('aria-label',already?`${member.name} is already a member`:`Add ${member.name}`);
        const avatar=document.createElement('span');avatar.className='tt-wm-group-member-avatar';avatar.innerHTML=personAvatar(uid,member.name,'tt-wm-group-avatar');
        const copy=document.createElement('span');copy.className='tt-wm-group-member-copy';copy.innerHTML=`<strong>${escapeHtml(member.name||'Team member')}</strong><small><span>${escapeHtml(displayRole(member.role))}</span>${member.pod?' · '+escapeHtml(member.pod):''}${already?' · <b>Member</b>':''}</small>`;
        const check=document.createElement('span');check.className='tt-wm-group-check';check.setAttribute('aria-hidden','true');check.innerHTML='<svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.2 3.2 7.8-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        row.append(avatar,copy,input,check);input.addEventListener('change',syncSelection);list.append(row);
      }
      if(!list.children.length){list.innerHTML='<div class="tt-wm-group-none">No active Agents or Team Leaders are available.</div>';}
      membersReady=true;applyFilter();syncSelection();title.focus();
    }catch(error){list.setAttribute('aria-busy','false');list.innerHTML='<div class="tt-wm-group-none">Member directory is temporarily unavailable.</div>';status.textContent=error.message||'Unable to load members.';}
    form.onsubmit=async event=>{
      event.preventDefault();if(save.disabled||epoch!==state.epoch)return;
      const name=title.value.trim(),addMemberIds=selectedIds();
      if(!name){status.textContent='Enter a group name.';title.focus();return;}
      if(!isManaging&&!addMemberIds.length){status.textContent='Select at least one Agent or Team Leader.';return;}
      save.disabled=true;save.classList.add('is-saving');save.textContent='Saving…';status.textContent='';
      try{const data=await api('/api/chat/groups',{method:isManaging?'PATCH':'POST',body:JSON.stringify({conversationId:id,title:name,addMemberIds})});if(epoch!==state.epoch)return;dialog.close();await refreshInbox();await openConversation(data.conversation.conversationId);showToast(isManaging?'Group updated.':'Group created.');}
      catch(error){if(dialog.isConnected){status.textContent=error.message||'Unable to save group.';save.classList.remove('is-saving');save.textContent=isManaging?'Save changes':'Create group';syncSelection();}}
    };
  }
  function renderPeople(){if(!els.peopleList)return;els.peopleList.innerHTML=`<div class="tt-wm-people-title">Start a direct message</div>`+(state.people.length?state.people.map(p=>`<button class="tt-wm-person" type="button" data-person="${attr(p.uid)}">${personAvatar(p.uid,p.name)}<span><strong>${personNameMarkup(p.uid,p.name,'tt-wm-reward-name')}</strong><small>${escapeHtml(displayRole(p.role))}${(p.podLabel||p.pod)?' · '+escapeHtml(p.podLabel||p.pod):''}${p.messagingLabel?' · '+escapeHtml(p.messagingLabel):''}</small></span></button>`).join(''):'<div class="tt-wm-empty">No eligible teammates are available.</div>');els.peopleList.querySelectorAll('[data-person]').forEach(btn=>btn.addEventListener('click',()=>startDirect(btn.dataset.person)));}
  async function startDirect(uid){try{const existing=state.conversations.find(c=>c.type==='direct'&&!c.archived&&c.memberIds?.includes(state.actor?.uid)&&c.memberIds?.includes(uid));if(existing){state.peopleOpen=false;if(els.peopleList)els.peopleList.hidden=true;await openConversation(existing.conversationId);return true;}const data=await api('/api/chat/direct',{method:'POST',body:JSON.stringify({targetUid:uid})});state.peopleOpen=false;if(els.peopleList)els.peopleList.hidden=true;await refreshInbox();if(!state.conversations.some(c=>c.conversationId===data.conversation.conversationId))state.conversations.unshift(data.conversation);await openConversation(data.conversation.conversationId);return true;}catch(error){showToast(error.message,true);return false;}}
  function directPersonByName(name){const needle=normalizeSearch(name);if(!needle)return null;return state.people.find(person=>normalizeSearch(person?.name||'')===needle)||null;}
  function canDirectByName(name){return Boolean(directPersonByName(name));}
  async function openDirectByName(name){
    const targetName=String(name||'').trim();if(!targetName||!els.overlay)return false;
    if(els.overlay.hidden)state.chatReturnFocus=document.activeElement;
    lockBackgroundScroll();
    els.overlay.hidden=false;renderWelcome();showLaunchIfSession();clearTimeout(state.backgroundBadgeTimer);state.backgroundBadgeTimer=0;clearTimeout(state.hiddenSocketTimer);state.hiddenSocketTimer=0;
    try{
      await bootstrap(false,{connectRealtime:true});if(els.overlay.hidden)return false;
      const person=directPersonByName(targetName);
      if(!person){showToast('Direct messaging is not available with this profile.',true);return false;}
      return await startDirect(person.uid);
    }catch(error){if(!els.overlay.hidden)renderUnavailable(error);return false;}
  }
  function normalizeSearch(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
  let livePeopleSearchTimer=0,livePeopleSearchSeq=0;
  function mergeAuthorizedPeople(rows){for(const row of Array.isArray(rows)?rows:[]){const uid=String(row?.uid||'');if(!uid||uid===String(state.actor?.uid||''))continue;const existing=state.people.find(item=>item.uid===uid);if(existing)Object.assign(existing,row);else state.people.push(row);}}
  async function refreshLivePeopleSearch(q){const query=String(q||'').trim();if(query.length<2||!state.searchOpen)return;const seq=++livePeopleSearchSeq;try{const data=await api(`/api/chat/people-search?q=${encodeURIComponent(query)}`);if(seq!==livePeopleSearchSeq||!state.searchOpen||(els.search?.value||'').trim()!==query)return;mergeAuthorizedPeople(data?.people);const local=localSearchMatches(query);renderUnifiedSearch(query,local,{hits:[]},'',true);}catch(_){/* Local search stays usable if live people discovery is temporarily unavailable. */}}
  function scheduleLivePeopleSearch(q){clearTimeout(livePeopleSearchTimer);const query=String(q||'').trim();if(query.length<2)return;livePeopleSearchTimer=setTimeout(()=>refreshLivePeopleSearch(query),180);}
  function localSearchMatches(q){const needle=normalizeSearch(q);if(!needle)return {people:[],conversations:[]};const people=state.people.filter(p=>p.uid!==state.actor?.uid&&normalizeSearch([p.name,p.role,p.pod,p.podLabel,p.messagingLabel].filter(Boolean).join(' ')).includes(needle)).slice(0,30);const conversations=state.conversations.filter(c=>normalizeSearch([c.title,c.type,c.lastMessageText].filter(Boolean).join(' ')).includes(needle)).slice(0,30);return {people,conversations};}
  function renderUnifiedSearch(q,local,data,messageSearchError='',messageHint=false){if(!els.searchResults)return;const peopleHtml=local.people.length?`<section class="tt-wm-search-section"><div class="tt-wm-search-section-title">People</div>${local.people.map(p=>`<button type="button" class="tt-wm-search-person" data-search-person="${attr(p.uid)}">${personAvatar(p.uid,p.name)}<span><strong>${personNameMarkup(p.uid,p.name||'Team member','tt-wm-reward-name')}</strong><small>${escapeHtml(displayRole(p.role))}${(p.podLabel||p.pod)?' · '+escapeHtml(p.podLabel||p.pod):''}${p.messagingLabel?' · '+escapeHtml(p.messagingLabel):''}</small></span></button>`).join('')}</section>`:'';const convHtml=local.conversations.length?`<section class="tt-wm-search-section"><div class="tt-wm-search-section-title">Conversations</div>${local.conversations.map(c=>`<button type="button" class="tt-wm-search-conv" data-search-conv="${attr(c.conversationId)}">${conversationAvatar(c)}<span><strong>${escapeHtml(c.title||'Conversation')}</strong><small>${escapeHtml(c.type==='general'?'General Chat':c.type==='group'?'Custom group':c.type==='team'?'POD channel':'Direct message')}${c.lastMessageText?' · '+escapeHtml(c.lastMessageText.slice(0,70)):''}</small></span></button>`).join('')}</section>`:'';const hits=Array.isArray(data?.hits)?data.hits:[];const messagesHtml=hits.length?`<section class="tt-wm-search-section"><div class="tt-wm-search-section-title">Messages</div>${hits.map(hit=>{const m=hit.message||hit.reply||{};const c=state.conversations.find(x=>x.conversationId===hit.conversationId);return `<button type="button" class="tt-wm-search-hit" data-hit-conv="${attr(hit.conversationId)}" data-hit-message="${attr(hit.rootMessageId||m.messageId||'')}" data-hit-reply="${attr(hit.kind==='reply'?m.replyId||'':'')}"><small>${escapeHtml(c?.title||'Conversation')} · ${escapeHtml(shortDateTime(m.createdAt))}</small><p>${escapeHtml(m.text||'')}</p></button>`;}).join('')}</section>`:'';const errorHtml=messageSearchError?`<div class="tt-wm-search-note">Message-text search is temporarily unavailable, but people and conversation search still works.</div>`:'';const hintHtml=messageHint?`<div class="tt-wm-search-hint">Press Enter to search message text in your authorized conversations.</div>`:'';const empty=!peopleHtml&&!convHtml&&!messagesHtml?`<div class="tt-wm-empty">No people, conversations, or messages match “${escapeHtml(q)}”.</div>`:'';els.searchResults.innerHTML=`<div class="tt-wm-search-head"><div><strong>Search Workspace Messaging</strong><small>People, conversations, and message text</small></div><button type="button" class="tt-wm-icon-btn" id="ttChatSearchClose" aria-label="Close search">×</button></div>${peopleHtml}${convHtml}${messagesHtml}${errorHtml}${hintHtml}${empty}`;$('ttChatSearchClose')?.addEventListener('click',closeSearch);els.searchResults.querySelectorAll('[data-search-person]').forEach(btn=>btn.addEventListener('click',async()=>{closeSearch();await startDirect(btn.dataset.searchPerson);}));els.searchResults.querySelectorAll('[data-search-conv],[data-hit-conv]').forEach(btn=>btn.addEventListener('click',async()=>{closeSearch();await openConversation(btn.dataset.searchConv||btn.dataset.hitConv,{messageId:btn.dataset.hitMessage||'',replyId:btn.dataset.hitReply||''});}));}
  function syncSearchClear(){if(els.searchClear)els.searchClear.hidden=!(els.search?.value?.length>0);}
  function previewSearch(){syncSearchClear();const q=(els.search.value||'').trim();if(!q){closeSearch();return;}const local=localSearchMatches(q);state.searchOpen=true;els.searchResults.hidden=false;renderUnifiedSearch(q,local,{hits:[]},'',q.length>=2);scheduleLivePeopleSearch(q);}
  async function runSearch(){const searchGeneration=state.searchGeneration;syncSearchClear();const q=(els.search.value||'').trim();if(!q){closeSearch();return;}let local=localSearchMatches(q);state.searchOpen=true;els.searchResults.hidden=false;renderUnifiedSearch(q,local,{hits:[]});let data={hits:[]};let messageSearchError='';if(q.length>=2){const [peopleResult,messageResult]=await Promise.allSettled([api(`/api/chat/people-search?q=${encodeURIComponent(q)}`),api(`/api/chat/search?q=${encodeURIComponent(q)}`)]);if(peopleResult.status==='fulfilled')mergeAuthorizedPeople(peopleResult.value?.people);if(messageResult.status==='fulfilled')data=messageResult.value;else messageSearchError=messageResult.reason?.code||'CHAT_SEARCH_UNAVAILABLE';local=localSearchMatches(q);}if(searchGeneration!==state.searchGeneration||!state.searchOpen||(els.search.value||'').trim()!==q)return;renderUnifiedSearch(q,local,data,messageSearchError);}
  function closeSearch(){clearTimeout(livePeopleSearchTimer);livePeopleSearchSeq++;syncSearchClear();state.searchOpen=false;if(els.searchResults)els.searchResults.hidden=true;}
  async function openThread(messageId, replyId=''){
    closeMentionMenu();const root=state.messages.find(m=>m.messageId===messageId);if(!root)return;
    saveThreadDraft();state.threadSeq++;state.threadPageEpoch++;state.threadRoot=root;state.threadPendingId='';state.threadCursor=null;state.threadLoadingOlder=false;state.threadContext=!!replyId;state.threadLoaded=false;state.threadReplies=[];
    els.threadComposer.value=state.threadDrafts.get(threadDraftKey())||'';els.threadSend.disabled=false;
    els.threadPanel.hidden=false;renderThreadRoot();
    await loadThreadReplies(replyId,true);
  }
  function updateThreadHistoryControls(){
    if(els.threadOlder){els.threadOlder.hidden=!state.threadCursor;els.threadOlder.disabled=state.threadLoadingOlder;}
    if(els.threadLatest)els.threadLatest.hidden=!state.threadContext;
  }
  function renderThreadReplies(follow=false, replyId=''){
    state.threadReplies=visibleReplies(state.threadReplies);
    const entries=state.threadReplies.map(r=>{const editing=editingRecord(state.threadRoot?.messageId||'',r.replyId);const content=editing?editComposerMarkup(state.threadRoot?.messageId||'',r.replyId,r.text):`<div class="tt-wm-message-context-surface" data-message-context-surface>${richMessageContent(r)}${chatActions()?.menu(r,state.actor?.uid,state.threadRoot?.messageId)||''}</div>`;return {key:r.replyId,html:`<div class="tt-wm-thread-reply" data-reply-row="${attr(r.replyId)}">${chatProfileAvatarMarkup(r.senderUid,r.senderName,'tt-wm-reply-avatar','workspace-thread-avatar')}<strong>${chatProfileNameMarkup(r.senderUid,r.senderName,'tt-wm-reward-name','workspace-thread-name')} · ${escapeHtml(shortTime(r.createdAt))}${r.editedAt?' · <span class="tt-wm-edited">edited</span>':''}</strong>${content}</div>`};});
    if(!entries.length)entries.push({key:'empty',html:'<div class="tt-wm-empty">No replies yet.</div>'});
    patchMessageNodes(els.threadReplies,entries);if(follow)els.threadReplies.scrollTop=els.threadReplies.scrollHeight;
    updateThreadHistoryControls();if(replyId)highlightMessage(replyId,els.threadReplies,'replyRow');
  }
  function mergeReplies(previous,incoming){
    previous=visibleReplies(previous);incoming=visibleReplies(incoming);
    const rows=new Map(previous.map(r=>[r.replyId,r]));for(const reply of incoming){const old=rows.get(reply.replyId);if(old?.unsentAt&&!reply.unsentAt)continue;if(Number(old?._version||0)>Number(reply._version||0))continue;rows.set(reply.replyId,reply);}
    return [...rows.values()].sort((a,b)=>compareMessageOrder({...a,messageId:a.replyId},{...b,messageId:b.replyId}));
  }
  async function loadThreadReplies(replyId='',replace=false){
    const id=state.activeConversationId,root=state.threadRoot?.messageId,generation=state.viewEpoch,sequence=++state.threadSeq;
    if(!id||!root)return;
    if(state.threadContext&&!replyId&&!replace)return;
    try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/replies?messageId=${encodeURIComponent(root)}${replyId?'&around='+encodeURIComponent(replyId):''}`);
      if(!viewIsCurrent(id,generation)||state.threadRoot?.messageId!==root||sequence!==state.threadSeq)return;
      const follow=replace||els.threadReplies.scrollHeight-els.threadReplies.scrollTop-els.threadReplies.clientHeight<70;
      if(replace||!state.threadLoaded){state.threadReplies=visibleReplies(data.replies||[],id,root);state.threadCursor=data.nextCursor||null;state.threadContext=!!replyId;}
      else state.threadReplies=mergeReplies(state.threadReplies,data.replies||[]);
      state.threadLoaded=true;renderThreadReplies(follow,replyId);await markRead();
    }catch(error){if(viewIsCurrent(id,generation)&&state.threadRoot?.messageId===root)showToast(error.message,true);}
  }
  async function loadOlderReplies(){
    const id=state.activeConversationId,root=state.threadRoot?.messageId,generation=state.viewEpoch,cursor=state.threadCursor,pageEpoch=state.threadPageEpoch;
    if(!root||!cursor||state.threadLoadingOlder)return;
    state.threadLoadingOlder=true;updateThreadHistoryControls();
    try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/replies?messageId=${encodeURIComponent(root)}&before=${encodeURIComponent(cursor)}`);
      if(!viewIsCurrent(id,generation)||state.threadRoot?.messageId!==root||state.threadCursor!==cursor||pageEpoch!==state.threadPageEpoch)return;
      const height=els.threadReplies.scrollHeight,top=els.threadReplies.scrollTop;
      state.threadReplies=mergeReplies(data.replies||[],state.threadReplies);state.threadCursor=data.nextCursor||null;
      renderThreadReplies(false);els.threadReplies.scrollTop=top+els.threadReplies.scrollHeight-height;
    }catch(error){if(viewIsCurrent(id,generation)&&state.threadRoot?.messageId===root)showToast(error.message,true);}
    finally{if(viewIsCurrent(id,generation)&&state.threadRoot?.messageId===root&&pageEpoch===state.threadPageEpoch){state.threadLoadingOlder=false;updateThreadHistoryControls();}}
  }
  async function sendThreadReply(){
    const text=(els.threadComposer.value||'').trim(),id=state.activeConversationId,root=state.threadRoot?.messageId,generation=state.viewEpoch,epoch=state.epoch;
    if(!text||!id||!root)return;
    if(parsePodInstructionCommand(text)){showToast('Use /instruction in the main POD chat composer, not in a thread reply.',true);return;}
    const key=threadDraftKey(id,root);let attempt=state.replyAttempts.get(key);
    if(attempt?.sending)return;
    if(!attempt||attempt.text!==text)attempt={replyId:`rpl_${crypto.randomUUID().replace(/-/g,'')}`,text,commandRequestedAt:exactMealCommand(text)?Date.now():undefined};
    let mealLock=null;try{mealLock=beginMealAttempt(text);if(exactMealCommand(text))rememberMealAttempt({...attempt,conversationId:id,rootMessageId:root});}catch(error){mealLock?.release();showToast(error.message,true);return;}
    attempt.sending=true;state.replyAttempts.set(key,attempt);state.threadPendingId=attempt.replyId;els.threadSend.disabled=true;
    try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/replies`,{method:'POST',body:JSON.stringify({rootMessageId:root,replyId:attempt.replyId,text,commandRequestedAt:attempt.commandRequestedAt})});
      if(epoch!==state.epoch)return;state.replyAttempts.delete(key);if(exactMealCommand(text)){requireMealAcknowledgement(data);await reflectMealResult(data,mealLock);if(epoch!==state.epoch)return;finishMealReceipt(attempt.replyId,data);}if(epoch!==state.epoch)return;
      if(state.threadDrafts.get(key)===text)state.threadDrafts.delete(key);
      if(id===state.activeConversationId&&state.threadRoot?.messageId===root){if(els.threadComposer.value.trim()===text)els.threadComposer.value='';closeMentionMenu();state.threadPendingId='';await loadThreadReplies();await loadMessages(id,false);}
    }catch(error){if(epoch===state.epoch){const failure=exactMealCommand(text)?mealFailurePresentation(error):null;if(failure&&!failure.retryable){forgetMealAttempt(attempt.replyId);state.replyAttempts.delete(key);state.threadPendingId='';}else attempt.sending=false;if(viewIsCurrent(id,generation)&&state.threadRoot?.messageId===root)showToast(failure?.text||error.message,true);}}
    finally{mealLock?.release();if(epoch===state.epoch&&id===state.activeConversationId&&state.threadRoot?.messageId===root)els.threadSend.disabled=false;renderMealOutbox();}
  }
  function closeThread(){
    saveThreadDraft();closeMentionMenu();state.threadSeq++;state.threadPageEpoch++;if(els.threadPanel)els.threadPanel.hidden=true;
    state.threadRoot=null;state.threadReplies=[];state.threadPendingId='';state.threadLoaded=false;state.threadCursor=null;state.threadContext=false;if(els.threadComposer)els.threadComposer.value='';
  }
  async function setNotificationMode(mode){
    const id=state.activeConversationId,generation=state.viewEpoch,epoch=state.epoch;if(!id)return;
    try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/preferences`,{method:'POST',body:JSON.stringify({notificationMode:mode})});
      if(epoch!==state.epoch)return;const pref=data.preference||{notificationMode:mode};const c=state.conversations.find(x=>x.conversationId===id);if(c)c.notificationMode=pref.notificationMode||mode;
      if(viewIsCurrent(id,generation)){if(state.activeConversation)state.activeConversation.notificationMode=pref.notificationMode||mode;els.notifyMenu.hidden=true;els.notifyBtn?.setAttribute('aria-expanded','false');renderThreadHeader();showToast(`Notifications: ${notifyLabel(mode).replace(/^\S+\s*/, '')}`);}
      renderSidebar();await refreshInbox();
    }catch(error){if(viewIsCurrent(id,generation))showToast(error.message,true);}
  }
  function openReport(messageId){const m=state.messages.find(x=>x.messageId===messageId);if(!m||m.senderUid===state.actor?.uid)return;state.reportTarget=m;state.reportConversationId=state.activeConversationId;els.reportSubmit.disabled=false;els.reportSummary.textContent=`Report ${m.senderName||'this sender'}'s message from ${shortTime(m.createdAt)}. The report is visible only to authorized supervisors.`;els.reportReason.value='inappropriate';els.reportNote.value='';els.reportDialog.hidden=false;}
  function closeReport(){state.reportTarget=null;state.reportConversationId='';if(els.reportDialog)els.reportDialog.hidden=true;}
  async function submitReport(){
    const m=state.reportTarget,id=state.reportConversationId,epoch=state.epoch;if(!m||!id)return;
    els.reportSubmit.disabled=true;
    try{await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(m.messageId)}/report`,{method:'POST',body:JSON.stringify({reason:els.reportReason.value,note:els.reportNote.value})});
      if(epoch===state.epoch&&state.reportTarget===m){showToast('Report submitted to an authorized supervisor.');closeReport();}
    }catch(error){if(epoch===state.epoch&&state.reportTarget===m)showToast(error.message,true);}
    finally{if(epoch===state.epoch&&(!state.reportTarget||state.reportTarget===m))els.reportSubmit.disabled=false;}
  }
  async function openGovernance(tab='reports'){if(!['admin','team_leader'].includes(state.actor?.role))return;state.governanceOpen=true;state.governanceTab=tab;els.governancePanel.hidden=false;renderGovernanceTabs();await loadGovernance();}
  function closeGovernance(){state.governanceOpen=false;if(els.governancePanel)els.governancePanel.hidden=true;}
  function renderGovernanceTabs(){els.governancePanel?.querySelectorAll('[data-gov-tab]').forEach(btn=>btn.classList.toggle('is-active',btn.dataset.govTab===state.governanceTab));if(els.accessTabBtn)els.accessTabBtn.hidden=state.actor?.role!=='admin';}
  async function loadGovernance(){if(!els.governanceContent)return;els.governanceContent.innerHTML='<div class="tt-wm-empty">Loading…</div>';try{if(state.governanceTab==='access'&&state.actor?.role==='admin'){const data=await api('/api/chat/capabilities');els.governanceContent.innerHTML=`<div class="tt-wm-gov-note">Global DM access is a server-authoritative capability. It allows private messages across PODs; it never grants access to another POD group channel.</div>`+(data.members?.length?data.members.map(m=>`<label class="tt-wm-access-row"><span><strong>${escapeHtml(m.name)}</strong><small>${escapeHtml(displayRole(m.role))} · ${escapeHtml(m.pod||'')}</small></span><input type="checkbox" data-capability-uid="${attr(m.uid)}" ${m.globalDm?'checked':''} ${m.stagingQaWorkspaceContact?'disabled aria-label="Staging QA Workspace Contact is automatic"':''}><em>${m.stagingQaWorkspaceContact?'Workspace Contact · QA':(m.globalDm?'Workspace Contact':'Same-POD only')}</em></label>`).join(''):'<div class="tt-wm-empty">No eligible members.</div>');els.governanceContent.querySelectorAll('[data-capability-uid]').forEach(input=>input.addEventListener('change',()=>updateCapability(input)));return;}const data=await api('/api/chat/reports');els.governanceContent.innerHTML=data.reports?.length?data.reports.map(r=>`<article class="tt-wm-report-item"><div class="tt-wm-report-item-head"><strong>${escapeHtml(r.reportedSenderName||'Team member')}</strong><span class="tt-wm-report-status is-${attr(r.status||'open')}">${escapeHtml(r.status||'open')}</span></div><small>${escapeHtml(r.reason||'other')} · reported by ${escapeHtml(r.reporterName||'Team member')} · ${escapeHtml(shortDateTime(r.createdAt))}</small><p>${escapeHtml(r.messageExcerpt||'')}</p>${r.note?`<blockquote>${escapeHtml(r.note)}</blockquote>`:''}<div class="tt-wm-report-actions"><button type="button" data-report-status="reviewed" data-report-id="${attr(r.reportId)}">Mark reviewed</button><button type="button" data-report-status="dismissed" data-report-id="${attr(r.reportId)}">Dismiss</button></div></article>`).join(''):'<div class="tt-wm-empty">No message reports.</div>';els.governanceContent.querySelectorAll('[data-report-status]').forEach(btn=>btn.addEventListener('click',()=>updateReportStatus(btn.dataset.reportId,btn.dataset.reportStatus)));}catch(error){els.governanceContent.innerHTML=`<div class="tt-wm-empty">${escapeHtml(error.message)}</div>`;}}
  async function updateCapability(input){input.disabled=true;try{await api('/api/chat/capabilities',{method:'PATCH',body:JSON.stringify({targetUid:input.dataset.capabilityUid,globalDm:input.checked})});await bootstrap(true);await loadGovernance();showToast('Messaging access updated.');}catch(error){input.checked=!input.checked;showToast(error.message,true);}finally{input.disabled=false;}}
  async function updateReportStatus(reportId,status){try{await api(`/api/chat/reports/${encodeURIComponent(reportId)}/status`,{method:'POST',body:JSON.stringify({status})});await loadGovernance();showToast('Report status updated.');}catch(error){showToast(error.message,true);}}
  function renderCredentialActivation() {
    const ctx=legacyActorContext(); if(!els.welcome||!ctx)return false;
    els.welcome.innerHTML=`<div class="tt-wm-config-card tt-wm-activate-card"><strong>Activate Workspace Messaging</strong><p>Messaging is available automatically to your TrinoTime account. Confirm your existing password once on this browser — no Admin approval is required. Verification stays inside TrinoTime; the password is not sent to the Messaging Worker.</p><div class="tt-wm-activate-who">${escapeHtml(ctx.name)} · ${escapeHtml(ctx.pod)}</div><input id="ttChatActivatePassword" class="tt-wm-activate-input" type="password" autocomplete="current-password" placeholder="Your TrinoTime password"><button id="ttChatActivateBtn" class="tt-wm-activate-btn" type="button">Activate Messaging</button><small id="ttChatActivateError" class="tt-wm-activate-error"></small></div>`;
    const input=$('ttChatActivatePassword'),btn=$('ttChatActivateBtn'),err=$('ttChatActivateError');
    const run=async()=>{const password=String(input?.value||'');if(!password){if(err)err.textContent='Enter your existing TrinoTime password.';return;}if(btn){btn.disabled=true;btn.textContent='Verifying…';}if(err)err.textContent='';try{await establishLegacyIdentity(ctx.role,ctx.name,password,ctx.pod);renderWelcome();await bootstrap(true);const preferred=state.conversations.find(c=>c.type==='team'&&c.teamId===state.teams[0]?.teamId)||state.conversations.find(c=>!c.archived);if(preferred)await openConversation(preferred.conversationId);}catch(e){if(err)err.textContent=e.message||'Could not activate Messaging.';}finally{if(btn){btn.disabled=false;btn.textContent='Activate Messaging';}if(input)input.value='';}};
    btn?.addEventListener('click',run);input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});setTimeout(()=>input?.focus(),0);return true;
  }
  function renderUnavailable(error){
    if(!els.welcome)return; els.shell?.classList.remove('has-conversation');state.loaded=false;updateHistoryControls();setWelcomeVisible(true); const code=error?.code||state.lastErrorCode||'CHAT_UNAVAILABLE';
    if(['CHAT_CREDENTIAL_CONFIRM_REQUIRED','CHAT_IDENTITY_REQUIRED','IDENTITY_REQUIRED','CHAT_IDENTITY_STALE','CHAT_IDENTITY_REVOKED','CHAT_CREDENTIAL_REJECTED','CHAT_CREDENTIAL_LOCKED','CHAT_CREDENTIAL_RESET_REQUIRED','CHAT_MEMBER_NOT_FOUND'].includes(code)&&renderCredentialActivation())return;
    let title='Workspace Messaging is unavailable'; let body='Chat is temporarily unavailable. Attendance, schedules and all workforce tools continue to work normally.';
    const help={
      CHAT_SERVER_CONFIG_REQUIRED:['Workspace Messaging needs Cloudflare setup','One or more required server-side chat settings are missing.'],
      CHAT_FIREBASE_PRIVATE_KEY_INVALID:['Firebase service key needs correction','The Firebase service-account private key could not be parsed. Re-save the complete private_key in Cloudflare Secrets.'],
      CHAT_FIREBASE_ADMIN_AUTH_FAILED:['Firebase service account could not sign in','Confirm FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY came from the same cwh-timeclock service-account JSON.'],
      CHAT_MEMBERSHIP_UNAVAILABLE:['Workforce directory is temporarily unavailable','Messaging could not read the current workforce roster from Firebase. Attendance remains unaffected.'],
      CHAT_STORAGE_ERROR:['Durable Chat storage is not ready','The SQLite Durable Object could not complete the Messaging request.'],
      CHAT_STORAGE_NOT_CONFIGURED:['Durable Chat binding is missing','The CHAT_REALTIME Durable Object binding is not available on this deployment.'],
      CHAT_TEAM_REQUIRED:['No active POD assignment was found','Workspace Messaging needs your current POD assignment before it can open.']
    };
    if(help[code]){title=help[code][0];body=help[code][1];}
    els.welcome.innerHTML=`<div class="tt-wm-config-card"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p><small>Diagnostic code: ${escapeHtml(code)}</small><div class="tt-wm-config-actions"><button type="button" class="tt-wm-secondary-btn" id="ttWorkspaceChatRetry">Retry Messaging</button><button type="button" class="tt-wm-secondary-btn" id="ttWorkspaceChatDiagnose">Run diagnostics</button></div><div id="ttWorkspaceChatDiagnosticResult" class="tt-wm-diagnostic-result" hidden></div></div>`;
    const retry=$('ttWorkspaceChatRetry'); if(retry)retry.onclick=()=>{state.lastErrorCode='';state.sessionToken='';state.sessionExpiresAt=0;renderWelcome();bootstrap(true).then(()=>{const preferred=state.conversations.find(c=>c.type==='team'&&c.teamId===state.teams[0]?.teamId)||state.conversations.find(c=>!c.archived);if(preferred)return openConversation(preferred.conversationId);}).catch(renderUnavailable);};
    const diagnose=$('ttWorkspaceChatDiagnose'); if(diagnose)diagnose.onclick=async()=>{const out=$('ttWorkspaceChatDiagnosticResult');diagnose.disabled=true;diagnose.textContent='Checking…';try{const response=await fetch(state.actor?.role==='admin'&&state.sessionToken?'/api/chat/health?deep=1':'/api/chat/health',{cache:'no-store',headers:state.sessionToken?{'x-tt-chat-session':state.sessionToken}:{}});const data=await response.json().catch(()=>({}));if(out){const tests=data?.tests&&typeof data.tests==='object'?Object.entries(data.tests):[];const failed=tests.filter(([,ok])=>!ok).map(([name])=>name);const codes=Array.isArray(data?.diagnosticCodes)?data.diagnosticCodes:[];out.hidden=false;out.textContent=data?.ok?(data.deep?'Chat infrastructure passed all checks. Retry Messaging.':'Chat service is reachable. Retry Messaging; an Admin can run infrastructure checks.'):`Needs attention: ${failed.join(', ')||'chat bootstrap'}${codes.length?` · ${codes.join(', ')}`:''}`;}}catch(_){if(out){out.hidden=false;out.textContent='Diagnostics could not reach the chat service.';}}finally{diagnose.disabled=false;diagnose.textContent='Run diagnostics';}};
  }
  function renderWelcome(){if(!els.welcome)return;setWelcomeVisible(true);els.welcome.innerHTML='<div class="tt-wm-welcome-card"><div class="tt-wm-welcome-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg></div><h3>Workspace Messaging</h3><p>Select a POD channel or direct message. Conversations update live without refreshing TrinoTime.</p></div>';}
  async function openChat(){
    if(!els.overlay)return;if(els.overlay.hidden)state.chatReturnFocus=document.activeElement;lockBackgroundScroll();els.overlay.hidden=false;renderWelcome();showLaunchIfSession();clearTimeout(state.backgroundBadgeTimer);state.backgroundBadgeTimer=0;clearTimeout(state.hiddenSocketTimer);state.hiddenSocketTimer=0;
    try{await bootstrap(false,{connectRealtime:true});if(els.overlay.hidden)return;
      const preferred=state.activeConversationId||state.conversations.find(c=>c.type==='team'&&c.teamId===state.teams[0]?.teamId)?.conversationId||state.conversations.find(c=>!c.archived)?.conversationId;
      if(preferred)await openConversation(preferred);
    }catch(error){if(!els.overlay.hidden)renderUnavailable(error);}
  }
  function closeChat(){if(!els.overlay)return;$('ttChatGroupDialog')?.close();messageContextController?.close?.();state.messageEdit=null;saveDraft();stopTyping();state.viewEpoch++;state.loadSeq++;els.overlay.hidden=true;if(!voiceCallBlocksBackground())unlockBackgroundScroll();closeThread();closeGovernance();closeReport();if(els.notifyMenu)els.notifyMenu.hidden=true;state.peopleOpen=false;if(els.peopleList)els.peopleList.hidden=true;closeSearch();stopTyping();clearTimeout(state.refreshTimer);state.refreshTimer=0;clearTimeout(state.hiddenSocketTimer);state.hiddenSocketTimer=0;if(realtimeDesired()&&!state.socketConnected&&!state.socketConnecting)connectSocket().catch(()=>scheduleBackgroundBadgeRefresh(5000));const returnFocus=state.chatReturnFocus?.isConnected?state.chatReturnFocus:els.launch;if(returnFocus&&returnFocus.getAttribute?.('aria-hidden')!=='true')returnFocus.focus?.({preventScroll:true});}
  function mobileBack(){saveDraft();stopTyping();if(els.shell)els.shell.classList.remove('has-conversation');}
  function recentEmojis(){try{return JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY)||'[]').filter(Boolean).slice(0,28);}catch(_){return [];}}
  function rememberEmoji(emoji){try{const next=[emoji,...recentEmojis().filter(item=>item!==emoji)].slice(0,28);localStorage.setItem(EMOJI_RECENT_KEY,JSON.stringify(next));}catch(_){}}
  function insertEmoji(emoji){const start=els.composer.selectionStart??els.composer.value.length,end=els.composer.selectionEnd??start;els.composer.value=els.composer.value.slice(0,start)+emoji+els.composer.value.slice(end);els.composer.focus();els.composer.selectionStart=els.composer.selectionEnd=start+emoji.length;rememberEmoji(emoji);saveDraft();autoGrow();}
  function buildEmoji(category=state.emojiCategory||'Recent'){
    if(!els.emojiPop)return;state.emojiCategory=category;const recents=recentEmojis();const categories=[['Recent',recents.length?recents:QUICK_REACTIONS],...EMOJI_CATEGORIES];const current=categories.find(([name])=>name===category)||categories[0];
    els.emojiPop.innerHTML=`<div class="tt-wm-emoji-head"><strong>Emoji 17.0</strong><small>Latest stable Unicode emoji set</small></div><div class="tt-wm-emoji-tabs">${categories.map(([name])=>`<button type="button" class="${name===current[0]?'is-active':''}" data-emoji-category="${attr(name)}" title="${attr(name)}">${escapeHtml(name==='Recent'?'🕘':name==='New 17.0'?'✨':name==='Smileys'?'😀':name==='People'?'👋':name==='Animals'?'🐾':name==='Food'?'🍕':name==='Activities'?'⚽':name==='Travel'?'✈️':name==='Objects'?'💡':name==='Symbols'?'❤️':'🏳️')}</button>`).join('')}</div><div class="tt-wm-emoji-grid">${current[1].map(e=>`<button type="button" data-emoji="${attr(e)}" aria-label="Insert ${attr(e)}">${escapeHtml(e)}</button>`).join('')}</div>`;
    els.emojiPop.querySelectorAll('[data-emoji-category]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();buildEmoji(btn.dataset.emojiCategory);}));
    els.emojiPop.querySelectorAll('[data-emoji]').forEach(btn=>btn.addEventListener('click',()=>{insertEmoji(btn.dataset.emoji);if(state.emojiCategory==='Recent')buildEmoji('Recent');}));
  }
  function viewIsCurrent(id, generation) { return id === state.activeConversationId && generation === state.viewEpoch; }
  function atMessageBottom() { const el=els.messages; return !!el && el.scrollHeight-el.scrollTop-el.clientHeight < 70; }
  function latestMessageAnchorActive(id=state.activeConversationId) { return !!id && state.latestAnchorConversationId===id && !state.latestAnchorReleased && !state.historyContext; }
  function releaseLatestMessageAnchor() { state.latestAnchorReleased=true; state.latestAnchorEpoch++; }
  function pinMessagesToLatest(settle=false) {
    const id=state.activeConversationId,host=els.messages;if(!id||!host||state.historyContext)return;
    const epoch=++state.latestAnchorEpoch;state.latestAnchorConversationId=id;state.latestAnchorReleased=false;
    const pin=()=>{if(epoch!==state.latestAnchorEpoch||id!==state.activeConversationId||!latestMessageAnchorActive(id)||!chatIsVisible())return;host.scrollTop=host.scrollHeight;};
    pin();
    if(settle){requestAnimationFrame(()=>{pin();requestAnimationFrame(pin);});for(const delay of [80,180,360,700,1200,1800])setTimeout(pin,delay);}
  }
  function repinLatestAfterAsyncLayout() { if(latestMessageAnchorActive())requestAnimationFrame(()=>{if(latestMessageAnchorActive()&&els.messages)els.messages.scrollTop=els.messages.scrollHeight;}); }
  function chatIsVisible() { return !document.hidden && !!els.overlay && !els.overlay.hidden && !!els.shell?.classList.contains('has-conversation'); }
  function saveDraft() { if(state.activeConversationId && els.composer) state.drafts.set(state.activeConversationId, els.composer.value); }
  function threadDraftKey(id=state.activeConversationId, root=state.threadRoot?.messageId) { return JSON.stringify([id,root||'']); }
  function saveThreadDraft() { if(state.threadRoot && els.threadComposer) state.threadDrafts.set(threadDraftKey(),els.threadComposer.value); }
  function resetChatSession() {
    messageContextController?.close?.();
    $('ttChatGroupDialog')?.close();
    if(state.call){sendSocket({type:'call.end',callId:state.call.callId,conversationId:state.call.conversationId,media:state.call.media==='video'?'video':'audio',reason:'session-ended'});clearCallTimers();cleanupCallMedia(state.call);state.call=null;if(els.callOverlay)els.callOverlay.hidden=true;}
    state.dmMenuId='';state.dmBusy.clear();state.historyGenerations.clear();state.searchGeneration++;state.favoriteBusy=false;state.conversationSearchSeq++;state.conversationSearchOpen=false;state.conversationSearchConversationId='';state.conversationSearchQuery='';state.conversationSearchBusy=false;resetConversationSearchResults();
    window.TrinoTimeChatAttendance?.cancelSession?.();
    state.mealRetryBusy.clear();state.mealOutbox.clear();state.mealOutboxActor='';renderMealOutbox();state.hiddenChatRecords.clear();state.unsentChatRecords.clear();state.visibilityGenerations.clear();state.unsendBusy.clear();state.attachmentGeneration++;
    stopTyping(); state.bootstrapPromise=null; state.epoch++; state.viewEpoch++; state.loadSeq++; state.threadSeq++;
    state.drafts.clear(); state.threadDrafts.clear(); state.pending.clear(); state.failed.clear(); state.replyAttempts.clear();
    state.messages=[]; state.conversations=[]; state.people=[]; state.teams=[]; state.unreadTotal=0; state.readReceipts=[]; state.pendingAttachments=[]; for(const item of state.pendingLocalFiles)revokeLocalPreview(item); state.pendingLocalFiles=[]; state.pendingWorkforce=null; state.pendingGif=null; state.gifResults=[]; state.gifQuery=''; state.gifProvider={name:'giphy',apiKey:''}; state.capabilities={attachments:false,gifUploads:false,giphy:false,polls:true,workforceLinks:true}; for(const url of state.attachmentUrls.values())try{URL.revokeObjectURL(url);}catch(_){} state.attachmentUrls.clear();state.attachmentPromises.clear();
    state.activeConversationId=''; state.activeConversation=null;els.shell?.classList.remove('has-conversation'); state.threadRoot=null; state.threadReplies=[];
    state.nextCursor=null; state.latestIds.clear(); state.historyContext=false; state.loaded=false; state.loadingOlder=false; state.latestAnchorConversationId=''; state.latestAnchorReleased=false; state.latestAnchorEpoch++; state.readSent.clear(); state.typingByConversation.clear();
    state.dirtyConversations.clear(); state.dirtyMessages.clear(); clearTimeout(state.socketRefreshTimer); state.socketRefreshTimer=0;
    clearTimeout(state.refreshTimer); clearTimeout(state.activeRefreshTimer); clearTimeout(state.hiddenSocketTimer); clearTimeout(state.backgroundBadgeTimer); state.hiddenSocketTimer=0; state.backgroundBadgeTimer=0;
    if(els.composer)els.composer.value=''; if(els.threadComposer)els.threadComposer.value=''; state.dragDepth=0;showDropZone(false);renderPendingShare();syncComposerCapabilities();closeComposerMenus();
    if(els.messages)els.messages.replaceChildren(); if(els.threadReplies)els.threadReplies.replaceChildren();
    for(const key of ['governanceContent','searchResults','threadRoot','reportSummary'])if(els[key])els[key].textContent='';
    if(els.convList)els.convList.replaceChildren(); if(els.peopleList)els.peopleList.replaceChildren();
    closeThread(); closeSearch(); closeConversationSearch(); closeReport(); closeGovernance(); updateHistoryControls(); showLaunchBadge();
  }
  function compareMessageOrder(a,b){
    const ad=String(a.createdAt||''),bd=String(b.createdAt||'');
    if(ad!==bd)return ad<bd?-1:1;
    const ai=String(a.messageId||''),bi=String(b.messageId||'');return ai===bi?0:ai<bi?-1:1;
  }
  function mergeMessages(previous, incoming) {
    previous=visibleMessages(previous);incoming=visibleMessages(incoming);
    const byId=new Map(previous.map(m=>[m.messageId,m]));
    for(const message of incoming){
      const existing=byId.get(message.messageId);
      if(existing?.unsentAt&&!message.unsentAt)continue;
      if(existing && Number(existing._version||0)>Number(message._version||0))continue;
      if(message.deletedAt)byId.delete(message.messageId);else byId.set(message.messageId,message);
    }
    const ended=new Map();
    for(const m of byId.values())if(m.bioBreak?.endedAt!=null)ended.set(m.bioBreak.ledgerKey+'|'+m.bioBreak.sessionId,m.bioBreak.endedAt);
    for(const m of byId.values())if(m.bioBreak){const end=ended.get(m.bioBreak.ledgerKey+'|'+m.bioBreak.sessionId);if(end!=null)m.bioBreak={...m.bioBreak,endedAt:end,statusUnavailable:false};}
    return [...byId.values()].sort(compareMessageOrder);
  }
  function updateHistoryControls() {
    if(els.older){els.older.hidden=!state.nextCursor;els.older.disabled=state.loadingOlder;els.older.textContent=state.loadingOlder?'Loading…':'Load older messages';}
    if(els.newMessages){els.newMessages.hidden=!state.hasNewMessages&&!state.historyContext;els.newMessages.textContent=state.historyContext?'Back to latest messages':'New messages ↓';}
    if(els.send)els.send.disabled=!state.loaded;
    if(els.composer)els.composer.disabled=!state.loaded;
  }
  async function goToLatest() {
    const id=state.activeConversationId;if(!id)return;
    if(state.historyContext){closeThread();state.viewEpoch++;state.loadingOlder=false;}
    const generation=state.viewEpoch;
    if(state.historyContext){const loaded=await loadMessages(id,true,{replace:true});if(!loaded||!viewIsCurrent(id,generation))return;}
    if(!viewIsCurrent(id,generation))return;
    state.hasNewMessages=false;updateHistoryControls();
    pinMessagesToLatest(true);
    await markRead();
  }
  async function loadOlderMessages() {
    releaseLatestMessageAnchor();
    const id=state.activeConversationId,generation=state.viewEpoch,cursor=state.nextCursor;
    if(!id||!cursor||state.loadingOlder)return;
    state.loadingOlder=true;updateHistoryControls();
    try{
      const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages?limit=100&before=${encodeURIComponent(cursor)}`);
      if(!viewIsCurrent(id,generation)||state.nextCursor!==cursor)return;
      const anchor=captureMessageAnchor();
      state.messages=mergeMessages(data.messages||[],state.messages);state.nextCursor=data.nextCursor||null;if(Array.isArray(data.readReceipts))state.readReceipts=data.readReceipts.filter(r=>r?.uid&&r.uid!==state.actor?.uid&&r.lastReadAt);
      renderMessages(false);restoreMessageAnchor(anchor);
    }catch(error){if(viewIsCurrent(id,generation))showToast(error.message,true);}
    finally{if(viewIsCurrent(id,generation)){state.loadingOlder=false;updateHistoryControls();}}
  }
  function captureMessageAnchor() {
    if(!els.messages)return null;
    const top=els.messages.getBoundingClientRect().top;
    const row=Array.from(els.messages.children).find(node=>node.dataset.messageRow&&node.getBoundingClientRect().bottom>top);
    return row?{id:row.dataset.messageRow,offset:row.getBoundingClientRect().top-top}:null;
  }
  function restoreMessageAnchor(anchor) {
    if(!anchor||!els.messages)return;
    const row=Array.from(els.messages.children).find(node=>node.dataset.messageRow===anchor.id);
    if(row)els.messages.scrollTop+=row.getBoundingClientRect().top-els.messages.getBoundingClientRect().top-anchor.offset;
  }
  function highlightMessage(messageId, host=els.messages, attribute='messageRow') {
    if(host===els.messages)releaseLatestMessageAnchor();
    const row=Array.from(host?.children||[]).find(node=>node.dataset[attribute]===messageId);
    if(!row){showToast('This message is no longer available in this view.',true);return;}
    row.classList.add('tt-wm-search-target');row.scrollIntoView({block:'center',behavior:'auto'});
    row.setAttribute('tabindex','-1');row.focus({preventScroll:true});
    setTimeout(()=>row.classList.remove('tt-wm-search-target'),4000);
  }

  function syncComposerCapabilities(){
    const attachments=state.capabilities?.attachments===true;
    if(els.gifBtn){
      const giphy=Boolean(state.gifProvider?.apiKey||window.TRINOTIME_GIPHY_API_KEY);
      els.gifBtn.disabled=false;
      els.gifBtn.classList.toggle('is-unavailable',!giphy);
      els.gifBtn.setAttribute('aria-disabled','false');
      els.gifBtn.title=giphy?'Search GIFs with GIPHY':'GIF search needs a GIPHY API key';
    }
    const upload=els.actionMenu?.querySelector('[data-chat-compose-action="upload"]');
    if(upload){
      upload.disabled=false;
      upload.classList.toggle('is-unavailable',!attachments);
      upload.setAttribute('aria-disabled',attachments?'false':'true');
      upload.title=attachments?'':'Private file storage is optional and not enabled yet.';
      const detail=upload.querySelector('small');
      if(detail)detail.textContent=attachments?'Images, GIF, PDF or text':'Optional private storage not enabled';
    }
  }
  function closeComposerMenus(except=''){
    if(except!=='mention')closeMentionMenu();
    if(except!=='actions'&&els.actionMenu){els.actionMenu.hidden=true;els.actionBtn?.setAttribute('aria-expanded','false');}
    if(except!=='workforce'&&els.workforcePop)els.workforcePop.hidden=true;
    if(except!=='poll'&&els.pollPop)els.pollPop.hidden=true;
    if(except!=='emoji'&&els.emojiPop)els.emojiPop.hidden=true;
    if(except!=='gif'&&els.gifPop){els.gifPop.hidden=true;els.gifBtn?.setAttribute('aria-expanded','false');}
  }
  function revokeLocalPreview(item){if(item?.previewUrl){try{URL.revokeObjectURL(item.previewUrl);}catch(_){}item.previewUrl='';}}
  function isSupportedImageFile(file){const type=String(file?.type||'').toLowerCase(),name=String(file?.name||'').toLowerCase();return ['image/png','image/jpeg','image/webp','image/gif'].includes(type)||/\.(png|jpe?g|webp|gif)$/.test(name);}
  function isSupportedChatFile(file){const type=String(file?.type||'').toLowerCase(),name=String(file?.name||'').toLowerCase();return isSupportedImageFile(file)||['application/pdf','text/plain','text/csv','application/json','text/markdown','text/x-markdown'].includes(type)||/\.(pdf|txt|csv|json|md|markdown)$/.test(name);}
  function pendingAttachmentCount(id=state.activeConversationId){return state.pendingAttachments.filter(a=>a.conversationId===id).length+state.pendingLocalFiles.filter(a=>a.conversationId===id).length;}
  function renderPendingShare(){
    if(!els.pendingShare)return;const id=state.activeConversationId,parts=[];
    for(const item of state.pendingLocalFiles.filter(a=>a.conversationId===id)){
      if(item.isImage&&item.previewUrl)parts.push(`<span class="tt-wm-pending-image"><img src="${attr(item.previewUrl)}" alt="${attr(item.name||'Image preview')}"><span><strong>${escapeHtml(item.name||'Image')}</strong><small>${escapeHtml(formatBytes(item.size||0))}</small></span><button type="button" data-remove-local-attachment="${attr(item.localId)}" aria-label="Remove ${attr(item.name||'image')}">×</button></span>`);
      else parts.push(`<span class="tt-wm-pending-chip"><span>📎</span><strong>${escapeHtml(item.name||'Attachment')}</strong><button type="button" data-remove-local-attachment="${attr(item.localId)}" aria-label="Remove attachment">×</button></span>`);
    }
    for(const item of state.pendingAttachments.filter(a=>a.conversationId===id))parts.push(`<span class="tt-wm-pending-chip"><span>📎</span><strong>${escapeHtml(item.name||'Attachment')}</strong><button type="button" data-remove-attachment="${attr(item.attachmentId)}" aria-label="Remove attachment">×</button></span>`);
    if(state.pendingWorkforce)parts.push(`<span class="tt-wm-pending-chip"><span>▦</span><strong>${escapeHtml(state.pendingWorkforce.title||'Workforce item')}</strong><button type="button" data-remove-workforce="true" aria-label="Remove workforce item">×</button></span>`);
    if(state.pendingGif?.url)parts.push(`<span class="tt-wm-pending-gif"><img src="${attr(state.pendingGif.url)}" alt="${attr(state.pendingGif.alt||state.pendingGif.title||'Selected GIF')}"><span><strong>${escapeHtml(state.pendingGif.title||'GIPHY GIF')}</strong><small>GIF · GIPHY</small></span><button type="button" data-remove-gif="true" aria-label="Remove GIF">×</button></span>`);
    els.pendingShare.innerHTML=parts.join('');els.pendingShare.hidden=!parts.length;
    els.pendingShare.querySelectorAll('[data-remove-local-attachment]').forEach(btn=>btn.addEventListener('click',()=>removePendingLocalFile(btn.dataset.removeLocalAttachment)));
    els.pendingShare.querySelectorAll('[data-remove-attachment]').forEach(btn=>btn.addEventListener('click',()=>removePendingAttachment(btn.dataset.removeAttachment)));
    els.pendingShare.querySelector('[data-remove-workforce]')?.addEventListener('click',()=>{state.pendingWorkforce=null;renderPendingShare();});
    els.pendingShare.querySelector('[data-remove-gif]')?.addEventListener('click',()=>{state.pendingGif=null;renderPendingShare();});
  }
  function removePendingLocalFile(localId){const item=state.pendingLocalFiles.find(a=>a.localId===localId);if(item)revokeLocalPreview(item);state.pendingLocalFiles=state.pendingLocalFiles.filter(a=>a.localId!==localId);renderPendingShare();}
  async function removePendingAttachment(attachmentId){
    const item=state.pendingAttachments.find(a=>a.attachmentId===attachmentId),id=item?.conversationId;state.pendingAttachments=state.pendingAttachments.filter(a=>a.attachmentId!==attachmentId);renderPendingShare();
    if(id&&attachmentId){try{await api(`/api/chat/conversations/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}?pending=1`,{method:'DELETE'});}catch(_){} }
  }
  function queueLocalFiles(files,{imagesOnly=false,source='file'}={}){
    const id=state.activeConversationId,list=Array.from(files||[]).filter(Boolean);if(!list.length)return 0;
    if(!state.capabilities?.attachments){showToast('Private image uploads are not enabled for this workspace yet.',true);return 0;}
    if(!id){showToast('Choose a conversation first.',true);return 0;}
    let available=Math.max(0,4-pendingAttachmentCount(id)),added=0,rejected=0,tooLarge=0;
    for(const file of list){
      if(available<=0)break;
      if(imagesOnly&&!isSupportedImageFile(file)){rejected++;continue;}
      if(!isSupportedChatFile(file)){rejected++;continue;}
      if(!file.size||file.size>8*1024*1024){tooLarge++;continue;}
      const localId=`local_${crypto.randomUUID().replace(/-/g,'')}`,isImage=isSupportedImageFile(file),previewUrl=isImage?URL.createObjectURL(file):'';
      state.pendingLocalFiles.push({localId,file,conversationId:id,name:file.name||`${source}-image.png`,size:file.size||0,type:file.type||'',isImage,previewUrl});available--;added++;
    }
    renderPendingShare();
    if(added){const noun=added===1?'item':'items';showToast(`${added} ${noun} ready to send.`);els.composer?.focus();}
    if(list.length-added>0&&available<=0)showToast('You can send up to 4 attachments in one message.',true);
    else if(tooLarge)showToast('Each attachment must be 8 MB or smaller.',true);
    else if(rejected)showToast(imagesOnly?'Only PNG, JPEG, WebP or GIF images can be pasted or dropped.':'That file type is not supported in chat.',true);
    return added;
  }
  function requestFile(mode='all'){
    if(!state.capabilities?.attachments){showToast('Private file uploads are ready for an optional Cloudflare R2 binding, but storage is not enabled yet.',true);return;}
    if(!state.activeConversationId){showToast('Choose a conversation first.',true);return;}
    state.fileMode=mode;els.fileInput.accept=mode==='gif'?'image/gif':'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,application/json,text/markdown';els.fileInput.value='';els.fileInput.click();
  }
  function uploadSelectedFile(){const files=Array.from(els.fileInput?.files||[]);if(!files.length)return;queueLocalFiles(files,{imagesOnly:state.fileMode==='gif',source:'picker'});if(els.fileInput)els.fileInput.value='';}
  function handleComposerPaste(event){
    const items=Array.from(event.clipboardData?.items||[]),images=items.filter(item=>item.kind==='file'&&String(item.type||'').startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
    if(!images.length)return;if(!state.capabilities?.attachments||!state.activeConversationId)return;event.preventDefault();queueLocalFiles(images,{imagesOnly:true,source:'paste'});
  }
  function dragContainsImage(dataTransfer){const items=Array.from(dataTransfer?.items||[]);return items.some(item=>item.kind==='file'&&(String(item.type||'').startsWith('image/')||!item.type))||Array.from(dataTransfer?.types||[]).includes('Files');}
  function showDropZone(show){if(!els.dropZone)return;els.dropZone.hidden=!show;els.composerWrap?.classList.toggle('is-dragging-image',show);}
  function handleDragEnter(event){if(!dragContainsImage(event.dataTransfer)||!state.capabilities?.attachments||!state.activeConversationId)return;event.preventDefault();state.dragDepth++;showDropZone(true);}
  function handleDragOver(event){if(!dragContainsImage(event.dataTransfer)||!state.capabilities?.attachments||!state.activeConversationId)return;event.preventDefault();event.dataTransfer.dropEffect='copy';showDropZone(true);}
  function handleDragLeave(event){if(!state.dragDepth)return;event.preventDefault();state.dragDepth=Math.max(0,state.dragDepth-1);if(!state.dragDepth)showDropZone(false);}
  function handleDrop(event){const files=Array.from(event.dataTransfer?.files||[]).filter(isSupportedImageFile);state.dragDepth=0;showDropZone(false);if(!files.length)return;event.preventDefault();queueLocalFiles(files,{imagesOnly:true,source:'drop'});}
  function giphyApiKey(){return String(state.gifProvider?.apiKey||window.TRINOTIME_GIPHY_API_KEY||'').trim();}
  function safeGiphyAnalyticsUrl(value){try{const parsed=new URL(String(value||''));const host=parsed.hostname.toLowerCase();return parsed.protocol==='https:'&&(host==='giphy.com'||host.endsWith('.giphy.com'))?parsed.toString():'';}catch(_){return '';}}
  function fireGiphyAnalytics(url){const safe=safeGiphyAnalyticsUrl(url);if(!safe)return;try{fetch(safe,{method:'GET',mode:'no-cors',credentials:'omit',keepalive:true,referrerPolicy:'no-referrer'}).catch(()=>{});}catch(_){}}
  function normalizeGiphyResult(item){
    const images=item?.images||{};const media=images.fixed_height?.webp||images.fixed_width?.webp||images.original?.webp||images.fixed_height?.url||images.original?.url||'';
    if(!media)return null;let parsed;try{parsed=new URL(media);}catch(_){return null;}const host=parsed.hostname.toLowerCase();if(parsed.protocol!=='https:'||!(host==='giphy.com'||host.endsWith('.giphy.com')))return null;
    return {provider:'giphy',id:String(item.id||''),title:String(item.title||'GIF').slice(0,160),alt:String(item.alt_text||item.title||'GIF').slice(0,240),url:parsed.toString(),width:Number(images.fixed_height?.width||images.fixed_width?.width||0)||0,height:Number(images.fixed_height?.height||images.fixed_width?.height||0)||0,analytics:{onload:safeGiphyAnalyticsUrl(item?.analytics?.onload?.url),onclick:safeGiphyAnalyticsUrl(item?.analytics?.onclick?.url),onsent:safeGiphyAnalyticsUrl(item?.analytics?.onsent?.url)}};
  }
  function renderGifResults(){
    if(!els.gifGrid)return;const rows=state.gifResults||[];els.gifGrid.innerHTML=rows.length?rows.map((gif,index)=>`<button type="button" class="tt-wm-gif-result" data-gif-index="${index}" aria-label="Insert GIF: ${attr(gif.alt||gif.title||'GIF')}"><img src="${attr(gif.url)}" alt="${attr(gif.alt||gif.title||'GIF')}" loading="lazy" decoding="async"></button>`).join(''):'<div class="tt-wm-gif-empty">No GIFs to show.</div>';
    els.gifGrid.querySelectorAll('[data-gif-index]').forEach(btn=>{const gif=state.gifResults[Number(btn.dataset.gifIndex)];const image=btn.querySelector('img');const viewed=()=>fireGiphyAnalytics(gif?.analytics?.onload);if(image){if(image.complete)queueMicrotask(viewed);else image.addEventListener('load',viewed,{once:true});}btn.addEventListener('click',()=>{fireGiphyAnalytics(gif?.analytics?.onclick);selectGif(gif);});});
  }
  async function loadGiphy(query=''){
    const key=giphyApiKey();if(!els.gifStatus||!els.gifGrid)return;if(!key){state.gifResults=[];els.gifStatus.textContent='GIF search is ready, but this deployment still needs a GIPHY API key.';els.gifGrid.innerHTML='<div class="tt-wm-gif-empty"><strong>GIPHY is not connected yet.</strong><span>Configure GIPHY_API_KEY for the Cloudflare Worker, then redeploy. No key is stored in TrinoTime messages.</span></div>';return;}
    const q=String(query||'').trim().slice(0,50);state.gifQuery=q;
    if(q.length<2){state.gifResults=[];els.gifStatus.textContent='Type at least 2 characters to search GIPHY.';els.gifGrid.innerHTML='<div class="tt-wm-gif-empty"><strong>Search for a GIF</strong><span>GIF results load only when you search, so idle chat does not consume API or TrinoTime quota.</span></div>';return;}
    const cacheKey=q.toLowerCase();if(state.gifCache.has(cacheKey)){state.gifResults=state.gifCache.get(cacheKey);els.gifStatus.textContent=`Results for “${q}”`;renderGifResults();return;}
    const seq=++state.gifRequestSeq;els.gifStatus.textContent='Searching GIPHY…';els.gifGrid.innerHTML='<div class="tt-wm-gif-loading">Loading…</div>';
    try{const endpoint='https://api.giphy.com/v1/gifs/search';const params=new URLSearchParams({api_key:key,limit:'24',rating:'pg-13',q});const response=await fetch(`${endpoint}?${params}`,{method:'GET',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error(`GIPHY returned ${response.status}`);const data=await response.json();if(seq!==state.gifRequestSeq)return;const rows=(Array.isArray(data?.data)?data.data:[]).map(normalizeGiphyResult).filter(Boolean);state.gifCache.set(cacheKey,rows);while(state.gifCache.size>20)state.gifCache.delete(state.gifCache.keys().next().value);state.gifResults=rows;els.gifStatus.textContent=`Results for “${q}”`;renderGifResults();}
    catch(error){if(seq!==state.gifRequestSeq)return;state.gifResults=[];const limited=/429/.test(String(error?.message||''));els.gifStatus.textContent=limited?'GIPHY search limit reached.':'GIF search is temporarily unavailable.';els.gifGrid.innerHTML=limited?'<div class="tt-wm-gif-empty"><strong>GIF search is taking a break.</strong><span>The current GIPHY key reached its hourly API limit. Try again later.</span></div>':'<div class="tt-wm-gif-empty">Could not reach GIPHY. Try again in a moment.</div>';}
  }
  function openGifPicker(){
    if(!state.activeConversationId){showToast('Choose a conversation first.',true);return;}closeComposerMenus('gif');els.gifPop.hidden=false;els.gifBtn?.setAttribute('aria-expanded','true');if(els.gifSearch)els.gifSearch.value='';state.gifResults=[];if(els.gifStatus)els.gifStatus.textContent='Type at least 2 characters to search GIPHY.';if(els.gifGrid)els.gifGrid.innerHTML='<div class="tt-wm-gif-empty"><strong>Search for a GIF</strong><span>Results load only after you search.</span></div>';requestAnimationFrame(()=>els.gifSearch?.focus());
  }
  function selectGif(gif){
    if(!gif?.url)return;const id=state.activeConversationId;if(!id)return;if(pendingAttachmentCount(id)||state.pendingWorkforce){showToast('Remove attachments or the workforce card before adding a GIF.',true);return;}state.pendingGif={...gif};els.gifPop.hidden=true;els.gifBtn?.setAttribute('aria-expanded','false');renderPendingShare();els.composer?.focus();
  }
  function handleGifSearch(){clearTimeout(state.gifSearchTimer);const query=String(els.gifSearch?.value||'').trim();state.gifSearchTimer=setTimeout(()=>loadGiphy(query),600);}
  function workforceKindLabel(kind){return ({schedule:'Schedule',leave:'Leave',overtime:'Overtime',swap:'Swap'})[kind]||'Workforce';}
  function workforceKindIcon(kind){return ({schedule:'▦',leave:'◷',overtime:'＋',swap:'⇄'})[kind]||'▦';}
  function openWorkforcePicker(){
    if(!state.capabilities?.workforceLinks){showToast('Workforce sharing is not available.',true);return;}
    const bridge=window.TrinoTimeChatWorkforceBridge;if(!bridge?.list){showToast('Workforce sharing is still loading. Try again in a moment.',true);return;}
    closeComposerMenus('workforce');els.workforcePop.hidden=false;let items=[];try{items=bridge.list()||[];}catch(_){items=[];}
    if(!items.length){els.workforceList.innerHTML='<div class="tt-wm-empty">No shareable workforce items are available in your current scope.</div>';return;}
    const groups={};for(const item of items){const kind=String(item.kind||'workforce');(groups[kind]||(groups[kind]=[])).push(item);}
    els.workforceList.innerHTML=Object.entries(groups).map(([kind,rows])=>`<section class="tt-wm-workforce-section"><small>${escapeHtml(workforceKindLabel(kind).toUpperCase())}</small>${rows.map(item=>`<button type="button" class="tt-wm-workforce-item" data-workforce-ref="${attr(item.refId)}"><span class="tt-wm-workforce-item-icon">${workforceKindIcon(kind)}</span><span><strong>${escapeHtml(item.title||'Workforce item')}</strong><em>${escapeHtml(item.subtitle||'')}</em></span><b>${escapeHtml(item.status||'')}</b></button>`).join('')}</section>`).join('');
    els.workforceList.querySelectorAll('[data-workforce-ref]').forEach(btn=>btn.addEventListener('click',()=>{const item=items.find(row=>String(row.refId)===btn.dataset.workforceRef);if(!item)return;state.pendingWorkforce={kind:String(item.kind||'workforce'),refId:String(item.refId||''),title:String(item.title||'Workforce item').slice(0,120),subtitle:String(item.subtitle||'').slice(0,180),status:String(item.status||'').slice(0,60),date:String(item.date||'').slice(0,24)};els.workforcePop.hidden=true;renderPendingShare();els.composer?.focus();}));
  }
  function resetPollForm(){if(els.pollQuestion)els.pollQuestion.value='';if(els.pollStatus)els.pollStatus.textContent='';if(els.pollOptions)els.pollOptions.innerHTML='<label><span>Option 1</span><input type="text" maxlength="80" data-chat-poll-option placeholder="Add an option"></label><label><span>Option 2</span><input type="text" maxlength="80" data-chat-poll-option placeholder="Add an option"></label>';syncPollAddButton();}
  function syncPollAddButton(){if(!els.pollAddOption||!els.pollOptions)return;els.pollAddOption.disabled=els.pollOptions.querySelectorAll('[data-chat-poll-option]').length>=6;}
  function openPollCreator(){if(state.activeConversation?.type!=='team'){showToast('Polls are available in POD group channels.',true);return;}closeComposerMenus('poll');resetPollForm();els.pollPop.hidden=false;requestAnimationFrame(()=>els.pollQuestion?.focus());}
  function addPollOption(){if(!els.pollOptions)return;const count=els.pollOptions.querySelectorAll('[data-chat-poll-option]').length;if(count>=6)return;const label=document.createElement('label');label.innerHTML=`<span>Option ${count+1}</span><input type="text" maxlength="80" data-chat-poll-option placeholder="Add an option">`;els.pollOptions.appendChild(label);syncPollAddButton();label.querySelector('input')?.focus();}
  async function createPoll(){
    if(state.pollBusy||state.activeConversation?.type!=='team')return;const question=String(els.pollQuestion?.value||'').trim();const options=[...(els.pollOptions?.querySelectorAll('[data-chat-poll-option]')||[])].map(input=>String(input.value||'').trim()).filter(Boolean);
    if(question.length<4){els.pollStatus.textContent='Enter a question with at least 4 characters.';return;}if(options.length<2){els.pollStatus.textContent='Add at least two options.';return;}
    state.pollBusy=true;els.pollCreate.disabled=true;els.pollStatus.textContent='Creating poll…';try{const sent=await sendMessage(null,{poll:{question,options:options.slice(0,6)}});if(sent){els.pollPop.hidden=true;resetPollForm();}else els.pollStatus.textContent='Could not create the poll. Check the message above and try again.';}catch(error){els.pollStatus.textContent=error.message||'Could not create poll.';}finally{state.pollBusy=false;els.pollCreate.disabled=false;}
  }
  function handleComposerAction(event){const btn=event.target.closest('[data-chat-compose-action]');if(!btn||btn.disabled)return;const action=btn.dataset.chatComposeAction;els.actionMenu.hidden=true;els.actionBtn.setAttribute('aria-expanded','false');if(action==='upload')requestFile('all');else if(action==='workforce')openWorkforcePicker();else if(action==='poll')openPollCreator();}
  function cacheEls(){Object.assign(els,{mealPending:$('ttChatMealPending'),launch:$('workspaceChatBtn'),launchBadge:$('workspaceChatBadge'),overlay:$('ttWorkspaceChatOverlay'),shell:$('ttWorkspaceChatShell'),close:$('ttChatClose'),live:$('ttChatLive'),convList:$('ttChatConversationList'),peopleBtn:$('ttChatNewDm'),peopleList:$('ttChatPeople'),search:$('ttChatSearch'),searchClear:$('ttChatSearchClear'),searchResults:$('ttChatSearchResults'),threadTitle:$('ttChatThreadTitle'),threadSub:$('ttChatThreadSub'),messages:$('ttChatMessages'),older:$('ttChatLoadOlder'),newMessages:$('ttChatNewMessages'),typing:$('ttChatTyping'),composerWrap:$('ttChatComposerWrap'),composer:$('ttChatComposer'),mentionPop:$('ttChatMentionPop'),dropZone:$('ttChatDropZone'),send:$('ttChatSend'),actionBtn:$('ttChatActionBtn'),actionMenu:$('ttChatActionMenu'),gifBtn:$('ttChatGifBtn'),gifPop:$('ttChatGifPop'),gifClose:$('ttChatGifClose'),gifSearch:$('ttChatGifSearch'),gifStatus:$('ttChatGifStatus'),gifGrid:$('ttChatGifGrid'),fileInput:$('ttChatFileInput'),pendingShare:$('ttChatPendingShare'),workforcePop:$('ttChatWorkforcePop'),workforceClose:$('ttChatWorkforceClose'),workforceList:$('ttChatWorkforceList'),pollPop:$('ttChatPollPop'),pollClose:$('ttChatPollClose'),pollQuestion:$('ttChatPollQuestion'),pollOptions:$('ttChatPollOptions'),pollAddOption:$('ttChatPollAddOption'),pollCreate:$('ttChatPollCreate'),pollStatus:$('ttChatPollStatus'),emojiBtn:$('ttChatEmojiBtn'),emojiPop:$('ttChatEmojiPop'),welcome:$('ttChatWelcome'),toast:$('ttChatToast'),threadPanel:$('ttChatThreadPanel'),threadRoot:$('ttChatThreadRoot'),threadReplies:$('ttChatThreadReplies'),threadOlder:$('ttChatThreadOlder'),threadLatest:$('ttChatThreadLatest'),threadComposer:$('ttChatThreadComposer'),threadMentionPop:$('ttChatThreadMentionPop'),threadSend:$('ttChatThreadSend'),threadClose:$('ttChatThreadClose'),mobileBack:$('ttChatMobileBack'),threadActions:$('ttChatThreadActions'),favoriteBtn:$('ttChatFavoriteBtn'),conversationSearchBtn:$('ttChatConversationSearchBtn'),conversationSearchPanel:$('ttChatConversationSearchPanel'),conversationSearchClose:$('ttChatConversationSearchClose'),conversationSearchInput:$('ttChatConversationSearchInput'),conversationSearchGo:$('ttChatConversationSearchGo'),conversationSearchStatus:$('ttChatConversationSearchStatus'),conversationSearchResults:$('ttChatConversationSearchResults'),conversationSearchPrev:$('ttChatConversationSearchPrev'),conversationSearchNext:$('ttChatConversationSearchNext'),conversationSearchTitle:$('ttChatConversationSearchTitle'),pinned:$('ttChatPinned'),pinnedView:$('ttChatPinnedView'),pinnedText:$('ttChatPinnedText'),pinnedMeta:$('ttChatPinnedMeta'),pinnedUnpin:$('ttChatPinnedUnpin'),notifyBtn:$('ttChatNotifyBtn'),notifyMenu:$('ttChatNotifyMenu'),voiceCallBtn:$('ttChatVoiceCallBtn'),videoCallBtn:$('ttChatVideoCallBtn'),callOverlay:$('ttVoiceCallOverlay'),callAvatar:$('ttVoiceCallAvatar'),callVideoStage:$('ttVoiceCallVideoStage'),callLocalVideo:$('ttVoiceCallLocalVideo'),callRemoteVideo:$('ttVoiceCallRemoteVideo'),callPlaybackResume:$('ttVoiceCallPlaybackResume'),callKicker:$('ttVoiceCallKicker'),callName:$('ttVoiceCallName'),callMeta:$('ttVoiceCallMeta'),callStatus:$('ttVoiceCallStatus'),callTimer:$('ttVoiceCallTimer'),callMinimize:$('ttVoiceCallMinimize'),callAccept:$('ttVoiceCallAccept'),callDecline:$('ttVoiceCallDecline'),callMute:$('ttVoiceCallMute'),callCamera:$('ttVoiceCallCamera'),callShare:$('ttVoiceCallShare'),callBlur:$('ttVoiceCallBlur'),callBlurNotice:$('ttVoiceCallBlurNotice'),callShareStage:$('ttVoiceCallShareStage'),callShareVideo:$('ttVoiceCallShareVideo'),callShareLabel:$('ttVoiceCallShareLabel'),callShareQuality:$('ttVoiceCallShareQuality'),callShareWaiting:$('ttVoiceCallShareWaiting'),callShareNotice:$('ttVoiceCallShareNotice'),callShareResume:$('ttVoiceCallShareResume'),callEnd:$('ttVoiceCallEnd'),callRemoteAudio:$('ttVoiceCallRemoteAudio'),governanceBtn:$('ttChatGovernanceBtn'),governancePanel:$('ttChatGovernancePanel'),governanceClose:$('ttChatGovernanceClose'),governanceContent:$('ttChatGovernanceContent'),accessTabBtn:$('ttChatAccessTabBtn'),reportDialog:$('ttChatReportDialog'),reportClose:$('ttChatReportClose'),reportSummary:$('ttChatReportSummary'),reportReason:$('ttChatReportReason'),reportNote:$('ttChatReportNote'),reportSubmit:$('ttChatReportSubmit')});}
  function bindUi(){
    // Image errors do not bubble, so capture them on the chat overlay.
    els.overlay?.addEventListener('error',event=>{
      const image=event.target;if(image?.tagName!=='IMG')return;
      const avatar=image.closest('.tt-wm-avatar[data-agent-avatar]');if(!avatar)return;
      const name=avatar.dataset.agentAvatar||'?';avatar.textContent=name.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();
    },true);

    els.actionBtn?.addEventListener('click',event=>{event.stopPropagation();const open=els.actionMenu.hidden;closeComposerMenus(open?'actions':'');els.actionMenu.hidden=!open;els.actionBtn.setAttribute('aria-expanded',open?'true':'false');});
    els.actionMenu?.addEventListener('click',handleComposerAction);
    els.gifBtn?.addEventListener('click',openGifPicker);
    els.gifClose?.addEventListener('click',()=>{els.gifPop.hidden=true;els.gifBtn?.setAttribute('aria-expanded','false');});
    els.gifSearch?.addEventListener('input',handleGifSearch);
    els.fileInput?.addEventListener('change',uploadSelectedFile);
    els.composer?.addEventListener('paste',handleComposerPaste);
    els.composerWrap?.addEventListener('dragenter',handleDragEnter);
    els.composerWrap?.addEventListener('dragover',handleDragOver);
    els.composerWrap?.addEventListener('dragleave',handleDragLeave);
    els.composerWrap?.addEventListener('drop',handleDrop);
    els.workforceClose?.addEventListener('click',()=>{els.workforcePop.hidden=true;});
    els.pollClose?.addEventListener('click',()=>{els.pollPop.hidden=true;});
    els.pollAddOption?.addEventListener('click',addPollOption);
    els.pollCreate?.addEventListener('click',createPoll);
    document.addEventListener('mousedown',event=>{if(els.overlay?.hidden)return;const within=event.target.closest?.('.tt-wm-action-anchor,.tt-wm-workforce-pop,.tt-wm-poll-pop,.tt-wm-emoji-anchor,.tt-wm-gif-anchor,.tt-wm-gif-pop');if(!within)closeComposerMenus();});
    syncComposerCapabilities();renderPendingShare();
    els.older?.addEventListener('click',loadOlderMessages);
    els.newMessages?.addEventListener('click',goToLatest);
    els.messages?.addEventListener('scroll',()=>{if(atMessageBottom()&&!state.historyContext){state.hasNewMessages=false;updateHistoryControls();markRead();}},{passive:true});
    els.messages?.addEventListener('wheel',event=>{if(event.deltaY<0)releaseLatestMessageAnchor();},{passive:true});
    els.messages?.addEventListener('touchmove',()=>releaseLatestMessageAnchor(),{passive:true});
    els.messages?.addEventListener('load',event=>{if(event.target?.tagName==='IMG')repinLatestAfterAsyncLayout();},true);
    bindThreadMessageActions();decorateMentions(els.threadRoot);decorateMentions(els.threadReplies);
    bindMessageContextActions();bindMessageEditControls();
    els.threadOlder?.addEventListener('click',loadOlderReplies);
    els.threadLatest?.addEventListener('click',()=>{state.threadPageEpoch++;state.threadCursor=null;state.threadLoadingOlder=false;loadThreadReplies('',true);});
    els.threadReplies?.addEventListener('scroll',()=>markRead(),{passive:true});
    els.shell?.addEventListener('click',event=>{const target=event.target.closest?.('[data-chat-profile-name]');if(!target||!els.shell.contains(target))return;event.preventDefault();event.stopPropagation();try{target.focus({preventScroll:true});}catch(_){}openChatProfile(target.dataset.chatProfileUid||'',target.dataset.chatProfileName||'',target.dataset.chatProfileSource||'workspace-message');});
    els.shell?.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const target=event.target.closest?.('[data-chat-profile-name]');if(!target||!els.shell.contains(target))return;event.preventDefault();event.stopPropagation();openChatProfile(target.dataset.chatProfileUid||'',target.dataset.chatProfileName||'',target.dataset.chatProfileSource||'workspace-message');});
els.launch?.addEventListener('click',openChat);els.close?.addEventListener('click',closeChat);els.voiceCallBtn?.addEventListener('click',startVoiceCall);els.videoCallBtn?.addEventListener('click',startVideoCall);els.callMinimize?.addEventListener('click',toggleVoiceCallMinimized);els.callAccept?.addEventListener('click',acceptVoiceCall);els.callDecline?.addEventListener('click',declineVoiceCall);els.callMute?.addEventListener('click',toggleVoiceMute);els.callCamera?.addEventListener('click',toggleCallCamera);els.callShare?.addEventListener('click',toggleScreenShare);els.callBlur?.addEventListener('click',toggleBackgroundBlur);els.callShareResume?.addEventListener('click',()=>{els.callShareVideo?.play?.().then(()=>{els.callShareResume.hidden=true;}).catch(()=>{});});els.callPlaybackResume?.addEventListener('click',resumeRemoteCallMedia);els.callEnd?.addEventListener('click',()=>finishVoiceCall(state.call?.connectedAt?'ended':'canceled',{notifyPeer:true}));els.overlay?.addEventListener('mousedown',e=>{if(e.target===els.overlay)closeChat();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!els.overlay?.hidden){if(els.actionMenu&&!els.actionMenu.hidden||els.workforcePop&&!els.workforcePop.hidden||els.pollPop&&!els.pollPop.hidden||els.emojiPop&&!els.emojiPop.hidden||els.gifPop&&!els.gifPop.hidden)closeComposerMenus();else if(!els.reportDialog?.hidden)closeReport();else if(!els.governancePanel?.hidden)closeGovernance();else if(!els.notifyMenu?.hidden){els.notifyMenu.hidden=true;els.notifyBtn?.setAttribute('aria-expanded','false');}else if(state.conversationSearchOpen)closeConversationSearch();else if(!els.threadPanel?.hidden)closeThread();else if(state.peopleOpen){state.peopleOpen=false;els.peopleList.hidden=true;}else closeChat();}});els.peopleBtn?.addEventListener('click',()=>{state.peopleOpen=!state.peopleOpen;els.peopleList.hidden=!state.peopleOpen;renderPeople();});els.favoriteBtn?.addEventListener('click',toggleConversationFavorite);els.conversationSearchBtn?.addEventListener('click',toggleConversationSearch);els.conversationSearchClose?.addEventListener('click',closeConversationSearch);els.conversationSearchGo?.addEventListener('click',runConversationSearch);els.conversationSearchInput?.addEventListener('input',()=>{if(!els.conversationSearchInput.value.trim()){state.conversationSearchQuery='';resetConversationSearchResults();renderConversationSearch();}});els.conversationSearchInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runConversationSearch();}else if(event.key==='Escape'){event.preventDefault();closeConversationSearch();}});els.conversationSearchPrev?.addEventListener('click',()=>moveConversationSearch(-1));els.conversationSearchNext?.addEventListener('click',()=>moveConversationSearch(1));els.search?.addEventListener('input',previewSearch);els.search?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runSearch();}else if(e.key==='Escape'){e.preventDefault();els.search.value='';closeSearch();}});els.searchClear?.addEventListener('click',()=>{els.search.value='';closeSearch();els.search.focus();});els.composer?.addEventListener('input',e=>{typingInput();renderMentionMenu(e.currentTarget);});els.composer?.addEventListener('input',podSlashOnInput);els.composer?.addEventListener('keydown',podSlashOnKeydown,true);els.composer?.addEventListener('blur',()=>{setTimeout(()=>{if(document.activeElement!==els.composer)podSlashHide();},80);});els.convList?.addEventListener('click',podSlashHide);els.send?.addEventListener('click',podSlashHide);document.addEventListener('pointerdown',event=>{if(podSlashMenu&&!podSlashMenu.hidden&&!podSlashMenu.contains(event.target)&&event.target!==els.composer)podSlashHide();});els.composer?.addEventListener('keydown',e=>{if(handleMentionKeydown(e,els.composer))return;if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendMessage();}});els.send?.addEventListener('click',()=>sendMessage());els.emojiBtn?.addEventListener('click',()=>{const open=els.emojiPop.hidden;closeComposerMenus(open?'emoji':'');els.emojiPop.hidden=!open;});els.threadSend?.addEventListener('click',sendThreadReply);els.threadComposer?.addEventListener('input',e=>{saveThreadDraft();renderMentionMenu(e.currentTarget);});els.threadComposer?.addEventListener('keydown',e=>{if(handleMentionKeydown(e,els.threadComposer))return;if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendThreadReply();}});els.threadClose?.addEventListener('click',closeThread);els.mobileBack?.addEventListener('click',mobileBack);els.pinnedView?.addEventListener('click',()=>{const id=state.activeConversation?.pinnedMessageId;if(id)openConversation(state.activeConversationId,{messageId:id});});els.pinnedUnpin?.addEventListener('click',event=>{event.stopPropagation();const id=state.activeConversation?.pinnedMessageId;if(id)pinMessage(id,'unpin');});els.notifyBtn?.addEventListener('click',()=>{const open=els.notifyMenu.hidden;els.notifyMenu.hidden=!open;els.notifyBtn.setAttribute('aria-expanded',open?'true':'false');});els.notifyMenu?.querySelectorAll('[data-notify-mode]').forEach(btn=>btn.addEventListener('click',()=>setNotificationMode(btn.dataset.notifyMode)));els.governanceBtn?.addEventListener('click',()=>openGovernance('reports'));els.governanceClose?.addEventListener('click',closeGovernance);els.governancePanel?.querySelectorAll('[data-gov-tab]').forEach(btn=>btn.addEventListener('click',async()=>{state.governanceTab=btn.dataset.govTab;renderGovernanceTabs();await loadGovernance();}));els.reportClose?.addEventListener('click',closeReport);els.reportSubmit?.addEventListener('click',submitReport);els.reportDialog?.addEventListener('mousedown',e=>{if(e.target===els.reportDialog)closeReport();});bindMentionPop(els.mentionPop);bindMentionPop(els.threadMentionPop);buildEmoji();}
  async function backgroundBootstrap(){
    showLaunchIfSession();if(!legacySessionActive()||(!pageVisible()&&!callReachabilityWindowOpen()))return;loadLegacyIdentity();const user=currentFirebaseUser();if(!isPermanentUser(user)&&!state.legacyIdentityToken)return;
    try{bumpMetric('backgroundBadgeRefreshes');if(!state.sessionToken||state.sessionExpiresAt-Date.now()<60000)await bootstrap(false,{connectRealtime:true});else{await refreshInbox();if(realtimeDesired()&&!state.socketConnected&&!state.socketConnecting)await connectSocket();}}catch(_){}
  }
  function scheduleBackgroundBadgeRefresh(delay=BACKGROUND_BADGE_REFRESH_MS){clearTimeout(state.backgroundBadgeTimer);state.backgroundBadgeTimer=0;if(!legacySessionActive()||(!pageVisible()&&!callReachabilityWindowOpen()))return;state.backgroundBadgeTimer=setTimeout(async()=>{state.backgroundBadgeTimer=0;await backgroundBootstrap();if(!state.socketConnected)scheduleBackgroundBadgeRefresh(BACKGROUND_BADGE_REFRESH_MS);},Math.max(1000,delay));}
  function pauseRealtimeForHiddenTab(){clearTimeout(state.hiddenSocketTimer);state.hiddenSocketTimer=setTimeout(()=>{state.hiddenSocketTimer=0;if(!pageVisible()&&!callNeedsRealtime()){disconnectSocket(false);clearTimeout(state.refreshTimer);state.refreshTimer=0;setLive(false,'Paused');}},HIDDEN_SOCKET_GRACE_MS);}
  function resumeRealtimeForVisibleTab(){state.lastVisibleAt=Date.now();clearTimeout(state.hiddenSocketTimer);state.hiddenSocketTimer=0;if(!legacySessionActive())return;bootstrap(false,{connectRealtime:true}).then(()=>socketRefresh(state.activeConversationId)).catch(()=>scheduleBackgroundBadgeRefresh(5000));}
  let bioRefreshBusy=false;
  function startBioRefresh(){setInterval(async()=>{if(bioRefreshBusy||!pageVisible()||!legacySessionActive()||!state.sessionToken||els.overlay?.hidden)return;
    const id=state.activeConversationId,generation=state.viewEpoch;
    const ids=[...document.querySelectorAll('[data-bio-message]')].map(el=>el.dataset.bioMessage).slice(0,30);
    if(!id||!ids.length)return;
    bioRefreshBusy=true;try{const data=await api(`/api/chat/conversations/${encodeURIComponent(id)}/bio-breaks?`+new URLSearchParams({ids:ids.join(',')}));if(viewIsCurrent(id,generation)){state.messages=mergeMessages(state.messages,data.messages||[]);renderMessages(false);}}catch(_){}finally{bioRefreshBusy=false;}
  },30000);}
  function applyCanonicalDisplayName(uid,name,reconnectSelf=false){
    const targetUid=String(uid||''),canonical=String(name||'').trim();if(!targetUid||!canonical)return false;
    let changed=false;
    if(state.actor?.uid===targetUid&&state.actor.name!==canonical){state.actor={...state.actor,name:canonical};changed=true;}
    const person=state.people.find(item=>String(item?.uid||'')===targetUid);if(person&&person.name!==canonical){person.name=canonical;changed=true;}
    const mention=state.mentionPeople.find(item=>String(item?.uid||'')===targetUid);if(mention&&mention.name!==canonical){mention.name=canonical;changed=true;}
    for(const item of [...state.messages,...state.threadReplies])if(String(item?.senderUid||'')===targetUid&&item.senderName!==canonical){item.senderName=canonical;changed=true;}
    for(const receipt of state.readReceipts)if(String(receipt?.uid||'')===targetUid&&receipt.readerName!==canonical){receipt.readerName=canonical;changed=true;}
    for(const conv of state.conversations){if(conv?.memberNames&&String(conv.memberNames[targetUid]||'')!==canonical&&Object.prototype.hasOwnProperty.call(conv.memberNames,targetUid)){conv.memberNames[targetUid]=canonical;changed=true;}if(conv?.type==='direct'&&directPeerUid(conv)===targetUid&&conv.title!==canonical){conv.title=canonical;changed=true;}}
    if(state.call?.peerUid===targetUid&&state.call.peerName!==canonical){state.call.peerName=canonical;renderVoiceCall();changed=true;}
    const shouldReconnect=reconnectSelf&&state.actor?.uid===targetUid&&realtimeDesired();
    if(changed){try{renderSidebar();if(state.peopleOpen)renderPeople();if(state.searchOpen&&els.search)previewSearch();if(state.activeConversation){renderThreadHeader();renderMessages(false);}if(state.threadRoot&&!els.threadPanel?.hidden){renderThreadRoot();renderThreadReplies();}if(state.conversationSearchOpen)renderConversationSearch();}catch(_){}}
    if(shouldReconnect){disconnectSocket(false);void connectSocket().catch(()=>{});}
    return changed||shouldReconnect;
  }
  function refreshRewardSurfaces(){try{renderSidebar();if(state.peopleOpen)renderPeople();if(state.searchOpen&&els.search)previewSearch();if(state.activeConversation){renderThreadHeader();renderMessages(false);}if(state.threadRoot&&!els.threadPanel?.hidden){renderThreadRoot();renderThreadReplies();}}catch(_){}}
  function init(){startBioRefresh();cacheEls();syncSearchClear();if(!els.launch||!els.overlay)return;loadLegacyIdentity();bindUi();showLaunchIfSession();setInterval(showLaunchIfSession,1500);clearInterval(state.inboxFallbackTimer);state.inboxFallbackTimer=setInterval(()=>{if(realtimeDesired()&&state.sessionToken&&!state.socketConnected){bumpMetric('fallbackRefreshes');socketRefresh(state.activeConversationId);}},DISCONNECTED_FALLBACK_MS);scheduleBackgroundBadgeRefresh(BACKGROUND_BADGE_INITIAL_MS);try{window.firebase?.auth?.().onAuthStateChanged?.(user=>{const uid=user?.uid||'';if(state.authUid!==undefined&&state.authUid!==uid)clearLegacyIdentity();state.authUid=uid;if(user&&legacySessionActive())backgroundBootstrap().catch(()=>scheduleBackgroundBadgeRefresh(2500));else scheduleBackgroundBadgeRefresh(BACKGROUND_BADGE_INITIAL_MS);});}catch(_){}document.addEventListener('visibilitychange',()=>{if(pageVisible())resumeRealtimeForVisibleTab();else pauseRealtimeForHiddenTab();});window.addEventListener('online',()=>{if(pageVisible()||callReachabilityWindowOpen())bootstrap(false,{connectRealtime:true}).catch(()=>scheduleBackgroundBadgeRefresh(2500));});window.addEventListener('offline',()=>{disconnectSocket(false);setLive(false,'Offline');});window.addEventListener('trinotime:reward-projections-updated',refreshRewardSurfaces,{passive:true});window.addEventListener('trinotime:admin-profile-updated',event=>{const profile=event?.detail?.profile||{};applyCanonicalDisplayName(state.actor?.uid,profile.displayName,true);},{passive:true});window.addEventListener('pagehide',()=>{if(state.call)sendSocket({type:'call.end',callId:state.call.callId,conversationId:state.call.conversationId,reason:'page-hidden'});});window.TrinoTimeWorkspaceMessaging=Object.freeze({release:RELEASE,open:openChat,openDirectByName,canDirectByName,refresh:()=>bootstrap(true,{connectRealtime:pageVisible()||callNeedsRealtime()}),refreshRewardSurfaces,establishLegacyIdentity,clearIdentity:clearLegacyIdentity,syncLauncher:showLaunchIfSession,quotaMetrics:quotaSnapshot,startVoiceCall});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
