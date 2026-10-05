/* TheStarth — «Назад» button on inner pages (not on the home page).
 * A small pill under the top bar. Goes to the previous page of this site, or to the home page when there is none.
 * Pages can opt out with <body data-no-back>. */
(function () {
    'use strict';
    if (document.body && document.body.hasAttribute('data-no-back')) return;
    var path = location.pathname.split('/').pop();
    if (!path || path === 'index.html') return;
    var L = { ru: 'Назад', uz: 'Orqaga', en: 'Back' };
    function lang() { try { return localStorage.getItem('starthLang') || 'ru'; } catch (e) { return 'ru'; } }
    function build() {
        if (document.getElementById('backBtn')) return;
        var nav = document.querySelector('.navbar');
        var a = document.createElement('a');
        a.id = 'backBtn'; a.href = 'index.html'; a.className = 'back-btn';
        a.innerHTML = '<span aria-hidden="true">←</span> <span class="back-txt">' + L[lang()] + '</span>';
        a.addEventListener('click', function (e) {
            var same = false; try { same = document.referrer && new URL(document.referrer).host === location.host; } catch (x) {}
            if (same && history.length > 1) { e.preventDefault(); history.back(); }
        });
        document.body.appendChild(a);
        function place() { a.style.top = ((nav ? nav.getBoundingClientRect().height : 60) + 8) + 'px'; }
        place(); window.addEventListener('resize', place);
        window.addEventListener('starth-lang-changed', function () { a.querySelector('.back-txt').textContent = L[lang()]; });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
