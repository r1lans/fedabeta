/* TheStarth — AI assistant on the site (round button bottom-right).
 * Answers questions about TheStarth through the same AI helper as the mock tests (worker/mock-ai-worker.js, mode "assistant").
 * Address of the helper: window.MOCK_AI_URL in mock-config.js. While it is empty the button is not shown at all.
 * Voice: the microphone uses the browser's speech recognition; answers can be read aloud with the browser's voice
 * (works in Chrome / Edge / Safari; where there is no voice for the language the speaker button simply hides).
 */
(function () {
    'use strict';
    if (window.__starthAssistant) return; window.__starthAssistant = true;

    const L = {
        ru: { open: 'Задать вопрос', title: 'Помощник TheStarth', sub: 'Отвечу на вопросы о курсах, ценах и учителях',
            hi: 'Привет! Я помощник TheStarth. Спросите про курсы, цены, учителей или как записаться на бесплатный урок.',
            ph: 'Напишите вопрос…', send: 'Отправить', mic: 'Сказать голосом', micStop: 'Остановить запись', listen: 'Слушаю…',
            voiceOn: 'Читать ответы вслух: вкл.', voiceOff: 'Читать ответы вслух: выкл.', close: 'Закрыть', clear: 'Начать заново',
            typing: 'Печатает…', err: 'Не получилось ответить. Попробуйте ещё раз или напишите нам в Telegram: t.me/TheStarth',
            limit: 'Сейчас помощник не может ответить: лимит вопросов на сегодня закончился. Если у вас есть вопросы — позвоните нам: +998 91 867 97 77, или задайте свой вопрос здесь, и куратор ответит вам.',
            fName: 'Ваше имя', fPhone: 'Телефон', fMsg: 'Ваш вопрос', fSend: 'Отправить вопрос', fThanks: 'Спасибо! Вопрос отправлен — куратор свяжется с вами в течение рабочего дня.', fNeed: 'Укажите имя и телефон.',
            noMic: 'Ваш браузер не поддерживает голосовой ввод. Попробуйте Chrome или напишите текстом.', micDenied: 'Нет доступа к микрофону. Разрешите его в настройках браузера.',
            book: 'Записаться на бесплатный урок', tg: 'Написать в Telegram',
            call: 'Голосовой звонок', callChip: '📞 Поговорить голосом', listenS: 'Слушаю…', thinkS: 'Думаю…', speakS: 'Говорю… нажмите, чтобы перебить', pausedS: 'Нажмите на круг и говорите', mutedS: 'Микрофон выключен',
            end: 'Завершить', mute: 'Выключить микрофон', unmute: 'Включить микрофон', callHi: 'Здравствуйте! Я помощник TheStarth. Чем могу помочь?',
            noCall: 'Голосовой звонок работает в Chrome, Edge и Safari. Откройте сайт в одном из них.',
            q: ['Сколько стоит обучение?', 'Как проходят уроки?', 'Как записаться на пробный урок?', 'Какие есть учителя?'] },
        uz: { open: 'Savol berish', title: 'TheStarth yordamchisi', sub: 'Kurslar, narxlar va o\'qituvchilar haqida javob beraman',
            hi: 'Salom! Men TheStarth yordamchisiman. Kurslar, narxlar, o\'qituvchilar yoki bepul darsga yozilish haqida so\'rang.',
            ph: 'Savolingizni yozing…', send: 'Yuborish', mic: 'Ovoz bilan aytish', micStop: 'Yozishni to\'xtatish', listen: 'Eshityapman…',
            voiceOn: 'Javoblarni ovoz bilan o\'qish: yoqilgan', voiceOff: 'Javoblarni ovoz bilan o\'qish: o\'chirilgan', close: 'Yopish', clear: 'Qaytadan boshlash',
            typing: 'Yozmoqda…', err: 'Javob berib bo\'lmadi. Qayta urinib ko\'ring yoki Telegram orqali yozing: t.me/TheStarth',
            limit: 'Hozir yordamchi javob bera olmaydi: bugungi savollar limiti tugadi. Savollaringiz bo\'lsa — bizga qo\'ng\'iroq qiling: +998 91 867 97 77, yoki savolingizni shu yerda qoldiring, kurator sizga javob beradi.',
            fName: 'Ismingiz', fPhone: 'Telefon', fMsg: 'Savolingiz', fSend: 'Savolni yuborish', fThanks: 'Rahmat! Savol yuborildi — kurator ish kuni davomida siz bilan bog\'lanadi.', fNeed: 'Ism va telefonni kiriting.',
            noMic: 'Brauzeringiz ovozli kiritishni qo\'llab-quvvatlamaydi. Chrome\'ni sinab ko\'ring yoki matn bilan yozing.', micDenied: 'Mikrofonga ruxsat yo\'q. Uni brauzer sozlamalarida yoqing.',
            book: 'Bepul darsga yozilish', tg: 'Telegram\'da yozish',
            call: 'Ovozli qo\'ng\'iroq', callChip: '📞 Ovoz bilan gaplashish', listenS: 'Eshityapman…', thinkS: 'O\'ylayapman…', speakS: 'Gapiryapman… bo\'lish uchun bosing', pausedS: 'Doirani bosing va gapiring', mutedS: 'Mikrofon o\'chirilgan',
            end: 'Tugatish', mute: 'Mikrofonni o\'chirish', unmute: 'Mikrofonni yoqish', callHi: 'Assalomu alaykum! Men TheStarth yordamchisiman. Sizga qanday yordam bera olaman?',
            noCall: 'Ovozli qo\'ng\'iroq Chrome, Edge va Safari\'da ishlaydi. Saytni ulardan birida oching.',
            q: ['O\'qish qancha turadi?', 'Darslar qanday o\'tadi?', 'Sinov darsiga qanday yozilaman?', 'Qanday o\'qituvchilar bor?'] },
        en: { open: 'Ask a question', title: 'TheStarth assistant', sub: 'Ask me about courses, prices and teachers',
            hi: 'Hi! I\'m the TheStarth assistant. Ask about courses, prices, teachers or how to book a free lesson.',
            ph: 'Type your question…', send: 'Send', mic: 'Speak', micStop: 'Stop recording', listen: 'Listening…',
            voiceOn: 'Read answers aloud: on', voiceOff: 'Read answers aloud: off', close: 'Close', clear: 'Start over',
            typing: 'Typing…', err: 'Couldn\'t answer. Please try again or message us on Telegram: t.me/TheStarth',
            limit: 'The assistant can\'t answer right now: today\'s question limit is used up. If you have questions, call us: +998 91 867 97 77, or leave your question here and a curator will get back to you.',
            fName: 'Your name', fPhone: 'Phone', fMsg: 'Your question', fSend: 'Send question', fThanks: 'Thank you! Your question has been sent — a curator will contact you within a working day.', fNeed: 'Please enter your name and phone.',
            noMic: 'Your browser doesn\'t support voice input. Try Chrome or type your question.', micDenied: 'No access to the microphone. Allow it in your browser settings.',
            book: 'Book a free lesson', tg: 'Message on Telegram',
            call: 'Voice call', callChip: '📞 Talk by voice', listenS: 'Listening…', thinkS: 'Thinking…', speakS: 'Speaking… tap to interrupt', pausedS: 'Tap the circle and speak', mutedS: 'Microphone is off',
            end: 'End', mute: 'Mute microphone', unmute: 'Unmute microphone', callHi: 'Hi! I\'m the TheStarth assistant. How can I help?',
            noCall: 'Voice calls work in Chrome, Edge and Safari. Please open the site in one of them.',
            q: ['How much does it cost?', 'How do lessons work?', 'How do I book a trial lesson?', 'Who are the teachers?'] },
    };
    const SPEECH_LANG = { ru: 'ru-RU', uz: 'uz-UZ', en: 'en-US' };
    const lang = () => { try { const l = localStorage.getItem('starthLang'); return L[l] ? l : 'ru'; } catch (e) { return 'ru'; } };
    const T = () => L[lang()];
    const store = {
        get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
        lget(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // tiny, safe formatting: **bold**, links (t.me / https / thestarth pages / phone), line breaks, "- " lists
    function fmt(text) {
        let h = esc(text);
        h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        h = h.replace(/(https?:\/\/[^\s<)]+[^\s<).,!?])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        h = h.replace(/(^|[\s(])((?:t\.me|instagram\.com)\/[A-Za-z0-9_.\/]+[A-Za-z0-9_])/g, '$1<a href="https://$2" target="_blank" rel="noopener">$2</a>');
        h = h.replace(/(^|[\s(])((?:https?:\/\/)?thestarth\.com\/(?:level-test|math-test|mock-exam|payment|careers|about|news|results|teacher)(?:\.html)?(?:\?[^\s<)]*)?)(?=[\s).,!?]|$)/g, (m, a, b) => a + '<a href="' + (/^http/.test(b) ? b : 'https://' + b) + '">' + b + '</a>');
        h = h.replace(/(\+998[\d ]{9,14}\d)/g, (m) => '<a href="tel:' + m.replace(/\s/g, '') + '">' + m + '</a>');
        h = h.split('\n').map((ln) => /^\s*[-•]\s+/.test(ln) ? '<span class="sa-li">' + ln.replace(/^\s*[-•]\s+/, '') + '</span>' : ln).join('<br>');
        return h.replace(/<\/span><br>(?=<span class="sa-li">)/g, '</span>');
    }

    const CSS = `
.sa-fab{position:fixed;right:18px;bottom:18px;z-index:2500;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:radial-gradient(circle at 35% 30%,#f7cf5a,#e6a91e 70%);color:#1b1b1f;box-shadow:0 8px 24px rgba(0,0,0,.28),0 0 0 4px rgba(230,169,30,.18);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,bottom .4s ease}
.sa-fab:hover{transform:scale(1.06)}.sa-fab svg{width:27px;height:27px}
.sa-form2{align-self:stretch;display:flex;flex-direction:column;gap:7px;background:var(--paper,#fff);border:1px solid var(--rule,#e5e0d5);border-radius:14px;padding:10px}
.sa-form2 input,.sa-form2 textarea{border:1px solid var(--rule,#e5e0d5);border-radius:10px;padding:8px 10px;font:inherit;font-size:.88rem;background:var(--paper,#fff);color:var(--ink,#1a1a1a);resize:vertical}
.sa-form2 button{border:0;border-radius:10px;padding:9px;background:var(--accent,#8f5a0c);color:var(--on-accent,#fff);font:inherit;font-weight:600;font-size:.88rem;cursor:pointer}
.sa-form2 .sa-fmsg{font-size:.8rem;color:#8a1f11}
.sa-fab .sa-dot{position:absolute;top:6px;right:6px;width:12px;height:12px;border-radius:50%;background:#2ecc71;border:2px solid var(--paper,#fff)}
body.cookie-open .sa-fab{bottom:calc(18px + var(--cookie-h,0px))}
.sa-fab.sa-lift{bottom:96px}
.sa-panel{position:fixed;right:18px;bottom:88px;z-index:2501;width:370px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 110px);display:none;flex-direction:column;background:var(--paper,#fff);color:var(--ink,#1a1a1a);border:1px solid var(--rule,#e5e0d5);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden;font-family:inherit}
.sa-panel.open{display:flex}
.sa-head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;background:var(--accent,#8f5a0c);color:var(--on-accent,#fff)}
.sa-head .sa-av{width:36px;height:36px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f7cf5a,#e6a91e 70%);color:#1b1b1f;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.sa-head .sa-av svg{width:20px;height:20px}
.sa-head .sa-t{flex:1;min-width:0}.sa-head strong{display:block;font-size:.98rem}.sa-head small{display:block;font-size:.74rem;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-hb{background:transparent;border:0;color:inherit;width:34px;height:34px;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.sa-hb:hover{background:rgba(255,255,255,.16)}.sa-hb svg{width:19px;height:19px}.sa-hb[aria-pressed="false"]{opacity:.6}
.sa-list{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:9px;background:var(--paper-alt,#f6f2ea)}
.sa-m{max-width:86%;padding:9px 12px;border-radius:14px;font-size:.92rem;line-height:1.45;word-wrap:break-word;overflow-wrap:anywhere}
.sa-m a{color:inherit;text-decoration:underline}.sa-m .sa-li{display:block;padding-left:14px;position:relative}.sa-m .sa-li:before{content:'•';position:absolute;left:2px}
.sa-bot{align-self:flex-start;background:var(--paper,#fff);border:1px solid var(--rule,#e5e0d5);border-bottom-left-radius:4px}
.sa-me{align-self:flex-end;background:var(--accent,#8f5a0c);color:var(--on-accent,#fff);border-bottom-right-radius:4px}
.sa-err{align-self:flex-start;background:#fdecea;color:#8a1f11;border:1px solid #f5c6c0}
.sa-typing{align-self:flex-start;color:var(--ink-soft,#666);font-size:.82rem;padding:2px 4px}
.sa-chips{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 2px}
.sa-chip{border:1px solid var(--accent,#8f5a0c);background:transparent;color:var(--accent,#8f5a0c);border-radius:999px;padding:5px 11px;font-size:.8rem;cursor:pointer;font-family:inherit}
.sa-chip:hover{background:var(--accent-tint,rgba(143,90,12,.1))}
.sa-acts{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--rule,#e5e0d5);background:var(--paper,#fff)}
.sa-act{flex:1 1 auto;text-align:center;font-size:.78rem;padding:6px 8px;border-radius:9px;border:1px solid var(--rule,#e5e0d5);color:var(--ink,#1a1a1a);text-decoration:none;background:transparent;cursor:pointer;font-family:inherit}
.sa-act:hover{border-color:var(--accent,#8f5a0c);color:var(--accent,#8f5a0c)}
.sa-form{display:flex;gap:6px;padding:10px;border-top:1px solid var(--rule,#e5e0d5);background:var(--paper,#fff);align-items:flex-end}
.sa-in{flex:1;resize:none;border:1px solid var(--rule,#e5e0d5);border-radius:12px;padding:9px 11px;font:inherit;font-size:.92rem;max-height:110px;min-height:40px;background:var(--paper,#fff);color:var(--ink,#1a1a1a);outline:none;line-height:1.35}
.sa-in:focus{border-color:var(--accent,#8f5a0c)}
.sa-ib{width:40px;height:40px;flex:0 0 auto;border-radius:50%;border:1px solid var(--rule,#e5e0d5);background:transparent;color:var(--ink,#1a1a1a);cursor:pointer;display:flex;align-items:center;justify-content:center}
.sa-ib svg{width:19px;height:19px}.sa-send{background:var(--accent,#8f5a0c);border-color:var(--accent,#8f5a0c);color:var(--on-accent,#fff)}.sa-send:disabled{opacity:.5;cursor:default}
.sa-mic.rec{background:#e74c3c;border-color:#e74c3c;color:#fff;animation:saPulse 1.2s infinite}
@keyframes saPulse{0%{box-shadow:0 0 0 0 rgba(231,76,60,.5)}70%{box-shadow:0 0 0 10px rgba(231,76,60,0)}100%{box-shadow:0 0 0 0 rgba(231,76,60,0)}}
.sa-call-ov{position:absolute;inset:0;z-index:5;display:none;flex-direction:column;align-items:center;justify-content:space-between;padding:22px 18px 26px;color:#fff;background:radial-gradient(circle at 50% 35%,#2a2620 0%,#121114 70%)}
.sa-call-ov.on{display:flex}
.sa-call-top{text-align:center}.sa-clang{display:flex;gap:6px;justify-content:center;margin-top:10px}
.sa-clang button{border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;border-radius:999px;padding:3px 11px;font:inherit;font-size:.75rem;cursor:pointer}
.sa-clang button.on{background:#f0b429;border-color:#f0b429;color:#111;font-weight:700}.sa-call-top strong{display:block;font-size:1rem}.sa-call-top small{opacity:.7;font-size:.78rem}
.sa-orb{width:170px;height:170px;border-radius:50%;border:0;cursor:pointer;background:radial-gradient(circle at 35% 30%,#ffe08a,#f0b429 45%,#b97a0e 100%);box-shadow:0 0 60px rgba(240,180,41,.35);transition:transform .25s ease;position:relative}
.sa-orb:before{content:'';position:absolute;inset:-14px;border-radius:50%;border:2px solid rgba(240,180,41,.35);opacity:0}
.sa-call-ov[data-s="listen"] .sa-orb{animation:saBreath 1.6s ease-in-out infinite}
.sa-call-ov[data-s="listen"] .sa-orb:before{opacity:1;animation:saRing 1.6s ease-out infinite}
.sa-call-ov[data-s="think"] .sa-orb{animation:saThink 1s linear infinite;filter:saturate(.8)}
.sa-call-ov[data-s="speak"] .sa-orb{animation:saTalk .45s ease-in-out infinite alternate}
.sa-call-ov[data-s="paused"] .sa-orb,.sa-call-ov[data-s="muted"] .sa-orb{opacity:.55}
@keyframes saBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes saRing{0%{transform:scale(.92);opacity:.8}100%{transform:scale(1.25);opacity:0}}
@keyframes saThink{0%{transform:rotate(0) scale(.94)}100%{transform:rotate(360deg) scale(.94)}}
@keyframes saTalk{0%{transform:scale(.97)}100%{transform:scale(1.09)}}
.sa-call-st{font-size:.9rem;opacity:.85;min-height:1.3em;text-align:center}
.sa-call-cap{font-size:.95rem;line-height:1.45;text-align:center;min-height:4.4em;max-height:9em;overflow:auto;padding:0 6px;opacity:.95}
.sa-call-cap .me{color:#f3d27a}
.sa-call-btns{display:flex;gap:26px}
.sa-cb{width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.14);color:#fff}
.sa-cb svg{width:24px;height:24px}.sa-cb.end{background:#e5484d}.sa-cb[aria-pressed="true"]{background:#fff;color:#111}
.sa-chip.call{border-style:solid;background:var(--accent,#8f5a0c);color:var(--on-accent,#fff)}
@media (prefers-reduced-motion:reduce){.sa-orb,.sa-orb:before{animation:none!important}}
@media (max-width:640px){.sa-panel{right:0;left:0;bottom:0;width:100%;max-width:100%;height:100%;max-height:100%;border-radius:0}.sa-fab{right:14px;bottom:14px;width:54px;height:54px}}
@media (prefers-reduced-motion:reduce){.sa-mic.rec{animation:none}}`;
    const I = {
        chat: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 3.5h14A2.5 2.5 0 0 1 21.5 6v9a2.5 2.5 0 0 1-2.5 2.5H9.2L5 21v-3.5A2.5 2.5 0 0 1 2.5 15V6A2.5 2.5 0 0 1 5 3.5Z"/><path d="M7 8.3h10M7 11.3h10M7 14.3h6" stroke="#f2bf3f" stroke-width="1.7" stroke-linecap="round"/></svg>',
        x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
        send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
        mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
        spk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
        phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>',
        hang: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-3.4 0-6.6 1-9.3 2.9-.6.4-.8 1.2-.4 1.8l1.6 2.4c.4.6 1.2.8 1.8.4l2.3-1.5c.4-.3.6-.8.5-1.3l-.3-1.6c1.2-.4 2.5-.6 3.8-.6s2.6.2 3.8.6l-.3 1.6c-.1.5.1 1 .5 1.3l2.3 1.5c.6.4 1.4.2 1.8-.4l1.6-2.4c.4-.6.2-1.4-.4-1.8C18.6 10 15.4 9 12 9Z"/></svg>',
        micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18"/></svg>',
        redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/></svg>',
    };

    let root, panel, list, input, sendBtn, micBtn, spkBtn, busy = false;
    let history = store.get('saHistory', []);     // [{role, content}]
    let voiceOn = store.lget('saVoice', false);

    function build() {
        const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        root = document.createElement('div'); root.className = 'sa-root';
        root.innerHTML = '<button type="button" class="sa-fab" aria-haspopup="dialog" aria-expanded="false">' + I.chat + '<span class="sa-dot"></span></button>' +
            '<div class="sa-panel" role="dialog" aria-modal="false" aria-labelledby="sa-title">' +
            '<div class="sa-head"><div class="sa-av">' + I.chat + '</div><div class="sa-t"><strong id="sa-title"></strong><small class="sa-sub"></small></div>' +
            '<button type="button" class="sa-hb sa-callbtn">' + I.phone + '</button><button type="button" class="sa-hb sa-spk">' + I.spk + '</button><button type="button" class="sa-hb sa-clear">' + I.redo + '</button><button type="button" class="sa-hb sa-close">' + I.x + '</button></div>' +
            '<div class="sa-call-ov" data-s="idle" role="dialog" aria-live="polite"><div class="sa-call-top"><strong class="sa-ct"></strong><small class="sa-ctime">0:00</small>' +
            '<div class="sa-clang" role="group"><button type="button" data-l="ru">RU</button><button type="button" data-l="uz">UZ</button><button type="button" data-l="en">EN</button></div></div>' +
            '<button type="button" class="sa-orb"></button><div class="sa-call-st"></div><div class="sa-call-cap"></div>' +
            '<div class="sa-call-btns"><button type="button" class="sa-cb sa-cmute" aria-pressed="false">' + I.mic + '</button><button type="button" class="sa-cb end sa-cend">' + I.hang + '</button></div></div>' +
            '<div class="sa-list" aria-live="polite"></div>' +
            '<div class="sa-acts"><a class="sa-act sa-book" href="./#pricing"></a><a class="sa-act sa-tg" href="https://t.me/TheStarth" target="_blank" rel="noopener"></a></div>' +
            '<form class="sa-form"><button type="button" class="sa-ib sa-mic">' + I.mic + '</button><textarea class="sa-in" rows="1" maxlength="600"></textarea><button type="submit" class="sa-ib sa-send">' + I.send + '</button></form></div>';
        document.body.appendChild(root);
        panel = root.querySelector('.sa-panel'); list = root.querySelector('.sa-list'); input = root.querySelector('.sa-in');
        sendBtn = root.querySelector('.sa-send'); micBtn = root.querySelector('.sa-mic'); spkBtn = root.querySelector('.sa-spk');
        const fab = root.querySelector('.sa-fab');
        fab.addEventListener('click', () => toggle(!panel.classList.contains('open')));
        root.querySelector('.sa-close').addEventListener('click', () => toggle(false));
        root.querySelector('.sa-clear').addEventListener('click', () => { stopSpeak(); history = []; store.set('saHistory', history); render(); input.focus(); });
        spkBtn.addEventListener('click', () => { voiceOn = !voiceOn; store.lset('saVoice', voiceOn); if (!voiceOn) stopSpeak(); labels(); });
        root.querySelector('.sa-book').addEventListener('click', (e) => {
            const m = document.getElementById('appModal');
            if (m) { e.preventDefault(); toggle(false); m.classList.add('show'); }
        });
        root.querySelector('.sa-form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
        input.addEventListener('input', grow);
        micBtn.addEventListener('click', toggleMic);
        root.querySelector('.sa-callbtn').addEventListener('click', startCall);
        root.querySelector('.sa-cend').addEventListener('click', endCall);
        root.querySelector('.sa-cmute').addEventListener('click', toggleMute);
        root.querySelector('.sa-orb').addEventListener('click', orbTap);
        root.querySelectorAll('.sa-clang button').forEach((b) => b.addEventListener('click', () => setCallLang(b.dataset.l)));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) toggle(false); });
        window.addEventListener('starth-lang-changed', () => { labels(); render(); });
        labels(); render();
        // On the home page the intro video has its own buttons in the bottom-right corner ("Включить звук", "Пропустить"):
        // while they are on screen the chat button moves up so it never covers them.
        const ctl = document.getElementById('introSkip') || document.getElementById('introSound');
        if (ctl && ctl.parentElement && 'IntersectionObserver' in window) {
            new IntersectionObserver((es) => { fab.classList.toggle('sa-lift', es.some((e) => e.isIntersecting)); }).observe(ctl.parentElement);
        }
    }
    function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 110) + 'px'; }
    function labels() {
        const t = T();
        const fab = root.querySelector('.sa-fab'); fab.setAttribute('aria-label', t.open); fab.title = t.open;
        root.querySelector('#sa-title').textContent = t.title; root.querySelector('.sa-sub').textContent = t.sub;
        input.placeholder = t.ph; sendBtn.setAttribute('aria-label', t.send); sendBtn.title = t.send;
        micBtn.setAttribute('aria-label', rec ? t.micStop : t.mic); micBtn.title = rec ? t.micStop : t.mic;
        const cl = root.querySelector('.sa-clear'); cl.setAttribute('aria-label', t.clear); cl.title = t.clear;
        const cx = root.querySelector('.sa-close'); cx.setAttribute('aria-label', t.close); cx.title = t.close;
        spkBtn.setAttribute('aria-pressed', voiceOn ? 'true' : 'false'); spkBtn.title = voiceOn ? t.voiceOn : t.voiceOff; spkBtn.setAttribute('aria-label', spkBtn.title);
        spkBtn.style.display = canSpeak() ? '' : 'none';
        micBtn.style.display = SR ? '' : 'none';
        const cb = root.querySelector('.sa-callbtn'); cb.title = t.call; cb.setAttribute('aria-label', t.call); cb.style.display = SR ? '' : 'none';
        root.querySelector('.sa-ct').textContent = t.title;
        root.querySelector('.sa-cend').title = t.end; root.querySelector('.sa-cend').setAttribute('aria-label', t.end);
        const cm = root.querySelector('.sa-cmute'); cm.title = call.muted ? t.unmute : t.mute; cm.setAttribute('aria-label', cm.title);
        root.querySelector('.sa-book').textContent = t.book; root.querySelector('.sa-tg').textContent = t.tg;
    }
    function toggle(open) {
        panel.classList.toggle('open', open);
        root.querySelector('.sa-fab').setAttribute('aria-expanded', open ? 'true' : 'false');
        root.querySelector('.sa-fab').style.display = open && window.innerWidth <= 640 ? 'none' : '';
        const dot = root.querySelector('.sa-dot'); if (dot) dot.remove();
        if (open) { setTimeout(() => input.focus(), 50); list.scrollTop = list.scrollHeight; } else { stopSpeak(); stopMic(); if (call.on) endCall(); }
    }
    function bubble(cls, html) { const d = document.createElement('div'); d.className = 'sa-m ' + cls; d.innerHTML = html; list.appendChild(d); return d; }
    function render() {
        const t = T(); list.innerHTML = '';
        bubble('sa-bot', fmt(t.hi));
        if (!history.length) {
            const c = document.createElement('div'); c.className = 'sa-chips';
            if (SR) { const cc = document.createElement('button'); cc.type = 'button'; cc.className = 'sa-chip call'; cc.textContent = t.callChip; cc.onclick = startCall; c.appendChild(cc); }
            t.q.forEach((q) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sa-chip'; b.textContent = q; b.onclick = () => ask(q); c.appendChild(b); });
            list.appendChild(c);
        }
        history.forEach((m) => bubble(m.role === 'user' ? 'sa-me' : 'sa-bot', fmt(m.content)));
        list.scrollTop = list.scrollHeight;
    }
    async function ask(text) {
        text = String(text || '').trim(); if (!text || busy) return;
        stopMic(); stopSpeak();
        busy = true; sendBtn.disabled = true; input.value = ''; grow();
        history.push({ role: 'user', content: text.slice(0, 600) }); store.set('saHistory', history); render();
        const typing = document.createElement('div'); typing.className = 'sa-typing'; typing.textContent = T().typing; list.appendChild(typing); list.scrollTop = list.scrollHeight;
        const res = await callAI(false); const answer = res.text || '', errKey = res.err || '';
        typing.remove();
        if (answer) { history.push({ role: 'assistant', content: answer }); store.set('saHistory', history); render(); speak(answer); }
        else if (errKey === 'limit') { history.pop(); store.set('saHistory', history); render(); bubble('sa-bot', fmt(T().limit)); askForm(text); }
        else { history.pop(); store.set('saHistory', history); render(); bubble('sa-err', fmt(T()[errKey])); list.scrollTop = list.scrollHeight; input.value = text; grow(); }
        busy = false; sendBtn.disabled = false;
    }

    async function callAI(voice) {
        try {
            const ctrl = 'AbortController' in window ? new AbortController() : null;
            const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, 45000);
            const r = await fetch(window.MOCK_AI_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl ? ctrl.signal : undefined,
                body: JSON.stringify({ mode: 'assistant', voice: !!voice, lang: voice ? vlang() : lang(), page: location.pathname.split('/').pop() || 'index', messages: history.slice(-10) }),
            });
            clearTimeout(timer);
            const j = await r.json().catch(() => ({}));
            if (r.status === 429 || (r.status === 502 && j.error === 'ai')) return { err: 'limit' };
            if (!r.ok || !j.text) return { err: 'err' };
            return { text: String(j.text) };
        } catch (e) { return { err: 'err' }; }
    }

    // When the assistant can't answer (limit used up): a small form right in the chat — the question goes to
    // the Google Sheet tab "Contacts", exactly like the "Остались вопросы?" form on the home page.
    function askForm(question) {
        const t = T(), f = document.createElement('form'); f.className = 'sa-form2';
        f.innerHTML = '<input name="n" maxlength="80" autocomplete="name" placeholder="' + esc(t.fName) + '">' +
            '<input name="p" type="tel" data-nophone maxlength="25" autocomplete="tel" placeholder="' + esc(t.fPhone) + ': +998 90 123 45 67">' +
            '<textarea name="m" rows="2" maxlength="600" placeholder="' + esc(t.fMsg) + '"></textarea>' +
            '<div class="sa-fmsg" hidden></div><button type="submit">' + esc(t.fSend) + '</button>';
        f.elements.m.value = question || '';
        f.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = f.elements.n.value.trim(), phone = f.elements.p.value.trim(), message = f.elements.m.value.trim();
            const msg = f.querySelector('.sa-fmsg');
            if (!name || phone.replace(/\D/g, '').length < 7) { msg.textContent = T().fNeed; msg.hidden = false; return; }
            if (typeof window.logToSheet === 'function') window.logToSheet('log_contact', { name, phone, message: '[ИИ-помощник] ' + message });
            f.replaceWith(Object.assign(document.createElement('div'), { className: 'sa-m sa-bot', innerHTML: fmt(T().fThanks) }));
            input.value = ''; grow();
        });
        list.appendChild(f); list.scrollTop = list.scrollHeight;
        setTimeout(() => f.elements.n.focus(), 50);
    }

    // ── voice input ──
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;
    function toggleMic() { if (rec) stopMic(); else startMic(); }
    function startMic() {
        if (!SR) { bubble('sa-err', fmt(T().noMic)); return; }
        stopSpeak();
        const r = new SR(); rec = r;
        r.lang = SPEECH_LANG[lang()]; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
        const before = input.value ? input.value.trim() + ' ' : '';
        let finalText = '';
        r.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) { const tr = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += tr; else interim += tr; }
            input.value = before + finalText + interim; grow();
        };
        r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') bubble('sa-err', fmt(T().micDenied)); };
        r.onend = () => { const was = rec === r; rec = null; micBtn.classList.remove('rec'); input.placeholder = T().ph; labels(); if (was && finalText.trim()) ask(input.value); };
        try { r.start(); micBtn.classList.add('rec'); input.placeholder = T().listen; labels(); } catch (e) { rec = null; }
    }
    function stopMic() { if (rec) { const r = rec; rec = null; try { r.stop(); } catch (e) {} micBtn.classList.remove('rec'); } }

    // ── voice output ──
    // 1) If the helper has a premium voice (Microsoft Azure neural voices, incl. Uzbek) it returns an mp3 — sounds like a person.
    // 2) Otherwise the browser's own voice: we pick the most natural one available ("Natural"/"Online"/"Google"/"Premium")
    //    and speak sentence by sentence (sounds smoother and avoids Chrome cutting long texts).
    const synth = window.speechSynthesis;
    const vlang = () => (call.on && call.lang) || lang();
    let premium = store.get('saTTS', null);      // null = unknown, true / false after the first try
    const audio = typeof Audio !== 'undefined' ? new Audio() : null;
    let sayToken = 0;
    function scoreVoice(v, l) {
        const code = (SPEECH_LANG[l] || (l + '-' + l)).toLowerCase(), vl = String(v.lang || '').toLowerCase().replace('_', '-'), n = String(v.name || '');
        if (!(vl === code || vl.startsWith(l))) return -1;
        let sc = vl === code ? 2 : 1;
        if (/natural/i.test(n)) sc += 6; if (/online/i.test(n)) sc += 4; if (/neural/i.test(n)) sc += 4;
        if (/google/i.test(n)) sc += 3; if (/premium|enhanced|siri/i.test(n)) sc += 3;
        if (/compact|espeak/i.test(n)) sc -= 3; if (v.localService === false) sc += 1;
        return sc;
    }
    function exactVoice(l) {
        if (!synth) return null;
        let best = null, bs = -1;
        (synth.getVoices() || []).forEach((v) => { const sc = scoreVoice(v, l); if (sc > bs) { bs = sc; best = v; } });
        return bs >= 0 ? best : null;
    }
    function voiceFor(l) { return exactVoice(l) || (l === 'uz' ? exactVoice('tr') : null); }
    function canSpeak() { return premium === true || !!(synth && voiceFor(lang())); }
    if (synth && 'onvoiceschanged' in synth) synth.onvoiceschanged = () => { if (root) labels(); };
    const cleanSpeech = (text) => String(text).replace(/\*\*/g, '').replace(/https?:\/\/\S+/g, '').replace(/\b(?:t\.me|instagram\.com)\/\S+/g, '').replace(/[•#*_]/g, '').replace(/\s*\n+\s*[-–]?\s*/g, '. ').replace(/\s+/g, ' ').trim();
    // How the voice should pronounce our words and numbers (otherwise "TheStarth" sounds like "тистарт", "IELTS" letter by letter,
    // and "7.5" gets a pause in the middle).
    const SAY = {
        ru: [[/the\s?starth/gi, 'Зе Старз'], [/\bIELTS\b/g, 'айелтс'], [/\bSAT\b/g, 'сат'], [/\bMock\b/gi, 'мок'], [/\bSpeaking\b/g, 'спикинг'], [/\bWriting\b/g, 'райтинг'], [/\bReading\b/g, 'ридинг'], [/\bListening\b/g, 'лиснинг'],
            [/(\d+)[.,]5\b/g, '$1 с половиной'], [/(\d+)[.,](\d)\b/g, '$1 и $2'], [/\$\s?(\d+)/g, '$1 долларов'], [/(\d+)\s?\$/g, '$1 долларов'], [/1-на-1/g, 'один на один'], [/\bTelegram\b/gi, 'телеграм'], [/\bPayme\b/gi, 'пэйми'], [/\bClick\b/g, 'клик']],
        uz: [[/the\s?starth/gi, 'Ze Starz'], [/\bIELTS\b/g, 'ayelts'], [/\bSAT\b/g, 'sat'], [/(\d+)[.,]5\b/g, '$1 yarim'], [/(\d+)[.,](\d)\b/g, '$1 butun $2'], [/\$\s?(\d+)/g, '$1 dollar'], [/(\d+)\s?\$/g, '$1 dollar']],
        en: [[/the\s?starth/gi, 'The Starz'], [/\$\s?(\d+)/g, '$1 dollars'], [/1-on-1/gi, 'one on one']],
    };
    function speechText(text) {
        const l = vlang(); let t = cleanSpeech(text); (SAY[l] || []).forEach(([re, to]) => { t = t.replace(re, to); });
        // No Uzbek voice on this device: a Turkish voice reads Uzbek Latin text almost right once the letters are mapped.
        if (l === 'uz' && !exactVoice('uz') && exactVoice('tr')) t = t.replace(/[gG][ʻ'’`‘]/g, 'ğ').replace(/[oO][ʻ'’`‘]/g, 'o').replace(/sh/g, 'ş').replace(/Sh/g, 'Ş').replace(/ch/g, 'ç').replace(/Ch/g, 'Ç').replace(/j/g, 'c').replace(/J/g, 'C').replace(/x/g, 'h').replace(/X/g, 'H').replace(/q/g, 'k').replace(/Q/g, 'K');
        return t;
    }
    // Split only at real sentence ends (punctuation followed by a space), and glue short sentences together: fewer pauses.
    function chunks(t) {
        const out = []; let cur = '';
        t.split(/(?<=[.!?…])\s+/).forEach((sn) => { if ((cur + ' ' + sn).length > 220 && cur) { out.push(cur); cur = sn; } else cur = cur ? cur + ' ' + sn : sn; });
        if (cur) out.push(cur);
        return out;
    }
    function speak(text) { if (voiceOn) say(text); }
    // say(text, done): speaks and calls done() when finished (or when stopped).
    async function say(text, done) {
        const my = ++sayToken, fin = () => { if (my === sayToken && done) done(); };
        const clean = speechText(text); if (!clean) return fin();
        if (premium !== false && audio) {
            try {
                const r = await fetch(window.MOCK_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'tts', lang: vlang(), text: cleanSpeech(text).slice(0, 700) }) });
                if (my !== sayToken) return;
                if (r.ok && /audio/.test(r.headers.get('Content-Type') || '')) {
                    premium = true; store.set('saTTS', true);
                    const url = URL.createObjectURL(await r.blob()); if (my !== sayToken) return;
                    audio.onended = () => { URL.revokeObjectURL(url); fin(); }; audio.onerror = () => { URL.revokeObjectURL(url); fin(); };
                    audio.src = url; await audio.play().catch(() => fin()); return;
                }
                if ([400, 401, 403, 404, 501].indexOf(r.status) >= 0) { premium = false; store.set('saTTS', false); }
            } catch (e) { /* fall back to the browser voice */ }
            if (my !== sayToken) return;
        }
        if (!synth) return fin();
        const v = voiceFor(vlang());
        if (!v) return fin();
        try { synth.cancel(); } catch (e) {}
        const parts = chunks(clean);
        let i = 0, guard = 0;
        const next = () => {
            clearTimeout(guard);
            if (my !== sayToken) return;
            if (i >= parts.length) return fin();
            const u = new SpeechSynthesisUtterance(parts[i++]);
            u.voice = v; u.lang = v.lang || SPEECH_LANG[vlang()]; u.rate = 1; u.pitch = 1;
            u.onend = next; u.onerror = next;
            guard = setTimeout(next, 2500 + u.text.length * 110);   // some browsers forget to fire "end"
            synth.speak(u);
        };
        next();
    }
    function stopSpeak() { sayToken++; try { if (synth) synth.cancel(); } catch (e) {} try { if (audio) { audio.pause(); audio.removeAttribute('src'); } } catch (e) {} }

    // ── voice call (like a phone call: listen → answer aloud → listen again) ──
    const call = { on: false, muted: false, state: 'idle', silent: 0, rec: null, t0: 0, timer: 0, lang: '' };
    const ov = () => root.querySelector('.sa-call-ov');
    function setState(st, cap) {
        call.state = st; const o = ov(); o.dataset.s = st;
        const t = T(); o.querySelector('.sa-call-st').textContent = { listen: t.listenS, think: t.thinkS, speak: t.speakS, paused: t.pausedS, muted: t.mutedS }[st] || '';
        if (cap != null) o.querySelector('.sa-call-cap').innerHTML = cap;
    }
    function startCall() {
        if (!SR) { bubble('sa-err', fmt(T().noCall)); return; }
        if (!panel.classList.contains('open')) toggle(true);
        stopMic(); stopSpeak();
        // unlock audio on phones (must happen inside the tap)
        try { if (audio) { audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='; audio.play().catch(() => {}); } } catch (e) {}
        try { if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } } catch (e) {}
        call.on = true; call.muted = false; call.silent = 0; call.t0 = Date.now(); call.lang = lang(); markLang();
        ov().classList.add('on'); labels();
        const cm = root.querySelector('.sa-cmute'); cm.setAttribute('aria-pressed', 'false'); cm.innerHTML = I.mic;
        clearInterval(call.timer);
        call.timer = setInterval(() => { const s2 = Math.floor((Date.now() - call.t0) / 1000); root.querySelector('.sa-ctime').textContent = Math.floor(s2 / 60) + ':' + String(s2 % 60).padStart(2, '0'); }, 1000);
        const hi = L[call.lang].callHi;
        setState('speak', esc(hi));
        say(hi, () => { if (call.on) listen(); });
    }
    function markLang() { root.querySelectorAll('.sa-clang button').forEach((b) => b.classList.toggle('on', b.dataset.l === call.lang)); }
    // Change the language of the call: recognition, the AI's replies and the voice all switch.
    function setCallLang(l) {
        if (!call.on || !L[l] || l === call.lang) return;
        call.lang = l; markLang();
        try { if (call.rec) call.rec.abort(); } catch (e) {} call.rec = null;
        stopSpeak();
        const hi = L[l].callHi; setState('speak', esc(hi));
        say(hi, () => { if (call.on) listen(); });
    }
    function endCall() {
        call.on = false; clearInterval(call.timer);
        try { if (call.rec) call.rec.abort(); } catch (e) {} call.rec = null;
        stopSpeak(); ov().classList.remove('on'); setState('idle', ''); render();
    }
    function toggleMute() {
        call.muted = !call.muted;
        const cm = root.querySelector('.sa-cmute'); cm.setAttribute('aria-pressed', call.muted ? 'true' : 'false'); cm.innerHTML = call.muted ? I.micOff : I.mic; labels();
        if (call.muted) { try { if (call.rec) call.rec.abort(); } catch (e) {} call.rec = null; if (call.state === 'listen' || call.state === 'paused') setState('muted'); }
        else if (call.state === 'muted' || call.state === 'paused') listen();
    }
    function orbTap() {
        if (!call.on) return;
        if (call.state === 'speak') { stopSpeak(); listen(); }
        else if (call.state === 'paused' || call.state === 'muted') { if (call.muted) toggleMute(); else listen(); }
    }
    function listen() {
        if (!call.on) return;
        if (call.muted) return setState('muted');
        try { if (call.rec) call.rec.abort(); } catch (e) {}
        const r = new SR(); call.rec = r;
        r.lang = SPEECH_LANG[vlang()]; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
        let fin = '', interim = '', denied = false;
        setState('listen');      // the last answer stays on screen until the person starts speaking
        r.onresult = (e) => {
            interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) { const tr = e.results[i][0].transcript; if (e.results[i].isFinal) fin += tr; else interim += tr; }
            ov().querySelector('.sa-call-cap').innerHTML = '<span class="me">' + esc((fin + interim).trim()) + '</span>';
        };
        r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') denied = true; };
        r.onend = () => {
            if (call.rec !== r || !call.on) return;
            call.rec = null;
            if (denied) { endCall(); bubble('sa-err', fmt(T().micDenied)); return; }
            const said = (fin || interim).trim();
            if (said) { call.silent = 0; talk(said); }
            else if (++call.silent >= 3) setState('paused');
            else setTimeout(listen, 150);
        };
        try { r.start(); } catch (e) { setTimeout(listen, 400); }
    }
    async function talk(text) {
        setState('think', '<span class="me">' + esc(text) + '</span>');
        history.push({ role: 'user', content: text.slice(0, 600) }); store.set('saHistory', history);
        const res = await callAI(true);
        if (!call.on) { if (res.text) { history.push({ role: 'assistant', content: res.text }); store.set('saHistory', history); } render(); return; }
        if (res.text) {
            history.push({ role: 'assistant', content: res.text }); store.set('saHistory', history); render();
            setState('speak', esc(cleanSpeech(res.text)));
            say(res.text, () => { if (call.on && call.state === 'speak') setTimeout(listen, 250); });
        } else if (res.err === 'limit') {
            history.pop(); store.set('saHistory', history);
            const lim = T().limit; setState('speak', esc(lim));
            say(lim, () => { if (!call.on) return; endCall(); bubble('sa-bot', fmt(lim)); askForm(text); });
        } else {
            history.pop(); store.set('saHistory', history);
            const er = T().err.split(':')[0] + '.'; setState('speak', esc(er));
            say(er, () => { if (call.on) listen(); });
        }
    }

    function init() { if (!window.MOCK_AI_URL) return; build(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
