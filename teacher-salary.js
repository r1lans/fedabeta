/* TheStarth — «Зарплата» in the teacher cabinet (and the same view for the admin, per teacher).
 *   StarthTeacherSalary.mount(el, { uid })            — loads the teacher's data itself
 *   StarthTeacherSalary.render(el, data, st, month, opts) — draws from given data (admin panel)
 */
(function () {
    'use strict';
    var X = function (m) { return window.X ? window.X(m) : m; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var S = function () { return window.StarthSalary; };
    var fmtD = function (iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] : iso; };

    var CSS = '' +
        '.sl{--sl-good:#2e9a43;--sl-low:#d64545;--sl-mid:#c98a12}' +
        '.sl-top{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}' +
        '.sl-month{display:inline-flex;align-items:center;gap:.4rem;background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:.3rem}' +
        '.sl-month button{width:34px;height:34px;border-radius:9px;border:0;background:var(--paper-alt);color:var(--ink);cursor:pointer;font-size:1rem}' +
        '.sl-month b{min-width:150px;text-align:center;font-size:.95rem}' +
        '.sl-btn{border:1px solid var(--rule);background:var(--surface);color:var(--ink);border-radius:9px;padding:.5rem .9rem;font:inherit;font-size:.86rem;font-weight:600;cursor:pointer}' +
        '.sl-btn:hover{border-color:var(--accent);color:var(--accent)}' +
        '.sl-hero{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:1rem;background:linear-gradient(135deg,#161B2E,#232A44);color:#FAF7F0;border-radius:20px;padding:1.6rem 1.8rem;margin-bottom:1rem}' +
        '.sl-hero .lbl{display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#E3B04B;background:rgba(227,176,75,.12);border:1px solid rgba(227,176,75,.35);border-radius:99px;padding:3px 10px}' +
        '.sl-hero .big{font-family:var(--font-heading);font-size:clamp(2.2rem,6vw,3.6rem);font-weight:800;line-height:1.05;margin:.6rem 0 .3rem}' +
        '.sl-hero p{color:#C9CCD6;font-size:.9rem;line-height:1.5;margin:0}' +
        '.sl-att{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:1rem 1.1rem;align-self:center}' +
        '.sl-att .row{display:flex;justify-content:space-between;align-items:center;font-size:.78rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#C9CCD6}' +
        '.sl-att .row b{font-size:1.05rem;letter-spacing:0}' +
        '.sl-bar{height:10px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin:.7rem 0 .4rem}.sl-bar i{display:block;height:100%;border-radius:99px}' +
        '.sl-att small{display:flex;justify-content:space-between;color:#8E93A3;font-size:.72rem}' +
        '@media(max-width:760px){.sl-hero{grid-template-columns:1fr}}' +
        '.sl-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;margin-bottom:1.2rem}' +
        '@media(max-width:900px){.sl-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
        '.sl-tile{background:var(--surface);border:1px solid var(--rule);border-radius:16px;padding:1rem 1.1rem}' +
        '.sl-tile .ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-weight:800;margin-bottom:.6rem;font-size:1.15rem}' +
        '.sl-tile .t{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft)}' +
        '.sl-tile .v{font-size:1.35rem;font-weight:800;margin:.15rem 0}.sl-tile small{color:var(--ink-soft);font-size:.78rem;line-height:1.4;display:block}' +
        '.sl-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem}' +
        '@media(max-width:900px){.sl-cols{grid-template-columns:1fr}}' +
        '.sl-card{background:var(--surface);border:1px solid var(--rule);border-radius:16px;padding:1.1rem 1.2rem}' +
        '.sl-card h4{margin:0 0 .8rem;font-size:1rem;display:flex;align-items:center;gap:.5rem}' +
        '.sl-g{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:.65rem 0;border-top:1px dashed var(--rule)}.sl-g:first-of-type{border-top:0}' +
        '.sl-g b{display:block;font-size:.93rem}.sl-g small{color:var(--ink-soft);font-size:.78rem}.sl-g .amt{font-weight:800;white-space:nowrap}' +
        '.sl-chip{display:inline-block;font-size:.7rem;font-weight:700;border-radius:99px;padding:1px 8px;background:var(--accent-tint);color:var(--accent);margin-left:.3rem;vertical-align:middle}' +
        '.sl-les{border-top:1px dashed var(--rule);padding:.7rem 0}.sl-les:first-of-type{border-top:0}' +
        '.sl-les-h{display:flex;justify-content:space-between;gap:1rem;align-items:baseline}.sl-les-h b{font-size:.92rem}' +
        '.sl-st{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.4rem}' +
        '.sl-s{font-size:.74rem;border-radius:99px;padding:2px 8px;border:1px solid var(--rule)}' +
        '.sl-s.paid{background:rgba(46,154,67,.1);color:var(--sl-good);border-color:rgba(46,154,67,.3)}' +
        '.sl-s.unpaid{background:var(--paper-alt);color:var(--ink-soft)}' +
        '.sl-s.warn{background:rgba(201,138,18,.12);color:#9a6a0b;border-color:rgba(201,138,18,.3)}' +
        '.sl-rule{font-size:.85rem;line-height:1.55;color:var(--ink-soft);background:var(--paper);border:1px dashed var(--rule);border-radius:14px;padding:.9rem 1.1rem;margin-top:1rem}' +
        '.sl-rule b{color:var(--ink)}' +
        '.sl-empty{color:var(--ink-soft);font-size:.88rem;padding:.6rem 0}';
    function css() { if (document.getElementById('sl-style')) return; var s = document.createElement('style'); s.id = 'sl-style'; s.textContent = CSS; document.head.appendChild(s); }

    function render(el, data, st, month, opts) {
        css(); opts = opts || {};
        el.classList.add('sl');
        var r = S().compute(data, st, month), M = function (v) { return S().money(v, st); };
        var att = r.attPct, col = att == null ? 'rgba(255,255,255,.2)' : att >= 85 ? '#3fbf5a' : att >= 60 ? '#E3B04B' : '#ef5a5a';
        var pay = r.payout ? '<span style="color:#2e9a43">' + esc(X('Выплачено')) + ' ' + esc(fmtD(String(r.payout.paidAt || '').slice(0, 10))) + '</span>' : esc(X('Ещё не выплачено'));
        var groups = r.byGroup.map(function (g) {
            return '<div class="sl-g"><div><b>' + esc(g.title) + '<span class="sl-chip">' + esc(X(S().FORMATS[g.format] || g.format)) + '</span></b>' +
                '<small>' + g.lessons + ' ' + esc(X('ур.')) + ' · ' + g.paidVisits + ' ' + esc(X('оплачиваемых посещений')) + ' · ' + esc(M(g.rate)) + ' ' + esc(X('за ученика')) + '</small></div>' +
                '<span class="amt">' + esc(M(g.amount)) + '</span></div>';
        }).join('') || '<div class="sl-empty">' + esc(X('В этом месяце ещё нет отмеченных уроков.')) + '</div>';
        var lessons = r.lessons.slice(0, opts.limit || 60).map(function (l) {
            return '<div class="sl-les"><div class="sl-les-h"><b>' + esc(fmtD(l.date)) + ' · ' + esc(l.title) + '</b><span class="amt" style="font-weight:800">' + esc(M(l.amount)) + '</span></div>' +
                '<div class="sl-st">' + l.students.map(function (s) {
                    var cls = s.paid ? (s.mark === 'absent' || s.mark === 'missed' ? 'warn' : 'paid') : 'unpaid';
                    var ic = (window.Icons ? Icons.svg(s.paid ? (cls === 'warn' ? 'alert' : 'check') : 'minus') : '');
                    return '<span class="sl-s ' + cls + '" title="' + esc(X(s.why)) + '">' + ic + ' ' + esc(s.name) + ' · ' + esc(X(s.why)) + '</span>';
                }).join('') + '</div></div>';
        }).join('') || '<div class="sl-empty">' + esc(X('Отмечайте посещаемость после каждого урока — сумма появится здесь.')) + '</div>';
        var adj = r.adjustList.map(function (a) {
            return '<div class="sl-g"><div><b>' + esc(a.note || (a.amount >= 0 ? X('Бонус') : X('Штраф'))) + '</b><small>' + esc(fmtD(String(a.createdAt || '').slice(0, 10))) + '</small></div>' +
                '<span class="amt" style="color:' + (a.amount >= 0 ? 'var(--sl-good)' : 'var(--sl-low)') + '">' + (a.amount >= 0 ? '+' : '−') + esc(M(Math.abs(a.amount))) + '</span>' +
                (opts.admin ? ' <button class="sl-btn" data-deladj="' + esc(a.id) + '" type="button" aria-label="' + esc(X('Удалить')) + '">' + (window.Icons ? Icons.svg('x') : '') + '</button>' : '') + '</div>';
        }).join('');

        el.innerHTML =
            '<div class="sl-top"><div class="sl-month"><button type="button" data-m="-1" aria-label="' + esc(X('Предыдущий месяц')) + '">‹</button><b>' + esc(S().monthName(month)) + '</b><button type="button" data-m="1" aria-label="' + esc(X('Следующий месяц')) + '">›</button></div>' +
            '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' + (opts.extraButtons || '') + '<button class="sl-btn" type="button" data-xlsx>' + (window.Icons ? Icons.svg('download') : '') + ' Excel</button></div></div>' +
            '<div class="sl-hero"><div><span class="lbl">' + esc(X('Ваш заработок за месяц')) + '</span>' +
                '<div class="big">' + esc(M(r.total)) + '</div>' +
                '<p>' + esc(X('Вы получаете')) + ' ' + st.share + '% ' + esc(X('от оплаты каждого ученика, который был на уроке или не предупредил о пропуске за 24 часа.')) + '</p></div>' +
                '<div class="sl-att"><div class="row"><span>' + esc(X('Средняя посещаемость')) + '</span><b>' + (att == null ? '—' : att + '%') + '</b></div>' +
                '<div class="sl-bar"><i style="width:' + (att || 0) + '%;background:' + col + '"></i></div><small><span>' + esc(X('плохо (< 60%)')) + '</span><span>' + esc(X('отлично (100%)')) + '</span></small></div></div>' +
            '<div class="sl-tiles">' +
                '<div class="sl-tile"><div class="ic" style="background:rgba(46,154,67,.12);color:#2e9a43">' + (window.Icons ? Icons.svg('wallet') : '') + '</div><div class="t">' + esc(X('За уроки')) + '</div><div class="v">' + esc(M(r.earned)) + '</div><small>' + r.paidVisits + ' ' + esc(X('оплачиваемых посещений')) + '</small></div>' +
                '<div class="sl-tile"><div class="ic" style="background:rgba(201,138,18,.14);color:#b07a0e">' + (window.Icons ? Icons.svg('gift') : '') + '</div><div class="t">' + esc(X('Бонусы и штрафы')) + '</div><div class="v">' + (r.adjust >= 0 ? '+' : '−') + esc(M(Math.abs(r.adjust))) + '</div><small>' + esc(X('ставит администратор')) + '</small></div>' +
                '<div class="sl-tile"><div class="ic" style="background:var(--accent-tint);color:var(--accent)">' + (window.Icons ? Icons.svg('bolt') : '') + '</div><div class="t">' + esc(X('Можно заработать')) + '</div><div class="v">' + esc(M(r.expected)) + '</div><small>' + esc(X('если все ученики придут на все уроки месяца')) + '</small></div>' +
                '<div class="sl-tile"><div class="ic" style="background:rgba(70,110,200,.12);color:#4a6fc0">' + (window.Icons ? Icons.svg('check-circle') : '') + '</div><div class="t">' + esc(X('Выплата')) + '</div><div class="v" style="font-size:1rem">' + pay + '</div><small>' + r.excused + ' ' + esc(X('пропусков с предупреждением')) + ' · ' + r.unexcused + ' ' + esc(X('без')) + '</small></div>' +
            '</div>' +
            '<div class="sl-cols"><div class="sl-card"><h4>' + esc(X('Доход по группам')) + '</h4>' + groups + (adj ? '<h4 style="margin-top:1.2rem">' + esc(X('Бонусы и штрафы')) + '</h4>' + adj : '') + '</div>' +
            '<div class="sl-card"><h4>' + esc(X('Уроки этого месяца')) + '</h4>' + lessons + '</div></div>' +
            '<div class="sl-rule"><b>' + esc(X('Как считается:')) + '</b> ' + esc(X('за каждого ученика на уроке вы получаете')) + ' ' + st.share + '% ' + esc(X('от цены урока')) +
                ' (' + Object.keys(S().FORMATS).map(function (k) { return X(S().FORMATS[k]) + ' — ' + M(st.prices[k] * st.share / 100); }).join(', ') + '). ' +
                esc(X('Был или опоздал — оплачивается. Не пришёл и не предупредил за 24 часа — тоже оплачивается. Предупредил за 24 часа и больше — не оплачивается. Урок без отметки посещаемости не оплачивается.')) + '</div>';

        el.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { (opts.onMonth || function () {})(S().shiftMonth(month, +b.getAttribute('data-m'))); }; });
        el.querySelector('[data-xlsx]').onclick = function () {
            var rows = [[(opts.teacherName ? opts.teacherName + ' · ' : '') + X('Зарплата') + ': ' + S().monthName(month), X('Итого') + ': ' + M(r.total)],
                ['Дата', 'Урок', 'Формат', 'Ученик', 'Статус', 'Оплачено', 'Сумма']];
            r.lessons.slice().reverse().forEach(function (l) { l.students.forEach(function (s) { rows.push([l.date, l.title, S().FORMATS[l.format] || l.format, s.name, s.why, s.paid ? 'да' : 'нет', s.paid ? Math.round(l.rate * 100) / 100 : 0]); }); });
            r.adjustList.forEach(function (a) { rows.push(['', a.note || 'Бонус/штраф', '', '', '', '', Number(a.amount) || 0]); });
            if (window.CsvExport) CsvExport.download('zarplata_' + month, rows, { sheet: 'Зарплата' });
        };
        if (opts.onRendered) opts.onRendered(el, r);
        return r;
    }

    async function mount(el, opts) {
        if (!el) return;
        var month = S().curMonth(), st = await S().loadSettings(), data = null;
        el.innerHTML = '<div class="sl-empty">' + esc(X('Загрузка…')) + '</div>';
        try { data = await S().loadTeacherData(opts.uid); }
        catch (e) { el.innerHTML = '<div class="sl-empty">' + esc(X('Не удалось загрузить')) + ': ' + esc(e.message) + '</div>'; return; }
        var draw = function () { render(el, data, st, month, { onMonth: function (m) { month = m; draw(); } }); };
        draw();
        return { reload: async function () { data = await S().loadTeacherData(opts.uid); st = await S().loadSettings(); draw(); }, summary: function () { return S().compute(data, st, S().curMonth()); }, settings: function () { return st; } };
    }

    window.StarthTeacherSalary = { mount: mount, render: render };
})();
