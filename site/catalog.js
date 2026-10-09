/* TheStarth — editable courses and prices on the home page.
 * Data: Firestore settings/catalog (written in Admin panel -> «Курсы и цены»); until the admin saves something, catalog-defaults.js is used.
 *   - draws the course cards and the "Подробнее" window,
 *   - applies prices / texts to the three pricing cards (the promo-code logic in app.js keeps working: same element ids and data-ind/data-grp),
 *   - fills the "Записаться" form with the course list.
 * Texts are stored in Russian with uz/en translations next to them (StarthI18n.pick).
 */
(function () {
    'use strict';
    const D = window.StarthCatalogDefaults || { courses: [], plans: { list: [] } };
    let cat = JSON.parse(JSON.stringify(D));
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const T = (k, fb) => (typeof t === 'function' ? t(k) : fb) || fb;
    const pick = (o, f) => (window.StarthI18n ? window.StarthI18n.pick(o, f) : (o && o[f]) || '');
    const pickL = (o, f) => { const v = pick(o, f); return Array.isArray(v) ? v : []; };
    const money = (n) => '$' + String(n);

    function perText(unit) { return unit === 'lesson' ? T('price.per_lesson', '/ урок') : unit === 'month' ? T('price.per_month', '/ месяц') : ''; }

    // ---------------- courses ----------------
    function courseCard(c, i) {
        const feats = pickL(c, 'features').map((f) => '<li>' + esc(f) + '</li>').join('');
        const price = Number(c.price) > 0 ? '<div class="price">' + money(c.price) + (c.priceUnit ? ' <span>' + esc(perText(c.priceUnit)) + '</span>' : '') + '</div>' : '';
        return '<div class="card" data-course="' + esc(c.id) + '">' +
            '<span class="card-badge ' + esc(c.tagClass || 'tag-ielts') + '">' + esc(pick(c, 'badge')) + '</span>' +
            '<h3>' + esc(pick(c, 'title')) + '</h3><p>' + esc(pick(c, 'desc')) + '</p>' +
            (feats ? '<ul class="card-features">' + feats + '</ul>' : '') + price +
            '<button type="button" class="btn-outline course-more" data-i="' + i + '" style="display:block;width:100%;text-align:center;box-sizing:border-box;">' + esc(T('btn.details', 'Подробнее')) + '</button></div>';
    }
    function active() { return (cat.courses || []).filter((c) => c.active !== false); }
    function renderCourses() {
        const grid = document.querySelector('#courses .grid-container'); if (!grid) return;
        const list = active();
        grid.innerHTML = list.map(courseCard).join('') || '<p style="text-align:center;color:var(--ink-soft)">—</p>';
        grid.querySelectorAll('.course-more').forEach((b) => { b.onclick = () => openCourse(list[Number(b.dataset.i)]); });
    }
    function modal() {
        let m = document.getElementById('courseModal');
        if (m) return m;
        m = document.createElement('div'); m.id = 'courseModal'; m.className = 'modal cm-modal';
        m.innerHTML = '<div class="modal-content cm-content" role="dialog" aria-modal="true"><span class="close-modal cm-close" aria-label="Закрыть">&times;</span><div id="cmBody"></div></div>';
        document.body.appendChild(m);
        const close = () => m.classList.remove('show');
        m.querySelector('.cm-close').onclick = close;
        m.addEventListener('click', (e) => { if (e.target === m) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        return m;
    }
    let openId = '';
    function openCourse(c) {
        if (!c) return; openId = c.id;
        const m = modal(), body = m.querySelector('#cmBody');
        const feats = pickL(c, 'features').map((f) => '<li>' + esc(f) + '</li>').join('');
        const details = String(pick(c, 'details') || pick(c, 'desc')).split(/\n+/).filter(Boolean).map((p) => '<p>' + esc(p) + '</p>').join('');
        const price = Number(c.price) > 0 ? '<div class="cm-price">' + money(c.price) + (c.priceUnit ? ' <small>' + esc(perText(c.priceUnit)) + '</small>' : '') + '</div>' : '';
        body.innerHTML = '<span class="card-badge ' + esc(c.tagClass || 'tag-ielts') + '">' + esc(pick(c, 'badge')) + '</span><h2>' + esc(pick(c, 'title')) + '</h2>' + details +
            (feats ? '<ul class="card-features">' + feats + '</ul>' : '') + price +
            '<button type="button" class="btn-primary cm-apply" style="width:100%;margin-top:.8rem">' + esc(T('stage.trial', 'Записаться на пробный урок')) + '</button>';
        body.querySelector('.cm-apply').onclick = () => { m.classList.remove('show'); openLead(c.id); };
        m.classList.add('show');
    }
    function openLead(course) {
        const modal_ = document.getElementById('appModal'); if (!modal_) return;
        const f = document.getElementById('leadForm'); if (f && f.course && course) f.course.value = course;
        modal_.classList.add('show');
    }

    // ---------------- application form: course list ----------------
    function renderLeadSelect() {
        const sel = document.querySelector('#leadForm select[name="course"]'); if (!sel) return;
        const cur = sel.value;
        let h = '<option value="" disabled ' + (cur ? '' : 'selected') + '>' + esc(T('app.course_ph', 'Выберите курс')) + '</option>';
        active().forEach((c) => { h += '<option value="' + esc(c.id) + '">' + esc(pick(c, 'title')) + '</option>'; });
        h += '<option value="math">' + esc(T('app.opt_math', 'Математика')) + '</option><option value="german">' + esc(T('app.opt_german', 'Немецкий язык')) + '</option>';
        sel.innerHTML = h; if (cur) sel.value = cur;
    }

    // ---------------- pricing ----------------
    function plan(id) { return ((cat.plans && cat.plans.list) || []).find((p) => p.id === id); }
    function currentMode() { const g = document.getElementById('btn-pricing-grp'); return g && g.classList.contains('active') ? 'grp' : 'ind'; }
    function applyPricing() {
        const mode = currentMode(), P = cat.plans || {};
        const desc = document.getElementById('pricing-toggle-desc'); const dtxt = pick(P, mode === 'ind' ? 'descInd' : 'descGrp'); if (desc && dtxt) desc.textContent = dtxt;
        ['trial', 'standard', 'intensive'].forEach((id) => {
            const p = plan(id); if (!p) return;
            const amount = document.getElementById('price-' + id); if (!amount) return;
            amount.setAttribute('data-ind', p.priceInd); amount.setAttribute('data-grp', p.priceGrp);
            const price = Number(mode === 'ind' ? p.priceInd : p.priceGrp);
            if (!window.currentActivePromo || id === 'trial') amount.textContent = (price === 0 && id === 'trial') ? T('pricing.free', 'Бесплатно') : String(price);
            const card = amount.closest('.card'); if (!card) return;
            const h3 = card.querySelector('h3'); if (h3) { h3.removeAttribute('data-i18n'); h3.textContent = pick(p, 'title'); }
            const sub = id === 'trial' ? document.getElementById('trial-card-desc') : card.querySelector('h3 + p');
            if (sub) { sub.removeAttribute('data-i18n'); sub.textContent = pick(p, mode === 'grp' ? 'subGrp' : 'sub') || pick(p, 'sub'); }
            const ul = document.getElementById(id + '-card-features'); const feats = pickL(p, mode === 'grp' ? 'featGrp' : 'featInd');
            if (ul && feats.length) ul.innerHTML = feats.map((f) => '<li>' + esc(f) + '</li>').join('');
            const badge = card.querySelector('.pulse-badge'); if (badge) { badge.removeAttribute('data-i18n'); badge.textContent = pick(p, 'badge'); badge.style.display = p.badge ? '' : 'none'; }
            card.style.borderColor = p.featured ? 'var(--accent)' : '';
            const per = card.querySelector('.price > span:not(.price-amount)'); if (per && id !== 'trial') per.textContent = perText(p.per);
        });
    }
    function hook() {
        const orig = window.setPricingMode; if (typeof orig !== 'function' || orig.__cat) return;
        const wrapped = function (mode) { orig(mode); try { applyPricing(); } catch (e) {} };
        wrapped.__cat = true; window.setPricingMode = wrapped;
    }

    function renderAll() { renderCourses(); renderLeadSelect(); hook(); applyPricing(); if (document.getElementById('courseModal') && document.getElementById('courseModal').classList.contains('show')) { const c = active().find((x) => x.id === openId); if (c) openCourse(c); } }

    function load() {
        renderAll();
        if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY || typeof db === 'undefined') return;
        db.collection('settings').doc('catalog').get().then((d) => {
            if (d.exists) { const x = d.data(); if (x.courses && x.courses.length) cat.courses = x.courses; if (x.plans && x.plans.list && x.plans.list.length) cat.plans = x.plans; renderAll(); }
        }).catch(() => {});
    }
    window.addEventListener('starth-lang-changed', () => setTimeout(renderAll, 0));
    window.StarthCatalog = { openCourse: (id) => openCourse((cat.courses || []).find((c) => c.id === id)) };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
