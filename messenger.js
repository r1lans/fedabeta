/* TheStarth — messenger in the personal cabinet (students and teachers). Find a person by nickname and chat 1-to-1.
 *
 *   chats/{uidA_uidB}           { members:[uidA,uidB] (sorted), names:{uid:name}, nicks:{uid:nickname}, lastText, lastTs, lastFrom, reads:{uid:ts} }
 *   chats/{id}/messages/{mid}   { from, text, ts }
 * A chat is unread for me when lastFrom != me and lastTs > reads[me].
 * Needs db, Icons, #messengerSection.
 */
(function () {
    'use strict';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ic = (n) => (window.Icons ? window.Icons.svg(n) : '');
    const pad = (n) => String(n).padStart(2, '0');
    const hhmm = (t) => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const dayLabel = (t) => { const k = dayKey(t), today = dayKey(Date.now()), y = dayKey(Date.now() - 864e5); if (k === today) return 'Сегодня'; if (k === y) return 'Вчера'; try { return new Date(t).toLocaleDateString(window.starthLocale ? window.starthLocale() : 'ru-RU', { day: 'numeric', month: 'long' }); } catch (e) { return k; } };
    const listTime = (t) => { if (!t) return ''; return dayKey(t) === dayKey(Date.now()) ? hhmm(t) : (pad(new Date(t).getDate()) + '.' + pad(new Date(t).getMonth() + 1)); };
    const initials = (n) => String(n || '?').replace('@', '').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
    const NICK_RE = /^[a-z0-9_.-]{2,40}$/i;

    let box = null, me = null, myName = '', myNick = '', chats = [], openId = '', unsubs = [], msgUnsub = null, msgs = [], firstLoad = true, mobileChat = false;

    const other = (c) => { const uid = (c.members || []).find((u) => u !== me.uid) || ''; return { uid, name: (c.names || {})[uid] || '', nick: (c.nicks || {})[uid] || '' }; };
    const title = (c) => { const o = other(c); return o.name || (o.nick ? '@' + o.nick : '…'); };
    const isUnread = (c) => c.lastFrom && c.lastFrom !== me.uid && (c.lastTs || 0) > ((c.reads || {})[me.uid] || 0);
    const totalUnread = () => chats.filter(isUnread).length;

    function shell() {
        box.innerHTML = `<h2 class="dash-section-title" id="messages">Сообщения <span class="rm-count msg-total" id="msgTotal" hidden></span></h2>
        <div class="msg ${mobileChat ? 'show-chat' : ''}" id="msgRoot">
            <aside class="msg-side">
                <form class="msg-find" id="msgFind" autocomplete="off">
                    <span class="msg-find-ic">${ic('search')}</span>
                    <input type="text" id="msgNick" placeholder="Найти по никнейму" autocapitalize="none" spellcheck="false" maxlength="40">
                    <button type="submit" class="tc-btn primary" id="msgGo">Написать</button>
                </form>
                <div class="msg-find-note" id="msgFindNote"></div>
                <div class="msg-list" id="msgList"></div>
            </aside>
            <div class="msg-main" id="msgMain"></div>
        </div>`;
        document.getElementById('msgFind').onsubmit = onFind;
        renderList(); renderMain();
    }

    async function onFind(e) {
        e.preventDefault();
        const note = document.getElementById('msgFindNote'); const inp = document.getElementById('msgNick'); const btn = document.getElementById('msgGo');
        const nick = inp.value.trim().replace(/^@/, '').toLowerCase();
        note.className = 'msg-find-note'; note.textContent = '';
        if (!NICK_RE.test(nick)) { note.textContent = 'Введите никнейм — например: aziza_k'; note.classList.add('err'); return; }
        if (nick === String(myNick).toLowerCase()) { note.textContent = 'Это ваш никнейм — введите никнейм другого человека.'; note.classList.add('err'); return; }
        btn.disabled = true;
        try {
            const nd = await db.collection('nicknames').doc(nick).get();
            if (!nd.exists || !nd.data().uid) { note.textContent = 'Пользователь @' + nick + ' не найден. Проверьте никнейм.'; note.classList.add('err'); return; }
            const uid = nd.data().uid, name = nd.data().displayName || '';
            await openWith(uid, name, nick);
            inp.value = '';
        } catch (err) { console.warn(err); note.textContent = 'Не удалось найти: ' + err.message; note.classList.add('err'); }
        finally { btn.disabled = false; }
    }

    const chatId = (a, b) => [a, b].sort().join('_');
    async function openWith(uid, name, nick) {
        const id = chatId(me.uid, uid);
        if (!chats.find((c) => c.id === id)) {
            const members = [me.uid, uid].sort();
            const doc = { members, names: { [me.uid]: myName, [uid]: name }, nicks: { [me.uid]: myNick, [uid]: nick }, lastText: '', lastTs: 0, lastFrom: '', reads: { [me.uid]: Date.now() } };
            await db.collection('chats').doc(id).set(doc);
            chats.push(Object.assign({ id }, doc));
        }
        openChat(id);
    }

    function renderList() {
        const l = document.getElementById('msgList'); if (!l) return;
        const tot = totalUnread(); const t = document.getElementById('msgTotal'); if (t) { t.hidden = !tot; t.textContent = tot; }
        const shown = chats.filter((c) => c.lastTs || c.id === openId).sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
        l.innerHTML = shown.length ? shown.map((c) => `<button type="button" class="msg-row ${c.id === openId ? 'active' : ''} ${isUnread(c) ? 'unread' : ''}" data-id="${esc(c.id)}">
            <span class="msg-av">${esc(initials(title(c)))}</span>
            <span class="msg-rb"><span class="msg-rt"><strong>${esc(title(c))}</strong><time>${esc(listTime(c.lastTs))}</time></span>
            <span class="msg-rl">${c.lastFrom === me.uid ? '<em>Вы: </em>' : ''}${esc(c.lastText || 'Новый чат')}</span></span>${isUnread(c) ? '<i class="msg-dot"></i>' : ''}</button>`).join('')
            : '<div class="tc-empty" style="padding:1rem 0;">Пока нет переписок. Найдите человека по никнейму и напишите ему.</div>';
        l.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => openChat(b.dataset.id));
    }

    function renderMain() {
        const m = document.getElementById('msgMain'); if (!m) return;
        const c = chats.find((x) => x.id === openId);
        if (!c) { m.innerHTML = `<div class="msg-empty">${ic('message')}<p>Выберите переписку слева<br>или найдите человека по никнейму.</p></div>`; return; }
        const o = other(c);
        m.innerHTML = `<header class="msg-head"><button type="button" class="msg-back" id="msgBack" aria-label="Назад">${ic('arrow-left')}</button>
            <span class="msg-av">${esc(initials(title(c)))}</span><div><strong>${esc(title(c))}</strong>${o.nick ? `<div class="tc-meta">@${esc(o.nick)}</div>` : ''}</div></header>
            <div class="msg-thread" id="msgThread"></div>
            <form class="msg-compose" id="msgCompose"><textarea id="msgText" rows="1" maxlength="2000" placeholder="Сообщение…"></textarea><button type="submit" class="msg-send" aria-label="Отправить">${ic('send')}</button></form>`;
        document.getElementById('msgBack').onclick = () => { mobileChat = false; document.getElementById('msgRoot').classList.remove('show-chat'); };
        const ta = document.getElementById('msgText');
        ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.getElementById('msgCompose').requestSubmit(); } });
        document.getElementById('msgCompose').onsubmit = (e) => { e.preventDefault(); send(); };
        renderThread();
    }
    function renderThread() {
        const t = document.getElementById('msgThread'); if (!t) return;
        const near = t.scrollHeight - t.scrollTop - t.clientHeight < 80;
        let last = '';
        t.innerHTML = msgs.length ? msgs.map((x) => { const k = dayKey(x.ts); const sep = k !== last ? `<div class="msg-day">${esc(dayLabel(x.ts))}</div>` : ''; last = k;
            return sep + `<div class="mb ${x.from === me.uid ? 'mine' : ''}"><div class="mb-t">${esc(x.text)}</div><time>${esc(hhmm(x.ts))}</time></div>`; }).join('')
            : '<div class="msg-empty small">Напишите первое сообщение.</div>';
        if (near || firstLoad) t.scrollTop = t.scrollHeight;
    }

    async function markRead(id) {
        const c = chats.find((x) => x.id === id); if (!c || !isUnread(c)) return;
        const reads = Object.assign({}, c.reads || {}, { [me.uid]: Date.now() }); c.reads = reads; renderList();
        db.collection('chats').doc(id).update({ reads }).catch(() => {});
    }
    function openChat(id) {
        openId = id; mobileChat = true; firstLoad = true; msgs = [];
        if (msgUnsub) { msgUnsub(); msgUnsub = null; }
        const root = document.getElementById('msgRoot'); if (root) root.classList.add('show-chat');
        renderList(); renderMain(); markRead(id);
        msgUnsub = db.collection('chats').doc(id).collection('messages').orderBy('ts').limit(300).onSnapshot((snap) => {
            msgs = []; snap.forEach((d) => msgs.push(Object.assign({ id: d.id }, d.data())));
            renderThread(); firstLoad = false; markRead(id);
        }, (e) => console.warn('messages', e));
        setTimeout(() => { const ta = document.getElementById('msgText'); if (ta && !window.matchMedia('(max-width: 720px)').matches) ta.focus(); }, 50);
    }
    async function send() {
        const ta = document.getElementById('msgText'); const text = ta.value.trim(); if (!text || !openId) return;
        const c = chats.find((x) => x.id === openId); if (!c) return;
        ta.value = ''; ta.style.height = 'auto'; const ts = Date.now();
        try {
            await db.collection('chats').doc(openId).collection('messages').add({ from: me.uid, text: text.slice(0, 2000), ts });
            const names = Object.assign({}, c.names || {}, { [me.uid]: myName }), nicks = Object.assign({}, c.nicks || {}, { [me.uid]: myNick });
            const reads = Object.assign({}, c.reads || {}, { [me.uid]: ts });
            await db.collection('chats').doc(openId).update({ lastText: text.slice(0, 120), lastTs: ts, lastFrom: me.uid, names, nicks, reads });
        } catch (err) { ta.value = text; alert((window.X ? window.X('Не удалось отправить: ') : 'Не удалось отправить: ') + err.message); }
    }

    function listen() {
        unsubs.push(db.collection('chats').where('members', 'array-contains', me.uid).onSnapshot((snap) => {
            const before = new Map(chats.map((c) => [c.id, c.lastTs || 0]));
            chats = []; snap.forEach((d) => chats.push(Object.assign({ id: d.id }, d.data())));
            // toast for a new incoming message in a chat that is not open
            if (!firstSnap) chats.forEach((c) => { if (c.lastFrom && c.lastFrom !== me.uid && (c.lastTs || 0) > (before.get(c.id) || 0) && c.id !== openId && window.showToast) window.showToast((window.X ? window.X('Новое сообщение от ') : 'Новое сообщение от ') + title(c), 'message'); });
            firstSnap = false;
            if (!box.querySelector('#msgRoot')) return;
            renderList(); if (openId) markRead(openId);
            if (openId) { const head = document.querySelector('#msgMain .msg-head'); if (head && !chats.find((c) => c.id === openId)) { openId = ''; renderMain(); } }
        }, (e) => { console.warn('chats', e); const l = document.getElementById('msgList'); if (l) l.innerHTML = '<div class="tc-empty">Сообщения пока недоступны (нужно опубликовать новые правила Firestore).</div>'; }));
    }
    let firstSnap = true;

    window.Messenger = {
        init(user, profile) {
            box = document.getElementById('messengerSection'); if (!box) return;
            unsubs.forEach((u) => { try { u(); } catch (e) {} }); unsubs = []; if (msgUnsub) { msgUnsub(); msgUnsub = null; }
            me = user; profile = profile || {}; myNick = profile.nickname || '';
            myName = [profile.name, profile.surname].filter(Boolean).join(' ') || (myNick ? '@' + myNick : '');
            if (!myNick) { box.innerHTML = ''; return; }
            chats = []; openId = ''; msgs = []; firstSnap = true; mobileChat = false;
            shell(); listen();
            if (/[?&#]chat=([^&]+)/.test(location.href)) { const n = decodeURIComponent(RegExp.$1).toLowerCase(); setTimeout(() => { const i = document.getElementById('msgNick'); if (i) { i.value = n; document.getElementById('msgFind').requestSubmit(); } }, 600); }
        }
    };
})();
