/* TheStarth — profile editor (name, surname, phone, nickname, "show my status", e-mail).
 *   ProfileEditor.open()  — opens the window (the dashboard has an «Редактировать профиль» button).
 * What happens on save:
 *   - users/<uid> is updated; a changed nickname is moved in the `nicknames` reservation list (taken names are refused);
 *   - the public directory entry is refreshed, and every chat the person is in gets the new name, so the messenger shows it at once;
 *   - an e-mail change is NOT applied right away: Firebase sends a confirmation link to the NEW address and the e-mail changes
 *     only after the person opens it. (Firebase may ask for the password first.)
 * Needs: db, auth, firebase (compat), app.js helpers (starthDirEntry).  Texts are Russian: i18n-extra.js / translations.js translate the DOM.
 */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const X = (m) => (window.X ? window.X(m) : m);
    const NICK = /^[a-z0-9_]{3,20}$/;
    let box = null, busy = false;

    function ensure() {
        if (box) return box;
        box = document.createElement('div'); box.id = 'peModal'; box.className = 'modal pe-modal';
        box.innerHTML = '<div class="modal-content pe-content" role="dialog" aria-modal="true" aria-labelledby="peTitle"><span class="close-modal pe-close" aria-label="Закрыть">&times;</span>' +
            '<h2 id="peTitle">Редактировать профиль</h2>' +
            '<form id="peForm" autocomplete="off">' +
            '<div class="pe-row"><div><label for="peName">Имя</label><input id="peName" maxlength="40" required></div><div><label for="peSurname">Фамилия</label><input id="peSurname" maxlength="40"></div></div>' +
            '<label for="pePhone">Телефон</label><input id="pePhone" type="tel" maxlength="24">' +
            '<label for="peTg">Telegram</label><input id="peTg" maxlength="33" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="@username" data-nophone><small class="pe-hint">Нужен для напоминаний об уроках (за час, за 30 и за 5 минут). Откройте нашего бота и нажмите Start' + (window.STARTH_TG_BOT ? ': <a href="https://t.me/' + String(window.STARTH_TG_BOT).replace(/^@/, '') + '" target="_blank" rel="noopener">@' + String(window.STARTH_TG_BOT).replace(/^@/, '') + '</a>' : '') + '.</small>' +
            '<label for="peNick">Никнейм</label><input id="peNick" maxlength="20" autocapitalize="none" spellcheck="false"><small class="pe-hint">Латинские буквы, цифры и _ (3–20 символов). Его используют в мессенджере и реферальной ссылке.</small>' +
            '<label class="pe-check"><input type="checkbox" id="peShow"> Показывать мой статус (онлайн / в уроке) другим людям</label>' +
            '<div class="status-msg" id="peStatus"></div>' +
            '<button class="btn-primary" type="submit" id="peSave" style="width:100%">Сохранить</button></form>' +
            '<hr class="pe-sep"><h3>Электронная почта</h3><p class="pe-cur">Сейчас: <b id="peEmailNow"></b></p>' +
            '<form id="peEmailForm" autocomplete="off"><label for="peEmail">Новый email</label><input id="peEmail" type="email" maxlength="120">' +
            '<div id="peEmailPw" hidden><label for="pePw">Текущий пароль (нужен для безопасности)</label><input id="pePw" type="password" autocomplete="current-password"></div>' +
            '<small class="pe-hint">Мы отправим письмо со ссылкой на НОВЫЙ адрес. Почта изменится только после того, как вы перейдёте по ссылке в письме.</small>' +
            '<div class="status-msg" id="peEmailStatus"></div><button class="btn-outline" type="submit" id="peEmailBtn" style="width:100%">Отправить письмо для подтверждения</button></form></div>';
        document.body.appendChild(box);
        const close = () => box.classList.remove('show');
        box.querySelector('.pe-close').onclick = close;
        box.addEventListener('click', (e) => { if (e.target === box) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        $('peForm').onsubmit = (e) => { e.preventDefault(); save(); };
        $('peEmailForm').onsubmit = (e) => { e.preventDefault(); changeEmail(); };
        return box;
    }
    function say(id, text, ok) { const el = $(id); if (el) { el.textContent = X(text); el.className = 'status-msg ' + (ok ? 'ok' : 'error'); } }

    function open() {
        const user = window.currentAuthUser || (typeof auth !== 'undefined' && auth.currentUser); if (!user) return;
        const p = window.currentUserProfile || {}; ensure();
        $('peName').value = p.name || ''; $('peSurname').value = p.surname || ''; $('pePhone').value = p.phone || ''; $('peTg').value = p.telegram ? '@' + p.telegram : ''; $('peNick').value = p.nickname || '';
        $('peShow').checked = p.showStatus !== false; $('peEmailNow').textContent = user.email || '—'; $('peEmail').value = ''; $('pePw').value = ''; $('peEmailPw').hidden = true;
        say('peStatus', '', true); say('peEmailStatus', '', true);
        box.classList.add('show'); setTimeout(() => $('peName').focus(), 50);
    }

    async function save() {
        if (busy) return; const user = auth.currentUser; if (!user) return;
        const old = window.currentUserProfile || {};
        const name = $('peName').value.trim().replace(/\s+/g, ' '), surname = $('peSurname').value.trim().replace(/\s+/g, ' '), phone = $('pePhone').value.trim(), nick = $('peNick').value.trim().toLowerCase();
        if (!name) return say('peStatus', 'Введите имя.', false);
        if (phone && !/^[0-9+()\-\s]{5,24}$/.test(phone)) return say('peStatus', 'Телефон: только цифры, + ( ) и дефис.', false);
        const tg = $('peTg').value.trim().replace(/^@/, '').toLowerCase();
        if (tg && !/^[a-z0-9_]{5,32}$/.test(tg)) return say('peStatus', 'Telegram: латинские буквы, цифры и _, 5–32 символа.', false);
        const oldNick = old.nickname || '';
        if (nick !== oldNick && !NICK.test(nick)) return say('peStatus', 'Никнейм: 3–20 символов, латинские буквы, цифры и _.', false);
        busy = true; $('peSave').disabled = true; say('peStatus', 'Сохраняю…', true);
        try {
            const dn = [name, surname ? surname.charAt(0) + '.' : ''].filter(Boolean).join(' ');
            const fullName = [name, surname].filter(Boolean).join(' ');
            if (nick !== oldNick) {
                await db.runTransaction(async (tx) => {
                    const nref = db.collection('nicknames').doc(nick), snap = await tx.get(nref);
                    if (snap.exists && snap.data().uid !== user.uid) throw { code: 'custom/nickname-taken' };
                    tx.set(nref, { uid: user.uid, displayName: dn });
                    if (oldNick) tx.delete(db.collection('nicknames').doc(oldNick));
                });
            } else if (nick) {
                db.collection('nicknames').doc(nick).set({ uid: user.uid, displayName: dn }).catch(() => {});
            }
            const patch = { name, surname, phone, telegram: tg, nickname: nick || oldNick, showStatus: $('peShow').checked, profileUpdatedAt: Date.now() };
            await db.collection('users').doc(user.uid).set(patch, { merge: true });
            const prof = Object.assign({}, old, patch); window.currentUserProfile = prof;
            // public directory entry (messenger search)
            try { if (window.starthDirEntry) await db.collection('directory').doc(user.uid).set(window.starthDirEntry(user.uid, prof)); try { sessionStorage.removeItem('dirSig:' + user.uid); } catch (e) {} } catch (e) { console.warn('directory', e); }
            // every chat the person is in: new name / nickname
            try {
                const chats = await db.collection('chats').where('members', 'array-contains', user.uid).get();
                const ups = []; chats.forEach((c) => { ups.push(c.ref.update({ ['names.' + user.uid]: fullName, ['nicks.' + user.uid]: prof.nickname })); });
                await Promise.all(ups.map((p) => p.catch(() => {})));
            } catch (e) { console.warn('chats', e); }
            if (window.StarthPresence && window.StarthPresence.refresh) window.StarthPresence.refresh();
            window.dispatchEvent(new CustomEvent('starth-profile-changed', { detail: { profile: prof } }));
            say('peStatus', 'Сохранено.', true);
            setTimeout(() => { if (box) box.classList.remove('show'); }, 700);
        } catch (e) {
            say('peStatus', e && e.code === 'custom/nickname-taken' ? 'Этот никнейм уже занят.' : e && e.code === 'permission-denied' ? 'Нет прав: администратор ещё не опубликовал новые правила Firestore.' : 'Не удалось сохранить: ' + ((e && e.message) || e), false);
        }
        busy = false; $('peSave').disabled = false;
    }

    async function changeEmail() {
        const user = auth.currentUser; if (!user) return;
        const email = $('peEmail').value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say('peEmailStatus', 'Введите правильный email.', false);
        if (email === (user.email || '').toLowerCase()) return say('peEmailStatus', 'Это ваш текущий email.', false);
        $('peEmailBtn').disabled = true; say('peEmailStatus', 'Отправляю письмо…', true);
        try {
            const pw = $('pePw').value;
            if (pw && firebase.auth.EmailAuthProvider) await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, pw));
            await user.verifyBeforeUpdateEmail(email);
            say('peEmailStatus', 'Письмо отправлено на ' + email + '. Откройте его и перейдите по ссылке: только после этого почта изменится. Старая почта работает до подтверждения.', true);
            $('peEmailPw').hidden = true;
        } catch (e) {
            const c = e && e.code;
            if (c === 'auth/requires-recent-login') { $('peEmailPw').hidden = false; say('peEmailStatus', 'Для безопасности введите текущий пароль и нажмите кнопку ещё раз.', false); }
            else if (c === 'auth/wrong-password' || c === 'auth/invalid-credential') say('peEmailStatus', 'Неверный пароль.', false);
            else if (c === 'auth/email-already-in-use') say('peEmailStatus', 'Этот email уже используется другим аккаунтом.', false);
            else if (c === 'auth/too-many-requests') say('peEmailStatus', 'Слишком много попыток. Подождите и попробуйте позже.', false);
            else if (c === 'auth/operation-not-allowed') say('peEmailStatus', 'В Firebase выключена смена email через подтверждение: включите вход по email/паролю и проверьте шаблон письма.', false);
            else say('peEmailStatus', 'Не удалось отправить письмо: ' + ((e && e.message) || e), false);
        }
        $('peEmailBtn').disabled = false;
    }

    // After the person has confirmed the new address, Firebase auth has it and the profile document still has the old one: copy it over.
    window.addEventListener('starth-auth-ready', (e) => {
        const u = e.detail && e.detail.user, p = e.detail && e.detail.profile;
        if (u && p && u.email && String(p.email || '').toLowerCase() !== u.email.toLowerCase()) {
            db.collection('users').doc(u.uid).set({ email: u.email }, { merge: true }).then(() => { if (window.currentUserProfile) window.currentUserProfile.email = u.email; }).catch(() => {});
        }
    });

    window.ProfileEditor = { open };
})();
