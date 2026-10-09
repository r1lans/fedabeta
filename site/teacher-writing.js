/* TheStarth — teacher cabinet: "Проверка Writing".
 * Works students wrote in the mock exam (mockWritings): the teacher reads the work, fills in the four IELTS criteria by hand,
 * adds corrections and a comment, and sends the result to the student. No AI, no automatic scoring or copy/AI-text checks.
 * Needs: db, MockEngine, MockFeedback, #tcWritingRoot.   Text is Russian; i18n-extra.js translates the DOM.
 */
(function () {
    'use strict';
    const E = window.MockEngine, F = window.MockFeedback;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const X = (m) => (window.X ? window.X(m) : m);
    const $ = (id) => document.getElementById(id);
    const pad = (n) => String(n).padStart(2, '0');
    const fDate = (t) => { const d = new Date(t); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

    let root, user, profile, list = [], tab = 'inbox', filter = 'new', q = '', wb = null, allCache = null;

    // ====================== shell ======================
    function init(u, p) {
        root = $('tcWritingRoot'); if (!root) return; user = u; profile = p || {};
        root.innerHTML = '<div id="twBody"></div>';
        render(); loadInbox();
    }
    async function loadInbox() {
        try { const snap = await db.collection('mockWritings').get(); list = []; snap.forEach((d) => list.push(Object.assign({ id: d.id }, d.data()))); list.sort((a, b) => (b.ts || 0) - (a.ts || 0)); allCache = list; }
        catch (e) { list = []; const b = $('twBody'); if (b && tab === 'inbox' && !wb) b.innerHTML = '<div class="empty-state">Не удалось загрузить работы: ' + esc(e.message) + '<br>Проверьте, что новые правила Firestore опубликованы.</div>'; return; }
        if (tab === 'inbox' && !wb) render();
    }
    function render() {
        const body = $('twBody'); if (!body) return;
        if (wb) return renderBench();
        const rows = list.filter((w) => (filter === 'all' || (filter === 'new' ? w.status !== 'checked' : w.status === 'checked')) && (!q || String(w.name || '').toLowerCase().indexOf(q) !== -1));
        body.innerHTML = `<div class="mk-bar"><select id="twF" style="max-width:200px"><option value="new" ${filter === 'new' ? 'selected' : ''}>Ждут проверки</option><option value="checked" ${filter === 'checked' ? 'selected' : ''}>Проверено</option><option value="all" ${filter === 'all' ? 'selected' : ''}>Все</option></select><input type="search" id="twQ" placeholder="Поиск по имени" value="${esc(q)}" style="max-width:220px"></div>
            ${rows.length ? rows.map((w) => `<div class="tc-card tw-row"><div><strong>${esc(w.name || 'Без имени')}</strong><small>${esc(w.testTitle)} · ${esc(w.taskTitle)} · ${w.words} слов · ${fDate(w.ts)}</small></div><span class="tw-badge ${w.status === 'checked' ? 'ok' : ''}">${w.status === 'checked' ? 'проверено · band ' + (w.feedback && w.feedback.overall != null ? w.feedback.overall : '—') : 'ждёт проверки'}</span><button class="tc-btn primary" data-open="${esc(w.id)}" type="button">Открыть</button></div>`).join('') : '<div class="empty-state">Пока нет работ.</div>'}`;
        $('twF').onchange = (e) => { filter = e.target.value; render(); };
        $('twQ').oninput = (e) => { q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; render(); const n = $('twQ'); n.focus(); n.setSelectionRange(pos, pos); };
        body.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { const w = list.find((x) => x.id === b.dataset.open); wb = { id: w.id, name: w.name, taskType: w.taskType, prompt: w.prompt, imageUrl: w.imageUrl, text: w.text, uid: w.uid, editable: false, feedback: w.feedback || null, ev: w.feedback || null, scan: null }; renderBench(); }; });
    }

    // ====================== workbench ======================
    function renderBench() {
        const body = $('twBody'), w = wb;
        body.innerHTML = `${w.id ? '<button class="mx-back" id="twBack" type="button">← К списку работ</button>' : ''}
        <div class="tw-grid">
            <div class="tw-left">
                <div class="tc-card"><h3>${w.id ? esc(w.name || 'Ученик') : 'Ваш текст'}</h3>
                    ${`<div class="tw-meta">${w.taskType === 'task1' ? 'Task 1' : 'Task 2'} · ${E.wordCount(w.text)} слов</div><details open><summary>Задание</summary><div class="tw-pre">${esc(w.prompt)}</div>${w.imageUrl ? `<img src="${esc(w.imageUrl)}" alt="" class="mk-img">` : ''}</details>
                    <h4 style="margin:.8rem 0 .3rem">Работа</h4><div class="tw-pre tw-essay">${esc(w.text)}</div>`}
                <div class="tw-wc" id="twWc"></div></div>
            </div>
            <div class="tw-right">
                <div class="tc-card"><h3>Оценка по критериям IELTS</h3>
                    <p class="mx-hint">Прочитайте работу, поставьте оценку по каждому критерию (шаг 0.5), добавьте исправления и комментарий. Итоговая оценка считается по правилам IELTS.</p>
                    <div id="twEv"></div></div>
            </div></div>`;
        const b = $('twBack'); if (b) b.onclick = () => { wb = null; render(); };
        $('twWc').textContent = 'Слов: ' + E.wordCount(w.text);
        if (!w.ev) w.ev = { criteria: { ta: {}, cc: {}, lr: {}, gra: {} }, strengths: [], weaknesses: [], corrections: [], advice: [] };
        renderEval();
    }

    function renderEval() {
        const w = wb, ev = w.ev, names = F.NAMES(w.taskType), box = $('twEv');
        const c = ev.criteria || {};
        box.innerHTML = `<div class="tw-crit">${['ta', 'cc', 'lr', 'gra'].map((k) => `<div class="tw-cr"><div class="tw-crh"><span>${names[k]}</span><input type="number" min="0" max="9" step="0.5" data-b="${k}" value="${c[k] && c[k].band != null ? c[k].band : ''}"></div><textarea data-c="${k}" rows="2" placeholder="Комментарий">${esc((c[k] || {}).comment || '')}</textarea></div>`).join('')}</div>
            <div class="tw-overall">Итоговая оценка за задание: <b id="twOv">—</b></div>
            <label>Сильные стороны (по одной в строке)</label><textarea id="twStr" rows="3">${esc((ev.strengths || []).join('\n'))}</textarea>
            <label>Что слабее (по одной в строке)</label><textarea id="twWk" rows="3">${esc((ev.weaknesses || []).join('\n'))}</textarea>
            <label>Что тренировать (по одной в строке)</label><textarea id="twAd" rows="3">${esc((ev.advice || []).join('\n'))}</textarea>
            <label>Исправления</label><div id="twFix">${(ev.corrections || []).map((x, i) => fixRow(x, i)).join('')}</div><button class="tc-btn" id="twFixAdd" type="button">+ Исправление</button>
            <label>Ваш комментарий ученику</label><textarea id="twNote" rows="3" placeholder="Необязательно">${esc(ev.teacherNote || '')}</textarea>
            ${w.id ? '<div class="mk-bar"><button class="tc-btn primary" id="twSend" type="button">Отправить ученику</button></div><div class="status-msg" id="twSendSt"></div>' : ''}`;
        const recalc = () => { const v = ['ta', 'cc', 'lr', 'gra'].map((k) => { const n = box.querySelector('[data-b="' + k + '"]').value; return n === '' ? null : Number(n); }); $('twOv').textContent = v.every((x) => x != null) ? E.overallBand(v) : '—'; };
        box.querySelectorAll('[data-b]').forEach((n) => { n.oninput = recalc; }); recalc();
        $('twFixAdd').onclick = () => { $('twFix').insertAdjacentHTML('beforeend', fixRow({ original: '', better: '', why: '' }, Date.now())); };
        box.onclick = (e) => { const d = e.target.closest('[data-del]'); if (d) d.closest('.tw-fix').remove(); };
        const s = $('twSend'); if (s) s.onclick = send;
    }
    const fixRow = (x, i) => `<div class="tw-fix"><input type="text" data-fo placeholder="Было" value="${esc(x.original)}"><input type="text" data-fb placeholder="Стало" value="${esc(x.better)}"><input type="text" data-fw placeholder="Почему" value="${esc(x.why)}"><button type="button" class="tc-btn danger" data-del aria-label="Удалить">×</button></div>`;
    function collect() {
        const box = $('twEv'), crit = {};
        ['ta', 'cc', 'lr', 'gra'].forEach((k) => { const n = box.querySelector('[data-b="' + k + '"]').value; crit[k] = { band: n === '' ? null : Math.max(0, Math.min(9, Math.round(Number(n) * 2) / 2)), comment: box.querySelector('[data-c="' + k + '"]').value.trim() }; });
        const fb = { criteria: crit, overall: E.overallBand(['ta', 'cc', 'lr', 'gra'].map((k) => crit[k].band)), strengths: lines($('twStr').value), weaknesses: lines($('twWk').value), advice: lines($('twAd').value), corrections: Array.from(box.querySelectorAll('.tw-fix')).map((r) => ({ original: r.querySelector('[data-fo]').value.trim(), better: r.querySelector('[data-fb]').value.trim(), why: r.querySelector('[data-fw]').value.trim() })).filter((x) => x.original && x.better), teacherNote: $('twNote').value.trim() };
        fb.by = ([profile.name, profile.surname].filter(Boolean).join(' ') || profile.nickname || '').slice(0, 80); fb.ts = Date.now();
        return fb;
    }
    async function send() {
        const st = $('twSendSt'), fb = collect();
        if (fb.overall == null) { st.textContent = 'Заполните все четыре оценки.'; st.className = 'status-msg error'; return; }
        try {
            await db.collection('mockWritings').doc(wb.id).update({ feedback: fb, status: 'checked', checkedBy: user.uid, checkedAt: Date.now() });
            const row = list.find((x) => x.id === wb.id); if (row) { row.feedback = fb; row.status = 'checked'; } wb.feedback = fb;
            st.textContent = 'Отправлено: ученик увидит разбор в разделе «Мои результаты».'; st.className = 'status-msg ok';
        } catch (e) { st.textContent = 'Не удалось сохранить: ' + e.message; st.className = 'status-msg error'; }
    }

    window.TeacherWriting = { init };
})();
