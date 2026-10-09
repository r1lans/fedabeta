/* TheStarth — student cabinet extras: referral block + "my groups, attendance and grades".
 * Needs firebase compat (db) and the containers #refSection and #dashMyGroupsSection on dashboard.html.
 */
(function () {
    'use strict';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ico = (n) => (window.Icons ? window.Icons.svg(n) : '');
    const fmtDate = (iso) => { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '.' + p[1] : iso; };
    const STATUS = {
        registered: { text: 'Зарегистрировался', hint: 'ждём его первую оплату' },
        paid: { text: 'Оплатил — скидка ваша', hint: '−20% на следующий месяц' },
        rewarded: { text: 'Скидка применена', hint: '' }
    };

    function toast(msg, icon) { if (window.showToast) window.showToast(msg, icon || 'sparkles'); }
    function copy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
        return new Promise((res, rej) => {
            try { const i = document.createElement('input'); i.value = text; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); res(); } catch (e) { rej(e); }
        });
    }

    // ── Referral ────────────────────────────────────────────────────────────
    async function renderReferral(user, profile) {
        const box = document.getElementById('refSection');
        if (!box) return;
        const nick = profile && profile.nickname;
        if (!nick) { box.innerHTML = ''; return; }
        const link = window.starthReferralLink ? window.starthReferralLink(nick) : (location.origin + '/index.html?ref=' + encodeURIComponent(nick));
        const shareText = 'Я учусь в TheStarth (IELTS, SAT, математика). Регистрируйся по моей ссылке — получишь скидку 10% на первый месяц:';

        box.innerHTML = `
        <h2 class="dash-section-title" id="referral">Пригласи друга — получи скидку 20%</h2>
        <div class="ref-panel">
            <div class="ref-steps">
                <div class="ref-step"><b>1</b><p><strong>Отправьте ссылку</strong> другу — он ещё не должен быть учеником TheStarth.</p></div>
                <div class="ref-step"><b>2</b><p><strong>Друг регистрируется</strong> по ссылке и получает <strong>скидку 10%</strong> на первый месяц.</p></div>
                <div class="ref-step"><b>3</b><p>Когда друг <strong>оплатит первый месяц</strong>, вы получаете <strong>скидку 20%</strong> на следующий месяц.</p></div>
            </div>
            <label style="font-size:.8rem;color:var(--ink-soft);display:block;margin-bottom:.3rem;">Ваша личная ссылка (ваш код — <strong>${esc(nick)}</strong>)</label>
            <div class="ref-link-row">
                <input type="text" id="refLinkInput" readonly value="${esc(link)}" onclick="this.select()">
                <button class="tc-btn primary" type="button" id="refCopyBtn">Копировать</button>
                <a class="tc-btn" target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}">Telegram</a>
                <a class="tc-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shareText + ' ' + link)}">WhatsApp</a>
            </div>
            <div class="ref-stats">
                <div class="ref-stat"><strong id="refNInv">0</strong><span>зарегистрировались</span></div>
                <div class="ref-stat"><strong id="refNPaid">0</strong><span>оплатили</span></div>
                <div class="ref-stat"><strong id="refNDisc">0%</strong><span>скидок заработано</span></div>
            </div>
            <div id="refMine"></div>
            <div id="refList"><div class="tc-empty" style="padding:0;">Загрузка…</div></div>
            <ul class="ref-rules">
                <li>Засчитываются только новые ученики, которые зарегистрировались по вашей ссылке.</li>
                <li>Скидку 20% даём за каждого друга, который оплатил первый месяц; скидки за разных друзей суммируются.</li>
                <li>Скидку применяет куратор при вашей следующей оплате — статус друга обновится здесь.</li>
            </ul>
        </div>`;

        document.getElementById('refCopyBtn').onclick = () => copy(link).then(() => toast('Ссылка скопирована! Отправьте её другу', 'users')).catch(() => { document.getElementById('refLinkInput').select(); });

        try {
            const [mine, invited] = await Promise.all([
                db.collection('referrals').where('referredUid', '==', user.uid).get(),
                db.collection('referrals').where('referrerUid', '==', user.uid).get()
            ]);
            // If this student was invited by someone
            const mineBox = document.getElementById('refMine');
            mine.forEach((d) => {
                const r = d.data();
                mineBox.innerHTML = `<div style="margin:0 0 1rem;padding:.8rem 1rem;border-radius:10px;background:var(--accent-tint);font-size:.9rem;">${window.Icons ? Icons.svg('gift') : ''} Вас пригласил <strong>@${esc(r.referrerNickname)}</strong> — у вас скидка <strong>10%</strong> на первый месяц обучения. Назовите куратору при оплате.</div>`;
            });
            const list = []; invited.forEach((d) => list.push(d.data()));
            list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            const nPaid = list.filter((r) => r.status === 'paid' || r.status === 'rewarded').length;
            document.getElementById('refNInv').textContent = list.length;
            document.getElementById('refNPaid').textContent = nPaid;
            document.getElementById('refNDisc').textContent = (nPaid * 20) + '%';
            const wrap = document.getElementById('refList');
            if (!list.length) {
                wrap.innerHTML = '<div class="tc-empty" style="padding:0;">Пока никто не зарегистрировался по вашей ссылке. Отправьте её другу — и здесь появится его статус.</div>';
            } else {
                wrap.innerHTML = '<h4 style="margin:0 0 .5rem;">Ваши друзья</h4>' + list.map((r) => {
                    const st = STATUS[r.status] || STATUS.registered;
                    return `<div class="ref-friend">
                        <div><strong>${esc(r.referredName || '@' + r.referredNickname)}</strong> <span class="tc-meta">@${esc(r.referredNickname)} · ${esc(fmtDate((r.createdAt || '').slice(0, 10)))}</span>
                        ${st.hint ? `<div class="tc-meta">${esc(st.hint)}</div>` : ''}</div>
                        <span class="ref-status ${esc(r.status)}">${esc(st.text)}</span></div>`;
                }).join('');
            }
        } catch (err) {
            console.warn(err);
            document.getElementById('refList').innerHTML = '<div class="tc-empty" style="padding:0;">Не удалось загрузить список друзей.</div>';
        }
    }

    // ── My groups, attendance, grades ───────────────────────────────────────
    async function renderMyGroups(user) {
        const sec = document.getElementById('dashMyGroupsSection');
        const box = document.getElementById('dashMyGroups');
        if (!sec || !box) return;
        try {
            const [gs, grs, ats] = await Promise.all([
                db.collection('groups').where('memberUids', 'array-contains', user.uid).get(),
                db.collection('grades').where('studentUid', '==', user.uid).get(),
                db.collection('attendance').where('studentUids', 'array-contains', user.uid).get()
            ]);
            const groups = []; gs.forEach((d) => { const g = Object.assign({ id: d.id }, d.data()); if (!g.archived) groups.push(g); });
            if (!groups.length) return;            // not in any group → section stays hidden
            const grades = []; grs.forEach((d) => grades.push(d.data()));
            const att = []; ats.forEach((d) => att.push(d.data()));
            const nick = (window.currentUserProfile || {}).nickname;
            sec.style.display = 'block';
            // Leaderboard privacy: each student can hide themselves (boardPrefs/<uid>.hidden). Default = visible.
            const allUids = {}; groups.forEach((g) => (g.members || []).forEach((m) => { if (m.uid) allUids[m.uid] = 1; }));
            const hidden = {};
            await Promise.all(Object.keys(allUids).map((u) => db.collection('boardPrefs').doc(u).get().then((d) => { if (d.exists && d.data().hidden) hidden[u] = true; }).catch(() => {})));
            const boardHtml = (g) => {
                const members = g.members || [];
                const rows = members.map((m) => {
                    const r = window.Gamification && window.Gamification.compute ? window.Gamification.compute({ nickname: m.nickname, attendance: att.filter((a) => a.groupId === g.id), grades: [], referrals: [] }) : null;
                    return { m, xp: r ? r.xp : 0, lvl: r ? r.lvl.cur : null, me: m.uid === user.uid };
                });
                const visible = rows.filter((r) => r.me || !hidden[r.m.uid]).sort((a, b) => b.xp - a.xp || (a.m.nickname || '').localeCompare(b.m.nickname || ''));
                let rank = 0, prev = null;
                visible.forEach((r, i) => { if (r.xp !== prev) { rank = i + 1; prev = r.xp; } r.rank = rank; });
                const shown = visible.filter((r, i) => i < 10 || r.me);
                const meHidden = !!hidden[user.uid];
                return `<div class="lb">
                    <div class="lb-head"><h4>${ico('trophy')} Рейтинг группы</h4><span class="tc-meta">XP за посещаемость</span></div>
                    ${visible.length < 2 ? '<div class="tc-meta">Рейтинг появится, когда в группе будет хотя бы двое учеников.</div>' :
                      shown.map((r) => `<div class="lb-row ${r.me ? 'me' : ''}"><span class="lb-rank r${r.rank <= 3 ? r.rank : 0}">${r.rank}</span>
                        <span class="lb-name">${esc(r.m.name || '@' + r.m.nickname)}${r.me ? ' <em>(вы)</em>' : ''}</span>
                        <span class="lb-lvl">${r.lvl ? esc(r.lvl.name) : ''}</span><strong>${r.xp} XP</strong></div>`).join('')}
                    <label class="lb-toggle"><input type="checkbox" data-hide="${esc(g.id)}" ${meHidden ? 'checked' : ''}> Скрыть меня из рейтинга</label>
                    <div class="tc-meta">${meHidden ? 'Другие ученики вас не видят; своё место вы видите.' : 'Оценки в рейтинге не учитываются и другим ученикам не видны.'}</div>
                </div>`;
            };
            box.innerHTML = groups.map((g) => {
                const gg = grades.filter((x) => x.groupId === g.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                const avg = gg.length ? gg.reduce((s, x) => s + x.score, 0) / gg.length : null;
                let tot = 0, ok = 0;
                att.filter((a) => a.groupId === g.id).forEach((a) => { const s = a.marks && a.marks[nick]; if (!s) return; tot++; if (s === 'present' || s === 'late') ok++; });
                const pct = tot ? Math.round(ok / tot * 100) : null;
                return `<div class="result-card" style="margin-bottom:1rem;">
                    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center;">
                        <div><h3 style="margin:0 0 .2rem;">${esc(g.name)}</h3>
                            <div class="tc-meta">Преподаватель: ${esc(g.teacherName || '')}${g.subject ? ' · ' + esc(g.subject) : ''}${g.scheduleText ? ' · ' + esc(g.scheduleText) : ''}</div></div>
                        <a class="tc-btn primary" href="video-lesson.html?room=${encodeURIComponent(g.room)}&group=${encodeURIComponent(g.id)}">Войти на урок</a>
                    </div>
                    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin:.9rem 0 .4rem;">
                        <span class="tc-chip ${avg == null ? '' : avg >= 8 ? 'good' : avg >= 5 ? 'mid' : 'low'}">Средняя оценка: ${avg == null ? '—' : (Math.round(avg * 10) / 10)}</span>
                        <span class="tc-chip ${pct == null ? '' : pct >= 85 ? 'good' : pct >= 60 ? 'mid' : 'low'}">Посещаемость: ${pct == null ? '—' : pct + '%'}</span>
                    </div>
                    ${boardHtml(g)}
                    ${gg.slice(0, 5).map((x) => `<div class="tc-grade"><div class="tc-score ${x.score >= 8 ? 'good' : x.score >= 5 ? '' : 'low'}">${Math.round(x.score * 10) / 10}</div>
                        <div class="tc-body"><strong>${esc(x.type || '')}</strong> <span class="tc-meta">· ${esc(fmtDate(x.date))}</span>${x.comment ? `<div style="font-size:.9rem;">${esc(x.comment)}</div>` : ''}</div></div>`).join('')}
                </div>`;
            }).join('');
            box.querySelectorAll('[data-hide]').forEach((cb) => cb.addEventListener('change', async () => {
                try { await db.collection('boardPrefs').doc(user.uid).set({ hidden: cb.checked, updatedAt: new Date().toISOString() }); renderMyGroups(user); }
                catch (e) { cb.checked = !cb.checked; toast('Не удалось сохранить настройку', 'x'); }
            }));
        } catch (err) { console.warn('My groups unavailable', err); }
    }

    window.StudentExtras = {
        init(user, profile) { renderReferral(user, profile); renderMyGroups(user); }
    };
})();
