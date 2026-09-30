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

    window.StarthI18n = { lang: lang, pick: pick, pickList: pickList, detect: detect, translate: translate, translateFields: translateFields, LANGS: LANGS };
})();
