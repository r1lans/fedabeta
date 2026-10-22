/* Admin panel → «Зарплаты учителей»: prices and the teacher's share, group formats, each teacher's month, bonuses / fines, payouts.
 * Needs: db, StarthSalary, StarthTeacherSalary, CsvExport, escapeHtml.
 */
(function () {
    'use strict';
    var S = function () { return window.StarthSalary; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var $ = function (id) { return document.getElementById(id); };
    var st = null, all = null, month = null, openUid = null, loaded = false;

    var CSS = '' +
        '.as-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.8rem;align-items:end}' +
        '@media(max-width:900px){.as-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
        '.as-t{width:100%;border-collapse:separate;border-spacing:0;background:var(--surface);border:1px solid var(--rule);border-radius:14px;overflow:hidden;font-size:.9rem}' +
        '.as-t th{background:var(--paper-alt);text-align:left;font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);padding:.65rem .8rem}' +
        '.as-t td{padding:.7rem .8rem;border-top:1px solid var(--rule);vertical-align:middle}' +
        '.as-t tr.open td{background:var(--accent-tint)}' +
        '.as-t .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
        '.as-wrap{overflow-x:auto}' +
        '.as-paid{font-size:.75rem;font-weight:700;border-radius:99px;padding:2px 9px;white-space:nowrap}' +
        '.as-paid.y{background:rgba(46,154,67,.14);color:#2e9a43}.as-paid.n{background:var(--paper-alt);color:var(--ink-soft);border:1px solid var(--rule)}' +
        '.as-detail{background:var(--paper);border:1px solid var(--rule);border-radius:16px;padding:1rem;margin:.8rem 0 1.2rem}' +
        '.as-acts{display:flex;gap:.4rem;flex-wrap:wrap;justify-content:flex-end}';
    function css() { if ($('as-style')) return; var s = document.createElement('style'); s.id = 'as-style'; s.textContent = CSS; document.head.appendChild(s); }

    function shell() {
        $('salary-root').innerHTML =
            '<div class="admin-form" id="as-settings">' +
                '<div class="adm-form-head"><h3>Цены и доля учителя</h3></div>' +
                '<div class="as-grid">' +
                    '<div><label>Валюта</label><select id="as-cur"><option value="$">$ (доллар)</option><option value="сум">сум</option></select></div>' +
                    '<div><label>Доля учителя, %</label><input type="number" id="as-share" min="0" max="100" step="1"></div>' +
                    '<div><label>Группа до 5 — урок</label><input type="number" id="as-p-grp5" min="0" step="0.01"></div>' +
                    '<div><label>Мини-группа до 3 — урок</label><input type="number" id="as-p-grp" min="0" step="0.01"></div>' +
                    '<div><label>1-на-1 — урок</label><input type="number" id="as-p-ind" min="0" step="0.01"></div>' +
                '</div>' +
                '<p class="adm-help">Цена одного урока для одного ученика. Пример: группа до 5 стоит $108 за 12 уроков → $9 за урок; учителю 40% → $3.60 за каждого ученика на уроке.</p>' +
                '<div class="adm-actions"><button class="btn-primary" type="button" id="as-save">Сохранить</button><span class="status-msg" id="as-st" style="margin:0"></span></div>' +
            '</div>' +
            '<div class="adm-addbar" style="justify-content:space-between">' +
                '<div class="sl-month" style="display:inline-flex;align-items:center;gap:.4rem;background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:.3rem">' +
                    '<button type="button" class="btn-small" data-am="-1">‹</button><b id="as-month" style="min-width:150px;text-align:center"></b><button type="button" class="btn-small" data-am="1">›</button></div>' +
                '<div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn-small" type="button" id="as-reload">' + (window.Icons ? Icons.svg('refresh') : '') + ' Обновить</button><button class="btn-small primary" type="button" id="as-xlsx">' + (window.Icons ? Icons.svg('download') : '') + ' Excel за месяц</button></div>' +
            '</div>' +
            '<h3 class="adm-listhead">Учителя за месяц</h3>' +
            '<div class="as-wrap" id="as-table"><div class="empty-state">Загрузка…</div></div>' +
            '<div id="as-detail"></div>' +
            '<h3 class="adm-listhead">Формат групп</h3>' +
            '<p class="adm-help" style="margin-top:-.4rem;margin-bottom:.8rem">По умолчанию формат определяется числом учеников (1 → 1-на-1, 2–3 → мини-группа, 4+ → группа до 5). Здесь его можно задать вручную или поставить свою цену урока для группы.</p>' +
            '<div class="as-wrap" id="as-groups"></div>';
        $('as-save').onclick = saveSettings;
        $('as-reload').onclick = function () { load(true); };
        $('as-xlsx').onclick = exportMonth;
        document.querySelectorAll('[data-am]').forEach(function (b) { b.onclick = function () { month = S().shiftMonth(month, +b.getAttribute('data-am')); draw(); }; });
    }

    function fillSettings() {
        $('as-cur').value = st.currency === 'сум' ? 'сум' : '$';
        $('as-share').value = st.share;
        ['grp5', 'grp', 'ind'].forEach(function (k) { $('as-p-' + k).value = st.prices[k]; });
    }
    async function saveSettings() {
        var p = {}; ['grp5', 'grp', 'ind'].forEach(function (k) { p[k] = Math.max(0, Number($('as-p-' + k).value) || 0); });
        var share = Math.min(100, Math.max(0, Number($('as-share').value) || 0));
        try {
            await db.collection('settings').doc('salary').set({ currency: $('as-cur').value, share: share, prices: p, updatedAt: new Date().toISOString() });
            st = S().settings({ currency: $('as-cur').value, share: share, prices: p });
            setStatus('as-st', 'Сохранено — учителя увидят новые суммы.', true); draw();
        } catch (e) { setStatus('as-st', 'Ошибка: ' + e.message, false); }
    }

    function teachers() {
        var map = {};
        all.groups.forEach(function (g) { if (g.teacherUid) map[g.teacherUid] = map[g.teacherUid] || g.teacherName || g.teacherUid; });
        all.schedule.forEach(function (s) { if (s.teacherUid) map[s.teacherUid] = map[s.teacherUid] || s.teacherName || s.teacherUid; });
        all.users.forEach(function (u) { if (u.role === 'teacher') map[u.id] = [u.name, u.surname].filter(Boolean).join(' ') || map[u.id] || u.nickname || u.id; });
        return Object.keys(map).map(function (uid) { return { uid: uid, name: map[uid] }; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ru'); });
    }
    function dataFor(uid) {
        var f = function (arr) { return arr.filter(function (x) { return x.teacherUid === uid; }); };
        return { groups: f(all.groups), attendance: f(all.attendance), schedule: f(all.schedule), absences: f(all.absences), adjust: f(all.adjust), payouts: f(all.payouts) };
    }

    function draw() {
        $('as-month').textContent = S().monthName(month, 'ru');
        var M = function (v) { return S().money(v, st); };
        var list = teachers().map(function (t) { return Object.assign(t, { r: S().compute(dataFor(t.uid), st, month) }); });
        var sum = list.reduce(function (s, t) { return s + t.r.total; }, 0);
        $('as-table').innerHTML = !list.length ? '<div class="empty-state">Учителей пока нет.</div>' :
            '<table class="as-t"><tr><th>Учитель</th><th class="num">Уроков</th><th class="num">Оплач. посещений</th><th class="num">За уроки</th><th class="num">Бонус / штраф</th><th class="num">Итого</th><th>Выплата</th><th></th></tr>' +
            list.map(function (t) {
                return '<tr class="' + (openUid === t.uid ? 'open' : '') + '"><td><b>' + esc(t.name) + '</b></td><td class="num">' + t.r.lessons.length + '</td><td class="num">' + t.r.paidVisits + '</td>' +
                    '<td class="num">' + esc(M(t.r.earned)) + '</td><td class="num">' + (t.r.adjust ? (t.r.adjust > 0 ? '+' : '−') + esc(M(Math.abs(t.r.adjust))) : '—') + '</td>' +
                    '<td class="num"><b>' + esc(M(t.r.total)) + '</b></td>' +
                    '<td>' + (t.r.payout ? '<span class="as-paid y">Выплачено ' + esc(String(t.r.payout.paidAt || '').slice(0, 10)) + '</span>' : '<span class="as-paid n">Не выплачено</span>') + '</td>' +
                    '<td><div class="as-acts"><button class="btn-small" data-open="' + esc(t.uid) + '">' + (openUid === t.uid ? 'Скрыть' : 'Подробно') + '</button>' +
                    '<button class="btn-small" data-adj="' + esc(t.uid) + '">± Бонус / штраф</button>' +
                    (t.r.payout ? '<button class="btn-small danger" data-unpay="' + esc(t.uid) + '">Отменить выплату</button>' : '<button class="btn-small primary" data-pay="' + esc(t.uid) + '" data-amt="' + t.r.total + '">Отметить выплату</button>') +
                    '</div></td></tr>';
            }).join('') + '<tr><td colspan="5"><b>Всего к выплате за месяц</b></td><td class="num"><b>' + esc(M(sum)) + '</b></td><td colspan="2"></td></tr></table>';
        $('as-table').querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { openUid = openUid === b.dataset.open ? null : b.dataset.open; draw(); }; });
        $('as-table').querySelectorAll('[data-adj]').forEach(function (b) { b.onclick = function () { addAdjust(b.dataset.adj); }; });
        $('as-table').querySelectorAll('[data-pay]').forEach(function (b) { b.onclick = function () { pay(b.dataset.pay, +b.dataset.amt); }; });
        $('as-table').querySelectorAll('[data-unpay]').forEach(function (b) { b.onclick = function () { unpay(b.dataset.unpay); }; });
        var det = $('as-detail');
        if (openUid) {
            var t = list.find(function (x) { return x.uid === openUid; });
            det.innerHTML = '<div class="as-detail"><h3 style="margin:0 0 .8rem">' + esc(t ? t.name : '') + '</h3><div id="as-tview"></div></div>';
            window.StarthTeacherSalary.render($('as-tview'), dataFor(openUid), st, month, { admin: true, teacherName: t && t.name, onMonth: function (m) { month = m; draw(); },
                onRendered: function (el) { el.querySelectorAll('[data-deladj]').forEach(function (b) { b.onclick = function () { delAdjust(b.dataset.deladj); }; }); } });
        } else det.innerHTML = '';
        drawGroups();
    }

    function drawGroups() {
        var M = function (v) { return S().money(v, st); };
        var gs = all.groups.filter(function (g) { return !g.archived; }).sort(function (a, b) { return String(a.teacherName).localeCompare(String(b.teacherName), 'ru') || String(a.name).localeCompare(String(b.name), 'ru'); });
        if (!gs.length) { $('as-groups').innerHTML = '<div class="empty-state">Групп пока нет.</div>'; return; }
        $('as-groups').innerHTML = '<table class="as-t"><tr><th>Группа</th><th>Учитель</th><th class="num">Учеников</th><th>Формат</th><th>Своя цена урока</th><th class="num">Учителю за ученика</th></tr>' +
            gs.map(function (g) {
                var auto = S().formatOf(Object.assign({}, g, { format: '' }));
                return '<tr><td><b>' + esc(g.name) + '</b></td><td>' + esc(g.teacherName || '') + '</td><td class="num">' + (g.members || []).length + '</td>' +
                    '<td><select data-fmt="' + esc(g.id) + '"><option value="">Авто: ' + esc(S().FORMATS[auto]) + '</option>' +
                    Object.keys(S().FORMATS).map(function (k) { return '<option value="' + k + '"' + (g.format === k ? ' selected' : '') + '>' + esc(S().FORMATS[k]) + '</option>'; }).join('') + '</select></td>' +
                    '<td><input type="number" min="0" step="0.01" style="max-width:110px" data-price="' + esc(g.id) + '" value="' + (Number(g.priceOverride) > 0 ? g.priceOverride : '') + '" placeholder="как в настройках"></td>' +
                    '<td class="num">' + esc(M(S().rateFor(g, st))) + '</td></tr>';
            }).join('') + '</table>';
        $('as-groups').querySelectorAll('[data-fmt]').forEach(function (s) {
            s.onchange = async function () {
                var g = all.groups.find(function (x) { return x.id === s.dataset.fmt; });
                try { await db.collection('groups').doc(g.id).update({ format: s.value }); g.format = s.value; draw(); } catch (e) { alert('Ошибка: ' + e.message); }
            };
        });
        $('as-groups').querySelectorAll('[data-price]').forEach(function (i) {
            i.onchange = async function () {
                var g = all.groups.find(function (x) { return x.id === i.dataset.price; }), v = Math.max(0, Number(i.value) || 0);
                try { await db.collection('groups').doc(g.id).update({ priceOverride: v }); g.priceOverride = v; draw(); } catch (e) { alert('Ошибка: ' + e.message); }
            };
        });
    }

    async function addAdjust(uid) {
        var v = prompt('Сумма за ' + S().monthName(month, 'ru') + ' (бонус — например 20, штраф — например -10):');
        if (v == null) return;
        var amount = Number(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''));
        if (!amount) return alert('Введите число, например 20 или -10.');
        var note = prompt('За что? (учитель увидит)', amount > 0 ? 'Бонус' : 'Штраф') || '';
        try {
            var ref = await db.collection('salaryAdjust').add({ teacherUid: uid, month: month, amount: amount, note: note.slice(0, 120), createdAt: new Date().toISOString() });
            all.adjust.push({ id: ref.id, teacherUid: uid, month: month, amount: amount, note: note, createdAt: new Date().toISOString() }); openUid = uid; draw();
        } catch (e) { alert('Ошибка: ' + e.message); }
    }
    async function delAdjust(id) {
        if (!confirm('Удалить этот бонус / штраф?')) return;
        try { await db.collection('salaryAdjust').doc(id).delete(); all.adjust = all.adjust.filter(function (x) { return x.id !== id; }); draw(); } catch (e) { alert('Ошибка: ' + e.message); }
    }
    async function pay(uid, amount) {
        if (!confirm('Отметить, что зарплата за ' + S().monthName(month, 'ru') + ' выплачена (' + S().money(amount, st) + ')?')) return;
        var doc = { teacherUid: uid, month: month, amount: Math.round(amount * 100) / 100, paidAt: new Date().toISOString() };
        try { await db.collection('payouts').doc(uid + '_' + month).set(doc); all.payouts = all.payouts.filter(function (p) { return !(p.teacherUid === uid && p.month === month); }).concat([Object.assign({ id: uid + '_' + month }, doc)]); draw(); }
        catch (e) { alert('Ошибка: ' + e.message); }
    }
    async function unpay(uid) {
        if (!confirm('Отменить отметку о выплате?')) return;
        try { await db.collection('payouts').doc(uid + '_' + month).delete(); all.payouts = all.payouts.filter(function (p) { return !(p.teacherUid === uid && p.month === month); }); draw(); }
        catch (e) { alert('Ошибка: ' + e.message); }
    }
    function exportMonth() {
        var rows = [['Зарплаты учителей: ' + S().monthName(month, 'ru'), 'Доля: ' + st.share + '%'], ['Учитель', 'Уроков', 'Оплачиваемых посещений', 'За уроки', 'Бонус / штраф', 'Итого', 'Выплачено']];
        teachers().forEach(function (t) { var r = S().compute(dataFor(t.uid), st, month); rows.push([t.name, r.lessons.length, r.paidVisits, Math.round(r.earned * 100) / 100, r.adjust, Math.round(r.total * 100) / 100, r.payout ? String(r.payout.paidAt).slice(0, 10) : 'нет']); });
        CsvExport.download('zarplaty_' + month, rows, { sheet: 'Зарплаты' });
    }
    function setStatus(id, t, ok) { var el = $(id); if (!el) return; el.textContent = t; el.className = 'status-msg ' + (ok ? 'ok' : 'error'); }

    async function load(force) {
        var g = function (n) { return S().getAll(db.collection(n)).catch(function (e) { console.warn(n, e); return []; }); };
        $('as-table').innerHTML = '<div class="empty-state">Загрузка…</div>';
        var r = await Promise.all([g('groups'), g('attendance'), g('schedule'), g('absences'), g('salaryAdjust'), g('payouts'),
            S().getAll(db.collection('users').where('role', '==', 'teacher')).catch(function () { return []; })]);
        all = { groups: r[0], attendance: r[1], schedule: r[2], absences: r[3], adjust: r[4], payouts: r[5], users: r[6] };
        st = await S().loadSettings(); fillSettings(); draw();
    }

    window.loadSalaryAdmin = async function () {
        if (!$('salary-root')) return;
        css();
        if (!loaded) { shell(); loaded = true; month = S().curMonth(); }
        try { await load(); } catch (e) { $('as-table').innerHTML = '<div class="empty-state">Не удалось загрузить: ' + esc(e.message) + '</div>'; }
    };
})();
