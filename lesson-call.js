/* TheStarth — built-in video lesson (Zoom-like): gallery, mic/camera, screen share, raise hand, chat, people,
 * teacher controls (mute everyone / mute or remove one person).
 *
 * How it works: WebRTC peer-to-peer mesh. Video/audio go straight between browsers; the "handshake" messages go
 * through Firestore:
 *   lessonCalls/{room}                  teacher controls: { muteAllAt, lowerHandsAt, forceMute:{uid:ts}, kick:{uid:ts} }
 *   lessonCalls/{room}/peers/{uid}      presence: { name, role, mic, cam, hand, sharing, lastSeen, joinedAt }
 *   lessonCalls/{room}/signals/{id}     { from, to, sid, type:'offer'|'answer'|'ice', data, ts }  (deleted after use)
 *   lessonCalls/{room}/chat/{id}        { uid, name, text, ts }
 * Comfortable for up to ~6 people (each one sends video to every other). See call-config.js for TURN.
 * Public API: LessonCall.start(room, mountEl, opts) / LessonCall.stop().
 */
(function () {
    'use strict';
    const CFG = window.STARTH_CALL_CONFIG || {};
    const X = (m) => (window.X ? window.X(m) : m);
    const ic = (n) => (window.Icons ? window.Icons.svg(n) : '');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
    const rid = () => Math.random().toString(36).slice(2, 10);
    const ONLINE_MS = 70000, HEARTBEAT_MS = 20000;

    let root = null, room = '', me = null, myName = '', myRole = '', isHost = false, opts = {};
    let roomRef = null, joinedAt = 0;
    let local = { stream: null, audio: null, video: null, screen: null };
    let micOn = true, camOn = true, sharing = false, handUp = false;
    let peers = new Map();            // uid -> { uid, pc, sid, init, stream, pendingIce[], remoteSet }
    let docs = new Map();             // uid -> presence doc data
    let unsubs = [], timers = [], joined = false, pinned = '';
    let audioCtx = null, analysers = new Map(), sigQueue = Promise.resolve(), handled = {};
    let chatOpen = false, peopleOpen = false, unread = 0, chatMsgs = [];
    let prejoinStream = null;
    let sess = { sid: '', base: 0, seg: 0, first: 0 };   // lesson session this person is being timed in
    let ending = false, sessStart = 0;
    let rec = null;                   // teacher's local recording state

    const $ = (sel) => root && root.querySelector(sel);
    const iceServers = () => (CFG.STUN_SERVERS || []).concat(CFG.TURN_SERVERS || []);

    // ── media ───────────────────────────────────────────────────────────────
    async function getMedia() {
        const md = navigator.mediaDevices;
        if (!md || !md.getUserMedia) return { stream: null, err: 'nosupport' };
        const vid = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } };
        try { return { stream: await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: vid }) }; }
        catch (e1) {
            try { return { stream: await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }), err: 'novideo' }; }
            catch (e2) {
                try { return { stream: await md.getUserMedia({ video: vid }), err: 'nomic' }; }
                catch (e3) { return { stream: null, err: e1 && e1.name === 'NotAllowedError' ? 'denied' : 'none' }; }
            }
        }
    }
    const trackFor = (kind) => (kind === 'audio' ? local.audio : (sharing && local.screen ? local.screen : local.video));
    function pushTracks() {
        peers.forEach((P) => P.pc.getTransceivers().forEach((t) => {
            const k = t.receiver && t.receiver.track && t.receiver.track.kind; if (!k) return;
            try { if (t.direction !== 'sendrecv') t.direction = 'sendrecv'; } catch (e) {}
            const tr = trackFor(k); if (t.sender) t.sender.replaceTrack(tr || null).catch(() => {});
        }));
        tuneBitrate();
    }
    function tuneBitrate() {
        const n = peers.size, max = n <= 1 ? 1200000 : n <= 3 ? 600000 : 300000;
        peers.forEach((P) => P.pc.getSenders().forEach((s) => {
            if (!s.track || s.track.kind !== 'video' || !s.getParameters) return;
            try { const p = s.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}]; p.encodings[0].maxBitrate = sharing ? 2500000 : max; s.setParameters(p).catch(() => {}); } catch (e) {}
        }));
    }

    // ── signalling ──────────────────────────────────────────────────────────
    function send(to, sid, type, data) {
        return roomRef.collection('signals').add({ from: me.uid, to, sid, type, data: JSON.stringify(data), ts: Date.now() }).catch((e) => console.warn('signal', e));
    }
    function closePeer(uid) {
        const P = peers.get(uid); if (!P) return;
        try { P.pc.ontrack = P.pc.onicecandidate = P.pc.onconnectionstatechange = null; P.pc.close(); } catch (e) {}
        peers.delete(uid); removeAnalyser(uid); renderStage();
    }
    function makePeer(uid, sid, init) {
        const pc = new RTCPeerConnection({ iceServers: iceServers() });
        const P = { uid, pc, sid, init, stream: new MediaStream(), pendingIce: [], remoteSet: false, failTimer: null };
        peers.set(uid, P);
        pc.onicecandidate = (e) => { if (e.candidate) send(uid, P.sid, 'ice', e.candidate.toJSON ? e.candidate.toJSON() : e.candidate); };
        pc.ontrack = (e) => { if (!P.stream.getTracks().includes(e.track)) P.stream.addTrack(e.track); addAnalyser(uid, P.stream); renderStage(); };
        pc.onconnectionstatechange = () => {
            const st = pc.connectionState;
            clearTimeout(P.failTimer);
            if (st === 'failed' || st === 'disconnected') {
                // the lower uid re-dials; give a short disconnect a chance to heal first
                P.failTimer = setTimeout(() => { if (peers.get(uid) === P && pc.connectionState !== 'connected') { closePeer(uid); reconcile(); } }, st === 'failed' ? 500 : 7000);
            }
            renderStage();
        };
        return P;
    }
    async function dial(uid) {
        const P = makePeer(uid, rid() + rid(), true);
        ['audio', 'video'].forEach((kind) => { const t = P.pc.addTransceiver(kind, { direction: 'sendrecv' }); const tr = trackFor(kind); if (tr) t.sender.replaceTrack(tr).catch(() => {}); });
        try {
            const offer = await P.pc.createOffer(); await P.pc.setLocalDescription(offer);
            await send(uid, P.sid, 'offer', { type: offer.type, sdp: offer.sdp });
        } catch (e) { console.warn('offer', e); }
        tuneBitrate();
    }
    async function onSignal(s) {
        const data = JSON.parse(s.data || 'null'); const uid = s.from;
        if (s.type === 'offer') {
            if (me.uid < uid) return;                         // I am the one who dials this person; ignore stray offers
            let P = peers.get(uid);
            if (P && P.sid !== s.sid) { closePeer(uid); P = null; }
            if (!P) P = makePeer(uid, s.sid, false);
            await P.pc.setRemoteDescription(data); P.remoteSet = true;
            P.pc.getTransceivers().forEach((t) => { const k = t.receiver.track.kind; try { t.direction = 'sendrecv'; } catch (e) {} const tr = trackFor(k); if (tr) t.sender.replaceTrack(tr).catch(() => {}); });
            const ans = await P.pc.createAnswer(); await P.pc.setLocalDescription(ans);
            await send(uid, P.sid, 'answer', { type: ans.type, sdp: ans.sdp });
            P.pendingIce.splice(0).forEach((c) => P.pc.addIceCandidate(c).catch(() => {}));
            tuneBitrate();
        } else {
            const P = peers.get(uid);
            if (!P || P.sid !== s.sid) return;
            if (s.type === 'answer') { if (P.pc.signalingState === 'have-local-offer') { await P.pc.setRemoteDescription(data); P.remoteSet = true; P.pendingIce.splice(0).forEach((c) => P.pc.addIceCandidate(c).catch(() => {})); } }
            else if (s.type === 'ice') { if (P.remoteSet) P.pc.addIceCandidate(data).catch(() => {}); else P.pendingIce.push(data); }
        }
    }
    function listenSignals() {
        unsubs.push(roomRef.collection('signals').where('to', '==', me.uid).onSnapshot((snap) => {
            const list = []; snap.forEach((d) => { if (!handled[d.id]) list.push({ id: d.id, ref: d.ref, d: d.data() }); });
            list.sort((a, b) => (a.d.ts || 0) - (b.d.ts || 0));
            list.forEach((x) => {
                handled[x.id] = 1;
                sigQueue = sigQueue.then(() => (Date.now() - (x.d.ts || 0) < 120000 ? onSignal(x.d) : null)).catch((e) => console.warn('signal handling', e)).then(() => x.ref.delete().catch(() => {}));
            });
        }, (e) => console.warn('signals', e)));
    }

    // ── presence & peers ────────────────────────────────────────────────────
    const online = (d) => d && Date.now() - (d.lastSeen || 0) < ONLINE_MS;
    function myDoc() { return { name: myName, role: myRole, mic: micOn && !!local.audio, cam: sharing || (camOn && !!local.video), hand: handUp, sharing, rec: !!rec, lastSeen: Date.now(), joinedAt }; }
    function pushPresence() { if (!joined) return; roomRef.collection('peers').doc(me.uid).set(myDoc(), { merge: true }).catch(() => {}); }
    function reconcile() {
        docs.forEach((d, uid) => {
            if (uid === me.uid) return;
            if (online(d) && !peers.has(uid) && me.uid < uid) dial(uid);
        });
        peers.forEach((P, uid) => { const d = docs.get(uid); if (!d || !online(d)) closePeer(uid); });
        renderStage(); renderPeople();
    }
    function listenPeers() {
        unsubs.push(roomRef.collection('peers').onSnapshot((snap) => {
            docs = new Map(); snap.forEach((d) => docs.set(d.id, d.data()));
            reconcile();
        }, (e) => console.warn('peers', e)));
        timers.push(setInterval(() => { pushPresence(); reconcile(); }, HEARTBEAT_MS));
    }

    // ── teacher controls ────────────────────────────────────────────────────
    function listenRoom() {
        let seen = { mute: joinedAt, hands: joinedAt, fm: 0, kick: 0, fc: 0, camAll: joinedAt };
        unsubs.push(roomRef.onSnapshot((d) => {
            const r = d.exists ? d.data() : {};
            if (r.activeSid && r.activeSid !== sess.sid) { if (myRole === 'teacher') sessStart = r.sessionStart || sessStart; trackStart(r.activeSid); }
            if ((r.endedAt || 0) > joinedAt && !ending && myRole !== 'teacher') { leave(X('Преподаватель завершил урок. Спасибо!'), true); return; }
            if (!isHost) {
                if ((r.muteAllAt || 0) > seen.mute) { seen.mute = r.muteAllAt; if (micOn) setMic(false, true); }
                const fm = (r.forceMute || {})[me.uid] || 0; if (fm > seen.fm && fm > joinedAt) { seen.fm = fm; if (micOn) setMic(false, true); }
                if ((r.camAllAt || 0) > seen.camAll) { seen.camAll = r.camAllAt; if (camOn && local.video) { setCam(false); toastMsg(X('Преподаватель выключил камеры.')); } }
                const fc = (r.forceCam || {})[me.uid] || 0; if (fc > seen.fc && fc > joinedAt) { seen.fc = fc; if (camOn && local.video) { setCam(false); toastMsg(X('Преподаватель выключил вашу камеру.')); } }
                const kk = (r.kick || {})[me.uid] || 0; if (kk > seen.kick && kk > joinedAt) { seen.kick = kk; leave(X('Преподаватель удалил вас из урока.')); return; }
            }
            if ((r.lowerHandsAt || 0) > seen.hands) { seen.hands = r.lowerHandsAt; if (handUp) { handUp = false; pushPresence(); renderBar(); } }
        }, () => {}));
    }
    const hostSet = (patch) => roomRef.set(patch, { merge: true }).catch((e) => alert(X('Не удалось выполнить: ') + e.message));

    // ── chat ────────────────────────────────────────────────────────────────
    function listenChat() {
        unsubs.push(roomRef.collection('chat').orderBy('ts').limit(200).onSnapshot((snap) => {
            const prev = chatMsgs.length; chatMsgs = []; snap.forEach((d) => chatMsgs.push(d.data()));
            chatMsgs = chatMsgs.filter((m) => m.ts >= joinedAt - 3600000);
            if (!chatOpen) unread += Math.max(0, chatMsgs.length - prev); else unread = 0;
            renderChat(); renderBar();
        }, () => {}));
    }

    // ── speaking detection ─────────────────────────────────────────────────
    function addAnalyser(uid, stream) {
        if (!audioCtx || analysers.has(uid) || !stream.getAudioTracks().length) return;
        try {
            const src = audioCtx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())); const an = audioCtx.createAnalyser(); an.fftSize = 512; src.connect(an);
            analysers.set(uid, { an, buf: new Uint8Array(an.frequencyBinCount) });
        } catch (e) {}
    }
    function removeAnalyser(uid) { analysers.delete(uid); }
    function tickSpeaking() {
        let best = '', bestV = 0;
        analysers.forEach((a, uid) => {
            a.an.getByteFrequencyData(a.buf); let s = 0; for (let i = 0; i < a.buf.length; i++) s += a.buf[i]; const v = s / a.buf.length;
            const el = root && root.querySelector('.ct[data-uid="' + uid + '"]'); const on = v > 14;
            if (el) el.classList.toggle('speaking', on);
            if (on && v > bestV) { bestV = v; best = uid; }
        });
    }

    // ── UI ──────────────────────────────────────────────────────────────────
    function build() {
        root.innerHTML = `<div class="call">
            <div class="call-pre" id="call-pre"></div>
            <div class="call-live" id="call-live" hidden>
                <div class="call-main">
                    <div class="call-rec" id="call-rec" hidden></div>
                    <div class="call-wait" id="call-wait" hidden></div>
                    <div class="call-warn" id="call-warn" hidden></div>
                    <div class="call-stage" id="call-stage"></div>
                    <aside class="call-side" id="call-side" hidden></aside>
                </div>
                <div class="call-bar" id="call-bar"></div>
            </div>
        </div>`;
    }
    function tileHTML(uid, d, isMe) {
        const name = (d && d.name) || '…';
        return `<div class="ct ${isMe ? 'me' : ''}" data-uid="${esc(uid)}">
            <video autoplay playsinline ${isMe ? 'muted' : ''}></video>
            <div class="ct-av"><span>${esc(initials(name))}</span></div>
            <div class="ct-tags">${d && d.hand ? `<span class="ct-hand">${ic('hand')}</span>` : ''}${d && d.role === 'teacher' ? `<span class="ct-role">${esc(X('Учитель'))}</span>` : ''}</div>
            <div class="ct-name">${d && d.mic === false ? ic('mic-off') : ''}<span>${esc(name)}${isMe ? ' (' + esc(X('вы')) + ')' : ''}</span></div>
            ${isHost && !isMe ? `<div class="ct-ctl"><button type="button" data-act="mic" title="${esc(X('Выкл. микрофон'))}">${ic('mic-off')}</button><button type="button" data-act="cam" title="${esc(X('Выкл. камеру'))}">${ic('video-off')}</button><button type="button" data-act="kick" class="danger" title="${esc(X('Удалить из урока'))}">${ic('logout')}</button></div>` : ''}
            <button class="ct-pin" type="button" title="${esc(X('Закрепить'))}" aria-label="${esc(X('Закрепить'))}">${ic('pin')}</button>
            <div class="ct-state" hidden></div></div>`;
    }
    function renderStage() {
        const stage = $('#call-stage'); if (!stage || !joined) return;
        const all = [[me.uid, Object.assign(myDoc(), { name: myName }), true]];
        docs.forEach((d, uid) => { if (uid !== me.uid && online(d)) all.push([uid, d, false]); });
        // sort: sharing first, then teacher, then me, then the rest by join time
        const sharer = all.find((x) => x[1].sharing);
        const focus = pinned && all.find((x) => x[0] === pinned) ? pinned : (sharer ? sharer[0] : '');
        // add / remove tiles
        const have = new Set([...stage.querySelectorAll('.ct')].map((e) => e.dataset.uid));
        all.forEach(([uid, d, isMe]) => {
            if (!have.has(uid)) { const w = document.createElement('div'); w.innerHTML = tileHTML(uid, d, isMe).trim(); const el = w.firstChild; stage.appendChild(el);
                el.querySelector('.ct-pin').onclick = (e) => { e.stopPropagation(); pinned = pinned === uid ? '' : uid; renderStage(); };
                el.querySelectorAll('.ct-ctl button').forEach((cb) => cb.onclick = (e) => { e.stopPropagation(); const a = cb.dataset.act;
                    if (a === 'mic') hostSet({ forceMute: { [uid]: Date.now() } }); else if (a === 'cam') hostSet({ forceCam: { [uid]: Date.now() } });
                    else if (a === 'kick' && confirm(X('Удалить участника из урока?'))) hostSet({ kick: { [uid]: Date.now() } }); }); el.ondblclick = () => { pinned = pinned === uid ? '' : uid; renderStage(); }; }
        });
        stage.querySelectorAll('.ct').forEach((el) => { if (!all.some((x) => x[0] === el.dataset.uid)) el.remove(); });
        all.forEach(([uid, d, isMe]) => {
            const el = stage.querySelector('.ct[data-uid="' + uid + '"]'); if (!el) return;
            const v = el.querySelector('video');
            const stream = isMe ? (sharing && local.screenStream ? local.screenStream : local.stream) : (peers.get(uid) || {}).stream;
            if (stream && v.srcObject !== stream) { v.srcObject = stream; const pr = v.play(); if (pr && pr.catch) pr.catch(() => { el.querySelector('.ct-state').hidden = false; el.querySelector('.ct-state').textContent = ''; }); }
            const showVideo = isMe ? (sharing || (camOn && !!local.video)) : (d.cam || d.sharing);
            el.classList.toggle('no-video', !showVideo);
            el.classList.toggle('is-share', !!d.sharing);
            el.classList.toggle('focus', uid === focus);
            el.querySelector('.ct-tags').innerHTML = (d.hand ? `<span class="ct-hand">${ic('hand')}</span>` : '') + (d.role === 'teacher' ? `<span class="ct-role">${esc(X('Учитель'))}</span>` : '');
            el.querySelector('.ct-name').innerHTML = (d.mic === false ? ic('mic-off') : '') + `<span>${esc(d.name || '…')}${isMe ? ' (' + esc(X('вы')) + ')' : ''}</span>`;
            const st = el.querySelector('.ct-state'); const P = peers.get(uid);
            if (!isMe && P && P.pc.connectionState !== 'connected' && P.pc.connectionState !== 'completed') { st.hidden = false; st.textContent = X('Подключение…'); }
            else if (!isMe && st.textContent === X('Подключение…')) { st.hidden = true; st.textContent = ''; }
        });
        stage.dataset.count = String(all.length); stage.classList.toggle('has-focus', !!focus);
        const warn = $('#call-warn'); if (warn) { const big = all.length > (CFG.MAX_COMFORTABLE || 6); warn.hidden = !big; if (big) warn.innerHTML = X('В комнате больше 6 человек — видео может тормозить. Для больших групп включите запасной режим.'); }
        const waitEl = $('#call-wait');
        if (waitEl) { const alone = !isHost && !all.some((x) => !x[2] && x[1].role === 'teacher'); waitEl.hidden = !alone; if (alone) waitEl.textContent = X('Ждём преподавателя — урок начнётся, как только он зайдёт.'); }
        const recEl = $('#call-rec');
        if (recEl) { const anyRec = all.some((x) => x[1].rec); recEl.hidden = !anyRec; if (anyRec) recEl.innerHTML = '<i></i>' + esc(X('Идёт запись урока')); }
        renderPeople();
    }
    function enableAudioPlayback() { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); root.querySelectorAll('video').forEach((v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); }); root.querySelectorAll('.ct-state').forEach((s) => { if (s.textContent === '') s.hidden = true; }); }

    function renderBar() {
        const bar = $('#call-bar'); if (!bar) return;
        const b = (id, icon, label, on, extra) => `<button type="button" class="cb ${on ? 'on' : ''} ${extra || ''}" id="${id}" title="${esc(X(label))}" aria-pressed="${on ? 'true' : 'false'}">${ic(icon)}<span>${esc(X(label))}</span></button>`;
        bar.innerHTML =
            b('cb-mic', micOn && local.audio ? 'mic' : 'mic-off', micOn && local.audio ? 'Микрофон' : 'Микрофон выкл.', !(micOn && local.audio), 'danger-off') +
            b('cb-cam', camOn && local.video ? 'video' : 'video-off', camOn && local.video ? 'Камера' : 'Камера выкл.', !(camOn && local.video), 'danger-off') +
            b('cb-share', 'monitor', sharing ? 'Остановить показ' : 'Показать экран', sharing) +
            b('cb-hand', 'hand', handUp ? 'Опустить руку' : 'Поднять руку', handUp) +
            `<button type="button" class="cb ${chatOpen ? 'on' : ''}" id="cb-chat" title="${esc(X('Чат'))}">${ic('message')}<span>${esc(X('Чат'))}</span>${unread ? `<i class="cb-badge">${unread > 9 ? '9+' : unread}</i>` : ''}</button>` +
            b('cb-people', 'users', 'Участники', peopleOpen) +
            (isHost ? b('cb-muteall', 'mic-off', 'Выключить всем микрофон', false) : '') +
            (isHost && window.MediaRecorder ? b('cb-rec', 'record', rec ? 'Остановить запись' : 'Запись', !!rec, 'rec') : '') +
            (myRole === 'teacher' ? `<button type="button" class="cb endlesson" id="cb-end" title="${esc(X('Закончить урок для всех'))}">${ic('x')}<span>${esc(X('Закончить урок'))}</span></button>` : '') +
            `<button type="button" class="cb leave" id="cb-leave">${ic('logout')}<span>${esc(X(myRole === 'teacher' ? 'Выйти (урок идёт)' : 'Выйти'))}</span></button>`;
        const on = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn; };
        on('cb-mic', () => setMic(!(micOn && local.audio))); on('cb-cam', () => setCam(!(camOn && local.video)));
        on('cb-share', toggleShare); on('cb-hand', () => { handUp = !handUp; pushPresence(); renderBar(); renderStage(); });
        on('cb-chat', () => { chatOpen = !chatOpen; peopleOpen = false; if (chatOpen) unread = 0; renderSide(); renderBar(); }); on('cb-people', () => { peopleOpen = !peopleOpen; chatOpen = false; renderSide(); renderBar(); });
        on('cb-muteall', () => hostSet({ muteAllAt: Date.now() })); on('cb-rec', () => (rec ? stopRec() : startRec())); on('cb-leave', () => leave()); on('cb-end', endLesson);
    }
    function renderSide() {
        const side = $('#call-side'); if (!side) return;
        side.hidden = !(chatOpen || peopleOpen);
        if (chatOpen) {
            side.innerHTML = `<div class="cs-head"><strong>${esc(X('Чат'))}</strong><button type="button" class="cs-x" aria-label="${esc(X('Закрыть'))}">${ic('x')}</button></div>
                <div class="cs-list" id="cs-list"></div>
                <form class="cs-form" id="cs-form"><input type="text" id="cs-input" maxlength="500" autocomplete="off" placeholder="${esc(X('Сообщение…'))}"><button type="submit" class="cs-send" aria-label="${esc(X('Отправить'))}">${ic('send')}</button></form>`;
            $('#cs-form').onsubmit = (e) => { e.preventDefault(); const i = $('#cs-input'); const t = i.value.trim(); if (!t) return; i.value = ''; roomRef.collection('chat').add({ uid: me.uid, name: myName, text: t.slice(0, 500), ts: Date.now() }).catch(() => {}); };
            renderChat();
        } else if (peopleOpen) { side.innerHTML = `<div class="cs-head"><strong>${esc(X('Участники'))}</strong><button type="button" class="cs-x" aria-label="${esc(X('Закрыть'))}">${ic('x')}</button></div><div class="cs-list" id="cs-people"></div>`; renderPeople(); }
        const x = side.querySelector('.cs-x'); if (x) x.onclick = () => { chatOpen = peopleOpen = false; renderSide(); renderBar(); };
    }
    function renderChat() {
        const l = $('#cs-list'); if (!l) return;
        l.innerHTML = chatMsgs.length ? chatMsgs.map((m) => `<div class="cm ${m.uid === me.uid ? 'mine' : ''}"><b>${esc(m.name)}</b><span>${esc(m.text)}</span></div>`).join('') : `<div class="cs-empty">${esc(X('Сообщений пока нет.'))}</div>`;
        l.scrollTop = l.scrollHeight;
    }
    function renderPeople() {
        const l = $('#cs-people'); if (!l) return;
        const rows = [[me.uid, myDoc(), true]]; docs.forEach((d, uid) => { if (uid !== me.uid && online(d)) rows.push([uid, d, false]); });
        l.innerHTML = rows.map(([uid, d, isMe]) => `<div class="cp"><span class="cp-av">${esc(initials(d.name || myName))}</span><span class="cp-name">${esc(isMe ? myName : d.name)}${isMe ? ' (' + esc(X('вы')) + ')' : ''}${d.role === 'teacher' ? ' · ' + esc(X('Учитель')) : ''}</span>
            ${d.hand ? `<span class="cp-ic">${ic('hand')}</span>` : ''}<span class="cp-ic ${d.mic === false ? 'off' : ''}">${ic(d.mic === false ? 'mic-off' : 'mic')}</span><span class="cp-ic ${d.cam ? '' : 'off'}">${ic(d.cam ? 'video' : 'video-off')}</span>
            ${isHost && !isMe ? `<button type="button" class="cp-btn" data-mute="${esc(uid)}">${esc(X('Выкл. микрофон'))}</button><button type="button" class="cp-btn" data-cam="${esc(uid)}">${esc(X('Выкл. камеру'))}</button><button type="button" class="cp-btn danger" data-kick="${esc(uid)}">${esc(X('Удалить'))}</button>` : ''}</div>`).join('') +
            (isHost ? `<div class="cp-foot"><button type="button" class="cp-btn" id="cp-lower">${esc(X('Опустить все руки'))}</button><button type="button" class="cp-btn" id="cp-camall">${esc(X('Выключить все камеры'))}</button></div>` : '');
        l.querySelectorAll('[data-mute]').forEach((b) => b.onclick = () => hostSet({ ['forceMute']: Object.assign({}, { [b.dataset.mute]: Date.now() }) }));
        l.querySelectorAll('[data-kick]').forEach((b) => b.onclick = () => { if (confirm(X('Удалить участника из урока?'))) hostSet({ kick: { [b.dataset.kick]: Date.now() } }); });
        l.querySelectorAll('[data-cam]').forEach((b) => b.onclick = () => hostSet({ forceCam: { [b.dataset.cam]: Date.now() } }));
        const lo = $('#cp-lower'); if (lo) lo.onclick = () => hostSet({ lowerHandsAt: Date.now() });
        const ca = $('#cp-camall'); if (ca) ca.onclick = () => hostSet({ camAllAt: Date.now() });
    }

    // ── actions ─────────────────────────────────────────────────────────────
    function setMic(on, forced) {
        if (!local.audio) { micOn = false; renderBar(); return; }
        micOn = !!on; local.audio.enabled = micOn; pushPresence(); renderBar(); renderStage();
        if (forced) toastMsg(X('Преподаватель выключил ваш микрофон.'));
    }
    async function setCam(on) {
        if (!on) {
            camOn = false; if (local.video) { local.video.stop(); if (local.stream) local.stream.removeTrack(local.video); local.video = null; }
            pushTracks(); pushPresence(); renderBar(); renderStage(); return;
        }
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } } });
            local.video = s.getVideoTracks()[0]; if (!local.stream) local.stream = new MediaStream(); local.stream.addTrack(local.video); camOn = true;
            pushTracks(); pushPresence(); renderBar(); renderStage();
        } catch (e) { toastMsg(X('Не удалось включить камеру. Проверьте разрешения в браузере.')); }
    }
    async function toggleShare() {
        if (sharing) return stopShare();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { toastMsg(X('Ваш браузер не поддерживает показ экрана (на телефонах он обычно недоступен).')); return; }
        try {
            const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } }, audio: false });
            local.screen = s.getVideoTracks()[0]; local.screenStream = new MediaStream([local.screen]); sharing = true; local.screen.onended = stopShare;
            pushTracks(); pushPresence(); renderBar(); renderStage();
        } catch (e) { /* cancelled */ }
    }
    function stopShare() {
        if (!sharing) return; sharing = false; if (local.screen) { local.screen.onended = null; local.screen.stop(); local.screen = null; }
        local.screenStream = null;
        pushTracks(); pushPresence(); renderBar(); renderStage();
    }
    function toastMsg(t) { const w = $('#call-warn'); if (!w) { alert(t); return; } w.hidden = false; w.textContent = t; clearTimeout(toastMsg.t); toastMsg.t = setTimeout(() => renderStage(), 5000); }

    // ── lesson sessions: who was in the lesson, from when to when, for how long ──
    const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + ' ' + X('ч') + ' ' + String(m % 60).padStart(2, '0') + ' ' + X('мин') : m + ' ' + X('мин'); };
    const sessRef = () => db.collection('lessonSessions').doc(sess.sid);
    const timed = () => myRole === 'student' || myRole === 'teacher';
    const spentMs = () => (sess.sid ? sess.base + (Date.now() - sess.seg) : 0);
    function writeAtt() {
        if (!sess.sid || !joined || !me || !timed()) return;
        sessRef().collection('attendees').doc(me.uid).set({ uid: me.uid, name: myName, role: myRole, firstJoin: sess.first, lastSeen: Date.now(), totalMs: spentMs() }, { merge: true }).catch(() => {});
    }
    async function trackStart(sid) {
        if (!sid || sess.sid === sid || !timed()) return;
        sess = { sid, base: 0, seg: Date.now(), first: Date.now() };
        try { const d = await sessRef().collection('attendees').doc(me.uid).get(); if (d.exists) { sess.base = d.data().totalMs || 0; sess.first = d.data().firstJoin || sess.first; } } catch (e) {}
        sess.seg = Date.now(); writeAtt();
    }
    // The teacher who enters the room opens (or continues) today's lesson session.
    async function openSession() {
        if (myRole !== 'teacher') return;
        try {
            const rs = await roomRef.get(); const r = rs.exists ? rs.data() : {};
            if (r.activeSid) {
                const sd = await db.collection('lessonSessions').doc(r.activeSid).get();
                const x = sd.exists ? sd.data() : null;
                if (x && x.teacherUid === me.uid && !x.endedAt && Date.now() - (x.lastSeen || 0) < 3 * 3600 * 1000) { sessStart = x.startedAt; return trackStart(r.activeSid); }
                if (x && x.teacherUid === me.uid && !x.endedAt) await sd.ref.update({ endedAt: x.lastSeen || x.startedAt, status: 'ended', durationMs: Math.max(0, (x.lastSeen || x.startedAt) - x.startedAt) }).catch(() => {});
            }
            const ref = db.collection('lessonSessions').doc();
            sessStart = Date.now();
            await ref.set({ room, teacherUid: me.uid, teacherName: myName, groupId: opts.groupId || '', groupName: opts.groupName || '', startedAt: sessStart, lastSeen: sessStart, endedAt: 0, status: 'live', durationMs: 0, participants: {} });
            await roomRef.set({ activeSid: ref.id, sessionStart: sessStart }, { merge: true });
            await trackStart(ref.id);
        } catch (e) { console.warn('session', e); }
    }
    function sessionBeat() {
        writeAtt();
        if (myRole === 'teacher' && sess.sid) sessRef().update({ lastSeen: Date.now() }).catch(() => {});
    }
    async function endLesson() {
        if (myRole !== 'teacher' || !joined) return;
        if (!confirm(X('Закончить урок для всех? Все участники выйдут, доска и чат будут очищены.'))) return;
        ending = true;
        const card = (h, p) => { if (root) root.innerHTML = `<div class="call"><div class="call-pre"><div class="call-card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div></div></div>`; };
        try {
            if (opts.onBeforeEnd) await opts.onBeforeEnd();
            const sid = sess.sid, endedAt = Date.now(), rr = roomRef;
            writeAtt();
            await rr.set({ endedAt, activeSid: '' }, { merge: true });
            try { const cs = await rr.collection('chat').get(); const b = db.batch(); cs.forEach((d) => b.delete(d.ref)); await b.commit(); } catch (e) {}
            cleanup(); card(X('Сохраняю итоги урока…'), X('Подождите пару секунд.'));
            await new Promise((r) => setTimeout(r, 2500));
            let parts = {}, startedAt = sessStart || endedAt;
            if (sid) {
                try { const sd = await db.collection('lessonSessions').doc(sid).get(); if (sd.exists) startedAt = sd.data().startedAt || startedAt; } catch (e) {}
                try { const as = await db.collection('lessonSessions').doc(sid).collection('attendees').get(); as.forEach((d) => { const a = d.data(); parts[d.id] = { name: a.name || '', role: a.role || '', ms: a.totalMs || 0, first: a.firstJoin || 0, last: a.lastSeen || 0 }; }); } catch (e) {}
                await db.collection('lessonSessions').doc(sid).update({ endedAt, status: 'ended', durationMs: endedAt - startedAt, participants: parts, lastSeen: endedAt }).catch((e) => console.warn(e));
            }
            const hm = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const rows = Object.keys(parts).map((k) => parts[k]).sort((a, b) => (a.role === 'teacher' ? -1 : 0) - (b.role === 'teacher' ? -1 : 0) || b.ms - a.ms)
                .map((a) => `<div class="end-row"><span>${esc(a.name)}${a.role === 'teacher' ? ' · ' + esc(X('Учитель')) : ''}</span><b>${esc(fmtDur(a.ms))}</b></div>`).join('');
            if (root) root.innerHTML = `<div class="call"><div class="call-pre"><div class="call-card"><h3>${esc(X('Урок завершён'))}</h3>
                <p>${esc(hm(startedAt))} – ${esc(hm(endedAt))} · ${esc(fmtDur(endedAt - startedAt))}</p>
                <div class="end-list">${rows}</div><p class="call-hint">${esc(X('Итоги отправлены администратору.'))}</p>
                <button class="btn-primary" type="button" id="end-back">${esc(X('К списку уроков'))}</button></div></div></div>`;
            const bk = $('#end-back'); if (bk) bk.onclick = () => { location.href = 'video-lesson.html'; };
            if (opts.onEnded) opts.onEnded();
        } catch (e) { console.warn(e); card(X('Не удалось завершить урок: '), e.message); }
        ending = false;
    }

    // ── lesson recording (teacher only, saved to the teacher's own device) ──
    function syncRecAudio() {
        if (!rec) return;
        const want = new Map();
        if (local.audio && local.audio.readyState === 'live') want.set('me:' + local.audio.id, local.audio);
        peers.forEach((P, uid) => { if (P.stream) P.stream.getAudioTracks().forEach((t) => want.set(uid + ':' + t.id, t)); });
        want.forEach((t, k) => { if (!rec.srcs.has(k)) { try { const n = rec.actx.createMediaStreamSource(new MediaStream([t])); n.connect(rec.dest); rec.srcs.set(k, n); } catch (e) {} } });
        rec.srcs.forEach((n, k) => { if (!want.has(k)) { try { n.disconnect(); } catch (e) {} rec.srcs.delete(k); } });
    }
    function paintRec() {
        const c = rec.ctx, W = rec.cv.width, H = rec.cv.height;
        c.fillStyle = '#101216'; c.fillRect(0, 0, W, H);
        const tiles = [...root.querySelectorAll('.call-stage .ct')];
        if (!tiles.length) return;
        const focus = tiles.find((t) => t.classList.contains('focus'));
        const list = focus ? [focus] : tiles;
        const cols = Math.ceil(Math.sqrt(list.length)), rows = Math.ceil(list.length / cols);
        const cw = W / cols, ch = H / rows;
        list.forEach((el, i) => {
            const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
            const v = el.querySelector('video'), name = (el.querySelector('.ct-name span') || {}).textContent || '';
            c.save(); c.beginPath(); c.rect(x + 2, y + 2, cw - 4, ch - 4); c.clip();
            if (v && v.videoWidth && !el.classList.contains('no-video')) {
                const sc = (focus ? Math.min : Math.max)(cw / v.videoWidth, ch / v.videoHeight);
                const dw = v.videoWidth * sc, dh = v.videoHeight * sc;
                c.drawImage(v, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh);
            } else {
                c.fillStyle = '#1d2128'; c.fillRect(x, y, cw, ch);
                c.fillStyle = '#d4af37'; c.font = '700 ' + Math.min(cw, ch) * 0.22 + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText(initials(name.replace(/\(.*\)/, '')), x + cw / 2, y + ch / 2);
            }
            c.restore();
            c.fillStyle = 'rgba(0,0,0,.55)'; c.font = '600 18px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
            const tw = c.measureText(name).width + 16; c.fillRect(x + 8, y + ch - 36, tw, 28);
            c.fillStyle = '#fff'; c.fillText(name, x + 16, y + ch - 16);
        });
    }
    function startRec() {
        if (rec || !window.MediaRecorder || !isHost) return;
        if (!confirm(X('Начать запись урока? Все участники увидят отметку «Идёт запись». Файл сохранится на вашем устройстве.'))) return;
        try {
            const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
            const AC = window.AudioContext || window.webkitAudioContext;
            const actx = new AC(); const dest = actx.createMediaStreamDestination();
            const out = cv.captureStream(15); dest.stream.getAudioTracks().forEach((t) => out.addTrack(t));
            const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
            const mr = new MediaRecorder(out, mime ? { mimeType: mime, videoBitsPerSecond: 900000, audioBitsPerSecond: 96000 } : {});
            rec = { cv, ctx: cv.getContext('2d'), actx, dest, srcs: new Map(), mr, chunks: [], mime: mr.mimeType || mime || 'video/webm', t0: Date.now() };
            const chunks = rec.chunks;
            mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
            mr.start(5000);
            rec.paint = setInterval(paintRec, 100);
            rec.audio = setInterval(syncRecAudio, 2000);
            rec.limit = setTimeout(() => { if (rec) { toastMsg(X('Достигнут лимит 2 часа — запись сохранена.')); stopRec(); } }, 2 * 3600 * 1000);
            syncRecAudio(); paintRec();
            pushPresence(); renderBar(); renderStage();
        } catch (e) { rec = null; alert(X('Не удалось начать запись: ') + e.message); renderBar(); }
    }
    function stopRec() {
        if (!rec) return;
        const r = rec; rec = null;
        clearInterval(r.paint); clearInterval(r.audio); clearTimeout(r.limit);
        const finish = () => {
            try { r.actx.close(); } catch (e) {}
            if (!r.chunks.length) return;
            const blob = new Blob(r.chunks, { type: r.mime });
            const ext = /mp4/.test(r.mime) ? 'mp4' : 'webm';
            const d = new Date(r.t0), p2 = (n) => String(n).padStart(2, '0');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'lesson-' + room + '-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + '.' + ext;
            document.body.appendChild(a); a.click();
            setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 60000);
        };
        r.mr.onstop = finish;
        try { if (r.mr.state !== 'inactive') r.mr.stop(); else finish(); } catch (e) { finish(); }
        if (joined) { pushPresence(); renderBar(); renderStage(); }
    }

    function stopLocal() { [local.audio, local.video, local.screen].forEach((t) => { try { t && t.stop(); } catch (e) {} }); if (prejoinStream) prejoinStream.getTracks().forEach((t) => t.stop()); local = { stream: null, audio: null, video: null, screen: null, screenStream: null }; prejoinStream = null; }
    function cleanup() {
        if (rec) stopRec();
        writeAtt();
        unsubs.forEach((u) => { try { u(); } catch (e) {} }); unsubs = []; timers.forEach(clearInterval); timers = [];
        peers.forEach((P) => { try { P.pc.close(); } catch (e) {} }); peers = new Map(); docs = new Map(); analysers = new Map(); handled = {};
        if (joined && roomRef && me) roomRef.collection('peers').doc(me.uid).delete().catch(() => {});
        stopLocal(); if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
        joined = false; sess = { sid: '', base: 0, seg: 0, first: 0 }; chatOpen = peopleOpen = false; unread = 0; chatMsgs = []; pinned = ''; sharing = false; handUp = false;
    }
    function leave(msg, final) {
        if (window.StarthPresence) StarthPresence.setLesson(false);
        cleanup();
        if (root) {
            root.innerHTML = `<div class="call"><div class="call-pre"><div class="call-card"><h3>${esc(final ? X('Урок завершён') : X('Вы вышли из урока'))}</h3>${msg ? `<p>${esc(msg)}</p>` : ''}${final ? `<button class="btn-primary" type="button" id="call-rejoin">${esc(X('К списку уроков'))}</button>` : `<button class="btn-primary" type="button" id="call-rejoin">${esc(X('Войти снова'))}</button>`}</div></div></div>`;
            $('#call-rejoin').onclick = () => (final ? (location.href = 'video-lesson.html') : start(room, root, opts));
        }
        if (final && opts.onEnded) opts.onEnded();
        if (opts.onLeave) opts.onLeave();
    }

    // ── join flow ───────────────────────────────────────────────────────────
    async function showPrejoin() {
        const pre = $('#call-pre');
        const isT = myRole === 'teacher';
        pre.innerHTML = `<div class="call-card"><h3>${esc(X(isT ? 'Начать урок' : 'Войти в урок'))}</h3>
            ${opts.title ? `<p class="call-sub">${esc(opts.title)}</p>` : ''}
            <div class="call-preview"><video id="pre-video" autoplay playsinline muted></video><div class="call-preview-av" id="pre-av"><span>${esc(initials(myName))}</span></div></div>
            <div class="call-pre-toggles"><button type="button" class="cb" id="pre-mic">${ic('mic')}<span>${esc(X('Микрофон'))}</span></button><button type="button" class="cb" id="pre-cam">${ic('video')}<span>${esc(X('Камера'))}</span></button></div>
            <p class="call-hint" id="pre-hint">${esc(X('Проверяем камеру и микрофон…'))}</p>
            <button class="btn-primary call-join" type="button" id="pre-join">${esc(X(isT ? 'Начать урок' : 'Войти в урок'))}</button>
            <button class="call-alt" type="button" id="pre-alt">${esc(X('Не получается? Запасной режим'))}</button></div>`;
        const r = await getMedia(); prejoinStream = r.stream;
        const hint = $('#pre-hint'), v = $('#pre-video');
        if (r.stream) { v.srcObject = r.stream; local.stream = r.stream; local.audio = r.stream.getAudioTracks()[0] || null; local.video = r.stream.getVideoTracks()[0] || null; }
        const msg = { denied: 'Доступ к камере и микрофону запрещён. Разрешите его в настройках браузера (значок замка у адреса) — или войдите без них и только слушайте.', nosupport: 'Этот браузер не поддерживает видеозвонки. Откройте сайт в Chrome, Safari или Edge.', none: 'Камера и микрофон не найдены — вы сможете смотреть и слушать, а писать в чат.', novideo: 'Камера не найдена — вы войдёте только с микрофоном.', nomic: 'Микрофон не найден — вы войдёте только с камерой.' }[r.err];
        hint.textContent = msg ? X(msg) : X('Всё готово — нажмите кнопку.');
        micOn = !!local.audio; camOn = !!local.video;
        const syncPre = () => { $('#pre-mic').classList.toggle('on', !micOn || !local.audio); $('#pre-cam').classList.toggle('on', !camOn || !local.video); $('#pre-av').style.display = (camOn && local.video) ? 'none' : 'flex'; $('#pre-mic').innerHTML = ic(micOn && local.audio ? 'mic' : 'mic-off') + '<span>' + esc(X('Микрофон')) + '</span>'; $('#pre-cam').innerHTML = ic(camOn && local.video ? 'video' : 'video-off') + '<span>' + esc(X('Камера')) + '</span>'; };
        syncPre();
        $('#pre-mic').onclick = () => { if (local.audio) { micOn = !micOn; local.audio.enabled = micOn; syncPre(); } };
        $('#pre-cam').onclick = () => { if (local.video) { camOn = !camOn; local.video.enabled = camOn; syncPre(); } };
        $('#pre-join').onclick = () => { if (local.video) local.video.enabled = true; if (local.audio) local.audio.enabled = micOn; join(); };
        $('#pre-alt').onclick = () => { stopLocal(); if (opts.onFallback) opts.onFallback(); };
    }
    async function join() {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        if (!camOn && local.video) { local.video.stop(); if (local.stream) local.stream.removeTrack(local.video); local.video = null; }
        joinedAt = Date.now(); joined = true; if (window.StarthPresence) StarthPresence.setLesson(true); $('#call-pre').hidden = true; $('#call-live').hidden = false;
        pinned = '';
        if (local.audio) local.audio.enabled = micOn;
        roomRef = db.collection('lessonCalls').doc(String(room).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100));
        if (isHost) roomRef.set({ hostUid: me.uid, hostName: myName, updatedAt: Date.now() }, { merge: true }).catch(() => {});
        await roomRef.collection('peers').doc(me.uid).set(myDoc()).catch((e) => toastMsg(X('Не удалось подключиться: ') + e.message));
        renderBar(); renderStage(); listenPeers(); listenSignals(); listenRoom(); listenChat();
        timers.push(setInterval(tickSpeaking, 300));
        timers.push(setInterval(sessionBeat, 60000));
        openSession();
        root.addEventListener('click', enableAudioPlayback, { once: true });
        window.addEventListener('beforeunload', onUnload);
    }
    function onUnload() { if (joined && roomRef && me) { writeAtt(); if (myRole === 'teacher' && sess.sid) sessRef().update({ lastSeen: Date.now() }).catch(() => {}); roomRef.collection('peers').doc(me.uid).delete().catch(() => {}); } }

    async function start(roomName, mount, o) {
        cleanup(); root = mount; room = roomName; opts = o || {};
        if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY || !window.RTCPeerConnection) { root.innerHTML = ''; if (opts.onFallback) opts.onFallback(); return; }
        build();
        const user = await new Promise((res) => { if (auth.currentUser) return res(auth.currentUser); const u = auth.onAuthStateChanged((x) => { u(); res(x); }); });
        if (!user) {
            $('#call-pre').innerHTML = `<div class="call-card"><h3>${esc(X('Войдите в аккаунт'))}</h3><p>${esc(X('Чтобы войти в урок, нужно войти в свой аккаунт TheStarth.'))}</p><a class="btn-primary" href="index.html#login">${esc(X('Войти'))}</a><button class="call-alt" type="button" id="pre-alt">${esc(X('Запасной режим (Jitsi, без входа)'))}</button></div>`;
            $('#pre-alt').onclick = () => opts.onFallback && opts.onFallback(); return;
        }
        me = user; let p = window.currentUserProfile || {};
        if (!p.nickname) { try { const d = await db.collection('users').doc(user.uid).get(); if (d.exists) p = d.data(); } catch (e) {} }
        myName = [p.name, p.surname].filter(Boolean).join(' ') || p.nickname || 'Участник'; myRole = p.role || 'student'; isHost = myRole === 'teacher' || myRole === 'admin';
        showPrejoin();
    }
    function stop() { cleanup(); window.removeEventListener('beforeunload', onUnload); if (root) root.innerHTML = ''; }

    window.LessonCall = { start, stop, end: endLesson };
})();
