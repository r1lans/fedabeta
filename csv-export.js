/* TheStarth — CSV export of attendance and grades (opens correctly in Excel / Google Sheets). */
(function () {
    'use strict';
    const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const STATUS = { present: 'Был', late: 'Опоздал', absent: 'Не был' };

    function toCsv(rows) { return rows.map((r) => r.map(cell).join(';')).join('\r\n'); }
    function download(filename, rows) {
        const blob = new Blob(['﻿' + 'sep=;\r\n' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    const safe = (s) => String(s || 'group').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);

    // Attendance matrix: one row per student, one column per lesson date.
    function attendanceRows(group, att) {
        const docs = att.slice().sort((a, b) => a.date.localeCompare(b.date));
        const members = group.members || [];
        const head = ['Никнейм', 'Имя'].concat(docs.map((d) => d.date), ['Был', 'Опоздал', 'Не был', 'Посещаемость %']);
        const rows = [['Группа: ' + group.name, group.subject || '', group.teacherName || ''], head];
        members.forEach((m) => {
            let p = 0, l = 0, a = 0;
            const marks = docs.map((d) => { const s = d.marks && d.marks[m.nickname]; if (s === 'present') p++; else if (s === 'late') l++; else if (s === 'absent') a++; return s ? STATUS[s] : ''; });
            const tot = p + l + a;
            rows.push([m.nickname, m.name || ''].concat(marks, [p, l, a, tot ? Math.round((p + l) / tot * 100) : '']));
        });
        return rows;
    }
    function gradesRows(group, grades) {
        const rows = [['Группа: ' + group.name, group.subject || '', group.teacherName || ''], ['Дата', 'Никнейм', 'Имя', 'Тип', 'Оценка (0–10)', 'Комментарий']];
        const name = {}; (group.members || []).forEach((m) => { name[m.nickname] = m.name || ''; });
        grades.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.studentNickname || '').localeCompare(b.studentNickname || ''))
            .forEach((g) => rows.push([g.date, g.studentNickname, name[g.studentNickname] || '', g.type || '', g.score, g.comment || '']));
        return rows;
    }
    window.CsvExport = {
        download,
        attendance(group, att) { download('posesh_' + safe(group.name) + '.csv', attendanceRows(group, att)); },
        grades(group, grades) { download('ocenki_' + safe(group.name) + '.csv', gradesRows(group, grades)); },
        attendanceRows, gradesRows
    };
})();
