    (function () {
        'use strict';

        const AI_ENDPOINT_KEY = 'trinotime_ai_chat_endpoint_v1';
        const AI_MAX_HISTORY = 10;
        const aiState = { endpoint:'', messages:[], busy:false, configured:false, loaded:false, controller:null, requestSeq:0, sessionEpoch:null };

        const byId = (id) => document.getElementById(id);

        function aiBridge() {
            return window.TrinoTimeAiBridge || null;
        }

        function aiSessionContext() {
            try {
                const bridge = aiBridge();
                if (bridge && typeof bridge.getSession === 'function') {
                    const value = bridge.getSession();
                    if (value && typeof value === 'object') return value;
                }
            } catch (_) {}
            // Fallback signal only: Leave Request is already safely controlled by
            // the core session logic. This avoids touching private auth variables.
            const leaveFloater = byId('leaveRequestFloater');
            return { active: !!(leaveFloater && !leaveFloater.hidden), admin:false, role:'user' };
        }

        function aiSessionActive() { return !!aiSessionContext().active; }
        function aiIsAdmin() { return !!aiSessionContext().admin; }
        function aiRoleLabel() { return aiSessionContext().role || 'user'; }

        function resetAiConversationForSession(nextEpoch) {
            aiState.requestSeq += 1;
            if (aiState.controller) { try { aiState.controller.abort(); } catch (_) {} aiState.controller = null; }
            aiState.busy = false;
            aiState.messages = [];
            aiState.sessionEpoch = nextEpoch;
            const messages = byId('aiChatMessages');
            if (messages) messages.textContent = '';
            aiSetBusy(false);
            const panel = byId('aiChatPanel');
            if (panel && panel.classList.contains('open')) aiWelcome();
        }

        let aiScrollFrame = 0;
        let aiInputResizeFrame = 0;

        function scheduleAiScrollToBottom() {
            if (aiScrollFrame) return;
            aiScrollFrame = requestAnimationFrame(() => {
                aiScrollFrame = 0;
                const messages = byId('aiChatMessages');
                if (messages) messages.scrollTop = messages.scrollHeight;
            });
        }

        function scheduleAiInputResize(input) {
            if (!input || aiInputResizeFrame) return;
            aiInputResizeFrame = requestAnimationFrame(() => {
                aiInputResizeFrame = 0;
                input.style.height = 'auto';
                input.style.height = Math.min(112, input.scrollHeight) + 'px';
            });
        }

        function applyAiPermissions() {
            const admin = aiIsAdmin();
            const settings = byId('aiChatSettingsBtn');
            const setup = byId('aiChatSetup');
            const endpointInput = byId('aiChatEndpointInput');
            const save = byId('aiChatSaveEndpointBtn');
            const test = byId('aiChatTestEndpointBtn');
            if (settings) settings.hidden = !admin;
            if (!admin && setup) setup.classList.remove('show');
            if (endpointInput) endpointInput.disabled = !admin;
            if (save) save.disabled = !admin;
            if (test) test.disabled = !admin;
            if (setup) setup.setAttribute('aria-hidden', admin && setup.classList.contains('show') ? 'false' : 'true');
            return admin;
        }

        function normalizeAiEndpoint(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            try {
                const url = new URL(raw);
                const isLocal = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
                if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) return '';
                url.hash = '';
                url.search = '';
                let path = url.pathname.replace(/\/+$/,'');
                if (!path || path === '/') path = '/api/chat';
                else if (!path.endsWith('/api/chat')) path += '/api/chat';
                url.pathname = path;
                return url.toString();
            } catch (_) { return ''; }
        }

        function aiHealthUrl(endpoint) {
            try {
                const url = new URL(endpoint);
                url.pathname = url.pathname.replace(/\/api\/chat\/?$/, '/health');
                url.search = ''; url.hash = '';
                return url.toString();
            } catch (_) { return ''; }
        }

        function setAiStatus(kind, text) {
            const status = byId('aiChatStatus');
            const label = byId('aiChatStatusText');
            if (status) { status.classList.remove('ready','error'); if (kind) status.classList.add(kind); }
            if (label) label.textContent = String(text || '');
        }

        function trimAiChatHistory() {
            const maxStored = 24;
            if (aiState.messages.length > maxStored) aiState.messages.splice(0, aiState.messages.length - maxStored);
            const messages = byId('aiChatMessages');
            if (!messages) return;
            const nodes = Array.from(messages.querySelectorAll('.ai-chat-message'));
            if (nodes.length > 50) nodes.slice(0, nodes.length - 50).forEach(node => node.remove());
        }

        function aiAddMessage(role, content, options = {}) {
            const messages = byId('aiChatMessages');
            if (!messages) return null;
            const el = document.createElement('div');
            el.className = 'ai-chat-message ' + role + (options.pending ? ' pending' : '');
            el.textContent = String(content || '');
            messages.appendChild(el);
            trimAiChatHistory();
            scheduleAiScrollToBottom();
            return el;
        }

        function aiWelcome() {
            const messages = byId('aiChatMessages');
            if (!messages || messages.childElementCount) return;
            aiAddMessage('assistant', 'Hi — I’m TrinoTime AI. I can help explain leave workflows, timekeeping steps, draft professional messages, and answer general work questions. I do not automatically receive employee records or HR documents.');
            aiAddMessage('system', 'Keep sensitive HR, medical, payroll, passwords, and API keys out of AI chat.');
        }

        function aiSetBusy(busy) {
            aiState.busy = !!busy;
            const send = byId('aiChatSendBtn');
            const input = byId('aiChatInput');
            if (send) send.disabled = aiState.busy || !aiState.configured;
            if (input) input.disabled = aiState.busy || !aiState.configured;
        }

        async function loadAiEndpoint(force = false) {
            if (aiState.loaded && !force) return aiState.endpoint;
            let saved = '';
            try { saved = localStorage.getItem(AI_ENDPOINT_KEY) || ''; } catch (_) {}
            try {
                const bridge = aiBridge();
                if (bridge && typeof bridge.getConfig === 'function') {
                    const remote = await bridge.getConfig(AI_ENDPOINT_KEY);
                    if (remote) saved = String(remote);
                }
            } catch (_) {}
            aiState.endpoint = normalizeAiEndpoint(saved);
            aiState.configured = !!aiState.endpoint;
            aiState.loaded = true;
            const input = byId('aiChatEndpointInput');
            if (input) input.value = aiState.endpoint;
            setAiStatus(aiState.configured ? 'ready' : 'error', aiState.configured ? 'Free AI proxy ready' : 'Admin setup required');
            aiSetBusy(false);
            return aiState.endpoint;
        }

        async function saveAiEndpoint() {
            if (!aiIsAdmin()) return;
            const input = byId('aiChatEndpointInput');
            const note = byId('aiChatSetupNote');
            const endpoint = normalizeAiEndpoint(input && input.value);
            if (!endpoint) {
                if (note) note.textContent = 'Enter a valid HTTPS Worker URL. Example: https://trinotime-ai.your-subdomain.workers.dev/api/chat';
                setAiStatus('error','Invalid endpoint');
                return;
            }
            try {
                const bridge = aiBridge();
                if (bridge && typeof bridge.setConfig === 'function') {
                    const result = await bridge.setConfig(AI_ENDPOINT_KEY, endpoint);
                    if (result && result.denied) {
                        applyAiPermissions();
                        if (note) note.textContent = 'Only an Admin account can change the shared AI endpoint.';
                        return;
                    }
                }
            } catch (_) {}
            aiState.endpoint = endpoint; aiState.configured = true; aiState.loaded = true;
            try { localStorage.setItem(AI_ENDPOINT_KEY, endpoint); } catch (_) {}
            if (input) input.value = endpoint;
            if (note) note.textContent = 'Saved. This public endpoint URL can sync through TrinoTime; the Groq API key remains only in Cloudflare.';
            setAiStatus('ready','Free AI proxy ready');
            aiSetBusy(false);
            if (typeof showToast === 'function') showToast('AI chat endpoint saved.');
        }

        async function testAiEndpoint() {
            if (!aiIsAdmin()) return;
            const input = byId('aiChatEndpointInput');
            const note = byId('aiChatSetupNote');
            const endpoint = normalizeAiEndpoint(input && input.value) || aiState.endpoint;
            if (!endpoint) { if (note) note.textContent = 'Save a valid endpoint first.'; return; }
            const health = aiHealthUrl(endpoint);
            try {
                setAiStatus('', 'Testing proxy…');
                const response = await fetch(health, { method:'GET', cache:'no-store', mode:'cors' });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || data.ok === false) throw new Error(data.error || 'Proxy health check failed.');
                setAiStatus('ready', (data.provider || 'AI') + ' ready');
                if (note) note.textContent = 'Connection successful' + (data.model ? ' · ' + data.model : '') + '.';
            } catch (error) {
                setAiStatus('error','Proxy unreachable');
                if (note) note.textContent = 'Could not reach the proxy. Check its URL and ALLOWED_ORIGINS setting.';
            }
        }

        function aiRequestMessages() {
            return aiState.messages.slice(-AI_MAX_HISTORY).map((message) => ({ role:message.role, content:message.content }));
        }

        async function sendAiMessage(text) {
            const content = String(text || '').trim();
            if (!content || aiState.busy) return;
            if (!aiState.configured) {
                if (aiIsAdmin()) byId('aiChatSetup')?.classList.add('show');
                aiAddMessage('system', aiIsAdmin() ? 'Configure the free AI proxy endpoint first.' : 'AI chat has not been configured by Admin yet.');
                return;
            }
            if (content.length > 3000) return;
            aiState.messages.push({ role:'user', content }); trimAiChatHistory();
            aiAddMessage('user', content);
            const input = byId('aiChatInput');
            if (input) { input.value=''; input.style.height='auto'; }
            const pending = aiAddMessage('assistant','Thinking…',{pending:true});
            aiSetBusy(true);
            setAiStatus('', 'Generating…');
            const requestSeq = ++aiState.requestSeq;
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            aiState.controller = controller;
            const timer = controller ? setTimeout(() => controller.abort(), 45000) : null;
            try {
                const response = await fetch(aiState.endpoint, {
                    method:'POST',
                    mode:'cors',
                    cache:'no-store',
                    headers:{ 'Content-Type':'application/json' },
                    body:JSON.stringify({
                        messages:aiRequestMessages(),
                        context:{ role:aiRoleLabel(), appVersion:(document.querySelector('meta[name="trinotime-version"]')||{}).content || '' }
                    }),
                    signal:controller ? controller.signal : undefined
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const err = new Error(data.error || (response.status === 429 ? 'The free AI limit was reached. Try again later.' : 'AI request failed.'));
                    err.status = response.status;
                    throw err;
                }
                if (requestSeq !== aiState.requestSeq) return;
                const reply = String(data.reply || '').trim();
                if (!reply) throw new Error('The AI returned an empty response.');
                aiState.messages.push({ role:'assistant', content:reply }); trimAiChatHistory();
                if (pending) { pending.classList.remove('pending'); pending.textContent=reply; }
                setAiStatus('ready', (data.provider || 'AI') + ' · free tier');
            } catch (error) {
                if (requestSeq !== aiState.requestSeq) return;
                const message = error && error.name === 'AbortError' ? 'The AI request timed out. Please try again.' : (error && error.message ? error.message : 'Could not reach the AI service.');
                if (pending) { pending.classList.remove('pending'); pending.textContent=message; }
                setAiStatus('error', error && error.status === 429 ? 'Free limit reached' : 'AI unavailable');
            } finally {
                if (timer) clearTimeout(timer);
                if (requestSeq === aiState.requestSeq) {
                    aiState.controller = null;
                    aiSetBusy(false);
                    scheduleAiScrollToBottom();
                    if (input && !input.disabled) requestAnimationFrame(() => input.focus());
                }
            }
        }

        function openAiChat() {
            try { if (window.TrinoTimeProfileDirectory && typeof window.TrinoTimeProfileDirectory.closeSearch === 'function') window.TrinoTimeProfileDirectory.closeSearch({ returnFocus:false }); } catch (_) {}
            if (!aiSessionActive()) return;
            const panel = byId('aiChatPanel'); const floater = byId('aiChatFloater');
            if (!panel) return;
            panel.classList.add('open'); panel.setAttribute('aria-hidden','false');
            if (floater) floater.setAttribute('aria-expanded','true');
            aiWelcome();
            applyAiPermissions();
            loadAiEndpoint(false).then(() => {
                const admin = applyAiPermissions();
                const setup = byId('aiChatSetup');
                if (setup && admin && !aiState.configured) {
                    setup.classList.add('show');
                    setup.setAttribute('aria-hidden','false');
                }
                const input = byId('aiChatInput');
                if (input && aiState.configured) requestAnimationFrame(() => input.focus());
            });
        }

        function closeAiChat() {
            const panel = byId('aiChatPanel'); const floater = byId('aiChatFloater');
            if (panel) { panel.classList.remove('open'); panel.setAttribute('aria-hidden','true'); }
            if (floater) floater.setAttribute('aria-expanded','false');
        }

        window.syncAiChatUi = function syncAiChatUi() {
            const session = aiSessionContext();
            const active = !!session.active;
            const epoch = Number.isFinite(Number(session.epoch)) ? Number(session.epoch) : null;
            if (epoch !== null) {
                if (aiState.sessionEpoch === null) aiState.sessionEpoch = epoch;
                else if (epoch !== aiState.sessionEpoch) resetAiConversationForSession(epoch);
            }
            const floater = byId('aiChatFloater');
            if (floater) floater.hidden = !active;
            applyAiPermissions();
            if (!active) closeAiChat();
        };

        function initAiChat() {
            const floater=byId('aiChatFloater'), close=byId('aiChatCloseBtn'), form=byId('aiChatForm'), input=byId('aiChatInput');
            if (!floater || !form || !input) return;
            floater.addEventListener('click', () => byId('aiChatPanel')?.classList.contains('open') ? closeAiChat() : openAiChat());
            if (close) close.addEventListener('click', closeAiChat);
            byId('aiChatClearBtn')?.addEventListener('click', () => {
                aiState.requestSeq += 1;
                if (aiState.controller) { try { aiState.controller.abort(); } catch (_) {} aiState.controller = null; }
                aiState.busy = false;
                aiState.messages=[];
                const messages=byId('aiChatMessages'); if(messages) messages.textContent='';
                aiSetBusy(false);
                setAiStatus(aiState.configured ? 'ready' : 'error', aiState.configured ? 'Free AI proxy ready' : 'Admin setup required');
                aiWelcome();
            });
            byId('aiChatSettingsBtn')?.addEventListener('click', () => {
                if (!applyAiPermissions()) return;
                const setup = byId('aiChatSetup');
                if (!setup) return;
                setup.classList.toggle('show');
                setup.setAttribute('aria-hidden', setup.classList.contains('show') ? 'false' : 'true');
            });
            byId('aiChatSaveEndpointBtn')?.addEventListener('click', () => void saveAiEndpoint());
            byId('aiChatTestEndpointBtn')?.addEventListener('click', () => void testAiEndpoint());
            form.addEventListener('submit', (event) => { event.preventDefault(); void sendAiMessage(input.value); });
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
            });
            input.addEventListener('input', () => scheduleAiInputResize(input));
            document.querySelectorAll('[data-ai-prompt]').forEach((chip) => chip.addEventListener('click', () => {
                const prompt=chip.getAttribute('data-ai-prompt')||''; if(prompt) void sendAiMessage(prompt);
            }));
            document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && byId('aiChatPanel')?.classList.contains('open')) closeAiChat(); });
            window.addEventListener('online', () => { if(aiState.configured) setAiStatus('ready','Free AI proxy ready'); });
            window.addEventListener('offline', () => setAiStatus('error','Offline'));
            const sessionSignal = byId('leaveRequestFloater');
            if (sessionSignal && typeof MutationObserver === 'function') {
                new MutationObserver(() => syncAiChatUi()).observe(sessionSignal, { attributes:true, attributeFilter:['hidden'] });
            }
            const syncAiWhenVisible = () => { if (document.visibilityState !== 'hidden') syncAiChatUi(); };
            // Session/role changes are event-driven through the launcher signal. Keep
            // only a low-frequency safety sync instead of waking the main thread
            // every 1.5 seconds while the assistant is closed.
            setInterval(syncAiWhenVisible, 8000);
            window.addEventListener('focus', syncAiWhenVisible, { passive:true });
            document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAiChatUi(); }, { passive:true });
            syncAiChatUi();
        }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAiChat, { once:true });
        else initAiChat();
    })();
    
