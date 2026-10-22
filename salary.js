/* TheStarth — teacher pay (60 / 40) and lesson-day helpers. Shared by the teacher cabinet, the student cabinet and the admin panel.
 *
 * Rule: for every lesson, the teacher earns <share>% (default 40%) of what each student pays for that lesson.
 *   • the student came (Был / Опоздал)                            → paid
 *   • the student did not come and did NOT warn 24 h before      → paid (the place was kept for them)
 *   • the student warned at least 24 h before (absences, excused) → not paid
 *   • a lesson the teacher never marked                          → not paid (attendance = the basis of pay)
 * Price of one lesson for one student depends on the format of the group:
 *   grp5 — group up to 5 · grp — mini-group up to 3 · ind — 1-on-1.  Admin sets the prices (settings/salary) and,
 *   if needed, a group's format (groups.format); otherwise the format follows the number of students.
 *
 * Firestore:
 *   settings/salary          { currency, share, prices:{grp5,grp,ind} }            public read, admin write
 *   absences/{id}            { uid, nickname, name, groupId|scheduleId, teacherUid, date, dateNum, time, lessonAt, excused, via, … }
 *   salaryAdjust/{id}        { teacherUid, month:'YYYY-MM', amount(+/-), note }    bonus / fine
 *   payouts/{uid_YYYY-MM}    { teacherUid, month, amount, paidAt }
 */
(function () {
    'use strict';
    var DEFAULTS = { currency: '$', share: 40, prices: { grp5: 9, grp: 12, ind: 15 } };
    var FORMATS = { grp5: 'Группа до 5', grp: 'Мини-группа до 3', ind: '1-на-1' };
    var DAYN = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var pad = function (n) { return String(n).padStart(2, '0'); };

    function settings(raw) {
        raw = raw || {};
        var p = Object.assign({}, DEFAULTS.prices, raw.prices || {});
        Object.keys(p).forEach(function (k) { p[k] = Number(p[k]) || 0; });
        var share = Number(raw.share); if (!(share >= 0 && share <= 100)) share = DEFAULTS.share;
        return { currency: raw.currency || DEFAULTS.currency, share: share, prices: p };
    }
    async function loadSettings() {
        try { var d = await db.collection('settings').doc('salary').get(); return settings(d.exists ? d.data() : null); }
        catch (e) { return settings(null); }
    }
    function formatOf(g) {
        if (g && FORMATS[g.format]) return g.format;
        var n = ((g && g.members) || []).length;
        return n <= 1 ? 'ind' : n <= 3 ? 'grp' : 'grp5';
    }
    /** what one student pays for one lesson in this group */
    function priceFor(g, st) { if (g && Number(g.priceOverride) > 0) return Number(g.priceOverride); return st.prices[formatOf(g)] || 0; }
    function rateFor(g, st) { return priceFor(g, st) * st.share / 100; }
    function money(v, st) {
        var cur = (st && st.currency) || '$';
        var dec = /\$|usd|€|eur/i.test(cur) ? 2 : 0;
        var n = Math.round((Number(v) || 0) * Math.pow(10, dec)) / Math.pow(10, dec);
        var neg = n < 0, a = Math.abs(n), whole = Math.floor(a + 1e-9), frac = dec ? Math.round((a - whole) * 100) : 0;
        if (frac === 100) { whole++; frac = 0; }
        var s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec && frac ? '.' + String(frac).padStart(2, '0') : '');
        return (neg ? '−' : '') + (cur === '$' ? '$' + s : s + ' ' + cur);
    }

    // ── dates (Tashkent, UTC+5) ──
    function todayStr() { var d = new Date(Date.now() + 5 * 3600000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    function monthOf(date) { return String(date || '').slice(0, 7); }
    function curMonth() { return todayStr().slice(0, 7); }
    function shiftMonth(m, k) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + '-' + pad(mo + 1); }
    function monthName(m, lang) {
        var names = { ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
            uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
            en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
        var l = lang || (window.StarthI18n ? StarthI18n.lang() : 'ru');
        return (names[l] || names.ru)[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
    }
    function dateNum(date) { return +String(date || '').replace(/-/g, '') || 0; }
    function dowOf(date) { var d = new Date(date + 'T12:00:00Z'); return (d.getUTCDay() + 6) % 7; }
    function groupDays(g) {
        if (g && Array.isArray(g.days) && g.days.length) return g.days.map(Number);
        var out = []; String((g && g.scheduleText) || '').split(/[\s,\/;·\-–—]+/).forEach(function (w) { DAYN.forEach(function (n, i) { if (w.slice(0, 2).toLowerCase() === n.toLowerCase() && out.indexOf(i) === -1) out.push(i); }); });
        return out;
    }
    function groupTime(g) { var m = String((g && (g.time || g.scheduleText)) || '').match(/(\d{1,2})[:.](\d{2})/); return m ? pad(m[1]) + ':' + m[2] : ''; }
    /** lesson start as a Date (Tashkent time) */
    function lessonAt(date, time) { return new Date(date + 'T' + (time || '00:00') + ':00+05:00'); }
    function addDays(date, k) { var d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); }

    /** upcoming lessons of a person for N days: [{ key, kind:'group'|'ind', groupId, scheduleId, date, time, title, teacherUid, teacherName, room }] */
    function upcoming(groups, schedule, days, fromMs) {
        var out = [], now = fromMs || Date.now(), today = todayStr();
        for (var i = 0; i < (days || 14); i++) {
            var date = addDays(today, i), dow = dowOf(date);
            (groups || []).forEach(function (g) {
                if (g.archived || groupDays(g).indexOf(dow) === -1) return;
                var t = groupTime(g); if (!t || lessonAt(date, t).getTime() < now) return;
                out.push({ key: g.id + '_' + date, kind: 'group', groupId: g.id, scheduleId: '', date: date, time: t, title: g.name || g.subject || '', teacherUid: g.teacherUid, teacherName: g.teacherName || '', room: g.room || '' });
            });
        }
        (schedule || []).forEach(function (s) {
            if (!s.date || s.status === 'missed' || s.status === 'cancelled') return;
            if (lessonAt(s.date, s.time).getTime() < now || s.date > addDays(today, days || 14)) return;
            out.push({ key: 's_' + s.id + '_' + s.date, kind: 'ind', groupId: '', scheduleId: s.id, date: s.date, time: s.time || '', title: s.subject || 'Индивидуальный урок', teacherUid: s.teacherUid, teacherName: s.teacherName || '', room: s.room || '' });
        });
        return out.sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    }
    function absenceId(l, uid) { return (l.groupId ? l.groupId : 's_' + l.scheduleId) + '_' + l.date + '_' + uid; }

    /** number of lesson days of a group inside a month */
    function lessonDaysInMonth(g, month) {
        var days = groupDays(g); if (!days.length) return 0;
        var n = 0, d = month + '-01';
        while (d.slice(0, 7) === month) { if (days.indexOf(dowOf(d)) !== -1) n++; d = addDays(d, 1); }
        return n;
    }

    /**
     * Earnings of ONE teacher in a month.
     * data: { groups, attendance, schedule, absences, adjust, payout }, st: settings(), month 'YYYY-MM'
     * → { total, earned, adjust, lessons:[…], byGroup:[…], visits, paidVisits, excused, unexcused, attPct, expected, payout }
     */
    function compute(data, st, month) {
        var gMap = {}; (data.groups || []).forEach(function (g) { gMap[g.id] = g; });
        var abs = (data.absences || []).filter(function (a) { return a.excused; });
        var isExcused = function (key, date, uid, nick) {
            return abs.some(function (a) { return (a.groupId === key || ('s_' + a.scheduleId) === key) && a.date === date && ((uid && a.uid === uid) || (nick && a.nickname === nick)); });
        };
        var lessons = [], byGroup = {}, visits = 0, came = 0, paidVisits = 0, excused = 0, unexcused = 0;
        (data.attendance || []).forEach(function (a) {
            if (monthOf(a.date) !== month) return;
            var g = gMap[a.groupId]; if (!g) return;
            var rate = rateFor(g, st), nickToUid = {}, nickToName = {};
            (g.members || []).forEach(function (m) { nickToUid[m.nickname] = m.uid; nickToName[m.nickname] = m.name || '@' + m.nickname; });
            var L = { date: a.date, kind: 'group', groupId: g.id, title: g.name || '', format: formatOf(g), rate: rate, amount: 0, students: [] };
            Object.keys(a.marks || {}).forEach(function (nick) {
                var s = a.marks[nick], uid = nickToUid[nick], row = { nick: nick, name: nickToName[nick] || '@' + nick, mark: s, paid: false, why: '' };
                visits++;
                if (s === 'present' || s === 'late') { row.paid = true; row.why = s === 'late' ? 'опоздал' : 'был'; came++; }
                else if (s === 'absent') {
                    if (isExcused(g.id, a.date, uid, nick)) { row.why = 'предупредил за 24 ч'; excused++; }
                    else { row.paid = true; row.why = 'не предупредил'; unexcused++; }
                }
                if (row.paid) { L.amount += rate; paidVisits++; }
                L.students.push(row);
            });
            lessons.push(L);
            var bg = byGroup[g.id] || (byGroup[g.id] = { groupId: g.id, title: g.name || '', format: formatOf(g), rate: rate, lessons: 0, paidVisits: 0, amount: 0 });
            bg.lessons++; bg.paidVisits += L.students.filter(function (r) { return r.paid; }).length; bg.amount += L.amount;
        });
        (data.schedule || []).forEach(function (s) {
            if (monthOf(s.date) !== month || !(s.status === 'done' || s.status === 'missed')) return;
            var rate = st.prices.ind * st.share / 100, paid = true, why = 'урок проведён';
            visits++;
            if (s.status === 'missed') {
                if (isExcused('s_' + s.id, s.date, '', s.studentNickname)) { paid = false; why = 'предупредил за 24 ч'; excused++; }
                else { why = 'не пришёл, не предупредил'; unexcused++; }
            } else came++;
            if (paid) paidVisits++;
            lessons.push({ date: s.date, kind: 'ind', scheduleId: s.id, title: (s.subject || 'Индивидуальный урок') + ' · @' + (s.studentNickname || ''), format: 'ind', rate: rate, amount: paid ? rate : 0,
                students: [{ nick: s.studentNickname, name: '@' + s.studentNickname, mark: s.status, paid: paid, why: why }] });
            var key = 'ind';
            var bg = byGroup[key] || (byGroup[key] = { groupId: key, title: 'Индивидуальные уроки', format: 'ind', rate: rate, lessons: 0, paidVisits: 0, amount: 0 });
            bg.lessons++; if (paid) { bg.paidVisits++; bg.amount += rate; }
        });
        lessons.sort(function (a, b) { return b.date.localeCompare(a.date); });
        var expected = 0;
        (data.groups || []).forEach(function (g) { if (!g.archived) expected += lessonDaysInMonth(g, month) * ((g.members || []).length) * rateFor(g, st); });
        (data.schedule || []).forEach(function (s) { if (monthOf(s.date) === month && s.status !== 'cancelled') expected += st.prices.ind * st.share / 100; });
        var earned = lessons.reduce(function (s, l) { return s + l.amount; }, 0);
        var adjustList = (data.adjust || []).filter(function (x) { return x.month === month; });
        var adjust = adjustList.reduce(function (s, x) { return s + (Number(x.amount) || 0); }, 0);
        return {
            month: month, earned: earned, adjust: adjust, adjustList: adjustList, total: earned + adjust, lessons: lessons,
            byGroup: Object.keys(byGroup).map(function (k) { return byGroup[k]; }).sort(function (a, b) { return b.amount - a.amount; }),
            visits: visits, came: came, paidVisits: paidVisits, excused: excused, unexcused: unexcused,
            attPct: visits ? Math.round(came / visits * 100) : null, expected: Math.max(expected, earned),
            payout: (data.payouts || []).find(function (p) { return p.month === month; }) || null
        };
    }

    async function getAll(q) { var s = await q.get(); var out = []; s.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); }); return out; }
    /** everything needed for one teacher (as that teacher, or as admin) */
    async function loadTeacherData(uid) {
        var c = function (n) { return db.collection(n); };
        var safe = function (p) { return p.catch(function (e) { console.warn('salary', e); return []; }); };
        var r = await Promise.all([
            safe(getAll(c('groups').where('teacherUid', '==', uid))),
            safe(getAll(c('attendance').where('teacherUid', '==', uid))),
            safe(getAll(c('schedule').where('teacherUid', '==', uid))),
            safe(getAll(c('absences').where('teacherUid', '==', uid))),
            safe(getAll(c('salaryAdjust').where('teacherUid', '==', uid))),
            safe(getAll(c('payouts').where('teacherUid', '==', uid)))
        ]);
        return { groups: r[0], attendance: r[1], schedule: r[2], absences: r[3], adjust: r[4], payouts: r[5] };
    }

    window.StarthSalary = {
        DEFAULTS: DEFAULTS, FORMATS: FORMATS, settings: settings, loadSettings: loadSettings, formatOf: formatOf, priceFor: priceFor, rateFor: rateFor,
        money: money, compute: compute, loadTeacherData: loadTeacherData, getAll: getAll,
        todayStr: todayStr, curMonth: curMonth, shiftMonth: shiftMonth, monthName: monthName, monthOf: monthOf, dateNum: dateNum,
        groupDays: groupDays, groupTime: groupTime, lessonAt: lessonAt, addDays: addDays, upcoming: upcoming, absenceId: absenceId, lessonDaysInMonth: lessonDaysInMonth
    };
})();
