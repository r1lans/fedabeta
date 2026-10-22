/* TheStarth — «Не смогу прийти»: a student warns the teacher about missing a lesson.
 *   ≥ 24 h before the lesson → excused: the lesson is not paid to the teacher (and not counted for the student);
 *   < 24 h before            → the teacher is still paid (the place was kept).
 * Notices: Firestore absences/{groupId|s_scheduleId}_{date}_{uid}. Made here (site) or by the Telegram bot (/absent).
 * The Telegram worker tells the teacher about every new notice; the teacher also sees them in the cabinet.
 *   StarthAbsence.renderStudent(el, user, profile)   — upcoming lessons with the button
 *   StarthAbsence.renderTeacher(el, uid) → Promise<number of upcoming notices>
 */
(function () {
    'use strict';
    var X = function (m) { return window.X ? window.X(m) : m; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var S = function () { return window.StarthSalary; };
    var tsMs = function (v) { if (!v) return 0; if (typeof v.toMillis === 'function') return v.toMillis(); if (v.seconds != null) return v.seconds * 1000; if (typeof v === 'number') return v; var t = +new Date(v); return isNaN(t) ? 0 : t; };
    var hoursText = function (h) { h = Math.max(0, Math.floor(h)); if (h >= 48) return Math.floor(h / 24) + ' ' + X('дн.'); return h + ' ' + X('ч'); };
    var fmtDay = function (date, time) {
        try { return new Date(date + 'T12:00:00').toLocaleDateString(window.starthLocale ? window.starthLocale() : 'ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }) + (time ? ', ' + time : ''); }
        catch (e) { return date + ' ' + (time || ''); }
    };

    var CSS = '' +
        '.ab-list{display:flex;flex-direction:column;gap:.6rem}' +
        '.ab-row{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;background:var(--surface);border:1px solid var(--rule);border-radius:14px;padding:.85rem 1rem}' +
        '.ab-date{min-width:64px;text-align:center;background:var(--accent-tint);color:var(--accent);border-radius:10px;padding:.35rem .5rem;font-weight:800;line-height:1.1}' +
        '.ab-date small{display:block;font-weight:600;font-size:.72rem;text-transform:uppercase}' +
        '.ab-main{flex:1 1 220px;min-width:0}.ab-main b{display:block}.ab-main small{color:var(--ink-soft)}' +
        '.ab-pill{font-size:.75rem;font-weight:700;border-radius:99px;padding:3px 10px;white-space:nowrap}' +
        '.ab-pill.ok{background:rgba(46,154,67,.14);color:#2e9a43}.ab-pill.late{background:rgba(201,138,18,.16);color:#b07a0e}' +
        '.ab-btn{border:1px solid var(--rule);background:var(--surface);color:var(--ink);border-radius:9px;padding:.5rem .85rem;font:inherit;font-size:.86rem;font-weight:600;cursor:pointer}' +
        '.ab-btn:hover{border-color:var(--accent-warm);color:var(--accent-warm)}' +
        '.ab-note{font-size:.85rem;color:var(--ink-soft);line-height:1.5;background:var(--paper);border:1px dashed var(--rule);border-radius:12px;padding:.8rem 1rem;margin-bottom:.8rem}' +
        '.ab-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem}' +
        '.ab-modal{background:var(--surface);color:var(--ink);border-radius:18px;max-width:440px;width:100%;padding:1.4rem 1.5rem;box-shadow:0 20px 60px rgba(0,0,0,.3)}' +
        '.ab-modal h3{margin:0 0 .4rem;font-size:1.2rem}.ab-modal p{color:var(--ink-soft);font-size:.9rem;line-height:1.5;margin:.3rem 0 .8rem}' +
        '.ab-modal textarea{width:100%;min-height:80px;border-radius:10px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);padding:.6rem .7rem;font:inherit;resize:vertical}' +
        '.ab-warn{border-radius:10px;padding:.65rem .8rem;font-size:.86rem;line-height:1.45;margin-bottom:.8rem}' +
        '.ab-warn.ok{background:rgba(46,154,67,.12);color:#24823a}.ab-warn.late{background:rgba(201,138,18,.14);color:#9a6a0b}' +
        '.ab-acts{display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem;flex-wrap:wrap}';
    function css() { if (document.getElementById('ab-style')) return; var s = document.createElement('style'); s.id = 'ab-style'; s.textContent = CSS; document.head.appendChild(s); }

    function dateBox(date) {
        var d = new Date(date + 'T12:00:00');
        var wd = d.toLocaleDateString(window.starthLocale ? window.starthLocale() : 'ru-RU', { weekday: 'short' });
        return '<div class="ab-date">' + d.getDate() + '<small>' + esc(wd) + '</small></div>';
    }

    // ── student ──
    async function renderStudent(el, user, profile) {
        if (!el) return; css();
        el.innerHTML = '<div class="ab-note">' + esc(X('Загрузка…')) + '</div>';
        var nick = (profile && profile.nickname) || '';
        var all = function (q) { return S().getAll(q).catch(function () { return []; }); };
        var r = await Promise.all([
            all(db.collection('groups').where('memberUids', 'array-contains', user.uid)),
            nick ? all(db.collection('schedule').where('studentNickname', '==', nick)) : Promise.resolve([]),
            all(db.collection('absences').where('uid', '==', user.uid))
        ]);
        var lessons = S().upcoming(r[0], r[1], 14), mine = {};
        r[2].forEach(function (a) { mine[a.id] = a; });
        var bot = window.STARTH_TG_BOT ? '<a href="https://t.me/' + esc(window.STARTH_TG_BOT) + '" target="_blank" rel="noopener">@' + esc(window.STARTH_TG_BOT) + '</a>' : X('Telegram-бот');
        var head = '<div class="ab-note">' + X('Не сможете прийти — предупредите учителя <b>минимум за 24 часа</b> до урока: здесь или в') + ' ' + bot + ' ' + X('(команда /absent). Если предупредить позже или не предупредить, урок считается проведённым.') + '</div>';
        if (!lessons.length) { el.innerHTML = head + '<div class="ab-note">' + esc(X('В ближайшие 2 недели уроков нет.')) + '</div>'; return; }
        el.innerHTML = head + '<div class="ab-list">' + lessons.map(function (l) {
            var id = S().absenceId(l, user.uid), a = mine[id];
            var right = a
                ? '<span class="ab-pill ' + (a.excused ? 'ok' : 'late') + '">' + (window.Icons ? Icons.svg(a.excused ? 'check' : 'clock') : '') + ' ' + esc(a.excused ? X('Вы предупредили') : X('Предупредили меньше чем за 24 ч')) + '</span>' +
                  (S().lessonAt(l.date, l.time).getTime() > Date.now() ? ' <button class="ab-btn" data-undo="' + esc(id) + '" type="button">' + esc(X('Отменить')) + '</button>' : '')
                : '<button class="ab-btn" data-abs="' + esc(l.key) + '" type="button">' + esc(X('Не смогу прийти')) + '</button>';
            return '<div class="ab-row">' + dateBox(l.date) +
                '<div class="ab-main"><b>' + esc(l.title) + '</b><small>' + esc(fmtDay(l.date, l.time)) + (l.teacherName ? ' · ' + esc(l.teacherName) : '') + '</small></div>' + right + '</div>';
        }).join('') + '</div>';
        el.querySelectorAll('[data-abs]').forEach(function (b) {
            b.onclick = function () { var l = lessons.find(function (x) { return x.key === b.getAttribute('data-abs'); }); if (l) openModal(l, user, profile, function () { renderStudent(el, user, profile); }); };
        });
        el.querySelectorAll('[data-undo]').forEach(function (b) {
            b.onclick = async function () {
                if (!confirm(X('Отменить предупреждение? Учитель будет ждать вас на уроке.'))) return;
                try { await db.collection('absences').doc(b.getAttribute('data-undo')).delete(); renderStudent(el, user, profile); }
                catch (e) { alert(X('Не удалось') + ': ' + e.message); }
            };
        });
    }

    function openModal(l, user, profile, done) {
        var at = S().lessonAt(l.date, l.time), hours = (at.getTime() - Date.now()) / 3600000, excused = hours >= 24;
        var ov = document.createElement('div'); ov.className = 'ab-ov';
        ov.innerHTML = '<div class="ab-modal" role="dialog" aria-modal="true">' +
            '<h3>' + esc(X('Не смогу прийти')) + '</h3>' +
            '<p><b>' + esc(l.title) + '</b><br>' + esc(fmtDay(l.date, l.time)) + (l.teacherName ? ' · ' + esc(l.teacherName) : '') + '</p>' +
            '<div class="ab-warn ' + (excused ? 'ok' : 'late') + '">' + esc(excused
                ? X('До урока больше 24 часов — урок будет отмечен как пропуск по уважительной причине.')
                : X('До урока меньше 24 часов — учитель увидит предупреждение, но урок считается проведённым.')) + '</div>' +
            '<label style="font-size:.85rem;font-weight:600">' + esc(X('Причина (по желанию)')) + '</label>' +
            '<textarea id="abReason" maxlength="200" placeholder="' + esc(X('Например: болею, экзамен в школе')) + '"></textarea>' +
            '<div class="ab-acts"><button class="ab-btn" type="button" data-x>' + esc(X('Отмена')) + '</button>' +
            '<button class="btn-primary" type="button" data-ok>' + esc(X('Предупредить учителя')) + '</button></div>' +
            '<div class="status-msg" id="abMsg" style="font-size:.85rem;margin-top:.5rem"></div></div>';
        document.body.appendChild(ov);
        var close = function () { ov.remove(); };
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        ov.querySelector('[data-x]').onclick = close;
        ov.querySelector('[data-ok]').onclick = async function () {
            var btn = this; btn.disabled = true;
            var at2 = S().lessonAt(l.date, l.time);
            var fv = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp;
            var doc = {
                uid: user.uid, nickname: (profile && profile.nickname) || '', name: [profile && profile.name, profile && profile.surname].filter(Boolean).join(' ') || '',
                groupId: l.groupId || '', scheduleId: l.scheduleId || '', teacherUid: l.teacherUid || '', date: l.date, dateNum: S().dateNum(l.date), time: l.time || '',
                lessonAt: TS && TS.fromDate ? TS.fromDate(at2) : at2.getTime(), title: l.title || '', reason: ov.querySelector('#abReason').value.trim().slice(0, 200),
                excused: at2.getTime() - Date.now() >= 24 * 3600000, createdAt: fv.serverTimestamp(), via: 'site'
            };
            try {
                await db.collection('absences').doc(S().absenceId(l, user.uid)).set(doc);
                close(); if (window.showToast) window.showToast(X('Учитель предупреждён'), 'check'); done && done();
            } catch (e) { btn.disabled = false; var m = ov.querySelector('#abMsg'); m.textContent = X('Не удалось отправить') + ': ' + e.message; m.style.color = 'var(--accent-warm)'; }
        };
    }

    // ── teacher ──
    async function renderTeacher(el, uid, opts) {
        css(); opts = opts || {};
        var list = await S().getAll(db.collection('absences').where('teacherUid', '==', uid)).catch(function () { return []; });
        var today = S().todayStr(), from = S().addDays(today, -14);
        list = list.filter(function (a) { return a.date >= (opts.upcomingOnly ? today : from); })
            .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
        var upcomingN = list.filter(function (a) { return a.date >= today; }).length;
        if (!el) return upcomingN;
        if (!list.length) { el.innerHTML = '<div class="ab-note">' + esc(X('Пока никто не предупреждал об отсутствии.')) + '</div>'; return 0; }
        el.innerHTML = '<div class="ab-list">' + list.slice(0, opts.limit || 100).map(function (a) {
            var before = (tsMs(a.lessonAt) - tsMs(a.createdAt)) / 3600000;
            var past = a.date < today;
            return '<div class="ab-row" style="' + (past ? 'opacity:.6' : '') + '">' + dateBox(a.date) +
                '<div class="ab-main"><b>' + esc(a.name || '@' + a.nickname) + ' · ' + esc(a.title || '') + '</b>' +
                '<small>' + esc(fmtDay(a.date, a.time)) + (before > 0 ? ' · ' + esc(X('предупредил за')) + ' ' + esc(hoursText(before)) : '') + (a.via === 'telegram' ? ' · Telegram' : '') + '</small>' +
                (a.reason ? '<small style="display:block;color:var(--ink)">«' + esc(a.reason) + '»</small>' : '') + '</div>' +
                '<span class="ab-pill ' + (a.excused ? 'ok' : 'late') + '">' + esc(a.excused ? X('за 24 ч+ · урок не оплачивается') : X('меньше 24 ч · урок оплачивается')) + '</span></div>';
        }).join('') + '</div>';
        return upcomingN;
    }

    window.StarthAbsence = { renderStudent: renderStudent, renderTeacher: renderTeacher, openModal: openModal, tsMs: tsMs };
})();
