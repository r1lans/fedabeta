/* TheStarth — student gamification: XP, levels, attendance streak, badges, goals, live triggers.
 *
 * Nothing new is stored for the score itself: it is calculated from data that already exists
 * (attendance + grades written by the teacher, test results, referrals). So teachers "trigger" XP just by
 * doing their normal work — the student's cabinet listens live and celebrates new badges / levels.
 * The only thing written is the student's own goal (users/<uid>.goal) and, in this browser,
 * the last celebrated state (localStorage) so the same badge is never celebrated twice.
 */
(function () {
    'use strict';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtDate = (iso) => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '.' + p[1] : ''; };

    // ── rules ──────────────────────────────────────────────────────────────
    const XP = { present: 20, late: 10, gradeMul: 2, gradeTop: 10, levelTest: 50, satTest: 50, refJoined: 30, refPaid: 100, telegram: 20, streak5: 25 };
    const LEVELS = [
        { name: 'Новичок', xp: 0, icon: 'sprout' }, { name: 'Ученик', xp: 100, icon: 'book' }, { name: 'Практик', xp: 250, icon: 'pencil' },
        { name: 'Знаток', xp: 500, icon: 'target' }, { name: 'Эксперт', xp: 900, icon: 'medal' }, { name: 'Наставник', xp: 1400, icon: 'compass' },
        { name: 'Мастер', xp: 2100, icon: 'trophy' }, { name: 'Легенда', xp: 3000, icon: 'crown' }
    ];
    const CERT_LEVEL = 2;      // "Практик" unlocks the personal achievement certificate

    function levelFor(xp) {
        let i = 0; LEVELS.forEach((l, k) => { if (xp >= l.xp) i = k; });
        const cur = LEVELS[i], next = LEVELS[i + 1] || null;
        return { index: i, cur, next, pct: next ? Math.min(100, Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100)) : 100, toNext: next ? next.xp - xp : 0 };
    }

    // ── calculation ────────────────────────────────────────────────────────
    function compute(d) {
        const nick = d.nickname;
        const events = [];      // {date, text, xp}
        // attendance → sorted list of marks
        const marks = [];
        (d.attendance || []).forEach((a) => { const s = a.marks && a.marks[nick]; if (s) marks.push({ date: a.date, s, topic: a.topic }); });
        marks.sort((a, b) => a.date.localeCompare(b.date));
        let present = 0, late = 0, absent = 0;
        marks.forEach((m) => {
            if (m.s === 'present') { present++; events.push({ date: m.date, text: 'Урок посещён' + (m.topic ? ': ' + m.topic : ''), xp: XP.present }); }
            else if (m.s === 'late') { late++; events.push({ date: m.date, text: 'Урок посещён (с опозданием)', xp: XP.late }); }
            else absent++;
        });
        // streak of consecutive attended lessons (late counts as attended)
        let best = 0, run = 0;
        marks.forEach((m) => { if (m.s === 'absent') run = 0; else { run++; if (run > best) best = run; } });
        const streak = run;
        const attended = present + late;
        const streakBonus = Math.floor(best / 5) * XP.streak5;
        if (streakBonus) events.push({ date: marks.length ? marks[marks.length - 1].date : '', text: 'Бонус за серию посещений (' + best + ' подряд)', xp: streakBonus });

        // grades
        const grades = (d.grades || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        let gradeXp = 0, top = 0;
        grades.forEach((g) => {
            const x = Math.round(g.score * XP.gradeMul) + (g.score >= 9 ? XP.gradeTop : 0);
            gradeXp += x; if (g.score >= 9) top++;
            events.push({ date: g.date, text: 'Оценка ' + (Math.round(g.score * 10) / 10) + (g.type ? ' · ' + g.type : ''), xp: x });
        });
        const avg = grades.length ? grades.reduce((s, g) => s + g.score, 0) / grades.length : null;

        // tests, quests, referrals
        let extra = 0;
        const p = d.profile || {};
        if (p.levelTestCompleted) { extra += XP.levelTest; events.push({ date: p.levelTestDate || '', text: 'Пройден тест уровня английского', xp: XP.levelTest }); }
        if (p.satTestCompleted) { extra += XP.satTest; events.push({ date: p.satTestDate || '', text: 'Пройден тест SAT Math', xp: XP.satTest }); }
        if (d.telegram) { extra += XP.telegram; events.push({ date: '', text: 'Подписка на Telegram-канал', xp: XP.telegram }); }
        let refJoined = 0, refPaid = 0;
        (d.referrals || []).forEach((r) => {
            refJoined++; extra += XP.refJoined; events.push({ date: r.createdAt || '', text: 'Друг @' + r.referredNickname + ' зарегистрировался', xp: XP.refJoined });
            if (r.status === 'paid' || r.status === 'rewarded') { refPaid++; extra += XP.refPaid; events.push({ date: r.paidAt || r.createdAt || '', text: 'Друг @' + r.referredNickname + ' начал учиться', xp: XP.refPaid }); }
        });

        const xp = present * XP.present + late * XP.late + gradeXp + extra + streakBonus;
        const lvl = levelFor(xp);
        const attPct = marks.length ? Math.round((attended / marks.length) * 100) : null;
        const m = { xp, lvl, streak, best, attended, absent, totalMarks: marks.length, attPct, grades: grades.length, avg, top, refJoined, refPaid, tests: (p.levelTestCompleted ? 1 : 0) + (p.satTestCompleted ? 1 : 0), telegram: !!d.telegram, levelTest: !!p.levelTestCompleted, satTest: !!p.satTestCompleted };
        events.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        m.events = events;
        m.badges = BADGES.map((b) => { const pr = b.progress(m); return { id: b.id, icon: b.icon, name: b.name, desc: b.desc, cur: Math.min(pr[0], pr[1]), target: pr[1], done: pr[0] >= pr[1], unit: b.unit || '' }; });
        return m;
    }

    const B = (id, icon, name, desc, progress, unit) => ({ id, icon, name, desc, progress, unit });
    const BADGES = [
        B('first', 'rocket', 'Первый шаг', 'Посетить первый урок', (m) => [m.attended, 1], 'урок'),
        B('l10', 'library', 'Десятка', 'Посетить 10 уроков', (m) => [m.attended, 10], 'уроков'),
        B('l25', 'graduation', 'Четвертак', 'Посетить 25 уроков', (m) => [m.attended, 25], 'уроков'),
        B('s5', 'flame', 'Серия 5', '5 уроков подряд без пропусков', (m) => [m.best, 5], 'подряд'),
        B('s10', 'bolt', 'Серия 10', '10 уроков подряд без пропусков', (m) => [m.best, 10], 'подряд'),
        B('perfect', 'diamond', 'Без пропусков', '100% посещаемость за 8+ уроков', (m) => [m.absent === 0 ? m.totalMarks : 0, 8], 'уроков'),
        B('g1', 'note', 'Первая оценка', 'Получить первую оценку от учителя', (m) => [m.grades, 1], 'оценка'),
        B('top', 'star', 'Отличник', 'Получить оценку 9 или 10', (m) => [m.top, 1], 'оценка'),
        B('avg8', 'trophy', 'Стабильно сильный', 'Средняя оценка от 8 при 5+ оценках', (m) => [(m.avg !== null && m.avg >= 8) ? m.grades : Math.min(m.grades, 4), 5], 'оценок'),
        B('test', 'flask', 'Знает свой уровень', 'Пройти тест уровня или SAT Math', (m) => [m.tests, 1], 'тест'),
        B('tg', 'megaphone', 'На связи', 'Подписаться на Telegram-канал', (m) => [m.telegram ? 1 : 0, 1], ''),
        B('ref1', 'users', 'Друг TheStarth', 'Привести друга по реферальной ссылке', (m) => [m.refJoined, 1], 'друг'),
        B('ref2', 'sparkles', 'Амбассадор', 'Друг начал учиться (оплатил)', (m) => [m.refPaid, 1], 'друг')
    ];

    // ── UI ─────────────────────────────────────────────────────────────────
    const ico = (n) => (window.Icons ? window.Icons.svg(n) : '');
    let uid = '', profile = null, nick = '';
    let data = { attendance: [], grades: [], referrals: [], telegram: false };
    let unsubs = [];
    let ready = { grades: false, attendance: false, referrals: false };

    function storageKey() { return 'starth_gm_' + uid; }
    function loadSeen() { try { return JSON.parse(localStorage.getItem(storageKey()) || 'null'); } catch (e) { return null; } }
    function saveSeen(m) { try { localStorage.setItem(storageKey(), JSON.stringify({ xp: m.xp, lvl: m.lvl.index, badges: m.badges.filter((b) => b.done).map((b) => b.id) })); } catch (e) {} }

    function celebrate(all) {
        if (!all.length) return;
        const items = all.slice(0, 4);
        if (all.length > 4) items.push({ icon: 'sparkles', title: 'И ещё ' + (all.length - 4), text: 'Все новые бейджи — в разделе «Мой прогресс».' });
        const pop = document.createElement('div');
        pop.className = 'gm-pop';
        const conf = Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 9) * 0.12}s;background:${['#C99A3B', '#8F5A0C', '#1e8449', '#1f5fbf', '#c0392b'][i % 5]}"></i>`).join('');
        pop.innerHTML = `<div class="gm-pop-card" role="dialog" aria-live="polite"><div class="gm-conf">${conf}</div>
            <div class="gm-pop-title">Новое достижение!</div>
            ${items.map((it) => `<div class="gm-pop-item"><span>${ico(it.icon)}</span><div><strong>${esc(it.title)}</strong><div>${esc(it.text)}</div></div></div>`).join('')}
            <button class="tc-btn primary" type="button">Отлично!</button></div>`;
        pop.addEventListener('click', (e) => { if (e.target === pop || e.target.tagName === 'BUTTON') pop.remove(); });
        document.body.appendChild(pop);
    }

    function render() {
        const box = document.getElementById('gameSection');
        if (!box) return;
        const m = compute(Object.assign({}, data, { nickname: nick, profile }));
        const L = m.lvl;

        // live triggers: compare with what was celebrated last time (only once real data has arrived,
        // otherwise the empty first render would wipe the stored state)
        const loaded = ready.grades && ready.attendance && ready.referrals;
        const seen = loaded ? loadSeen() : null;
        if (seen) {
            const items = [];
            if (L.index > seen.lvl) items.push({ icon: L.cur.icon, title: 'Новый уровень: ' + L.cur.name, text: 'У вас уже ' + m.xp + ' XP — так держать!' });
            m.badges.filter((b) => b.done && seen.badges.indexOf(b.id) === -1).forEach((b) => items.push({ icon: b.icon, title: 'Бейдж «' + b.name + '»', text: b.desc }));
            if (!items.length && m.xp > seen.xp) { if (window.showToast) window.showToast('+' + (m.xp - seen.xp) + ' XP', 'sparkles'); }
            celebrate(items);
        }
        if (loaded) saveSeen(m);

        const goals = m.badges.filter((b) => !b.done).sort((a, b) => (b.cur / b.target) - (a.cur / a.target)).slice(0, 3);
        const certUnlocked = L.index >= CERT_LEVEL;
        const goal = (profile && profile.goal) || {};
        let daysLeft = null;
        if (goal.date) { daysLeft = Math.ceil((new Date(goal.date + 'T23:59:59') - new Date()) / 86400000); }

        box.innerHTML = `
        <h2 class="dash-section-title">Мой прогресс</h2>
        <div class="gm-hero">
            <div class="gm-level"><div class="gm-level-icon">${ico(L.cur.icon)}</div>
                <div class="gm-level-body">
                    <div class="gm-level-name">Уровень ${L.index + 1} · ${esc(L.cur.name)}</div>
                    <div class="gm-bar"><div class="gm-bar-fill" style="width:${L.pct}%"></div></div>
                    <div class="gm-level-sub">${L.next ? `${m.xp} XP · до уровня «${esc(L.next.name)}» ещё ${L.toNext} XP` : `${m.xp} XP · максимальный уровень`}</div>
                </div></div>
            <div class="gm-stats">
                <div class="gm-stat"><strong>${ico('flame')} ${m.streak}</strong><span>уроков подряд</span></div>
                <div class="gm-stat"><strong>${m.attPct == null ? '—' : m.attPct + '%'}</strong><span>посещаемость</span></div>
                <div class="gm-stat"><strong>${m.avg == null ? '—' : (Math.round(m.avg * 10) / 10)}</strong><span>средняя оценка</span></div>
                <div class="gm-stat"><strong>${m.badges.filter((b) => b.done).length}/${m.badges.length}</strong><span>бейджей</span></div>
            </div>
        </div>

        <div class="gm-cols">
            <div class="gm-card">
                <h3>Ближайшие цели</h3>
                ${goals.length ? goals.map((b) => `<div class="gm-goal"><span class="gm-goal-ic">${ico(b.icon)}</span><div style="flex:1;min-width:0;"><strong>${esc(b.name)}</strong> <span class="tc-meta">${esc(b.desc)}</span>
                    <div class="gm-bar small"><div class="gm-bar-fill" style="width:${Math.round(b.cur / b.target * 100)}%"></div></div>
                    <div class="tc-meta">${b.cur} из ${b.target}${b.unit ? ' ' + esc(b.unit) : ''}</div></div></div>`).join('') : '<div class="tc-empty" style="padding:0;">Все бейджи получены — вы легенда!</div>'}
            </div>
            <div class="gm-card">
                <h3>Моя цель</h3>
                <p class="tc-meta" style="margin:0 0 .6rem;">Например: «IELTS 7.0» и дата экзамена — мы покажем, сколько осталось.</p>
                ${goal.text ? `<div class="gm-goal-now"><strong>${esc(goal.text)}</strong>${daysLeft != null ? `<span class="tc-chip ${daysLeft < 0 ? 'low' : daysLeft <= 30 ? 'mid' : 'good'}">${daysLeft < 0 ? 'дата прошла' : daysLeft === 0 ? 'сегодня!' : 'осталось ' + daysLeft + ' дн.'}</span>` : ''}</div>` : ''}
                <div class="gm-goal-form">
                    <input type="text" id="gmGoalText" class="tc-input" maxlength="60" placeholder="Моя цель" value="${esc(goal.text || '')}">
                    <input type="date" id="gmGoalDate" class="tc-input" value="${esc(goal.date || '')}">
                    <button class="tc-btn primary" type="button" id="gmGoalSave">Сохранить</button>
                </div>
                <div class="tc-msg" id="gmGoalMsg"></div>
            </div>
        </div>

        <div class="gm-card">
            <h3>Бейджи</h3>
            <div class="gm-badges">${m.badges.map((b) => `<div class="gm-badge ${b.done ? 'done' : ''}" title="${esc(b.desc)}">
                <div class="gm-badge-ic">${ico(b.done ? b.icon : 'lock')}</div><strong>${esc(b.name)}</strong>
                <span>${b.done ? 'получен' : b.cur + ' / ' + b.target}</span></div>`).join('')}</div>
        </div>

        <div class="gm-cols">
            <div class="gm-card">
                <h3>Лента XP</h3>
                ${m.events.length ? m.events.slice(0, 8).map((e) => `<div class="gm-event"><span class="gm-xp">+${e.xp}</span><div style="flex:1;min-width:0;overflow-wrap:anywhere;">${esc(e.text)}</div><span class="tc-meta">${esc(fmtDate(e.date))}</span></div>`).join('') : '<div class="tc-empty" style="padding:0;">Пока пусто. Посетите урок, пройдите тест или пригласите друга — XP начислятся сами.</div>'}
            </div>
            <div class="gm-card">
                <h3>Как заработать XP</h3>
                <ul class="gm-rules">
                    <li><b>+${XP.present}</b> урок посещён (+${XP.late}, если опоздали)</li>
                    <li><b>+${XP.streak5}</b> за каждые 5 уроков подряд</li>
                    <li><b>+оценка×${XP.gradeMul}</b> за оценку учителя (+${XP.gradeTop} за 9 и 10)</li>
                    <li><b>+${XP.levelTest}</b> тест уровня · <b>+${XP.satTest}</b> SAT Math</li>
                    <li><b>+${XP.refJoined}</b> друг зарегистрировался · <b>+${XP.refPaid}</b> начал учиться</li>
                    <li><b>+${XP.telegram}</b> подписка на Telegram-канал</li>
                </ul>
            </div>
        </div>

        <div class="gm-card" id="gmCertCard">
            <h3>Сертификат достижения</h3>
            ${certUnlocked ? `<p class="tc-meta" style="margin:0 0 .8rem;">Вы достигли уровня «${esc(LEVELS[CERT_LEVEL].name)}» — вот ваш личный сертификат достижения. Это награда академии за прогресс, а не экзаменационный сертификат.</p>
                <div id="gmCertWrap"></div>
                <div class="tc-actions"><button class="tc-btn primary" type="button" id="gmCertPrint">Скачать / распечатать (PDF)</button></div>`
            : `<p class="tc-meta" style="margin:0;">${ico('lock')} Откроется на уровне «${esc(LEVELS[CERT_LEVEL].name)}» — осталось ${Math.max(0, LEVELS[CERT_LEVEL].xp - m.xp)} XP.</p>`}
        </div>`;

        // certificate
        if (certUnlocked && window.CERT_SVG) {
            const fullName = [profile.name, profile.surname].filter(Boolean).join(' ') || nick;
            const sid = (profile.studentId || '000000');
            document.getElementById('gmCertWrap').innerHTML = `<div class="cert stay-light" id="myCert">${window.CERT_SVG}
                <div class="cert-content"><img class="cert-logo" src="images/logo-icon.png" alt="" width="1100" height="737">
                    <div class="cert-kicker">THESTARTH ACADEMY</div><div class="cert-title">CERTIFICATE</div><div class="cert-sub">OF ACHIEVEMENT</div>
                    <p class="cert-line cert-present">This is proudly presented to</p>
                    <div class="cert-name">${esc(fullName)}</div>
                    <p class="cert-line cert-course">For dedication and outstanding progress — reached the level “${esc(L.cur.name)}” · ${m.xp} XP</p></div>
                <div class="cert-sign"><span></span><em>Director · TheStarth</em></div>
                <div class="cert-meta"><strong>No. TS-${new Date().getFullYear()}-${esc(sid)}</strong><em>${new Date().toLocaleDateString('en-GB')}</em></div></div>`;
            document.getElementById('gmCertPrint').onclick = () => { document.body.classList.add('print-cert'); window.print(); setTimeout(() => document.body.classList.remove('print-cert'), 500); };
        }

        const saveBtn = document.getElementById('gmGoalSave');
        if (saveBtn) saveBtn.onclick = async () => {
            const text = document.getElementById('gmGoalText').value.trim(), date = document.getElementById('gmGoalDate').value;
            try {
                await db.collection('users').doc(uid).set({ goal: { text, date } }, { merge: true });
                profile = Object.assign({}, profile, { goal: { text, date } });
                if (window.currentUserProfile) window.currentUserProfile.goal = { text, date };
                render();
            } catch (err) { const e = document.getElementById('gmGoalMsg'); e.textContent = 'Не удалось сохранить: ' + err.message; e.className = 'tc-msg err'; }
        };
    }

    function listen(q, key) {
        try {
            unsubs.push(q.onSnapshot((snap) => { const a = []; snap.forEach((d) => a.push(d.data())); data[key] = a; ready[key] = true; render(); },
                (e) => { console.warn('gamification ' + key, e); ready[key] = true; render(); }));
        } catch (e) { console.warn(e); }
    }

    window.Gamification = {
        init(user, prof) {
            unsubs.forEach((u) => { try { u(); } catch (e) {} }); unsubs = [];
            uid = user.uid; profile = prof || {}; nick = profile.nickname || '';
            let tg = false; try { tg = localStorage.getItem('quest_telegram_completed') === 'true'; } catch (e) {}
            data = { attendance: [], grades: [], referrals: [], telegram: tg };
            ready = { grades: false, attendance: false, referrals: false };
            render();
            listen(db.collection('grades').where('studentUid', '==', uid), 'grades');
            listen(db.collection('attendance').where('studentUids', 'array-contains', uid), 'attendance');
            listen(db.collection('referrals').where('referrerUid', '==', uid), 'referrals');
        },
        compute
    };
})();
