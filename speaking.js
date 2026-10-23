/* TheStarth — IELTS Speaking with AI (speaking.html).
 * Two modes:
 *   exam      — a full mock IELTS Speaking test (Part 1, Part 2 with a cue card and 1 minute to prepare, Part 3).
 *               The examiner follows a script from speaking-bank.js (like a real examiner), the AI only marks it at the end.
 *   practice  — a free conversation on a topic with the AI partner (Emma, or James with a male voice): after every answer it corrects real mistakes.
 * Speech → text: the browser's speech recognition (Chrome / Edge / Safari). Without it the student types.
 * Examiner voice: Azure British voice through the AI helper when it is set up, otherwise the browser's English voice.
 * Who may use it: signed-in students who are in a group (also teachers and admins). The AI helper checks this again.
 * Results go to Firestore `speakingResults` — the student sees them in the cabinet, teachers in the journal.
 */
(function () {
    const $ = (id) => document.getElementById(id);
    const app = $('spkApp'); if (!app) return;
    const B = window.SpeakingBank;
    const V = window.SpeakingView;
    const ic = (n, c) => (window.Icons ? window.Icons.svg(n, c) : '');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const lang = () => { try { const l = localStorage.getItem('starthLang'); return l === 'uz' || l === 'en' ? l : 'ru'; } catch (e) { return 'ru'; } };
    const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

    const L = {
        ru: {
            title: 'Speaking с ИИ', lead: 'Говорите по-английски вслух — ИИ слушает, задаёт вопросы как на настоящем IELTS и оценивает ответ.',
            loading: 'Проверяю доступ…', guest: 'Войдите в аккаунт, чтобы заниматься Speaking.', login: 'Войти',
            denied: 'Speaking с ИИ доступен ученикам групп TheStarth. Если вы уже учитесь у нас, попросите учителя добавить вас в группу.', trial: 'Записаться на бесплатный урок',
            noai: 'Speaking с ИИ сейчас недоступен. Попробуйте позже.',
            examT: 'Пробный IELTS Speaking', examD: 'Как на настоящем экзамене: Part 1, Part 2 (карточка, минута на подготовку, до 2 минут речи) и Part 3. В конце — балл по 4 критериям и разбор ошибок.', examM: '11–14 минут',
            pracT: 'Разговор на тему', pracD: 'Свободный разговор с ИИ-собеседником. После каждого ответа она показывает ошибки и как сказать лучше.', pracM: 'Сколько хотите',
            pickTopic: 'Выберите тему', ownTopic: 'Или своя тема (по-английски)', start: 'Начать', startExam: 'Начать экзамен',
            micTest: 'Проверить микрофон', micSay: 'Скажите что-нибудь по-английски…', micOk: 'Микрофон работает', micHeard: 'Я услышал:',
            subs: 'Показывать текст вопросов', tips: 'Советы', tip1: 'Наденьте наушники и сядьте в тихом месте.', tip2: 'Отвечайте развёрнуто: 2–4 предложения в Part 1, больше — в Part 3.', tip3: 'Закончили ответ — нажмите «Готово».',
            noSR: 'Ваш браузер не распознаёт речь — можно отвечать текстом. Для голоса откройте сайт в Chrome или Edge.',
            history: 'Мои результаты', listening: 'Слушаю… говорите', speakingNow: 'Экзаменатор говорит…', thinking: '{n} думает…',
            done: 'Готово', repeat: 'Повторить вопрос', typeIt: 'Ответить текстом', sayIt: 'Ответить голосом', typePh: 'Напишите ответ по-английски…', send: 'Отправить',
            exit: 'Выйти', exitQ: 'Выйти? Ответы этого занятия не сохранятся.', exitYes: 'Да, выйти', exitNo: 'Продолжить',
            prep: 'Подготовка', prepHint: 'У вас 1 минута, чтобы подумать. Можно делать заметки.', notesPh: 'Заметки (их видите только вы)', ready: 'Я готов(а) говорить',
            longTurn: 'Говорите 1–2 минуты', youSaid: 'Вы сказали', nothing: 'Ничего не распознано. Повторите громче или ответьте текстом.',
            finish: 'Завершить и получить оценку', finishShort: 'Завершить', evaluating: 'ИИ проверяет ваши ответы… Это займёт до минуты.',
            tooShort: 'Слишком мало сказано для оценки. Поговорите ещё немного (нужно хотя бы 40 слов).', again: 'Ещё раз', toCab: 'В личный кабинет', back: 'К выбору',
            err: 'Не получилось связаться с ИИ. Проверьте интернет и нажмите «Повторить».', retry: 'Повторить', limit: 'Слишком много запросов. Подождите пару минут.',
            daily: 'Лимит занятий на сегодня исчерпан. Возвращайтесь завтра.', saved: 'Результат сохранён — его увидите вы и ваш учитель.', notSaved: 'Не удалось сохранить результат, но вы видите его здесь.',
            fix: 'Исправление', better: 'Можно сказать лучше', partOf: 'из', q: 'Вопрос', micDenied: 'Нет доступа к микрофону. Разрешите микрофон в настройках браузера (значок замка в адресной строке) или отвечайте текстом.',
            moreTurns: 'Хороший разговор! Можно завершить и получить оценку.', you: 'Вы', time: 'Время',
        },
        uz: {
            title: 'AI bilan Speaking', lead: 'Inglizcha ovoz chiqarib gapiring — AI tinglaydi, haqiqiy IELTS dagidek savol beradi va javobni baholaydi.',
            loading: 'Kirish tekshirilmoqda…', guest: 'Speaking bilan shug‘ullanish uchun akkauntga kiring.', login: 'Kirish',
            denied: 'AI bilan Speaking faqat TheStarth guruhlari o‘quvchilari uchun. Agar bizda o‘qiyotgan bo‘lsangiz, o‘qituvchingizdan guruhga qo‘shishni so‘rang.', trial: 'Bepul darsga yozilish',
            noai: 'AI bilan Speaking hozir ishlamayapti. Keyinroq urinib ko‘ring.',
            examT: 'IELTS Speaking sinovi', examD: 'Haqiqiy imtihondagidek: Part 1, Part 2 (karta, tayyorlanish uchun 1 daqiqa, 2 daqiqagacha nutq) va Part 3. Oxirida 4 mezon bo‘yicha ball va xatolar tahlili.', examM: '11–14 daqiqa',
            pracT: 'Mavzu bo‘yicha suhbat', pracD: 'AI suhbatdosh bilan erkin suhbat. Har bir javobdan keyin u xatolarni va qanday yaxshiroq aytishni ko‘rsatadi.', pracM: 'Xohlagancha',
            pickTopic: 'Mavzuni tanlang', ownTopic: 'Yoki o‘z mavzuingiz (inglizcha)', start: 'Boshlash', startExam: 'Imtihonni boshlash',
            micTest: 'Mikrofonni tekshirish', micSay: 'Inglizcha biror narsa ayting…', micOk: 'Mikrofon ishlayapti', micHeard: 'Eshitdim:',
            subs: 'Savollar matnini ko‘rsatish', tips: 'Maslahatlar', tip1: 'Quloqchin taqing va tinch joyda o‘tiring.', tip2: 'Batafsil javob bering: Part 1 da 2–4 gap, Part 3 da ko‘proq.', tip3: 'Javobni tugatdingizmi — «Tayyor» ni bosing.',
            noSR: 'Brauzeringiz nutqni tanimaydi — javobni yozib berishingiz mumkin. Ovoz uchun saytni Chrome yoki Edge da oching.',
            history: 'Mening natijalarim', listening: 'Tinglayapman… gapiring', speakingNow: 'Imtihonchi gapiryapti…', thinking: '{n} o‘ylayapti…',
            done: 'Tayyor', repeat: 'Savolni takrorlash', typeIt: 'Yozib javob berish', sayIt: 'Ovoz bilan javob berish', typePh: 'Javobni inglizcha yozing…', send: 'Yuborish',
            exit: 'Chiqish', exitQ: 'Chiqasizmi? Bu mashg‘ulot javoblari saqlanmaydi.', exitYes: 'Ha, chiqish', exitNo: 'Davom etish',
            prep: 'Tayyorlanish', prepHint: 'O‘ylash uchun 1 daqiqa. Qayd yozishingiz mumkin.', notesPh: 'Qaydlar (faqat siz ko‘rasiz)', ready: 'Gapirishga tayyorman',
            longTurn: '1–2 daqiqa gapiring', youSaid: 'Siz aytdingiz', nothing: 'Hech narsa tanilmadi. Balandroq takrorlang yoki yozib javob bering.',
            finish: 'Tugatish va baho olish', finishShort: 'Tugatish', evaluating: 'AI javoblaringizni tekshiryapti… Bir daqiqagacha vaqt oladi.',
            tooShort: 'Baholash uchun juda kam gapirildi. Yana biroz gapiring (kamida 40 so‘z kerak).', again: 'Yana bir bor', toCab: 'Shaxsiy kabinetga', back: 'Tanlovga qaytish',
            err: 'AI bilan bog‘lanib bo‘lmadi. Internetni tekshiring va «Qayta urinish» ni bosing.', retry: 'Qayta urinish', limit: 'So‘rovlar juda ko‘p. Bir-ikki daqiqa kuting.',
            daily: 'Bugungi mashg‘ulotlar limiti tugadi. Ertaga qaytib keling.', saved: 'Natija saqlandi — uni siz va o‘qituvchingiz ko‘rasiz.', notSaved: 'Natijani saqlab bo‘lmadi, lekin uni shu yerda ko‘ryapsiz.',
            fix: 'Tuzatish', better: 'Yaxshiroq aytish mumkin', partOf: 'dan', q: 'Savol', micDenied: 'Mikrofonga ruxsat yo‘q. Brauzer sozlamalarida mikrofonga ruxsat bering (manzil satridagi qulf belgisi) yoki yozib javob bering.',
            moreTurns: 'Yaxshi suhbat! Tugatib, baho olishingiz mumkin.', you: 'Siz', time: 'Vaqt',
        },
        en: {
            title: 'Speaking with AI', lead: 'Speak English out loud — the AI listens, asks questions like a real IELTS examiner and marks your answers.',
            loading: 'Checking access…', guest: 'Sign in to practise Speaking.', login: 'Sign in',
            denied: 'Speaking with AI is available to students in TheStarth groups. If you already study with us, ask your teacher to add you to a group.', trial: 'Book a free lesson',
            noai: 'Speaking with AI is not available right now. Please try later.',
            examT: 'IELTS Speaking mock test', examD: 'Just like the real exam: Part 1, Part 2 (cue card, one minute to prepare, up to 2 minutes of speaking) and Part 3. Then a band for each of the 4 criteria and your mistakes explained.', examM: '11–14 minutes',
            pracT: 'Topic conversation', pracD: 'A free conversation with an AI partner. After every answer it shows your mistakes and how to say it better.', pracM: 'As long as you like',
            pickTopic: 'Choose a topic', ownTopic: 'Or your own topic', start: 'Start', startExam: 'Start the test',
            micTest: 'Test microphone', micSay: 'Say something in English…', micOk: 'Microphone works', micHeard: 'I heard:',
            subs: 'Show question text', tips: 'Tips', tip1: 'Use headphones and sit somewhere quiet.', tip2: 'Give full answers: 2–4 sentences in Part 1, more in Part 3.', tip3: 'When you finish an answer, press “Done”.',
            noSR: 'Your browser cannot recognise speech — you can type your answers. For voice, open the site in Chrome or Edge.',
            history: 'My results', listening: 'Listening… speak now', speakingNow: 'The examiner is speaking…', thinking: '{n} is thinking…',
            done: 'Done', repeat: 'Repeat the question', typeIt: 'Type instead', sayIt: 'Speak instead', typePh: 'Type your answer in English…', send: 'Send',
            exit: 'Exit', exitQ: 'Exit? The answers from this session will not be saved.', exitYes: 'Yes, exit', exitNo: 'Continue',
            prep: 'Preparation', prepHint: 'You have 1 minute to think. You can make notes.', notesPh: 'Notes (only you can see them)', ready: 'I’m ready to speak',
            longTurn: 'Speak for 1–2 minutes', youSaid: 'You said', nothing: 'Nothing was recognised. Say it again louder or type your answer.',
            finish: 'Finish and get my band', finishShort: 'Finish', evaluating: 'The AI is checking your answers… This takes up to a minute.',
            tooShort: 'Not enough speaking to mark. Talk a little more (at least 40 words).', again: 'Try again', toCab: 'My dashboard', back: 'Back',
            err: 'Could not reach the AI. Check your internet and press “Retry”.', retry: 'Retry', limit: 'Too many requests. Please wait a couple of minutes.',
            daily: 'You have used today’s sessions. Come back tomorrow.', saved: 'Saved — you and your teacher can see this result.', notSaved: 'Could not save the result, but you can see it here.',
            fix: 'Correction', better: 'Better', partOf: 'of', q: 'Question', micDenied: 'No microphone access. Allow the microphone in your browser settings (the lock icon in the address bar) or type your answers.',
            moreTurns: 'Great conversation! You can finish and get your band now.', you: 'You', time: 'Time',
        },
    };
    const t = (k) => (L[lang()][k] != null ? L[lang()][k] : L.ru[k]);

    // ───────────── state ─────────────
    const S = { user: null, profile: null, access: 'loading', view: 'hub', subs: store.get('spkSubs', true), topic: '', history: [], result: null, msg: '' };
    const newSession = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    // ───────────── speech recognition ─────────────
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const Ear = {
        on: false, rec: null, finals: '', interim: '', conf: [], t0: 0, onChange: null, onError: null,
        start(onChange, onError) {
            this.stop(true); this.on = true; this.finals = ''; this.interim = ''; this.conf = []; this.t0 = Date.now(); this.onChange = onChange; this.onError = onError;
            this._open();
        },
        _open() {
            if (!SR || !this.on) return;
            const r = new SR(); this.rec = r;
            r.lang = 'en-US'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
            r.onresult = (e) => {
                if (this.rec !== r) return;
                let interim = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const res = e.results[i], a = res[0];
                    if (res.isFinal) { this.finals += (this.finals ? ' ' : '') + a.transcript.trim(); if (a.confidence > 0) this.conf.push(a.confidence); }
                    else interim += a.transcript;
                }
                this.interim = interim.trim();
                if (this.onChange) this.onChange(this.text());
            };
            r.onerror = (e) => {
                if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') { this.on = false; if (this.onError) this.onError(e.error); }
            };
            r.onend = () => { if (this.rec === r && this.on) setTimeout(() => { if (this.rec === r && this.on) this._open(); }, 120); };   // Chrome stops after a pause — keep listening
            try { r.start(); } catch (e) { /* already started */ }
        },
        text() { return (this.finals + (this.interim ? ' ' + this.interim : '')).replace(/\s+/g, ' ').trim(); },
        stop(silent) {
            const out = { text: this.text(), conf: this.conf.slice(), ms: this.t0 ? Date.now() - this.t0 : 0 };
            this.on = false; const r = this.rec; this.rec = null;
            if (r) { try { r.onend = null; r.stop(); } catch (e) {} }
            if (!silent) this.t0 = 0;
            return out;
        },
    };

    // ───────────── examiner voice ─────────────
    const synth = window.speechSynthesis;
    const audio = typeof Audio !== 'undefined' ? new Audio() : null;
    let premium = (() => { try { const v = sessionStorage.getItem('spkTTS'); return v === '1' ? true : v === '0' ? false : null; } catch (e) { return null; } })();
    let sayTok = 0;
    const FEMALE = /female|woman|sonia|libby|maisie|hazel|susan|serena|kate|stephanie|martha|samantha|karen|moira|tessa|fiona|victoria|zira|aria|jenny|ava|emma|michelle|natasha|clara|sara|allison|joanna|kendra|kimberly|salli|amy|ivy|olivia|nicky|catherine|ellie|abbi|bella|hollie|sonia/i;
    const MALE = /\bmale\b|\bman\b|daniel|george|ryan|thomas|arthur|oliver|guy|david|mark|alex\b|fred|rishi|james|brian|christopher|eric|roger|steffan|andrew|aaron|gordon|lee\b|matthew|joey|justin|kevin|russell|noah|elliot|alfie|ethan|liam/i;
    function englishVoice() {
        if (!synth) return null;
        let best = null, bs = -Infinity;
        (synth.getVoices() || []).forEach((v) => {
            const l = String(v.lang || '').toLowerCase().replace('_', '-'), n = String(v.name || ''); if (!l.startsWith('en')) return;
            let sc = l === 'en-gb' ? 4 : l === 'en-us' ? 3 : 1;
            if (/natural|neural|online/i.test(n)) sc += 6; if (/google/i.test(n)) sc += 3; if (/premium|enhanced|siri/i.test(n)) sc += 3;
            if (FEMALE.test(n)) sc += 5; if (MALE.test(n)) sc -= 8; if (/compact|espeak/i.test(n)) sc -= 4;
            if (sc > bs) { bs = sc; best = v; }
        });
        return best;
    }
    if (synth && 'onvoiceschanged' in synth) synth.onvoiceschanged = () => {};
    // Name of the examiner / partner follows the voice: a female voice is Emma, a male one is James.
    async function voiceName() {
        if (premium === null && audio && window.MOCK_AI_URL) {
            try {
                const r = await fetch(window.MOCK_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'tts', lang: 'gb', purpose: 'speaking', text: 'Hi.' }) });
                premium = r.ok && /audio/.test(r.headers.get('Content-Type') || '') ? true : [400, 401, 403, 404, 501].indexOf(r.status) >= 0 ? false : null;
                if (premium !== null) try { sessionStorage.setItem('spkTTS', premium ? '1' : '0'); } catch (e) {}
            } catch (e) { /* unknown — decide by the browser voice */ }
        }
        if (premium === true) return 'Emma';             // Azure voice en-GB-SoniaNeural (female)
        const v = englishVoice();
        return v && MALE.test(v.name || '') && !FEMALE.test(v.name || '') ? 'James' : 'Emma';
    }
    function stopVoice() { sayTok++; try { if (synth) synth.cancel(); } catch (e) {} try { if (audio) { audio.pause(); audio.removeAttribute('src'); } } catch (e) {} }
    function say(text) {
        return new Promise(async (resolve) => {
            const my = ++sayTok, fin = () => { if (my === sayTok) resolve(); else resolve(); };
            if (!text) return fin();
            if (premium !== false && audio && window.MOCK_AI_URL) {
                try {
                    const r = await fetch(window.MOCK_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'tts', lang: 'gb', purpose: 'speaking', text: text.slice(0, 700) }) });
                    if (my !== sayTok) return resolve();
                    if (r.ok && /audio/.test(r.headers.get('Content-Type') || '')) {
                        premium = true; try { sessionStorage.setItem('spkTTS', '1'); } catch (e) {}
                        const url = URL.createObjectURL(await r.blob()); if (my !== sayTok) return resolve();
                        audio.onended = () => { URL.revokeObjectURL(url); fin(); }; audio.onerror = () => { URL.revokeObjectURL(url); fin(); };
                        audio.src = url; await audio.play().catch(() => fin()); return;
                    }
                    if ([400, 401, 403, 404, 501].indexOf(r.status) >= 0) { premium = false; try { sessionStorage.setItem('spkTTS', '0'); } catch (e) {} }
                } catch (e) { /* browser voice below */ }
                if (my !== sayTok) return resolve();
            }
            const v = englishVoice();
            if (!synth || !v) return setTimeout(fin, 400);
            try {
                synth.cancel();
                const u = new SpeechSynthesisUtterance(text); try { u.voice = v; } catch (e) {} u.lang = v.lang || 'en-GB'; u.rate = 0.97;
                const guard = setTimeout(fin, 3000 + text.length * 90);   // some browsers forget to fire "end"
                u.onend = () => { clearTimeout(guard); fin(); }; u.onerror = () => { clearTimeout(guard); fin(); };
                synth.speak(u);
            } catch (e) { setTimeout(fin, 300); }
        });
    }

    // ───────────── AI helper ─────────────
    async function ai(body) {
        const token = await auth.currentUser.getIdToken();
        let r;
        try { r = await fetch(window.MOCK_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(Object.assign({ lang: lang() }, body)) }); }
        catch (e) { throw new Error('err'); }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error === 'daily' ? 'daily' : j.error === 'limit' ? 'limit' : j.error === 'too_short' ? 'tooShort' : j.error === 'not_member' ? 'denied' : 'err');
        return j;
    }

    // ───────────── shared bits ─────────────
    const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
    const wordsOf = (s) => (String(s || '').trim() ? String(s).trim().split(/\s+/).length : 0);
    function render(html) { app.innerHTML = html; }
    function card(inner, cls) { return `<div class="spk-card ${cls || ''}">${inner}</div>`; }
    function note(text, kind) { return text ? `<div class="spk-note ${kind || ''}">${ic(kind === 'bad' ? 'alert' : 'check-circle')}<span>${esc(text)}</span></div>` : ''; }

    // ───────────── hub ─────────────
    const H1 = { ru: 'IELTS <span class="text-premium">Speaking</span> с ИИ', uz: 'AI bilan IELTS <span class="text-premium">Speaking</span>', en: 'IELTS <span class="text-premium">Speaking</span> with AI' };
    function heading() {
        const h = document.querySelector('.spk-h1'); if (h) h.innerHTML = H1[lang()];
        const ld = $('spkLead'); if (ld) ld.textContent = t('lead');
        document.title = t('title') + ' — TheStarth';
    }
    function hub() {
        stopAll();
        heading();
        S.view = 'hub';
        if (S.access === 'loading') return render(card(`<div class="spk-wait"><span class="spk-spin"></span>${t('loading')}</div>`));
        if (S.access === 'guest') return render(card(`<div class="spk-gate">${ic('lock')}<p>${t('guest')}</p><a class="btn-primary" href="dashboard">${t('login')}</a></div>`));
        if (S.access === 'denied') return render(card(`<div class="spk-gate">${ic('users')}<p>${t('denied')}</p><a class="btn-primary" href="./#pricing">${t('trial')}</a></div>`));
        if (S.access === 'noai') return render(card(`<div class="spk-gate">${ic('alert')}<p>${t('noai')}</p></div>`));
        const topics = B.practice.map((p) => `<button type="button" class="spk-topic${S.topic === p.id ? ' on' : ''}" data-topic="${p.id}">${esc(p[lang()] || p.ru)}</button>`).join('');
        render(`
${S.msg ? note(S.msg.text, S.msg.kind) : ''}
${!SR ? note(t('noSR'), 'bad') : ''}
<div class="spk-modes">
  <section class="spk-mode">
    <div class="spk-mode-ico">${ic('graduation')}</div>
    <h2>${t('examT')}</h2><p>${t('examD')}</p>
    <div class="spk-meta">${ic('clock')}${t('examM')}</div>
    <button type="button" class="btn-primary spk-big" id="spkExam">${ic('mic')}${t('startExam')}</button>
  </section>
  <section class="spk-mode">
    <div class="spk-mode-ico">${ic('message')}</div>
    <h2>${t('pracT')}</h2><p>${t('pracD')}</p>
    <div class="spk-lbl">${t('pickTopic')}</div>
    <div class="spk-topics">${topics}</div>
    <input type="text" id="spkOwn" class="spk-input" maxlength="80" placeholder="${t('ownTopic')}" value="${esc(S.own || '')}">
    <button type="button" class="btn-primary spk-big" id="spkPrac">${ic('mic')}${t('start')}</button>
  </section>
</div>
<div class="spk-tools">
  <div class="spk-tool"><button type="button" class="btn-outline spk-btn" id="spkMic">${ic('mic')}${t('micTest')}</button><div id="spkMicOut" class="spk-micout"></div></div>
  <label class="spk-switch"><input type="checkbox" id="spkSubs"${S.subs ? ' checked' : ''}><span></span>${t('subs')}</label>
</div>
<div class="spk-tips"><b>${ic('bulb')}${t('tips')}</b><ul><li>${t('tip1')}</li><li>${t('tip2')}</li><li>${t('tip3')}</li></ul></div>
<section class="spk-hist"><h2>${ic('chart')}${t('history')}</h2><div id="spkChart">${V.chart(S.history)}</div><div id="spkHist">${V.list(S.history)}</div></section>`);
        S.msg = '';
        $('spkExam').onclick = () => startExam();
        $('spkPrac').onclick = () => {
            const own = $('spkOwn').value.trim(); S.own = own;
            const p = B.practice.find((x) => x.id === S.topic) || B.practice[0];
            startPractice(own || p.en);
        };
        app.querySelectorAll('.spk-topic').forEach((b) => { b.onclick = () => { S.topic = b.dataset.topic; app.querySelectorAll('.spk-topic').forEach((x) => x.classList.toggle('on', x === b)); $('spkOwn').value = ''; S.own = ''; }; });
        if (!S.topic) { S.topic = B.practice[0].id; const f = app.querySelector('.spk-topic'); if (f) f.classList.add('on'); }
        $('spkSubs').onchange = (e) => { S.subs = e.target.checked; store.set('spkSubs', S.subs); };
        $('spkMic').onclick = micTest;
        app.querySelectorAll('[data-spk-id]').forEach((b) => { b.onclick = () => { const d = S.history.find((x) => x.id === b.dataset.spkId); if (d) showResult(d, true); }; });
    }
    function micTest() {
        const out = $('spkMicOut');
        if (!SR) { out.innerHTML = note(t('noSR'), 'bad'); return; }
        out.innerHTML = `<span class="spk-live"><i></i>${t('micSay')}</span>`;
        Ear.start((txt) => { out.innerHTML = `<span class="spk-ok">${ic('check-circle')}${t('micOk')}</span> <span class="spk-heard">${t('micHeard')} «${esc(txt)}»</span>`; },
            () => { out.innerHTML = note(t('micDenied'), 'bad'); });
        setTimeout(() => { if (S.view === 'hub') Ear.stop(); }, 7000);
    }

    // ───────────── answer box (used by exam and practice) ─────────────
    // mount(el, {onDone(text, meta), autoStopSec, minSec}) — starts listening (or shows a text box)
    let typing = !SR;
    function answerBox(el, opts) {
        let timer = 0, closed = false;
        const t0 = Date.now();
        const close = (text, meta) => { if (closed) return; closed = true; clearInterval(timer); opts.onDone(text, meta); };
        function voiceUI() {
            el.innerHTML = `<div class="spk-ans">
<div class="spk-live on"><i></i><span>${t('listening')}</span><em id="spkClock">0:00</em></div>
<div class="spk-said" id="spkSaid"></div>
<div class="spk-row">
  <button type="button" class="btn-primary spk-big" id="spkDone">${ic('check')}${t('done')}</button>
  ${opts.repeat ? `<button type="button" class="btn-outline spk-btn" id="spkRep">${ic('volume')}${t('repeat')}</button>` : ''}
  <button type="button" class="spk-link" id="spkType">${ic('keyboard')}${t('typeIt')}</button>
</div></div>`;
            const said = $('spkSaid');
            Ear.start((txt) => { said.textContent = txt; said.classList.toggle('has', !!txt); },
                () => { typing = true; textUI(t('micDenied')); });
            timer = setInterval(() => {
                const s = (Date.now() - t0) / 1000; const c = $('spkClock');
                if (c) c.textContent = opts.autoStopSec ? fmt(opts.autoStopSec - s) : fmt(s);
                if (opts.autoStopSec && s >= opts.autoStopSec) finishVoice();
            }, 250);
            $('spkDone').onclick = finishVoice;
            if (opts.repeat) $('spkRep').onclick = async () => { Ear.stop(true); clearInterval(timer); await opts.repeat(); if (!closed) voiceUI(); };
            $('spkType').onclick = () => { Ear.stop(true); clearInterval(timer); typing = true; textUI(); };
        }
        function finishVoice() {
            const r = Ear.stop();
            const text = r.text;
            if (!text) { const s = $('spkSaid'); if (s) { s.textContent = t('nothing'); s.classList.add('bad'); } Ear.start((txt) => { const x = $('spkSaid'); if (x) { x.textContent = txt; x.classList.remove('bad'); x.classList.add('has'); } }, () => textUI(t('micDenied'))); return; }
            close(text, { ms: r.ms || (Date.now() - t0), conf: r.conf, typed: false });
        }
        function textUI(warn) {
            clearInterval(timer);
            el.innerHTML = `<div class="spk-ans">${warn ? note(warn, 'bad') : ''}
<textarea id="spkText" class="spk-text" rows="4" placeholder="${t('typePh')}"></textarea>
<div class="spk-row">
  <button type="button" class="btn-primary spk-big" id="spkSend">${ic('send')}${t('send')}</button>
  ${opts.repeat ? `<button type="button" class="btn-outline spk-btn" id="spkRep">${ic('volume')}${t('repeat')}</button>` : ''}
  ${SR && !warn ? `<button type="button" class="spk-link" id="spkVoice">${ic('mic')}${t('sayIt')}</button>` : ''}
</div></div>`;
            const ta = $('spkText'); setTimeout(() => ta.focus(), 30);
            $('spkSend').onclick = () => { const v = ta.value.trim(); if (!v) { ta.focus(); return; } close(v, { ms: Date.now() - t0, conf: [], typed: true }); };
            ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('spkSend').click(); };
            if (opts.repeat) $('spkRep').onclick = () => opts.repeat();
            const sv = $('spkVoice'); if (sv) sv.onclick = () => { typing = false; voiceUI(); };
        }
        if (typing) textUI(); else voiceUI();
        return { cancel() { closed = true; clearInterval(timer); Ear.stop(true); } };
    }

    // ───────────── exam ─────────────
    let run = null;   // current session (exam or practice)
    function stopAll() { if (run) { run.dead = true; if (run.box) run.box.cancel(); clearInterval(run.tick); } run = null; Ear.stop(true); stopVoice(); }
    const pick = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);

    function buildExam(NAME) {
        const p1 = pick(B.part1, 1)[0], card2 = pick(B.part2, 1)[0];
        const steps = [];
        steps.push({ p: 1, k: 'say', text: "Good afternoon. My name is " + NAME + ", and I'll be your examiner today. In this first part, I'd like to ask you some questions about yourself." });
        steps.push({ p: 1, k: 'q', text: "Let's talk about what you do. Do you work, or are you a student?", ws: true });
        steps.push({ p: 1, k: 'ws', i: 0, ai: true, topic: 'work or studies' }); steps.push({ p: 1, k: 'ws', i: 1, ai: true, topic: 'work or studies' });
        steps.push({ p: 1, k: 'say', text: "Now let's talk about " + p1.topic.toLowerCase() + '.' });
        p1.q.forEach((q, i) => steps.push({ p: 1, k: 'q', text: q, ai: i > 0, topic: p1.topic }));
        steps.push({ p: 2, k: 'say', text: "Now I'm going to give you a topic, and I'd like you to talk about it for one to two minutes. Before you talk, you'll have one minute to think about what you're going to say. You can make some notes if you wish. Here is your topic." });
        steps.push({ p: 2, k: 'card', card: card2 });
        steps.push({ p: 2, k: 'long', text: "All right. Remember, you have one to two minutes for this, so don't worry if I stop you. I'll tell you when the time is up. Can you start speaking now, please?", card: card2 });
        steps.push({ p: 2, k: 'q', text: card2.round, ai: true, topic: card2.card });
        steps.push({ p: 3, k: 'say', text: "We've been talking about " + card2.title.toLowerCase() + ", and I'd like to discuss with you one or two more general questions related to this." });
        pick(card2.part3, 4).forEach((q, i) => steps.push({ p: 3, k: 'q', text: q, long: true, ai: i > 0, topic: card2.title + ' (general discussion)' }));
        steps.push({ p: 3, k: 'end', text: 'Thank you. That is the end of the speaking test.' });
        return { steps, topic: card2.title, ws: 'study' };
    }

    function examFrame() {
        const st = run.steps[run.i] || {};
        const parts = [1, 2, 3].map((n) => `<span class="spk-pt${st.p === n ? ' on' : st.p > n ? ' done' : ''}">Part ${n}</span>`).join('');
        return `<div class="spk-run">
<div class="spk-bar"><div class="spk-parts">${parts}</div><span class="spk-clock" id="spkTotal">${fmt((Date.now() - run.t0) / 1000)}</span><button type="button" class="spk-link" id="spkExit">${ic('x')}${t('exit')}</button></div>
<div class="spk-stage"><div class="spk-ex" id="spkEx"><div class="spk-ava">${ic('users')}</div><div class="spk-ex-body"><div class="spk-ex-name">${esc(run.name)} · Examiner</div><div class="spk-ex-text" id="spkQ"></div></div></div>
<div id="spkCard"></div><div id="spkAns"></div></div></div>`;
    }
    function bindExit() {
        $('spkExit').onclick = () => {
            const box = $('spkAns'); const was = box.innerHTML;
            const bar = document.createElement('div'); bar.className = 'spk-confirm';
            bar.innerHTML = `<span>${t('exitQ')}</span><button type="button" class="btn-primary spk-btn" data-y>${t('exitYes')}</button><button type="button" class="btn-outline spk-btn" data-n>${t('exitNo')}</button>`;
            app.querySelector('.spk-bar').after(bar);
            bar.querySelector('[data-y]').onclick = () => { stopAll(); hub(); };
            bar.querySelector('[data-n]').onclick = () => bar.remove();
            void was;
        };
    }
    async function startExam() {
        stopAll();
        const name = await voiceName();
        const ex = buildExam(name);
        run = { kind: 'exam', name, steps: ex.steps, topic: ex.topic, i: 0, t0: Date.now(), tr: [], speakMs: 0, conf: [], session: newSession(), dead: false };
        S.view = 'exam';
        render(examFrame()); bindExit();
        run.tick = setInterval(() => { const el = $('spkTotal'); if (el && run) el.textContent = fmt((Date.now() - run.t0) / 1000); }, 1000);
        nextStep();
    }
    function setQ(text, speaking) {
        const q = $('spkQ'), ex = $('spkEx'); if (!q) return;
        q.innerHTML = S.subs || typing ? esc(text) : `<span class="spk-hidden">${ic('volume')}${t('speakingNow')}</span>`;
        ex.classList.toggle('talk', !!speaking);
    }
    function updateParts() {
        const st = run.steps[run.i] || {};
        app.querySelectorAll('.spk-pt').forEach((el, idx) => { const n = idx + 1; el.classList.toggle('on', st.p === n); el.classList.toggle('done', st.p > n); });
    }
    async function nextStep() {
        if (!run || run.dead) return;
        const my = run;
        const st = run.steps[run.i]; if (!st) return evaluate();
        updateParts();
        $('spkCard').innerHTML = ''; $('spkAns').innerHTML = '';
        if (st.k === 'ws') { st.k = 'q'; st.text = B.workStudy[run.ws][st.i]; }
        if (st.k === 'say' || st.k === 'end') {
            run.tr.push({ r: 'e', p: st.p, t: st.text });
            setQ(st.text, true); await say(st.text); if (my.dead) return; setQ(st.text, false);
            run.i++; return st.k === 'end' ? evaluate() : nextStep();
        }
        if (st.k === 'card') return cueCard(st.card);
        if (st.k === 'q' || st.k === 'long') {
            if (st.ai && !st.asked) {
                st.asked = true;
                const q = $('spkQ'); if (q) q.innerHTML = '<span class="spk-dots"><i></i><i></i><i></i></span>';
                st.text = await nextQuestion(st); if (my.dead) return;
            }
            run.tr.push({ r: 'e', p: st.p, t: st.text });
            if (st.k === 'long') $('spkCard').innerHTML = cueHtml(st.card, true);
            setQ(st.text, true); await say(st.text); if (my.dead) return; setQ(st.text, false);
            run.box = answerBox($('spkAns'), {
                autoStopSec: st.k === 'long' ? 120 : 0,
                repeat: st.k === 'long' ? null : async () => { setQ(st.text, true); await say(st.text); setQ(st.text, false); },
                onDone: (text, meta) => {
                    if (my.dead) return;
                    run.tr.push({ r: 's', p: st.p, t: text }); if (!meta.typed) { run.speakMs += meta.ms; run.conf = run.conf.concat(meta.conf); }
                    if (st.ws) run.ws = /stud|school|universit|college|student|pupil/i.test(text) ? 'study' : /\bwork|\bjob\b|employ/i.test(text) ? 'work' : 'study';
                    if (st.k === 'long') { stopVoice(); }
                    run.i++;
                    if (st.k === 'long') { setQ('Thank you.', true); say('Thank you.').then(() => { if (!my.dead) nextStep(); }); }
                    else nextStep();
                },
            });
        }
    }
    // The examiner's next question follows from what the student has just said (AI); the script question is the fallback.
    async function nextQuestion(st) {
        const left = run.steps.slice(run.i + 1).filter((x) => x.p === st.p && (x.k === 'q' || x.k === 'ws')).length;
        const req = ai({ mode: 'speak_q', name: run.name, session: run.session, part: st.p, topic: st.topic || '', planned: st.text, left,
            history: run.tr.slice(-16).map((x) => ({ role: x.r === 's' ? 'student' : 'examiner', part: x.p, text: x.t })) })
            .then((j) => (j && j.say ? String(j.say) : st.text)).catch(() => st.text);
        const slow = new Promise((res) => setTimeout(() => res(st.text), 9000));
        return Promise.race([req, slow]);
    }
    function cueHtml(c, compact) {
        return `<div class="spk-cue${compact ? ' compact' : ''}"><div class="spk-cue-h">${ic('note')}Part 2 · Cue card</div><b>${esc(c.card)}</b><div class="spk-cue-s">You should say:</div><ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
    }
    function cueCard(c) {
        const my = run;
        run.tr.push({ r: 'e', p: 2, t: c.card + ' You should say: ' + c.points.join('; ') + '.' });
        setQ(t('prepHint'), false);
        $('spkCard').innerHTML = cueHtml(c);
        let left = 60;
        $('spkAns').innerHTML = `<div class="spk-ans"><div class="spk-prep"><span>${ic('hourglass')}${t('prep')}</span><em id="spkPrep">1:00</em></div>
<textarea class="spk-text" rows="4" id="spkNotes" placeholder="${t('notesPh')}"></textarea>
<div class="spk-row"><button type="button" class="btn-primary spk-big" id="spkReady">${ic('mic')}${t('ready')}</button></div></div>`;
        const go = () => { if (my.dead || run.i !== my.i) return; clearInterval(tm); run.i++; nextStep(); };
        const tm = setInterval(() => { if (my.dead) return clearInterval(tm); left--; const el = $('spkPrep'); if (el) el.textContent = fmt(left); if (left <= 0) go(); }, 1000);
        $('spkReady').onclick = go;
    }

    // ───────────── practice ─────────────
    async function startPractice(topic) {
        stopAll();
        const name = await voiceName();
        run = { kind: 'practice', name, topic, msgs: [], t0: Date.now(), speakMs: 0, conf: [], session: newSession(), dead: false, turns: 0 };
        S.view = 'practice';
        render(`<div class="spk-run">
<div class="spk-bar"><div class="spk-parts"><span class="spk-pt on">${ic('message')}${esc(topic)}</span></div><span class="spk-clock" id="spkTotal">0:00</span><button type="button" class="spk-link" id="spkExit">${ic('x')}${t('exit')}</button></div>
<div class="spk-chat" id="spkChat"></div><div id="spkAns"></div>
<div class="spk-row spk-end"><button type="button" class="btn-outline spk-btn" id="spkFinish">${ic('check-circle')}${t('finish')}</button></div></div>`);
        bindExit();
        $('spkFinish').onclick = () => evaluate();
        run.tick = setInterval(() => { const el = $('spkTotal'); if (el && run) el.textContent = fmt((Date.now() - run.t0) / 1000); }, 1000);
        practiceTurn();
    }
    function chatHtml() {
        return run.msgs.map((m) => {
            if (m.role === 'assistant') return `<div class="spk-msg a"><div class="spk-ava sm">${ic('users')}</div><div class="spk-bub">${S.subs || typing ? esc(m.text) : `<span class="spk-hidden">${ic('volume')}…</span> <button type="button" class="spk-link spk-show">${t('subs')}</button>`}</div></div>`;
            const fixes = (m.fixes || []).map((f) => `<div class="spk-fix"><b>${t('fix')}:</b> <s>${esc(f.wrong)}</s> → <u>${esc(f.right)}</u>${f.why ? `<i>${esc(f.why)}</i>` : ''}</div>`).join('');
            const better = m.better ? `<div class="spk-fix good"><b>${t('better')}:</b> «${esc(m.better.from)}» → <u>${esc(m.better.to)}</u></div>` : '';
            return `<div class="spk-msg s"><div class="spk-bub">${esc(m.text)}${fixes || better ? `<div class="spk-fixes">${fixes}${better}</div>` : ''}</div></div>`;
        }).join('') + (run.wait ? `<div class="spk-msg a"><div class="spk-ava sm">${ic('users')}</div><div class="spk-bub"><span class="spk-dots"><i></i><i></i><i></i></span></div></div>` : '');
    }
    function drawChat() {
        const c = $('spkChat'); if (!c) return; c.innerHTML = chatHtml();
        c.querySelectorAll('.spk-show').forEach((b) => { b.onclick = () => { S.subs = true; store.set('spkSubs', true); drawChat(); }; });
        c.scrollTop = c.scrollHeight;
        const last = c.lastElementChild; if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest' });
    }
    async function practiceTurn() {
        const my = run; if (!my || my.dead) return;
        run.wait = true; drawChat(); $('spkAns').innerHTML = `<div class="spk-wait small"><span class="spk-spin"></span>${t('thinking').replace('{n}', run.name)}</div>`;
        let j;
        try { j = await ai({ mode: 'speak_turn', name: run.name, topic: run.topic, session: run.session, history: run.msgs.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'student', text: m.text })) }); }
        catch (e) {
            if (my.dead) return; run.wait = false; drawChat();
            if (e.message === 'daily' || e.message === 'denied') { S.msg = { text: t(e.message), kind: 'bad' }; return hub(); }
            $('spkAns').innerHTML = `<div class="spk-ans">${note(t(e.message === 'limit' ? 'limit' : 'err'), 'bad')}<div class="spk-row"><button type="button" class="btn-primary spk-btn" id="spkRetry">${ic('refresh')}${t('retry')}</button></div></div>`;
            $('spkRetry').onclick = () => practiceTurn(); return;
        }
        if (my.dead) return;
        run.wait = false;
        const lastS = run.msgs.slice().reverse().find((m) => m.role === 'student'); if (lastS && !lastS.checked) { lastS.fixes = j.fixes || []; lastS.better = j.better || null; lastS.checked = true; }
        run.msgs.push({ role: 'assistant', text: j.say });
        drawChat();
        if (run.turns >= 12) $('spkAns').innerHTML = note(t('moreTurns'));
        await say(j.say); if (my.dead) return;
        run.box = answerBox($('spkAns'), {
            repeat: async () => { await say(j.say); },
            onDone: (text, meta) => {
                if (my.dead) return;
                run.msgs.push({ role: 'student', text }); run.turns++;
                if (!meta.typed) { run.speakMs += meta.ms; run.conf = run.conf.concat(meta.conf); }
                practiceTurn();
            },
        });
    }

    // ───────────── evaluation + result ─────────────
    function transcript() {
        if (run.kind === 'exam') return run.tr.slice();
        return run.msgs.map((m) => ({ r: m.role === 'assistant' ? 'e' : 's', p: 0, t: m.text }));
    }
    async function evaluate() {
        if (!run || run.dead) return;
        const my = run; if (run.box) run.box.cancel(); Ear.stop(true); stopVoice(); clearInterval(run.tick);
        const tr = transcript();
        const words = tr.filter((x) => x.r === 's').reduce((n, x) => n + wordsOf(x.t), 0);
        if (words < 40) {
            if (run.kind === 'practice') { $('spkAns').innerHTML = note(t('tooShort'), 'bad'); run.box = null; return practiceResume(); }
            S.msg = { text: t('tooShort'), kind: 'bad' }; stopAll(); return hub();
        }
        const secs = Math.round((Date.now() - run.t0) / 1000);
        const wpm = run.speakMs > 15000 ? words / (run.speakMs / 60000) : 0;
        const conf = run.conf.length ? run.conf.reduce((a, b) => a + b, 0) / run.conf.length : 0;
        S.view = 'eval';
        render(card(`<div class="spk-wait"><span class="spk-spin"></span>${t('evaluating')}</div>`));
        let r;
        try { r = await ai({ mode: 'speak_eval', kind: run.kind, session: run.session, confidence: conf, wpm, transcript: tr.map((x) => ({ role: x.r === 's' ? 'student' : 'examiner', part: x.p, text: x.t })) }); }
        catch (e) {
            if (my.dead) return;
            if (e.message === 'tooShort') { S.msg = { text: t('tooShort'), kind: 'bad' }; stopAll(); return hub(); }
            render(card(`${note(t(e.message === 'limit' ? 'limit' : e.message === 'daily' ? 'daily' : 'err'), 'bad')}<div class="spk-row"><button type="button" class="btn-primary spk-btn" id="spkRetry">${ic('refresh')}${t('retry')}</button><button type="button" class="btn-outline spk-btn" id="spkBack">${t('back')}</button></div>`));
            $('spkRetry').onclick = () => evaluate(); $('spkBack').onclick = () => { stopAll(); hub(); }; return;
        }
        if (my.dead) return;
        const p = S.profile || {};
        const doc = {
            uid: S.user.uid, name: ([p.name, p.surname].filter(Boolean).join(' ') || p.nickname || '').slice(0, 80), kind: run.kind, topic: String(run.topic || '').slice(0, 120),
            overall: r.overall, fc: r.fc, lr: r.lr, gra: r.gra, pr: r.pr, words, wpm: Math.round(wpm), secs,
            summary: r.summary || '', strengths: r.strengths || [], improve: r.improve || [], mistakes: r.mistakes || [], vocab: r.vocab || [],
            sample: r.sample || null, parts: r.parts || {}, transcript: tr.slice(0, 120).map((x) => ({ r: x.r, p: x.p || 0, t: String(x.t).slice(0, 3000) })),
        };
        let saved = false;
        try { const ref = await db.collection('speakingResults').add(Object.assign({}, doc, { ts: firebase.firestore.FieldValue.serverTimestamp() })); doc.id = ref.id; saved = true; }
        catch (e) { console.warn('save speaking', e); }
        doc.ts = Date.now();
        if (saved) S.history.unshift(doc);
        stopAll();
        showResult(doc, false, saved);
    }
    function practiceResume() {
        const my = run;
        const last = run.msgs[run.msgs.length - 1];
        const ansEl = $('spkAns'); const warn = ansEl.innerHTML;
        const holder = document.createElement('div'); ansEl.innerHTML = warn; ansEl.appendChild(holder);
        run.tick = setInterval(() => { const el = $('spkTotal'); if (el && run) el.textContent = fmt((Date.now() - run.t0) / 1000); }, 1000);
        run.box = answerBox(holder, {
            repeat: last && last.role === 'assistant' ? async () => { await say(last.text); } : null,
            onDone: (text, meta) => { if (my.dead) return; run.msgs.push({ role: 'student', text }); run.turns++; if (!meta.typed) { run.speakMs += meta.ms; run.conf = run.conf.concat(meta.conf); } practiceTurn(); },
        });
    }
    function showResult(doc, fromHistory, saved) {
        S.view = 'result'; S.result = doc;
        render(`${fromHistory ? '' : note(saved ? t('saved') : t('notSaved'), saved ? '' : 'bad')}
${V.result(doc)}
<div class="spk-row spk-end">
  <button type="button" class="btn-primary spk-btn" id="spkAgain">${ic('refresh')}${t('again')}</button>
  <button type="button" class="btn-outline spk-btn" id="spkHub">${ic('arrow-left')}${t('back')}</button>
  <a class="btn-outline spk-btn" href="dashboard">${ic('chart')}${t('toCab')}</a>
</div>`);
        $('spkAgain').onclick = () => (doc.kind === 'practice' ? startPractice(doc.topic || 'everyday life') : startExam());
        $('spkHub').onclick = () => hub();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ───────────── access ─────────────
    async function checkAccess(user, profile) {
        S.user = user; S.profile = profile || {};
        if (!window.MOCK_AI_URL || typeof db === 'undefined' || !db) { S.access = 'noai'; return hub(); }
        if (!user) { S.access = 'guest'; return hub(); }
        let ok = S.profile.role === 'teacher';
        if (!ok) { try { ok = (await db.collection('admins').doc(user.uid).get()).exists; } catch (e) { ok = false; } }
        if (!ok) { try { ok = !(await db.collection('groups').where('memberUids', 'array-contains', user.uid).limit(1).get()).empty; } catch (e) { ok = false; } }
        S.access = ok ? 'ok' : 'denied';
        if (ok) { try { S.history = await V.load(user.uid); } catch (e) { S.history = []; } }
        if (S.view === 'hub') hub();
    }
    window.addEventListener('starth-auth-ready', (e) => { const d = e.detail || {}; checkAccess(d.user || null, d.profile || window.currentUserProfile); });
    window.addEventListener('starth-lang-changed', () => {
        heading();
        if (S.view === 'hub') hub();
        else if (S.view === 'result' && S.result) showResult(S.result, true);
    });
    window.addEventListener('beforeunload', () => { Ear.stop(true); stopVoice(); });
    hub();
    if (typeof FIREBASE_READY !== 'undefined' && !FIREBASE_READY) { S.access = 'noai'; hub(); }

    window.StarthSpeaking = { _state: S, _ear: Ear, startExam, startPractice, hub };
})();
