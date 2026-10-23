/* TheStarth — how a Speaking result looks (used by speaking.html, the student cabinet and the teacher journal).
 * SpeakingView.result(doc)  → HTML of one result (band, 4 criteria, mistakes, vocabulary, sample answer, transcript)
 * SpeakingView.list(docs, {who})  → HTML list of results (rows have data-spk-id)
 * SpeakingView.chart(docs)  → small SVG line of overall bands over time ('' when fewer than 2)
 * SpeakingView.load(uidOrList)  → Promise<docs[]> from Firestore (speakingResults), newest first
 */
(function () {
    const lang = () => { try { const l = localStorage.getItem('starthLang'); return l === 'uz' || l === 'en' ? l : 'ru'; } catch (e) { return 'ru'; } };
    const L = {
        ru: { band: 'Примерный балл IELTS Speaking', fc: 'Беглость и связность', lr: 'Словарный запас', gra: 'Грамматика', pr: 'Произношение',
            prNote: 'Произношение оценено примерно — по тому, как компьютер распознал вашу речь.', exam: 'Пробный IELTS Speaking', practice: 'Разговор на тему',
            words: 'слов', wpm: 'слов в минуту', min: 'мин', strengths: 'Что получилось', improve: 'Что улучшить', mistakes: 'Ошибки и исправления',
            vocab: 'Слова и фразы для балла выше', sample: 'Пример сильного ответа (Band 7.5)', parts: 'По частям', part: 'Part', transcript: 'Текст разговора',
            examiner: 'Экзаменатор', partner: 'Собеседник', you: 'Вы', empty: 'Пока нет результатов.', open: 'Открыть', student: 'Ученик' },
        uz: { band: 'Taxminiy IELTS Speaking bali', fc: 'Ravonlik va izchillik', lr: 'So‘z boyligi', gra: 'Grammatika', pr: 'Talaffuz',
            prNote: 'Talaffuz taxminan baholangan — kompyuter nutqingizni qanday tanib olganiga qarab.', exam: 'IELTS Speaking sinovi', practice: 'Mavzu bo‘yicha suhbat',
            words: 'so‘z', wpm: 'so‘z/daqiqa', min: 'daq', strengths: 'Nimalar yaxshi chiqdi', improve: 'Nimani yaxshilash kerak', mistakes: 'Xatolar va tuzatishlar',
            vocab: 'Yuqori ball uchun so‘z va iboralar', sample: 'Kuchli javob namunasi (Band 7.5)', parts: 'Qismlar bo‘yicha', part: 'Part', transcript: 'Suhbat matni',
            examiner: 'Imtihonchi', partner: 'Suhbatdosh', you: 'Siz', empty: 'Hozircha natijalar yo‘q.', open: 'Ochish', student: 'O‘quvchi' },
        en: { band: 'Estimated IELTS Speaking band', fc: 'Fluency and coherence', lr: 'Vocabulary', gra: 'Grammar', pr: 'Pronunciation',
            prNote: 'Pronunciation is estimated from how well the computer recognised your speech.', exam: 'IELTS Speaking mock test', practice: 'Topic conversation',
            words: 'words', wpm: 'words/min', min: 'min', strengths: 'What went well', improve: 'What to improve', mistakes: 'Mistakes and corrections',
            vocab: 'Words and phrases for a higher band', sample: 'Model answer (Band 7.5)', parts: 'By part', part: 'Part', transcript: 'Transcript',
            examiner: 'Examiner', partner: 'Partner', you: 'You', empty: 'No results yet.', open: 'Open', student: 'Student' },
    };
    const t = (k) => (L[lang()][k] != null ? L[lang()][k] : L.ru[k]);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ic = (n) => (window.Icons ? window.Icons.svg(n) : '');
    const b1 = (n) => (n == null || isNaN(n) ? '—' : Number(n).toFixed(1));
    const tsMs = (d) => { const x = d && d.ts; if (!x) return 0; if (typeof x === 'number') return x; if (x.toMillis) return x.toMillis(); if (x.seconds) return x.seconds * 1000; return +new Date(x) || 0; };
    const dstr = (ms) => { if (!ms) return ''; const d = new Date(ms); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
    const tone = (b) => (b >= 7 ? 'hi' : b >= 5.5 ? 'mid' : 'lo');

    function css() {
        if (document.getElementById('spkv-css')) return;
        const s = document.createElement('style'); s.id = 'spkv-css';
        s.textContent = `
.spkv{display:flex;flex-direction:column;gap:1.1rem;text-align:left;color:var(--ink)}
.spkv-top{display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap;background:var(--paper-alt);border:1px solid var(--rule);border-radius:18px;padding:1.2rem 1.3rem}
.spkv-band{width:108px;height:108px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:var(--accent);color:var(--on-accent);font:800 2.6rem/1 var(--font-heading)}
.spkv-band.lo{background:#C2410C;color:#fff}.spkv-band.mid{background:var(--accent)}.spkv-band.hi{background:#15803D;color:#fff}
.spkv-head{flex:1;min-width:200px}.spkv-head h3{margin:0 0 .25rem;font-size:1.15rem}.spkv-head .spkv-sub{color:var(--ink-soft);font-size:.9rem}
.spkv-chips{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.6rem}.spkv-chip{font-size:.8rem;padding:.25rem .6rem;border-radius:999px;background:var(--paper);border:1px solid var(--rule);color:var(--ink-soft)}
.spkv-crit{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}
.spkv-c{background:var(--paper-alt);border:1px solid var(--rule);border-radius:14px;padding:.8rem .95rem}
.spkv-c-top{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem;font-size:.92rem;font-weight:600}.spkv-c-top b{font-size:1.25rem;color:var(--accent)}
.spkv-bar{height:8px;border-radius:99px;background:var(--rule);margin-top:.5rem;overflow:hidden}.spkv-bar i{display:block;height:100%;border-radius:99px;background:var(--accent)}
.spkv-note{font-size:.8rem;color:var(--ink-soft);margin:-.4rem 0 0}
.spkv-box{background:var(--paper-alt);border:1px solid var(--rule);border-radius:16px;padding:1rem 1.15rem}
.spkv-box h4{display:flex;align-items:center;gap:.5rem;margin:0 0 .65rem;font-size:1rem}.spkv-box h4 .ico{color:var(--accent);font-size:1.15rem}
.spkv-box p{margin:0;line-height:1.55}.spkv-ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.45rem}
.spkv-ul li{display:flex;gap:.55rem;line-height:1.45}.spkv-ul li .ico{flex:0 0 auto;margin-top:.2em;color:var(--accent)}
.spkv-two{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
.spkv-mis{display:flex;flex-direction:column;gap:.55rem}.spkv-m{padding:.6rem .75rem;border-radius:12px;background:var(--paper);border:1px solid var(--rule)}
.spkv-m .w{text-decoration:line-through;color:#C2410C}.spkv-m .r{color:#15803D;font-weight:600}.spkv-m .y{display:block;font-size:.85rem;color:var(--ink-soft);margin-top:.2rem}
[data-theme="dark"] .spkv-m .w{color:#FB923C}[data-theme="dark"] .spkv-m .r{color:#4ADE80}
.spkv-voc{display:flex;flex-wrap:wrap;gap:.5rem}.spkv-v{padding:.5rem .7rem;border-radius:12px;background:var(--accent-tint);max-width:100%}.spkv-v b{display:block;color:var(--accent)}.spkv-v span{font-size:.85rem;color:var(--ink-soft)}
.spkv-sample q{display:block;font-weight:600;margin-bottom:.4rem;quotes:none}.spkv-sample p{font-style:italic}
.spkv-parts{display:flex;flex-direction:column;gap:.35rem}.spkv-parts div{display:flex;gap:.6rem}.spkv-parts b{flex:0 0 auto;color:var(--accent)}
.spkv-tr summary{cursor:pointer;font-weight:600;display:flex;align-items:center;gap:.5rem}.spkv-tr summary::-webkit-details-marker{display:none}
.spkv-lines{display:flex;flex-direction:column;gap:.5rem;margin-top:.8rem;max-height:420px;overflow:auto}
.spkv-l{padding:.5rem .7rem;border-radius:12px;background:var(--paper);border:1px solid var(--rule);font-size:.92rem;line-height:1.45}.spkv-l.s{border-color:var(--accent);background:var(--accent-tint)}
.spkv-l small{display:block;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:.15rem}
.spkv-list{display:flex;flex-direction:column;gap:.5rem}
.spkv-row{display:flex;align-items:center;gap:.8rem;padding:.7rem .85rem;border-radius:14px;border:1px solid var(--rule);background:var(--paper-alt);cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit}
.spkv-row:hover{border-color:var(--accent)}.spkv-row .spkv-pill{flex:0 0 auto;min-width:3.1rem;text-align:center;padding:.35rem .5rem;border-radius:10px;font-weight:800;background:var(--accent);color:var(--on-accent)}
.spkv-row .spkv-pill.lo{background:#C2410C;color:#fff}.spkv-row .spkv-pill.hi{background:#15803D;color:#fff}
.spkv-row .spkv-mid{flex:1;min-width:0}.spkv-row .spkv-mid b{display:block;font-size:.95rem}.spkv-row .spkv-mid span{font-size:.82rem;color:var(--ink-soft)}
.spkv-row .spkv-go{color:var(--ink-soft)}.spkv-empty{color:var(--ink-soft);padding:.6rem 0}
.spkv-chart{width:100%;max-width:720px;height:auto;display:block;margin:0 auto}
@media(max-width:640px){.spkv-crit,.spkv-two{grid-template-columns:1fr}.spkv-band{width:88px;height:88px;font-size:2.1rem}}
`;
        document.head.appendChild(s);
    }

    function result(d) {
        css();
        d = d || {};
        const crit = ['fc', 'lr', 'gra', 'pr'].map((k) => `<div class="spkv-c"><div class="spkv-c-top"><span>${t(k)}${k === 'pr' ? '*' : ''}</span><b>${b1(d[k])}</b></div><div class="spkv-bar"><i style="width:${Math.max(0, Math.min(100, (Number(d[k]) || 0) / 9 * 100))}%"></i></div></div>`).join('');
        const chips = [];
        if (d.words) chips.push(d.words + ' ' + t('words'));
        if (d.wpm) chips.push(Math.round(d.wpm) + ' ' + t('wpm'));
        if (d.secs) chips.push(Math.max(1, Math.round(d.secs / 60)) + ' ' + t('min'));
        const li = (arr, icon) => (arr || []).map((x) => `<li>${ic(icon)}<span>${esc(x)}</span></li>`).join('');
        const parts = d.parts && Object.keys(d.parts).length ? `<div class="spkv-box"><h4>${ic('chart')}${t('parts')}</h4><div class="spkv-parts">${['1', '2', '3'].filter((k) => d.parts[k]).map((k) => `<div><b>${t('part')} ${k}</b><span>${esc(d.parts[k])}</span></div>`).join('')}</div></div>` : '';
        const mis = (d.mistakes || []).length ? `<div class="spkv-box"><h4>${ic('pencil')}${t('mistakes')}</h4><div class="spkv-mis">${d.mistakes.map((m) => `<div class="spkv-m"><span class="w">${esc(m.wrong)}</span> → <span class="r">${esc(m.right)}</span>${m.why ? `<span class="y">${esc(m.why)}</span>` : ''}</div>`).join('')}</div></div>` : '';
        const voc = (d.vocab || []).length ? `<div class="spkv-box"><h4>${ic('book')}${t('vocab')}</h4><div class="spkv-voc">${d.vocab.map((v) => `<div class="spkv-v"><b>${esc(v.phrase)}</b><span>${esc(v.use)}</span></div>`).join('')}</div></div>` : '';
        const sample = d.sample && d.sample.answer ? `<div class="spkv-box spkv-sample"><h4>${ic('star')}${t('sample')}</h4>${d.sample.question ? `<q>${esc(d.sample.question)}</q>` : ''}<p>${esc(d.sample.answer)}</p></div>` : '';
        const other = d.kind === 'practice' ? t('partner') : t('examiner');
        const tr = (d.transcript || []).length ? `<details class="spkv-box spkv-tr"><summary>${ic('message')}${t('transcript')}</summary><div class="spkv-lines">${d.transcript.map((x) => `<div class="spkv-l${x.r === 's' ? ' s' : ''}"><small>${x.r === 's' ? t('you') : other}${x.p ? ' · ' + t('part') + ' ' + x.p : ''}</small>${esc(x.t)}</div>`).join('')}</div></details>` : '';
        return `<div class="spkv">
<div class="spkv-top"><div class="spkv-band ${tone(d.overall)}">${b1(d.overall)}</div><div class="spkv-head"><h3>${t('band')}</h3>
<div class="spkv-sub">${d.kind === 'practice' ? t('practice') : t('exam')}${d.topic ? ' · ' + esc(d.topic) : ''}${tsMs(d) ? ' · ' + dstr(tsMs(d)) : ''}</div>
${chips.length ? `<div class="spkv-chips">${chips.map((c) => `<span class="spkv-chip">${c}</span>`).join('')}</div>` : ''}</div></div>
<div class="spkv-crit">${crit}</div><p class="spkv-note">* ${t('prNote')}</p>
${d.summary ? `<div class="spkv-box"><p>${esc(d.summary)}</p></div>` : ''}
${parts}
${(d.strengths || []).length || (d.improve || []).length ? `<div class="spkv-two"><div class="spkv-box"><h4>${ic('check-circle')}${t('strengths')}</h4><ul class="spkv-ul">${li(d.strengths, 'check')}</ul></div><div class="spkv-box"><h4>${ic('target')}${t('improve')}</h4><ul class="spkv-ul">${li(d.improve, 'arrow-right')}</ul></div></div>` : ''}
${mis}${voc}${sample}${tr}</div>`;
    }

    function list(docs, opts) {
        css(); opts = opts || {};
        if (!docs || !docs.length) return `<div class="spkv-empty">${t('empty')}</div>`;
        return `<div class="spkv-list">${docs.map((d) => `<button type="button" class="spkv-row" data-spk-id="${esc(d.id)}"><span class="spkv-pill ${tone(d.overall)}">${b1(d.overall)}</span><span class="spkv-mid"><b>${opts.who ? esc(d.name || t('student')) + ' · ' : ''}${d.kind === 'practice' ? t('practice') : t('exam')}</b><span>${esc(d.topic || '')}${d.topic ? ' · ' : ''}${dstr(tsMs(d))}</span></span><span class="spkv-go">${ic('arrow-right')}</span></button>`).join('')}</div>`;
    }

    function chart(docs) {
        const pts = (docs || []).filter((d) => d.overall != null).slice().sort((a, b) => tsMs(a) - tsMs(b)).slice(-12);
        if (pts.length < 2) return '';
        const W = 560, H = 150, px = 34, py = 16, lo = 3, hi = 9;
        const x = (i) => px + i * (W - px - 12) / (pts.length - 1), y = (v) => H - py - (v - lo) / (hi - lo) * (H - 2 * py);
        const grid = [4, 5, 6, 7, 8, 9].map((v) => `<line x1="${px}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/><text x="${px - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--ink-soft)">${v}</text>`).join('');
        const line = pts.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d.overall).toFixed(1)).join(' ');
        const dots = pts.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.overall).toFixed(1)}" r="4.5" fill="var(--accent)" stroke="var(--paper)" stroke-width="2"><title>${b1(d.overall)} · ${dstr(tsMs(d))}</title></circle>`).join('');
        return `<svg class="spkv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Speaking band">${grid}<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
    }

    async function load(uids) {
        if (typeof db === 'undefined' || !db) return [];
        const list_ = Array.isArray(uids) ? uids.filter(Boolean) : [uids];
        const out = [];
        for (let i = 0; i < list_.length; i += 10) {
            const part = list_.slice(i, i + 10);
            const q = part.length === 1 ? db.collection('speakingResults').where('uid', '==', part[0]) : db.collection('speakingResults').where('uid', 'in', part);
            try { const s = await q.get(); s.forEach((d) => out.push(Object.assign({ id: d.id }, d.data()))); } catch (e) { console.warn('speakingResults', e); }
        }
        return out.sort((a, b) => tsMs(b) - tsMs(a));
    }

    window.SpeakingView = { result, list, chart, load, css, tsMs, t };
})();
