/* TheStarth — translation of content that people type in (teachers, reviews, news).
 *
 * Static page text lives in translations.js. This file handles the *data*:
 *   - StarthI18n.pick(obj, 'bio')   -> the text in the visitor's language
 *                                      (falls back to the original text)
 *   - StarthI18n.translateFields()  -> used by the admin panel: translates the
 *                                      texts once, when the admin saves, and the
 *                                      result is stored next to the original as
 *                                      obj.i18n = { uz: {...}, en: {...} }.
 * Visitors therefore never wait for a translation service — they just read the
 * stored text.
 *
 * Automatic translation uses the free MyMemory service (no key, called straight
 * from the admin's browser). It is good enough for short texts; the admin can
 * always fix a translation by hand afterwards.
 */
(function () {
    var LANGS = ['ru', 'uz', 'en'];
    var ENDPOINT = 'https://api.mymemory.translated.net/get';
    var CHUNK = 420;          // MyMemory accepts ~500 bytes per request

    function lang() {
        try { var l = localStorage.getItem('starthLang'); return LANGS.indexOf(l) >= 0 ? l : 'ru'; }
        catch (e) { return 'ru'; }
    }

    /** Text of `field` in the visitor's language (or the original). */
    function pick(obj, field, forLang) {
        if (!obj) return '';
        var l = forLang || lang();
        var src = obj.srcLang || 'ru';
        if (l === src) return obj[field] == null ? '' : obj[field];
        var tr = obj.i18n && obj.i18n[l];
        var v = tr && tr[field];
        if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) return v;
        return obj[field] == null ? '' : obj[field];
    }

    /** Same for array items, e.g. pickAt(t, 'certs', 0) -> label of certificate 0 */
    function pickList(obj, field, forLang) {
        var v = pick(obj, field, forLang);
        return Array.isArray(v) ? v : [];
    }

    /** Guess the language of a free-form text: 'ru' | 'uz' | 'en'. */
    function detect(text) {
        text = String(text || '');
        var letters = text.replace(/[^A-Za-zА-Яа-яЁёҚқҒғҲҳЎў]/g, '');
        if (!letters) return 'ru';
        var cyr = (letters.match(/[А-Яа-яЁёҚқҒғҲҳЎў]/g) || []).length;
        if (cyr / letters.length > 0.3) return 'ru';
        if (/[oOgG][ʻ'’`‘]|\b(va|bilan|juda|yaxshi|uchun|men|siz|dars|darslar|o'qituvchi|rahmat|kurs|natija|ball|imtihon|topshir|ajoyib|zo'r)\b/i.test(text)) return 'uz';
        return 'en';
    }

    function splitText(text) {
        if (text.length <= CHUNK) return [text];
        var parts = [], cur = '';
        text.split(/(?<=[.!?…\n])\s+/).forEach(function (s) {
            while (s.length > CHUNK) { parts.push(s.slice(0, CHUNK)); s = s.slice(CHUNK); }
            if ((cur + ' ' + s).trim().length > CHUNK) { if (cur) parts.push(cur); cur = s; }
            else cur = (cur ? cur + ' ' : '') + s;
        });
        if (cur) parts.push(cur);
        return parts;
    }

    function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); }); }

    function one(text, from, to) {
        var url = ENDPOINT + '?q=' + encodeURIComponent(text) + '&langpair=' + from + '|' + to;
        return Promise.race([fetch(url), timeout(12000)]).then(function (r) { return r.json(); }).then(function (j) {
            var out = j && j.responseData && j.responseData.translatedText;
            if (!out || (j.responseStatus && Number(j.responseStatus) !== 200)) throw new Error((j && j.responseDetails) || 'bad response');
            if (/MYMEMORY WARNING|PLEASE SELECT TWO DISTINCT|INVALID LANGUAGE/i.test(out)) throw new Error(out);
            // MyMemory sometimes returns HTML entities
            var ta = document.createElement('textarea'); ta.innerHTML = out; return ta.value;
        });
    }

    /** Translate one text. Never throws: on any problem returns null. */
    async function translate(text, from, to) {
        text = String(text == null ? '' : text).trim();
        if (!text || from === to) return text;
        try {
            var parts = splitText(text), out = [];
            for (var i = 0; i < parts.length; i++) out.push(await one(parts[i], from, to));
            return out.join(' ');
        } catch (e) {
            console.warn('Translation failed (' + from + '→' + to + '):', e && e.message);
            return null;
        }
    }

    /**
     * fields: { role: 'text', tags: ['a','b'], certs: ['x'] }   (strings or arrays of strings)
     * returns { uz: {...}, en: {...} } for the languages other than `from`.
     * Anything that could not be translated is simply left out (the site then
     * shows the original text for it). result._failed = number of failures.
     */
    async function translateFields(fields, from, onProgress) {
        from = from || 'ru';
        var targets = LANGS.filter(function (l) { return l !== from; });
        var result = {}, failed = 0, total = 0, done = 0;
        targets.forEach(function (l) { result[l] = {}; });
        Object.keys(fields).forEach(function (k) { var v = fields[k]; total += (Array.isArray(v) ? v.filter(Boolean).length : (v ? 1 : 0)) * targets.length; });
        for (var t = 0; t < targets.length; t++) {
            var to = targets[t];
            for (var k in fields) {
                var v = fields[k];
                if (Array.isArray(v)) {
                    var arr = [], okAll = true;
                    for (var i = 0; i < v.length; i++) {
                        var r = v[i] ? await translate(v[i], from, to) : '';
                        done++; if (onProgress) onProgress(done, total);
                        if (r === null) { failed++; okAll = false; arr.push(v[i]); } else arr.push(r);
                    }
                    if (okAll || arr.length) result[to][k] = arr;
                } else if (v) {
                    var r2 = await translate(v, from, to);
                    done++; if (onProgress) onProgress(done, total);
                    if (r2 === null) failed++; else result[to][k] = r2;
                }
            }
        }
        Object.defineProperty(result, '_failed', { value: failed, enumerable: false });
        return result;
    }

    /* ── Names ──
     * A name is not translated, it is written in the visitor's alphabet: on the UZ / EN site a
     * Cyrillic name is shown in Latin letters ("Убайдуллоев Фирдавс" -> "Ubaydulloyev Firdavs").
     * The admin can type the exact Latin spelling (stored as i18n.uz.name / i18n.en.name);
     * otherwise it is transliterated automatically (Uzbek Latin rules; English uses kh/ts/k/gh). */
    var VOW = 'аеёиоуыэюяўАЕЁИОУЫЭЮЯЎ';
    var MAP = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h' };
    function translit(s, to) {
        s = String(s == null ? '' : s);
        var en = to === 'en', out = '';
        for (var i = 0; i < s.length; i++) {
            var ch = s[i], lo = ch.toLowerCase(), up = ch !== lo, prev = s[i - 1] || '';
            var r;
            if (lo === 'е') r = ((prev && VOW.indexOf(prev) >= 0) || prev === 'ъ' || prev === 'ь') ? 'ye' : 'e';
            else if (lo === 'х') {
                // Russian spelling uses "х" for both Uzbek x and h (Беҳруз, Жавоҳир -> Behruz, Javohir).
                // Keep x only where Uzbek names really have it: Xurshid, Xolmirza, Baxt…, …xon.
                var nx = (s[i + 1] || '').toLowerCase(), start = !prev || /[\s\-]/.test(prev);
                r = ((start && /[уо]/.test(nx)) || nx === 'т' || s.substr(i, 3).toLowerCase() === 'хон') ? (en ? 'kh' : 'x') : 'h';
            }
            else if (en && lo === 'ц') r = 'ts';
            else if (en && lo === 'қ') r = 'k';
            else if (en && lo === 'ғ') r = 'gh';
            else if (en && lo === 'ў') r = 'o';
            else if (Object.prototype.hasOwnProperty.call(MAP, lo)) r = MAP[lo];
            else { out += ch; continue; }
            if (up && r) {
                var nextUp = s[i + 1] && s[i + 1] !== s[i + 1].toLowerCase();
                r = nextUp ? r.toUpperCase() : r.charAt(0).toUpperCase() + r.slice(1);
            }
            out += r;
        }
        return out;
    }
    var hasCyr = function (s) { return /[А-Яа-яЁёЎўҚқҒғҲҳ]/.test(String(s || '')); };
    /** Name of a person in the visitor's language/alphabet. */
    function name(obj, forLang) {
        if (!obj) return '';
        var l = forLang || lang(), n = obj.name == null ? '' : String(obj.name);
        if (l === 'ru') return (obj.srcLang && obj.srcLang !== 'ru' && obj.i18n && obj.i18n.ru && obj.i18n.ru.name) || n;
        var own = obj.i18n && obj.i18n[l] && obj.i18n[l].name;
        if (own) return own;
        return hasCyr(n) ? translit(n, l) : n;
    }
    function initialsOf(n) {
        var p = String(n || '').trim().split(/\s+/);
        return ((p[0] || '?')[0] + (p[1] ? '.' + p[1][0] : '')).toUpperCase();
    }
    /** Copy of a teacher with name + initials in the visitor's alphabet (for rendering). */
    function localPerson(obj, forLang) {
        if (!obj) return obj;
        var n = name(obj, forLang), c = Object.assign({}, obj, { name: n });
        if (n !== obj.name || !obj.initials) c.initials = initialsOf(n);
        return c;
    }

    window.StarthI18n = { lang: lang, pick: pick, pickList: pickList, detect: detect, translate: translate, translateFields: translateFields, LANGS: LANGS, translit: translit, name: name, localPerson: localPerson };
})();
