/* TheStarth — AI assistant on the site (round button bottom-right).
 * Answers questions about TheStarth through the same AI helper as the mock tests (worker/mock-ai-worker.js, mode "assistant").
 * Address of the helper: window.MOCK_AI_URL in mock-config.js. While it is empty the button is not shown at all.
 * Voice: the microphone uses the browser's speech recognition; answers can be read aloud with the browser's voice
 * (works in Chrome / Edge / Safari; where there is no voice for the language the speaker button simply hides).
 */
(function () {
    'use strict';
    if (window.__starthAssistant) return; window.__starthAssistant = true;

    const L = {
        ru: { open: 'Задать вопрос', title: 'Помощник TheStarth', sub: 'Отвечу на вопросы о курсах, ценах и учителях',
            hi: 'Привет! Я помощник TheStarth. Спросите про курсы, цены, учителей или как записаться на бесплатный урок.',
            ph: 'Напишите вопрос…', send: 'Отправить', mic: 'Сказать голосом', micStop: 'Остановить запись', listen: 'Слушаю…',
            voiceOn: 'Читать ответы вслух: вкл.', voiceOff: 'Читать ответы вслух: выкл.', close: 'Закрыть', clear: 'Начать заново',
            typing: 'Печатает…', err: 'Не получилось ответить. Попробуйте ещё раз или напишите нам в Telegram: t.me/TheStarthChannel',
            limit: 'Слишком много вопросов подряд. Подождите несколько минут или напишите нам в Telegram: t.me/TheStarthChannel',
            noMic: 'Ваш браузер не поддерживает голосовой ввод. Попробуйте Chrome или напишите текстом.', micDenied: 'Нет доступа к микрофону. Разрешите его в настройках браузера.',
            book: 'Записаться на бесплатный урок', tg: 'Написать в Telegram',
            q: ['Сколько стоит обучение?', 'Как проходят уроки?', 'Как записаться на пробный урок?', 'Какие есть учителя?'] },
        uz: { open: 'Savol berish', title: 'TheStarth yordamchisi', sub: 'Kurslar, narxlar va o\'qituvchilar haqida javob beraman',
            hi: 'Salom! Men TheStarth yordamchisiman. Kurslar, narxlar, o\'qituvchilar yoki bepul darsga yozilish haqida so\'rang.',
            ph: 'Savolingizni yozing…', send: 'Yuborish', mic: 'Ovoz bilan aytish', micStop: 'Yozishni to\'xtatish', listen: 'Eshityapman…',
            voiceOn: 'Javoblarni ovoz bilan o\'qish: yoqilgan', voiceOff: 'Javoblarni ovoz bilan o\'qish: o\'chirilgan', close: 'Yopish', clear: 'Qaytadan boshlash',
            typing: 'Yozmoqda…', err: 'Javob berib bo\'lmadi. Qayta urinib ko\'ring yoki Telegram orqali yozing: t.me/TheStarthChannel',
            limit: 'Juda ko\'p savol ketma-ket. Bir necha daqiqa kuting yoki Telegram orqali yozing: t.me/TheStarthChannel',
            noMic: 'Brauzeringiz ovozli kiritishni qo\'llab-quvvatlamaydi. Chrome\'ni sinab ko\'ring yoki matn bilan yozing.', micDenied: 'Mikrofonga ruxsat yo\'q. Uni brauzer sozlamalarida yoqing.',
            book: 'Bepul darsga yozilish', tg: 'Telegram\'da yozish',
            q: ['O\'qish qancha turadi?', 'Darslar qanday o\'tadi?', 'Sinov darsiga qanday yozilaman?', 'Qanday o\'qituvchilar bor?'] },
        en: { open: 'Ask a question', title: 'TheStarth assistant', sub: 'Ask me about courses, prices and teachers',
            hi: 'Hi! I\'m the TheStarth assistant. Ask about courses, prices, teachers or how to book a free lesson.',
            ph: 'Type your question…', send: 'Send', mic: 'Speak', micStop: 'Stop recording', listen: 'Listening…',
            voiceOn: 'Read answers aloud: on', voiceOff: 'Read answers aloud: off', close: 'Close', clear: 'Start over',
            typing: 'Typing…', err: 'Couldn\'t answer. Please try again or message us on Telegram: t.me/TheStarthChannel',
            limit: 'Too many questions in a row. Please wait a few minutes or message us on Telegram: t.me/TheStarthChannel',
            noMic: 'Your browser doesn\'t support voice input. Try Chrome or type your question.', micDenied: 'No access to the microphone. Allow it in your browser settings.',
            book: 'Book a free lesson', tg: 'Message on Telegram',
            q: ['How much does it cost?', 'How do lessons work?', 'How do I book a trial lesson?', 'Who are the teachers?'] },
    };
    const SPEECH_LANG = { ru: 'ru-RU', uz: 'uz-UZ', en: 'en-US' };
    const lang = () => { try { const l = localStorage.getItem('starthLang'); return L[l] ? l : 'ru'; } catch (e) { return 'ru'; } };
    const T = () => L[lang()];
    const store = {
        get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
        lget(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // tiny, safe formatting: **bold**, links (t.me / https / thestarth pages / phone), line breaks, "- " lists
    function fmt(text) {
        let h = esc(text);
        h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        h = h.replace(/(https?:\/\/[^\s<)]+[^\s<).,!?])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        h = h.replace(/(^|[\s(])((?:t\.me|instagram\.com)\/[A-Za-z0-9_.\/]+[A-Za-z0-9_])/g, '$1<a href="https://$2" target="_blank" rel="noopener">$2</a>');
        h = h.replace(/(^|[\s(])([a-z-]+\.html(?:\?[^\s<)]*)?)/g, '$1<a href="$2">$2</a>');
        h = h.replace(/(\+998[\d ]{9,14}\d)/g, (m) => '<a href="tel:' + m.replace(/\s/g, '') + '">' + m + '</a>');
        h = h.split('\n').map((ln) => /^\s*[-•]\s+/.test(ln) ? '<span class="sa-li">' + ln.replace(/^\s*[-•]\s+/, '') + '</span>' : ln).join('<br>');
        return h.replace(/<\/span><br>(?=<span class="sa-li">)/g, '</span>');
    }

    const CSS = `
.sa-fab{position:fixed;right:18px;bottom:18px;z-index:2500;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:var(--accent,#8f5a0c);color:var(--on-accent,#fff);box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,bottom .4s ease}
.sa-fab:hover{transform:scale(1.06)}.sa-fab svg{width:28px;height:28px}
.sa-fab .sa-dot{position:absolute;top:6px;right:6px;width:12px;height:12px;border-radius:50%;background:#2ecc71;border:2px solid var(--paper,#fff)}
body.cookie-open .sa-fab{bottom:calc(18px + var(--cookie-h,0px))}
.sa-fab.sa-lift{bottom:96px}
.sa-panel{position:fixed;right:18px;bottom:88px;z-index:2501;width:370px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 110px);display:none;flex-direction:column;background:var(--paper,#fff);color:var(--ink,#1a1a1a);border:1px solid var(--rule,#e5e0d5);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden;font-family:inherit}
.sa-panel.open{display:flex}
.sa-head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;background:var(--accent,#8f5a0c);color:var(--on-accent,#fff)}
.sa-head .sa-av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.sa-head .sa-av svg{width:20px;height:20px}
.sa-head .sa-t{flex:1;min-width:0}.sa-head strong{display:block;font-size:.98rem}.sa-head small{display:block;font-size:.74rem;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-hb{background:transparent;border:0;color:inherit;width:34px;height:34px;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.sa-hb:hover{background:rgba(255,255,255,.16)}.sa-hb svg{width:19px;height:19px}.sa-hb[aria-pressed="false"]{opacity:.6}
.sa-list{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:9px;background:var(--paper-alt,#f6f2ea)}
.sa-m{max-width:86%;padding:9px 12px;border-radius:14px;font-size:.92rem;line-height:1.45;word-wrap:break-word;overflow-wrap:anywhere}
.sa-m a{color:inherit;text-decoration:underline}.sa-m .sa-li{display:block;padding-left:14px;position:relative}.sa-m .sa-li:before{content:'•';position:absolute;left:2px}
.sa-bot{align-self:flex-start;background:var(--paper,#fff);border:1px solid var(--rule,#e5e0d5);border-bottom-left-radius:4px}
.sa-me{align-self:flex-end;background:var(--accent,#8f5a0c);color:var(--on-accent,#fff);border-bottom-right-radius:4px}
.sa-err{align-self:flex-start;background:#fdecea;color:#8a1f11;border:1px solid #f5c6c0}
.sa-typing{align-self:flex-start;color:var(--ink-soft,#666);font-size:.82rem;padding:2px 4px}
.sa-chips{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 2px}
.sa-chip{border:1px solid var(--accent,#8f5a0c);background:transparent;color:var(--accent,#8f5a0c);border-radius:999px;padding:5px 11px;font-size:.8rem;cursor:pointer;font-family:inherit}
.sa-chip:hover{background:var(--accent-tint,rgba(143,90,12,.1))}
.sa-acts{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--rule,#e5e0d5);background:var(--paper,#fff)}
.sa-act{flex:1 1 auto;text-align:center;font-size:.78rem;padding:6px 8px;border-radius:9px;border:1px solid var(--rule,#e5e0d5);color:var(--ink,#1a1a1a);text-decoration:none;background:transparent;cursor:pointer;font-family:inherit}
.sa-act:hover{border-color:var(--accent,#8f5a0c);color:var(--accent,#8f5a0c)}
.sa-form{display:flex;gap:6px;padding:10px;border-top:1px solid var(--rule,#e5e0d5);background:var(--paper,#fff);align-items:flex-end}
.sa-in{flex:1;resize:none;border:1px solid var(--rule,#e5e0d5);border-radius:12px;padding:9px 11px;font:inherit;font-size:.92rem;max-height:110px;min-height:40px;background:var(--paper,#fff);color:var(--ink,#1a1a1a);outline:none;line-height:1.35}
.sa-in:focus{border-color:var(--accent,#8f5a0c)}
.sa-ib{width:40px;height:40px;flex:0 0 auto;border-radius:50%;border:1px solid var(--rule,#e5e0d5);background:transparent;color:var(--ink,#1a1a1a);cursor:pointer;display:flex;align-items:center;justify-content:center}
.sa-ib svg{width:19px;height:19px}.sa-send{background:var(--accent,#8f5a0c);border-color:var(--accent,#8f5a0c);color:var(--on-accent,#fff)}.sa-send:disabled{opacity:.5;cursor:default}
.sa-mic.rec{background:#e74c3c;border-color:#e74c3c;color:#fff;animation:saPulse 1.2s infinite}
@keyframes saPulse{0%{box-shadow:0 0 0 0 rgba(231,76,60,.5)}70%{box-shadow:0 0 0 10px rgba(231,76,60,0)}100%{box-shadow:0 0 0 0 rgba(231,76,60,0)}}
@media (max-width:640px){.sa-panel{right:0;left:0;bottom:0;width:100%;max-width:100%;height:100%;max-height:100%;border-radius:0}.sa-fab{right:14px;bottom:14px;width:54px;height:54px}}
@media (prefers-reduced-motion:reduce){.sa-mic.rec{animation:none}}`;
    const I = {
        chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>',
        x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
        send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
        mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
        spk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
        redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/></svg>',
    };

    let root, panel, list, input, sendBtn, micBtn, spkBtn, busy = false;
    let history = store.get('saHistory', []);     // [{role, content}]
    let voiceOn = store.lget('saVoice', false);

    function build() {
        const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        root = document.createElement('div'); root.className = 'sa-root';
        root.innerHTML = '<button type="button" class="sa-fab" aria-haspopup="dialog" aria-expanded="false">' + I.chat + '<span class="sa-dot"></span></button>' +
            '<div class="sa-panel" role="dialog" aria-modal="false" aria-labelledby="sa-title">' +
            '<div class="sa-head"><div class="sa-av">' + I.chat + '</div><div class="sa-t"><strong id="sa-title"></strong><small class="sa-sub"></small></div>' +
            '<button type="button" class="sa-hb sa-spk">' + I.spk + '</button><button type="button" class="sa-hb sa-clear">' + I.redo + '</button><button type="button" class="sa-hb sa-close">' + I.x + '</button></div>' +
            '<div class="sa-list" aria-live="polite"></div>' +
            '<div class="sa-acts"><a class="sa-act sa-book" href="index.html#pricing"></a><a class="sa-act sa-tg" href="https://t.me/TheStarthChannel" target="_blank" rel="noopener"></a></div>' +
            '<form class="sa-form"><button type="button" class="sa-ib sa-mic">' + I.mic + '</button><textarea class="sa-in" rows="1" maxlength="600"></textarea><button type="submit" class="sa-ib sa-send">' + I.send + '</button></form></div>';
        document.body.appendChild(root);
        panel = root.querySelector('.sa-panel'); list = root.querySelector('.sa-list'); input = root.querySelector('.sa-in');
        sendBtn = root.querySelector('.sa-send'); micBtn = root.querySelector('.sa-mic'); spkBtn = root.querySelector('.sa-spk');
        const fab = root.querySelector('.sa-fab');
        fab.addEventListener('click', () => toggle(!panel.classList.contains('open')));
        root.querySelector('.sa-close').addEventListener('click', () => toggle(false));
        root.querySelector('.sa-clear').addEventListener('click', () => { stopSpeak(); history = []; store.set('saHistory', history); render(); input.focus(); });
        spkBtn.addEventListener('click', () => { voiceOn = !voiceOn; store.lset('saVoice', voiceOn); if (!voiceOn) stopSpeak(); labels(); });
        root.querySelector('.sa-book').addEventListener('click', (e) => {
            const m = document.getElementById('appModal');
            if (m) { e.preventDefault(); toggle(false); m.classList.add('show'); }
        });
        root.querySelector('.sa-form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
        input.addEventListener('input', grow);
        micBtn.addEventListener('click', toggleMic);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) toggle(false); });
        window.addEventListener('starth-lang-changed', () => { labels(); render(); });
        labels(); render();
        // On the home page the intro video has its own buttons in the bottom-right corner ("Включить звук", "Пропустить"):
        // while they are on screen the chat button moves up so it never covers them.
        const ctl = document.getElementById('introSkip') || document.getElementById('introSound');
        if (ctl && ctl.parentElement && 'IntersectionObserver' in window) {
            new IntersectionObserver((es) => { fab.classList.toggle('sa-lift', es.some((e) => e.isIntersecting)); }).observe(ctl.parentElement);
        }
    }
    function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 110) + 'px'; }
    function labels() {
        const t = T();
        const fab = root.querySelector('.sa-fab'); fab.setAttribute('aria-label', t.open); fab.title = t.open;
        root.querySelector('#sa-title').textContent = t.title; root.querySelector('.sa-sub').textContent = t.sub;
        input.placeholder = t.ph; sendBtn.setAttribute('aria-label', t.send); sendBtn.title = t.send;
        micBtn.setAttribute('aria-label', rec ? t.micStop : t.mic); micBtn.title = rec ? t.micStop : t.mic;
        const cl = root.querySelector('.sa-clear'); cl.setAttribute('aria-label', t.clear); cl.title = t.clear;
        const cx = root.querySelector('.sa-close'); cx.setAttribute('aria-label', t.close); cx.title = t.close;
        spkBtn.setAttribute('aria-pressed', voiceOn ? 'true' : 'false'); spkBtn.title = voiceOn ? t.voiceOn : t.voiceOff; spkBtn.setAttribute('aria-label', spkBtn.title);
        spkBtn.style.display = canSpeak() ? '' : 'none';
        micBtn.style.display = SR ? '' : 'none';
        root.querySelector('.sa-book').textContent = t.book; root.querySelector('.sa-tg').textContent = t.tg;
    }
    function toggle(open) {
        panel.classList.toggle('open', open);
        root.querySelector('.sa-fab').setAttribute('aria-expanded', open ? 'true' : 'false');
        root.querySelector('.sa-fab').style.display = open && window.innerWidth <= 640 ? 'none' : '';
        const dot = root.querySelector('.sa-dot'); if (dot) dot.remove();
        if (open) { setTimeout(() => input.focus(), 50); list.scrollTop = list.scrollHeight; } else { stopSpeak(); stopMic(); }
    }
    function bubble(cls, html) { const d = document.createElement('div'); d.className = 'sa-m ' + cls; d.innerHTML = html; list.appendChild(d); return d; }
    function render() {
        const t = T(); list.innerHTML = '';
        bubble('sa-bot', fmt(t.hi));
        if (!history.length) {
            const c = document.createElement('div'); c.className = 'sa-chips';
            t.q.forEach((q) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sa-chip'; b.textContent = q; b.onclick = () => ask(q); c.appendChild(b); });
            list.appendChild(c);
        }
        history.forEach((m) => bubble(m.role === 'user' ? 'sa-me' : 'sa-bot', fmt(m.content)));
        list.scrollTop = list.scrollHeight;
    }
    async function ask(text) {
        text = String(text || '').trim(); if (!text || busy) return;
        stopMic(); stopSpeak();
        busy = true; sendBtn.disabled = true; input.value = ''; grow();
        history.push({ role: 'user', content: text.slice(0, 600) }); store.set('saHistory', history); render();
        const typing = document.createElement('div'); typing.className = 'sa-typing'; typing.textContent = T().typing; list.appendChild(typing); list.scrollTop = list.scrollHeight;
        let answer = '', errKey = '';
        try {
            const ctrl = 'AbortController' in window ? new AbortController() : null;
            const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, 45000);
            const r = await fetch(window.MOCK_AI_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl ? ctrl.signal : undefined,
                body: JSON.stringify({ mode: 'assistant', lang: lang(), page: location.pathname.split('/').pop() || 'index.html', messages: history.slice(-10) }),
            });
            clearTimeout(timer);
            const j = await r.json().catch(() => ({}));
            if (r.status === 429) errKey = 'limit'; else if (!r.ok || !j.text) errKey = 'err'; else answer = String(j.text);
        } catch (e) { errKey = 'err'; }
        typing.remove();
        if (answer) { history.push({ role: 'assistant', content: answer }); store.set('saHistory', history); render(); speak(answer); }
        else { history.pop(); store.set('saHistory', history); render(); bubble('sa-err', fmt(T()[errKey])); list.scrollTop = list.scrollHeight; input.value = text; grow(); }
        busy = false; sendBtn.disabled = false;
    }

    // ── voice input ──
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;
    function toggleMic() { if (rec) stopMic(); else startMic(); }
    function startMic() {
        if (!SR) { bubble('sa-err', fmt(T().noMic)); return; }
        stopSpeak();
        const r = new SR(); rec = r;
        r.lang = SPEECH_LANG[lang()]; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
        const before = input.value ? input.value.trim() + ' ' : '';
        let finalText = '';
        r.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) { const tr = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += tr; else interim += tr; }
            input.value = before + finalText + interim; grow();
        };
        r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') bubble('sa-err', fmt(T().micDenied)); };
        r.onend = () => { const was = rec === r; rec = null; micBtn.classList.remove('rec'); input.placeholder = T().ph; labels(); if (was && finalText.trim()) ask(input.value); };
        try { r.start(); micBtn.classList.add('rec'); input.placeholder = T().listen; labels(); } catch (e) { rec = null; }
    }
    function stopMic() { if (rec) { const r = rec; rec = null; try { r.stop(); } catch (e) {} micBtn.classList.remove('rec'); } }

    // ── voice output ──
    const synth = window.speechSynthesis;
    function voiceFor(l) {
        if (!synth) return null;
        const vs = synth.getVoices() || [], code = SPEECH_LANG[l].toLowerCase(), short = l.toLowerCase();
        return vs.find((v) => v.lang && v.lang.toLowerCase() === code) || vs.find((v) => v.lang && v.lang.toLowerCase().startsWith(short)) || null;
    }
    function canSpeak() { return !!(synth && voiceFor(lang())); }
    if (synth && 'onvoiceschanged' in synth) synth.onvoiceschanged = () => { if (root) labels(); };
    function speak(text) {
        if (!voiceOn || !canSpeak()) return;
        const clean = String(text).replace(/\*\*/g, '').replace(/https?:\/\/\S+/g, '').replace(/[•#]/g, '').replace(/\s+/g, ' ').trim();
        if (!clean) return;
        stopSpeak();
        const u = new SpeechSynthesisUtterance(clean); const v = voiceFor(lang());
        if (v) u.voice = v; u.lang = SPEECH_LANG[lang()]; u.rate = 1; synth.speak(u);
    }
    function stopSpeak() { try { if (synth) synth.cancel(); } catch (e) {} }

    function init() { if (!window.MOCK_AI_URL) return; build(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
