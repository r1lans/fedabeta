/* TheStarth — student results: score cards (ring + skill bars + certificate preview) + full-screen viewer.
 * Data comes from the Firestore collection "results", which only admins can edit
 * (admin panel -> "Результаты"). Used by results.html.
 */
(function () {
    function esc(v) {
        if (v === undefined || v === null) return '';
        return String(v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // only allow real image sources (uploaded data: URL, https link or a local file)
    function safeSrc(src) {
        src = String(src || '').trim();
        return /^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/|images\/)/i.test(src) ? src : '';
    }

    // Score scale used for the ring and the bars: IELTS = 9 bands, SAT = 1600 total / 800 per section, otherwise guess from the value.
    function scaleFor(exam, v, isOverall) {
        var e = String(exam || '').toUpperCase();
        if (e.indexOf('IELTS') !== -1) return 9;
        if (e.indexOf('SAT') !== -1) return isOverall ? 1600 : 800;
        return v <= 9 ? 9 : v <= 100 ? 100 : v <= 800 ? 800 : 1600;
    }
    function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
    function initials(n) { return String(n || '').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase() || '★'; }

    function ringHTML(r, overallLabel) {
        var v = num(r.overall), R = 42, C = 2 * Math.PI * R;
        var pct = v == null ? 0 : Math.max(0, Math.min(1, v / scaleFor(r.exam, v, true)));
        return '<div class="rs-ring" role="img" aria-label="' + esc(overallLabel + ' ' + (r.overall || '')) + '">' +
            '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="rs-ring-bg" cx="50" cy="50" r="' + R + '"/>' +
            '<circle class="rs-ring-fg" cx="50" cy="50" r="' + R + '" style="stroke-dasharray:' + C.toFixed(1) + ';stroke-dashoffset:' + (C * (1 - pct)).toFixed(1) + ';--rs-c:' + C.toFixed(1) + '"/></svg>' +
            '<div class="rs-ring-num"><b>' + esc(r.overall || '—') + '</b><small>' + esc(overallLabel) + '</small></div></div>';
    }

    function cardHTML(r) {
        var src = safeSrc(r.image);
        var scores = (Array.isArray(r.scores) ? r.scores : []).filter(function (s) { return s && s.label && s.value !== '' && s.value != null; });
        var overallLabel = String(r.exam || '').toUpperCase() === 'IELTS' ? 'Overall' : 'Score';
        var label = (r.exam ? r.exam + ' — ' : '') + (r.overall || '');

        return '' +
            '<article class="rs-card" data-exam="' + esc(r.exam || '') + '">' +
                (src ? '<button type="button" class="rs-doc" aria-label="Открыть сертификат: ' + esc(label) + '">' +
                    '<img src="' + esc(src) + '" alt="' + esc(r.exam || 'Сертификат') + ' — ' + esc(r.overall || '') + '" loading="lazy" draggable="false">' +
                    '<span class="rs-open"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg> Открыть</span></button>' : '') +
                '<div class="rs-who"><span class="rs-avatar" aria-hidden="true">' + esc(initials(r.name)) + '</span>' +
                    '<div class="rs-name"><strong>' + esc(r.name || 'Ученик TheStarth') + '</strong>' + (r.exam ? '<span class="rs-exam">' + esc(r.exam) + '</span>' : '') + '</div></div>' +
                '<div class="rs-score">' + ringHTML(r, overallLabel) +
                    (scores.length ? '<ul class="rs-bars">' + scores.map(function (s, i) {
                        var v = num(s.value), w = v == null ? 0 : Math.max(0, Math.min(100, v / scaleFor(r.exam, v, false) * 100));
                        return '<li><span class="rs-bar-label">' + esc(s.label) + '</span><span class="rs-bar-val">' + esc(s.value) + '</span>' +
                            '<span class="rs-bar"><i style="width:' + w.toFixed(0) + '%;animation-delay:' + (i * 70) + 'ms"></i></span></li>';
                    }).join('') + '</ul>' : '') +
                '</div>' +
            '</article>';
    }

    /* ── full-screen viewer ─────────────────────────────── */
    var box = null;
    function openViewer(src, alt) {
        if (!src) return;
        if (!box) {
            box = document.createElement('div');
            box.className = 'lightbox';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            box.innerHTML = '<button type="button" class="lightbox-close" aria-label="Закрыть">&times;</button><img alt="">';
            document.body.appendChild(box);
            box.addEventListener('click', function (e) { if (e.target !== box.querySelector('img')) closeViewer(); });
            document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeViewer(); });
        }
        var img = box.querySelector('img');
        img.src = src;
        img.alt = alt || '';
        box.classList.add('show');
        document.body.style.overflow = 'hidden';
        box.querySelector('.lightbox-close').focus();
    }
    function closeViewer() {
        if (!box) return;
        box.classList.remove('show');
        document.body.style.overflow = '';
    }

    /* ── open the certificate full screen (click / tap / Enter on the preview) ── */
    function attachOpen(card) {
        var btn = card.querySelector('.rs-doc');
        var img = btn && btn.querySelector('img');
        if (!img) return;
        btn.addEventListener('click', function () { openViewer(img.getAttribute('src'), img.alt); });
    }

    /* ── public API ─────────────────────────────────────── */
    function mount(container, list) {
        container.innerHTML = list.map(cardHTML).join('');
        container.querySelectorAll('.rs-card').forEach(attachOpen);
    }

    window.StarthResults = { esc: esc, safeSrc: safeSrc, cardHTML: cardHTML, mount: mount, attachOpen: attachOpen, openViewer: openViewer };
})();
