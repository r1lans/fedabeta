/* TheStarth — presence (online / in a lesson / offline) and live role changes.
 *   presence/<uid> { state:'online'|'lesson', ts, show:bool }   heartbeat every 40 s while the tab is visible.
 *   A person is "offline" when the heartbeat is older than 100 s, or the document is missing.
 *   If the person turned off «показывать мой статус» (profile editor), `show` is false and others see nothing.
 * API: StarthPresence.setLesson(bool) · .refresh() · .watch(uid, cb) -> unsubscribe · .status(doc) -> 'online'|'lesson'|'offline'|'' · .label(status) · .dot(status)
 * Also: watches my own users/<uid> role and my admins/<uid> record. When one changes (an admin changed it) the page shows a toast and reloads,
 * so the new role/access applies at once.
 */
(function () {
    'use strict';
    if (window.StarthPresence) return;
    const STALE = 100000, BEAT = 40000;
    let me = null, inLesson = false, timer = null, showStatus = true, watchers = [];
    const L = { ru: { online: 'в сети', lesson: 'на уроке', offline: 'не в сети' }, uz: { online: 'onlayn', lesson: 'darsda', offline: 'oflayn' }, en: { online: 'online', lesson: 'in a lesson', offline: 'offline' } };
    const lang = () => { try { return localStorage.getItem('starthLang') || 'ru'; } catch (e) { return 'ru'; } };

    function status(p) {
        if (!p) return 'offline';
        if (p.show === false) return '';
        if (!p.ts || Date.now() - p.ts > STALE) return 'offline';
        return p.state === 'lesson' ? 'lesson' : 'online';
    }
    const label = (s) => (s ? (L[lang()] || L.ru)[s] : '');
    const dot = (s) => (s ? `<i class="pres-dot pres-${s}" title="${label(s)}"></i>` : '');

    function write(state) {
        if (!me || typeof db === 'undefined') return;
        const profile = window.currentUserProfile || {};
        showStatus = profile.showStatus !== false;
        db.collection('presence').doc(me.uid).set({ state, ts: Date.now(), show: showStatus }).catch(() => {});
    }
    const cur = () => (inLesson ? 'lesson' : 'online');
    function beat() { if (document.visibilityState === 'visible' || inLesson) write(cur()); }
    function start(user) {
        stop(); me = user; if (!me) return;
        write(cur()); timer = setInterval(beat, BEAT);
        watchSelf();
    }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    function goOffline() { if (me && typeof db !== 'undefined') db.collection('presence').doc(me.uid).set({ state: 'online', ts: 0, show: showStatus }).catch(() => {}); }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat(); });
    window.addEventListener('pagehide', goOffline);

    function watch(uid, cb) {
        if (!uid || typeof db === 'undefined') return () => {};
        let last = null;
        const un = db.collection('presence').doc(uid).onSnapshot((d) => { last = d.exists ? d.data() : null; cb(last); }, () => { last = null; cb(null); });
        const iv = setInterval(() => { try { cb(last); } catch (e) {} }, 30000);   // "stale" changes with time even if nothing is written
        return () => { try { un(); } catch (e) {} clearInterval(iv); };
    }

    // ── live role / admin access ──
    let selfUnsubs = [];
    function toast(text) {
        const t = document.createElement('div'); t.className = 'role-toast'; t.setAttribute('role', 'status'); t.textContent = text;
        document.body.appendChild(t); setTimeout(() => t.classList.add('show'), 20);
    }
    const roleText = { ru: { teacher: 'Преподаватель', student: 'Ученик' }, uz: { teacher: "O'qituvchi", student: "O'quvchi" }, en: { teacher: 'Teacher', student: 'Student' } };
    function watchSelf() {
        selfUnsubs.forEach((u) => { try { u(); } catch (e) {} }); selfUnsubs = [];
        let role0, first = true, adm0, firstA = true;
        selfUnsubs.push(db.collection('users').doc(me.uid).onSnapshot((d) => {
            if (!d.exists) return; const x = d.data(); const r = x.role === 'teacher' ? 'teacher' : 'student';
            if (window.currentUserProfile) { window.currentUserProfile.showStatus = x.showStatus; }
            if (first) { first = false; role0 = r; return; }
            if (r !== role0) {
                role0 = r; const lg = lang(); const T = { ru: 'Ваша роль изменена: ', uz: "Rolingiz o'zgardi: ", en: 'Your role was changed: ' };
                toast((T[lg] || T.ru) + (roleText[lg] || roleText.ru)[r]); setTimeout(() => location.reload(), 2200);
            }
        }, () => {}));
        selfUnsubs.push(db.collection('admins').doc(me.uid).onSnapshot((d) => {
            if (firstA) { firstA = false; adm0 = d.exists; return; }
            if (d.exists !== adm0) { adm0 = d.exists; setTimeout(() => location.reload(), 600); }   // silent: the admin link appears / disappears
        }, () => {}));
    }

    window.StarthPresence = {
        setLesson(v) { inLesson = !!v; write(cur()); },
        refresh() { write(cur()); },
        watch, status, label, dot
    };
    window.addEventListener('starth-profile-changed', () => write(cur()));
    window.addEventListener('starth-auth-ready', (e) => start(e.detail && e.detail.user));
    if (window.currentAuthUser) start(window.currentAuthUser);
})();
