/* TheStarth — table exports as real Excel files (.xlsx), built right in the browser (no libraries).
 * The old CSV API is kept so every existing button works:  CsvExport.download(filename, rows)
 * rows = array of arrays (strings / numbers). The first row of a "Группа: …" header and the column header row are bold;
 * the header row is frozen and columns get sensible widths.
 */
(function () {
    'use strict';
    const STATUS = { present: 'Был', late: 'Опоздал', absent: 'Не был' };

    // ── tiny ZIP (store, no compression) ──
    const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    function zip(files) {               // files: [{name, data:Uint8Array}]
        const enc = new TextEncoder(), parts = [], central = []; let off = 0;
        const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
        files.forEach((f) => {
            const name = enc.encode(f.name), crc = crc32(f.data), len = f.data.length;
            const h = new DataView(new ArrayBuffer(30));
            h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
            h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, len, true); h.setUint32(22, len, true);
            h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
            parts.push(new Uint8Array(h.buffer), name, f.data);
            const c = new DataView(new ArrayBuffer(46));
            c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
            c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, len, true); c.setUint32(24, len, true);
            c.setUint16(28, name.length, true); c.setUint32(42, off, true);
            central.push(new Uint8Array(c.buffer), name);
            off += 30 + name.length + len;
        });
        const csize = central.reduce((s, x) => s + x.length, 0);
        const e = new DataView(new ArrayBuffer(22));
        e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
        return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const col = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    const isNum = (v) => typeof v === 'number' && isFinite(v);

    /** rows → .xlsx Blob. opts.headerRow: index of the column-header row (auto-detected if omitted) */
    function toXlsx(rows, opts) {
        opts = opts || {};
        rows = (rows || []).map((r) => (Array.isArray(r) ? r : [r]));
        let head = opts.headerRow;
        if (head == null) head = rows.length > 1 && rows[0].length <= 3 && rows[1].length > rows[0].length ? 1 : 0;
        const ncol = rows.reduce((m, r) => Math.max(m, r.length), 1);
        const widths = new Array(ncol).fill(8);
        rows.forEach((r, ri) => { if (ri < head) return; r.forEach((v, ci) => { const l = String(v == null ? '' : v).length; widths[ci] = Math.min(60, Math.max(widths[ci], l + 2)); }); });
        const sheetRows = rows.map((r, ri) => {
            const bold = ri <= head;
            const cells = r.map((v, ci) => {
                const ref = col(ci) + (ri + 1), st = bold ? ' s="1"' : (ri > head ? ' s="2"' : '');
                if (v == null || v === '') return '';
                if (isNum(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
                return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
            }).join('');
            return `<row r="${ri + 1}">${cells}</row>`;
        }).join('');
        const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${head + 1}" topLeftCell="A${head + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
            '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' +
            `<sheetData>${sheetRows}</sheetData>` +
            (rows.length > head + 1 ? `<autoFilter ref="A${head + 1}:${col(ncol - 1)}${rows.length}"/>` : '') +
            '</worksheet>';
        const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF1B1406"/><name val="Calibri"/></font></fonts>' +
            '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5E9D2"/><bgColor indexed="64"/></patternFill></fill></fills>' +
            '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFDEDACD"/></bottom><diagonal/></border></borders>' +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
            '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs>' +
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
        const sheetName = xml(String(opts.sheet || 'TheStarth').replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31));
        const enc = new TextEncoder();
        const f = (name, s) => ({ name, data: enc.encode(s) });
        return zip([
            f('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
            f('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
            f('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>${rows.length > head + 1 ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName}'!$A$${head + 1}:$${col(ncol - 1)}$${rows.length}</definedName></definedNames>` : ''}</workbook>`),
            f('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
            f('xl/styles.xml', styles),
            f('xl/worksheets/sheet1.xml', sheet)
        ]);
    }

    function download(filename, rows, opts) {
        const name = String(filename || 'export').replace(/\.(csv|xlsx?)$/i, '') + '.xlsx';
        const blob = toXlsx(rows, opts);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        return blob;
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
        download, toXlsx,
        attendance(group, att) { download('poseshaemost_' + safe(group.name), attendanceRows(group, att), { sheet: 'Посещаемость' }); },
        grades(group, grades) { download('ocenki_' + safe(group.name), gradesRows(group, grades), { sheet: 'Оценки' }); },
        attendanceRows, gradesRows
    };
    window.XlsxExport = window.CsvExport;
})();
