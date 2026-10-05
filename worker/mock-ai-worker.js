/**
 * TheStarth — ИИ-посредник (Cloudflare Worker, бесплатный тариф). Инструкция: MOCK_SETUP.md.
 *
 * Зачем он нужен: ключ от ИИ нельзя хранить в коде сайта (его увидит любой посетитель и потратит ваши деньги).
 * Ключ лежит здесь, а сайт обращается к этому посреднику.
 *
 * Кто может пользоваться: человек, который вошёл на сайт. Посредник проверяет его через Firebase (запрос в Firestore от его имени):
 *   mode "build"  — составить тест из файла (Админ-панель → Mock-тесты)  — только админ
 *
 * Переменные (Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY (Secret) — ключ от console.anthropic.com (платный, лучшее качество)
 *   ИЛИ бесплатно: Settings → Bindings → Add → Workers AI, имя переменной AI. Тогда ключ не нужен.
 *   CF_MODEL (Text, необязательно) — модель Workers AI, по умолчанию @cf/meta/llama-3.3-70b-instruct-fp8-fast
 *   ALLOWED_ORIGIN (Text, необязательно) — адрес(а) сайта через запятую, по умолчанию https://thestarth.com
 *   FIREBASE_PROJECT_ID (Text, необязательно) — по умолчанию thestarth-b7620
 *   MODEL (Text, необязательно) — по умолчанию claude-sonnet-5-5
 */
const MAX_BUILD = 60000;

export default {
    async fetch(request, env) {
        const allowed = (env.ALLOWED_ORIGIN || 'https://thestarth.com').split(',').map((s) => s.trim());
        const origin = request.headers.get('Origin') || '';
        const okOrigin = allowed.indexOf(origin) !== -1 || allowed.some((a) => a.replace('://', '://www.') === origin);
        const cors = {
            'Access-Control-Allow-Origin': okOrigin ? origin : allowed[0],
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Vary': 'Origin',
        };
        const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST') return json({ error: 'Только POST' }, 405);
        if (!okOrigin) return json({ error: 'Запрос с чужого сайта' }, 403);
        const useCF = !env.ANTHROPIC_API_KEY && !!env.AI;     // free provider when there is no paid key
        if (!env.ANTHROPIC_API_KEY && !env.AI) return json({ error: 'На сервере не подключён ИИ: добавьте привязку Workers AI (имя AI) или ANTHROPIC_API_KEY' }, 500);

        const who = await authenticate(request, env);
        if (!who) return json({ error: 'Войдите в аккаунт на сайте и повторите' }, 401);

        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'Некорректный запрос' }, 400); }
        const mode = String((body && body.mode) || 'build');

        let messages, maxTokens;
        if (mode === 'build') {
            if (!who.admin) return json({ error: 'Составлять тесты может только администратор' }, 403);
            const prompt = String(body.prompt || '');
            if (prompt.length < 20) return json({ error: 'Пустой запрос' }, 400);
            if (prompt.length > (useCF ? 18000 : MAX_BUILD)) return json({ error: 'Файл слишком большой (' + prompt.length + ' символов, максимум ' + (useCF ? 18000 : MAX_BUILD) + '). Загружайте по одной части.' }, 413);
            messages = [{ role: 'user', content: prompt }]; maxTokens = 12000;
        } else return json({ error: 'Неизвестный режим' }, 400);

        if (useCF) {
            // Free provider (Cloudflare Workers AI). Text only: a picture for Task 1 cannot be shown to this model.
            const flat = messages.map((m) => ({ role: m.role, content: Array.isArray(m.content) ? m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : m.content }));
            flat.unshift({ role: 'system', content: 'You answer with one valid JSON object only: no markdown, no comments, no text before or after it.' });
            let out;
            try { out = await env.AI.run(env.CF_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: flat, max_tokens: Math.min(maxTokens, 4096), temperature: 0.2 }); }
            catch (e) { return json({ error: 'Бесплатный ИИ вернул ошибку (возможно, закончился дневной лимит): ' + e.message }, 502); }
            let text = out && out.response; if (text && typeof text === 'object') text = JSON.stringify(text);
            if (!text) return json({ error: 'Бесплатный ИИ не вернул ответ' }, 502);
            return json({ text: String(text), mode, provider: 'cloudflare' });
        }
        let r;
        try {
            r = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, messages }),
            });
        } catch (e) { return json({ error: 'Не удалось связаться с ИИ: ' + e.message }, 502); }

        const data = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: 'ИИ вернул ошибку ' + r.status + ': ' + ((data && data.error && data.error.message) || 'неизвестно') }, 502);
        const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        if (data.stop_reason === 'max_tokens') return json({ error: 'Ответ получился слишком длинным и оборвался. Попробуйте ещё раз или сократите текст.' }, 502);
        return json({ text, mode });
    },
};

// Who is calling? We ask Firestore AS THE CALLER (their own ID token): Firestore itself rejects fake or expired tokens,
// and the security rules only let a person read their own profile — so this also tells us the role safely.
export async function authenticate(request, env) {
    const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i); if (!m) return null;
    const token = m[1]; let uid = '';
    try { const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); uid = String(p.user_id || p.sub || ''); } catch (e) { return null; }
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return null;
    const base = 'https://firestore.googleapis.com/v1/projects/' + (env.FIREBASE_PROJECT_ID || 'thestarth-b7620') + '/databases/(default)/documents';
    const h = { Authorization: 'Bearer ' + token };
    let u, a;
    try { [u, a] = await Promise.all([fetch(base + '/users/' + uid, { headers: h }), fetch(base + '/admins/' + uid, { headers: h })]); } catch (e) { return null; }
    if (u.status === 401 || a.status === 401 || u.status === 403 && a.status === 403) return null;     // token not accepted by Firebase
    let role = '';
    if (u.ok) { try { const d = await u.json(); role = (d.fields && d.fields.role && d.fields.role.stringValue) || ''; } catch (e) {} }
    return { uid, admin: a.ok, teacher: role === 'teacher' };
}

const RUBRIC = `Use the official public IELTS Writing band descriptors. Score four criteria separately, each from 0 to 9 in steps of 0.5:
1) "ta" = Task Achievement (Task 1) or Task Response (Task 2)
   9 fully addresses every part; 7 addresses all parts, clear position/overview, main ideas extended (Task 1: key features covered, clear overview); 6 addresses all parts but some more fully than others, position may be unclear in places, some ideas underdeveloped (Task 1: key features covered but some irrelevant detail or inaccuracy, overview unclear); 5 addresses the task only partially, position unclear, limited development (Task 1: mechanical listing of detail, no clear overview); 4 minimal response, ideas irrelevant or repetitive; 3 and below does not address the task.
   Under-length answers (below 150 words for Task 1, 250 for Task 2) must be penalised in this criterion. A memorised or off-topic answer cannot score above 5 here.
2) "cc" = Coherence and Cohesion
   9 seamless, skilfully managed paragraphing; 7 logical progression, range of cohesive devices with some over/under-use, clear central topic in each paragraph; 6 coherent, cohesion present but sometimes mechanical or faulty referencing; 5 some organisation but no clear overall progression, cohesive devices inadequate or overused; 4 ideas not arranged coherently, only basic linking.
3) "lr" = Lexical Resource
   9 natural, sophisticated, only rare slips; 7 sufficient range for flexibility and precision, some less common items with awareness of collocation, occasional errors in word choice/spelling; 6 adequate range, attempts less common words with some inaccuracy, spelling errors that do not impede; 5 limited range, noticeable errors in spelling or word formation that may cause difficulty; 4 basic, repetitive vocabulary.
4) "gra" = Grammatical Range and Accuracy
   9 wide range used naturally, rare minor slips; 7 variety of complex structures, frequent error-free sentences, good control with some errors; 6 mix of simple and complex forms, errors in complex structures that rarely impede communication; 5 limited range, complex sentences attempted but faulty, frequent errors that may cause difficulty; 4 very limited range, errors predominate.
Be realistic and strict like a real examiner. Do not inflate. Most candidates score between 5 and 7. Judge the text only by what is written.`;
