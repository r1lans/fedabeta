/* TheStarth — student results: cards + magnifier lens + full-screen viewer.
 * Data comes from the Firestore collection "results", which only admins can edit
 * (admin panel -> "Результаты"). Used by results.html.
 */
(function () {
    var ZOOM = 2.5;   // how much the lens enlarges the certificate

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

    function cardHTML(r) {
        var src = safeSrc(r.image);
        var scores = (Array.isArray(r.scores) ? r.scores : []).filter(function (s) { return s && s.label && s.value !== '' && s.value != null; });
        var overallLabel = String(r.exam || '').toUpperCase() === 'IELTS' ? 'OVERALL' : 'SCORE';
        var label = (r.exam ? r.exam + ' — ' : '') + (r.overall || '');

        return '' +
            '<article class="result-card" tabindex="0" role="button" aria-label="Открыть сертификат: ' + esc(label) + '" data-exam="' + esc(r.exam || '') + '">' +
                (src ? '<div class="result-cert"><img src="' + esc(src) + '" alt="' + esc(r.exam || 'Сертификат') + ' — ' + esc(r.overall || '') + '" loading="lazy" draggable="false"></div>' : '') +
                '<span class="result-lens" aria-hidden="true"></span>' +
                '<div class="result-scores">' +
                    '<div class="result-overall"><small>' + overallLabel + '</small><b>' + esc(r.overall || '—') + '</b></div>' +
                    (scores.length
                        ? '<ul class="result-breakdown">' + scores.map(function (s) {
                            return '<li><span>' + esc(s.label) + '</span><span>' + esc(s.value) + '</span></li>';
                          }).join('') + '</ul>'
                        : '') +
                '</div>' +
                ((r.name || r.exam)
                    ? '<div class="result-foot"><span>' + esc(r.name || '') + '</span><span>' + esc(r.exam || '') + '</span></div>'
                    : '') +
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

    /* ── magnifier lens ─────────────────────────────────── */
    function attachLens(card) {
        var cert = card.querySelector('.result-cert');
        var img = cert && cert.querySelector('img');
        var lens = card.querySelector('.result-lens');
        if (!img || !lens) return;

        var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        lens.style.backgroundImage = 'url("' + img.getAttribute('src').replace(/"/g, '%22') + '")';

        function lensSize() {
            return Math.round(Math.min(210, Math.max(140, card.clientWidth * 0.66)));
        }
        function hide() { card.classList.remove('is-zooming'); }
        function move(e) {
            var ir = img.getBoundingClientRect();
            var cr = card.getBoundingClientRect();
            var x = e.clientX - ir.left, y = e.clientY - ir.top;
            if (x < 0 || y < 0 || x > ir.width || y > ir.height) { hide(); return; }
            var d = lensSize(), inner = d - 6;                     // 3px ring on each side
            lens.style.width = lens.style.height = d + 'px';
            lens.style.left = (e.clientX - cr.left - d / 2) + 'px';
            lens.style.top = (e.clientY - cr.top - d / 2) + 'px';
            lens.style.backgroundSize = (ir.width * ZOOM) + 'px ' + (ir.height * ZOOM) + 'px';
            lens.style.backgroundPosition = (-(x * ZOOM - inner / 2)) + 'px ' + (-(y * ZOOM - inner / 2)) + 'px';
            card.classList.add('is-zooming');
        }

        if (canHover) {
            cert.addEventListener('mouseenter', move);
            cert.addEventListener('mousemove', move);
            cert.addEventListener('mouseleave', hide);
        }
        // click / tap / Enter -> big view (on phones this is the way to zoom)
        function open() { hide(); openViewer(img.getAttribute('src'), img.alt); }
        card.addEventListener('click', open);
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
    }

    /* ── public API ─────────────────────────────────────── */
    function mount(container, list) {
        container.innerHTML = list.map(cardHTML).join('');
        container.querySelectorAll('.result-card').forEach(attachLens);
    }

    window.StarthResults = { esc: esc, safeSrc: safeSrc, cardHTML: cardHTML, mount: mount, attachLens: attachLens, openViewer: openViewer };
})();
