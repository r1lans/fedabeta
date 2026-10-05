/* TheStarth — Admin panel: «Курсы и цены».
 * Edits Firestore settings/catalog, which the home page (catalog.js) shows: course cards + the «Подробнее» window, and the three price cards.
 * Texts are written in Russian; on save the Uzbek and English versions are translated automatically (only what changed) and can be corrected by hand.
 * Needs: db, escapeHtml (admin.html), content-i18n.js (StarthI18n), catalog-defaults.js.
 */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const TAGS = { 'tag-ielts': 'Английский (синий)', 'tag-sat': 'Математика (зелёный)', 'tag-olympiad': 'Олимпиады', 'tag-ege': 'Школьная программа' };
    const UNITS = { lesson: 'за урок', month: 'в месяц', '': 'без подписи' };
    const CF = [['badge', 'text', 'Метка'], ['title', 'text', 'Название'], ['desc', 'area', 'Короткое описание'], ['features', 'lines', 'Преимущества (по одному в строке)'], ['details', 'area', 'Подробно (окно «Подробнее»)']];
    const PF = [['title', 'text', 'Название'], ['sub', 'text', 'Подпись (индивидуально)'], ['subGrp', 'text', 'Подпись (группа)'], ['badge', 'text', 'Метка (например: ПОПУЛЯРНЫЙ)'], ['featInd', 'lines', 'Что входит: индивидуально (по строке)'], ['featGrp', 'lines', 'Что входит: группа (по строке)']];
    const PLAN_NAMES = { trial: 'Пробный урок', standard: 'Стандарт', intensive: 'Интенсив' };
    let st = null, orig = null, touched = new Set(), loaded = false;

    const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), st);
    function set(path, val) { const ks = path.split('.'); let o = st; for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = val; }
    const toLines = (v) => (Array.isArray(v) ? v.join('\n') : '');
    const fromLines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

    function field(path, spec, lang) {
        const [name, kind, label] = spec, p = path + (lang === 'ru' ? '' : '.i18n.' + lang) + '.' + name;
        const raw = get(p), val = kind === 'lines' ? toLines(raw) : (raw == null ? '' : raw);
        const attr = 'data-p="' + esc(p) + '" data-k="' + kind + '"';
        const inner = kind === 'text' ? '<input type="text" ' + attr + ' value="' + esc(val) + '">' : '<textarea ' + attr + ' rows="' + (kind === 'lines' ? 3 : 4) + '">' + esc(val) + '</textarea>';
        return '<label>' + esc(label) + '</label>' + inner;
    }
    const numField = (p, label, step) => '<label>' + label + '</label><input type="number" min="0" step="' + (step || 1) + '" data-p="' + esc(p) + '" data-k="num" value="' + esc(get(p)) + '">';
    const checkField = (p, label) => '<label class="cat-check"><input type="checkbox" data-p="' + esc(p) + '" data-k="bool" ' + (get(p) ? 'checked' : '') + '> ' + esc(label) + '</label>';
    const selField = (p, label, opts) => '<label>' + label + '</label><select data-p="' + esc(p) + '" data-k="sel">' + Object.keys(opts).map((k) => '<option value="' + esc(k) + '" ' + (get(p) === k ? 'selected' : '') + '>' + esc(opts[k]) + '</option>').join('') + '</select>';
    const trBlock = (path, specs) => '<details class="cat-tr"><summary>Переводы (узбекский, английский)</summary>' + ['uz', 'en'].map((lg) => '<div class="cat-lang"><h5>' + (lg === 'uz' ? "O'zbekcha" : 'English') + '</h5>' + specs.map((s) => field(path, s, lg)).join('') + '</div>').join('') + '<p class="cat-hint">Переводы делаются автоматически при сохранении. Если вы исправите перевод вручную, он больше не будет перезаписан.</p></details>';

    function render() {
        const root = $('cat-root'); if (!root) return;
        const cs = st.courses || [];
        let h = '<div class="cat-sec"><h3>Курсы на главной</h3><p class="cat-hint">Карточки в разделе «Наши курсы». Кнопка «Подробнее» открывает окно с подробным описанием и кнопкой записи.</p>';
        h += cs.map((c, i) => {
            const b = 'courses.' + i;
            return '<div class="admin-card cat-card" data-i="' + i + '"><div class="cat-head"><strong>' + esc(c.title || 'Новый курс') + '</strong><span class="cat-btns">' +
                '<button type="button" class="btn-small" data-act="up" data-i="' + i + '" ' + (i === 0 ? 'disabled' : '') + '>↑</button><button type="button" class="btn-small" data-act="down" data-i="' + i + '" ' + (i === cs.length - 1 ? 'disabled' : '') + '>↓</button>' +
                '<button type="button" class="btn-small danger" data-act="del" data-i="' + i + '">Удалить</button></span></div>' +
                '<div class="cat-checks">' + checkField(b + '.active', 'Показывать на сайте') + checkField(b + '.featured', 'Выделить рамкой') + '</div>' +
                '<div class="cat-grid">' + selField(b + '.tagClass', 'Цвет метки', TAGS) + numField(b + '.price', 'Цена, $') + selField(b + '.priceUnit', 'Подпись цены', UNITS) + '</div>' +
                CF.map((s) => field(b, s, 'ru')).join('') + trBlock(b, CF) + '</div>';
        }).join('');
        h += '<button type="button" class="btn-small" data-act="add">+ Добавить курс</button></div>';

        const P = st.plans || (st.plans = { list: [] }); const pl = P.list || [];
        h += '<div class="cat-sec"><h3>Цены и тарифы</h3><p class="cat-hint">Три карточки в разделе «Инвестиции в образование» и переключатель «Индивидуально / Мини-группы». Промокоды продолжают работать.</p>';
        h += '<div class="admin-card cat-card"><strong>Подписи переключателя</strong>' +
            field('plans', ['descInd', 'area', 'Описание: индивидуально 1-на-1'], 'ru') + field('plans', ['descGrp', 'area', 'Описание: мини-группы'], 'ru') +
            '<details class="cat-tr"><summary>Переводы</summary>' + ['uz', 'en'].map((lg) => '<div class="cat-lang"><h5>' + (lg === 'uz' ? "O'zbekcha" : 'English') + '</h5>' + field('plans', ['descInd', 'area', 'Индивидуально'], lg) + field('plans', ['descGrp', 'area', 'Мини-группы'], lg) + '</div>').join('') + '</details></div>';
        h += pl.map((p, i) => {
            const b = 'plans.list.' + i;
            return '<div class="admin-card cat-card"><div class="cat-head"><strong>' + esc(PLAN_NAMES[p.id] || p.id) + ': ' + esc(p.title) + '</strong></div>' +
                '<div class="cat-checks">' + checkField(b + '.featured', 'Выделить рамкой') + '</div>' +
                '<div class="cat-grid">' + numField(b + '.priceInd', 'Цена индивидуально, $') + numField(b + '.priceGrp', 'Цена в группе, $') + selField(b + '.per', 'Подпись цены', { month: 'в месяц', lesson: 'за урок', '': 'без подписи' }) + '</div>' +
                PF.map((s) => field(b, s, 'ru')).join('') + trBlock(b, PF) + '</div>';
        }).join('') + '</div>';
        h += '<div class="admin-card cat-save"><button type="button" class="btn-primary" data-act="save">Сохранить и опубликовать</button> <button type="button" class="btn-small" data-act="reset">Вернуть стандартные</button><div class="status-msg" id="cat-status"></div></div>';
        root.innerHTML = h;
    }

    function onInput(e) {
        const el = e.target.closest('[data-p]'); if (!el) return;
        const p = el.dataset.p, k = el.dataset.k;
        let v = el.value;
        if (k === 'lines') v = fromLines(v); else if (k === 'num') v = Math.max(0, Number(v) || 0); else if (k === 'bool') v = el.checked;
        set(p, v);
        if (/\.i18n\./.test(p)) touched.add(p);
        if (/\.title$/.test(p) && !/\.i18n\./.test(p) && el.closest('.cat-card')) { const s = el.closest('.cat-card').querySelector('.cat-head strong'); if (s) s.textContent = v || 'Новый курс'; }
    }
    function onClick(e) {
        const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, i = Number(b.dataset.i);
        const cs = st.courses;
        if (act === 'add') { cs.push({ id: 'c' + Date.now().toString(36), tagClass: 'tag-ielts', badge: '', title: '', desc: '', features: [], details: '', price: 0, priceUnit: 'lesson', featured: false, active: true, srcLang: 'ru', i18n: {} }); render(); }
        else if (act === 'del') { if (confirm('Удалить курс «' + (cs[i].title || 'без названия') + '»?')) { cs.splice(i, 1); render(); } }
        else if (act === 'up' && i > 0) { [cs[i - 1], cs[i]] = [cs[i], cs[i - 1]]; render(); }
        else if (act === 'down' && i < cs.length - 1) { [cs[i + 1], cs[i]] = [cs[i], cs[i + 1]]; render(); }
        else if (act === 'reset') { if (confirm('Вернуть курсы и цены к стандартным? Ваши правки пропадут после сохранения.')) { st = clone(window.StarthCatalogDefaults); touched = new Set(); render(); status('Стандартные значения загружены. Нажмите «Сохранить», чтобы применить.', true); } }
        else if (act === 'save') save();
    }
    function status(t, ok) { const s = $('cat-status'); if (s) { s.textContent = t; s.className = 'status-msg ' + (ok ? 'ok' : 'error'); } }

    // translate what changed (ru -> uz/en)
    async function translateItem(item, path, specs, before, note) {
        const need = { uz: {}, en: {} }; let any = false;
        ['uz', 'en'].forEach((lg) => {
            specs.forEach(([name, kind]) => {
                const ru = item[name], tr = ((item.i18n || {})[lg] || {})[name], p = path + '.i18n.' + lg + '.' + name;
                const empty = kind === 'lines' ? !(tr && tr.length) : !tr;
                const ruEmpty = kind === 'lines' ? !(ru && ru.length) : !ru;
                const changed = JSON.stringify(ru) !== JSON.stringify(before && before[name]);
                if (!ruEmpty && (empty || (changed && !touched.has(p)))) { need[lg][name] = ru; any = true; }
            });
        });
        if (!any) return 0;
        item.i18n = item.i18n || {};
        let failed = 0;
        for (const lg of ['uz', 'en']) {
            const fields = need[lg]; if (!Object.keys(fields).length) continue;
            const r = await window.StarthI18n.translateFields(fields, 'ru'); failed += r._failed || 0;
            item.i18n[lg] = Object.assign({}, item.i18n[lg] || {}, r[lg] || {});
        }
        return failed;
    }
    async function save() {
        const btn = document.querySelector('#cat-root [data-act=save]'); if (btn) btn.disabled = true;
        status('Сохраняю… перевожу на узбекский и английский, это может занять до минуты.', true);
        try {
            const out = clone(st); let failed = 0;
            for (let i = 0; i < out.courses.length; i++) {
                const c = out.courses[i]; if (!String(c.title || '').trim()) throw new Error('У курса №' + (i + 1) + ' нет названия.');
                c.price = Number(c.price) || 0; c.srcLang = 'ru';
                const before = (orig.courses || []).find((x) => x.id === c.id);
                failed += await translateItem(c, 'courses.' + i, CF, before);
            }
            out.plans.srcLang = 'ru';
            failed += await translateItem(out.plans, 'plans', [['descInd', 'area'], ['descGrp', 'area']], orig.plans);
            for (let i = 0; i < out.plans.list.length; i++) {
                const p = out.plans.list[i]; p.priceInd = Number(p.priceInd) || 0; p.priceGrp = Number(p.priceGrp) || 0; p.srcLang = 'ru';
                const before = ((orig.plans || {}).list || []).find((x) => x.id === p.id);
                failed += await translateItem(p, 'plans.list.' + i, PF, before);
            }
            out.updatedAt = Date.now();
            await db.collection('settings').doc('catalog').set(out);
            st = out; orig = clone(out); touched = new Set(); render();
            status(failed ? 'Сохранено, но ' + failed + ' текст(ов) не удалось перевести автоматически: на сайте для них будет русский текст. Можно вписать перевод вручную в «Переводы».' : 'Сохранено. Изменения уже на сайте.', !failed);
        } catch (err) { status('Не получилось сохранить: ' + (err.message || err), false); }
        const b2 = document.querySelector('#cat-root [data-act=save]'); if (b2) b2.disabled = false;
    }

    async function load() {
        if (loaded) return; loaded = true;
        const root = $('cat-root'); if (!root) return;
        st = clone(window.StarthCatalogDefaults || { courses: [], plans: { list: [] } });
        try { const d = await db.collection('settings').doc('catalog').get(); if (d.exists) { const x = d.data(); if (x.courses) st.courses = x.courses; if (x.plans && x.plans.list) st.plans = x.plans; } }
        catch (e) { root.innerHTML = '<div class="empty-state">Не удалось загрузить: ' + esc(e.message) + '</div>'; loaded = false; return; }
        orig = clone(st); render();
        root.addEventListener('input', onInput); root.addEventListener('change', onInput); root.addEventListener('click', onClick);
    }
    window.loadCatalog = load;
})();
