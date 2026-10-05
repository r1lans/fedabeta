/* TheStarth — shared HTML for an IELTS Writing evaluation (used on mock-exam.html for students and in the teacher cabinet).
 * MockFeedback.html(fb, { taskType })  ->  string. All text is Russian (translated by i18n-extra.js when the language is switched).
 * fb = { overall, criteria:{ ta|cc|lr|gra: {band, comment} }, strengths[], weaknesses[], corrections[{original,better,why}], advice[], wordCountNote, teacherNote }
 */
(function () {
    'use strict';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const NAMES = (t) => ({ ta: t === 'task1' ? 'Task Achievement' : 'Task Response', cc: 'Coherence and Cohesion', lr: 'Lexical Resource', gra: 'Grammatical Range and Accuracy' });
    const list = (title, a, cls) => (a && a.length ? `<div class="mf-box ${cls || ''}"><h4>${title}</h4><ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
    function html(fb, o) {
        if (!fb) return '';
        const names = NAMES((o && o.taskType) || 'task2'), c = fb.criteria || {};
        let h = `<div class="mf"><div class="mf-top"><div class="mf-overall"><small>Оценка за задание</small><b>${fb.overall != null ? fb.overall : '—'}</b></div><div class="mf-crit">`;
        ['ta', 'cc', 'lr', 'gra'].forEach((k) => { const x = c[k] || {}; h += `<div class="mf-c"><div class="mf-ch"><span>${names[k]}</span><b>${x.band != null ? x.band : '—'}</b></div>${x.comment ? `<p>${esc(x.comment)}</p>` : ''}</div>`; });
        h += '</div></div>';
        if (fb.wordCountNote) h += `<p class="mf-note">${esc(fb.wordCountNote)}</p>`;
        h += list('Сильные стороны', fb.strengths, 'good') + list('Что слабее', fb.weaknesses, 'bad');
        if (fb.corrections && fb.corrections.length) h += `<div class="mf-box"><h4>Исправления</h4>${fb.corrections.map((x) => `<div class="mf-fix"><div class="o">${esc(x.original)}</div><div class="b">${esc(x.better)}</div>${x.why ? `<small>${esc(x.why)}</small>` : ''}</div>`).join('')}</div>`;
        h += list('Что тренировать, чтобы вырасти на +0.5', fb.advice);
        if (fb.teacherNote) h += `<div class="mf-box note"><h4>Комментарий учителя</h4><p>${esc(fb.teacherNote)}</p></div>`;
        return h + '</div>';
    }
    window.MockFeedback = { html, NAMES };
})();
