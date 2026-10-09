/* TheStarth — mock exam engine (Listening / Reading). Shared by the admin panel and mock-exam.html. No Firebase here — pure logic.
 *
 * Test document  (collection `mockTests`):
 *   { title, skill:'listening'|'reading', published:boolean, createdAt, updatedAt,
 *     parts:[ { title, audio:'url or path' (listening), passageTitle, passage:'plain text, paragraphs split by blank line' (reading),
 *               groups:[ { type, instruction, options:[...] (for "match": shared list), items:[ item ] } ] } ] }
 *   group.type: 'gap' | 'mcq' | 'multi' | 'tfng' | 'yn' | 'match'
 *   item: { n, text, options:[..] (mcq / multi), count:2 (multi), answer }
 *       gap   -> answer: [ 'library', 'the library' ]      (all accepted spellings)
 *       mcq   -> answer: 'B'
 *       multi -> answer: ['A','C']  (order does not matter; counts as `count` questions)
 *       tfng  -> answer: 'TRUE' | 'FALSE' | 'NOT GIVEN'      yn -> 'YES' | 'NO' | 'NOT GIVEN'
 *       match -> answer: 'C'   (letter from group.options)
 *
 * Result document (collection `mockResults`): { uid, name, testId, title, skill, scope:'full'|'part', parts:[1,2], correct, total, band, bandEstimated, secs, ts }
 */
(function (root) {
    'use strict';

    const TYPES = ['gap', 'mcq', 'multi', 'tfng', 'yn', 'match'];
    const TFNG = ['TRUE', 'FALSE', 'NOT GIVEN'];
    const YN = ['YES', 'NO', 'NOT GIVEN'];
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    // ---------- helpers ----------
    const str = (v) => (v == null ? '' : String(v)).trim();
    const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
    const itemCount = (it) => (it && it.count > 1 ? it.count : 1);

    function normText(s) {
        return str(s).toLowerCase()
            .replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"')
            .replace(/[–—]/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/^[\s.,;:!?"'()]+|[\s.,;:!?"'()]+$/g, '');
    }
    const normLetter = (s) => { const m = str(s).toUpperCase().match(/^[A-Z]/); return m ? m[0] : ''; };
    const normChoice = (s) => str(s).toUpperCase().replace(/\s+/g, ' ').replace(/^NG$/, 'NOT GIVEN').replace(/^T$/, 'TRUE').replace(/^F$/, 'FALSE').replace(/^Y$/, 'YES').replace(/^N$/, 'NO');

    // ---------- numbering ----------
    function renumber(test) {
        let n = 1;
        (test.parts || []).forEach((p) => (p.groups || []).forEach((g) => (g.items || []).forEach((it) => { it.n = n; n += itemCount(it); })));
        return test;
    }
    function partTotal(part) { let t = 0; (part.groups || []).forEach((g) => (g.items || []).forEach((it) => { t += itemCount(it); })); return t; }
    function testTotal(test) { return (test.parts || []).reduce((s, p) => s + partTotal(p), 0); }
    function range(part) { let a = Infinity, b = 0; (part.groups || []).forEach((g) => (g.items || []).forEach((it) => { a = Math.min(a, it.n); b = Math.max(b, it.n + itemCount(it) - 1); })); return a === Infinity ? null : [a, b]; }

    // ---------- grading ----------
    // `given` is what the student typed/selected: string, or array of letters for 'multi'. Returns { ok, got, of, expected }
    function gradeItem(group, it, given) {
        const of = itemCount(it);
        const type = group.type;
        if (type === 'gap') {
            const g = normText(arr(given)[0]);
            const accepted = arr(it.answer).map(normText).filter(Boolean);
            const hit = !!g && accepted.indexOf(g) !== -1;
            return { ok: hit, got: hit ? 1 : 0, of, expected: arr(it.answer).join(' / ') };
        }
        if (type === 'multi') {
            const exp = arr(it.answer).map(normLetter).filter(Boolean);
            const set = {}; arr(given).map(normLetter).filter(Boolean).forEach((l) => { set[l] = 1; });
            let got = 0; Object.keys(set).forEach((l) => { if (exp.indexOf(l) !== -1) got++; });
            got = Math.min(got, of);
            return { ok: got === of, got, of, expected: exp.join(', ') };
        }
        if (type === 'tfng' || type === 'yn') {
            const hit = !!str(given) && normChoice(given) === normChoice(arr(it.answer)[0]);
            return { ok: hit, got: hit ? 1 : 0, of, expected: normChoice(arr(it.answer)[0]) };
        }
        // mcq, match -> a letter
        const hit = !!str(given) && normLetter(given) === normLetter(arr(it.answer)[0]);
        return { ok: hit, got: hit ? 1 : 0, of, expected: normLetter(arr(it.answer)[0]) };
    }

    // answers: { [n]: given }. Returns { correct, total, items:[{ n, partIndex, group, it, given, res }] }
    function gradePart(part, partIndex, answers) {
        const out = []; let correct = 0, total = 0;
        (part.groups || []).forEach((g) => (g.items || []).forEach((it) => {
            const given = answers ? answers[it.n] : undefined;
            const res = gradeItem(g, it, given);
            correct += res.got; total += res.of;
            out.push({ n: it.n, partIndex, group: g, it, given, res });
        }));
        return { correct, total, items: out };
    }

    // ---------- IELTS band (Academic tables; General Training reading differs a little) ----------
    const BAND_L = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]];
    const BAND_R = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]];
    function band(skill, raw40) {
        const t = skill === 'reading' ? BAND_R : BAND_L;
        for (let i = 0; i < t.length; i++) if (raw40 >= t[i][0]) return t[i][1];
        return raw40 >= 1 ? 2 : 0;
    }
    // Full test of 40 -> exact band. Fewer questions -> the same percentage on a 40-point scale, marked as an estimate.
    function bandFor(skill, correct, total) {
        if (!total) return { band: null, estimated: true };
        if (total === 40) return { band: band(skill, correct), estimated: false };
        return { band: band(skill, Math.round(correct / total * 40)), estimated: true };
    }

    // ---------- AI output -> clean test ----------
    function extractJson(text) {
        let s = String(text || '').trim();
        const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) s = fence[1].trim();
        const a = s.search(/[\[{]/); if (a < 0) throw new Error('В ответе нет JSON');
        const open = s[a], close = open === '{' ? '}' : ']';
        const b = s.lastIndexOf(close); if (b <= a) throw new Error('JSON оборван — возможно, ответ получился слишком длинным');
        s = s.slice(a, b + 1);
        try { return JSON.parse(s); } catch (e) {
            try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch (e2) { throw new Error('Не удалось разобрать JSON: ' + e.message); }
        }
    }

    function cleanGroup(g, warn, tag) {
        g = g || {};
        let type = str(g.type).toLowerCase();
        if (type === 'tf' || type === 'true_false_not_given' || type === 'tfng') type = 'tfng';
        if (type === 'yesno' || type === 'ynng' || type === 'yes_no_not_given') type = 'yn';
        if (type === 'matching' || type === 'heading' || type === 'headings') type = 'match';
        if (type === 'completion' || type === 'fill' || type === 'short' || type === 'note' || type === 'form' || type === 'table') type = 'gap';
        if (type === 'choice' || type === 'multiple_choice') type = 'mcq';
        if (TYPES.indexOf(type) === -1) { warn.push(tag + ': неизвестный тип «' + g.type + '», считаю текстовым ответом'); type = 'gap'; }
        // "choose TWO letters" arrives as mcq with several answers -> multi
        if (type === 'mcq' && arr(g.items || g.questions).some((x) => x && (parseInt(x.count, 10) > 1 || (Array.isArray(x.answer) && x.answer.length > 1)))) type = 'multi';
        const out = { type, instruction: str(g.instruction), items: [] };
        if (type === 'match') out.options = arr(g.options).map(str).filter(Boolean);
        arr(g.items || g.questions).forEach((it0, i) => {
            it0 = it0 || {};
            const it = { n: 0, text: str(it0.text != null ? it0.text : it0.question) };
            if (type === 'mcq' || type === 'multi') it.options = arr(it0.options).map(str).filter(Boolean);
            if (type === 'multi') it.count = Math.max(2, parseInt(it0.count, 10) || arr(it0.answer).length || 2);
            const ans = it0.answer != null ? it0.answer : it0.answers;
            if (type === 'gap') it.answer = arr(ans).map(str).filter(Boolean);
            else if (type === 'multi') it.answer = arr(ans).map(normLetter).filter(Boolean);
            else if (type === 'tfng' || type === 'yn') it.answer = normChoice(arr(ans)[0]);
            else it.answer = normLetter(arr(ans)[0]);
            const empty = Array.isArray(it.answer) ? !it.answer.length : !it.answer;
            if (empty) warn.push(tag + ', вопрос ' + (i + 1) + ': нет правильного ответа — впишите его вручную');
            out.items.push(it);
        });
        return out;
    }

    // Accepts a whole test ({parts:[..]}), a single part ({groups:[..]}) or an array of groups. Returns { test, warnings }
    function normalizeTest(raw, skillHint) {
        const warnings = [];
        let obj = raw;
        if (Array.isArray(obj)) obj = obj[0] && obj[0].groups !== undefined && obj[0].type === undefined ? { parts: obj } : { parts: [{ groups: obj }] };
        if (obj && !obj.parts && (obj.groups || obj.questions)) obj = { title: obj.testTitle, skill: obj.skill, parts: [obj] };
        if (!obj || !Array.isArray(obj.parts) || !obj.parts.length) throw new Error('В JSON не найдены части теста (parts)');
        const skill = obj.skill === 'reading' || obj.skill === 'listening' ? obj.skill : (skillHint || 'listening');
        const test = { title: str(obj.title), skill, parts: [] };
        obj.parts.forEach((p, pi) => {
            p = p || {};
            const part = { title: str(p.title) || ('Part ' + (pi + 1)), groups: [] };
            if (skill === 'listening') part.audio = str(p.audio);
            else { part.passageTitle = str(p.passageTitle); part.passage = String(p.passage || '').replace(/\r/g, '').trim(); }
            arr(p.groups).forEach((g, gi) => part.groups.push(cleanGroup(g, warnings, part.title + ', блок ' + (gi + 1))));
            part.groups = part.groups.filter((g) => g.items.length);
            test.parts.push(part);
        });
        renumber(test);
        test.parts.forEach((p) => {
            const t = partTotal(p);
            if (!t) warnings.push(p.title + ': нет ни одного вопроса');
            if (skill === 'reading' && !p.passage) warnings.push(p.title + ': нет текста для чтения');
        });
        return { test, warnings };
    }

    // ---------- prompt for the AI (used by the worker call AND by "copy prompt for ChatGPT / Claude") ----------
    const SCHEMA = `{
  "title": "Part title, e.g. Part 1",
  "passageTitle": "reading only: title of the text",
  "passage": "reading only: the full reading text, paragraphs separated by a blank line; keep paragraph letters (A, B, C...) at the start of paragraphs if the text has them",
  "groups": [
    {
      "type": "gap | mcq | multi | tfng | yn | match",
      "instruction": "the task instruction exactly as in the source, e.g. Complete the notes below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.",
      "options": ["A. ...", "B. ..."],
      "items": [
        { "text": "question text; for gap-fill put ____ where the answer goes; keep headings/labels of notes, forms and tables as part of the text",
          "options": ["A. ...", "B. ..."],
          "count": 2,
          "answer": "see below" }
      ]
    }
  ]
}
Answer formats:
 gap   -> "answer": ["library", "the library"]   (the main answer first, then every other acceptable spelling)
 mcq   -> "answer": "B"                           (items carry their own "options")
 multi -> "answer": ["A", "C"], "count": 2        (choose TWO/THREE letters; items carry their own "options")
 tfng  -> "answer": "TRUE" | "FALSE" | "NOT GIVEN"
 yn    -> "answer": "YES" | "NO" | "NOT GIVEN"
 match -> "answer": "C"                           (the shared list of options goes in the GROUP "options")
"options" at group level is only for "match". Omit fields that do not apply.`;

    function buildPrompt(o) {
        o = o || {};
        const skill = o.skill === 'reading' ? 'Reading' : 'Listening';
        const lines = [];
        lines.push('You convert an IELTS ' + skill + ' task into JSON for an online test engine. Reply with ONE JSON object only — no explanations, no markdown.');
        lines.push('');
        lines.push('Rules:');
        lines.push('- Keep the wording of questions, options and instructions exactly as in the source. Do not invent questions. Do not renumber: the engine numbers them itself.');
        lines.push('- Split the source into groups of questions that share one instruction (one group = one instruction block, e.g. "Questions 1-5").');
        lines.push('- Pick the right type for every group: gap (completion / short answer / notes / form / table / sentence completion), mcq (choose one letter), multi (choose TWO or THREE letters), tfng (True/False/Not Given), yn (Yes/No/Not Given), match (matching headings / people / features to a list of letters or Roman numerals).');
        if (o.hasAnswers) lines.push('- The answer key is given below: use it for every "answer". If a question has no key, use an empty answer.');
        else lines.push('- No answer key was provided: work out each answer from the source; use an empty answer only if you cannot determine it.');
        if (o.skill === 'listening') lines.push('- This is a Listening part: the audio transcript is NOT included, so "passage" must be omitted. Do not guess answers that depend on the audio — if there is no answer key, leave "answer" empty.');
        if (o.skill === 'reading') lines.push('- This is a Reading part: put the whole text of the passage in "passage" and the questions in "groups".');
        lines.push('- For match, "options" is the list from the source and every option must start with a capital letter and a dot: "A. ...", "B. ...". If the source uses Roman numerals (i, ii, iii...), convert them to letters in the same order (i -> A, ii -> B...). "answer" is that letter.');
        lines.push('');
        lines.push('JSON shape:');
        lines.push(SCHEMA);
        lines.push('');
        lines.push('===== SOURCE (' + skill + (o.partNo ? ', part ' + o.partNo : '') + ') =====');
        lines.push(String(o.text || '').trim());
        if (o.hasAnswers) { lines.push(''); lines.push('===== ANSWER KEY ====='); lines.push(String(o.answersText || '').trim()); }
        return lines.join('\n');
    }

    // "B. some text" / "B) some text" -> { letter:'B', text:'some text' }; otherwise the letter comes from the position
    function optionLabel(opt, i) {
        const m = str(opt).match(/^([A-Za-z])[.)]\s*(.*)$/s);
        return m ? { letter: m[1].toUpperCase(), text: m[2] } : { letter: LETTERS[i] || String(i + 1), text: str(opt) };
    }


    // ====================== Writing helpers ======================
    function wordCount(text) { return (String(text || '').match(/\S+/g) || []).filter((w) => /[A-Za-z0-9А-Яа-я]/.test(w)).length; }

    // IELTS rounding: average of the criteria, .25 -> .5, .75 -> next whole band
    function roundBand(avg) { if (typeof avg !== 'number' || isNaN(avg)) return null; const f = Math.floor(avg), d = avg - f; return d < 0.25 ? f : d < 0.75 ? f + 0.5 : f + 1; }
    function overallBand(vals) { const v = arr(vals).filter((x) => typeof x === 'number' && !isNaN(x)); return v.length ? roundBand(v.reduce((a, b) => a + b, 0) / v.length) : null; }
    // Whole Writing score: Task 2 counts twice as much as Task 1
    function writingBand(t1, t2) {
        const a = typeof t1 === 'number', b = typeof t2 === 'number';
        if (a && b) return roundBand((t1 + 2 * t2) / 3);
        return a ? t1 : b ? t2 : null;
    }
    const CRIT = ['ta', 'cc', 'lr', 'gra'];
    const half = (x) => { x = Number(x); if (isNaN(x)) return null; return Math.max(0, Math.min(9, Math.round(x * 2) / 2)); };
    // Cleans what the AI returned for an essay evaluation (never trust its own "overall": we compute it)
    function normalizeEvaluation(raw) {
        raw = raw || {};
        const c = raw.criteria || {}, out = { criteria: {}, strengths: [], weaknesses: [], corrections: [], advice: [] };
        CRIT.forEach((k) => { const x = c[k] || {}; out.criteria[k] = { band: half(x.band), comment: str(x.comment) }; });
        out.overall = overallBand(CRIT.map((k) => out.criteria[k].band));
        out.strengths = arr(raw.strengths).map(str).filter(Boolean).slice(0, 8);
        out.weaknesses = arr(raw.weaknesses).map(str).filter(Boolean).slice(0, 8);
        out.advice = arr(raw.advice).map(str).filter(Boolean).slice(0, 8);
        out.corrections = arr(raw.corrections).map((x) => ({ original: str(x && x.original), better: str(x && x.better), why: str(x && x.why) })).filter((x) => x.original && x.better).slice(0, 10);
        out.wordCountNote = str(raw.wordCountNote);
        return out;
    }

    // ====================== Similarity (copied from other work stored on the site, or from a pasted source) ======================
    const words = (t) => String(t || '').toLowerCase().replace(/[‘’`´]/g, "'").replace(/[^a-z0-9а-яё'\s]/gi, ' ').split(/\s+/).filter(Boolean);
    function shingles(text, n) { n = n || 5; const w = words(text), set = new Set(); for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(' ')); return set; }
    function sentences(text) { return String(text || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || []; }
    // How much of text `a` also appears (in 5-word runs) in `b`. Returns { pct, sentences:[{text, frac}] }
    function similarity(a, b, n) {
        n = n || 5; const sa = shingles(a, n), sb = shingles(b, n);
        if (!sa.size || !sb.size) return { pct: 0, sentences: [] };
        let hit = 0; sa.forEach((x) => { if (sb.has(x)) hit++; });
        const marked = [];
        sentences(a).forEach((snt) => { const sh = shingles(snt, n); if (!sh.size) return; let h = 0; sh.forEach((x) => { if (sb.has(x)) h++; }); const frac = h / sh.size; if (frac >= 0.5) marked.push({ text: snt.trim(), frac: Math.round(frac * 100) / 100 }); });
        return { pct: Math.round(hit / sa.size * 100), sentences: marked };
    }

    const api = { wordCount, roundBand, overallBand, writingBand, normalizeEvaluation, shingles, similarity, optionLabel, TYPES, TFNG, YN, LETTERS, itemCount, normText, normLetter, normChoice, renumber, partTotal, testTotal, range, gradeItem, gradePart, band, bandFor, extractJson, normalizeTest, buildPrompt, SCHEMA };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MockEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
