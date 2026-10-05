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

    let box = null, me = null, myName = '', myNick = '', myRole = 'student', chats = [], openId = '', unsubs = [], msgUnsub = null, msgs = [], firstLoad = true, mobileChat = false;

    // live data about the other people: directory/<uid> (name, nickname, role) and presence/<uid> (online / in a lesson)
    let liveDir = {}, presDoc = {}, liveUn = {};
    const other = (c) => { const uid = (c.members || []).find((u) => u !== me.uid) || ''; const L = liveDir[uid];
        return { uid, name: L ? [L.name, L.surname].filter(Boolean).join(' ') || (c.names || {})[uid] || '' : (c.names || {})[uid] || '', nick: L ? (L.nickname || (c.nicks || {})[uid] || '') : (c.nicks || {})[uid] || '', role: L ? (L.role || '') : (c.roles || {})[uid] || '' }; };
    const presOf = (uid) => (window.StarthPresence ? window.StarthPresence.status(presDoc[uid]) : '');
    const presDot = (uid) => (window.StarthPresence ? window.StarthPresence.dot(presOf(uid)) : '');
    function watchPeople() {
        chats.forEach((c) => { const uid = (c.members || []).find((u) => u !== me.uid); if (!uid || liveUn[uid]) return;
            const u1 = db.collection('directory').doc(uid).onSnapshot((d) => { if (d.exists) { liveDir[uid] = d.data(); refreshUI(); } }, () => {});
            let u2 = () => {}; const tryP = () => { if (window.StarthPresence) u2 = window.StarthPresence.watch(uid, (p) => { presDoc[uid] = p; refreshUI(); }); else setTimeout(tryP, 400); }; tryP();
            liveUn[uid] = () => { u1(); u2(); }; });
    }
    function refreshUI() { if (!box || !box.querySelector('#msgRoot')) return; renderList(); const h = document.getElementById('msgHeadInfo'); const c = chats.find((x) => x.id === openId); if (h && c) h.innerHTML = headInfo(c); }
    function headInfo(c) { const o = other(c), st = presOf(o.uid), lb = window.StarthPresence ? window.StarthPresence.label(st) : '';
        return `<strong>${esc(title(c))}</strong> ${roleTag(o.role)}<div class="tc-meta">${o.nick ? '@' + esc(o.nick) : ''}${st ? `${o.nick ? ' · ' : ''}${presDot(o.uid)}<span class="pres-txt">${esc(lb)}</span>` : ''}</div>`; }
    const title = (c) => { const o = other(c); return o.name || (o.nick ? '@' + o.nick : '…'); };
    const isUnread = (c) => c.lastFrom && c.lastFrom !== me.uid && (c.lastTs || 0) > ((c.reads || {})[me.uid] || 0);
    const totalUnread = () => chats.filter(isUnread).length;

    const roleName = (r) => (r === 'teacher' ? 'Учитель' : r === 'student' ? 'Ученик' : '');
    const roleTag = (r) => (r ? `<span class="msg-role ${r === 'teacher' ? 't' : ''}">${esc(window.X ? window.X(roleName(r)) : roleName(r))}</span>` : '');

    function shell() {
        const page = box.dataset.page === '1';
        box.innerHTML = `${page ? '' : '<h2 class="dash-section-title" id="messages">Сообщения</h2>'}
        <div class="msg ${mobileChat ? 'show-chat' : ''}" id="msgRoot">
            <aside class="msg-side">
                <div class="msg-find" id="msgFind">
                    <span class="msg-find-ic">${ic('search')}</span>
                    <input type="text" id="msgNick" placeholder="Имя, фамилия или @никнейм" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="60" role="combobox" aria-expanded="false" aria-controls="msgSug">
                    <div class="msg-sug" id="msgSug" role="listbox" hidden></div>
                </div>
                <div class="msg-find-note" id="msgFindNote"></div>
                <div id="msgNotifyBox"></div>
                <div class="msg-list" id="msgList"></div>
            </aside>
            <div class="msg-main" id="msgMain"></div>
        </div>`;
        bindSearch();
        renderList(); renderMain();
    }

    // ── find people: by first name, last name or nickname (prefix), with suggestions ──
    let sugTimer = null, sugItems = [], sugIdx = -1, sugSeq = 0;
    const norm = (v) => String(v || '').toLowerCase();
    async function searchUsers(raw) {
        const q = norm(raw).replace(/^@/, '').trim();
        const toks = q.split(/\s+/).filter(Boolean);
        if (!toks.length || toks.every((t) => t.length < 2)) return [];
        const first = toks.slice().sort((a, b) => b.length - a.length)[0].slice(0, 15);
        const out = new Map();
        try {
            const snap = await db.collection('directory').where('keys', 'array-contains', first).limit(30).get();
            snap.forEach((d) => {
                const x = d.data(); if (d.id === me.uid) return;
                const words = [x.name, x.surname, x.nickname].map(norm).join(' ').split(/\s+/);
                if (toks.every((t) => words.some((w) => w.startsWith(t)))) out.set(d.id, { uid: d.id, name: [x.name, x.surname].filter(Boolean).join(' '), nick: x.nickname || '', role: x.role || '' });
            });
        } catch (err) { console.warn('directory', err); }
        // people who are not in the directory yet can still be found by their exact nickname
        if (!out.size && toks.length === 1 && NICK_RE.test(toks[0])) {
            try { const nd = await db.collection('nicknames').doc(toks[0]).get(); if (nd.exists && nd.data().uid && nd.data().uid !== me.uid) out.set(nd.data().uid, { uid: nd.data().uid, name: nd.data().displayName || '', nick: toks[0], role: '' }); } catch (e) {}
        }
        return Array.from(out.values()).sort((a, b) => (norm(a.nick).startsWith(toks[0]) ? 0 : 1) - (norm(b.nick).startsWith(toks[0]) ? 0 : 1) || a.name.localeCompare(b.name)).slice(0, 8);
    }
    function paintSug() {
        const el = document.getElementById('msgSug'), inp = document.getElementById('msgNick'); if (!el) return;
        el.hidden = !sugItems.length; inp.setAttribute('aria-expanded', sugItems.length ? 'true' : 'false');
        el.innerHTML = sugItems.map((u, i) => `<button type="button" class="msg-sug-i ${i === sugIdx ? 'on' : ''}" role="option" data-i="${i}">
            <span class="msg-av">${esc(initials(u.name || u.nick))}</span>
            <span class="msg-sug-t"><strong>${esc(u.name || '@' + u.nick)}</strong><small>${u.nick ? '@' + esc(u.nick) : ''}</small></span>${roleTag(u.role)}</button>`).join('');
        el.querySelectorAll('.msg-sug-i').forEach((b) => b.onmousedown = (e) => { e.preventDefault(); pick(+b.dataset.i); });
    }
    async function pick(i) {
        const u = sugItems[i]; if (!u) return;
        const inp = document.getElementById('msgNick'), note = document.getElementById('msgFindNote');
        sugItems = []; sugIdx = -1; paintSug(); inp.value = ''; note.textContent = '';
        try { await openWith(u.uid, u.name, u.nick, u.role); }
        catch (err) { console.warn(err); note.textContent = 'Не удалось открыть чат: ' + err.message; note.className = 'msg-find-note err'; }
    }
    function bindSearch() {
        const inp = document.getElementById('msgNick'), note = document.getElementById('msgFindNote');
        note.textContent = 'Начните вводить имя, фамилию или никнейм.';
        inp.addEventListener('input', () => {
            clearTimeout(sugTimer); const q = inp.value; note.className = 'msg-find-note';
            if (norm(q).replace(/^@/, '').trim().length < 2) { sugItems = []; paintSug(); note.textContent = q.trim() ? 'Введите ещё хотя бы одну букву.' : 'Начните вводить имя, фамилию или никнейм.'; return; }
            note.textContent = '';
            sugTimer = setTimeout(async () => {
                const seq = ++sugSeq; const res = await searchUsers(q); if (seq !== sugSeq) return;
                sugItems = res; sugIdx = res.length ? 0 : -1; paintSug();
                if (!res.length) { note.textContent = 'Никого не найдено. Проверьте имя или никнейм.'; note.className = 'msg-find-note err'; }
            }, 250);
        });
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' && sugItems.length) { e.preventDefault(); sugIdx = (sugIdx + 1) % sugItems.length; paintSug(); }
            else if (e.key === 'ArrowUp' && sugItems.length) { e.preventDefault(); sugIdx = (sugIdx - 1 + sugItems.length) % sugItems.length; paintSug(); }
            else if (e.key === 'Enter') { e.preventDefault(); if (sugItems.length) pick(Math.max(0, sugIdx)); }
            else if (e.key === 'Escape') { sugItems = []; paintSug(); }
        });
        inp.addEventListener('blur', () => setTimeout(() => { sugItems = []; paintSug(); }, 150));
    }

    const chatId = (a, b) => [a, b].sort().join('_');
    async function openWith(uid, name, nick, role) {
        const id = chatId(me.uid, uid);
        if (!chats.find((c) => c.id === id)) {
            const members = [me.uid, uid].sort();
            const doc = { members, names: { [me.uid]: myName, [uid]: name }, nicks: { [me.uid]: myNick, [uid]: nick }, roles: { [me.uid]: myRole, [uid]: role || '' }, lastText: '', lastTs: 0, lastFrom: '', reads: { [me.uid]: Date.now() } };
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
            <span class="msg-rb"><span class="msg-rt"><strong>${esc(title(c))}</strong>${presDot(other(c).uid)}${roleTag(other(c).role)}<time>${esc(listTime(c.lastTs))}</time></span>
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
            <span class="msg-av">${esc(initials(title(c)))}</span><div id="msgHeadInfo">${headInfo(c)}</div></header>
            <div class="msg-thread" id="msgThread"></div>
            <form class="msg-compose" id="msgCompose"><button type="button" class="msg-attach" id="msgAttach" aria-label="Фото" title="Фото">${ic('image')}</button><input type="file" id="msgFile" accept="image/*" hidden><textarea id="msgText" rows="1" maxlength="2000" placeholder="Сообщение…"></textarea><button type="submit" class="msg-send" aria-label="Отправить">${ic('send')}</button></form>`;
        document.getElementById('msgBack').onclick = () => { mobileChat = false; document.getElementById('msgRoot').classList.remove('show-chat'); };
        const ta = document.getElementById('msgText');
        ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.getElementById('msgCompose').requestSubmit(); } });
        document.getElementById('msgCompose').onsubmit = (e) => { e.preventDefault(); send(); };
        const fi = document.getElementById('msgFile');
        document.getElementById('msgAttach').onclick = () => fi.click();
        fi.onchange = () => { const f = fi.files && fi.files[0]; fi.value = ''; if (f) sendImage(f); };
        renderThread();
    }
    function renderThread() {
        const t = document.getElementById('msgThread'); if (!t) return;
        const near = t.scrollHeight - t.scrollTop - t.clientHeight < 80;
        let last = '';
        t.innerHTML = msgs.length ? msgs.map((x) => { const k = dayKey(x.ts); const sep = k !== last ? `<div class="msg-day">${esc(dayLabel(x.ts))}</div>` : ''; last = k;
            return sep + `<div class="mb ${x.from === me.uid ? 'mine' : ''}">${x.img && /^data:image\/(jpeg|png|webp);base64,/.test(x.img) ? `<img class="mb-img" src="${x.img}" alt="" loading="lazy">` : ''}${String(x.text || '').trim() ? `<div class="mb-t">${esc(x.text)}</div>` : ''}<time>${esc(hhmm(x.ts))}</time></div>`; }).join('')
            : '<div class="msg-empty small">Напишите первое сообщение.</div>';
        t.querySelectorAll('.mb-img').forEach((im) => { im.onload = () => { if (near || firstLoad) t.scrollTop = t.scrollHeight; }; im.onclick = () => openImage(im.src); });
        if (near || firstLoad) t.scrollTop = t.scrollHeight;
    }
    function openImage(src) {
        const o = document.createElement('div'); o.className = 'vbox';
        o.innerHTML = `<div class="vbox-bar"><div class="vbox-title"></div><button type="button" class="vbox-x" aria-label="Закрыть">${ic('x')}</button></div><div class="vbox-stage"><img class="vbox-img" src="${src}" alt=""></div>`;
        const close = () => { o.remove(); document.documentElement.classList.remove('vbox-lock'); document.removeEventListener('keydown', onk, true); };
        const onk = (e) => { if (e.key === 'Escape') close(); };
        o.addEventListener('click', (e) => { if (e.target !== o.querySelector('.vbox-img')) close(); });
        document.addEventListener('keydown', onk, true);
        document.body.appendChild(o); document.documentElement.classList.add('vbox-lock');
    }
    // Photos are shrunk in the browser (max 1000 px, JPEG) and stored inside the message document (no Storage needed).
    function shrink(file) {
        return new Promise((resolve, reject) => {
            if (!/^image\//.test(file.type)) return reject(new Error('Это не изображение.'));
            const url = URL.createObjectURL(file), im = new Image();
            im.onload = () => {
                URL.revokeObjectURL(url);
                let max = 1000, q = 0.72;
                for (let i = 0; i < 6; i++) {
                    const k = Math.min(1, max / Math.max(im.width, im.height));
                    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
                    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
                    const out = c.toDataURL('image/jpeg', q);
                    if (out.length <= 200000) return resolve(out);
                    max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.05);
                }
                reject(new Error('Фото слишком большое.'));
            };
            im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение.')); };
            im.src = url;
        });
    }
    async function sendImage(file) {
        if (!openId) return;
        const c = chats.find((x) => x.id === openId); if (!c) return;
        const btn = document.getElementById('msgAttach'); if (btn) btn.disabled = true;
        try {
            const img = await shrink(file);
            const ta = document.getElementById('msgText'); const cap = ta ? ta.value.trim().slice(0, 500) : ''; if (ta) { ta.value = ''; ta.style.height = 'auto'; }
            const ts = Date.now();
            await db.collection('chats').doc(openId).collection('messages').add({ from: me.uid, text: cap || ' ', img, ts });
            const names = Object.assign({}, c.names || {}, { [me.uid]: myName }), nicks = Object.assign({}, c.nicks || {}, { [me.uid]: myNick }), roles = Object.assign({}, c.roles || {}, { [me.uid]: myRole });
            const reads = Object.assign({}, c.reads || {}, { [me.uid]: ts });
            await db.collection('chats').doc(openId).update({ lastText: cap || (window.X ? window.X('Фото') : 'Фото'), lastTs: ts, lastFrom: me.uid, names, nicks, roles, reads });
        } catch (err) { alert((window.X ? window.X('Не удалось отправить: ') : 'Не удалось отправить: ') + err.message); }
        if (btn) btn.disabled = false;
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
            const names = Object.assign({}, c.names || {}, { [me.uid]: myName }), nicks = Object.assign({}, c.nicks || {}, { [me.uid]: myNick }), roles = Object.assign({}, c.roles || {}, { [me.uid]: myRole });
            const reads = Object.assign({}, c.reads || {}, { [me.uid]: ts });
            await db.collection('chats').doc(openId).update({ lastText: text.slice(0, 120), lastTs: ts, lastFrom: me.uid, names, nicks, roles, reads });
        } catch (err) { ta.value = text; alert((window.X ? window.X('Не удалось отправить: ') : 'Не удалось отправить: ') + err.message); }
    }

    function listen() {
        unsubs.push(db.collection('chats').where('members', 'array-contains', me.uid).onSnapshot((snap) => {
                        chats = []; snap.forEach((d) => chats.push(Object.assign({ id: d.id }, d.data())));
            firstSnap = false; watchPeople();
            if (!box.querySelector('#msgRoot')) return;
            renderList(); if (openId) markRead(openId);
            if (openId) { const head = document.querySelector('#msgMain .msg-head'); if (head && !chats.find((c) => c.id === openId)) { openId = ''; renderMain(); } }
        }, (e) => { console.warn('chats', e); const l = document.getElementById('msgList'); if (l) l.innerHTML = '<div class="tc-empty">Сообщения пока недоступны (нужно опубликовать новые правила Firestore).</div>'; }));
    }
    let firstSnap = true;

    window.Messenger = {
        openId() { return openId; },
        openById(id) { if (chats.find((c) => c.id === id)) openChat(id); },
        init(user, profile) {
            box = document.getElementById('messengerSection'); if (!box) return;
            unsubs.forEach((u) => { try { u(); } catch (e) {} }); unsubs = []; if (msgUnsub) { msgUnsub(); msgUnsub = null; }
            Object.keys(liveUn).forEach((k) => { try { liveUn[k](); } catch (e) {} }); liveUn = {}; liveDir = {}; presDoc = {};
            me = user; profile = profile || {}; myNick = profile.nickname || ''; myRole = profile.role === 'teacher' ? 'teacher' : 'student';
            myName = [profile.name, profile.surname].filter(Boolean).join(' ') || (myNick ? '@' + myNick : '');
            if (!myNick) { box.innerHTML = box.dataset.page === '1' ? '<div class="tc-empty" style="padding:2rem;text-align:center;">Для мессенджера нужен никнейм. Он указывается при регистрации.</div>' : ''; return; }
            chats = []; openId = ''; msgs = []; firstSnap = true; mobileChat = false;
            shell(); listen(); window.dispatchEvent(new Event('starth-msg-shell'));
            if (/[?&#]chat=([^&]+)/.test(location.href)) { const n = decodeURIComponent(RegExp.$1).toLowerCase().replace(/^@/, ''); setTimeout(async () => { const r = await searchUsers(n); const u = r.find((x) => norm(x.nick) === n) || r[0]; if (u) openWith(u.uid, u.name, u.nick, u.role); }, 600); }
        }
    };
})();
