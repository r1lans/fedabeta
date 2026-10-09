/**
 * TheStarth — Telegram-напоминания об уроках (Cloudflare Worker, бесплатный тариф). Инструкция: TELEGRAM_SETUP.md.
 *
 * Что делает:
 *  1. Webhook (POST /telegram, заголовок X-Telegram-Bot-Api-Secret-Token): человек пишет боту /start → бот запоминает его Telegram-ник → chat_id
 *     (хранится в Cloudflare KV, привязка TG). Бот не может писать по нику — только тем, кто нажал Start.
 *  2. Cron (каждую минуту): читает из Firestore расписание (коллекция schedule — разовые уроки, groups — уроки групп
 *     по дням недели), находит уроки, до начала которых осталось 60 / 30 / 5 минут, и шлёт ученику и учителю
 *     сообщение в Telegram. Повторно одно и то же напоминание не отправляется (отметки в KV).
 *
 * ТОКЕН БОТА НИКОГДА НЕ КЛАДЁТСЯ В КОД И НЕ ПУБЛИКУЕТСЯ НА GITHUB. Он хранится только в секретах Worker:
 *   TELEGRAM_BOT_TOKEN        (Secret) — токен от @BotFather
 *   TELEGRAM_WEBHOOK_SECRET   (Secret) — любая длинная случайная строка (латиница/цифры), защищает webhook
 *   FIREBASE_SERVICE_ACCOUNT  (Secret) — JSON ключа сервисного аккаунта Firebase (Project settings → Service accounts)
 *   TG                        (KV binding) — хранилище для chat_id и отметок «уже отправлено»
 *   FIREBASE_PROJECT_ID       (Text, необязательно) — по умолчанию thestarth-b7620
 *   SITE_URL                  (Text, необязательно) — по умолчанию https://thestarth.com
 */
const TZ_OFFSET_MIN = 300; // Asia/Tashkent = UTC+5, без перехода на летнее время
const OFFSETS = [60, 30, 5, 0]; // за сколько минут напоминать (0 = урок начался: шлём ссылку на вход)
const WINDOW = 3; // если cron пропустил минуту, напоминание уйдёт позже, но не позднее чем через WINDOW минут
const pad = (n) => String(n).padStart(2, '0');

// ───────────────────────── чистая логика (проверяется тестами) ─────────────────────────

/** Текущее время в Ташкенте: { date:'YYYY-MM-DD', dow:0..6 (Пн=0), minutes:0..1439 } */
export function tashkentNow(nowMs) {
    const d = new Date(nowMs + TZ_OFFSET_MIN * 60000);
    return { date: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), dow: (d.getUTCDay() + 6) % 7, minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const DAY_RX = [/^пн|^mon|^du/i, /^вт|^tue|^se/i, /^ср|^wed|^ch/i, /^чт|^thu|^pa/i, /^пт|^fri|^ju/i, /^сб|^sat|^sh/i, /^вс|^sun|^ya/i];
export function parseHm(s) { const m = String(s || '').match(/(\d{1,2})[:.](\d{2})/); if (!m) return null; const h = +m[1], mi = +m[2]; return h < 24 && mi < 60 ? h * 60 + mi : null; }
export function groupDays(g) {
    if (Array.isArray(g.days) && g.days.length) return g.days.map(Number);
    const out = []; String(g.scheduleText || '').split(/[\s,\/;·\-–—]+/).forEach((w) => { DAY_RX.forEach((rx, i) => { if (w.length >= 2 && w.length <= 10 && rx.test(w) && out.indexOf(i) === -1) out.push(i); }); });
    return out;
}

/**
 * Уроки на сегодня. Возвращает [{ key, minutes, title, room, nicks:[], uids:[] }]
 * schedDocs: документы schedule { date, time, subject, studentNickname, teacherUid, status }
 * groupDocs: документы groups { name, subject, days|scheduleText, time, memberUids, members:[{nickname}], teacherUid }
 */
export function todaysLessons(now, schedDocs, groupDocs) {
    const out = [];
    for (const s of schedDocs || []) {
        if (s.date !== now.date || s.status === 'missed' || s.status === 'cancelled') continue;
        const m = parseHm(s.time); if (m == null) continue;
        out.push({ key: 's:' + s.id, minutes: m, title: s.subject || '', room: s.room || '', groupId: '', nicks: s.studentNickname ? [String(s.studentNickname).toLowerCase()] : [], uids: [], teachers: s.teacherUid ? [s.teacherUid] : [] });
    }
    for (const g of groupDocs || []) {
        if (groupDays(g).indexOf(now.dow) === -1) continue;
        const m = parseHm(g.time || g.scheduleText); if (m == null) continue;
        const uids = (g.memberUids || []).filter((u) => u !== g.teacherUid);
        out.push({ key: 'g:' + g.id, minutes: m, title: g.name || g.subject || '', room: g.room || '', groupId: g.id, nicks: [], uids, teachers: g.teacherUid ? [g.teacherUid] : [] });
    }
    return out;
}

/** Какие напоминания пора отправить сейчас: [{ lesson, offset, dedupe }] */
export function dueNow(now, lessons) {
    const out = [];
    for (const l of lessons) {
        const left = l.minutes - now.minutes;
        for (const off of OFFSETS) if (left <= off && left > off - WINDOW) out.push({ lesson: l, offset: off, dedupe: l.key + ':' + now.date + ':' + off });
    }
    return out;
}

const TEXTS = {
    ru: {
        student: (off, hm, t) => (off === 0 ? `🔔 Урок начинается сейчас${t ? ': ' + t : ''}` : `⏰ Урок через ${off === 60 ? 'час' : off + ' минут'}${t ? ': ' + t : ''}\nНачало в ${hm} (Ташкент).`),
        teacher: (off, hm, t) => (off === 0 ? `🔔 У вас урок начинается сейчас${t ? ': ' + t : ''}` : `⏰ У вас урок через ${off === 60 ? 'час' : off + ' минут'}${t ? ': ' + t : ''}\nНачало в ${hm} (Ташкент).`),
        join: 'Войти на урок:',
    },
    uz: {
        student: (off, hm, t) => (off === 0 ? `🔔 Dars hozir boshlanadi${t ? ': ' + t : ''}` : `⏰ Dars ${off === 60 ? '1 soatdan' : off + ' daqiqadan'} so‘ng boshlanadi${t ? ': ' + t : ''}\nBoshlanishi ${hm} (Toshkent).`),
        teacher: (off, hm, t) => (off === 0 ? `🔔 Darsingiz hozir boshlanadi${t ? ': ' + t : ''}` : `⏰ Darsingiz ${off === 60 ? '1 soatdan' : off + ' daqiqadan'} so‘ng boshlanadi${t ? ': ' + t : ''}\nBoshlanishi ${hm} (Toshkent).`),
        join: 'Darsga kirish:',
    },
    en: {
        student: (off, hm, t) => (off === 0 ? `🔔 Your lesson is starting now${t ? ': ' + t : ''}` : `⏰ Your lesson starts in ${off === 60 ? '1 hour' : off + ' minutes'}${t ? ': ' + t : ''}\nStart: ${hm} (Tashkent time).`),
        teacher: (off, hm, t) => (off === 0 ? `🔔 You have a lesson starting now${t ? ': ' + t : ''}` : `⏰ You have a lesson in ${off === 60 ? '1 hour' : off + ' minutes'}${t ? ': ' + t : ''}\nStart: ${hm} (Tashkent time).`),
        join: 'Join the lesson:',
    },
};
/** Текст напоминания. role: 'student' | 'teacher'. На 5-й минуте и в момент начала добавляется ссылка на вход в урок. */
export function messageText(lang, offset, minutes, title, role, link) {
    const L = TEXTS[lang] || TEXTS.ru; const hm = pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);
    const base = (L[role === 'teacher' ? 'teacher' : 'student'])(offset, hm, title);
    return offset <= 5 && link ? base + '\n\n' + L.join + ' ' + link : base;
}
/** Ссылка на вход в урок (учитель из группы попадает ещё и на отметку посещаемости) */
export function joinLink(site, lesson, role) {
    if (!lesson.room) return site + '/dashboard.html';
    return site + '/video-lesson.html?room=' + encodeURIComponent(lesson.room) + (role === 'teacher' && lesson.groupId ? '&group=' + encodeURIComponent(lesson.groupId) : '');
}

// ───────────────────────── Firestore REST ─────────────────────────
function pemToBuf(pem) { const b = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64uStr = (s) => b64u(new TextEncoder().encode(s));
let tokenCache = { t: '', exp: 0 };
async function accessToken(env) {
    if (tokenCache.t && tokenCache.exp > Date.now() + 60000) return tokenCache.t;
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); const iat = Math.floor(Date.now() / 1000);
    const head = b64uStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64uStr(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
    const key = await crypto.subtle.importKey('pkcs8', pemToBuf(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claim)));
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + claim + '.' + sig });
    const j = await r.json(); if (!j.access_token) throw new Error('google token: ' + JSON.stringify(j).slice(0, 200));
    tokenCache = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return tokenCache.t;
}
export function fromValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return +v.integerValue; if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null; if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
    if ('mapValue' in v) return fromDoc(v.mapValue.fields || {});
    return null;
}
export function fromDoc(fields) { const o = {}; for (const k in fields) o[k] = fromValue(fields[k]); return o; }
const idOf = (name) => name.split('/').pop();
async function fs(env, path, body) {
    const pid = env.FIREBASE_PROJECT_ID || 'thestarth-b7620';
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents${path}`, { method: 'POST', headers: { Authorization: 'Bearer ' + await accessToken(env), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('firestore ' + r.status + ' ' + (await r.text()).slice(0, 200)); return r.json();
}
async function queryDocs(env, structuredQuery) { const rows = await fs(env, ':runQuery', { structuredQuery }); return rows.filter((x) => x.document).map((x) => Object.assign({ id: idOf(x.document.name) }, fromDoc(x.document.fields || {}))); }
async function getUsers(env, uids) {
    if (!uids.length) return [];
    const pid = env.FIREBASE_PROJECT_ID || 'thestarth-b7620'; const base = `projects/${pid}/databases/(default)/documents/users/`;
    const rows = await fs(env, ':batchGet', { documents: uids.map((u) => base + u) });
    return rows.filter((x) => x.found).map((x) => Object.assign({ id: idOf(x.found.name) }, fromDoc(x.found.fields || {})));
}
async function usersByNick(env, nick) { return queryDocs(env, { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'nickname' }, op: 'EQUAL', value: { stringValue: nick } } }, limit: 1 }); }

// ───────────────────────── Telegram ─────────────────────────
async function tg(env, method, payload) {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return r.json();
}
const T = {
    ru: {
        ok: (u) => `✅ Готово, @${u}! Теперь я буду напоминать вам об уроках: за 60, 30 и 5 минут.\n\nКоманды: /today — уроки сегодня, /schedule — на неделю, /lang — язык, /help — помощь.`,
        nouser: '⚠️ В вашем Telegram не задан username. Откройте Настройки → Имя пользователя, задайте его, укажите на сайте в профиле и снова нажмите /start.',
        stop: '🔕 Напоминания отключены. Чтобы включить снова — /start.',
        notlinked: '🤔 Не нашёл вас на сайте. Укажите этот Telegram-ник (@{u}) в профиле на thestarth.com → «Редактировать профиль» и нажмите /start ещё раз.',
        none_today: 'Сегодня уроков больше нет. 🎉', none_week: 'На ближайшие 7 дней уроков не нашёл.',
        today: 'Уроки на сегодня:', week: 'Ближайшие уроки:', days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
        lang_pick: 'Выберите язык / Tilni tanlang / Choose language:', lang_set: 'Язык: русский ✅',
        help: 'Я бот TheStarth.\n\n/today — уроки на сегодня\n/schedule — уроки на 7 дней\n/lang — язык бота\n/site — сайт и кабинет\n/stop — выключить напоминания\n/start — включить напоминания\n\nНапоминаю об уроках за 60, 30 и 5 минут (время Ташкента).',
        site: '🌐 Сайт и личный кабинет', unknown: 'Не понял команду. Напишите /help.',
    },
    uz: {
        ok: (u) => `✅ Tayyor, @${u}! Dars boshlanishidan 60, 30 va 5 daqiqa oldin eslatib turaman.\n\nBuyruqlar: /today — bugungi darslar, /schedule — hafta jadvali, /lang — til, /help — yordam.`,
        nouser: '⚠️ Telegramingizda username yo‘q. Sozlamalar → Foydalanuvchi nomi orqali o‘rnating, saytdagi profilingizga yozing va /start ni qayta bosing.',
        stop: '🔕 Eslatmalar o‘chirildi. Qayta yoqish uchun — /start.',
        notlinked: '🤔 Sizni saytda topa olmadim. Ushbu Telegram nikni (@{u}) thestarth.com profilingizda ko‘rsating va /start ni qayta bosing.',
        none_today: 'Bugun boshqa dars yo‘q. 🎉', none_week: 'Yaqin 7 kunda dars topilmadi.',
        today: 'Bugungi darslar:', week: 'Yaqin darslar:', days: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
        lang_pick: 'Выберите язык / Tilni tanlang / Choose language:', lang_set: 'Til: o‘zbekcha ✅',
        help: 'Men TheStarth botiman.\n\n/today — bugungi darslar\n/schedule — 7 kunlik darslar\n/lang — bot tili\n/site — sayt va kabinet\n/stop — eslatmalarni o‘chirish\n/start — eslatmalarni yoqish\n\nDarsdan 60, 30 va 5 daqiqa oldin eslataman (Toshkent vaqti).',
        site: '🌐 Sayt va shaxsiy kabinet', unknown: 'Buyruq tushunarsiz. /help ni yozing.',
    },
    en: {
        ok: (u) => `✅ Done, @${u}! I will remind you 60, 30 and 5 minutes before each lesson.\n\nCommands: /today — today's lessons, /schedule — this week, /lang — language, /help — help.`,
        nouser: '⚠️ Your Telegram has no username. Set one in Settings → Username, add it to your profile on the site and press /start again.',
        stop: '🔕 Reminders are off. Press /start to turn them on again.',
        notlinked: '🤔 I could not find you on the site. Add this Telegram username (@{u}) in your profile at thestarth.com and press /start again.',
        none_today: 'No more lessons today. 🎉', none_week: 'No lessons in the next 7 days.',
        today: 'Lessons today:', week: 'Upcoming lessons:', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        lang_pick: 'Выберите язык / Tilni tanlang / Choose language:', lang_set: 'Language: English ✅',
        help: 'I am the TheStarth bot.\n\n/today — lessons today\n/schedule — lessons for 7 days\n/lang — bot language\n/site — website and cabinet\n/stop — turn reminders off\n/start — turn reminders on\n\nI remind you 60, 30 and 5 minutes before a lesson (Tashkent time).',
        site: '🌐 Website and personal cabinet', unknown: 'I did not get that. Send /help.',
    },
};
const LANGS = ['ru', 'uz', 'en'];
const pickLang = (c) => (LANGS.indexOf(String(c || '').slice(0, 2)) !== -1 ? String(c).slice(0, 2) : 'ru');

/** Ближайшие уроки на N дней вперёд (с сегодняшнего момента). Возвращает [{ date, dow, minutes, title }] по порядку. */
export function upcomingLessons(nowMs, days, schedDocs, groupDocs) {
    const out = []; const now = tashkentNow(nowMs);
    for (let i = 0; i < days; i++) {
        const day = tashkentNow(nowMs + i * 86400000);
        const items = todaysLessons(day, schedDocs, groupDocs);
        items.forEach((l) => { if (i === 0 && l.minutes < now.minutes) return; out.push({ date: day.date, dow: day.dow, minutes: l.minutes, title: l.title }); });
    }
    return out.sort((a, b) => (a.date + pad(Math.floor(a.minutes / 60)) + pad(a.minutes % 60)).localeCompare(b.date + pad(Math.floor(b.minutes / 60)) + pad(b.minutes % 60)));
}
export function formatLessons(lang, list, today) {
    const t = T[lang] || T.ru; if (!list.length) return today ? t.none_today : t.none_week;
    let last = ''; const lines = [today ? t.today : t.week];
    list.forEach((l) => { if (!today && l.date !== last) { last = l.date; lines.push('\n' + t.days[l.dow] + ' ' + l.date.slice(8) + '.' + l.date.slice(5, 7)); } lines.push(`• ${pad(Math.floor(l.minutes / 60))}:${pad(l.minutes % 60)}${l.title ? ' — ' + l.title : ''}`); });
    return lines.join('\n');
}

async function patchUser(env, uid, fields) {
    const pid = env.FIREBASE_PROJECT_ID || 'thestarth-b7620'; const mask = Object.keys(fields).map((k) => 'updateMask.fieldPaths=' + k).join('&');
    const body = { fields: {} }; for (const k in fields) body.fields[k] = typeof fields[k] === 'boolean' ? { booleanValue: fields[k] } : { stringValue: String(fields[k]) };
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/users/${uid}?${mask}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + await accessToken(env), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok;
}
async function usersByTelegram(env, uname) { return queryDocs(env, { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'telegram' }, op: 'EQUAL', value: { stringValue: uname } } }, limit: 1 }); }
/** Расписание конкретного человека: schedule (по нику ученика / uid учителя) + группы (участник или учитель) */
async function myLessons(env, u) {
    const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } });
    const jobs = [];
    if (u.nickname) jobs.push(queryDocs(env, { from: [{ collectionId: 'schedule' }], where: eq('studentNickname', u.nickname) }));
    jobs.push(queryDocs(env, { from: [{ collectionId: 'schedule' }], where: eq('teacherUid', u.id) }));
    jobs.push(queryDocs(env, { from: [{ collectionId: 'groups' }], where: { fieldFilter: { field: { fieldPath: 'memberUids' }, op: 'ARRAY_CONTAINS', value: { stringValue: u.id } } } }));
    jobs.push(queryDocs(env, { from: [{ collectionId: 'groups' }], where: eq('teacherUid', u.id) }));
    const r = await Promise.all(jobs); const uniq = (a) => { const m = new Map(); a.forEach((d) => m.set(d.id, d)); return Array.from(m.values()); };
    const g = r.slice(-2); return { sched: uniq(r.slice(0, -2).flat()), groups: uniq(g.flat()) };
}
const send = (env, chat, text, extra) => tg(env, 'sendMessage', Object.assign({ chat_id: chat, text }, extra || {}));
async function langOf(env, uname, fallback) { return (uname && (await env.TG.get('lang:' + uname))) || fallback || 'ru'; }

async function handleUpdate(env, upd) {
    if (upd && upd.callback_query) {
        const cq = upd.callback_query, un = cq.from && cq.from.username ? String(cq.from.username).toLowerCase() : '', mm = /^lang:(ru|uz|en)$/.exec(cq.data || '');
        if (mm && un) { await env.TG.put('lang:' + un, mm[1]); await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id }); await send(env, cq.message.chat.id, T[mm[1]].lang_set); }
        return;
    }
    const m = upd && upd.message; if (!m || !m.text || !m.chat || m.chat.type !== 'private') return;
    const cmd = m.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();
    const uname = m.from && m.from.username ? String(m.from.username).toLowerCase() : '';
    const lang = await langOf(env, uname, pickLang(m.from && m.from.language_code)); const t = T[lang];
    if (cmd === '/start') {
        if (!uname) return send(env, m.chat.id, t.nouser);
        await env.TG.put('u:' + uname, String(m.chat.id));
        if (!(await env.TG.get('lang:' + uname))) await env.TG.put('lang:' + uname, lang);
        const found = (await usersByTelegram(env, uname))[0];
        if (found) { try { await patchUser(env, found.id, { tgLinked: true }); } catch (e) { console.warn('tgLinked', e); } }
        return send(env, m.chat.id, found ? t.ok(uname) : t.notlinked.replace('{u}', uname));
    }
    if (cmd === '/stop') {
        if (uname) { await env.TG.delete('u:' + uname); try { const f = (await usersByTelegram(env, uname))[0]; if (f) await patchUser(env, f.id, { tgLinked: false }); } catch (e) {} }
        return send(env, m.chat.id, t.stop);
    }
    if (cmd === '/help') return send(env, m.chat.id, t.help);
    if (cmd === '/site') return send(env, m.chat.id, t.site, { reply_markup: { inline_keyboard: [[{ text: 'thestarth.com', url: env.SITE_URL || 'https://thestarth.com' }, { text: 'Кабинет', url: (env.SITE_URL || 'https://thestarth.com') + '/dashboard.html' }]] } });
    if (cmd === '/lang') return send(env, m.chat.id, t.lang_pick, { reply_markup: { inline_keyboard: [[{ text: 'Русский', callback_data: 'lang:ru' }, { text: 'O‘zbekcha', callback_data: 'lang:uz' }, { text: 'English', callback_data: 'lang:en' }]] } });
    if (cmd === '/today' || cmd === '/schedule') {
        const u = uname ? (await usersByTelegram(env, uname))[0] : null;
        if (!u) return send(env, m.chat.id, uname ? t.notlinked.replace('{u}', uname) : t.nouser);
        const { sched, groups } = await myLessons(env, u); const today = cmd === '/today';
        return send(env, m.chat.id, formatLessons(lang, upcomingLessons(Date.now(), today ? 1 : 7, sched, groups), today));
    }
    return send(env, m.chat.id, t.unknown);
}

/** Разовая настройка: webhook, команды меню и описание бота. Вызывается один раз открытием ссылки /setup?key=... */
async function setupBot(env, origin) {
    const out = {};
    out.webhook = await tg(env, 'setWebhook', { url: origin + '/telegram', secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] });
    const cmds = { ru: [['today', 'Уроки сегодня'], ['schedule', 'Уроки на 7 дней'], ['lang', 'Язык бота'], ['site', 'Сайт и кабинет'], ['help', 'Помощь'], ['stop', 'Выключить напоминания']],
        uz: [['today', 'Bugungi darslar'], ['schedule', '7 kunlik darslar'], ['lang', 'Bot tili'], ['site', 'Sayt va kabinet'], ['help', 'Yordam'], ['stop', 'Eslatmalarni o‘chirish']],
        en: [['today', 'Lessons today'], ['schedule', 'Lessons for 7 days'], ['lang', 'Bot language'], ['site', 'Website'], ['help', 'Help'], ['stop', 'Turn reminders off']] };
    out.commands = await tg(env, 'setMyCommands', { commands: cmds.ru.map(([command, description]) => ({ command, description })) });
    for (const l of ['uz', 'en']) await tg(env, 'setMyCommands', { language_code: l, commands: cmds[l].map(([command, description]) => ({ command, description })) });
    out.description = await tg(env, 'setMyDescription', { description: 'Бот TheStarth: напоминания об уроках за 60, 30 и 5 минут, расписание на сегодня и неделю. Нажмите Start, чтобы подключиться.\n\nTheStarth boti: dars eslatmalari va jadval. Start ni bosing.' });
    out.short = await tg(env, 'setMyShortDescription', { short_description: 'Напоминания об уроках TheStarth · dars eslatmalari · lesson reminders' });
    return out;
}

// ───────────────────────── cron ─────────────────────────
export async function runReminders(env, nowMs) {
    const now = tashkentNow(nowMs);
    const [sched, groups] = await Promise.all([
        queryDocs(env, { from: [{ collectionId: 'schedule' }], where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: now.date } } } }),
        queryDocs(env, { from: [{ collectionId: 'groups' }] }),
    ]);
    const due = dueNow(now, todaysLessons(now, sched, groups)); if (!due.length) return { sent: 0 };
    let sent = 0; const userCache = {};
    const urls = {};
    for (const d of due) {
        const people = []; // { uid?, nick?, role }
        d.lesson.nicks.forEach((n) => people.push({ nick: n, role: 'student' })); d.lesson.uids.forEach((u) => people.push({ uid: u, role: 'student' }));
        (d.lesson.teachers || []).forEach((u) => people.push({ uid: u, role: 'teacher' }));
        for (const p of people) {
            const pk = p.uid || ('n:' + p.nick); const dk = d.dedupe + ':' + pk;
            if (await env.TG.get('sent:' + dk)) continue;
            let u = userCache[pk];
            if (u === undefined) { u = p.uid ? (await getUsers(env, [p.uid]))[0] : (await usersByNick(env, p.nick))[0]; userCache[pk] = u || null; }
            if (!u || !u.telegram) continue;
            const chatId = await env.TG.get('u:' + String(u.telegram).replace(/^@/, '').toLowerCase()); if (!chatId) continue;
            const site = env.SITE_URL || 'https://thestarth.com'; const lang = (await env.TG.get('lang:' + String(u.telegram).replace(/^@/, '').toLowerCase())) || u.lang;
            const link = joinLink(site, d.lesson, p.role);
            const body = messageText(lang, d.offset, d.lesson.minutes, d.lesson.title, p.role, d.offset <= 5 ? link : '');
            const extra = d.offset <= 5 ? { reply_markup: { inline_keyboard: [[{ text: (TEXTS[lang] || TEXTS.ru).join.replace(/:$/, ''), url: link }]] }, disable_web_page_preview: true } : {};
            const res = await tg(env, 'sendMessage', Object.assign({ chat_id: chatId, text: body }, extra));
            if (res && res.ok) { sent++; await env.TG.put('sent:' + dk, '1', { expirationTtl: 86400 }); }
            else if (res && (res.error_code === 403 || res.error_code === 400)) await env.TG.put('sent:' + dk, '1', { expirationTtl: 86400 }); // человек заблокировал бота — не долбим
        }
    }
    return { sent };
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (request.method === 'POST' && url.pathname === '/telegram') {
            if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
            try { await handleUpdate(env, await request.json()); } catch (e) { console.warn('update', e); }
            return new Response('ok');
        }
        if (request.method === 'GET' && url.pathname === '/setup') {
            if (!env.TELEGRAM_WEBHOOK_SECRET || url.searchParams.get('key') !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
            return new Response(JSON.stringify(await setupBot(env, url.origin), null, 2), { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('TheStarth reminders', { status: 200 });
    },
    async scheduled(event, env, ctx) { ctx.waitUntil(runReminders(env, Date.now()).catch((e) => console.warn('reminders', e))); },
};
