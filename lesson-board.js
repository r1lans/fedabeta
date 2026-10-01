/* TheStarth — lesson room extras: shared whiteboard + group attendance.
 *
 * Whiteboard (Firestore, real time):
 *   lessonBoards/{room}                 { teacherUid, teacherName, allowAll, allowed:[uid], createdAt }
 *   lessonBoards/{room}/strokes/{id}    { uid, sid, color, size, pts:[x,y,...] (0..1), ts }
 *   lessonBoards/{room}/people/{uid}    { name, role, nickname, lastSeen }   (who is in the room)
 * Everybody in the room sees the board. Only the teacher who opened it — and people the teacher
 * switches on — can draw (enforced by Firestore rules, not just by the buttons here).
 *
 * Attendance: when the page is opened with ?group=<id> by that group's teacher, a panel lists the
 * group's students (with "in the room" badges) and saves attendance/{groupId_date}.
 */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const X = (m) => (window.X ? window.X(m) : m);
    const alert = (m) => window.alert(X(m));
    const confirm = (m) => window.confirm(X(m));
    const prompt = (m, d) => window.prompt(X(m), d);
    const ic = (n) => (window.Icons ? window.Icons.svg(n) : '');
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const ST = { present: ['check', 'Был'], late: ['clock', 'Опоздал'], absent: ['x', 'Не был'] };
    const ONLINE_MS = 75000;

    let roomId = '', boardRef = null, me = null, myProfile = null, board = null;
    let canvas = null, ctx = null;
    const strokes = new Map();
    const localIds = new Set();
    let myGestures = [], gesture = null, buf = [], flushTimer = null;
    let color = '#111111', width = 6, eraser = false, drawing = false, textMode = false, textBox = null;
    const FS = { 3: 34, 6: 52, 12: 80 };
    let people = [], unsubs = [], hbTimer = null, uiTimer = null, authUnsub = null;
    let groupDoc = null, attMarks = {}, started = false;
    const gid = new URLSearchParams(location.search).get('group') || '';

    const isOwner = () => !!(me && board && board.teacherUid === me.uid);
    const canWrite = () => !!(me && board && (board.teacherUid === me.uid || board.allowAll === true || (board.allowed || []).indexOf(me.uid) !== -1));
    const isTeacher = () => !!(myProfile && myProfile.role === 'teacher');

    // ── drawing ─────────────────────────────────────────────────────────────
    const tb = new Map();           // text stroke id -> bounds in canvas px (for hit-testing)
    let editingId = '', dragId = '';
    function drawStroke(st, id) {
        const p = st.pts || [];
        if (!p.length) return;
        const W = canvas.width, H = canvas.height;
        if (st.text) {                                   // typed text: one point = top-left corner
            const fs = st.fs || 52;
            ctx.fillStyle = st.color; ctx.textBaseline = 'top';
            ctx.font = '600 ' + fs + 'px "Segoe UI", Arial, sans-serif';
            const lines = String(st.text).split('\n');
            let mw = 0;
            lines.forEach((line, i) => { ctx.fillText(line, p[0] * W, p[1] * H + i * fs * 1.25); mw = Math.max(mw, ctx.measureText(line).width); });
            if (id) tb.set(id, { x: p[0] * W, y: p[1] * H, w: Math.max(mw, fs), h: lines.length * fs * 1.25 });
            return;
        }
        ctx.strokeStyle = st.color; ctx.fillStyle = st.color;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = (st.size || 6) * 1.6;
        if (p.length === 2) {
            ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return;
        }
        ctx.beginPath(); ctx.moveTo(p[0] * W, p[1] * H);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * W, p[i + 1] * H);
        ctx.stroke();
    }
    function redraw() {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        Array.from(strokes.entries()).filter((e) => e[0] !== editingId).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0)).forEach((e) => drawStroke(e[1], e[0]));
    }
    function pos(e) {
        const r = canvas.getBoundingClientRect();
        return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
    }
    const r4 = (n) => Math.round(n * 10000) / 10000;

    function flush(final) {
        if (!gesture || !buf.length) return;
        if (buf.length < 4 && !(final && !gesture.flushed)) return;   // only a start point so far
        const pts = buf.slice();
        buf = final ? [] : pts.slice(-2);                               // next chunk starts where this one ended
        const ref = boardRef.collection('strokes').doc();
        localIds.add(ref.id);
        gesture.ids.push(ref.id); gesture.flushed = true;
        const st = { uid: me.uid, sid: gesture.sid, color: gesture.color, size: gesture.size, pts, ts: Date.now() };
        ref.set(st).catch((err) => { console.warn('Board write failed', err); setStatus('Не удалось отправить штрих — возможно, доступ к доске отозван.', ''); });
    }
    function pointerDown(e) {
        if (!canWrite()) return;
        if (textMode) return textDown(e);
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        drawing = true;
        const c = eraser ? '#ffffff' : color, s = eraser ? width * 4 : width;
        gesture = { sid: Date.now() + '-' + Math.random().toString(36).slice(2, 7), color: c, size: s, ids: [], flushed: false };
        const [x, y] = pos(e);
        buf = [r4(x), r4(y)];
        gesture.last = [x, y];
        clearTimeout(flushTimer);
        flushTimer = setInterval(() => flush(false), 350);
    }
    function pointerMove(e) {
        if (textMode) return textMove(e);
        if (!drawing) return;
        e.preventDefault();
        const [x, y] = pos(e);
        const [lx, ly] = gesture.last;
        // draw locally right away
        ctx.strokeStyle = gesture.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = gesture.size * 1.6;
        ctx.beginPath(); ctx.moveTo(lx * canvas.width, ly * canvas.height); ctx.lineTo(x * canvas.width, y * canvas.height); ctx.stroke();
        gesture.last = [x, y];
        buf.push(r4(x), r4(y));
        if (buf.length >= 120) flush(false);
    }
    function pointerUp(e) {
        if (textMode) return textUp(e);
        if (!drawing) return;
        drawing = false;
        clearInterval(flushTimer);
        if (buf.length === 2 && !gesture.flushed) {                      // a tap → a dot
            ctx.fillStyle = gesture.color; ctx.beginPath(); ctx.arc(buf[0] * canvas.width, buf[1] * canvas.height, gesture.size * 0.8, 0, Math.PI * 2); ctx.fill();
        }
        flush(true);
        if (gesture && gesture.ids.length) { myGestures.push({ sid: gesture.sid, ids: gesture.ids }); if (myGestures.length > 30) myGestures.shift(); }
        gesture = null; buf = [];
    }

    // ── typed text: appears for everybody while it is being typed, can be dragged and re-edited ──
    let syncTimer = null, dragState = null, dragTimer = 0;
    const canEdit = (st) => !!(st && me && (st.uid === me.uid || isOwner()));
    const px = (e) => { const [x, y] = pos(e); return [x * canvas.width, y * canvas.height]; };
    function hitText(e) {
        const [cx, cy] = px(e);
        const ids = Array.from(strokes.entries()).filter((en) => en[1].text && tb.has(en[0]) && canEdit(en[1])).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
        for (const [id] of ids) { const r = tb.get(id); if (cx >= r.x - 6 && cx <= r.x + r.w + 6 && cy >= r.y - 6 && cy <= r.y + r.h + 6) return id; }
        return '';
    }
    function writeText(final) {
        if (!textBox) return;
        const text = textBox.ta.value.slice(0, 300);
        if (!text.trim()) {
            if (textBox.id && final) { const id = textBox.id; boardRef.collection('strokes').doc(id).delete().catch(() => {}); strokes.delete(id); tb.delete(id); }
            return;
        }
        if (!textBox.id) {
            const ref = boardRef.collection('strokes').doc();
            textBox.id = ref.id; localIds.add(ref.id);
            const st = { uid: me.uid, sid: Date.now() + '-t' + Math.random().toString(36).slice(2, 6), color: textBox.color, size: width,
                pts: [r4(textBox.x), r4(textBox.y)], text, fs: textBox.fs, ts: Date.now() };
            strokes.set(ref.id, st);
            myGestures.push({ sid: st.sid, ids: [ref.id] }); if (myGestures.length > 30) myGestures.shift();
            ref.set(st).catch((err) => { console.warn('Board write failed', err); setStatus('Не удалось отправить текст — возможно, доступ к доске отозван.', ''); });
        } else {
            const st = strokes.get(textBox.id); if (st) st.text = text;
            boardRef.collection('strokes').doc(textBox.id).update({ text }).catch((err) => console.warn('text update', err));
        }
    }
    function closeTextBox(commit) {
        if (!textBox) return;
        clearTimeout(syncTimer);
        if (commit !== false) writeText(true);
        else if (textBox.id && textBox.isNew) { const id = textBox.id; boardRef.collection('strokes').doc(id).delete().catch(() => {}); strokes.delete(id); tb.delete(id); }
        textBox.ta.remove(); textBox = null; editingId = '';
        redraw();
    }
    function openTextBox(x, y, id) {
        if (!canWrite() || !textMode) return;
        closeTextBox(true);
        const st = id ? strokes.get(id) : null;
        const r = canvas.getBoundingClientRect();
        const fs = st ? (st.fs || 52) : (FS[width] || 52), scale = r.width / canvas.width, col = st ? st.color : color;
        if (st) { x = st.pts[0]; y = st.pts[1]; }
        const ta = document.createElement('textarea');
        ta.className = 'bd-textbox'; ta.rows = 1; ta.maxLength = 300; ta.placeholder = X('Печатайте…');
        ta.value = st ? st.text : '';
        ta.style.cssText = 'left:' + (x * 100) + '%;top:' + (y * 100) + '%;color:' + col + ';font-size:' + Math.max(12, fs * scale) + 'px;max-width:' + Math.max(80, (1 - x) * r.width - 4) + 'px';
        const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.style.width = Math.min(Math.max(80, (1 - x) * r.width - 4), Math.max(80, ta.value.split('\n').reduce((m, l) => Math.max(m, l.length), 0) * fs * scale * 0.62 + 24)) + 'px'; };
        ta.addEventListener('input', () => { fit(); clearTimeout(syncTimer); syncTimer = setTimeout(() => writeText(false), 250); });   // others see the text while you type
        ta.addEventListener('keydown', (k) => {
            if (k.key === 'Escape') { k.preventDefault(); closeTextBox(true); }
            else if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); closeTextBox(true); }
        });
        ta.addEventListener('blur', () => setTimeout(() => { if (textBox && textBox.ta === ta) closeTextBox(true); }, 120));
        canvas.parentElement.appendChild(ta);
        textBox = { ta, id: id || '', isNew: !id, x, y, fs, color: col };
        editingId = id || '';
        if (id) redraw();
        fit(); setTimeout(() => { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }, 0);
    }
    // pointer handling while the Text tool is on: tap empty = new text, tap text = edit, drag text = move
    function textDown(e) {
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        const id = hitText(e), [x, y] = pos(e);
        dragState = { id, sx: x, sy: y, moved: false, orig: id ? strokes.get(id).pts.slice() : null, x, y };
    }
    function textMove(e) {
        if (!dragState || !dragState.id) return;
        const [x, y] = pos(e), r = canvas.getBoundingClientRect();
        if (!dragState.moved && Math.hypot((x - dragState.sx) * r.width, (y - dragState.sy) * r.height) < 5) return;
        e.preventDefault();
        if (!dragState.moved) { dragState.moved = true; dragId = dragState.id; closeTextBox(true); }
        const st = strokes.get(dragState.id); if (!st) return;
        st.pts = [r4(Math.min(1, Math.max(0, dragState.orig[0] + x - dragState.sx))), r4(Math.min(1, Math.max(0, dragState.orig[1] + y - dragState.sy)))];
        redraw();
        const now = Date.now();
        if (now - dragTimer > 120) { dragTimer = now; boardRef.collection('strokes').doc(dragState.id).update({ pts: st.pts }).catch(() => {}); }
    }
    function textUp(e) {
        if (!dragState) return;
        const d = dragState; dragState = null;
        if (d.moved) {
            const st = strokes.get(d.id);
            if (st) { st.ts = Date.now(); boardRef.collection('strokes').doc(d.id).update({ pts: st.pts, ts: st.ts }).catch(() => {}); }
            dragId = ''; redraw();
        } else if (d.id) openTextBox(0, 0, d.id);
        else openTextBox(d.x, d.y, '');
    }

    async function undo() {
        const g = myGestures.pop();
        if (!g) return;
        try { const b = db.batch(); g.ids.forEach((id) => b.delete(boardRef.collection('strokes').doc(id))); await b.commit(); }
        catch (err) { console.warn(err); }
    }
    async function clearBoard() {
        if (!isOwner() || !confirm('Стереть всю доску для всех?')) return;
        try {
            for (let i = 0; i < 50; i++) {
                const snap = await boardRef.collection('strokes').limit(400).get();
                if (snap.empty) break;
                const b = db.batch(); snap.forEach((d) => b.delete(d.ref)); await b.commit();
            }
        } catch (err) { alert('Не удалось очистить: ' + err.message); }
    }

    // ── UI state ────────────────────────────────────────────────────────────
    function setStatus(text, cls) { const e = $('bd-status'); if (e) { e.textContent = text; e.className = 'bd-status' + (cls ? ' ' + cls : ''); } }
    function updateUI() {
        if (!canvas) return;
        const w = canWrite(), owner = isOwner();
        canvas.classList.toggle('can-write', w);
        $('bd-tools').style.display = w ? 'flex' : 'none';
        $('bd-clear').style.display = owner ? '' : 'none';
        $('bd-people').style.display = owner ? 'block' : 'none';
        $('bd-lock').style.display = w ? 'none' : 'block';
        if (!board) setStatus(isTeacher() ? 'Открываю доску…' : 'Учитель ещё не открыл доску.', '');
        else if (owner) setStatus('Вы ведёте доску — пишете вы; остальным можно дать доступ ниже.', 'on');
        else if (w) setStatus('Учитель разрешил вам писать', 'on');
        else if (!me) setStatus('Только просмотр. Войдите в аккаунт — тогда учитель сможет дать вам доступ.', '');
        else setStatus('Только просмотр. Попросите учителя разрешить вам писать.', '');
        if ($('bd-allow-all')) $('bd-allow-all').checked = !!(board && board.allowAll);
        renderPeople();
    }

    // ── people (presence) + permissions ─────────────────────────────────────
    function heartbeat() {
        if (!me || !boardRef) return;
        const name = [myProfile && myProfile.name, myProfile && myProfile.surname].filter(Boolean).join(' ') || (myProfile && myProfile.nickname) || me.email || 'Участник';
        boardRef.collection('people').doc(me.uid).set({ name, nickname: (myProfile && myProfile.nickname) || '', role: (myProfile && myProfile.role) || 'student', lastSeen: Date.now() })
            .catch((e) => console.warn('presence', e));
    }
    const onlinePeople = () => people.filter((p) => Date.now() - (p.lastSeen || 0) < ONLINE_MS);

    function renderPeople() {
        if (isOwner()) {
            const box = $('bd-people-list');
            const list = onlinePeople().filter((p) => p.uid !== me.uid);
            if (!list.length) box.innerHTML = '<span class="bd-status">Пока никого нет в комнате (видны только вошедшие в аккаунт).</span>';
            else {
                const allowed = (board && board.allowed) || [];
                box.innerHTML = list.map((p) => `<div class="bd-person"><span>${esc(p.name)}${p.nickname ? ' <span class="bd-status">@' + esc(p.nickname) + '</span>' : ''}</span>
                    <label class="bd-switch"><input type="checkbox" data-uid="${esc(p.uid)}" ${allowed.indexOf(p.uid) !== -1 || (board && board.allowAll) ? 'checked' : ''} ${board && board.allowAll ? 'disabled' : ''}> может писать</label></div>`).join('');
                box.querySelectorAll('input[data-uid]').forEach((c) => c.addEventListener('change', () => {
                    const f = firebase.firestore.FieldValue;
                    boardRef.update({ allowed: c.checked ? f.arrayUnion(c.dataset.uid) : f.arrayRemove(c.dataset.uid) }).catch((e) => { alert('Ошибка: ' + e.message); c.checked = !c.checked; });
                }));
            }
        }
        renderAttendance();
    }

    // ── attendance for a group lesson ───────────────────────────────────────
    function renderAttendance() {
        if (!groupDoc) return;
        const rows = $('la-rows');
        if (!rows) return;
        const online = {}; onlinePeople().forEach((p) => { online[p.uid] = true; });
        const members = groupDoc.members || [];
        if (!members.length) { rows.innerHTML = '<span class="bd-status">В группе пока нет учеников — добавьте их в кабинете.</span>'; return; }
        rows.innerHTML = members.map((m) => `<div class="la-row" data-nick="${esc(m.nickname)}">
            <div class="la-name">${esc(m.name || '@' + m.nickname)}${online[m.uid] ? '<span class="la-online">в комнате</span>' : ''}</div>
            <div class="la-seg">${Object.keys(ST).map((k) => `<button type="button" data-s="${k}" class="${attMarks[m.nickname] === k ? 'on-' + k : ''}">${ic(ST[k][0])} ${ST[k][1]}</button>`).join('')}</div></div>`).join('');
        rows.querySelectorAll('.la-row').forEach((row) => row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
            const n = row.dataset.nick;
            if (attMarks[n] === b.dataset.s) delete attMarks[n]; else attMarks[n] = b.dataset.s;
            row.querySelectorAll('button').forEach((x) => { x.className = attMarks[n] === x.dataset.s ? 'on-' + x.dataset.s : ''; });
        })));
    }
    async function initAttendance() {
        if (!gid || !me || !isTeacher()) return;
        try {
            const gd = await db.collection('groups').doc(gid).get();
            if (!gd.exists || gd.data().teacherUid !== me.uid) return;
            groupDoc = Object.assign({ id: gd.id }, gd.data());
            $('la-title').textContent = 'Посещаемость: ' + groupDoc.name + ' · ' + new Date().toLocaleDateString((window.starthLocale ? window.starthLocale() : 'ru-RU'), { day: 'numeric', month: 'long' });
            $('att-toggle-btn').style.display = '';
            try {
                const q = await db.collection('attendance').where('teacherUid', '==', me.uid).where('groupId', '==', gid).where('date', '==', todayStr()).get();
                q.forEach((d) => { attMarks = Object.assign({}, d.data().marks || {}); if (d.data().topic) $('la-topic').value = d.data().topic; });
            } catch (e) { console.warn('today attendance', e); }
            $('la-checkin').onclick = () => {
                const online = {}; onlinePeople().forEach((p) => { online[p.uid] = true; });
                (groupDoc.members || []).forEach((m) => { if (online[m.uid] && !attMarks[m.nickname]) attMarks[m.nickname] = 'present'; });
                renderAttendance();
            };
            $('la-save').onclick = async () => {
                const btn = $('la-save'); btn.disabled = true;
                try {
                    const date = todayStr();
                    await db.collection('attendance').doc(gid + '_' + date).set({
                        groupId: gid, teacherUid: me.uid, date, topic: $('la-topic').value.trim(),
                        marks: attMarks, studentUids: (groupDoc.memberUids || []).slice(), updatedAt: new Date().toISOString()
                    });
                    $('la-msg').textContent = 'Сохранено';
                } catch (e) { $('la-msg').textContent = 'Не удалось сохранить: ' + e.message; }
                btn.disabled = false;
            };
            renderAttendance();
        } catch (e) { console.warn('group', e); }
    }

    // ── start / stop ────────────────────────────────────────────────────────
    async function init() {
        canvas = $('bd-canvas'); ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!me) myProfile = null;
        else { try { const u = await db.collection('users').doc(me.uid).get(); myProfile = u.exists ? u.data() : {}; } catch (e) { myProfile = {}; } }

        boardRef = db.collection('lessonBoards').doc(roomId);
        try {
            const snap = await boardRef.get();
            if (!snap.exists && me && isTeacher()) {
                const tn = [myProfile.name, myProfile.surname].filter(Boolean).join(' ') || myProfile.nickname || 'Преподаватель';
                await boardRef.set({ teacherUid: me.uid, teacherName: tn, allowAll: false, allowed: [], createdAt: new Date().toISOString() });
            }
        } catch (e) { console.warn('board init', e); }

        unsubs.push(boardRef.onSnapshot((d) => { board = d.exists ? d.data() : null; updateUI(); }, (e) => console.warn(e)));
        unsubs.push(boardRef.collection('strokes').orderBy('ts').onSnapshot((snap) => {
            let again = false, foreign = false;
            snap.docChanges().forEach((ch) => {
                if (ch.type === 'added') { strokes.set(ch.doc.id, ch.doc.data()); if (!localIds.has(ch.doc.id)) { if (ch.doc.data().text) again = true; else drawStroke(ch.doc.data(), ch.doc.id); foreign = true; } }
                else if (ch.type === 'modified') { if (ch.doc.id !== editingId && ch.doc.id !== dragId) { strokes.set(ch.doc.id, ch.doc.data()); again = true; foreign = true; } }
                else if (ch.type === 'removed') { strokes.delete(ch.doc.id); tb.delete(ch.doc.id); again = true; }
            });
            if (again) redraw();
            if (foreign && $('board-panel').style.display !== 'block') $('board-toggle-btn').textContent = 'Открыть доску ●';
        }, (e) => console.warn(e)));

        if (me) {
            heartbeat(); hbTimer = setInterval(heartbeat, 25000);
            unsubs.push(boardRef.collection('people').onSnapshot((snap) => { people = []; snap.forEach((d) => people.push(Object.assign({ uid: d.id }, d.data()))); renderPeople(); }, () => {}));
            uiTimer = setInterval(renderPeople, 20000);
        }
        canvas.addEventListener('pointerdown', pointerDown);
        canvas.addEventListener('pointermove', pointerMove);
        canvas.addEventListener('pointerup', pointerUp);
        canvas.addEventListener('pointercancel', pointerUp);
        canvas.addEventListener('pointerleave', (e) => { if (drawing) pointerUp(e); });

        document.querySelectorAll('.bd-color').forEach((b) => b.addEventListener('click', () => {
            color = b.dataset.c; eraser = false; $('bd-eraser').classList.remove('sel');
            document.querySelectorAll('.bd-color').forEach((x) => x.classList.toggle('sel', x === b));
        }));
        document.querySelectorAll('.bd-btn[data-w]').forEach((b) => b.addEventListener('click', () => {
            width = parseInt(b.dataset.w, 10);
            document.querySelectorAll('.bd-btn[data-w]').forEach((x) => x.classList.toggle('sel', x === b));
        }));
        const setText = (on) => { textMode = on; if (!on) closeTextBox(true); $('bd-text').classList.toggle('sel', on); canvas.classList.toggle('text-mode', on); };
        $('bd-text').onclick = () => { if (!textMode) { eraser = false; $('bd-eraser').classList.remove('sel'); } setText(!textMode); };
        $('bd-eraser').onclick = () => { eraser = !eraser; $('bd-eraser').classList.toggle('sel', eraser); if (eraser) setText(false); };
        $('bd-undo').onclick = undo;
        $('bd-clear').onclick = clearBoard;
        $('bd-allow-all').onchange = (e) => boardRef.update({ allowAll: e.target.checked }).catch((er) => { alert('Ошибка: ' + er.message); e.target.checked = !e.target.checked; });

        updateUI();
        initAttendance();
    }

    function start(room) {
        if (started) return;
        started = true;
        roomId = String(room).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
        if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) {
            setStatus('Доска недоступна: сайт ещё не подключён к Firebase.', '');
            return;
        }
        authUnsub = auth.onAuthStateChanged((u) => {
            if (authUnsub) { authUnsub(); authUnsub = null; }   // first answer is enough
            me = u;
            init();
        });
    }
    function stop() {
        started = false;
        unsubs.forEach((u) => { try { u(); } catch (e) {} }); unsubs = [];
        clearInterval(hbTimer); clearInterval(uiTimer); clearInterval(flushTimer);
        if (me && boardRef) boardRef.collection('people').doc(me.uid).delete().catch(() => {});
        closeTextBox(false); strokes.clear(); tb.clear(); localIds.clear(); myGestures = []; people = []; board = null; groupDoc = null; attMarks = {};
        if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    }
    window.addEventListener('beforeunload', () => { if (me && boardRef) boardRef.collection('people').doc(me.uid).delete().catch(() => {}); });

    // End of lesson: wipe the board and take drawing rights back from everybody (teacher only).
    async function reset() {
        if (!boardRef || !isOwner()) return;
        closeTextBox(false);
        try {
            for (let i = 0; i < 60; i++) {
                const snap = await boardRef.collection('strokes').limit(400).get();
                if (snap.empty) break;
                const b = db.batch(); snap.forEach((d) => b.delete(d.ref)); await b.commit();
            }
            await boardRef.update({ allowAll: false, allowed: [] });
        } catch (err) { console.warn('board reset', err); }
        strokes.clear(); tb.clear(); redraw();
    }
    window.LessonBoard = { start, stop, reset };
    window.toggleBoard = function () {
        const p = $('board-panel'), open = p.style.display !== 'block';
        p.style.display = open ? 'block' : 'none';
        $('board-toggle-btn').textContent = open ? 'Скрыть доску' : 'Открыть доску';
        if (open) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    window.toggleAttendance = function () {
        const p = $('lesson-att'), open = p.style.display !== 'block';
        p.style.display = open ? 'block' : 'none';
        if (open) { renderAttendance(); p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    };
})();
