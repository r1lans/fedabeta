/* TheStarth — "Админ-панель" link in the navbar.
 * Invisible to everyone. Appears only once someone is signed in AND is listed
 * in the `admins` collection (the same check admin.html itself uses) — an
 * ordinary student account never sees it, on any page or in any theme.
 * Requires firebase-config.js (and the firebase-*-compat scripts) to be
 * loaded before this file.
 */
(function () {
    var ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>';

    function ensureStyle() {
        if (document.getElementById('admin-nav-style')) return;
        var st = document.createElement('style');
        st.id = 'admin-nav-style';
        st.textContent =
            '.admin-nav-link{display:inline-flex;align-items:center;gap:6px;color:var(--accent);' +
            'border:1px solid var(--accent);border-radius:999px;padding:6px 14px;font-size:0.85rem;' +
            'font-weight:600;white-space:nowrap;text-decoration:none;}' +
            '.admin-nav-link:hover{background:var(--accent);color:var(--on-accent, #fff);}';
        document.head.appendChild(st);
    }

    function addLink() {
        document.querySelectorAll('.nav-links').forEach(function (nav) {
            if (nav.querySelector('.admin-nav-link')) return;   // already there (e.g. two navs on the page)
            ensureStyle();
            var a = document.createElement('a');
            a.href = 'admin.html';
            a.className = 'admin-nav-link';
            a.innerHTML = ICON + 'Админ-панель';
            var langSwitch = nav.querySelector('.lang-switch');
            if (langSwitch) nav.insertBefore(a, langSwitch);
            else nav.appendChild(a);
        });
    }

    function removeLink() {
        document.querySelectorAll('.admin-nav-link').forEach(function (a) { a.remove(); });
    }

    function check() {
        if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) return;
        auth.onAuthStateChanged(function (user) {
            if (!user) { removeLink(); return; }
            db.collection('admins').doc(user.uid).get().then(function (doc) {
                if (doc.exists) addLink(); else removeLink();
            }).catch(function () { removeLink(); });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check);
    else check();
})();
