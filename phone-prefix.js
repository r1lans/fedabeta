/* TheStarth — phone fields: a country-code button + number formatting, and the "@" in Telegram fields.
 *   - every phone field gets a button with the country code (default +998 Uzbekistan). Tapping it opens a country list
 *     with search (like in Telegram); choosing a country changes the prefix of the number;
 *   - the prefix cannot be erased with Backspace; the rest of the number is formatted while typing (+998 90 123 45 67);
 *   - a number pasted as a whole ("+7 912 …", "+1 …") is recognised and the country button follows it;
 *   - the value of the field is always the full number with the prefix, so existing code that reads .value keeps working;
 *   - Telegram fields (name="telegram" or id="peTg") always start with "@": the person types only the username.
 * Applies to every <input type="tel"> and to inputs named/id'ed "phone", including fields created later (modals).
 */
(function () {
    'use strict';
    // ISO code → dial code (E.164). North-American territories carry their area code so they are listed separately.
    const RAW = 'AD376 AE971 AF93 AG1268 AI1264 AL355 AM374 AO244 AR54 AS1684 AT43 AU61 AW297 AZ994 BA387 BB1246 BD880 BE32 BF226 BG359 BH973 BI257 BJ229 BM1441 BN673 BO591 BR55 BS1242 BT975 BW267 BY375 BZ501 CA1 CD243 CF236 CG242 CH41 CI225 CK682 CL56 CM237 CN86 CO57 CR506 CU53 CV238 CY357 CZ420 DE49 DJ253 DK45 DM1767 DO1809 DZ213 EC593 EE372 EG20 ER291 ES34 ET251 FI358 FJ679 FM691 FO298 FR33 GA241 GB44 GD1473 GE995 GH233 GI350 GL299 GM220 GN224 GQ240 GR30 GT502 GU1671 GW245 GY592 HK852 HN504 HR385 HT509 HU36 ID62 IE353 IL972 IN91 IQ964 IR98 IS354 IT39 JM1876 JO962 JP81 KE254 KG996 KH855 KI686 KM269 KN1869 KP850 KR82 KW965 KY1345 KZ7 LA856 LB961 LC1758 LI423 LK94 LR231 LS266 LT370 LU352 LV371 LY218 MA212 MC377 MD373 ME382 MG261 MH692 MK389 ML223 MM95 MN976 MO853 MP1670 MR222 MS1664 MT356 MU230 MV960 MW265 MX52 MY60 MZ258 NA264 NC687 NE227 NG234 NI505 NL31 NO47 NP977 NR674 NZ64 OM968 PA507 PE51 PF689 PG675 PH63 PK92 PL48 PR1787 PS970 PT351 PW680 PY595 QA974 RO40 RS381 RU7 RW250 SA966 SB677 SC248 SD249 SE46 SG65 SI386 SK421 SL232 SM378 SN221 SO252 SR597 SS211 ST239 SV503 SX1721 SY963 SZ268 TC1649 TD235 TG228 TH66 TJ992 TL670 TM993 TN216 TO676 TR90 TT1868 TV688 TW886 TZ255 UA380 UG256 US1 UY598 UZ998 VA379 VC1784 VE58 VG1284 VI1340 VN84 VU678 WS685 XK383 YE967 ZA27 ZM260 ZW263';
    const COUNTRIES = RAW.split(' ').map((s) => ({ iso: s.slice(0, 2), dial: s.slice(2) }));
    const DIALS = Array.from(new Set(COUNTRIES.map((c) => c.dial))).sort((a, b) => b.length - a.length);   // longest first for prefix matching
    const COMMON = ['UZ', 'RU', 'KZ', 'KG', 'TJ', 'TM', 'TR', 'US', 'GB', 'DE', 'AE', 'KR'];
    const DEFAULT = '998';

    const lang = () => { try { const l = localStorage.getItem('starthLang') || document.documentElement.lang || 'ru'; return ['ru', 'uz', 'en'].indexOf(l) !== -1 ? l : 'ru'; } catch (e) { return 'ru'; } };
    const L = {
        ru: { title: 'Выберите страну', search: 'Поиск', close: 'Закрыть', full: 'Введите номер полностью', none: 'Ничего не найдено', code: 'Код страны' },
        uz: { title: 'Mamlakatni tanlang', search: 'Qidirish', close: 'Yopish', full: "Raqamni to'liq kiriting", none: 'Hech narsa topilmadi', code: 'Mamlakat kodi' },
        en: { title: 'Select Country', search: 'Search', close: 'Close', full: 'Enter the full number', none: 'Nothing found', code: 'Country code' },
    };
    let dn = {}; const names = () => { const lg = lang(); if (!dn[lg]) { try { dn[lg] = new Intl.DisplayNames([lg === 'uz' ? 'uz-Latn' : lg], { type: 'region' }); } catch (e) { dn[lg] = null; } } return dn[lg]; };
    const cname = (iso) => { try { const n = names(); return (n && n.of(iso)) || iso; } catch (e) { return iso; } };

    const isPhone = (el) => el && el.tagName === 'INPUT' && !el.hasAttribute('data-nophone') && (el.type === 'tel' || el.name === 'phone' || /phone$/i.test(el.id || ''));
    const isTg = (el) => el && el.tagName === 'INPUT' && (el.name === 'telegram' || el.id === 'peTg' || el.hasAttribute('data-tg'));

    // ── number formatting ──
    const groups = (d, dial) => {
        if (dial === '998') return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
        const out = []; let i = 0; const sizes = [3, 3, 2, 2, 2, 2];
        sizes.forEach((n) => { if (i < d.length) { out.push(d.slice(i, i + n)); i += n; } });
        if (i < d.length) out.push(d.slice(i));
        return out.join(' ');
    };
    const maxNational = (dial) => (dial === '998' ? 9 : Math.max(4, 15 - dial.length));
    /** raw → { dial, text } ; el.__dial remembers the chosen country */
    function parse(raw, curDial) {
        raw = String(raw || '');
        if (raw.lastIndexOf('+') > 0) raw = raw.slice(raw.lastIndexOf('+'));          // a whole number pasted after the old prefix ("+7 +998 90 …")
        let d = raw.replace(/\D/g, ''), dial = curDial || DEFAULT;
        if (raw.trim().charAt(0) === '+') {                                   // "+code rest": the current country wins, otherwise the country is read from the number
            if (d.indexOf(dial) === 0) d = d.slice(dial.length);
            else { const m = DIALS.find((c) => d.indexOf(c) === 0); if (m) { dial = m; d = d.slice(m.length); } }
        } else if (dial === '998' && d.indexOf('998') === 0) d = d.slice(3);                                      // "998901234567"
        else if (d.indexOf(dial) === 0 && d.length > dial.length + 6) d = d.slice(dial.length);
        else if (d.charAt(0) === '0' && dial === '998') d = d.slice(1);
        d = d.slice(0, maxNational(dial));
        return { dial, d, text: '+' + dial + ' ' + groups(d, dial) };
    }
    const fmt = (raw) => parse(raw, DEFAULT).text;

    const dialOf = (el) => el.__dial || DEFAULT;
    function validity(el) {
        const v = el.value.trim(), d = v.replace(/\D/g, ''), dial = dialOf(el);
        let ok = true;
        if (d && d !== dial) ok = dial === '998' ? d.length === 12 : (d.length - dial.length >= 5 && d.length <= 15);
        const lg = L[lang()] || L.ru;
        el.setCustomValidity(ok ? '' : (lg.full + (dial === '998' ? ': +998 XX XXX XX XX' : '')));
    }
    function setValue(el, text) { if (el.value !== text) el.value = text; syncBtn(el); validity(el); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
    function apply(el) { const p = parse(el.value, dialOf(el)); el.__dial = p.dial; setValue(el, p.text); }

    // ── country button + wrapper ──
    const isoFor = (el) => { const dial = dialOf(el); if (el.__iso && COUNTRIES.some((c) => c.iso === el.__iso && c.dial === dial)) return el.__iso; const m = COMMON.find((i) => COUNTRIES.some((c) => c.iso === i && c.dial === dial)); return m || (COUNTRIES.find((c) => c.dial === dial) || {}).iso || ''; };
    function syncBtn(el) {
        const b = el.__ppBtn; if (!b) return;
        b.querySelector('.pp-dial').textContent = '+' + dialOf(el);
        b.title = (L[lang()] || L.ru).code + ': ' + cname(isoFor(el));
        el.__last = el.value;
    }
    function wrap(el) {
        if (el.__ppBtn || !el.parentNode) return;
        const cs = getComputedStyle(el);
        const w = document.createElement('div'); w.className = 'pp-wrap';
        w.style.margin = cs.margin; el.style.margin = '0';
        if (cs.display === 'none') w.style.display = 'none';
        el.parentNode.insertBefore(w, el);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pp-btn';
        b.innerHTML = '<span class="pp-dial">+998</span><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        b.style.borderRadius = cs.borderRadius; b.style.borderColor = cs.borderTopColor; b.style.background = cs.backgroundColor; b.style.color = cs.color; b.style.fontSize = cs.fontSize; b.style.fontFamily = cs.fontFamily;
        w.appendChild(b); w.appendChild(el); el.__ppBtn = b; el.__wrap = w;
        b.addEventListener('click', () => openPicker(el));
        // keep the wrapper hidden/shown together with the field
        try { new MutationObserver(() => { w.style.display = getComputedStyle(el).display === 'none' ? 'none' : ''; }).observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }); } catch (e) {}
        syncBtn(el);
    }

    // ── country list ──
    function openPicker(el) {
        const lg = L[lang()] || L.ru;
        const ov = document.createElement('div'); ov.className = 'pp-ov';
        ov.innerHTML = `<div class="pp-box" role="dialog" aria-modal="true" aria-label="${lg.title}"><h3>${lg.title}</h3>
            <div class="pp-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="text" class="pp-q" placeholder="${lg.search}" autocomplete="off" data-nophone></div>
            <div class="pp-list" role="listbox"></div><div class="pp-foot"><button type="button" class="pp-close">${lg.close}</button></div></div>`;
        const list = ov.querySelector('.pp-list'), q = ov.querySelector('.pp-q');
        const all = COUNTRIES.map((c) => ({ iso: c.iso, dial: c.dial, name: cname(c.iso) })).sort((a, b) => a.name.localeCompare(b.name, lang() === 'uz' ? 'uz' : lang()));
        const common = COMMON.map((i) => all.find((c) => c.iso === i)).filter(Boolean);
        const row = (c) => `<button type="button" class="pp-row ${c.dial === dialOf(el) ? 'on' : ''}" data-iso="${c.iso}" data-dial="${c.dial}" role="option"><span>${c.name}</span><em>+${c.dial}</em></button>`;
        const render = () => {
            const s = q.value.trim().toLowerCase().replace(/^\+/, '');
            if (!s) list.innerHTML = common.map(row).join('') + '<div class="pp-sep"></div>' + all.map(row).join('');
            else { const f = all.filter((c) => c.name.toLowerCase().indexOf(s) !== -1 || c.dial.indexOf(s) === 0 || c.iso.toLowerCase() === s); list.innerHTML = f.length ? f.map(row).join('') : `<div class="pp-none">${lg.none}</div>`; }
        };
        render(); q.addEventListener('input', render);
        const close = () => { ov.remove(); document.removeEventListener('keydown', onk, true); };
        const onk = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onk, true);
        ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
        ov.querySelector('.pp-close').onclick = close;
        list.addEventListener('click', (e) => {
            const r = e.target.closest('.pp-row'); if (!r) return;
            const nat = parse(el.value, dialOf(el)).d;                     // keep what was typed after the old prefix
            el.__dial = r.dataset.dial; el.__iso = r.dataset.iso;
            setValue(el, '+' + r.dataset.dial + ' ' + groups(nat.slice(0, maxNational(r.dataset.dial)), r.dataset.dial));
            close(); try { el.focus(); } catch (er) {}
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        document.body.appendChild(ov); setTimeout(() => q.focus(), 30);
    }

    function prep(el) {
        if (el.__phone) return; el.__phone = true;
        el.setAttribute('inputmode', 'tel'); el.setAttribute('autocomplete', el.getAttribute('autocomplete') || 'tel');
        el.removeAttribute('maxlength');
        el.setAttribute('placeholder', '+998 90 123 45 67');
        if (el.value) { const p = parse(el.value, DEFAULT); el.__dial = p.dial; el.value = p.text; }
        wrap(el); syncBtn(el); validity(el);
    }
    document.addEventListener('focusin', (e) => {
        const el = e.target;
        if (isPhone(el)) { prep(el); if (!el.value) { el.value = '+' + dialOf(el) + ' '; setTimeout(() => { try { el.setSelectionRange(el.value.length, el.value.length); } catch (er) {} }, 0); } }
        else if (isTg(el)) { if (!el.value) { el.value = '@'; setTimeout(() => { try { el.setSelectionRange(1, 1); } catch (er) {} }, 0); } }
    });
    document.addEventListener('input', (e) => {
        const el = e.target;
        if (isPhone(el)) { prep(el); apply(el); }
        else if (isTg(el)) { const v = '@' + String(el.value).replace(/[^A-Za-z0-9_]/g, ''); if (el.value !== v.slice(0, 33)) el.value = v.slice(0, 33); }
    }, true);
    document.addEventListener('keydown', (e) => {
        const el = e.target;
        if (isPhone(el) && (e.key === 'Backspace' || e.key === 'Delete') && el.value.length <= dialOf(el).length + 2 && el.selectionStart === el.selectionEnd) e.preventDefault();   // keep "+998 "
        else if (isTg(el) && e.key === 'Backspace' && el.value === '@') e.preventDefault();
    });
    document.addEventListener('blur', (e) => {
        const el = e.target;
        if (isPhone(el)) { if (el.value.replace(/\D/g, '') === dialOf(el)) { el.value = ''; syncBtn(el); } validity(el); }   // nothing typed: leave the field empty (so "required" works)
        else if (isTg(el) && el.value === '@') el.value = '';
    }, true);
    function scan() {
        document.querySelectorAll('input[type="tel"], input[name="phone"], input[id$="hone"]').forEach((el) => { if (isPhone(el)) prep(el); });
        // values set from code (profile editor, autofill) → keep the button in step
        document.querySelectorAll('input').forEach((el) => { if (el.__ppBtn && el.value !== el.__last) { const p = parse(el.value, dialOf(el)); if (el.value && p.text !== el.value) { el.__dial = p.dial; el.value = p.text; } else if (el.value) el.__dial = p.dial; syncBtn(el); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
    setInterval(scan, 800);
    window.StarthPhone = { format: fmt, countries: COUNTRIES };
})();
