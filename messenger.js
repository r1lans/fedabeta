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

    let replyTo = null, editing = null, box = null, me = null, myName = '', myNick = '', myRole = 'student', chats = [], openId = '', unsubs = [], msgUnsub = null, msgs = [], firstLoad = true, mobileChat = false;

    // live data about the other people: directory/<uid> (name, nickname, role) and presence/<uid> (online / in a lesson)
    let liveDir = {}, presDoc = {}, liveUn = {};
    const isGroup = (c) => !!(c && c.group);
    const other = (c) => { if (isGroup(c)) return { uid: '', name: c.title || '', nick: '', role: '' }; const uid = (c.members || []).find((u) => u !== me.uid) || ''; const L = liveDir[uid];
        return { uid, name: L ? [L.name, L.surname].filter(Boolean).join(' ') || (c.names || {})[uid] || '' : (c.names || {})[uid] || '', nick: L ? (L.nickname || (c.nicks || {})[uid] || '') : (c.nicks || {})[uid] || '', role: L ? (L.role || '') : (c.roles || {})[uid] || '' }; };
    const presOf = (uid) => (window.StarthPresence ? window.StarthPresence.status(presDoc[uid]) : '');
    const presDot = (uid) => (window.StarthPresence ? window.StarthPresence.dot(presOf(uid)) : '');
    function watchPeople() {
        chats.forEach((c) => { if (isGroup(c)) return; const uid = (c.members || []).find((u) => u !== me.uid); if (!uid || liveUn[uid]) return;
            const u1 = db.collection('directory').doc(uid).onSnapshot((d) => { if (d.exists) { liveDir[uid] = d.data(); refreshUI(); } }, () => {});
            let u2 = () => {}; const tryP = () => { if (window.StarthPresence) u2 = window.StarthPresence.watch(uid, (p) => { presDoc[uid] = p; refreshUI(); }); else setTimeout(tryP, 400); }; tryP();
            liveUn[uid] = () => { u1(); u2(); }; });
    }
    function refreshUI() { if (!box || !box.querySelector('#msgRoot')) return; renderList(); const h = document.getElementById('msgHeadInfo'); const c = chats.find((x) => x.id === openId); if (h && c) h.innerHTML = headInfo(c); }
    function headInfo(c) { if (isGroup(c)) { const n = (c.members || []).length; return `<strong>${esc(title(c))}</strong> <span class="msg-role g">${esc(tx('Группа'))}</span><div class="tc-meta"><button type="button" class="msg-members-btn" id="msgMembersBtn">${n} ${esc(plural(n))}</button></div>`; }
        const o = other(c), st = presOf(o.uid), lb = window.StarthPresence ? window.StarthPresence.label(st) : '';
        return `<strong>${esc(title(c))}</strong> ${roleTag(o.role)}<div class="tc-meta">${o.nick ? '@' + esc(o.nick) : ''}${st ? `${o.nick ? ' · ' : ''}${presDot(o.uid)}<span class="pres-txt">${esc(lb)}</span>` : ''}</div>`; }
    const title = (c) => { if (isGroup(c)) return c.title || 'Группа'; const o = other(c); return o.name || (o.nick ? '@' + o.nick : '…'); };
    const isUnread = (c) => c.lastFrom && c.lastFrom !== me.uid && (c.lastTs || 0) > ((c.reads || {})[me.uid] || 0);
    const totalUnread = () => chats.filter(isUnread).length;

    const tx = (s) => (window.X ? window.X(s) : s);
    const plural = (n) => { const l = (document.documentElement.lang || 'ru').slice(0, 2); if (l === 'en') return n === 1 ? 'member' : 'members'; if (l === 'uz') return 'ishtirokchi'; const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? 'участник' : (m >= 2 && m <= 4 && (h < 12 || h > 14)) ? 'участника' : 'участников'; };
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
                <button type="button" class="msg-newgrp" id="msgNewGrp">${ic('users')}<span>Создать группу</span></button>
                <div id="msgNotifyBox"></div>
                <div class="msg-list" id="msgList"></div>
            </aside>
            <div class="msg-main" id="msgMain"></div>
        </div>`;
        bindSearch();
        document.getElementById('msgNewGrp').onclick = newGroup;
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
            <span class="msg-av ${isGroup(c) ? 'grp' : ''}">${isGroup(c) ? ic('users') : esc(initials(title(c)))}</span>
            <span class="msg-rb"><span class="msg-rt"><strong>${esc(title(c))}</strong>${isGroup(c) ? '' : presDot(other(c).uid) + roleTag(other(c).role)}<time>${esc(listTime(c.lastTs))}</time></span>
            <span class="msg-rl">${c.lastFrom === me.uid ? '<em>Вы: </em>' : (isGroup(c) && c.lastName ? '<em>' + esc(c.lastName) + ': </em>' : '')}${esc(c.lastText || 'Новый чат')}</span></span>${isUnread(c) ? '<i class="msg-dot"></i>' : ''}</button>`).join('')
            : '<div class="tc-empty" style="padding:1rem 0;">Пока нет переписок. Найдите человека по никнейму и напишите ему.</div>';
        l.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => openChat(b.dataset.id));
    }

    function renderMain() {
        const m = document.getElementById('msgMain'); if (!m) return;
        const c = chats.find((x) => x.id === openId);
        if (!c) { m.innerHTML = `<div class="msg-empty">${ic('message')}<p>Выберите переписку слева<br>или найдите человека по никнейму.</p></div>`; return; }
        m.innerHTML = `<header class="msg-head"><button type="button" class="msg-back" id="msgBack" aria-label="Назад">${ic('arrow-left')}</button>
            <span class="msg-av ${isGroup(c) ? 'grp' : ''}">${isGroup(c) ? ic('users') : esc(initials(title(c)))}</span><div id="msgHeadInfo">${headInfo(c)}</div></header>
            <div class="msg-pin" id="msgPin" hidden></div>
            <div class="msg-thread" id="msgThread"></div>
            <div class="msg-ctx" id="msgCtx" hidden></div>
            <form class="msg-compose" id="msgCompose"><button type="button" class="msg-attach" id="msgAttach" aria-label="Фото" title="Фото">${ic('image')}</button><input type="file" id="msgFile" accept="image/*" hidden><textarea id="msgText" rows="1" maxlength="2000" placeholder="Сообщение…"></textarea><button type="submit" class="msg-send" aria-label="Отправить">${ic('send')}</button></form>`;
        document.getElementById('msgBack').onclick = () => { mobileChat = false; document.getElementById('msgRoot').classList.remove('show-chat'); };
        document.getElementById('msgHeadInfo').addEventListener('click', (e) => { if (e.target.closest('#msgMembersBtn')) openMembers(); });
        const ta = document.getElementById('msgText');
        ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.getElementById('msgCompose').requestSubmit(); } else if (e.key === 'Escape' && (editing || replyTo)) { cancelCtx(); } });
        document.getElementById('msgCompose').onsubmit = (e) => { e.preventDefault(); send(); };
        const fi = document.getElementById('msgFile');
        document.getElementById('msgAttach').onclick = () => fi.click();
        fi.onchange = () => { const f = fi.files && fi.files[0]; fi.value = ''; if (f) sendImage(f); };
        const th = document.getElementById('msgThread');
        th.addEventListener('click', (e) => {
            const more = e.target.closest('.mb-more'); if (more) { e.stopPropagation(); showMenu(more, more.closest('.mb').dataset.mid); return; }
            const q = e.target.closest('.mb-reply'); if (q) jumpTo(q.dataset.goto);
        });
        th.addEventListener('contextmenu', (e) => { const b = e.target.closest('.mb'); if (b && !e.target.closest('.mb-img')) { e.preventDefault(); showMenu(b.querySelector('.mb-more') || b, b.dataset.mid); } });
        renderPin(); renderCtx(); renderThread();
    }
    const msgById = (id) => msgs.find((x) => x.id === id);
    const snippet = (x) => { const t = String((x && x.text) || '').trim(); return (t ? t : (x && x.img ? tx('Фото') : '')).slice(0, 100); };
    const canDelete = (c, x) => x.from === me.uid || (isGroup(c) && c.createdBy === me.uid);
    const canPin = (c) => !isGroup(c) || c.createdBy === me.uid;
    function nameOf(c, uid) {
        if (uid === me.uid) return myName;
        const L = liveDir[uid]; const n = L ? [L.name, L.surname].filter(Boolean).join(' ') : '';
        return n || (c.names || {})[uid] || ((c.nicks || {})[uid] ? '@' + c.nicks[uid] : '…');
    }
    function jumpTo(id) {
        const el = document.querySelector('#msgThread .mb[data-mid="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'); if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400);
    }
    function renderPin() {
        const el = document.getElementById('msgPin'); if (!el) return;
        const c = chats.find((x) => x.id === openId); const p = c && c.pinned;
        if (!p || !p.mid) { el.hidden = true; el.innerHTML = ''; return; }
        el.hidden = false;
        el.innerHTML = `<span class="msg-pin-ic">${ic('pin')}</span><button type="button" class="msg-pin-t" id="msgPinGo"><strong>${esc(tx('Закреплённое сообщение'))}</strong><span>${esc(p.text || '')}</span></button>${canPin(c) ? `<button type="button" class="msg-pin-x" id="msgPinX" aria-label="${esc(tx('Открепить'))}" title="${esc(tx('Открепить'))}">${ic('x')}</button>` : ''}`;
        document.getElementById('msgPinGo').onclick = () => jumpTo(p.mid);
        const x = document.getElementById('msgPinX'); if (x) x.onclick = () => togglePin(p.mid);
    }
    function renderCtx() {
        const el = document.getElementById('msgCtx'); if (!el) return;
        const c = chats.find((x) => x.id === openId);
        if (editing) { el.hidden = false; el.innerHTML = `<span class="msg-ctx-ic">${ic('pencil')}</span><span class="msg-ctx-t"><strong>${esc(tx('Редактирование'))}</strong><span>${esc(editing.orig)}</span></span><button type="button" class="msg-ctx-x" aria-label="${esc(tx('Отмена'))}">${ic('x')}</button>`; }
        else if (replyTo) { el.hidden = false; el.innerHTML = `<span class="msg-ctx-ic">${ic('reply')}</span><span class="msg-ctx-t"><strong>${esc(tx('Ответ') + ': ' + replyTo.name)}</strong><span>${esc(replyTo.text)}</span></span><button type="button" class="msg-ctx-x" aria-label="${esc(tx('Отмена'))}">${ic('x')}</button>`; }
        else { el.hidden = true; el.innerHTML = ''; return; }
        el.querySelector('.msg-ctx-x').onclick = cancelCtx;
    }
    function cancelCtx() { const was = editing; replyTo = null; editing = null; renderCtx(); if (was) { const ta = document.getElementById('msgText'); if (ta) { ta.value = ''; ta.style.height = 'auto'; } } }
    function startReply(id) { const c = chats.find((x) => x.id === openId), x = msgById(id); if (!c || !x) return; editing = null; replyTo = { id, from: x.from, name: nameOf(c, x.from), text: snippet(x) }; renderCtx(); const ta = document.getElementById('msgText'); if (ta) ta.focus(); }
    function startEdit(id) { const x = msgById(id); if (!x || x.from !== me.uid || x.img && !String(x.text || '').trim()) return; replyTo = null; editing = { id, orig: snippet(x) }; renderCtx(); const ta = document.getElementById('msgText'); if (ta) { ta.value = x.text; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; ta.focus(); } }
    async function saveEdit(text) {
        const e = editing; const x = e && msgById(e.id); const c = chats.find((q) => q.id === openId); if (!x || !c) { cancelCtx(); return; }
        const ta = document.getElementById('msgText');
        if (text === String(x.text || '').trim()) { cancelCtx(); return; }
        try {
            await db.collection('chats').doc(openId).collection('messages').doc(e.id).update({ text: text.slice(0, 2000), edited: true, editedAt: Date.now() });
            const last = msgs.length && msgs[msgs.length - 1].id === e.id;
            if (last) await db.collection('chats').doc(openId).update({ lastText: text.slice(0, 120) });
            if (c.pinned && c.pinned.mid === e.id) await db.collection('chats').doc(openId).update({ pinned: Object.assign({}, c.pinned, { text: text.slice(0, 100) }) });
            editing = null; if (ta) { ta.value = ''; ta.style.height = 'auto'; } renderCtx();
        } catch (err) { alert(tx('Не удалось сохранить: ') + err.message); }
    }
    async function togglePin(id) {
        const c = chats.find((x) => x.id === openId), x = msgById(id); if (!c || !canPin(c)) return;
        try {
            if (c.pinned && c.pinned.mid === id) { await db.collection('chats').doc(openId).update({ pinned: null }); c.pinned = null; }
            else if (x) { const p = { mid: id, text: snippet(x), by: me.uid, name: nameOf(c, x.from) }; await db.collection('chats').doc(openId).update({ pinned: p }); c.pinned = p; }
            renderPin(); renderThread();
        } catch (err) { alert(tx('Не удалось: ') + err.message); }
    }
    async function deleteMsg(id) {
        const c = chats.find((x) => x.id === openId), x = msgById(id); if (!c || !x || !canDelete(c, x)) return;
        if (!confirm(tx('Удалить сообщение?'))) return;
        try {
            await db.collection('chats').doc(openId).collection('messages').doc(id).delete();
            const upd = {}; const rest = msgs.filter((m) => m.id !== id), prev = rest[rest.length - 1];
            if (msgs.length && msgs[msgs.length - 1].id === id) { upd.lastText = prev ? snippet(prev).slice(0, 120) : ''; upd.lastFrom = prev ? prev.from : ''; if (!prev) upd.lastText = ''; }
            if (c.pinned && c.pinned.mid === id) upd.pinned = null;
            if (replyTo && replyTo.id === id) { replyTo = null; renderCtx(); }
            if (Object.keys(upd).length) await db.collection('chats').doc(openId).update(upd);
        } catch (err) { alert(tx('Не удалось удалить: ') + err.message); }
    }
    let menuEl = null;
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } document.removeEventListener('click', closeMenu, true); document.removeEventListener('keydown', menuKey, true); const t = document.getElementById('msgThread'); if (t) t.removeEventListener('scroll', closeMenu); }
    function menuKey(e) { if (e.key === 'Escape') closeMenu(); }
    function showMenu(anchor, id) {
        closeMenu();
        const c = chats.find((q) => q.id === openId), x = msgById(id); if (!c || !x) return;
        const items = [['reply', 'Ответить', () => startReply(id)]];
        if (String(x.text || '').trim()) items.push(['copy', 'Копировать', () => { try { navigator.clipboard.writeText(x.text); } catch (e) {} }]);
        if (x.from === me.uid && String(x.text || '').trim() && !(x.img && !String(x.text).trim())) items.push(['pencil', 'Изменить', () => startEdit(id)]);
        if (canPin(c)) items.push(['pin', c.pinned && c.pinned.mid === id ? 'Открепить' : 'Закрепить', () => togglePin(id)]);
        if (canDelete(c, x)) items.push(['trash', 'Удалить', () => deleteMsg(id), 'danger']);
        const el = document.createElement('div'); el.className = 'mb-menu'; el.setAttribute('role', 'menu');
        el.innerHTML = items.map((it, i) => `<button type="button" role="menuitem" data-i="${i}" class="${it[3] || ''}">${ic(it[0])}<span>${esc(tx(it[1]))}</span></button>`).join('');
        document.body.appendChild(el); menuEl = el;
        el.querySelectorAll('button').forEach((b) => b.onclick = (e) => { e.stopPropagation(); const f = items[+b.dataset.i][2]; closeMenu(); f(); });
        const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
        el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
        el.style.top = Math.max(8, (r.bottom + h + 8 > window.innerHeight ? r.top - h - 4 : r.bottom + 4)) + 'px';
        setTimeout(() => { document.addEventListener('click', closeMenu, true); document.addEventListener('keydown', menuKey, true); const t = document.getElementById('msgThread'); if (t) t.addEventListener('scroll', closeMenu, { once: true }); }, 0);
    }
    function renderThread() {
        const t = document.getElementById('msgThread'); if (!t) return;
        const c = chats.find((x) => x.id === openId); if (!c) return;
        const near = t.scrollHeight - t.scrollTop - t.clientHeight < 80;
        const grp = isGroup(c); let last = '', lastFrom = '';
        t.innerHTML = msgs.length ? msgs.map((x) => { const k = dayKey(x.ts); const sep = k !== last ? `<div class="msg-day">${esc(dayLabel(x.ts))}</div>` : ''; const newDay = k !== last; last = k;
            const mine = x.from === me.uid;
            const head = grp && !mine && (newDay || lastFrom !== x.from) ? `<div class="mb-from">${esc(nameOf(c, x.from))}${roleTag((c.roles || {})[x.from])}${c.createdBy === x.from ? `<span class="msg-role o">${esc(tx('Создатель'))}</span>` : ''}</div>` : '';
            lastFrom = x.from;
            const rp = x.replyTo ? `<button type="button" class="mb-reply" data-goto="${esc(x.replyTo.id)}"><strong>${esc(x.replyTo.name || '')}</strong><span>${esc(x.replyTo.text || '')}</span></button>` : '';
            const pinned = c.pinned && c.pinned.mid === x.id ? `<span class="mb-pinned" title="${esc(tx('Закреплено'))}">${ic('pin')}</span>` : '';
            return sep + `<div class="mb ${mine ? 'mine' : ''}" data-mid="${esc(x.id)}">${head}${rp}${x.img && /^data:image\/(jpeg|png|webp);base64,/.test(x.img) ? `<img class="mb-img" src="${x.img}" alt="" loading="lazy">` : ''}${String(x.text || '').trim() ? `<div class="mb-t">${esc(x.text)}</div>` : ''}<time>${pinned}${x.edited ? esc(tx('изменено')) + ' · ' : ''}${esc(hhmm(x.ts))}</time><button type="button" class="mb-more" aria-label="${esc(tx('Действия'))}" aria-haspopup="menu">${ic('more')}</button></div>`; }).join('')
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
            const mm = { from: me.uid, text: cap || ' ', img, ts }; if (replyTo) mm.replyTo = replyTo;
            await db.collection('chats').doc(openId).collection('messages').add(mm); replyTo = null; renderCtx();
            const names = Object.assign({}, c.names || {}, { [me.uid]: myName }), nicks = Object.assign({}, c.nicks || {}, { [me.uid]: myNick }), roles = Object.assign({}, c.roles || {}, { [me.uid]: myRole });
            const reads = Object.assign({}, c.reads || {}, { [me.uid]: ts });
            await db.collection('chats').doc(openId).update({ lastText: cap || (window.X ? window.X('Фото') : 'Фото'), lastTs: ts, lastFrom: me.uid, lastName: myName, names, nicks, roles, reads });
        } catch (err) { alert((window.X ? window.X('Не удалось отправить: ') : 'Не удалось отправить: ') + err.message); }
        if (btn) btn.disabled = false;
    }

    async function markRead(id) {
        const c = chats.find((x) => x.id === id); if (!c || !isUnread(c)) return;
        const reads = Object.assign({}, c.reads || {}, { [me.uid]: Date.now() }); c.reads = reads; renderList();
        db.collection('chats').doc(id).update({ reads }).catch(() => {});
    }
    function openChat(id) {
        openId = id; mobileChat = true; firstLoad = true; msgs = []; replyTo = null; editing = null; closeMenu();
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
        if (editing) return saveEdit(text);
        ta.value = ''; ta.style.height = 'auto'; const ts = Date.now(); const rp = replyTo; replyTo = null; renderCtx();
        try {
            const mm = { from: me.uid, text: text.slice(0, 2000), ts }; if (rp) mm.replyTo = rp;
            await db.collection('chats').doc(openId).collection('messages').add(mm);
            const names = Object.assign({}, c.names || {}, { [me.uid]: myName }), nicks = Object.assign({}, c.nicks || {}, { [me.uid]: myNick }), roles = Object.assign({}, c.roles || {}, { [me.uid]: myRole });
            const reads = Object.assign({}, c.reads || {}, { [me.uid]: ts });
            await db.collection('chats').doc(openId).update({ lastText: text.slice(0, 120), lastTs: ts, lastFrom: me.uid, lastName: myName, names, nicks, roles, reads });
        } catch (err) { ta.value = text; alert((window.X ? window.X('Не удалось отправить: ') : 'Не удалось отправить: ') + err.message); }
    }

    // ── groups ──
    function modal(html, cls) {
        const o = document.createElement('div'); o.className = 'gm-ov';
        o.innerHTML = `<div class="gm ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
        const close = () => { o.remove(); document.removeEventListener('keydown', onk, true); };
        const onk = (e) => { if (e.key === 'Escape') close(); };
        o.addEventListener('mousedown', (e) => { if (e.target === o) close(); });
        document.addEventListener('keydown', onk, true); document.body.appendChild(o);
        o.querySelectorAll('[data-close]').forEach((b) => b.onclick = close);
        return { el: o.firstElementChild, close };
    }
    // people picker: search field + results; onPick(user) is called for the chosen person
    function picker(host, exclude, onPick) {
        host.innerHTML = `<input type="text" class="gm-inp" placeholder="${esc(tx('Имя, фамилия или @никнейм'))}" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="60"><div class="gm-res"></div>`;
        const inp = host.querySelector('input'), res = host.querySelector('.gm-res'); let seq = 0, tm = null;
        inp.addEventListener('input', () => {
            clearTimeout(tm); const q = inp.value;
            if (norm(q).replace(/^@/, '').trim().length < 2) { res.innerHTML = ''; return; }
            tm = setTimeout(async () => {
                const sq = ++seq; const r = (await searchUsers(q)).filter((u) => !exclude().has(u.uid)); if (sq !== seq) return;
                res.innerHTML = r.length ? r.map((u, i) => `<button type="button" class="msg-sug-i" data-i="${i}"><span class="msg-av">${esc(initials(u.name || u.nick))}</span><span class="msg-sug-t"><strong>${esc(u.name || '@' + u.nick)}</strong><small>${u.nick ? '@' + esc(u.nick) : ''}</small></span>${roleTag(u.role)}</button>`).join('') : `<div class="msg-find-note err">${esc(tx('Никого не найдено. Проверьте имя или никнейм.'))}</div>`;
                res.querySelectorAll('.msg-sug-i').forEach((b) => b.onclick = () => { onPick(r[+b.dataset.i]); inp.value = ''; res.innerHTML = ''; inp.focus(); });
            }, 250);
        });
        return inp;
    }
    function newGroup() {
        const picked = new Map();
        const m = modal(`<h3>${esc(tx('Новая группа'))}</h3>
            <label class="gm-l">${esc(tx('Название группы'))}<input type="text" id="gmTitle" class="gm-inp" maxlength="60" placeholder="${esc(tx('Например: SAT Math, вечерняя группа'))}"></label>
            <div class="gm-l">${esc(tx('Участники'))}</div><div class="gm-chips" id="gmChips"></div><div id="gmPick"></div>
            <div class="gm-err" id="gmErr"></div>
            <div class="gm-act"><button type="button" class="btn btn-secondary" data-close>${esc(tx('Отмена'))}</button><button type="button" class="btn btn-primary" id="gmCreate">${esc(tx('Создать'))}</button></div>`);
        const chips = m.el.querySelector('#gmChips'), err = m.el.querySelector('#gmErr');
        const paint = () => { chips.innerHTML = Array.from(picked.values()).map((u) => `<span class="gm-chip">${esc(u.name || '@' + u.nick)}<button type="button" data-u="${esc(u.uid)}" aria-label="×">×</button></span>`).join('') || `<span class="gm-hint">${esc(tx('Добавьте хотя бы одного человека'))}</span>`; chips.querySelectorAll('button').forEach((b) => b.onclick = () => { picked.delete(b.dataset.u); paint(); }); };
        paint();
        picker(m.el.querySelector('#gmPick'), () => new Set(picked.keys()), (u) => { if (picked.size < 49) { picked.set(u.uid, u); paint(); } });
        m.el.querySelector('#gmTitle').focus();
        m.el.querySelector('#gmCreate').onclick = async () => {
            const t = m.el.querySelector('#gmTitle').value.trim().slice(0, 60);
            if (!t) { err.textContent = tx('Введите название группы.'); return; }
            if (!picked.size) { err.textContent = tx('Добавьте хотя бы одного человека'); return; }
            const btn = m.el.querySelector('#gmCreate'); btn.disabled = true; err.textContent = '';
            const members = [me.uid].concat(Array.from(picked.keys()));
            const names = { [me.uid]: myName }, nicks = { [me.uid]: myNick }, roles = { [me.uid]: myRole };
            picked.forEach((u) => { names[u.uid] = u.name || ''; nicks[u.uid] = u.nick || ''; roles[u.uid] = u.role || ''; });
            const ts = Date.now();
            const doc = { group: true, title: t, createdBy: me.uid, members, names, nicks, roles, lastText: tx('Группа создана'), lastTs: ts, lastFrom: me.uid, lastName: myName, reads: { [me.uid]: ts } };
            try { const ref = await db.collection('chats').add(doc); if (!chats.find((c) => c.id === ref.id)) chats.push(Object.assign({ id: ref.id }, doc)); m.close(); openChat(ref.id); }
            catch (e) { console.warn(e); err.textContent = tx('Не удалось создать группу: ') + e.message; btn.disabled = false; }
        };
    }
    async function openMembers() {
        const c0 = chats.find((x) => x.id === openId); if (!c0 || !isGroup(c0)) return;
        const m = modal(`<h3 id="gmmTitle"></h3><div class="gm-sub" id="gmmSub"></div><div class="gm-members" id="gmmList"></div><div id="gmmAdd"></div><div class="gm-err" id="gmmErr"></div><div class="gm-act" id="gmmAct"></div>`, 'wide');
        const el = m.el, cur = () => chats.find((x) => x.id === c0.id) || c0;
        const dir = {}; // fresh names/roles from the directory
        const load = async () => { await Promise.all((cur().members || []).filter((u) => !dir[u]).map(async (u) => { try { const d = await db.collection('directory').doc(u).get(); if (d.exists) dir[u] = d.data(); } catch (e) {} })); };
        const paint = () => {
            const c = cur(), mine = c.createdBy === me.uid;
            el.querySelector('#gmmTitle').innerHTML = `${esc(c.title)}${mine ? ` <button type="button" class="gm-ren" id="gmRen" aria-label="${esc(tx('Переименовать'))}" title="${esc(tx('Переименовать'))}">${ic('pencil')}</button>` : ''}`;
            el.querySelector('#gmmSub').textContent = (c.members || []).length + ' ' + plural((c.members || []).length);
            const mem = (c.members || []).slice().sort((a, b) => (a === c.createdBy ? -1 : b === c.createdBy ? 1 : 0));
            el.querySelector('#gmmList').innerHTML = mem.map((u) => { const d = dir[u]; const nm = d ? [d.name, d.surname].filter(Boolean).join(' ') : nameOf(c, u), nk = d ? d.nickname : (c.nicks || {})[u], rl = d ? d.role : (c.roles || {})[u];
                return `<div class="gm-mem"><span class="msg-av">${esc(initials(nm || nk))}</span><span class="gm-mt"><strong>${esc(nm || (nk ? '@' + nk : '…'))}${u === me.uid ? ` <em>(${esc(tx('вы'))})</em>` : ''}</strong><small>${nk ? '@' + esc(nk) : ''}</small></span>${roleTag(rl)}${u === c.createdBy ? `<span class="msg-role o">${esc(tx('Создатель'))}</span>` : ''}${mine && u !== me.uid ? `<button type="button" class="gm-rm" data-u="${esc(u)}" aria-label="${esc(tx('Удалить из группы'))}" title="${esc(tx('Удалить из группы'))}">${ic('x')}</button>` : ''}</div>`; }).join('');
            el.querySelector('#gmmAct').innerHTML = `${mine ? `<button type="button" class="btn btn-secondary gm-danger" id="gmDel">${esc(tx('Удалить группу'))}</button>` : `<button type="button" class="btn btn-secondary gm-danger" id="gmLeave">${esc(tx('Покинуть группу'))}</button>`}<button type="button" class="btn btn-primary" data-close>${esc(tx('Закрыть'))}</button>`;
            el.querySelectorAll('[data-close]').forEach((b) => b.onclick = m.close);
            const ren = el.querySelector('#gmRen'); if (ren) ren.onclick = async () => { const n = (prompt(tx('Название группы'), c.title) || '').trim().slice(0, 60); if (n && n !== c.title) { try { await db.collection('chats').doc(c.id).update({ title: n }); c.title = n; paint(); const h = document.getElementById('msgHeadInfo'); if (h) h.innerHTML = headInfo(c); renderList(); } catch (e) { err(e); } } };
            el.querySelectorAll('.gm-rm').forEach((b) => b.onclick = async () => { const u = b.dataset.u; if (!confirm(tx('Удалить из группы?'))) return; try { const members = c.members.filter((x) => x !== u); await db.collection('chats').doc(c.id).update({ members }); c.members = members; paint(); const h = document.getElementById('msgHeadInfo'); if (h) h.innerHTML = headInfo(c); } catch (e) { err(e); } });
            const del = el.querySelector('#gmDel'); if (del) del.onclick = async () => { if (!confirm(tx('Удалить группу для всех?'))) return; try { await db.collection('chats').doc(c.id).delete(); m.close(); chats = chats.filter((x) => x.id !== c.id); openId = ''; renderMain(); renderList(); } catch (e) { err(e); } };
            const lv = el.querySelector('#gmLeave'); if (lv) lv.onclick = async () => { if (!confirm(tx('Покинуть группу?'))) return; try { await db.collection('chats').doc(c.id).update({ members: c.members.filter((x) => x !== me.uid) }); m.close(); chats = chats.filter((x) => x.id !== c.id); openId = ''; renderMain(); renderList(); } catch (e) { err(e); } };
        };
        const err = (e) => { el.querySelector('#gmmErr').textContent = tx('Не удалось: ') + (e && e.message || e); };
        paint(); await load(); paint();
        if (cur().createdBy === me.uid) {
            el.querySelector('#gmmAdd').innerHTML = `<div class="gm-l">${esc(tx('Добавить участника'))}</div><div id="gmmPick"></div>`;
            picker(el.querySelector('#gmmPick'), () => new Set(cur().members || []), async (u) => {
                const c = cur(); if ((c.members || []).length >= 50) return err(new Error('max 50'));
                try {
                    const members = c.members.concat([u.uid]);
                    const names = Object.assign({}, c.names, { [u.uid]: u.name || '' }), nicks = Object.assign({}, c.nicks, { [u.uid]: u.nick || '' }), roles = Object.assign({}, c.roles, { [u.uid]: u.role || '' });
                    await db.collection('chats').doc(c.id).update({ members, names, nicks, roles });
                    Object.assign(c, { members, names, nicks, roles }); dir[u.uid] = { name: u.name, nickname: u.nick, role: u.role }; paint();
                    const h = document.getElementById('msgHeadInfo'); if (h) h.innerHTML = headInfo(c);
                } catch (e) { err(e); }
            });
        }
    }

    function listen() {
        unsubs.push(db.collection('chats').where('members', 'array-contains', me.uid).onSnapshot((snap) => {
                        chats = []; snap.forEach((d) => chats.push(Object.assign({ id: d.id }, d.data())));
            firstSnap = false; watchPeople();
            if (!box.querySelector('#msgRoot')) return;
            renderList(); if (openId) markRead(openId);
            if (pendingGid && chats.find((c) => c.id === pendingGid)) { const g = pendingGid; pendingGid = ''; openChat(g); }
            if (openId && chats.find((c) => c.id === openId) && document.getElementById('msgThread')) { renderPin(); const h = document.getElementById('msgHeadInfo'), cc = chats.find((c) => c.id === openId); if (h && cc) h.innerHTML = headInfo(cc); renderThread(); }
            if (openId) { const head = document.querySelector('#msgMain .msg-head'); if (head && !chats.find((c) => c.id === openId)) { openId = ''; renderMain(); } }
        }, (e) => { console.warn('chats', e); const l = document.getElementById('msgList'); if (l) l.innerHTML = '<div class="tc-empty">Сообщения пока недоступны (нужно опубликовать новые правила Firestore).</div>'; }));
    }
    let firstSnap = true, pendingGid = '';

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
            pendingGid = /[?&]gid=([^&#]+)/.test(location.search) ? decodeURIComponent(RegExp.$1) : '';
            shell(); listen(); window.dispatchEvent(new Event('starth-msg-shell'));
            if (/[?&#]chat=([^&]+)/.test(location.href)) { const n = decodeURIComponent(RegExp.$1).toLowerCase().replace(/^@/, ''); setTimeout(async () => { const r = await searchUsers(n); const u = r.find((x) => norm(x.nick) === n) || r[0]; if (u) openWith(u.uid, u.name, u.nick, u.role); }, 600); }
        }
    };
})();
