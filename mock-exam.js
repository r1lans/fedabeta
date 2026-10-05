/* TheStarth — mock-exam.html: Mock hub. Pick a kind (Полный мок / Listening / Reading / Writing), pick one of the added tests,
 * choose what to take (whole exam or one part / task), solve it on the site and see the result.
 *   Listening / Reading -> checked instantly (mockResults)
 *   Writing             -> saved to mockWritings, checked by a teacher (with the AI helper in the teacher cabinet); feedback comes back here
 *   Полный мок          -> Listening -> Reading -> Writing in a row, with a summary at the end
 * Needs: db (Firebase), mock-engine.js, mock-feedback.js.
 * All visible text is plain Russian: i18n-extra.js translates the DOM when the language is switched. T() is only for alert/confirm.
 */
(function () {
    'use strict';
    const E = window.MockEngine;
    const T = (s) => (window.X ? window.X(s) : s);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = (id) => document.getElementById(id);
    const pad = (n) => String(n).padStart(2, '0');
    const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
    const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

    const KINDS = {
        full: { name: 'Полный мок', desc: 'Listening, Reading и Writing подряд, как на экзамене' },
        listening: { name: 'Listening', desc: 'Аудио и вопросы: весь раздел или одна часть' },
        reading: { name: 'Reading', desc: 'Текст и вопросы: весь раздел или один текст' },
        writing: { name: 'Writing', desc: 'Task 1 и Task 2, работу проверит учитель' }
    };
    const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return m > 10 && m < 15 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
    const qw = (n) => plural(n, 'вопрос', 'вопроса', 'вопросов');
    const pw = (n) => plural(n, 'часть', 'части', 'частей');
    const tw = (n) => plural(n, 'задание', 'задания', 'заданий');
    const skillName = (s) => (KINDS[s] ? KINDS[s].name : s);
    const rangeText = (p) => { const r = E.range(p); return r ? r[0] + '–' + r[1] : ''; };
    const isLR = (t) => t && (t.skill === 'listening' || t.skill === 'reading');
    const bandText = (b, est) => (b == null ? '' : (est ? '≈ ' : '') + b);

    let tests = [], user = null, profile = null, cat = '', sel = { id: '', scope: 'full', exam: true }, run = null, timer = null, seq = null, history = [], writings = [];

    // ====================== hub ======================
    async function loadTests() {
        const box = $('mxList');
        if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY || typeof db === 'undefined' || !db) { box.innerHTML = '<div class="mx-empty">Тесты пока недоступны.</div>'; return; }
        try {
            const snap = await db.collection('mockTests').where('published', '==', true).get();
            tests = []; snap.forEach((d) => tests.push(Object.assign({ id: d.id }, d.data())));
            tests.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true }));
        } catch (e) { box.innerHTML = '<div class="mx-empty">Не удалось загрузить тесты.</div>'; console.warn(e); return; }
        renderHub(); renderList();
    }
    function ofKind(k) { return tests.filter((t) => t.skill === k); }
    function renderHub() {
        const hub = $('mxHub'); if (!hub) return;
        hub.innerHTML = Object.keys(KINDS).map((k) => { const n = ofKind(k).length; return `<button type="button" class="mx-hubc ${cat === k ? 'on' : ''}" data-k="${k}" ${n ? '' : 'disabled'}><b>${KINDS[k].name}</b><span>${KINDS[k].desc}</span><em>${n ? n + ' ' + plural(n, 'тест', 'теста', 'тестов') : 'Скоро'}</em></button>`; }).join('');
        hub.querySelectorAll('.mx-hubc').forEach((b) => { b.onclick = () => { cat = b.dataset.k; sel = { id: '', scope: 'full', exam: true }; renderHub(); renderList(); $('mxScope').hidden = true; $('mxList').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }; });
    }
    function meta(t) {
        if (t.skill === 'writing') return (t.tasks || []).length + ' ' + tw((t.tasks || []).length) + ' · ' + (t.tasks || []).reduce((s, x) => s + (x.minutes || 0), 0) + ' мин';
        if (t.skill === 'full') return ['listening', 'reading', 'writing'].filter((k) => t.refs && t.refs[k]).map((k) => `<span class="mx-chip">${KINDS[k].name}</span>`).join('');
        return (t.parts || []).length + ' ' + pw((t.parts || []).length) + ' · ' + E.testTotal(t) + ' ' + qw(E.testTotal(t));
    }
    function renderList() {
        const box = $('mxList');
        if (!tests.length) { box.innerHTML = '<div class="mx-empty">Онлайн-тесты скоро появятся. Пока вы можете пройти тест на Engnovate (внизу страницы).</div>'; $('mxScope').hidden = true; return; }
        if (!cat) { box.innerHTML = '<div class="mx-empty">Выберите раздел выше: полный мок, Listening, Reading или Writing.</div>'; $('mxScope').hidden = true; return; }
        const list = ofKind(cat);
        box.innerHTML = `<h3 class="mx-sect-title">${KINDS[cat].name}: выберите тест</h3><div class="mx-cards">${list.map((t) => `<button type="button" class="mx-card ${sel.id === t.id ? 'on' : ''}" data-id="${esc(t.id)}"><strong>${esc(t.title)}</strong><span>${meta(t)}</span></button>`).join('')}</div>`;
        box.querySelectorAll('.mx-card').forEach((b) => {
            b.onclick = () => {
                sel.id = b.dataset.id; const t = tests.find((x) => x.id === sel.id);
                sel.scope = (isLR(t) ? (t.parts || []).length : t.skill === 'writing' ? (t.tasks || []).length : 1) > 1 ? 'full' : '0';
                sel.exam = sel.scope === 'full' || t.skill === 'full';
                renderList(); $('mxScope').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            };
        });
        renderScope();
    }

    function renderScope() {
        const el = $('mxScope'), t = tests.find((x) => x.id === sel.id);
        if (!t) { el.hidden = true; return; }
        el.hidden = false;
        const needLogin = !user && (t.skill === 'writing' || (t.skill === 'full' && t.refs && t.refs.writing));
        const loginNote = needLogin ? '<p class="mx-hint">Для Writing нужен вход в аккаунт (кнопка «Личный кабинет»): работа сохраняется, и учитель сможет её проверить.</p>' : '';
        const startBtn = `<button type="button" class="btn-primary mx-start" id="mxStart" ${needLogin ? 'disabled' : ''}>Начать тест</button>`;
        let opts = [], extra = '', L = false;
        if (t.skill === 'full') {
            const names = ['listening', 'reading', 'writing'].filter((k) => t.refs && t.refs[k]).map((k) => KINDS[k].name);
            el.innerHTML = `<h3>${esc(t.title)}</h3><p>Порядок: ${names.join(' → ')}. Разделы идут подряд; в конце вы увидите общий итог. Writing проверит учитель.</p>
                ${t.refs.listening ? `<label class="mx-exam"><input type="checkbox" id="mxExam" ${sel.exam ? 'checked' : ''}> <span>Режим экзамена в Listening: аудио играет один раз, без паузы и перемотки</span></label>` : ''}${loginNote}${startBtn}`;
            const ex = $('mxExam'); if (ex) ex.onchange = () => { sel.exam = ex.checked; };
            $('mxStart').onclick = start; return;
        }
        if (t.skill === 'writing') {
            const tasks = t.tasks || [];
            if (tasks.length > 1) opts.push({ v: 'full', title: 'Все задания', sub: tasks.reduce((s, x) => s + (x.minutes || 0), 0) + ' мин' });
            tasks.forEach((x, i) => opts.push({ v: String(i), title: x.title, sub: (x.type === 'task1' ? 'График или письмо' : 'Эссе') + ' · от ' + (x.minWords || 0) + ' слов · ' + (x.minutes || 0) + ' мин' }));
        } else {
            const parts = t.parts || []; L = t.skill === 'listening';
            if (parts.length > 1) opts.push({ v: 'full', title: 'Весь ' + skillName(t.skill), sub: E.testTotal(t) + ' ' + qw(E.testTotal(t)) + ' · ' + (L ? '~30 ' : parts.length * 20 + ' ') + 'мин' });
            parts.forEach((p, i) => opts.push({ v: String(i), title: p.title, sub: rangeText(p) + ' · ' + E.partTotal(p) + ' ' + qw(E.partTotal(p)) + (L ? '' : ' · 20 мин') }));
            if (L) extra = `<label class="mx-exam"><input type="checkbox" id="mxExam" ${sel.exam ? 'checked' : ''}> <span>Режим экзамена: аудио играет один раз, без паузы и перемотки</span></label>`;
        }
        el.innerHTML = `<h3>${esc(t.title)} — что будете решать?</h3>
            <div class="mx-scope-opts">${opts.map((o) => `<label class="mx-scope-opt ${sel.scope === o.v ? 'on' : ''}"><input type="radio" name="mxsc" value="${o.v}" ${sel.scope === o.v ? 'checked' : ''}><span><b>${esc(o.title)}</b><small>${esc(o.sub)}</small></span></label>`).join('')}</div>${extra}${loginNote}${startBtn}`;
        el.querySelectorAll('input[name=mxsc]').forEach((r) => { r.onchange = () => { sel.scope = r.value; if (L) sel.exam = r.value === 'full'; renderScope(); }; });
        const ex = $('mxExam'); if (ex) ex.onchange = () => { sel.exam = ex.checked; };
        $('mxStart').onclick = start;
    }

    // ====================== starting ======================
    function start() {
        const t = tests.find((x) => x.id === sel.id); if (!t) return;
        if (run && !confirm(T('Текущий тест будет закрыт без сохранения. Продолжить?'))) return;
        stopRun(); seq = null; $('mxResult').hidden = true;
        if (t.skill === 'full') return startFull(t);
        const n = t.skill === 'writing' ? (t.tasks || []).length : (t.parts || []).length;
        const idxs = sel.scope === 'full' ? Array.from({ length: n }, (_, i) => i) : [parseInt(sel.scope, 10) || 0];
        begin(t, { idxs, full: sel.scope === 'full', exam: sel.exam });
        $('mxRun').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function startFull(t) {
        const segs = ['listening', 'reading', 'writing'].map((k) => { const x = tests.find((y) => y.id === (t.refs || {})[k] && y.skill === k); return x ? { skill: k, test: x } : null; }).filter(Boolean);
        if (!segs.length) { alert(T('В этом полном моке нет опубликованных разделов.')); return; }
        seq = { id: 'f' + Date.now().toString(36), title: t.title, segs, i: 0, exam: sel.exam, summary: [] };
        runSeg();
    }
    function runSeg() {
        const s = seq.segs[seq.i], t = s.test, n = t.skill === 'writing' ? (t.tasks || []).length : (t.parts || []).length;
        $('mxResult').hidden = true;
        begin(t, { idxs: Array.from({ length: n }, (_, i) => i), full: true, exam: seq.exam });
        $('mxRun').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function begin(t, o) {
        const kind = t.skill === 'writing' ? 'writing' : 'lr';
        run = { kind, t, idxs: o.idxs, full: o.full, answers: {}, texts: {}, cur: o.idxs[0], exam: t.skill === 'listening' && o.exam, startedAt: Date.now(), audios: {}, endAt: 0 };
        if (kind === 'writing') { renderWriting(); run.endAt = Date.now() + o.idxs.reduce((s, i) => s + (t.tasks[i].minutes || 20), 0) * 60000; }
        else { renderRun(); if (t.skill === 'reading') run.endAt = Date.now() + 20 * 60000 * o.idxs.length; }
        if (run.endAt) { timer = setInterval(tick, 1000); tick(); }
    }
    function stopRun() { if (timer) clearInterval(timer); timer = null; if (run) Object.keys(run.audios || {}).forEach((k) => { try { run.audios[k].pause(); } catch (e) {} }); run = null; }
    function tick() {
        if (!run || !run.endAt) return;
        const left = (run.endAt - Date.now()) / 1000, el = $('mxTimer'); if (el) { el.textContent = mmss(left); el.classList.toggle('warn', left < 300); }
        if (left <= 0) finish(true);
    }

    // ====================== Listening / Reading runner ======================
    function qNum(it) { return it.count > 1 ? it.n + '–' + (it.n + it.count - 1) : String(it.n); }
    function groupHead(g) {
        const last = g.items[g.items.length - 1], a = g.items[0].n, b = last.n + E.itemCount(last) - 1;
        let h = `<div class="mx-ghead"><b>Вопросы ${a === b ? a : a + '–' + b}</b>${g.instruction ? `<p>${esc(g.instruction)}</p>` : ''}`;
        if (g.type === 'match' && g.options && g.options.length) h += `<ul class="mx-list">${g.options.map((o, i) => { const l = E.optionLabel(o, i); return `<li><b>${esc(l.letter)}</b> ${esc(l.text)}</li>`; }).join('')}</ul>`;
        if (g.type === 'tfng') h += '<p class="mx-hint">TRUE — утверждение совпадает с текстом; FALSE — противоречит тексту; NOT GIVEN — в тексте об этом не сказано.</p>';
        if (g.type === 'yn') h += '<p class="mx-hint">YES — совпадает с мнением автора; NO — противоречит мнению автора; NOT GIVEN — мнение автора не указано.</p>';
        return h + '</div>';
    }
    function itemHtml(g, it) {
        const n = it.n, num = `<span class="mx-num" id="qn${n}">${qNum(it)}</span>`;
        if (g.type === 'gap') {
            const inp = `<input type="text" class="mx-gap" data-n="${n}" data-t="gap" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Вопрос ${n}">`;
            const txt = esc(it.text || '');
            const body = /_{3,}|…{2,}|\.{4,}/.test(it.text || '') ? txt.replace(/_{3,}|…{2,}|\.{4,}/, inp) : `${txt} ${inp}`;
            return `<div class="mx-item mx-gapq">${num}<div class="mx-q">${body}</div></div>`;
        }
        if (g.type === 'tfng' || g.type === 'yn') {
            const o = g.type === 'tfng' ? E.TFNG : E.YN;
            return `<div class="mx-item">${num}<div class="mx-q"><div class="mx-qt">${esc(it.text)}</div><div class="mx-seg">${o.map((v) => `<label><input type="radio" name="q${n}" value="${v}" data-n="${n}" data-t="${g.type}"><span>${v}</span></label>`).join('')}</div></div></div>`;
        }
        if (g.type === 'match') {
            const opts = (g.options || []).map((o, i) => E.optionLabel(o, i).letter);
            return `<div class="mx-item mx-gapq">${num}<div class="mx-q"><span class="mx-qt">${esc(it.text)}</span> <select data-n="${n}" data-t="match" aria-label="Вопрос ${n}"><option value="">—</option>${opts.map((l) => `<option>${l}</option>`).join('')}</select></div></div>`;
        }
        const multi = g.type === 'multi';
        return `<div class="mx-item">${num}<div class="mx-q"><div class="mx-qt">${esc(it.text)}${multi ? ` <i>(выберите ${it.count})</i>` : ''}</div><div class="mx-opts">${(it.options || []).map((o, i) => { const l = E.optionLabel(o, i); return `<label class="mx-opt"><input type="${multi ? 'checkbox' : 'radio'}" name="q${n}" value="${esc(l.letter)}" data-n="${n}" data-t="${g.type}" ${multi ? `data-c="${it.count}"` : ''}><span><b>${esc(l.letter)}</b> ${esc(l.text)}</span></label>`; }).join('')}</div></div></div>`;
    }
    function audioHtml(p, pi) {
        if (!p.audio) return '<div class="mx-audio"><span class="mx-anote">Для этой части аудио не загружено.</span></div>';
        if (!run.exam) return `<div class="mx-audio"><audio controls preload="metadata" src="${esc(p.audio)}"></audio></div>`;
        return `<div class="mx-audio" data-pi="${pi}"><button type="button" class="btn-primary mx-play" data-pi="${pi}">▶ Включить аудио</button><div class="mx-aprog"><i></i></div><span class="mx-atime">0:00</span><div class="mx-anote">Аудио звучит один раз. Пауза и перемотка недоступны, как на экзамене.</div></div>`;
    }
    function partHtml(pi) {
        const p = run.t.parts[pi], read = run.t.skill === 'reading';
        const qs = p.groups.map((g) => `<div class="mx-group">${groupHead(g)}${g.items.map((it) => itemHtml(g, it)).join('')}</div>`).join('');
        if (read) return `<section class="mx-part mx-readgrid" data-pi="${pi}" ${pi === run.cur ? '' : 'hidden'}><article class="mx-passage"><h3>${esc(p.passageTitle || p.title)}</h3>${String(p.passage || '').split(/\n{2,}/).map((x) => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('')}</article><div class="mx-qs">${qs}</div></section>`;
        return `<section class="mx-part" data-pi="${pi}" ${pi === run.cur ? '' : 'hidden'}>${audioHtml(p, pi)}<div class="mx-qs mx-qs-wide">${qs}</div></section>`;
    }
    function seqBadge() { return seq ? `<small class="mx-seqb">Полный мок · раздел ${seq.i + 1} из ${seq.segs.length}</small>` : ''; }
    function renderRun() {
        const t = run.t, el = $('mxRun'), all = [];
        run.idxs.forEach((pi) => t.parts[pi].groups.forEach((g) => g.items.forEach((it) => all.push(it))));
        el.hidden = false;
        el.innerHTML = `<div class="mx-bar">
            <div class="mx-bar-title"><b>${esc(t.title)}</b><small>${skillName(t.skill)}${run.full ? '' : ' · ' + esc(t.parts[run.idxs[0]].title)}</small>${seqBadge()}</div>
            ${run.idxs.length > 1 ? `<div class="mx-tabs">${run.idxs.map((pi) => `<button type="button" class="mx-tab ${pi === run.cur ? 'on' : ''}" data-pi="${pi}">${esc(t.parts[pi].title)}</button>`).join('')}</div>` : ''}
            <div class="mx-timer" id="mxTimer" ${t.skill === 'reading' ? '' : 'hidden'}></div></div>
            <div class="mx-pal" id="mxPal">${all.map((it) => { let s = ''; for (let k = 0; k < E.itemCount(it); k++) s += `<button type="button" class="mx-pn" data-n="${it.n}" data-k="${it.n + k}">${it.n + k}</button>`; return s; }).join('')}</div>
            ${run.idxs.map(partHtml).join('')}
            <div class="mx-foot"><button type="button" class="btn-primary" id="mxFinish">Завершить и проверить</button>${seq ? '' : '<button type="button" class="btn-outline" id="mxCancel">Отмена</button>'}</div>`;
        el.querySelectorAll('.mx-tab').forEach((b) => { b.onclick = () => showPart(+b.dataset.pi); });
        el.querySelectorAll('.mx-play').forEach((b) => { b.onclick = () => playAudio(+b.dataset.pi); });
        el.querySelectorAll('.mx-pn').forEach((b) => { b.onclick = () => { const q = $('qn' + b.dataset.n); if (!q) return; const part = q.closest('.mx-part'); if (part && part.hidden) showPart(+part.dataset.pi); q.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
        el.oninput = onAnswer; el.onchange = onAnswer;
        $('mxFinish').onclick = () => finish(false);
        const c = $('mxCancel'); if (c) c.onclick = () => { if (confirm(T('Закрыть тест без сохранения результата?'))) { stopRun(); el.hidden = true; el.innerHTML = ''; } };
    }
    function showPart(pi) {
        run.cur = pi;
        document.querySelectorAll('#mxRun .mx-part').forEach((s) => { s.hidden = +s.dataset.pi !== pi; });
        document.querySelectorAll('#mxRun .mx-tab').forEach((b) => b.classList.toggle('on', +b.dataset.pi === pi));
    }
    function onAnswer(e) {
        const el = e.target, n = el.dataset && el.dataset.n; if (!n || !run || run.kind !== 'lr') return;
        if (el.dataset.t === 'multi') {
            const box = el.closest('.mx-opts'), max = +el.dataset.c || 2, checked = Array.from(box.querySelectorAll('input:checked'));
            if (checked.length > max) { el.checked = false; return; }
            run.answers[n] = checked.map((x) => x.value);
        } else run.answers[n] = el.value;
        paintPal();
    }
    function answered(it) { const a = run.answers[it.n]; return Array.isArray(a) ? a.length >= (it.count || 1) : !!String(a == null ? '' : a).trim(); }
    function paintPal() {
        document.querySelectorAll('#mxPal .mx-pn').forEach((b) => {
            const a = run.answers[+b.dataset.n], k = +b.dataset.k - +b.dataset.n;
            b.classList.toggle('done', Array.isArray(a) ? a.length > k : !!String(a == null ? '' : a).trim());
        });
    }

    // ----- audio (exam mode: plays once) -----
    function playAudio(pi) {
        const p = run.t.parts[pi]; const box = document.querySelector('.mx-audio[data-pi="' + pi + '"]'); if (!box || run.audios[pi]) return;
        const a = new Audio(p.audio); run.audios[pi] = a;
        Object.keys(run.audios).forEach((k) => { if (+k !== pi) { try { run.audios[k].pause(); } catch (e) {} } });
        const btn = box.querySelector('.mx-play'), bar = box.querySelector('.mx-aprog i'), tm = box.querySelector('.mx-atime');
        btn.disabled = true; btn.textContent = 'Идёт аудио…';
        a.ontimeupdate = () => { if (a.duration) bar.style.width = (a.currentTime / a.duration * 100) + '%'; tm.textContent = mmss(a.currentTime) + ' / ' + mmss(a.duration || 0); };
        a.onended = () => {
            btn.textContent = 'Аудио закончилось'; bar.style.width = '100%';
            const pos = run.idxs.indexOf(pi), next = run.idxs[pos + 1];
            if (next != null) setTimeout(() => { if (!run) return; showPart(next); const b = document.querySelector('.mx-play[data-pi="' + next + '"]'); if (b && !b.disabled) { try { playAudio(next); } catch (e) {} } }, 2500);
        };
        a.onerror = () => { delete run.audios[pi]; btn.disabled = false; btn.textContent = '▶ Включить аудио'; alert(T('Не удалось загрузить аудио. Проверьте интернет и попробуйте ещё раз.')); };
        const pr = a.play(); if (pr && pr.catch) pr.catch(() => { delete run.audios[pi]; btn.disabled = false; btn.textContent = '▶ Включить аудио'; });
    }

    // ====================== Writing runner ======================
    const draftKey = (t, i) => 'starth_mockdraft_' + t.id + '_' + i;
    function renderWriting() {
        const t = run.t, el = $('mxRun'); el.hidden = false;
        el.innerHTML = `<div class="mx-bar">
            <div class="mx-bar-title"><b>${esc(t.title)}</b><small>Writing${run.full ? '' : ' · ' + esc(t.tasks[run.idxs[0]].title)}</small>${seqBadge()}</div>
            ${run.idxs.length > 1 ? `<div class="mx-tabs">${run.idxs.map((i) => `<button type="button" class="mx-tab ${i === run.cur ? 'on' : ''}" data-i="${i}">${esc(t.tasks[i].title)}</button>`).join('')}</div>` : ''}
            <div class="mx-timer" id="mxTimer"></div></div>
            ${run.idxs.map((i) => { const x = t.tasks[i], d = store.get(draftKey(t, i)) || ''; run.texts[i] = d; return `<section class="mx-part mx-wr" data-i="${i}" ${i === run.cur ? '' : 'hidden'}>
                <article class="mx-wr-task"><h3>${esc(x.title)}</h3><div style="white-space:pre-wrap">${esc(x.prompt)}</div>${x.imageUrl ? `<img src="${esc(x.imageUrl)}" alt="">` : ''}<p class="mx-hint">Напишите не меньше ${x.minWords || 0} слов.</p></article>
                <div class="mx-wr-area"><textarea data-i="${i}" spellcheck="false" placeholder="Пишите ответ здесь…" aria-label="${esc(x.title)}">${esc(d)}</textarea><div class="mx-wc" data-wc="${i}"><span>Слов: <b>0</b></span><span>минимум ${x.minWords || 0}</span></div></div></section>`; }).join('')}
            <div class="mx-foot"><button type="button" class="btn-primary" id="mxFinish">Отправить на проверку</button>${seq ? '' : '<button type="button" class="btn-outline" id="mxCancel">Отмена</button>'}</div>`;
        el.querySelectorAll('.mx-tab').forEach((b) => { b.onclick = () => { run.cur = +b.dataset.i; el.querySelectorAll('.mx-part').forEach((s) => { s.hidden = +s.dataset.i !== run.cur; }); el.querySelectorAll('.mx-tab').forEach((x) => x.classList.toggle('on', x === b)); }; });
        const count = (i) => { const w = E.wordCount(run.texts[i]), min = t.tasks[i].minWords || 0, box = el.querySelector('[data-wc="' + i + '"]'); box.querySelector('b').textContent = w; box.className = 'mx-wc ' + (w >= min ? 'ok' : 'low'); };
        run.idxs.forEach(count);
        el.oninput = (e) => { const ta = e.target; if (ta.tagName !== 'TEXTAREA' || !run) return; const i = +ta.dataset.i; run.texts[i] = ta.value; store.set(draftKey(t, i), ta.value); count(i); };
        $('mxFinish').onclick = () => finish(false);
        const c = $('mxCancel'); if (c) c.onclick = () => { if (confirm(T('Закрыть тест? Написанный текст сохранится как черновик на этом устройстве.'))) { stopRun(); el.hidden = true; el.innerHTML = ''; } };
    }

    // ====================== finishing ======================
    async function finish(auto) {
        if (!run) return;
        if (run.kind === 'writing') return finishWriting(auto);
        let un = 0; run.idxs.forEach((pi) => run.t.parts[pi].groups.forEach((g) => g.items.forEach((it) => { if (!answered(it)) un++; })));
        if (!auto && un && !confirm(T('Есть вопросы без ответа:') + ' ' + un + '. ' + T('Завершить тест?'))) return;
        const secs = Math.round((Date.now() - run.startedAt) / 1000), r = run, t = r.t;
        stopRun();
        let correct = 0, total = 0; const perPart = [], review = [];
        r.idxs.forEach((pi) => { const g = E.gradePart(t.parts[pi], pi, r.answers); correct += g.correct; total += g.total; perPart.push({ pi, c: g.correct, t: g.total }); g.items.forEach((x) => review.push(x)); });
        const b = E.bandFor(t.skill, correct, total);
        $('mxRun').hidden = true; $('mxRun').innerHTML = '';
        const info = { kind: 'lr', t, r, correct, total, b, perPart, review, secs };
        saveResult(info);
        afterSegment(info);
    }
    async function finishWriting(auto) {
        const r = run, t = r.t, filled = r.idxs.filter((i) => String(r.texts[i] || '').trim());
        if (!filled.length) { if (!auto) alert(T('Напишите хотя бы одно задание.')); else { stopRun(); $('mxRun').hidden = true; } return; }
        const low = filled.filter((i) => E.wordCount(r.texts[i]) < (t.tasks[i].minWords || 0));
        if (!auto && low.length && !confirm(T('В некоторых заданиях меньше минимума слов: оценка будет снижена. Отправить?'))) return;
        const secs = Math.round((Date.now() - r.startedAt) / 1000);
        stopRun(); $('mxRun').hidden = true; $('mxRun').innerHTML = '';
        const sent = []; let failed = false;
        const nm = profile ? [profile.name, profile.surname].filter(Boolean).join(' ') : '';
        for (const i of filled) {
            const x = t.tasks[i], text = String(r.texts[i]).slice(0, 9000);
            const doc = { uid: user.uid, name: (nm || (profile && profile.nickname) || user.email || '').slice(0, 80), testId: t.id, testTitle: String(t.title || '').slice(0, 120), taskIdx: i, taskTitle: String(x.title || '').slice(0, 60), taskType: x.type === 'task1' ? 'task1' : 'task2', prompt: String(x.prompt || '').slice(0, 3000), imageUrl: String(x.imageUrl || '').slice(0, 600), text, words: E.wordCount(text), secs, ts: Date.now(), status: 'new' };
            if (seq) { doc.fullId = seq.id; doc.fullTitle = String(seq.title || '').slice(0, 120); }
            try { const ref = await db.collection('mockWritings').add(doc); sent.push(Object.assign({ id: ref.id }, doc)); store.del(draftKey(t, i)); } catch (e) { console.warn(e); failed = true; }
        }
        writings = sent.concat(writings); renderHistory();
        const info = { kind: 'writing', t, sent, failed, secs };
        afterSegment(info);
    }

    // ====================== after one test / one section ======================
    function afterSegment(info) {
        if (!seq) return info.kind === 'writing' ? showWritingSent(info) : renderResult(info);
        seq.summary.push(info);
        if (seq.i + 1 < seq.segs.length) return renderTransition(info);
        renderFinal();
    }
    const segLine = (info) => info.kind === 'writing' ? (info.failed ? 'Не удалось отправить работу.' : 'Writing отправлен учителю на проверку.') : `${info.correct} из ${info.total} · ${info.b.band != null ? 'band ' + bandText(info.b.band, info.b.estimated) : ''}`;
    function renderTransition(info) {
        const el = $('mxResult'); el.hidden = false; const next = seq.segs[seq.i + 1];
        const mins = next.skill === 'reading' ? '60' : next.skill === 'writing' ? (next.test.tasks || []).reduce((s, x) => s + (x.minutes || 0), 0) : '30';
        el.innerHTML = `<div class="mx-trans"><h3>${skillName(info.t.skill)} завершён</h3><p>${esc(segLine(info))}</p><p>Дальше: <b>${skillName(next.skill)}</b> · около ${mins} мин. Можно сделать короткий перерыв, время не идёт, пока вы не нажмёте кнопку.</p><div class="mx-foot"><button type="button" class="btn-primary" id="mxNext">Продолжить: ${skillName(next.skill)}</button></div></div>`;
        $('mxNext').onclick = () => { seq.i++; runSeg(); };
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function renderFinal() {
        const el = $('mxResult'); el.hidden = false;
        const L = seq.summary.find((x) => x.t.skill === 'listening'), R = seq.summary.find((x) => x.t.skill === 'reading'), W = seq.summary.find((x) => x.kind === 'writing');
        const card = (name, x) => x ? `<div class="mx-sum"><small>${name}</small><b>${x.kind === 'writing' ? (x.failed ? '—' : '✓') : bandText(x.b.band, x.b.estimated)}</b><small>${x.kind === 'writing' ? (x.failed ? 'не отправлено' : 'на проверке у учителя') : x.correct + ' / ' + x.total}</small></div>` : '';
        const lr = E.overallBand([L && L.b.band, R && R.b.band].filter((v) => v != null));
        el.innerHTML = `<div class="mx-res-top"><div class="mx-score"><b>${esc(seq.title)}</b><small>Полный мок завершён</small></div>${lr != null ? `<div class="mx-band"><small>Среднее Listening и Reading</small><b>${lr}</b></div>` : ''}</div>
            <div class="mx-sumgrid">${card('Listening', L)}${card('Reading', R)}${card('Writing', W)}</div>
            ${W && !W.failed ? '<p class="mx-hint">Оценка за Writing появится в разделе «Мои результаты», когда учитель проверит работу. Тогда можно будет посчитать общий балл.</p>' : ''}
            <p class="mx-hint" id="mxSaved">${user ? 'Результаты сохранены в вашем профиле.' : 'Войдите в аккаунт (кнопка «Личный кабинет»), чтобы результаты сохранялись.'}</p>
            <div class="mx-foot"><button type="button" class="btn-primary" id="mxAgain">Пройти ещё раз</button><button type="button" class="btn-outline" id="mxOther">Выбрать другой тест</button></div>`;
        $('mxAgain').onclick = start; $('mxOther').onclick = () => { el.hidden = true; $('mxPick').scrollIntoView({ behavior: 'smooth' }); };
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function showWritingSent(info) {
        const el = $('mxResult'); el.hidden = false;
        el.innerHTML = `<div class="mx-trans"><h3>${info.failed ? 'Не удалось отправить' : 'Работа отправлена'}</h3>
            ${info.failed ? '<p>Проверьте интернет. Текст сохранён как черновик на этом устройстве: откройте тест и отправьте снова.</p>' : `<p>Учитель проверит работу в своём кабинете. Оценка и разбор появятся здесь, в разделе «Мои результаты».</p><p class="mx-hint">${info.sent.map((w) => esc(w.taskTitle) + ': ' + w.words + ' слов').join(' · ')}</p>`}
            <div class="mx-foot"><button type="button" class="btn-outline" id="mxOther">Выбрать другой тест</button></div></div>`;
        $('mxOther').onclick = () => { el.hidden = true; $('mxPick').scrollIntoView({ behavior: 'smooth' }); };
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function fmt(v) { if (Array.isArray(v)) return v.length ? v.join(', ') : '—'; v = String(v == null ? '' : v).trim(); return v || '—'; }
    function renderResult(info) {
        const { t, correct, total, b, perPart, review, secs } = info, el = $('mxResult'); el.hidden = false;
        const pct = total ? Math.round(correct / total * 100) : 0;
        const bandTxt = b.band == null ? '' : `<div class="mx-band"><small>${b.estimated ? 'Примерный балл IELTS' : 'Балл IELTS'}</small><b>${b.estimated ? '≈ ' : ''}${b.band}</b></div>`;
        el.innerHTML = `<div class="mx-res-top"><div class="mx-score"><b>${correct}</b><span>/ ${total}</span><small>${pct}% · ${mmss(secs)}</small></div>${bandTxt}</div>
            ${b.estimated ? '<p class="mx-hint">Балл посчитан по проценту верных ответов на шкале из 40 вопросов. Точный балл IELTS даёт только полный экзамен.</p>' : ''}
            ${perPart.length > 1 ? `<div class="mx-pp">${perPart.map((x) => `<span>${esc(t.parts[x.pi].title)}: <b>${x.c}/${x.t}</b></span>`).join('')}</div>` : ''}
            <p class="mx-hint" id="mxSaved">${user ? '' : 'Войдите в аккаунт (кнопка «Личный кабинет»), чтобы результаты сохранялись.'}</p>
            <h3 class="mx-rev-title">Разбор ответов</h3>
            <div class="mx-rev">${review.map((x) => {
                const ok = x.res.ok, part = !ok && x.res.got > 0;
                return `<div class="mx-rv ${ok ? 'ok' : part ? 'part' : 'bad'}"><span class="mx-rvn">${qNum(x.it)}</span><div><div class="mx-rvq">${esc(x.it.text || '').replace(/_{3,}/g, '____')}</div><div class="mx-rva">Ваш ответ: <b>${esc(fmt(x.given))}</b>${ok ? '' : ` · Верно: <b>${esc(x.res.expected || '—')}</b>`}</div></div><span class="mx-rvm">${ok ? '✓' : part ? '½' : '✕'}</span></div>`;
            }).join('')}</div>
            <div class="mx-foot"><button type="button" class="btn-primary" id="mxAgain">Пройти ещё раз</button><button type="button" class="btn-outline" id="mxOther">Выбрать другой тест</button></div>`;
        $('mxAgain').onclick = start;
        $('mxOther').onclick = () => { el.hidden = true; $('mxPick').scrollIntoView({ behavior: 'smooth' }); };
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    async function saveResult(info) {
        if (!user || typeof db === 'undefined' || !db) return;
        const { t, r, correct, total, b, secs } = info;
        const nm = profile ? [profile.name, profile.surname].filter(Boolean).join(' ') : '';
        const doc = { uid: user.uid, name: (nm || (profile && profile.nickname) || user.email || '').slice(0, 80), testId: t.id, title: String(t.title || '').slice(0, 120), skill: t.skill, scope: r.full ? 'full' : 'part', parts: r.idxs.map((i) => i + 1), correct, total, band: b.band, bandEstimated: !!b.estimated, secs, ts: Date.now() };
        if (seq) { doc.fullId = seq.id; doc.fullTitle = String(seq.title || '').slice(0, 120); }
        try { await db.collection('mockResults').add(doc); const sv = $('mxSaved'); if (sv && !seq) sv.textContent = 'Результат сохранён в вашем профиле.'; history.unshift(doc); renderHistory(); }
        catch (e) { console.warn(e); const sv = $('mxSaved'); if (sv) sv.textContent = 'Не удалось сохранить результат (проверьте интернет).'; }
    }

    // ====================== history (results + checked writings) ======================
    async function loadHistory() {
        const box = $('mxHistory'); if (!user || typeof db === 'undefined' || !db) { box.hidden = true; return; }
        try { const snap = await db.collection('mockResults').where('uid', '==', user.uid).get(); history = []; snap.forEach((d) => history.push(d.data())); } catch (e) { history = []; }
        try { const snap = await db.collection('mockWritings').where('uid', '==', user.uid).get(); writings = []; snap.forEach((d) => writings.push(Object.assign({ id: d.id }, d.data()))); } catch (e) { writings = []; }
        renderHistory();
    }
    function renderHistory() {
        const box = $('mxHistory');
        const rows = history.map((h) => ({ ts: h.ts || 0, h })).concat(writings.map((w) => ({ ts: w.ts || 0, w })));
        rows.sort((a, b) => b.ts - a.ts);
        if (!user || !rows.length) { box.hidden = true; return; }
        box.hidden = false;
        box.innerHTML = '<h3>Мои результаты</h3>' + rows.slice(0, 14).map((x, i) => {
            const d = new Date(x.ts), ds = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
            if (x.h) { const h = x.h; return `<div class="mx-h"><div><b>${esc(h.title)}</b><small>${skillName(h.skill)} · ${h.scope === 'full' ? 'весь экзамен' : 'часть ' + (h.parts || []).join(', ')} · ${ds}</small></div><span><b>${h.correct}/${h.total}</b>${h.band != null ? ' · ' + bandText(h.band, h.bandEstimated) : ''}</span></div>`; }
            const w = x.w, fb = w.feedback;
            return `<div class="mx-h"><div><b>${esc(w.testTitle)}: ${esc(w.taskTitle)}</b><small>Writing · ${w.words} слов · ${ds}</small></div><span>${fb ? `<b>band ${fb.overall != null ? fb.overall : '—'}</b> <button type="button" data-w="${esc(w.id)}">Разбор</button>` : '<em>на проверке</em>'}</span></div>`;
        }).join('');
        box.querySelectorAll('button[data-w]').forEach((b) => { b.onclick = () => openFeedback(writings.find((w) => w.id === b.dataset.w)); });
    }
    function openFeedback(w) {
        if (!w || !w.feedback) return; const el = $('mxResult'); el.hidden = false;
        el.innerHTML = `<div class="mx-trans"><h3>${esc(w.testTitle)}: ${esc(w.taskTitle)}</h3>${window.MockFeedback.html(w.feedback, { taskType: w.taskType })}
            <details class="mx-eng" style="margin-top:1rem"><summary>Ваш текст (${w.words} слов)</summary><div style="white-space:pre-wrap;margin-top:.6rem">${esc(w.text)}</div></details>
            <div class="mx-foot"><button type="button" class="btn-outline" id="mxClose">Закрыть</button></div></div>`;
        $('mxClose').onclick = () => { el.hidden = true; };
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    window.addEventListener('beforeunload', (e) => { if (run) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('starth-auth-ready', (e) => { user = e.detail && e.detail.user; profile = e.detail && e.detail.profile; loadHistory(); renderScope(); });
    if (window.currentAuthUser) { user = window.currentAuthUser; profile = window.currentUserProfile; loadHistory(); }
    loadTests();
})();
