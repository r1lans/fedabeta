/* TheStarth — notifications about new messenger messages, on every page of the site.
 *
 *  - badge with the number of unread chats on the "Мессенджер" menu button
 *  - "(2) " in front of the tab title, so it is visible from another tab
 *  - system notification (Notification API) when the tab is in the background / another window is in front
 *  - toast + soft sound when the person is on the site but not looking at that chat
 *
 * It listens to chats/{id} (the same documents the messenger uses: lastFrom, lastTs, reads) — no new Firestore rules needed.
 * The tab has to stay open (a closed site cannot receive anything without a server — see FIREBASE_SETUP.md).
 * Loaded by app.js after sign-in.
 */
(function () {
    'use strict';
    if (window.StarthNotify) return;
    const X = (s) => (window.X ? window.X(s) : s);
    const LS = 'starth_notify_sound';
    const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

    let me = null, unsub = null, chats = [], baseline = new Map(), first = true, seen = new Set(), titleBase = '', audio = null;

    const other = (c) => { const uid = (c.members || []).find((u) => u !== me.uid) || ''; return { uid, name: (c.names || {})[uid] || '', nick: (c.nicks || {})[uid] || '' }; };
    const who = (c) => { const o = other(c); return o.name || (o.nick ? '@' + o.nick : X('Новое сообщение')); };
    const isUnread = (c) => c.lastFrom && c.lastFrom !== me.uid && (c.lastTs || 0) > ((c.reads || {})[me.uid] || 0);
    const onMessengerPage = () => /messenger\.html/.test(location.pathname);
    const openChatId = () => (window.Messenger && window.Messenger.openId ? window.Messenger.openId() : '');
    const lookingAtIt = (c) => onMessengerPage() && openChatId() === c.id && document.visibilityState === 'visible' && document.hasFocus();
    const supported = () => 'Notification' in window;
    const soundOn = () => store.get(LS) !== '0';

    // ---- badge + title ----
    function paint() {
        const n = me ? chats.filter(isUnread).length : 0;
        document.querySelectorAll('a.nav-msg-link').forEach((a) => { if (n) a.setAttribute('data-unread', n > 9 ? '9+' : String(n)); else a.removeAttribute('data-unread'); });
        const base = document.title.replace(/^\(\d+\+?\)\s/, '');
        document.title = n ? '(' + n + ') ' + base : base;
    }

    // ---- sound (short two-tone ping, made with WebAudio so there is no file to ship) ----
    function ping() {
        if (!soundOn()) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
            audio = audio || new AC(); if (audio.state === 'suspended') audio.resume();
            const t0 = audio.currentTime;
            [[880, 0], [1175, 0.11]].forEach(([f, dt]) => {
                const o = audio.createOscillator(), g = audio.createGain();
                o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audio.destination);
                g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.22);
                o.start(t0 + dt); o.stop(t0 + dt + 0.25);
            });
        } catch (e) {}
    }

    function openFromNotification(c) {
        try { window.focus(); } catch (e) {}
        if (onMessengerPage() && window.Messenger && window.Messenger.openById) { window.Messenger.openById(c.id); return; }
        const o = other(c); location.href = 'messenger.html' + (o.nick ? '?chat=' + encodeURIComponent(o.nick) : '');
    }

    function system(c) {
        if (!supported() || Notification.permission !== 'granted') return false;
        try {
            const n = new Notification(who(c), { body: c.lastText || X('Фото'), tag: 'starth-chat-' + c.id, renotify: true, icon: 'images/favicon-192.png' });
            n.onclick = () => { try { n.close(); } catch (e) {} openFromNotification(c); };
            setTimeout(() => { try { n.close(); } catch (e) {} }, 12000);
            return true;
        } catch (e) { return false; }
    }

    function incoming(c) {
        const key = c.id + ':' + c.lastTs; if (seen.has(key)) return; seen.add(key);
        if (lookingAtIt(c)) return;                                       // reading it right now — messenger marks it as read
        const away = document.visibilityState !== 'visible' || !document.hasFocus();
        ping();
        if (away) { system(c); return; }
        if (window.showToast) window.showToast(X('Новое сообщение от ') + who(c), 'message');
    }

    // ---- controls on the messenger page ----
    function mount() {
        const el = document.getElementById('msgNotifyBox'); if (!el) return;
        if (!supported()) { el.innerHTML = ''; return; }
        const p = Notification.permission;
        const snd = `<label class="mn-snd"><input type="checkbox" ${soundOn() ? 'checked' : ''}> ${esc(X('Звук'))}</label>`;
        if (p === 'granted') el.innerHTML = `<div class="mn mn-ok"><span>${esc(X('Уведомления включены'))}</span>${snd}</div>`;
        else if (p === 'denied') el.innerHTML = `<div class="mn mn-off"><span>${esc(X('Уведомления выключены в браузере. Разрешите их для этого сайта (значок замка рядом с адресом).'))}</span>${snd}</div>`;
        else el.innerHTML = `<div class="mn"><span>${esc(X('Получайте уведомления, когда вам пишут'))}</span><button type="button" class="mn-btn">${esc(X('Включить'))}</button></div>`;
        const b = el.querySelector('.mn-btn');
        if (b) b.onclick = () => { try { const r = Notification.requestPermission(() => {}); if (r && r.then) r.then(mount); else setTimeout(mount, 300); } catch (e) {} ping(); };
        const cb = el.querySelector('.mn-snd input');
        if (cb) cb.onchange = () => { store.set(LS, cb.checked ? '1' : '0'); if (cb.checked) ping(); };
    }
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---- listener ----
    function stop() { if (unsub) { try { unsub(); } catch (e) {} unsub = null; } chats = []; baseline = new Map(); first = true; seen = new Set(); paint(); }
    function start(user) {
        stop(); me = user;
        if (!user || typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY || typeof db === 'undefined' || !db) return;
        const database = db;
        unsub = database.collection('chats').where('members', 'array-contains', user.uid).onSnapshot((snap) => {
            const prev = baseline; baseline = new Map(); chats = [];
            snap.forEach((d) => { const c = Object.assign({ id: d.id }, d.data()); chats.push(c); baseline.set(c.id, c.lastTs || 0); });
            if (!first) chats.forEach((c) => { if (c.lastFrom && c.lastFrom !== me.uid && (c.lastTs || 0) > (prev.get(c.id) || 0)) incoming(c); });
            first = false; paint();
        }, (e) => console.warn('notify', e));
    }

    window.StarthNotify = { mount, paint, test() { incoming({ id: 'test', members: [me && me.uid, 'x'], names: { x: 'Test' }, lastFrom: 'x', lastTs: Date.now(), lastText: 'Hello' }); } };
    window.addEventListener('starth-msg-shell', mount);
    window.addEventListener('starth-lang-changed', paint);
    document.addEventListener('visibilitychange', paint);
    window.addEventListener('focus', paint);
    window.addEventListener('starth-auth-ready', (e) => start(e.detail && e.detail.user));
    if (window.currentAuthUser) start(window.currentAuthUser);
    mount();
})();
