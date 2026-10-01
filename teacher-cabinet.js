/* TheStarth — teacher cabinet: groups, students, attendance, grades.
 *
 * Firestore collections used (rules in firebase-backend/firestore.rules):
 *   groups/{id}               { name, subject, scheduleText, teacherUid, teacherName, room,
 *                               members:[{uid,nickname,name}], memberUids:[uid], createdAt }
 *   attendance/{groupId_date} { groupId, teacherUid, date, topic, marks:{nickname:'present'|'late'|'absent'},
 *                               studentUids:[uid], updatedAt }
 *   grades/{id}               { groupId, teacherUid, studentNickname, studentUid, score(0-10), type, comment, date, createdAt }
 *
 * Needs: firebase compat (db), and a <div id="tcGroupsRoot"> on the page.
 */
(function () {
    'use strict';

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const X = (m) => (window.X ? window.X(m) : m);
    const alert = (m) => window.alert(X(m));
    const confirm = (m) => window.confirm(X(m));
    const prompt = (m, d) => window.prompt(X(m), d);
    const ic = (n) => (window.Icons ? window.Icons.svg(n) : '');
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const fmtDate = (iso) => { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '.' + p[1] : iso; };

    // ── schedule picker: day chips + time (3-day, 6-day or any custom set) ──
    const DAYN = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const PRESETS = [['3 дня · Пн Ср Пт', [0, 2, 4]], ['3 дня · Вт Чт Сб', [1, 3, 5]], ['6 дней · Пн–Сб', [0, 1, 2, 3, 4, 5]]];
    function schedPickerHtml(id) {
        return `<div class="sp" id="${id}">
            <div class="sp-presets">${PRESETS.map((p, i) => `<button type="button" class="sp-pre" data-p="${i}">${esc(X(p[0]))}</button>`).join('')}</div>
            <div class="sp-days">${DAYN.map((d, i) => `<button type="button" class="sp-day" data-d="${i}" aria-pressed="false">${esc(X(d))}</button>`).join('')}</div>
            <div class="sp-time"><label>${esc(X('Время урока'))}</label><input type="time" class="sp-t" value="18:00"></div>
            <div class="sp-out"></div></div>`;
    }
    function schedPickerBind(id, init) {
        const root = document.getElementById(id), sel = new Set();
        const pm = String((init && init.scheduleText) || '').match(/(\d{1,2})[:.](\d{2})/);
        if (pm) root.querySelector('.sp-t').value = pm[1].padStart(2, '0') + ':' + pm[2];
        ((init && init.days) || []).forEach((d) => sel.add(d));
        const paint = () => {
            root.querySelectorAll('.sp-day').forEach((b) => { const on = sel.has(+b.dataset.d); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
            root.querySelectorAll('.sp-pre').forEach((b) => { const p = PRESETS[+b.dataset.p][1]; b.classList.toggle('on', p.length === sel.size && p.every((d) => sel.has(d))); });
            root.querySelector('.sp-out').textContent = sel.size ? X('Расписание: ') + api.text() : X('Выберите дни занятий');
        };
        const api = {
            days: () => [...sel].sort((a, b) => a - b),
            time: () => root.querySelector('.sp-t').value || '',
            text: () => api.days().map((d) => DAYN[d]).join(' / ') + (api.time() ? ', ' + api.time() : ''),
            value: () => ({ days: api.days(), time: api.time(), scheduleText: api.text() }),
            set: (days) => { sel.clear(); days.forEach((d) => sel.add(d)); paint(); }
        };
        root.querySelectorAll('.sp-day').forEach((b) => b.onclick = () => { const d = +b.dataset.d; if (sel.has(d)) sel.delete(d); else sel.add(d); paint(); });
        root.querySelectorAll('.sp-pre').forEach((b) => b.onclick = () => api.set(PRESETS[+b.dataset.p][1]));
        root.querySelector('.sp-t').oninput = paint;
        paint(); return api;
    }
    function groupDays(g) {
        if (g && Array.isArray(g.days) && g.days.length) return g.days;
        const out = []; String((g && g.scheduleText) || '').split(/[\s,\/;·\-–—]+/).forEach((w) => { DAYN.forEach((n, i) => { if (w.slice(0, 2).toLowerCase() === n.toLowerCase() && out.indexOf(i) === -1) out.push(i); }); });
        return out;
    }
    const fmtDateLong = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString((window.starthLocale ? window.starthLocale() : 'ru-RU'), { day: 'numeric', month: 'long', weekday: 'short' }); } catch (e) { return iso; } };

    const SUBJECTS = ['IELTS', 'SAT Math', 'General English', 'Олимпиадная математика', 'Другое'];
    const GRADE_TYPES = ['Урок', 'Домашнее задание', 'Тест', 'Speaking', 'Writing', 'Другое'];
    const ST = {
        present: { label: 'Был', icon: 'check', cls: 'present' },
        late: { label: 'Опоздал', icon: 'clock', cls: 'late' },
        absent: { label: 'Не был', icon: 'x', cls: 'absent' }
    };

    let root = null, user = null, profile = null;
    let spNew = null;
    let groups = [];
    let cur = null;               // group being viewed
    let gradesCache = [];         // grades of the current group
    let attCache = [];            // attendance docs of the current group
    let tab = 'students';
    let attDate = todayStr();
    let attMarks = {};
    let attTopic = '';
    let gradeFilter = '';

    const col = (n) => db.collection(n);
    const initials = (m) => ((m.name || m.nickname || '?').trim().charAt(0) || '?').toUpperCase();
    const scoreCls = (v) => v >= 8 ? 'good' : v >= 5 ? '' : 'low';
    const fmtScore = (v) => (Math.round(v * 10) / 10).toString();

    function setMsg(id, text, kind) {
        const e = document.getElementById(id);
        if (!e) return;
        e.textContent = text || '';
        e.className = 'tc-msg' + (kind ? ' ' + kind : '');
    }

    // ── data ────────────────────────────────────────────────────────────────
    async function loadGroups() {
        const snap = await col('groups').where('teacherUid', '==', user.uid).get();
        groups = [];
        snap.forEach((d) => groups.push(Object.assign({ id: d.id, members: [], memberUids: [] }, d.data())));
        groups.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
    }
    async function loadGroupData(g) {
        const [gs, as] = await Promise.all([
            col('grades').where('teacherUid', '==', user.uid).where('groupId', '==', g.id).get(),
            col('attendance').where('teacherUid', '==', user.uid).where('groupId', '==', g.id).get()
        ]);
        gradesCache = []; gs.forEach((d) => gradesCache.push(Object.assign({ id: d.id }, d.data())));
        attCache = []; as.forEach((d) => attCache.push(Object.assign({ id: d.id }, d.data())));
    }

    function avgFor(nick) {
        const v = gradesCache.filter((x) => x.studentNickname === nick).map((x) => x.score);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    }
    function attPctFor(nick) {
        let total = 0, ok = 0;
        attCache.forEach((a) => {
            const s = a.marks && a.marks[nick];
            if (!s) return;
            total++; if (s === 'present' || s === 'late') ok++;
        });
        return total ? Math.round((ok / total) * 100) : null;
    }

    // ── views ───────────────────────────────────────────────────────────────
    function renderList() {
        cur = null;
        root.innerHTML = `
            <div class="tc-toolbar">
                <button class="tc-btn primary" id="tcNewBtn" type="button">+ Новая группа</button>
            </div>
            <form class="tc-form" id="tcNewForm" style="display:none;">
                <label>Название группы</label>
                <input type="text" id="tcNewName" maxlength="60" placeholder="Например: IELTS 6.5 — вечерняя" required>
                <div class="tc-row2">
                    <div><label>Направление</label>
                        <select id="tcNewSubject">${SUBJECTS.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
                </div>
                <label>Дни занятий</label>
                ${schedPickerHtml('tcNewSp')}
                <div class="tc-actions" style="margin-top:1rem;">
                    <button class="tc-btn primary" type="submit">Создать группу</button>
                    <button class="tc-btn" type="button" id="tcNewCancel">Отмена</button>
                </div>
                <div class="tc-msg" id="tcNewMsg"></div>
            </form>
            <div class="tc-groups" id="tcGroupList"></div>`;

        const list = document.getElementById('tcGroupList');
        if (!groups.length) {
            list.innerHTML = '<div class="tc-empty">У вас пока нет групп. Нажмите «+ Новая группа», затем добавьте учеников по никнейму.</div>';
        } else {
            groups.slice().sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0)).forEach((g) => {
                const n = (g.members || []).length;
                const card = document.createElement('div');
                card.className = 'tc-group-card' + (g.archived ? ' is-archived' : '');
                card.innerHTML = `
                    <h3>${esc(g.name)}${g.archived ? ' <span class="tc-chip">Архив</span>' : ''}</h3>
                    <div class="tc-meta">${esc(g.subject || '')}${g.scheduleText ? ' · ' + esc(g.scheduleText) : ''}</div>
                    <div><span class="tc-count">${ic('users')} ${n} ${plural(n, 'ученик', 'ученика', 'учеников')}</span></div>
                    <div class="tc-actions">
                        <button class="tc-btn primary" data-open="${esc(g.id)}" type="button">Открыть</button>
                        <a class="tc-btn" href="video-lesson.html?room=${encodeURIComponent(g.room)}&group=${encodeURIComponent(g.id)}">Войти на урок</a>
                    </div>`;
                list.appendChild(card);
            });
            list.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openGroup(b.dataset.open)));
        }

        const form = document.getElementById('tcNewForm');
        spNew = schedPickerBind('tcNewSp', { days: [0, 2, 4] });
        document.getElementById('tcNewBtn').onclick = () => { form.style.display = 'block'; document.getElementById('tcNewName').focus(); };
        document.getElementById('tcNewCancel').onclick = () => { form.style.display = 'none'; };
        form.onsubmit = createGroup;
    }

    function plural(n, a, b, c) {
        const m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return a;
        if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b;
        return c;
    }

    async function createGroup(e) {
        e.preventDefault();
        const name = document.getElementById('tcNewName').value.trim();
        if (!name) return;
        if (!spNew.days().length) { setMsg('tcNewMsg', 'Выберите хотя бы один день занятий.', 'err'); return; }
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            const ref = col('groups').doc();
            const teacherName = [profile.name, profile.surname].filter(Boolean).join(' ') || profile.nickname || 'Преподаватель';
            const data = {
                name,
                subject: document.getElementById('tcNewSubject').value,
                scheduleText: spNew.text(), days: spNew.days(), time: spNew.time(),
                teacherUid: user.uid,
                teacherName,
                room: 'TheStarth-g-' + ref.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14),
                members: [], memberUids: [],
                createdAt: new Date().toISOString()
            };
            await ref.set(data);
            groups.push(Object.assign({ id: ref.id }, data));
            groups.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
            openGroup(ref.id);
        } catch (err) {
            setMsg('tcNewMsg', 'Не удалось создать группу: ' + err.message, 'err');
            btn.disabled = false;
        }
    }

    async function openGroup(id) {
        cur = groups.find((g) => g.id === id);
        if (!cur) return renderList();
        root.innerHTML = '<div class="tc-empty">Загрузка…</div>';
        try { await loadGroupData(cur); } catch (err) { console.warn(err); gradesCache = []; attCache = []; }
        tab = 'students';
        attDate = todayStr();
        loadAttForDate();
        renderGroup();
    }

    function renderGroup() {
        const g = cur;
        const n = (g.members || []).length;
        root.innerHTML = `
            <button class="tc-back" type="button" id="tcBack">← Все группы</button>
            <div class="tc-group-head">
                <div>
                    <h3>${esc(g.name)}</h3>
                    <div class="tc-meta">${esc(g.subject || '')}${g.scheduleText ? ' · ' + esc(g.scheduleText) : ''} · ${n} ${plural(n, 'ученик', 'ученика', 'учеников')}</div>
                </div>
                <div class="tc-actions" style="margin:0;padding:0;">
                    <a class="tc-btn primary" href="video-lesson.html?room=${encodeURIComponent(g.room)}&group=${encodeURIComponent(g.id)}">Войти на урок группы</a>
                    <button class="tc-btn" type="button" id="tcEdit">Изменить</button>
                    <button class="tc-btn" type="button" id="tcArch">${g.archived ? 'Вернуть из архива' : 'В архив'}</button>
                    <button class="tc-btn danger" type="button" id="tcDel">Удалить</button>
                </div>
            </div>
            <div class="tc-tabs" role="tablist">
                <button class="tc-tab ${tab === 'students' ? 'active' : ''}" data-t="students" type="button">Ученики</button>
                <button class="tc-tab ${tab === 'attendance' ? 'active' : ''}" data-t="attendance" type="button">Посещаемость</button>
                <button class="tc-tab ${tab === 'grades' ? 'active' : ''}" data-t="grades" type="button">Оценки</button>
            </div>
            <div id="tcBody"></div>`;
        document.getElementById('tcBack').onclick = renderList;
        document.getElementById('tcEdit').onclick = editGroup;
        document.getElementById('tcDel').onclick = deleteGroup;
        document.getElementById('tcArch').onclick = toggleArchive;
        root.querySelectorAll('.tc-tab').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; renderGroup(); }));
        if (tab === 'students') renderStudents();
        else if (tab === 'attendance') renderAttendance();
        else renderGrades();
    }

    function editGroup() {
        const ov = document.createElement('div'); ov.className = 'sp-modal';
        ov.innerHTML = `<div class="sp-card"><h3>${esc(X('Изменить группу'))}</h3>
            <label>${esc(X('Название группы'))}</label><input type="text" id="spName" maxlength="60" value="${esc(cur.name)}">
            <label>${esc(X('Дни занятий'))}</label>${schedPickerHtml('spEdit')}
            <div class="tc-actions" style="margin-top:1rem;"><button type="button" class="tc-btn primary" id="spSave">${esc(X('Сохранить'))}</button><button type="button" class="tc-btn" id="spCancel">${esc(X('Отмена'))}</button></div></div>`;
        document.body.appendChild(ov);
        const sp = schedPickerBind('spEdit', { days: groupDays(cur), scheduleText: cur.scheduleText });
        const close = () => ov.remove();
        ov.querySelector('#spCancel').onclick = close; ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        ov.querySelector('#spSave').onclick = async () => {
            if (!sp.days().length) return alert('Выберите хотя бы один день занятий.');
            const patch = { name: ov.querySelector('#spName').value.trim() || cur.name, scheduleText: sp.text(), days: sp.days(), time: sp.time() };
            try { await col('groups').doc(cur.id).update(patch); Object.assign(cur, patch); close(); renderGroup(); }
            catch (err) { alert('Не удалось сохранить: ' + err.message); }
        };
    }

    async function toggleArchive() {
        const v = !cur.archived;
        try { await col('groups').doc(cur.id).update({ archived: v }); cur.archived = v; renderGroup(); }
        catch (err) { alert('Не удалось сохранить: ' + err.message); }
    }

    async function deleteGroup() {
        if (!confirm('Удалить группу «' + cur.name + '» вместе с оценками и посещаемостью? Это нельзя отменить.')) return;
        try {
            const batch = db.batch();
            gradesCache.forEach((x) => batch.delete(col('grades').doc(x.id)));
            attCache.forEach((x) => batch.delete(col('attendance').doc(x.id)));
            batch.delete(col('groups').doc(cur.id));
            await batch.commit();
            groups = groups.filter((g) => g.id !== cur.id);
            renderList();
        } catch (err) { alert('Не удалось удалить: ' + err.message); }
    }

    // ── tab: students ───────────────────────────────────────────────────────
    function xpFor(nick) {
        if (!window.Gamification || !window.Gamification.compute) return null;
        try { return window.Gamification.compute({ nickname: nick, attendance: attCache, grades: gradesCache.filter((x) => x.studentNickname === nick), referrals: [] }); } catch (e) { return null; }
    }
    // "Needs attention": last two marks are absences, or attendance below 60% after 3+ lessons.
    function needsAttention(nick) {
        const marks = attCache.filter((a) => a.marks && a.marks[nick]).sort((a, b) => a.date.localeCompare(b.date)).map((a) => a.marks[nick]);
        if (marks.length >= 2 && marks[marks.length - 1] === 'absent' && marks[marks.length - 2] === 'absent') return 'Пропустил 2 урока подряд';
        if (marks.length >= 3) { const ok = marks.filter((s) => s !== 'absent').length / marks.length; if (ok < 0.6) return 'Низкая посещаемость'; }
        return '';
    }

    function renderStudents() {
        const body = document.getElementById('tcBody');
        const members = cur.members || [];
        body.innerHTML = `
            <form class="tc-form" id="tcAddForm">
                <label>Добавить ученика по никнейму</label>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                    <input type="text" id="tcAddNick" class="tc-input" style="flex:1 1 200px;width:auto;" placeholder="никнейм ученика (например: aziza_k)" autocomplete="off" autocapitalize="none">
                    <button class="tc-btn primary" type="submit">Добавить</button>
                </div>
                <div class="tc-msg" id="tcAddMsg">Ученик должен быть зарегистрирован на сайте — никнейм он видит в своём кабинете.</div>
            </form>
            <div class="tc-actions" style="margin:0 0 .6rem;">
                <button class="tc-btn" type="button" id="tcCsvAtt">Скачать посещаемость (CSV)</button>
                <button class="tc-btn" type="button" id="tcCsvGr">Скачать оценки (CSV)</button>
            </div>
            <div class="tc-card" id="tcStudList"></div>`;
        document.getElementById('tcCsvAtt').onclick = () => window.CsvExport && window.CsvExport.attendance(cur, attCache);
        document.getElementById('tcCsvGr').onclick = () => window.CsvExport && window.CsvExport.grades(cur, gradesCache);
        document.getElementById('tcAddForm').onsubmit = addStudent;
        const list = document.getElementById('tcStudList');
        if (!members.length) { list.innerHTML = '<div class="tc-empty">В группе пока нет учеников.</div>'; return; }
        members.forEach((m) => {
            const avg = avgFor(m.nickname), pct = attPctFor(m.nickname);
            const xp = xpFor(m.nickname), warn = needsAttention(m.nickname);
            const row = document.createElement('div');
            row.className = 'tc-student';
            row.innerHTML = `
                <div class="tc-avatar">${esc(initials(m))}</div>
                <div class="tc-who"><strong>${esc(m.name || '@' + m.nickname)}</strong><span class="tc-meta">@${esc(m.nickname)}</span>${warn ? `<span class="tc-warn">${ic('clock')} ${warn}</span>` : ''}</div>
                ${xp ? `<span class="tc-chip" title="XP за посещаемость и оценки в этой группе">${ic(xp.lvl.cur.icon)} ${esc(xp.lvl.cur.name)} · ${xp.xp} XP</span>` : ''}
                <span class="tc-chip ${avg == null ? '' : avg >= 8 ? 'good' : avg >= 5 ? 'mid' : 'low'}">Средняя: ${avg == null ? '—' : fmtScore(avg)}</span>
                <span class="tc-chip ${pct == null ? '' : pct >= 85 ? 'good' : pct >= 60 ? 'mid' : 'low'}">Посещ.: ${pct == null ? '—' : pct + '%'}</span>
                <button class="tc-btn" data-grade="${esc(m.nickname)}" type="button">Оценить</button>
                <button class="tc-btn danger" data-rm="${esc(m.uid)}" type="button">Убрать</button>`;
            list.appendChild(row);
        });
        list.querySelectorAll('[data-grade]').forEach((b) => b.addEventListener('click', () => { gradeFilter = b.dataset.grade; tab = 'grades'; renderGroup(); }));
        list.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => removeStudent(b.dataset.rm)));
    }

    async function addStudent(e) {
        e.preventDefault();
        const nick = document.getElementById('tcAddNick').value.trim().replace(/^@/, '').toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(nick)) return setMsg('tcAddMsg', 'Никнейм: 3–20 символов, латиница, цифры и «_».', 'err');
        if ((cur.members || []).some((m) => m.nickname === nick)) return setMsg('tcAddMsg', '@' + nick + ' уже в этой группе.', 'err');
        setMsg('tcAddMsg', 'Ищу…');
        try {
            const nd = await col('nicknames').doc(nick).get();
            if (!nd.exists) return setMsg('tcAddMsg', 'Ученик @' + nick + ' не найден. Он должен сначала зарегистрироваться на сайте.', 'err');
            const m = { uid: nd.data().uid, nickname: nick, name: nd.data().displayName || '' };
            const members = (cur.members || []).concat([m]);
            const memberUids = members.map((x) => x.uid);
            await col('groups').doc(cur.id).update({ members, memberUids });
            cur.members = members; cur.memberUids = memberUids;
            renderStudents();
            setMsg('tcAddMsg', '@' + nick + ' добавлен(а) в группу', 'ok');
        } catch (err) { setMsg('tcAddMsg', 'Ошибка: ' + err.message, 'err'); }
    }

    async function removeStudent(uid) {
        const m = cur.members.find((x) => x.uid === uid);
        if (!m || !confirm('Убрать @' + m.nickname + ' из группы? Его оценки и отметки останутся в истории.')) return;
        const members = cur.members.filter((x) => x.uid !== uid);
        const memberUids = members.map((x) => x.uid);
        try {
            await col('groups').doc(cur.id).update({ members, memberUids });
            cur.members = members; cur.memberUids = memberUids;
            renderGroup();
        } catch (err) { alert('Ошибка: ' + err.message); }
    }

    // ── tab: attendance ─────────────────────────────────────────────────────
    function loadAttForDate() {
        const doc = attCache.find((a) => a.date === attDate);
        attMarks = doc && doc.marks ? Object.assign({}, doc.marks) : {};
        attTopic = doc && doc.topic ? doc.topic : '';
    }

    function renderAttendance() {
        const body = document.getElementById('tcBody');
        const members = cur.members || [];
        if (!members.length) { body.innerHTML = '<div class="tc-empty">Сначала добавьте учеников во вкладке «Ученики».</div>'; return; }
        body.innerHTML = `
            <div class="tc-card">
                <div class="tc-row2">
                    <div><label style="font-size:.8rem;color:var(--ink-soft);">Дата урока</label>
                        <input type="date" id="tcAttDate" class="tc-input" value="${esc(attDate)}" max="${todayStr()}"></div>
                    <div><label style="font-size:.8rem;color:var(--ink-soft);">Тема урока (по желанию)</label>
                        <input type="text" id="tcAttTopic" class="tc-input" maxlength="120" value="${esc(attTopic)}" placeholder="Например: Reading — T/F/NG"></div>
                </div>
                <div class="tc-toolbar" style="margin:1rem 0 0.5rem;">
                    <button class="tc-btn" type="button" id="tcAllPresent">Отметить всех: был</button>
                    <button class="tc-btn" type="button" id="tcClearMarks">Сбросить</button>
                </div>
                <div id="tcAttRows"></div>
                <div class="tc-actions" style="margin-top:1rem;">
                    <button class="tc-btn primary" type="button" id="tcAttSave">Сохранить посещаемость</button>
                </div>
                <div class="tc-msg" id="tcAttMsg"></div>
            </div>
            <h4 style="margin:1.5rem 0 0.75rem;">История посещаемости</h4>
            <div class="tc-card tc-scroll" id="tcAttHist"></div>`;

        const rows = document.getElementById('tcAttRows');
        members.forEach((m) => {
            const cur_ = attMarks[m.nickname] || '';
            const row = document.createElement('div');
            row.className = 'tc-student';
            row.innerHTML = `
                <div class="tc-avatar">${esc(initials(m))}</div>
                <div class="tc-who"><strong>${esc(m.name || '@' + m.nickname)}</strong><span class="tc-meta">@${esc(m.nickname)}</span></div>
                <div class="tc-seg" data-nick="${esc(m.nickname)}">
                    ${Object.keys(ST).map((k) => `<button type="button" data-s="${k}" class="${cur_ === k ? 'on-' + k : ''}">${ic(ST[k].icon)} ${ST[k].label}</button>`).join('')}
                </div>`;
            rows.appendChild(row);
        });
        rows.querySelectorAll('.tc-seg button').forEach((b) => b.addEventListener('click', () => {
            const nick = b.parentNode.dataset.nick, s = b.dataset.s;
            if (attMarks[nick] === s) delete attMarks[nick]; else attMarks[nick] = s;
            b.parentNode.querySelectorAll('button').forEach((x) => { x.className = attMarks[nick] === x.dataset.s ? 'on-' + x.dataset.s : ''; });
        }));
        document.getElementById('tcAttDate').onchange = (e) => { attDate = e.target.value || todayStr(); loadAttForDate(); renderAttendance(); };
        document.getElementById('tcAttTopic').oninput = (e) => { attTopic = e.target.value; };
        document.getElementById('tcAllPresent').onclick = () => { members.forEach((m) => { attMarks[m.nickname] = 'present'; }); renderAttendance(); };
        document.getElementById('tcClearMarks').onclick = () => { attMarks = {}; renderAttendance(); };
        document.getElementById('tcAttSave').onclick = saveAttendance;
        renderAttHistory();
    }

    async function saveAttendance() {
        const btn = document.getElementById('tcAttSave');
        btn.disabled = true;
        try {
            const data = {
                groupId: cur.id, teacherUid: user.uid, date: attDate,
                topic: (attTopic || '').trim(), marks: attMarks,
                studentUids: (cur.memberUids || []).slice(),
                updatedAt: new Date().toISOString()
            };
            const id = cur.id + '_' + attDate;
            await col('attendance').doc(id).set(data);
            const i = attCache.findIndex((a) => a.id === id);
            const rec = Object.assign({ id }, data);
            if (i >= 0) attCache[i] = rec; else attCache.push(rec);
            setMsg('tcAttMsg', 'Сохранено', 'ok');
            renderAttHistory();
        } catch (err) { setMsg('tcAttMsg', 'Не удалось сохранить: ' + err.message, 'err'); }
        btn.disabled = false;
    }

    function renderAttHistory() {
        const box = document.getElementById('tcAttHist');
        if (!box) return;
        const dates = attCache.map((a) => a.date).sort().slice(-10);
        if (!dates.length) { box.innerHTML = '<div class="tc-empty" style="padding:0;">Пока нет сохранённых занятий.</div>'; return; }
        const members = cur.members || [];
        box.innerHTML = `<table class="tc-matrix"><thead><tr><th>Ученик</th>${dates.map((d) => `<th><button type="button" data-d="${d}" title="Открыть этот день">${fmtDate(d)}</button></th>`).join('')}<th>%</th></tr></thead><tbody>
            ${members.map((m) => {
                const pct = attPctFor(m.nickname);
                return `<tr><td>${esc(m.name || '@' + m.nickname)}</td>${dates.map((d) => {
                    const a = attCache.find((x) => x.date === d); const s = a && a.marks && a.marks[m.nickname];
                    return `<td class="${s ? 's-' + s : ''}">${s ? ic(ST[s].icon) : '–'}</td>`;
                }).join('')}<td>${pct == null ? '—' : pct + '%'}</td></tr>`;
            }).join('')}</tbody></table>`;
        box.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { attDate = b.dataset.d; loadAttForDate(); renderAttendance(); window.scrollTo({ top: document.getElementById('tcBody').offsetTop - 80, behavior: 'smooth' }); }));
    }

    // ── tab: grades ─────────────────────────────────────────────────────────
    function renderGrades() {
        const body = document.getElementById('tcBody');
        const members = cur.members || [];
        if (!members.length) { body.innerHTML = '<div class="tc-empty">Сначала добавьте учеников во вкладке «Ученики».</div>'; return; }
        body.innerHTML = `
            <form class="tc-form" id="tcGradeForm">
                <div class="tc-row2">
                    <div><label>Ученик</label>
                        <select id="tcGStudent">${members.map((m) => `<option value="${esc(m.nickname)}" ${gradeFilter === m.nickname ? 'selected' : ''}>${esc(m.name || '@' + m.nickname)} (@${esc(m.nickname)})</option>`).join('')}</select></div>
                    <div><label>Оценка (0–10, можно 7.5)</label>
                        <input type="number" id="tcGScore" min="0" max="10" step="0.5" inputmode="decimal" required placeholder="8"></div>
                </div>
                <div class="tc-row2">
                    <div><label>За что</label>
                        <select id="tcGType">${GRADE_TYPES.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
                    <div><label>Дата</label>
                        <input type="date" id="tcGDate" value="${todayStr()}" max="${todayStr()}"></div>
                </div>
                <label>Комментарий (ученик его увидит)</label>
                <input type="text" id="tcGComment" maxlength="200" placeholder="Например: хорошая работа над Writing Task 2">
                <div class="tc-actions" style="margin-top:1rem;"><button class="tc-btn primary" type="submit">Поставить оценку</button></div>
                <div class="tc-msg" id="tcGMsg"></div>
            </form>
            <div class="tc-toolbar">
                <label style="font-size:.85rem;color:var(--ink-soft);">Показать:</label>
                <select id="tcGFilter" class="tc-input" style="width:auto;max-width:100%;">
                    <option value="">Все ученики</option>
                    ${members.map((m) => `<option value="${esc(m.nickname)}" ${gradeFilter === m.nickname ? 'selected' : ''}>${esc(m.name || '@' + m.nickname)}</option>`).join('')}
                </select>
            </div>
            <div class="tc-card" id="tcGList"></div>`;
        document.getElementById('tcGradeForm').onsubmit = addGrade;
        document.getElementById('tcGFilter').onchange = (e) => { gradeFilter = e.target.value; renderGradeList(); };
        renderGradeList();
    }

    function renderGradeList() {
        const box = document.getElementById('tcGList');
        if (!box) return;
        let list = gradesCache.slice();
        if (gradeFilter) list = list.filter((x) => x.studentNickname === gradeFilter);
        list.sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
        let head = '';
        if (gradeFilter) {
            const avg = avgFor(gradeFilter);
            head = `<div style="margin-bottom:0.75rem;"><span class="tc-chip ${avg == null ? '' : avg >= 8 ? 'good' : avg >= 5 ? 'mid' : 'low'}">Средняя оценка @${esc(gradeFilter)}: ${avg == null ? '—' : fmtScore(avg)}</span></div>`;
        }
        if (!list.length) { box.innerHTML = head + '<div class="tc-empty" style="padding:0;">Оценок пока нет.</div>'; return; }
        box.innerHTML = head + list.map((x) => {
            const m = (cur.members || []).find((y) => y.nickname === x.studentNickname);
            return `<div class="tc-grade">
                <div class="tc-score ${scoreCls(x.score)}">${fmtScore(x.score)}</div>
                <div class="tc-body">
                    <strong>${esc((m && m.name) || '@' + x.studentNickname)}</strong> <span class="tc-meta">· ${esc(x.type || '')} · ${esc(fmtDate(x.date))}</span>
                    ${x.comment ? `<div style="margin-top:0.2rem;font-size:0.9rem;">${esc(x.comment)}</div>` : ''}
                </div>
                <button class="tc-btn danger" type="button" data-del="${esc(x.id)}" aria-label="Удалить оценку">${ic('x')}</button>
            </div>`;
        }).join('');
        box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
            if (!confirm('Удалить эту оценку?')) return;
            try { await col('grades').doc(b.dataset.del).delete(); gradesCache = gradesCache.filter((x) => x.id !== b.dataset.del); renderGradeList(); }
            catch (err) { alert('Ошибка: ' + err.message); }
        }));
    }

    async function addGrade(e) {
        e.preventDefault();
        const nick = document.getElementById('tcGStudent').value;
        const score = parseFloat(document.getElementById('tcGScore').value);
        if (!(score >= 0 && score <= 10)) return setMsg('tcGMsg', 'Оценка должна быть от 0 до 10.', 'err');
        const m = (cur.members || []).find((x) => x.nickname === nick);
        if (!m) return;
        const data = {
            groupId: cur.id, teacherUid: user.uid,
            studentNickname: nick, studentUid: m.uid,
            score: Math.round(score * 10) / 10,
            type: document.getElementById('tcGType').value,
            comment: document.getElementById('tcGComment').value.trim(),
            date: document.getElementById('tcGDate').value || todayStr(),
            createdAt: new Date().toISOString()
        };
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            const ref = await col('grades').add(data);
            gradesCache.push(Object.assign({ id: ref.id }, data));
            gradeFilter = nick;
            document.getElementById('tcGScore').value = '';
            document.getElementById('tcGComment').value = '';
            document.getElementById('tcGFilter').value = nick;
            setMsg('tcGMsg', 'Оценка поставлена', 'ok');
            renderGradeList();
        } catch (err) { setMsg('tcGMsg', 'Не удалось сохранить: ' + err.message, 'err'); }
        btn.disabled = false;
    }

    // ── public ──────────────────────────────────────────────────────────────
    window.TeacherCabinet = {
        async init(u, p) {
            user = u; profile = p || {};
            root = document.getElementById('tcGroupsRoot');
            if (!root) return;
            root.innerHTML = '<div class="tc-empty">Загрузка…</div>';
            try { await loadGroups(); renderList(); }
            catch (err) {
                console.warn(err);
                root.innerHTML = '<div class="tc-empty">Не удалось загрузить группы. Проверьте, что правила Firestore для groups / grades / attendance опубликованы (см. FIREBASE_SETUP.md).</div>';
            }
        }
    };
})();
