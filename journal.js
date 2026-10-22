/* TheStarth — «Журнал»: every student of every group with all grades, attendance and progress.
 *   Teacher (dashboard → Журнал): only their own groups.   Admin (admin → Журнал оценок): everything.
 * Reads (no new Firestore rules needed):
 *   groups      { name, subject, teacherUid, teacherName, members:[{uid,nickname,name}], archived }
 *   grades      { groupId, teacherUid, studentNickname, studentUid, score 0-10, type, comment, date }
 *   attendance  { groupId, teacherUid, date, topic, marks:{ nickname: present|late|absent } }
 *   mockResults { uid, skill, band, title, ts }   (optional — shown if readable)
 * Usage: StarthJournal.mount(element, { mode: 'teacher' | 'admin', uid })
 */
(function () {
    'use strict';
    var X = function (m) { return window.X ? window.X(m) : m; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var fmtD = function (iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0].slice(2) : (iso || ''); };
    var fmtS = function (v) { return v == null ? '—' : (Math.round(v * 10) / 10).toString(); };
    var cls = function (v) { return v == null ? 'none' : v >= 8 ? 'good' : v >= 5 ? 'mid' : 'low'; };
    var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
    var daysAgo = function (n) { var d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    var STATUS = { present: 'Был', late: 'Опоздал', absent: 'Не был' };

    var CSS = '' +
        '.jr{--jr-good:#2e9a43;--jr-mid:#c98a12;--jr-low:#d64545}' +
        '.jr-bar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end;background:var(--surface);border:1px solid var(--rule);border-radius:14px;padding:.85rem 1rem;margin-bottom:1rem}' +
        '.jr-bar>div{display:flex;flex-direction:column;gap:.25rem;min-width:0}' +
        '.jr-bar label{font-size:.74rem;font-weight:600;color:var(--ink-soft)}' +
        '.jr-bar input,.jr-bar select{padding:.5rem .65rem;border-radius:9px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);font:inherit;font-size:.9rem;max-width:100%}' +
        '.jr-bar .jr-grow{flex:1 1 200px}.jr-bar .jr-grow input{width:100%}' +
        '.jr-chk{flex-direction:row!important;align-items:center;gap:.4rem!important;font-size:.85rem;color:var(--ink);padding-bottom:.55rem;cursor:pointer}' +
        '.jr-btn{display:inline-flex;align-items:center;gap:.35rem;border:1px solid var(--rule);background:var(--surface);color:var(--ink);border-radius:9px;padding:.5rem .85rem;font:inherit;font-size:.86rem;font-weight:600;cursor:pointer}' +
        '.jr-btn:hover{border-color:var(--accent);color:var(--accent)}' +
        '.jr-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.7rem;margin-bottom:1rem}' +
        '.jr-tile{background:var(--surface);border:1px solid var(--rule);border-radius:14px;padding:.85rem 1rem}' +
        '.jr-tile b{display:block;font-size:1.55rem;font-family:var(--font-heading);line-height:1.15}' +
        '.jr-tile span{font-size:.8rem;color:var(--ink-soft)}' +
        '.jr-tile.warn b{color:var(--jr-low)}' +
        '@media(max-width:700px){.jr-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
        '.jr-table{background:var(--surface);border:1px solid var(--rule);border-radius:14px;overflow:hidden}' +
        '.jr-row{display:grid;grid-template-columns:minmax(150px,1.5fr) minmax(120px,1.2fr) 70px minmax(150px,1.6fr) minmax(120px,1.1fr) 76px 64px 22px;gap:.8rem;align-items:center;padding:.75rem 1rem;border-top:1px solid var(--rule)}' +
        '.jr-row.jr-head{border-top:0;background:var(--paper-alt);font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);padding-top:.6rem;padding-bottom:.6rem}' +
        '.jr-row.jr-item{cursor:pointer;transition:background .12s}.jr-row.jr-item:hover{background:var(--paper)}' +
        '.jr-row.open{background:var(--accent-tint)}' +
        '.jr-name b{display:block;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.jr-name small,.jr-grp small{display:block;color:var(--ink-soft);font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.jr-grp span{display:block;font-size:.88rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.jr-flag{display:inline-block;font-size:.66rem;font-weight:700;border-radius:99px;padding:1px 7px;margin-left:.3rem;vertical-align:middle;background:rgba(214,69,69,.12);color:var(--jr-low)}' +
        '.jr-flag.gray{background:var(--paper-alt);color:var(--ink-soft);border:1px solid var(--rule)}' +
        '.jr-avg{display:inline-grid;place-items:center;min-width:46px;height:32px;padding:0 .4rem;border-radius:9px;font-weight:800;font-size:.95rem}' +
        '.jr-avg.good{background:rgba(46,154,67,.14);color:var(--jr-good)}.jr-avg.mid{background:rgba(201,138,18,.15);color:var(--jr-mid)}.jr-avg.low{background:rgba(214,69,69,.13);color:var(--jr-low)}.jr-avg.none{background:var(--paper-alt);color:var(--ink-soft)}' +
        '.jr-marks{display:flex;gap:3px;flex-wrap:wrap}' +
        '.jr-m{min-width:26px;height:24px;padding:0 4px;border-radius:6px;display:inline-grid;place-items:center;font-size:.76rem;font-weight:700}' +
        '.jr-m.good{background:rgba(46,154,67,.14);color:var(--jr-good)}.jr-m.mid{background:rgba(201,138,18,.15);color:var(--jr-mid)}.jr-m.low{background:rgba(214,69,69,.13);color:var(--jr-low)}' +
        '.jr-att{font-size:.82rem}.jr-att .jr-pbar{height:7px;border-radius:99px;background:var(--paper-alt);overflow:hidden;margin:.2rem 0}' +
        '.jr-att .jr-pbar i{display:block;height:100%;border-radius:99px}' +
        '.jr-att small{color:var(--ink-soft);font-size:.74rem}' +
        '.jr-trend{font-weight:700;font-size:.88rem}.jr-trend.up{color:var(--jr-good)}.jr-trend.down{color:var(--jr-low)}.jr-trend.flat{color:var(--ink-soft)}' +
        '.jr-mock{font-weight:700;font-size:.9rem}.jr-mock small{display:block;font-weight:400;color:var(--ink-soft);font-size:.7rem}' +
        '.jr-caret{color:var(--ink-soft);transition:transform .15s}.jr-row.open .jr-caret{transform:rotate(90deg)}' +
        '.jr-lbl{display:none}' +
        '.jr-detail{border-top:1px solid var(--rule);padding:1rem 1.1rem 1.2rem;background:var(--paper);display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:1.2rem}' +
        '.jr-detail h4{font-size:.8rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);margin:0 0 .55rem}' +
        '.jr-box{background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:.85rem .95rem}' +
        '.jr-chart{width:100%;height:auto;display:block}' +
        '.jr-glist{max-height:300px;overflow:auto;margin-top:.8rem}' +
        '.jr-g{display:grid;grid-template-columns:56px 42px minmax(0,1fr);gap:.6rem;align-items:start;padding:.45rem 0;border-top:1px dashed var(--rule);font-size:.85rem}' +
        '.jr-g:first-child{border-top:0}.jr-g small{color:var(--ink-soft)}' +
        '.jr-days{display:flex;flex-wrap:wrap;gap:4px}' +
        '.jr-day{width:22px;height:22px;border-radius:6px;display:inline-block}' +
        '.jr-day.present{background:var(--jr-good)}.jr-day.late{background:var(--jr-mid)}.jr-day.absent{background:var(--jr-low)}' +
        '.jr-legend{display:flex;gap:.8rem;flex-wrap:wrap;font-size:.75rem;color:var(--ink-soft);margin-top:.55rem}.jr-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}' +
        '.jr-empty{color:var(--ink-soft);text-align:center;padding:2.2rem 1rem;font-size:.92rem}' +
        '@media(max-width:980px){' +
            '.jr-row.jr-head{display:none}' +
            '.jr-row.jr-item{grid-template-columns:1fr 1fr;gap:.55rem 1rem}' +
            '.jr-row.jr-item .jr-name{grid-column:1/-1}.jr-row.jr-item .jr-grp{grid-column:1/-1}' +
            '.jr-row.jr-item .jr-marks-c{grid-column:1/-1;order:9}.jr-caret{display:none}' +
            '.jr-row.jr-item>:nth-child(3){order:3}.jr-row.jr-item>:nth-child(5){order:4}.jr-row.jr-item>:nth-child(6){order:5}.jr-row.jr-item>:nth-child(7){order:6}.jr-row.jr-item>:nth-child(1){order:1}.jr-row.jr-item>:nth-child(2){order:2}' +
            '.jr-lbl{display:block;font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:.15rem}' +
            '.jr-detail{grid-template-columns:1fr}' +
        '}';

    function injectCss() {
        if (document.getElementById('jr-style')) return;
        var st = document.createElement('style'); st.id = 'jr-style'; st.textContent = CSS; document.head.appendChild(st);
    }

    async function getAll(q) { var s = await q.get(); var out = []; s.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); }); return out; }

    async function loadData(opt) {
        var col = function (n) { return db.collection(n); };
        var groups, grades, att;
        if (opt.mode === 'admin') {
            var r = await Promise.all([getAll(col('groups')), getAll(col('grades')), getAll(col('attendance'))]);
            groups = r[0]; grades = r[1]; att = r[2];
        } else {
            var r2 = await Promise.all([
                getAll(col('groups').where('teacherUid', '==', opt.uid)),
                getAll(col('grades').where('teacherUid', '==', opt.uid)),
                getAll(col('attendance').where('teacherUid', '==', opt.uid))
            ]);
            groups = r2[0]; grades = r2[1]; att = r2[2];
        }
        // Mock results of these students (optional; teachers and admins may read them).
        var mocks = {};
        try {
            var uids = {};
            groups.forEach(function (g) { (g.memberUids || []).forEach(function (u) { uids[u] = 1; }); });
            var list = Object.keys(uids);
            for (var i = 0; i < list.length; i += 10) {
                var part = await getAll(col('mockResults').where('uid', 'in', list.slice(i, i + 10)));
                part.forEach(function (m) { (mocks[m.uid] = mocks[m.uid] || []).push(m); });
            }
            Object.keys(mocks).forEach(function (u) { mocks[u].sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); }); });
        } catch (e) { mocks = {}; }
        return { groups: groups, grades: grades, att: att, mocks: mocks };
    }

    /* One row per (group × student). Students who left a group but have grades there stay in the journal. */
    function buildRows(data, period, showArchived) {
        var from = period ? daysAgo(period) : '';
        var rows = [];
        data.groups.forEach(function (g) {
            if (g.archived && !showArchived) return;
            var gGrades = data.grades.filter(function (x) { return x.groupId === g.id; });
            var gAtt = data.att.filter(function (a) { return a.groupId === g.id; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
            var people = {};
            (g.members || []).forEach(function (m) { if (m && m.nickname) people[m.nickname] = { uid: m.uid, nickname: m.nickname, name: m.name || '', left: false }; });
            gGrades.forEach(function (x) { if (x.studentNickname && !people[x.studentNickname]) people[x.studentNickname] = { uid: x.studentUid, nickname: x.studentNickname, name: '', left: true }; });
            Object.keys(people).forEach(function (nick) {
                var p = people[nick];
                var allG = gGrades.filter(function (x) { return x.studentNickname === nick; })
                    .sort(function (a, b) { return (String(a.date) + (a.createdAt || '')).localeCompare(String(b.date) + (b.createdAt || '')); });
                var gr = from ? allG.filter(function (x) { return String(x.date) >= from; }) : allG;
                var days = gAtt.filter(function (a) { return a.marks && a.marks[nick] && (!from || String(a.date) >= from); })
                    .map(function (a) { return { date: a.date, s: a.marks[nick], topic: a.topic || '' }; });
                var pr = 0, lt = 0, ab = 0;
                days.forEach(function (d) { if (d.s === 'present') pr++; else if (d.s === 'late') lt++; else if (d.s === 'absent') ab++; });
                var tot = pr + lt + ab, attPct = tot ? Math.round((pr + lt) / tot * 100) : null;
                var scores = gr.map(function (x) { return x.score; });
                var avg = mean(scores);
                var trend = null;
                if (scores.length >= 4) {
                    var k = Math.min(3, Math.floor(scores.length / 2));
                    trend = mean(scores.slice(-k)) - mean(scores.slice(-2 * k, -k));
                }
                var lastTwoAbsent = days.length >= 2 && days[days.length - 1].s === 'absent' && days[days.length - 2].s === 'absent';
                var reasons = [];
                if (attPct != null && tot >= 3 && attPct < 60) reasons.push(X('мало ходит'));
                else if (lastTwoAbsent) reasons.push(X('2 пропуска подряд'));
                if (avg != null && scores.length >= 2 && avg < 5) reasons.push(X('низкие оценки'));
                if (trend != null && trend <= -1.5) reasons.push(X('оценки падают'));
                var mk = p.uid && data.mocks[p.uid] ? data.mocks[p.uid] : [];
                rows.push({
                    key: g.id + '|' + nick, group: g, nick: nick, name: p.name, uid: p.uid, left: p.left,
                    grades: gr, allGrades: allG, days: days, pr: pr, lt: lt, ab: ab, attPct: attPct, avg: avg, trend: trend,
                    reasons: reasons, mocks: mk, lastMock: mk.length ? mk[mk.length - 1] : null
                });
            });
        });
        return rows;
    }

    function chartSvg(grades) {
        var W = 520, H = 190, L = 30, R = 22, T = 12, B = 26;
        if (!grades.length) return '<div class="jr-empty" style="padding:1.2rem">' + esc(X('Оценок пока нет.')) + '</div>';
        var n = grades.length, iw = W - L - R, ih = H - T - B;
        var xs = function (i) { return L + (n === 1 ? iw / 2 : i * iw / (n - 1)); };
        var ys = function (v) { return T + ih - (v / 10) * ih; };
        var s = '<svg class="jr-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(X('График оценок')) + '">';
        [0, 5, 8, 10].forEach(function (v) {
            s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ys(v) + '" y2="' + ys(v) + '" stroke="var(--rule)" stroke-width="1"' + (v === 5 || v === 8 ? ' stroke-dasharray="4 4"' : '') + '/>' +
                 '<text x="' + (L - 8) + '" y="' + (ys(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--ink-soft)">' + v + '</text>';
        });
        var pts = grades.map(function (g, i) { return xs(i).toFixed(1) + ',' + ys(g.score).toFixed(1); }).join(' ');
        if (n > 1) {
            s += '<polygon points="' + xs(0).toFixed(1) + ',' + ys(0) + ' ' + pts + ' ' + xs(n - 1).toFixed(1) + ',' + ys(0) + '" fill="var(--accent)" opacity=".08"/>';
            s += '<polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
        }
        var col = { good: 'var(--jr-good)', mid: 'var(--jr-mid)', low: 'var(--jr-low)' };
        grades.forEach(function (g, i) {
            s += '<circle cx="' + xs(i).toFixed(1) + '" cy="' + ys(g.score).toFixed(1) + '" r="4.5" fill="' + col[cls(g.score)] + '" stroke="var(--surface)" stroke-width="2"><title>' + esc(fmtD(g.date) + ' · ' + (g.type || '') + ' · ' + fmtS(g.score)) + '</title></circle>';
        });
        var step = Math.max(1, Math.ceil(n / 7));
        grades.forEach(function (g, i) { if (i % step === 0 || i === n - 1) s += '<text x="' + xs(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">' + esc(fmtD(g.date).slice(0, 5)) + '</text>'; });
        return s + '</svg>';
    }

    function detailHtml(r, admin) {
        var gl = r.grades.slice().reverse().map(function (g) {
            return '<div class="jr-g"><small>' + esc(fmtD(g.date)) + '</small><span class="jr-m ' + cls(g.score) + '">' + esc(fmtS(g.score)) + '</span>' +
                '<div><b style="font-weight:600">' + esc(g.type || X('Оценка')) + '</b>' + (g.comment ? '<br><small>' + esc(g.comment) + '</small>' : '') + '</div></div>';
        }).join('');
        var days = r.days.map(function (d) { return '<span class="jr-day ' + esc(d.s) + '" title="' + esc(fmtD(d.date) + ' — ' + X(STATUS[d.s] || d.s) + (d.topic ? ' · ' + d.topic : '')) + '"></span>'; }).join('');
        var mocks = r.mocks.slice(-6).reverse().map(function (m) {
            var d = m.ts ? new Date(m.ts) : null;
            return '<div class="jr-g"><small>' + (d ? pad(d.getDate()) + '.' + pad(d.getMonth() + 1) : '') + '</small><span class="jr-m mid">' + esc(m.band != null ? m.band : '—') + '</span><div>' + esc(m.title || m.skill || '') + ' <small>' + esc((m.correct != null ? m.correct + '/' + m.total : '')) + '</small></div></div>';
        }).join('');
        return '<div class="jr-detail">' +
            '<div><h4>' + esc(X('Оценки по времени')) + '</h4><div class="jr-box">' + chartSvg(r.grades) +
                (gl ? '<div class="jr-glist">' + gl + '</div>' : '') + '</div></div>' +
            '<div style="display:flex;flex-direction:column;gap:1rem">' +
                '<div><h4>' + esc(X('Посещаемость')) + ' · ' + (r.attPct == null ? '—' : r.attPct + '%') + '</h4><div class="jr-box">' +
                    (days ? '<div class="jr-days">' + days + '</div>' : '<div class="jr-empty" style="padding:.6rem">' + esc(X('Посещаемость ещё не отмечали.')) + '</div>') +
                    '<div class="jr-legend"><span><i style="background:var(--jr-good)"></i>' + esc(X('Был')) + ' ' + r.pr + '</span><span><i style="background:var(--jr-mid)"></i>' + esc(X('Опоздал')) + ' ' + r.lt + '</span><span><i style="background:var(--jr-low)"></i>' + esc(X('Не был')) + ' ' + r.ab + '</span></div>' +
                '</div></div>' +
                (mocks ? '<div><h4>Mock-тесты</h4><div class="jr-box">' + mocks + '</div></div>' : '') +
                '<div class="jr-box" style="font-size:.85rem;line-height:1.6">' +
                    '<b>' + esc(r.name || '@' + r.nick) + '</b> · @' + esc(r.nick) + '<br>' +
                    esc(X('Группа')) + ': ' + esc(r.group.name || '') + (r.group.subject ? ' · ' + esc(r.group.subject) : '') + '<br>' +
                    (admin ? esc(X('Учитель')) + ': ' + esc(r.group.teacherName || '—') + '<br>' : '') +
                    esc(X('Всего оценок')) + ': ' + r.grades.length + ' · ' + esc(X('Средний балл')) + ': ' + fmtS(r.avg) +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function mount(root, opt) {
        if (!root) return;
        injectCss();
        var admin = opt.mode === 'admin';
        var data = null, openKey = null;
        var st = { q: '', group: '', teacher: '', period: 0, sort: 'attention', archived: false };
        root.classList.add('jr');
        root.innerHTML = '<div class="jr-empty">' + esc(X('Загружаю журнал…')) + '</div>';

        function controls() {
            var groups = data.groups.filter(function (g) { return st.archived || !g.archived; })
                .filter(function (g) { return !st.teacher || g.teacherUid === st.teacher; })
                .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ru'); });
            var teachers = {};
            data.groups.forEach(function (g) { if (g.teacherUid) teachers[g.teacherUid] = g.teacherName || g.teacherUid; });
            return '<div class="jr-bar">' +
                '<div class="jr-grow"><label>' + esc(X('Поиск ученика')) + '</label><input type="search" data-k="q" value="' + esc(st.q) + '" placeholder="' + esc(X('Имя или никнейм')) + '"></div>' +
                (admin ? '<div><label>' + esc(X('Учитель')) + '</label><select data-k="teacher"><option value="">' + esc(X('Все учителя')) + '</option>' +
                    Object.keys(teachers).sort(function (a, b) { return String(teachers[a]).localeCompare(String(teachers[b]), 'ru'); }).map(function (u) { return '<option value="' + esc(u) + '"' + (st.teacher === u ? ' selected' : '') + '>' + esc(teachers[u]) + '</option>'; }).join('') + '</select></div>' : '') +
                '<div><label>' + esc(X('Группа')) + '</label><select data-k="group"><option value="">' + esc(X('Все группы')) + '</option>' +
                    groups.map(function (g) { return '<option value="' + esc(g.id) + '"' + (st.group === g.id ? ' selected' : '') + '>' + esc(g.name || '') + (g.archived ? ' (' + X('архив') + ')' : '') + '</option>'; }).join('') + '</select></div>' +
                '<div><label>' + esc(X('Период')) + '</label><select data-k="period">' +
                    [[0, 'Всё время'], [7, '7 дней'], [30, '30 дней'], [90, '3 месяца']].map(function (p) { return '<option value="' + p[0] + '"' + (st.period === p[0] ? ' selected' : '') + '>' + esc(X(p[1])) + '</option>'; }).join('') + '</select></div>' +
                '<div><label>' + esc(X('Порядок')) + '</label><select data-k="sort">' +
                    [['attention', 'Сначала требуют внимания'], ['name', 'По имени'], ['avg', 'Сначала низкий балл'], ['avgdesc', 'Сначала высокий балл'], ['att', 'Сначала мало ходят'], ['group', 'По группе']].map(function (p) { return '<option value="' + p[0] + '"' + (st.sort === p[0] ? ' selected' : '') + '>' + esc(X(p[1])) + '</option>'; }).join('') + '</select></div>' +
                '<label class="jr-chk"><input type="checkbox" data-k="archived"' + (st.archived ? ' checked' : '') + '> ' + esc(X('Архивные группы')) + '</label>' +
                '<button type="button" class="jr-btn" data-act="csv">CSV</button>' +
                '<button type="button" class="jr-btn" data-act="reload" title="' + esc(X('Обновить')) + '">↻</button>' +
            '</div>';
        }

        function filtered() {
            var rows = buildRows(data, st.period, st.archived);
            var q = st.q.trim().toLowerCase().replace(/^@/, '');
            return rows.filter(function (r) {
                if (st.group && r.group.id !== st.group) return false;
                if (st.teacher && r.group.teacherUid !== st.teacher) return false;
                if (q && (String(r.name) + ' ' + r.nick).toLowerCase().indexOf(q) < 0) return false;
                return true;
            }).sort(function (a, b) {
                var nm = function (r) { return (r.name || r.nick).toLowerCase(); };
                if (st.sort === 'name') return nm(a).localeCompare(nm(b), 'ru');
                if (st.sort === 'group') return String(a.group.name).localeCompare(String(b.group.name), 'ru') || nm(a).localeCompare(nm(b), 'ru');
                if (st.sort === 'avg') return (a.avg == null ? 99 : a.avg) - (b.avg == null ? 99 : b.avg);
                if (st.sort === 'avgdesc') return (b.avg == null ? -1 : b.avg) - (a.avg == null ? -1 : a.avg);
                if (st.sort === 'att') return (a.attPct == null ? 999 : a.attPct) - (b.attPct == null ? 999 : b.attPct);
                return (b.reasons.length - a.reasons.length) || (a.left - b.left) || nm(a).localeCompare(nm(b), 'ru');
            });
        }

        function render() {
            var rows = filtered();
            var allScores = [], pr = 0, tot = 0, uniq = {}, warn = 0;
            rows.forEach(function (r) {
                r.grades.forEach(function (g) { allScores.push(g.score); });
                pr += r.pr + r.lt; tot += r.pr + r.lt + r.ab; uniq[r.uid || r.nick] = 1;
                if (r.reasons.length && !r.left) warn++;
            });
            var avgAll = mean(allScores);
            var tiles = '<div class="jr-tiles">' +
                '<div class="jr-tile"><b>' + Object.keys(uniq).length + '</b><span>' + esc(X('учеников')) + '</span></div>' +
                '<div class="jr-tile"><b>' + fmtS(avgAll) + '</b><span>' + esc(X('средний балл')) + ' · ' + allScores.length + ' ' + esc(X('оценок')) + '</span></div>' +
                '<div class="jr-tile"><b>' + (tot ? Math.round(pr / tot * 100) + '%' : '—') + '</b><span>' + esc(X('посещаемость')) + '</span></div>' +
                '<div class="jr-tile' + (warn ? ' warn' : '') + '"><b>' + warn + '</b><span>' + esc(X('требуют внимания')) + '</span></div>' +
            '</div>';
            var head = '<div class="jr-row jr-head"><div>' + esc(X('Ученик')) + '</div><div>' + esc(X('Группа')) + '</div><div>' + esc(X('Ср. балл')) + '</div><div>' + esc(X('Последние оценки')) + '</div><div>' + esc(X('Посещаемость')) + '</div><div>' + esc(X('Динамика')) + '</div><div>Mock</div><div></div></div>';
            var body = rows.map(function (r) {
                var marks = r.grades.slice(-8).map(function (g) { return '<span class="jr-m ' + cls(g.score) + '" title="' + esc(fmtD(g.date) + ' · ' + (g.type || '')) + '">' + esc(fmtS(g.score)) + '</span>'; }).join('');
                var pc = r.attPct, pcol = pc == null ? 'var(--rule)' : pc >= 85 ? 'var(--jr-good)' : pc >= 60 ? 'var(--jr-mid)' : 'var(--jr-low)';
                var tr = r.trend == null ? '<span class="jr-trend flat">—</span>'
                    : r.trend >= 0.3 ? '<span class="jr-trend up">↑ +' + fmtS(r.trend) + '</span>'
                    : r.trend <= -0.3 ? '<span class="jr-trend down">↓ ' + fmtS(r.trend) + '</span>'
                    : '<span class="jr-trend flat">→ 0</span>';
                var flags = (r.left ? '<span class="jr-flag gray">' + esc(X('вышел из группы')) + '</span>' : '') +
                    (!r.left && r.reasons.length ? '<span class="jr-flag" title="' + esc(r.reasons.join(', ')) + '">⚠ ' + esc(r.reasons[0]) + '</span>' : '');
                var isOpen = openKey === r.key;
                return '<div class="jr-row jr-item' + (isOpen ? ' open' : '') + '" data-key="' + esc(r.key) + '" tabindex="0" role="button" aria-expanded="' + isOpen + '">' +
                    '<div class="jr-name"><b>' + esc(r.name || '@' + r.nick) + flags + '</b><small>@' + esc(r.nick) + '</small></div>' +
                    '<div class="jr-grp"><span>' + esc(r.group.name || '') + '</span><small>' + esc(admin ? (r.group.teacherName || '') : (r.group.subject || '')) + '</small></div>' +
                    '<div><span class="jr-lbl">' + esc(X('Ср. балл')) + '</span><span class="jr-avg ' + cls(r.avg) + '">' + fmtS(r.avg) + '</span></div>' +
                    '<div class="jr-marks-c"><span class="jr-lbl">' + esc(X('Последние оценки')) + '</span><div class="jr-marks">' + (marks || '<small style="color:var(--ink-soft)">' + esc(X('нет оценок')) + '</small>') + '</div></div>' +
                    '<div class="jr-att"><span class="jr-lbl">' + esc(X('Посещаемость')) + '</span><b>' + (pc == null ? '—' : pc + '%') + '</b><div class="jr-pbar"><i style="width:' + (pc || 0) + '%;background:' + pcol + '"></i></div><small>' + (r.pr + r.lt + r.ab) + ' ' + esc(X('ур.')) + (r.ab ? ' · ' + r.ab + ' ' + esc(X('пропуск.')) : '') + '</small></div>' +
                    '<div><span class="jr-lbl">' + esc(X('Динамика')) + '</span>' + tr + '</div>' +
                    '<div class="jr-mock"><span class="jr-lbl">Mock</span>' + (r.lastMock ? esc(r.lastMock.band != null ? r.lastMock.band : '—') + '<small>' + esc(r.lastMock.skill || '') + '</small>' : '<small>—</small>') + '</div>' +
                    '<div class="jr-caret">›</div>' +
                '</div>' + (isOpen ? detailHtml(r, admin) : '');
            }).join('');
            var empty = !data.groups.length
                ? (admin ? X('Групп пока нет — учителя создают их в своём кабинете.') : X('У вас пока нет групп. Создайте группу во вкладке «Мои группы» и добавьте учеников.'))
                : X('По этим фильтрам никого нет.');
            root.innerHTML = controls() + tiles + (rows.length ? '<div class="jr-table">' + head + body + '</div>' : '<div class="jr-table"><div class="jr-empty">' + esc(empty) + '</div></div>');
            root._rows = rows;
        }

        function csv() {
            var rows = root._rows || [];
            var out = [['Ученик', 'Никнейм', 'Группа', 'Направление', 'Учитель', 'Средний балл', 'Кол-во оценок', 'Оценки (по порядку)', 'Посещаемость %', 'Был', 'Опоздал', 'Не был', 'Динамика', 'Последний mock', 'Внимание']];
            rows.forEach(function (r) {
                out.push([r.name || '', r.nick, r.group.name || '', r.group.subject || '', r.group.teacherName || '', r.avg == null ? '' : fmtS(r.avg), r.grades.length,
                    r.grades.map(function (g) { return fmtS(g.score); }).join(' '), r.attPct == null ? '' : r.attPct, r.pr, r.lt, r.ab,
                    r.trend == null ? '' : fmtS(r.trend), r.lastMock ? (r.lastMock.band != null ? r.lastMock.band : '') : '', r.left ? 'вышел из группы' : r.reasons.join(', ')]);
            });
            var d = new Date();
            if (window.CsvExport) window.CsvExport.download('zhurnal_' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.csv', out);
        }

        root.addEventListener('input', function (e) {
            var k = e.target.getAttribute && e.target.getAttribute('data-k');
            if (k !== 'q') return;
            st.q = e.target.value;
            clearTimeout(root._t);
            root._t = setTimeout(function () {
                var pos = e.target.selectionStart; render();
                var inp = root.querySelector('[data-k=q]'); if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (x) {} }
            }, 160);
        });
        root.addEventListener('change', function (e) {
            var k = e.target.getAttribute && e.target.getAttribute('data-k');
            if (!k || k === 'q') return;
            if (k === 'archived') st.archived = e.target.checked;
            else if (k === 'period') st.period = parseInt(e.target.value, 10) || 0;
            else st[k] = e.target.value;
            if (k === 'teacher') st.group = '';
            render();
        });
        root.addEventListener('click', function (e) {
            var a = e.target.closest('[data-act]');
            if (a) { if (a.getAttribute('data-act') === 'csv') csv(); else load(); return; }
            var row = e.target.closest('.jr-item');
            if (row) { var k = row.getAttribute('data-key'); openKey = openKey === k ? null : k; render(); var el = root.querySelector('.jr-item.open'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        });
        root.addEventListener('keydown', function (e) {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('jr-item')) { e.preventDefault(); e.target.click(); }
        });

        async function load() {
            root.innerHTML = '<div class="jr-empty">' + esc(X('Загружаю журнал…')) + '</div>';
            try { data = await loadData(opt); render(); }
            catch (err) {
                console.warn(err);
                root.innerHTML = '<div class="jr-empty">' + esc(X('Не удалось загрузить журнал')) + ': ' + esc(err.message) + '</div>';
            }
        }
        load();
        return { reload: load };
    }

    window.StarthJournal = { mount: mount, _buildRows: buildRows };
})();
