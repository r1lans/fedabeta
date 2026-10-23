/* TheStarth — student cabinet: «Главная» (next lesson, numbers, latest grades) and «Мой прогресс» (charts).
 *   StudentProgress.home(el, user, profile)      StudentProgress.progress(el, user, profile)
 */
(function () {
    'use strict';
    var X = function (m) { return window.X ? window.X(m) : m; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var S = function () { return window.StarthSalary; };
    var fmtD = function (iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] : iso; };
    var fmtS = function (v) { return v == null ? '—' : (Math.round(v * 10) / 10).toString(); };
    var cls = function (v) { return v == null ? 'none' : v >= 8 ? 'good' : v >= 5 ? 'mid' : 'low'; };
    var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
    var COL = { good: '#2e9a43', mid: '#c98a12', low: '#d64545' };

    var CSS = '' +
        '.spg-next{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:1.2rem;align-items:center;background:linear-gradient(135deg,#161B2E,#232A44);color:#FAF7F0;border-radius:20px;padding:1.4rem 1.6rem;margin-bottom:1rem}' +
        '@media(max-width:700px){.spg-next{grid-template-columns:auto minmax(0,1fr)}.spg-next .acts{grid-column:1/-1}}' +
        '.spg-next .cal{width:76px;text-align:center;background:rgba(227,176,75,.14);border:1px solid rgba(227,176,75,.4);border-radius:14px;padding:.5rem 0;color:#E3B04B}' +
        '.spg-next .cal b{display:block;font-size:1.9rem;line-height:1;font-family:var(--font-heading)}.spg-next .cal small{font-size:.72rem;font-weight:700;text-transform:uppercase}' +
        '.spg-next .lbl{font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#E3B04B}' +
        '.spg-next h3{margin:.2rem 0;font-size:1.35rem;color:#FAF7F0}.spg-next p{margin:0;color:#C9CCD6;font-size:.9rem}' +
        '.spg-next .acts{display:flex;gap:.5rem;flex-wrap:wrap}' +
        '.spg-next .ghost{border:1px solid rgba(255,255,255,.3);background:transparent;color:#FAF7F0;border-radius:10px;padding:.6rem 1rem;font:inherit;font-weight:600;cursor:pointer}' +
        '.spg-next .ghost:hover{border-color:#ef8a8a;color:#ffb3b3}' +
        '.spg-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;margin-bottom:1rem}' +
        '@media(max-width:900px){.spg-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
        '.spg-tile{background:var(--surface);border:1px solid var(--rule);border-radius:16px;padding:1rem 1.1rem}' +
        '.spg-tile .t{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft)}' +
        '.spg-tile .v{font-size:1.6rem;font-weight:800;margin:.2rem 0 .1rem;font-family:var(--font-heading)}.spg-tile small{color:var(--ink-soft);font-size:.78rem}' +
        '.spg-tile .v.good{color:#2e9a43}.spg-tile .v.mid{color:#c98a12}.spg-tile .v.low{color:#d64545}' +
        '.spg-card{background:var(--surface);border:1px solid var(--rule);border-radius:16px;padding:1.1rem 1.2rem;margin-bottom:1rem}' +
        '.spg-card h3{margin:0 0 .3rem;font-size:1.05rem}.spg-card .sub{color:var(--ink-soft);font-size:.82rem;margin:0 0 .8rem}' +
        '.spg-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem}' +
        '@media(max-width:900px){.spg-cols{grid-template-columns:1fr}}' +
        '.spg-g{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:.7rem;align-items:center;padding:.55rem 0;border-top:1px dashed var(--rule)}.spg-g:first-of-type{border-top:0}' +
        '.spg-m{min-width:40px;height:32px;border-radius:9px;display:grid;place-items:center;font-weight:800}' +
        '.spg-m.good{background:rgba(46,154,67,.14);color:#2e9a43}.spg-m.mid{background:rgba(201,138,18,.15);color:#b07a0e}.spg-m.low{background:rgba(214,69,69,.13);color:#d64545}' +
        '.spg-g b{font-size:.92rem}.spg-g small{display:block;color:var(--ink-soft);font-size:.78rem}' +
        '.spg-chart{width:100%;height:auto;display:block}' +
        '.spg-legend{display:flex;gap:1rem;flex-wrap:wrap;font-size:.78rem;color:var(--ink-soft);margin-top:.5rem}.spg-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}' +
        '.spg-empty{color:var(--ink-soft);font-size:.88rem;padding:.8rem 0}' +
        '.spg-sel{padding:.4rem .6rem;border-radius:9px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);font:inherit;font-size:.85rem}' +
        '.spg-quick{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}' +
        '.spg-quick button{border:1px solid var(--accent);background:var(--surface);color:var(--accent);border-radius:999px;padding:.5rem 1rem;font:inherit;font-size:.9rem;font-weight:600;cursor:pointer}' +
        '.spg-quick button:hover{background:var(--accent);color:var(--on-accent)}';
    function css() { if (document.getElementById('spg-style')) return; var s = document.createElement('style'); s.id = 'spg-style'; s.textContent = CSS; document.head.appendChild(s); }

    var cache = null;
    async function load(user, profile) {
        if (cache && cache.uid === user.uid && Date.now() - cache.t < 60000) return cache.d;
        var g = function (q) { return S().getAll(q).catch(function () { return []; }); };
        var nick = (profile && profile.nickname) || '';
        var r = await Promise.all([
            g(db.collection('groups').where('memberUids', 'array-contains', user.uid)),
            g(db.collection('grades').where('studentUid', '==', user.uid)),
            g(db.collection('attendance').where('studentUids', 'array-contains', user.uid)),
            nick ? g(db.collection('schedule').where('studentNickname', '==', nick)) : Promise.resolve([]),
            g(db.collection('mockResults').where('uid', '==', user.uid)),
            g(db.collection('mockWritings').where('uid', '==', user.uid)),
            g(db.collection('absences').where('uid', '==', user.uid))
        ]);
        var d = { groups: r[0], grades: r[1].sort(function (a, b) { return (String(a.date) + (a.createdAt || '')).localeCompare(String(b.date) + (b.createdAt || '')); }),
            att: r[2], schedule: r[3], mocks: r[4].sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); }), writings: r[5], absences: r[6], nick: nick };
        cache = { uid: user.uid, t: Date.now(), d: d };
        return d;
    }
    function attStats(d) {
        var pr = 0, lt = 0, ab = 0, byMonth = {};
        d.att.forEach(function (a) {
            var s = a.marks && a.marks[d.nick]; if (!s) return;
            var m = String(a.date).slice(0, 7), o = byMonth[m] || (byMonth[m] = { present: 0, late: 0, absent: 0 });
            if (s === 'present') { pr++; o.present++; } else if (s === 'late') { lt++; o.late++; } else if (s === 'absent') { ab++; o.absent++; }
        });
        (d.schedule || []).forEach(function (s) {
            if (s.status !== 'done' && s.status !== 'missed') return;
            var m = String(s.date).slice(0, 7), o = byMonth[m] || (byMonth[m] = { present: 0, late: 0, absent: 0 });
            if (s.status === 'done') { pr++; o.present++; } else { ab++; o.absent++; }
        });
        var tot = pr + lt + ab;
        return { pr: pr, lt: lt, ab: ab, tot: tot, pct: tot ? Math.round((pr + lt) / tot * 100) : null, byMonth: byMonth };
    }
    function bands(d) {
        var out = [];
        d.mocks.forEach(function (m) { if (m.band != null) out.push({ ts: m.ts || 0, skill: m.skill, band: +m.band, title: m.title || '' }); });
        d.writings.forEach(function (w) { var b = w.feedback && w.feedback.overall; if (b != null) out.push({ ts: w.checkedAt || w.ts || 0, skill: 'writing', band: +b, title: w.testTitle || '' }); });
        return out.sort(function (a, b) { return a.ts - b.ts; });
    }

    // ── charts (SVG) ──
    function lineChart(points, opt) {   // points: [{x:label, y, color?, title}]
        opt = opt || {};
        var W = 640, H = 230, L = 34, R = 16, T = 14, B = 28, max = opt.max || 10, min = opt.min || 0;
        if (!points.length) return '<div class="spg-empty">' + esc(opt.empty || X('Пока нет данных.')) + '</div>';
        var n = points.length, iw = W - L - R, ih = H - T - B;
        var xs = function (i) { return L + (n === 1 ? iw / 2 : i * iw / (n - 1)); };
        var ys = function (v) { return T + ih - ((v - min) / (max - min)) * ih; };
        var s = '<svg class="spg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.label || '') + '">';
        (opt.grid || [min, (min + max) / 2, max]).forEach(function (v) {
            s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ys(v) + '" y2="' + ys(v) + '" stroke="var(--rule)" stroke-dasharray="' + (v === min ? '0' : '4 4') + '"/><text x="' + (L - 8) + '" y="' + (ys(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--ink-soft)">' + v + '</text>';
        });
        var series = opt.series || [{ key: null, color: 'var(--accent)' }];
        series.forEach(function (sr) {
            var idx = []; points.forEach(function (p, i) { if (sr.key == null || p.key === sr.key) idx.push(i); });
            if (idx.length > 1) s += '<polyline points="' + idx.map(function (i) { return xs(i).toFixed(1) + ',' + ys(points[i].y).toFixed(1); }).join(' ') + '" fill="none" stroke="' + sr.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
        });
        if (opt.trend && n >= 3) {   // moving average of 3
            var ma = points.map(function (p, i) { var a = points.slice(Math.max(0, i - 2), i + 1).map(function (q) { return q.y; }); return mean(a); });
            s += '<polyline points="' + ma.map(function (v, i) { return xs(i).toFixed(1) + ',' + ys(v).toFixed(1); }).join(' ') + '" fill="none" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="5 4" opacity=".7"/>';
        }
        points.forEach(function (p, i) { s += '<circle cx="' + xs(i).toFixed(1) + '" cy="' + ys(p.y).toFixed(1) + '" r="5" fill="' + (p.color || 'var(--accent)') + '" stroke="var(--surface)" stroke-width="2"><title>' + esc(p.title || '') + '</title></circle>'; });
        var step = Math.max(1, Math.ceil(n / 8));
        points.forEach(function (p, i) { if (i % step === 0 || i === n - 1) s += '<text x="' + xs(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">' + esc(p.x) + '</text>'; });
        return s + '</svg>';
    }
    function barChart(months, byMonth) {
        if (!months.length) return '<div class="spg-empty">' + esc(X('Посещаемость ещё не отмечали.')) + '</div>';
        var W = 640, H = 220, L = 30, B = 28, T = 10, ih = H - T - B, max = 1;
        months.forEach(function (m) { var o = byMonth[m]; max = Math.max(max, o.present + o.late + o.absent); });
        var bw = Math.min(60, (W - L - 10) / months.length * 0.6), gap = (W - L - 10) / months.length;
        var s = '<svg class="spg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(X('Посещаемость по месяцам')) + '">';
        [0, Math.ceil(max / 2), max].forEach(function (v) { var y = T + ih - v / max * ih; s += '<line x1="' + L + '" x2="' + (W - 10) + '" y1="' + y + '" y2="' + y + '" stroke="var(--rule)" stroke-dasharray="' + (v ? '4 4' : '0') + '"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--ink-soft)">' + v + '</text>'; });
        months.forEach(function (m, i) {
            var o = byMonth[m], x = L + i * gap + (gap - bw) / 2, y = T + ih;
            [['present', '#2e9a43'], ['late', '#c98a12'], ['absent', '#d64545']].forEach(function (k) {
                var h = o[k[0]] / max * ih; if (!h) return; y -= h;
                s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + k[1] + '"><title>' + esc(S().monthName(m) + ': ' + o[k[0]]) + '</title></rect>';
            });
            var pct = Math.round((o.present + o.late) / Math.max(1, o.present + o.late + o.absent) * 100);
            s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">' + esc(S().monthName(m).split(' ')[0].slice(0, 3)) + ' · ' + pct + '%</text>';
        });
        return s + '</svg>';
    }

    // ── «Главная» ──
    async function home(el, user, profile) {
        if (!el) return; css();
        el.innerHTML = '<div class="spg-empty">' + esc(X('Загрузка…')) + '</div>';
        var d = await load(user, profile);
        var next = S().upcoming(d.groups, d.schedule, 14)[0];
        var at = attStats(d), avg = mean(d.grades.map(function (g) { return g.score; })), b = bands(d), lastBand = b.length ? b[b.length - 1] : null;
        var nextHtml = '';
        if (next) {
            var dt = new Date(next.date + 'T12:00:00'), loc = window.starthLocale ? window.starthLocale() : 'ru-RU';
            var warned = d.absences.find(function (a) { return a.id === S().absenceId(next, user.uid); });
            var link = next.room ? 'video-lesson?room=' + encodeURIComponent(next.room) + (next.groupId ? '&group=' + encodeURIComponent(next.groupId) : '') : '';
            nextHtml = '<div class="spg-next"><div class="cal"><b>' + dt.getDate() + '</b><small>' + esc(dt.toLocaleDateString(loc, { month: 'short' })) + '</small></div>' +
                '<div><div class="lbl">' + esc(X('Следующий урок')) + '</div><h3>' + esc(next.title) + '</h3><p>' + esc(dt.toLocaleDateString(loc, { weekday: 'long' })) + ', ' + esc(next.time) + (next.teacherName ? ' · ' + esc(next.teacherName) : '') +
                (warned ? ' · <span style="color:#E3B04B">' + esc(X('вы предупредили, что не придёте')) + '</span>' : '') + '</p></div>' +
                '<div class="acts">' + (link ? '<a class="btn-primary" href="' + link + '">' + esc(X('Войти в урок')) + '</a>' : '') +
                (warned ? '' : '<button class="ghost" type="button" data-abs>' + esc(X('Не смогу прийти')) + '</button>') + '</div></div>';
        } else nextHtml = '<div class="spg-card"><h3>' + esc(X('Уроков пока нет')) + '</h3><p class="sub">' + esc(X('Когда куратор добавит вас в группу или назначит урок, он появится здесь.')) + '</p><a class="btn-primary" href="./?trial=1">' + esc(X('Записаться на пробный урок')) + '</a></div>';
        var last = d.grades.slice(-4).reverse().map(function (g) {
            return '<div class="spg-g"><span class="spg-m ' + cls(g.score) + '">' + fmtS(g.score) + '</span><div><b>' + esc(g.type || X('Оценка')) + '</b><small>' + esc(fmtD(g.date)) + (g.comment ? ' · ' + esc(g.comment) : '') + '</small></div><span></span></div>';
        }).join('') || '<div class="spg-empty">' + esc(X('Оценок пока нет — учитель поставит их после урока.')) + '</div>';
        el.innerHTML = nextHtml + tilesHtml(avg, at, d, lastBand) +
            '<div class="spg-quick"><button type="button" data-go="progress">' + (window.Icons ? Icons.svg('chart') : '') + ' ' + esc(X('Мой прогресс')) + '</button><button type="button" data-go="lessons">' + (window.Icons ? Icons.svg('calendar') : '') + ' ' + esc(X('Мои уроки')) + '</button><button type="button" data-go="speaking">' + (window.Icons ? Icons.svg('mic') : '') + ' ' + esc(X('Speaking с ИИ')) + '</button><button type="button" data-go="tests">' + (window.Icons ? Icons.svg('note') : '') + ' ' + esc(X('Тесты')) + '</button><button type="button" data-go="bonus">' + (window.Icons ? Icons.svg('gift') : '') + ' ' + esc(X('Пригласить друга')) + '</button></div>' +
            '<div class="spg-card"><h3>' + esc(X('Последние оценки')) + '</h3>' + last + '</div>';
        el.querySelectorAll('[data-go]').forEach(function (bt) { bt.onclick = function () { window.Cabinet && Cabinet.go(bt.getAttribute('data-go')); }; });
        var ab = el.querySelector('[data-abs]');
        if (ab) ab.onclick = function () { window.StarthAbsence.openModal(next, user, profile, function () { cache = null; home(el, user, profile); }); };
    }
    function tilesHtml(avg, at, d, lastBand) {
        return '<div class="spg-tiles">' +
            '<div class="spg-tile"><div class="t">' + esc(X('Средний балл')) + '</div><div class="v ' + cls(avg) + '">' + fmtS(avg) + '</div><small>' + d.grades.length + ' ' + esc(X('оценок из 10')) + '</small></div>' +
            '<div class="spg-tile"><div class="t">' + esc(X('Посещаемость')) + '</div><div class="v ' + (at.pct == null ? '' : at.pct >= 85 ? 'good' : at.pct >= 60 ? 'mid' : 'low') + '">' + (at.pct == null ? '—' : at.pct + '%') + '</div><small>' + (at.pr + at.lt) + ' ' + esc(X('из')) + ' ' + at.tot + ' ' + esc(X('уроков')) + '</small></div>' +
            '<div class="spg-tile"><div class="t">' + esc(X('Пропуски')) + '</div><div class="v">' + at.ab + '</div><small>' + d.absences.filter(function (a) { return a.excused; }).length + ' ' + esc(X('с предупреждением')) + '</small></div>' +
            '<div class="spg-tile"><div class="t">Mock IELTS</div><div class="v">' + (lastBand ? fmtS(lastBand.band) : '—') + '</div><small>' + esc(lastBand ? X('последний результат') + ' · ' + lastBand.skill : X('пройдите mock-тест')) + '</small></div>' +
        '</div>';
    }

    // ── «Мой прогресс» ──
    async function progress(el, user, profile) {
        if (!el) return; css();
        el.innerHTML = '<div class="spg-empty">' + esc(X('Загрузка…')) + '</div>';
        var d = await load(user, profile), at = attStats(d), avg = mean(d.grades.map(function (g) { return g.score; })), b = bands(d);
        var gid = '';
        var draw = function () {
            var grades = d.grades.filter(function (g) { return !gid || g.groupId === gid; });
            var pts = grades.map(function (g) { return { x: fmtD(g.date), y: g.score, color: COL[cls(g.score)], title: fmtD(g.date) + ' · ' + (g.type || '') + ' · ' + fmtS(g.score) + (g.comment ? ' — ' + g.comment : '') }; });
            var first = mean(grades.slice(0, 3).map(function (g) { return g.score; })), lastA = mean(grades.slice(-3).map(function (g) { return g.score; }));
            var trend = grades.length >= 4 ? lastA - first : null;
            var months = Object.keys(at.byMonth).sort().slice(-6);
            var skills = { listening: '#4a6fc0', reading: '#2e9a43', writing: '#c98a12' };
            var bp = b.map(function (x) { var dt = x.ts ? new Date(x.ts) : null; return { x: dt ? String(dt.getDate()).padStart(2, '0') + '.' + String(dt.getMonth() + 1).padStart(2, '0') : '', y: x.band, key: x.skill, color: skills[x.skill] || 'var(--accent)', title: x.skill + ' · ' + x.band + ' · ' + x.title }; });
            el.innerHTML = tilesHtml(avg, at, d, b.length ? b[b.length - 1] : null) +
                '<div class="spg-card"><div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center"><div><h3>' + esc(X('Оценки по времени')) + '</h3><p class="sub">' +
                    (trend == null ? esc(X('Линия — ваши оценки, пунктир — средняя за последние 3.')) : trend >= 0.3 ? esc(X('Оценки растут:')) + ' +' + fmtS(trend) : trend <= -0.3 ? esc(X('Оценки снижаются:')) + ' ' + fmtS(trend) : esc(X('Оценки стабильные'))) + '</p></div>' +
                    (d.groups.length > 1 ? '<select class="spg-sel" id="spGroup"><option value="">' + esc(X('Все группы')) + '</option>' + d.groups.map(function (g) { return '<option value="' + esc(g.id) + '"' + (gid === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</select>' : '') + '</div>' +
                    lineChart(pts, { trend: true, grid: [0, 5, 8, 10], label: X('Оценки по времени'), empty: X('Оценок пока нет — учитель поставит их после урока.') }) +
                    '<div class="spg-legend"><span><i style="background:#2e9a43"></i>8–10</span><span><i style="background:#c98a12"></i>5–7.5</span><span><i style="background:#d64545"></i>' + esc(X('ниже 5')) + '</span></div></div>' +
                '<div class="spg-cols">' +
                    '<div class="spg-card"><h3>' + esc(X('Посещаемость по месяцам')) + '</h3><p class="sub">' + esc(X('Сколько уроков вы посетили, опоздали и пропустили.')) + '</p>' + barChart(months, at.byMonth) +
                        '<div class="spg-legend"><span><i style="background:#2e9a43"></i>' + esc(X('Был')) + '</span><span><i style="background:#c98a12"></i>' + esc(X('Опоздал')) + '</span><span><i style="background:#d64545"></i>' + esc(X('Не был')) + '</span></div></div>' +
                    '<div class="spg-card"><h3>' + esc(X('Mock-тесты IELTS')) + '</h3><p class="sub">' + esc(X('Band по Listening, Reading и Writing.')) + '</p>' +
                        lineChart(bp, { min: 0, max: 9, grid: [0, 4.5, 6.5, 9], series: Object.keys(skills).map(function (k) { return { key: k, color: skills[k] }; }), label: 'Mock IELTS', empty: X('Пройдите mock-тест — результат появится здесь.') }) +
                        '<div class="spg-legend">' + Object.keys(skills).map(function (k) { return '<span><i style="background:' + skills[k] + '"></i>' + k[0].toUpperCase() + k.slice(1) + '</span>'; }).join('') + '</div>' +
                        '<a class="tc-btn" style="margin-top:.6rem;display:inline-block" href="mock-exam">' + esc(X('Пройти mock-тест')) + '</a></div>' +
                '</div>';
            var sel = el.querySelector('#spGroup'); if (sel) sel.onchange = function () { gid = sel.value; draw(); };
        };
        draw();
    }

    window.StudentProgress = { home: home, progress: progress, _reset: function () { cache = null; } };
})();
