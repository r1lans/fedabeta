/* TheStarth — admin panel: "Mock-тесты" (build IELTS Listening / Reading tests, with AI help, and see student results).
 * Needs (from admin.html): db, firebase, escapeHtml, CsvExport.   Needs: mock-engine.js, mock-config.js.
 * Collections: mockTests (the tests), mockResults (what students got).  Audio goes to Firebase Storage: mockAudio/…
 */
(function () {
    'use strict';
    const E = window.MockEngine;
    const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const $ = (id) => document.getElementById(id);
    const TYPE_NAMES = { gap: 'Вписать слово / число', mcq: 'Выбрать один вариант', multi: 'Выбрать несколько вариантов', tfng: 'True / False / Not Given', yn: 'Yes / No / Not Given', match: 'Сопоставить (буквы из списка)' };
    const MAX_AUDIO_MB = 60;

    let tests = [], results = [], ed = null, view = 'tests';

    const st = (id, text, ok) => { const el = $(id); if (!el) return; el.textContent = text || ''; el.className = 'status-msg' + (text ? (ok ? ' ok' : ' error') : ''); };
    const aiOn = () => !!window.MOCK_AI_URL;
    const blankPart = (skill, n) => (skill === 'reading' ? { title: 'Passage ' + n, passageTitle: '', passage: '', groups: [] } : { title: 'Part ' + n, audio: '', groups: [] });
    const blankItem = (type) => {
        const it = { n: 0, text: '', answer: type === 'gap' ? [] : type === 'multi' ? [] : '' };
        if (type === 'mcq' || type === 'multi') it.options = ['A. ', 'B. ', 'C. '];
        if (type === 'multi') it.count = 2;
        return it;
    };
    const total = () => (ed ? E.testTotal(ed) : 0);

    const metaOf = (t) => t.skill === 'writing' ? 'Writing · заданий: ' + (t.tasks || []).length
        : t.skill === 'full' ? 'Полный мок · ' + ['listening', 'reading', 'writing'].filter((k) => t.refs && t.refs[k]).map((k) => SKILL_NAMES[k]).join(' + ')
        : (t.skill === 'reading' ? 'Reading' : 'Listening') + ' · частей: ' + (t.parts || []).length + ' · вопросов: ' + E.testTotal(t);

    // ====================== list of tests ======================
    async function loadMocks() {
        const box = $('mk-list'); if (!box) return;
        try {
            const snap = await db.collection('mockTests').get();
            tests = []; snap.forEach((d) => tests.push(Object.assign({ id: d.id }, d.data())));
            tests.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
        } catch (e) { box.innerHTML = '<div class="empty-state">Не удалось загрузить тесты: ' + esc(e.message) + '<br>Проверьте, что новые правила Firestore опубликованы.</div>'; return; }
        if (!tests.length) { box.innerHTML = '<div class="empty-state">Тестов пока нет. Нажмите «Новый тест».</div>'; return; }
        box.innerHTML = tests.map((t) => `<div class="admin-row">
            <div class="ar-main"><strong>${esc(t.title || 'Без названия')}</strong><small>${esc(metaOf(t))} · ${t.published ? 'виден ученикам' : 'черновик'}</small></div>
            <button class="btn-small primary" onclick="MockAdmin.edit('${t.id}')">Редактировать</button>
            <button class="btn-small" onclick="MockAdmin.toggle('${t.id}')">${t.published ? 'Скрыть' : 'Опубликовать'}</button>
            <button class="btn-small danger" onclick="MockAdmin.remove('${t.id}')">Удалить</button></div>`).join('');
    }
    async function toggle(id) { const t = tests.find((x) => x.id === id); if (!t) return; try { await db.collection('mockTests').doc(id).update({ published: !t.published }); } catch (e) { alert('Ошибка: ' + e.message); } loadMocks(); }
    async function remove(id) {
        const t = tests.find((x) => x.id === id); if (!t || !confirm('Удалить тест «' + (t.title || '') + '»? Результаты учеников останутся.')) return;
        try { await db.collection('mockTests').doc(id).delete(); } catch (e) { alert('Ошибка: ' + e.message); } loadMocks();
    }

    // ====================== views ======================
    function setView(v) {
        view = v;
        document.querySelectorAll('.mk-vtab').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
        $('mk-tests').style.display = v === 'tests' ? '' : 'none';
        $('mk-results').style.display = v === 'results' ? '' : 'none';
        if (v === 'results') loadResults();
    }
    function newTest(skill) { ed = { id: '', title: '', skill: 'listening', published: false, parts: [blankPart('listening', 1)] }; if (skill && skill !== 'listening') switchSkill(skill); openEditor(); }
    function edit(id) { const t = tests.find((x) => x.id === id); if (!t) return; ed = JSON.parse(JSON.stringify(t)); if (ed.parts) ed.parts.forEach((p) => { p._src = { text: '', answers: '' }; }); if (ed.skill === 'writing' && !ed.tasks) ed.tasks = blankTasks(); if (ed.skill === 'full' && !ed.refs) ed.refs = { listening: '', reading: '', writing: '' }; openEditor(); }
    function openEditor() { $('mk-tests').style.display = 'none'; $('mk-editor').style.display = ''; document.querySelector('.mk-vtabs').style.display = 'none'; renderEditor(); window.scrollTo({ top: 0 }); }
    function closeEditor() { ed = null; $('mk-editor').style.display = 'none'; document.querySelector('.mk-vtabs').style.display = ''; setView('tests'); loadMocks(); }

    // ====================== editor ======================
    const SKILL_NAMES = { listening: 'Listening', reading: 'Reading', writing: 'Writing', full: 'Полный мок (Listening + Reading + Writing)' };
    const isLR = () => ed && (ed.skill === 'listening' || ed.skill === 'reading');
    function switchSkill(to) {
        const was = ed.skill; ed.skill = to;
        const lr = (k) => k === 'listening' || k === 'reading';
        if (lr(to)) {
            if (!ed.parts || !lr(was)) ed.parts = [blankPart(to, 1)];
            ed.parts.forEach((p) => { p._src = p._src || { text: '', answers: '' }; if (to === 'reading') { delete p.audio; p.passage = p.passage || ''; p.passageTitle = p.passageTitle || ''; } else { delete p.passage; delete p.passageTitle; p.audio = p.audio || ''; } });
            delete ed.tasks; delete ed.refs;
        } else if (to === 'writing') { ed.tasks = ed.tasks || blankTasks(); delete ed.parts; delete ed.refs; }
        else { ed.refs = ed.refs || { listening: '', reading: '', writing: '' }; delete ed.parts; delete ed.tasks; }
    }
    const blankTasks = () => [
        { title: 'Task 1', type: 'task1', prompt: '', imageUrl: '', minWords: 150, minutes: 20 },
        { title: 'Task 2', type: 'task2', prompt: '', imageUrl: '', minWords: 250, minutes: 40 }];

    function renderEditor() {
        if (!ed) return;
        const ai = aiOn();
        $('mk-editor').innerHTML = `
        <div class="admin-form">
            <div class="mk-top">
                <div><label>Название теста</label><input type="text" id="mk-title" maxlength="120" placeholder="Например: Cambridge IELTS 19, Test 1" value="${esc(ed.title)}"></div>
                <div><label>Раздел</label><select id="mk-skill">${Object.keys(SKILL_NAMES).map((k) => `<option value="${k}" ${ed.skill === k ? 'selected' : ''}>${SKILL_NAMES[k]}</option>`).join('')}</select></div>
            </div>
            ${isLR() ? `<div class="mk-ai ${ai ? 'on' : ''}">${ai ? 'ИИ подключён: в каждой части загрузите файл с заданием и нажмите «Составить с помощью ИИ».' : 'ИИ-сервер не подключён (см. MOCK_SETUP.md). Пока можно нажать «Скопировать запрос для ИИ», вставить его в ChatGPT или Claude, а ответ вставить кнопкой «Вставить JSON». Или заполнить вопросы вручную ниже.'}</div>` : ''}
        </div>
        <div id="mk-parts"></div>
        ${isLR() ? `<div class="mk-bar">
            <button class="btn-small" onclick="MockAdmin.addPart()">+ Добавить часть</button>
            <button class="btn-small" onclick="MockAdmin.importAll()">Вставить JSON всего теста</button>
            <span class="mk-count" id="mk-count"></span>
        </div>` : ''}
        <div class="status-msg" id="mk-save-status"></div>
        <div class="mk-bar">
            <button class="btn-primary" onclick="MockAdmin.save(false)">Сохранить черновик</button>
            <button class="btn-primary" onclick="MockAdmin.save(true)">Сохранить и опубликовать</button>
            <button class="btn-small" onclick="MockAdmin.close()">Закрыть</button>
        </div>`;
        $('mk-title').oninput = (e) => { ed.title = e.target.value; };
        $('mk-skill').onchange = (e) => { switchSkill(e.target.value); renderEditor(); };
        if (isLR()) renderParts(); else if (ed.skill === 'writing') renderTasks(); else renderFull();
    }

    // ----- Writing: tasks -----
    function renderTasks() {
        $('mk-parts').innerHTML = `<div class="mk-note">Ученик увидит задание, поле для текста, счётчик слов и таймер. Работу проверяет учитель в своём кабинете (с помощью ИИ). Можно оставить только одно задание.</div>` + ed.tasks.map((t, i) => `<div class="mk-part" data-t="${i}">
            <div class="mk-part-head">
                <input type="text" class="mk-ptitle" data-tf="title" value="${esc(t.title)}" maxlength="60" aria-label="Название задания">
                <select data-tf="type" style="max-width:260px"><option value="task1" ${t.type === 'task1' ? 'selected' : ''}>Task 1 (график, письмо)</option><option value="task2" ${t.type === 'task2' ? 'selected' : ''}>Task 2 (эссе)</option></select>
                <button class="btn-small danger" data-tact="del">Удалить</button>
            </div>
            <label>Текст задания</label><textarea data-tf="prompt" rows="4" placeholder="The graph below shows… Write at least 150 words.">${esc(t.prompt)}</textarea>
            <label>Картинка к заданию (график, схема, карта) — необязательно</label>
            <div class="mk-audio"><input type="text" data-tf="imageUrl" placeholder="Ссылка или загрузите файл →" value="${esc(t.imageUrl || '')}"><label class="btn-small mk-up">Загрузить картинку<input type="file" accept="image/*" data-tact="img" hidden></label></div>
            <div class="mk-audio-st" data-st="img"></div>
            ${t.imageUrl ? `<img src="${esc(t.imageUrl)}" alt="" class="mk-img">` : ''}
            <div class="mk-top" style="margin-top:.6rem"><div><label>Минимум слов</label><input type="number" min="50" max="600" data-tf="minWords" value="${t.minWords || 150}"></div><div><label>Время, минут</label><input type="number" min="5" max="120" data-tf="minutes" value="${t.minutes || 20}"></div></div>
        </div>`).join('') + `<div class="mk-bar"><button class="btn-small" data-tact="add">+ Добавить задание</button></div>`;
        const root = $('mk-parts');
        root.oninput = (e) => { const el = e.target, card = el.closest('[data-t]'); if (!card || !el.dataset.tf) return; const t = ed.tasks[+card.dataset.t]; const v = el.type === 'number' ? (parseInt(el.value, 10) || 0) : el.value; t[el.dataset.tf] = v; };
        root.onchange = (e) => {
            const el = e.target, card = el.closest('[data-t]'); if (!card) return; const i = +card.dataset.t, t = ed.tasks[i];
            if (el.dataset.tf === 'type') { t.type = el.value; t.minWords = t.type === 'task1' ? 150 : 250; t.minutes = t.type === 'task1' ? 20 : 40; renderTasks(); }
            else if (el.dataset.tact === 'img') uploadImage(el, i, card);
            else if (el.dataset.tf === 'imageUrl') renderTasks();
        };
        root.onclick = (e) => {
            const b = e.target.closest('button[data-tact]'); if (!b) return; const card = b.closest('[data-t]');
            if (b.dataset.tact === 'add') { ed.tasks.push({ title: 'Task ' + (ed.tasks.length + 1), type: 'task2', prompt: '', imageUrl: '', minWords: 250, minutes: 40 }); renderTasks(); }
            else if (b.dataset.tact === 'del') { if (ed.tasks.length < 2) return alert('Нужно хотя бы одно задание.'); ed.tasks.splice(+card.dataset.t, 1); renderTasks(); }
        };
    }
    async function uploadImage(input, i, card) {
        const f = input.files && input.files[0]; if (!f) return; const sEl = card.querySelector('[data-st="img"]');
        const say = (t, ok) => { sEl.textContent = t; sEl.className = 'mk-audio-st status-msg' + (ok ? ' ok' : ' error'); };
        if (!/^image\//.test(f.type)) return say('Это не картинка.', false);
        if (f.size > 8 * 1024 * 1024) return say('Файл больше 8 МБ.', false);
        if (!window.firebase || !firebase.storage) return say('Firebase Storage не подключён.', false);
        const ref = firebase.storage().ref('mockImages/' + Date.now() + '-' + f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60));
        say('Загружаю…', true);
        try { await ref.put(f, { contentType: f.type }); ed.tasks[i].imageUrl = await ref.getDownloadURL(); renderTasks(); }
        catch (e) { say(e && e.code === 'storage/unauthorized' ? 'Нет прав: опубликуйте новые правила Storage (storage.rules).' : 'Не удалось загрузить: ' + ((e && e.message) || e), false); }
        input.value = '';
    }

    // ----- Full mock: pick one test of each kind -----
    function renderFull() {
        const opt = (sk) => { const list = tests.filter((t) => t.skill === sk && t.id !== ed.id); return `<select data-rf="${sk}"><option value="">— не включать —</option>${list.map((t) => `<option value="${esc(t.id)}" ${ed.refs[sk] === t.id ? 'selected' : ''}>${esc(t.title)}${t.published ? '' : ' (черновик)'}</option>`).join('')}</select>${list.length ? '' : `<small class="mk-hint">Сначала создайте и сохраните тест Listening/Reading/Writing.</small>`}`; };
        $('mk-parts').innerHTML = `<div class="mk-note">Полный мок собирается из уже созданных тестов: ученик проходит их подряд (Listening → Reading → Writing) и в конце видит общий итог. Можно включить не все разделы.</div>
        <div class="admin-form"><label>Listening</label>${opt('listening')}<label>Reading</label>${opt('reading')}<label>Writing</label>${opt('writing')}</div>`;
        $('mk-parts').onchange = (e) => { const k = e.target.dataset.rf; if (k) ed.refs[k] = e.target.value; };
    }

    function renderParts() {
        const L = ed.skill === 'listening', ai = aiOn();
        $('mk-parts').innerHTML = ed.parts.map((p, pi) => {
            const r = E.range(p);
            return `<div class="mk-part" data-p="${pi}">
            <div class="mk-part-head">
                <input type="text" class="mk-ptitle" data-f="title" value="${esc(p.title)}" maxlength="60" aria-label="Название части">
                <span class="mk-range">${r ? 'вопросы ' + r[0] + '–' + r[1] : 'вопросов нет'}</span>
                <button class="btn-small danger" onclick="MockAdmin.delPart(${pi})">Удалить часть</button>
            </div>
            ${L ? `<label>Аудио этой части</label>
            <div class="mk-audio">
                <input type="text" data-f="audio" placeholder="Вставьте ссылку или загрузите файл →" value="${esc(p.audio || '')}">
                <label class="btn-small mk-up">Загрузить mp3<input type="file" accept="audio/*" data-act="audio" hidden></label>
            </div>
            <div class="mk-audio-st" data-st="audio"></div>
            ${p.audio ? `<audio controls preload="none" src="${esc(p.audio)}" class="mk-prev"></audio>` : ''}` : `<label>Название текста</label><input type="text" data-f="passageTitle" value="${esc(p.passageTitle || '')}" maxlength="140" placeholder="Например: The history of tea">
            <label>Текст для чтения <small>(ИИ заполнит сам из файла; можно править)</small></label><textarea data-f="passage" rows="6" placeholder="Текст появится здесь">${esc(p.passage || '')}</textarea>`}
            <details class="mk-src" ${((p._src && (p._src.text || p._src.answers)) || !r) ? 'open' : ''}>
                <summary>Файл с заданием${ai ? ' и ИИ' : ''}</summary>
                <div class="mk-src-grid">
                    <div><label>${L ? 'Задание (вопросы) — PDF, Word или текст' : 'Текст и вопросы — PDF, Word или текст'}</label>
                        <input type="file" accept=".pdf,.docx,.txt,.md" data-act="srcfile">
                        <textarea data-s="text" rows="4" placeholder="…или вставьте текст сюда">${esc((p._src && p._src.text) || '')}</textarea></div>
                    <div><label>Ответы (необязательно) — PDF, Word или текст</label>
                        <input type="file" accept=".pdf,.docx,.txt,.md" data-act="ansfile">
                        <textarea data-s="answers" rows="4" placeholder="…или вставьте ключ ответов сюда (1 A, 2 library…)">${esc((p._src && p._src.answers) || '')}</textarea></div>
                </div>
                <div class="mk-bar">
                    ${ai ? '<button class="btn-primary" data-act="ai">Составить с помощью ИИ</button>' : ''}
                    <button class="btn-small" data-act="copy">Скопировать запрос для ИИ</button>
                    <button class="btn-small" data-act="json">Вставить JSON</button>
                </div>
                <div class="status-msg" data-st="src"></div>
                <div class="mk-json" data-box="json" style="display:none"><textarea data-s="json" rows="5" placeholder="Вставьте сюда JSON, который вернул ИИ"></textarea><button class="btn-small primary" data-act="applyjson">Применить</button></div>
            </details>
            <div class="mk-groups">${p.groups.map((g, gi) => groupHtml(g, pi, gi)).join('') || '<div class="empty-state">Вопросов пока нет. Загрузите файл выше или добавьте блок вручную.</div>'}</div>
            <div class="mk-bar"><button class="btn-small" data-act="addgroup">+ Блок вопросов</button></div>
        </div>`;
        }).join('');
        bindParts(); updateCount();
    }

    function groupHtml(g, pi, gi) {
        const opts = Object.keys(TYPE_NAMES).map((t) => `<option value="${t}" ${g.type === t ? 'selected' : ''}>${TYPE_NAMES[t]}</option>`).join('');
        const items = g.items.map((it, ii) => itemHtml(g, it, ii)).join('');
        return `<div class="mk-group" data-g="${gi}">
            <div class="mk-group-head"><select data-gf="type">${opts}</select><button class="btn-small danger" data-act="delgroup">Удалить блок</button></div>
            <label>Задание для учеников (инструкция)</label><textarea data-gf="instruction" rows="2">${esc(g.instruction || '')}</textarea>
            ${g.type === 'match' ? `<label>Список вариантов (по одному в строке: «A. текст», «B. текст»…)</label><textarea data-gf="options" rows="4">${esc((g.options || []).join('\n'))}</textarea>` : ''}
            <div class="mk-items">${items}</div>
            <button class="btn-small" data-act="additem">+ Вопрос</button></div>`;
    }
    function itemHtml(g, it, ii) {
        const n = it.n ? (it.count > 1 ? it.n + '–' + (it.n + it.count - 1) : it.n) : '';
        let ans = '';
        if (g.type === 'gap') ans = `<input type="text" data-if="answer" placeholder="Ответ; допустимые варианты через | (library | the library)" value="${esc((it.answer || []).join(' | '))}">`;
        else if (g.type === 'tfng' || g.type === 'yn') { const o = g.type === 'tfng' ? E.TFNG : E.YN; ans = `<select data-if="answer"><option value="">— ответ —</option>${o.map((x) => `<option ${it.answer === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`; }
        else if (g.type === 'multi') ans = `<input type="text" data-if="answer" placeholder="Буквы через запятую: A, C" value="${esc((it.answer || []).join(', '))}">`;
        else ans = `<input type="text" data-if="answer" maxlength="2" placeholder="Буква: B" value="${esc(it.answer || '')}">`;
        const hasOpts = g.type === 'mcq' || g.type === 'multi';
        return `<div class="mk-item" data-i="${ii}">
            <span class="mk-n">${n}</span>
            <div class="mk-item-main">
                <input type="text" data-if="text" placeholder="${g.type === 'gap' ? 'Текст вопроса; на месте пропуска поставьте ____' : 'Текст вопроса'}" value="${esc(it.text || '')}">
                ${hasOpts ? `<textarea data-if="options" rows="3" placeholder="Варианты, по одному в строке: A. …">${esc((it.options || []).join('\n'))}</textarea>` : ''}
                ${g.type === 'multi' ? `<label class="mk-cnt">Сколько букв выбрать: <input type="number" min="2" max="5" data-if="count" value="${it.count || 2}"></label>` : ''}
                ${ans}
            </div><button class="btn-small danger" data-act="delitem" aria-label="Удалить вопрос">×</button></div>`;
    }

    function ctx(el) {
        const part = el.closest('.mk-part'); const pi = part ? +part.dataset.p : -1;
        const grp = el.closest('.mk-group'); const gi = grp ? +grp.dataset.g : -1;
        const itm = el.closest('.mk-item'); const ii = itm ? +itm.dataset.i : -1;
        return { part, pi, gi, ii, P: ed.parts[pi], G: gi >= 0 ? ed.parts[pi].groups[gi] : null, I: ii >= 0 ? ed.parts[pi].groups[gi].items[ii] : null };
    }
    const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
    function setAnswer(g, it, v) {
        if (g.type === 'gap') it.answer = String(v).split('|').map((x) => x.trim()).filter(Boolean);
        else if (g.type === 'multi') it.answer = String(v).split(/[,\s;]+/).map((x) => E.normLetter(x)).filter(Boolean);
        else if (g.type === 'tfng' || g.type === 'yn') it.answer = v;
        else it.answer = E.normLetter(v);
    }

    function bindParts() {
        const root = $('mk-parts');
        root.oninput = (e) => {
            const el = e.target, c = ctx(el); if (!c.P) return;
            if (el.dataset.f) c.P[el.dataset.f] = el.value;                       // part field
            else if (el.dataset.s) { c.P._src = c.P._src || {}; c.P._src[el.dataset.s] = el.value; }
            else if (el.dataset.gf && c.G && el.dataset.gf !== 'type') { c.G[el.dataset.gf] = el.dataset.gf === 'options' ? lines(el.value) : el.value; }
            else if (el.dataset.if && c.I) {
                const f = el.dataset.if;
                if (f === 'answer') setAnswer(c.G, c.I, el.value);
                else if (f === 'options') c.I.options = lines(el.value);
                else if (f === 'count') { c.I.count = Math.max(2, parseInt(el.value, 10) || 2); E.renumber(ed); updateCount(); }
                else c.I.text = el.value;
            }
            if (el.dataset.f === 'audio') { const prev = c.part.querySelector('.mk-prev'); if (prev) prev.src = el.value; }
        };
        root.onchange = (e) => {
            const el = e.target, c = ctx(el); if (!c.P) return;
            if (el.dataset.gf === 'type' && c.G) {
                const keepText = c.G.items.map((it) => ({ n: 0, text: it.text, answer: undefined }));
                c.G.type = el.value; if (c.G.type !== 'match') delete c.G.options;
                c.G.items = c.G.items.map((it, i) => { const b = blankItem(c.G.type); b.text = keepText[i].text; return b; });
                E.renumber(ed); renderParts(); return;
            }
            if (el.dataset.act === 'audio') { uploadAudio(el, c); return; }
            if (el.dataset.act === 'srcfile' || el.dataset.act === 'ansfile') { loadFile(el, c); return; }
            if (el.dataset.if === 'answer' && (c.G.type === 'tfng' || c.G.type === 'yn')) setAnswer(c.G, c.I, el.value);
        };
        root.onclick = (e) => {
            const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
            const c = ctx(b), act = b.dataset.act;
            if (act === 'addgroup') { c.P.groups.push({ type: 'gap', instruction: '', items: [blankItem('gap')] }); E.renumber(ed); renderParts(); }
            else if (act === 'delgroup') { if (confirm('Удалить блок вместе с вопросами?')) { c.P.groups.splice(c.gi, 1); E.renumber(ed); renderParts(); } }
            else if (act === 'additem') { c.G.items.push(blankItem(c.G.type)); E.renumber(ed); renderParts(); }
            else if (act === 'delitem') { c.G.items.splice(c.ii, 1); E.renumber(ed); renderParts(); }
            else if (act === 'ai') runAI(c);
            else if (act === 'copy') copyPrompt(c);
            else if (act === 'json') { const bx = c.part.querySelector('[data-box="json"]'); bx.style.display = bx.style.display === 'none' ? '' : 'none'; }
            else if (act === 'applyjson') { const ta = c.part.querySelector('[data-s="json"]'); applyJson(ta.value, c.pi, c.part); }
        };
    }
    function updateCount() { const el = $('mk-count'); if (el) el.textContent = 'Всего вопросов: ' + total() + (total() === 40 ? ' (полный экзамен)' : ''); }

    // ====================== files -> text ======================
    const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить библиотеку: ' + src)); document.head.appendChild(s); });
    async function fileText(file) {
        const name = file.name.toLowerCase();
        if (/\.(txt|md|csv)$/.test(name) || file.type.indexOf('text/') === 0) return file.text();
        if (/\.docx$/.test(name)) {
            if (!window.mammoth) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
            const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); return r.value;
        }
        if (/\.pdf$/.test(name)) {
            if (!window.pdfjsLib) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
            let out = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const tc = await (await pdf.getPage(i)).getTextContent(); let y = null, line = '';
                tc.items.forEach((t) => { const ty = t.transform ? t.transform[5] : 0; if (y !== null && Math.abs(ty - y) > 2.5) { out += line.trim() + '\n'; line = ''; } line += t.str + (t.hasEOL ? ' ' : ''); y = ty; });
                out += line.trim() + '\n\n';
            }
            if (out.replace(/\s/g, '').length < 40) throw new Error('В PDF нет текста (это скан-картинка). Сохраните файл с текстом или вставьте текст вручную.');
            return out;
        }
        if (/\.doc$/.test(name)) throw new Error('Старый формат .doc не поддерживается: сохраните файл как .docx или PDF.');
        throw new Error('Этот тип файла не поддерживается. Нужен PDF, Word (.docx) или текст.');
    }
    async function loadFile(input, c) {
        const f = input.files && input.files[0]; if (!f) return;
        const st_ = c.part.querySelector('[data-st="src"]'); st_.textContent = 'Читаю файл…'; st_.className = 'status-msg ok';
        try {
            const text = await fileText(f); const key = input.dataset.act === 'srcfile' ? 'text' : 'answers';
            c.P._src = c.P._src || {}; c.P._src[key] = text;
            c.part.querySelector('[data-s="' + key + '"]').value = text;
            st_.textContent = 'Файл «' + f.name + '» прочитан (' + text.length + ' символов).'; st_.className = 'status-msg ok';
        } catch (e) { st_.textContent = e.message; st_.className = 'status-msg error'; }
        input.value = '';
    }

    // ====================== audio -> Firebase Storage ======================
    async function uploadAudio(input, c) {
        const f = input.files && input.files[0]; if (!f) return;
        const sEl = c.part.querySelector('[data-st="audio"]');
        const say = (t, ok) => { sEl.textContent = t; sEl.className = 'mk-audio-st status-msg' + (ok ? ' ok' : ' error'); };
        if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|wav|ogg|aac)$/i.test(f.name)) return say('Это не аудиофайл.', false);
        if (f.size > MAX_AUDIO_MB * 1024 * 1024) return say('Файл больше ' + MAX_AUDIO_MB + ' МБ — сожмите аудио (mp3).', false);
        if (!window.firebase || !firebase.storage) return say('Firebase Storage не подключён.', false);
        const safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60);
        const ref = firebase.storage().ref('mockAudio/' + Date.now() + '-' + safe);
        say('Загружаю… 0%', true);
        try {
            const task = ref.put(f, { contentType: f.type || 'audio/mpeg' });
            await new Promise((res, rej) => task.on('state_changed', (s) => say('Загружаю… ' + Math.round(s.bytesTransferred / s.totalBytes * 100) + '%', true), rej, res));
            const url = await task.snapshot.ref.getDownloadURL();
            c.P.audio = url; say('Аудио загружено.', true); renderParts();
        } catch (e) { say(e && e.code === 'storage/unauthorized' ? 'Нет прав на загрузку: опубликуйте новые правила Storage (storage.rules).' : 'Не удалось загрузить: ' + ((e && e.message) || e), false); }
        input.value = '';
    }

    // ====================== AI ======================
    function promptFor(c) {
        const s = c.P._src || {};
        return E.buildPrompt({ skill: ed.skill, partNo: c.pi + 1, text: s.text, hasAnswers: !!(s.answers || '').trim(), answersText: s.answers });
    }
    function needSource(c, stEl) { const s = c.P._src || {}; if (!(s.text || '').trim()) { stEl.textContent = 'Сначала загрузите файл с заданием или вставьте текст.'; stEl.className = 'status-msg error'; return true; } return false; }
    async function copyPrompt(c) {
        const stEl = c.part.querySelector('[data-st="src"]'); if (needSource(c, stEl)) return;
        const text = promptFor(c);
        try { await navigator.clipboard.writeText(text); stEl.textContent = 'Запрос скопирован. Вставьте его в ChatGPT или Claude, а ответ вставьте кнопкой «Вставить JSON».'; stEl.className = 'status-msg ok'; }
        catch (e) { const bx = c.part.querySelector('[data-box="json"]'); bx.style.display = ''; const ta = bx.querySelector('textarea'); ta.value = text; ta.select(); stEl.textContent = 'Не удалось скопировать автоматически — текст запроса в поле ниже, скопируйте его (Ctrl+C) и замените ответом ИИ.'; stEl.className = 'status-msg error'; }
    }
    async function runAI(c) {
        const stEl = c.part.querySelector('[data-st="src"]'); if (needSource(c, stEl)) return;
        const btn = c.part.querySelector('[data-act="ai"]'); if (btn) btn.disabled = true;
        stEl.textContent = 'ИИ составляет тест… обычно 20–60 секунд.'; stEl.className = 'status-msg ok';
        try {
            const token = await (typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.getIdToken ? auth.currentUser.getIdToken() : Promise.reject(new Error('Войдите в админ-панель заново.')));
            const r = await fetch(window.MOCK_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ mode: 'build', prompt: promptFor(c) }) });
            let data = {}; try { data = await r.json(); } catch (e) {}
            if (!r.ok || data.error) throw new Error(data.error || ('Ошибка сервера ' + r.status));
            applyJson(data.text, c.pi, c.part);
        } catch (e) { stEl.textContent = 'Не получилось: ' + (e.message || e); stEl.className = 'status-msg error'; }
        if (btn) btn.disabled = false;
    }
    function applyJson(text, pi, partEl) {
        const stEl = partEl.querySelector('[data-st="src"]');
        try {
            const norm = E.normalizeTest(E.extractJson(text), ed.skill);
            const src = norm.test.parts[0], P = ed.parts[pi];
            P.groups = src.groups;
            if (src.title && /^(Part|Passage) \d+$/.test(P.title)) P.title = src.title;
            if (ed.skill === 'reading') { if (src.passage) P.passage = src.passage; if (src.passageTitle) P.passageTitle = src.passageTitle; }
            if (!ed.title && norm.test.title) ed.title = norm.test.title;
            E.renumber(ed); renderParts();
            const el = document.querySelector('.mk-part[data-p="' + pi + '"] [data-st="src"]');
            if (el) { el.textContent = 'Готово: ' + E.partTotal(P) + ' вопросов. ' + (norm.warnings.length ? 'Проверьте: ' + norm.warnings.slice(0, 4).join('; ') : 'Просмотрите вопросы и ответы ниже.'); el.className = 'status-msg ' + (norm.warnings.length ? 'error' : 'ok'); }
        } catch (e) { stEl.textContent = 'Не получилось: ' + e.message; stEl.className = 'status-msg error'; }
    }
    function importAll() {
        const t = window.prompt('Вставьте JSON всего теста (части в поле "parts"):'); if (!t) return;
        try {
            const norm = E.normalizeTest(E.extractJson(t), ed.skill);
            if (norm.test.skill !== ed.skill) { ed.skill = norm.test.skill; }
            ed.parts = norm.test.parts; if (!ed.title) ed.title = norm.test.title;
            ed.parts.forEach((p) => { p._src = { text: '', answers: '' }; });
            renderEditor(); st('mk-save-status', norm.warnings.length ? 'Импортировано. Проверьте: ' + norm.warnings.slice(0, 4).join('; ') : 'Тест импортирован.', !norm.warnings.length);
        } catch (e) { st('mk-save-status', e.message, false); }
    }
    function addPart() { ed.parts.push(blankPart(ed.skill, ed.parts.length + 1)); ed.parts[ed.parts.length - 1]._src = { text: '', answers: '' }; renderParts(); }
    function delPart(i) { if (ed.parts.length < 2) return alert('В тесте должна быть хотя бы одна часть.'); if (confirm('Удалить часть «' + ed.parts[i].title + '»?')) { ed.parts.splice(i, 1); E.renumber(ed); renderParts(); } }

    // ====================== save ======================
    function clean() {
        const t = JSON.parse(JSON.stringify(ed));
        if (t.parts) t.parts.forEach((p) => { delete p._src; p.groups = p.groups.filter((g) => g.items.length); });
        return t;
    }
    async function save(publish) {
        const t = clean();
        if (!String(t.title || '').trim()) return st('mk-save-status', 'Впишите название теста.', false);
        let bad = [];
        if (t.skill === 'writing') {
            t.tasks = (t.tasks || []).filter((x) => String(x.prompt || '').trim());
            if (!t.tasks.length) return st('mk-save-status', 'Впишите текст хотя бы одного задания.', false);
            t.tasks.forEach((x) => { x.title = String(x.title || '').trim() || 'Task'; x.minWords = x.minWords || (x.type === 'task1' ? 150 : 250); x.minutes = x.minutes || (x.type === 'task1' ? 20 : 40); });
        } else if (t.skill === 'full') {
            const r = t.refs || {}; if (!r.listening && !r.reading && !r.writing) return st('mk-save-status', 'Выберите хотя бы один тест для полного мока.', false);
            const unpub = ['listening', 'reading', 'writing'].filter((k) => { const x = tests.find((y) => y.id === r[k]); return r[k] && x && !x.published; });
            if (publish && unpub.length && !confirm('Не опубликованы тесты: ' + unpub.join(', ') + '. Ученики не смогут их пройти. Всё равно опубликовать полный мок?')) return;
        } else {
            if (!t.parts.some((p) => E.partTotal(p) > 0)) return st('mk-save-status', 'Добавьте хотя бы один вопрос.', false);
            E.renumber(t);
            t.parts.forEach((p) => p.groups.forEach((g) => g.items.forEach((it) => { const e = Array.isArray(it.answer) ? !it.answer.length : !it.answer; if (e) bad.push(it.n); })));
            if (bad.length && publish && !confirm('У вопросов без ответа (' + bad.slice(0, 12).join(', ') + (bad.length > 12 ? '…' : '') + ') любой ответ ученика будет считаться неверным. Всё равно опубликовать?')) return;
        }
        t.published = publish ? true : !!ed.published;
        const now = new Date().toISOString(); t.updatedAt = now;
        const id = t.id; delete t.id;
        if (JSON.stringify(t).length > 900000) return st('mk-save-status', 'Тест слишком большой для сохранения (лимит ~900 КБ текста).', false);
        try {
            if (id) await db.collection('mockTests').doc(id).set(Object.assign(t, { createdAt: ed.createdAt || now }));
            else { t.createdAt = now; const ref = await db.collection('mockTests').add(t); ed.id = ref.id; ed.createdAt = now; }
            ed.published = t.published;
            st('mk-save-status', (t.published ? 'Сохранено и опубликовано.' : 'Черновик сохранён.') + (bad.length ? ' Без ответа: ' + bad.length + '.' : ''), true);
        } catch (e) { st('mk-save-status', 'Не удалось сохранить: ' + e.message, false); }
    }

    // ====================== results ======================
    async function loadResults() {
        const box = $('mk-res-list'); if (!box) return;
        box.innerHTML = '<div class="empty-state">Загружаю…</div>';
        try {
            const snap = await db.collection('mockResults').orderBy('ts', 'desc').limit(400).get();
            results = []; snap.forEach((d) => results.push(Object.assign({ id: d.id }, d.data())));
        } catch (e) { box.innerHTML = '<div class="empty-state">Не удалось загрузить: ' + esc(e.message) + '</div>'; return; }
        const sel = $('mk-res-test'); const cur = sel.value;
        const titles = Array.from(new Set(results.map((r) => r.title).filter(Boolean)));
        sel.innerHTML = '<option value="">Все тесты</option>' + titles.map((t) => `<option ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');
        renderResults();
    }
    const fDate = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
    const scopeText = (r) => (r.scope === 'full' ? 'весь экзамен' : 'части: ' + (r.parts || []).join(', '));
    function filteredResults() { const q = ($('mk-res-q').value || '').trim().toLowerCase(), t = $('mk-res-test').value; return results.filter((r) => (!t || r.title === t) && (!q || String(r.name || '').toLowerCase().indexOf(q) !== -1)); }
    function renderResults() {
        const box = $('mk-res-list'), list = filteredResults();
        if (!list.length) { box.innerHTML = '<div class="empty-state">Результатов пока нет.</div>'; return; }
        box.innerHTML = list.map((r) => `<div class="admin-row">
            <div class="ar-main"><strong>${esc(r.name || 'Без имени')}</strong><small>${esc(r.title || '')} · ${r.skill === 'reading' ? 'Reading' : 'Listening'} · ${esc(scopeText(r))} · ${fDate(r.ts)}</small></div>
            <div class="ar-extra"><b>${r.correct}/${r.total}</b>${r.band != null ? ' · band ' + (r.bandEstimated ? '≈ ' : '') + r.band : ''}${r.secs ? ' · ' + Math.round(r.secs / 60) + ' мин' : ''}</div></div>`).join('');
    }
    function exportCsv() {
        const rows = [['Дата', 'Имя', 'Тест', 'Раздел', 'Что проходил', 'Верно', 'Всего', 'Band', 'Band примерный', 'Минут']];
        filteredResults().forEach((r) => rows.push([fDate(r.ts), r.name || '', r.title || '', r.skill, scopeText(r), r.correct, r.total, r.band == null ? '' : r.band, r.bandEstimated ? 'да' : 'нет', r.secs ? Math.round(r.secs / 60) : '']));
        window.CsvExport.download('mock-results.csv', rows);
    }

    window.MockAdmin = { newTest, edit, toggle, remove, close: closeEditor, addPart, delPart, importAll, save, setView, renderResults, exportCsv };
    window.loadMocks = loadMocks;
})();
