// Fullscreen video player (used by "Команда экспертов" cards).
// VideoBox.open(link, title) — link: YouTube / Instagram / direct https video file.
(function () {
    var box = null, lastFocus = null;
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    function close() {
        if (!box) return;
        document.removeEventListener('keydown', onKey, true);
        box.remove(); box = null;
        document.documentElement.classList.remove('vbox-lock');
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

    function open(link, title) {
        var info = window.parseVideoLink ? window.parseVideoLink(link) : null;
        if (!info) return false;
        close();
        lastFocus = document.activeElement;
        var inner;
        if (info.type === 'youtube') {
            inner = '<iframe src="https://www.youtube-nocookie.com/embed/' + info.id + '?autoplay=1&rel=0&playsinline=1&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="' + esc(title) + '"></iframe>';
        } else if (info.type === 'instagram') {
            inner = '<iframe class="vbox-ig" src="https://www.instagram.com/' + info.kind + '/' + info.code + '/embed" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="' + esc(title) + '"></iframe>';
        } else {
            inner = '<video src="' + esc(info.url) + '" controls autoplay playsinline></video>';
        }
        box = document.createElement('div');
        box.className = 'vbox';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML =
            '<div class="vbox-bar"><div class="vbox-title">' + esc(title || '') + '</div>' +
            '<button type="button" class="vbox-x" aria-label="Закрыть">' + (window.Icons ? Icons.svg('x') : '×') + '</button></div>' +
            '<div class="vbox-stage">' + inner + '</div>';
        box.addEventListener('click', function (e) { if (e.target === box || e.target.classList.contains('vbox-stage')) close(); });
        box.querySelector('.vbox-x').addEventListener('click', close);
        document.body.appendChild(box);
        document.documentElement.classList.add('vbox-lock');
        document.addEventListener('keydown', onKey, true);
        box.querySelector('.vbox-x').focus();
        return true;
    }
    window.VideoBox = { open: open, close: close };
})();
