/* TheStarth — "Напоминания" block in the student cabinet.
 * Built from data that already exists (no server needed):
 *   - lessons today / tomorrow (schedule + group schedule text like "Пн / Ср / Пт, 18:00"),
 *   - homework left by the teacher that the student has not marked as done (users/<uid>.hwDone),
 *   - missed lessons of the last 14 days (attendance "absent" / schedule status "missed").
 * Needs db, Icons, #remindersSection.
 */
(function () {
    'use strict';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ic = (n) => (window.Icons ? window.Icons.svg(n) : '');
    const pad = (n) => String(n).padStart(2, '0');
    const dstr = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const fmt = (iso) => { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '.' + p[1] : iso; };
    const DAY_RX = [/^пн|^mon|^du/i, /^вт|^tue|^se/i, /^ср|^wed|^ch/i, /^чт|^thu|^pa/i, /^пт|^fri|^ju/i, /^сб|^sat|^sh/i, /^вс|^sun|^ya/i]; // Mon..Sun
    const HW_DAYS = 14, MISS_DAYS = 14;

    let uid = '', nick = '', profile = {}, sched = [], groups = [], att = [], hwDone = [], unsubs = [], box = null;

    // "Пн / Ср / Пт, 18:00" → { days:[0,2,4] (Mon=0), time:'18:00' }
    function parseScheduleText(txt) {
        const s = String(txt || '');
        const tm = s.match(/(\d{1,2})[:.](\d{2})/);
        const days = [];
        s.split(/[\s,\/;·\-–—]+/).forEach((w) => { DAY_RX.forEach((rx, i) => { if (w.length >= 2 && w.length <= 10 && rx.test(w) && days.indexOf(i) === -1) days.push(i); }); });
        return { days, time: tm ? pad(+tm[1]) + ':' + tm[2] : '' };
    }
    const monIdx = (d) => (d.getDay() + 6) % 7;

    function build() {
        const items = [];          // {kind, icon, title, text, action?}
        const now = new Date(), today = dstr(now);
        const tom = new Date(now.getTime() + 864e5), tomorrow = dstr(tom);

        // lessons (individual)
        sched.filter((s) => (s.date === today || s.date === tomorrow) && s.status !== 'done' && s.status !== 'missed')
            .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
            .forEach((s) => items.push({ kind: 'lesson', icon: 'clock', tone: s.date === today ? 'hot' : '', sort: 0,
                title: (s.date === today ? 'Сегодня' : 'Завтра') + ' урок в ' + (s.time || ''),
                text: 'Преподаватель: ' + (s.teacherName || '') + (s.subject ? ' · ' + s.subject : ''),
                href: s.room ? 'video-lesson.html?room=' + encodeURIComponent(s.room) : '', cta: 'Войти на урок' }));
        // lessons (groups, by schedule text)
        groups.filter((g) => !g.archived).forEach((g) => {
            const p = parseScheduleText(g.scheduleText);
            [[now, 'Сегодня', 'hot'], [tom, 'Завтра', '']].forEach(([d, label, tone]) => {
                if (p.days.indexOf(monIdx(d)) !== -1) items.push({ kind: 'lesson', icon: 'clock', tone, sort: label === 'Сегодня' ? 0 : 1,
                    title: label + ' урок группы «' + g.name + '»' + (p.time ? ' в ' + p.time : ''), text: 'Преподаватель: ' + (g.teacherName || ''),
                    href: g.room ? 'video-lesson.html?room=' + encodeURIComponent(g.room) + '&group=' + encodeURIComponent(g.id) : '', cta: label === 'Сегодня' ? 'Войти на урок' : '' });
            });
        });
        // homework
        const since = dstr(new Date(now.getTime() - HW_DAYS * 864e5));
        sched.filter((s) => s.homework && s.homework.trim() && s.date >= since && hwDone.indexOf(s.id) === -1)
            .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
            .forEach((s) => items.push({ kind: 'hw', icon: 'note', tone: 'warn', sort: 2, hwId: s.id,
                title: 'Домашнее задание от ' + fmt(s.date), text: s.homework.trim().slice(0, 240) + (s.homework.length > 240 ? '…' : ''), cta: 'Сделано' }));
        // missed lessons
        const missSince = dstr(new Date(now.getTime() - MISS_DAYS * 864e5));
        const gname = {}; groups.forEach((g) => { gname[g.id] = g.name; });
        att.filter((a) => a.date >= missSince && a.marks && a.marks[nick] === 'absent').sort((a, b) => b.date.localeCompare(a.date))
            .forEach((a) => items.push({ kind: 'miss', icon: 'x', tone: 'bad', sort: 3, title: 'Вы пропустили урок ' + fmt(a.date) + (gname[a.groupId] ? ' · ' + gname[a.groupId] : ''),
                text: 'Узнайте у учителя, что было на уроке, и сделайте задание — так вы не отстанете.' + (a.topic ? ' Тема: ' + a.topic + '.' : '') }));
        sched.filter((s) => s.status === 'missed' && s.date >= missSince)
            .forEach((s) => items.push({ kind: 'miss', icon: 'x', tone: 'bad', sort: 3, title: 'Урок ' + fmt(s.date) + ' не состоялся', text: 'Вы не пришли на урок с ' + (s.teacherName || 'преподавателем') + '. Свяжитесь с куратором, чтобы договориться о переносе.' }));
        return items.sort((a, b) => a.sort - b.sort);
    }

    function render() {
        if (!box) return;
        const items = build();
        if (!items.length) { box.innerHTML = ''; return; }
        box.innerHTML = `<h2 class="dash-section-title">Напоминания <span class="rm-count">${items.length}</span></h2>
            <div class="rm-list">${items.map((it, i) => `<div class="rm-item ${esc(it.tone || '')}">
                <span class="rm-ic">${ic(it.icon)}</span>
                <div class="rm-body"><strong>${esc(it.title)}</strong><div>${esc(it.text)}</div></div>
                ${it.href && it.cta ? `<a class="tc-btn primary" href="${esc(it.href)}">${esc(it.cta)}</a>` : ''}
                ${it.hwId ? `<button class="tc-btn" type="button" data-hw="${esc(it.hwId)}">${ic('check')} ${esc(it.cta)}</button>` : ''}</div>`).join('')}</div>`;
        box.querySelectorAll('[data-hw]').forEach((b) => b.addEventListener('click', async () => {
            const id = b.dataset.hw; hwDone.push(id); render();
            try { await db.collection('users').doc(uid).set({ hwDone: firebase.firestore.FieldValue.arrayUnion(id) }, { merge: true }); if (window.currentUserProfile) window.currentUserProfile.hwDone = hwDone.slice(); }
            catch (e) { console.warn('hwDone', e); }
        }));
    }

    window.Reminders = {
        parseScheduleText,
        async init(user, prof) {
            box = document.getElementById('remindersSection');
            if (!box) return;
            unsubs.forEach((u) => { try { u(); } catch (e) {} }); unsubs = [];
            uid = user.uid; profile = prof || {}; nick = profile.nickname || ''; hwDone = Array.isArray(profile.hwDone) ? profile.hwDone.slice() : [];
            if (!nick) { box.innerHTML = ''; return; }
            try {
                const [ss, gs] = await Promise.all([
                    db.collection('schedule').where('studentNickname', '==', nick).get(),
                    db.collection('groups').where('memberUids', 'array-contains', uid).get()
                ]);
                sched = []; ss.forEach((d) => sched.push(Object.assign({ id: d.id }, d.data())));
                groups = []; gs.forEach((d) => groups.push(Object.assign({ id: d.id }, d.data())));
            } catch (e) { console.warn('reminders', e); }
            render();
            try { unsubs.push(db.collection('attendance').where('studentUids', 'array-contains', uid).onSnapshot((snap) => { att = []; snap.forEach((d) => att.push(d.data())); render(); }, () => {})); } catch (e) {}
        }
    };
})();
