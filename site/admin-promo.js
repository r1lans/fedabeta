/* TheStarth — Admin panel: «Промокоды».
 * Each code is its own doc in Firestore promoCodes/{CODE}: { code, pct, free, expires ('' or 'YYYY-MM-DD'), active, createdAt }.
 * Read by the pricing block on the home page (app.js -> applyPromoCode): % discount, or fully free, with an optional expiry date.
 * Needs: db, escapeHtml (admin.html).
 */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    let items = [], loaded = false;

    function fmtExpiry(e) {
        if (!e) return 'без срока';
        const expired = String(e) < todayStr();
        return (expired ? '<span style="color:#c0392b;font-weight:700">истёк ' : 'до ') + esc(e) + (expired ? '</span>' : '');
    }
    function render() {
        const root = $('promo-root'); if (!root) return;
        let h = '<div class="cat-sec"><h3>Новый промокод</h3>' +
            '<div class="admin-form">' +
            '<label>Код</label><input type="text" id="pc-code" placeholder="Например: NEWYEAR25" style="text-transform:uppercase">' +
            '<label>Тип</label><select id="pc-type"><option value="pct">Скидка в процентах</option><option value="free">Полностью бесплатно</option></select>' +
            '<div id="pc-pct-wrap"><label>Скидка, %</label><input type="number" id="pc-pct" min="1" max="100" value="10"></div>' +
            '<label>Действует до (необязательно)</label><input type="date" id="pc-expires">' +
            '<button class="btn-primary" style="margin-top:1rem" id="pc-add">Добавить промокод</button>' +
            '<div class="status-msg" id="promo-status"></div>' +
            '</div></div>';
        h += '<div class="cat-sec"><h3>Промокоды</h3>';
        if (!items.length) h += '<div class="empty-state">Промокодов пока нет.</div>';
        else {
            h += items.map((p) => {
                const what = p.free ? '<strong style="color:#1f7a3f">Бесплатно</strong>' : '<strong>-' + esc(p.pct) + '%</strong>';
                return '<div class="admin-card" data-code="' + esc(p.code) + '" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">' +
                    '<div><code style="font-size:1.05rem;font-weight:700">' + esc(p.code) + '</code> — ' + what + ' · <span style="color:var(--ink-soft,#777)">' + fmtExpiry(p.expires) + '</span></div>' +
                    '<div style="display:flex;gap:.5rem;align-items:center;">' +
                    '<label class="cat-check" style="margin:0"><input type="checkbox" data-act="toggle" ' + (p.active !== false ? 'checked' : '') + '> активен</label>' +
                    '<button type="button" class="btn-small danger" data-act="del">Удалить</button>' +
                    '</div></div>';
            }).join('');
        }
        h += '</div>';
        root.innerHTML = h;
        const typeSel = $('pc-type'); const pctWrap = $('pc-pct-wrap');
        const syncType = () => { pctWrap.style.display = typeSel.value === 'free' ? 'none' : ''; };
        typeSel.onchange = syncType; syncType();
        $('pc-add').onclick = add;
        root.querySelectorAll('[data-code]').forEach((card) => {
            const code = card.dataset.code;
            card.querySelector('[data-act=toggle]').onchange = (e) => setActive(code, e.target.checked);
            card.querySelector('[data-act=del]').onclick = () => del(code);
        });
    }
    function status(t, ok) { const s = $('promo-status'); if (s) { s.textContent = t; s.className = 'status-msg ' + (ok ? 'ok' : 'error'); } }

    async function add() {
        const code = $('pc-code').value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (!code) { status('Введите код промокода.', false); return; }
        if (items.some((p) => p.code === code)) { status('Такой промокод уже есть.', false); return; }
        const free = $('pc-type').value === 'free';
        const pct = free ? 100 : Math.max(1, Math.min(100, Number($('pc-pct').value) || 0));
        const expires = $('pc-expires').value || '';
        const btn = $('pc-add'); btn.disabled = true;
        try {
            await db.collection('promoCodes').doc(code).set({ code, free, pct, expires, active: true, createdAt: Date.now() });
            status('Промокод «' + code + '» добавлен.', true);
            $('pc-code').value = ''; $('pc-expires').value = '';
            await load(true);
        } catch (err) { status('Не получилось сохранить: ' + (err.message || err), false); }
        btn.disabled = false;
    }
    async function setActive(code, active) {
        try { await db.collection('promoCodes').doc(code).update({ active }); const it = items.find((p) => p.code === code); if (it) it.active = active; }
        catch (err) { status('Не получилось изменить: ' + (err.message || err), false); render(); }
    }
    async function del(code) {
        if (!confirm('Удалить промокод «' + code + '»?')) return;
        try { await db.collection('promoCodes').doc(code).delete(); items = items.filter((p) => p.code !== code); render(); }
        catch (err) { status('Не получилось удалить: ' + (err.message || err), false); }
    }
    async function load(force) {
        if (loaded && !force) return; loaded = true;
        const root = $('promo-root'); if (!root) return;
        try {
            const snap = await db.collection('promoCodes').get();
            items = []; snap.forEach((d) => items.push(d.data()));
            items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } catch (e) { root.innerHTML = '<div class="empty-state">Не удалось загрузить: ' + esc(e.message) + '</div>'; loaded = false; return; }
        render();
    }
    window.loadPromo = load;
})();
