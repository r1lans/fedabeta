/* TheStarth — light / dark theme.
 *
 * Loaded in <head> of every page so the saved theme is applied BEFORE the
 * first paint (no white flash on dark). The toggle button is injected into
 * the navbar automatically, so pages don't need any extra markup.
 *
 * Order of choice: saved choice (localStorage) -> system preference -> light.
 */
(function () {
    var KEY = 'starthTheme';
    var root = document.documentElement;

    function readSaved() {
        try { var v = localStorage.getItem(KEY); return (v === 'dark' || v === 'light') ? v : null; }
        catch (e) { return null; }
    }
    function systemTheme() {
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    function current() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

    function apply(theme) {
        root.setAttribute('data-theme', theme);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            (document.head || root).appendChild(meta);
        }
        meta.setAttribute('content', theme === 'dark' ? '#12141A' : '#FAF9F5');
        document.querySelectorAll('.theme-toggle').forEach(function (b) {
            b.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        });
    }

    apply(readSaved() || systemTheme());

    var SUN = '<svg class="ti-sun" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    var MOON = '<svg class="ti-moon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';

    function makeButton(extraClass) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'theme-toggle ' + (extraClass || '');
        b.setAttribute('aria-label', 'Переключить тему / Toggle theme');
        b.setAttribute('title', 'Светлая / тёмная тема');
        b.setAttribute('aria-pressed', current() === 'dark' ? 'true' : 'false');
        b.innerHTML = SUN + MOON;
        b.addEventListener('click', toggle);
        return b;
    }

    function toggle() {
        var next = current() === 'dark' ? 'light' : 'dark';
        // short-lived class -> smooth colour transition only while switching
        root.classList.add('theme-anim');
        apply(next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
        setTimeout(function () { root.classList.remove('theme-anim'); }, 350);
    }

    var BURGER_SVG =
        '<svg class="mi-bars" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
        '<svg class="mi-close" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

    /* Menu: section links go into a dropdown (computer) / side panel (phone);
       Mock Exam, Оплата, Личный кабинет, admin link and the languages stay in the bar. */
    function setupMenu(container, links, burger) {
        var root = document.documentElement;
        var navbar = container.closest('.navbar') || container;

        var menu = document.createElement('div');
        menu.className = 'nav-menu';
        menu.id = 'navMenu';
        Array.prototype.slice.call(links.children).forEach(function (el) {
            if (el.tagName !== 'A') return;
            var href = el.getAttribute('href') || '';
            var isMock = /mock-exam\.html/.test(href);
            var pinned = isMock || el.classList.contains('btn-outline') ||
                el.classList.contains('auth-nav-link') || el.classList.contains('admin-nav-link');
            if (pinned) {
                el.classList.add('nav-pin');
                if (isMock) el.classList.add('nav-pin--mock');
            } else {
                menu.appendChild(el);
            }
        });
        if (menu.children.length) links.insertBefore(menu, links.firstChild);
        else container.classList.add('nav--no-menu');

        // bar order: logo | links | theme | burger
        var themeBtn = makeButton('theme-toggle--bar');
        container.appendChild(links);
        container.appendChild(themeBtn);
        container.appendChild(burger);

        burger.innerHTML = BURGER_SVG;
        burger.setAttribute('aria-label', 'Меню');
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-controls', 'navMenu');

        var backdrop = document.createElement('div');
        backdrop.className = 'nav-backdrop';
        document.body.appendChild(backdrop);

        function measure() {
            root.style.setProperty('--nav-h', Math.round(navbar.getBoundingClientRect().bottom) + 'px');
        }
        function isOpen() { return root.classList.contains('nav-is-open'); }
        function setOpen(open) {
            if (open) measure();
            root.classList.toggle('nav-is-open', open);
            burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        burger.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!isOpen()); });
        backdrop.addEventListener('click', function () { setOpen(false); });
        links.addEventListener('click', function (e) {
            var a = e.target.closest ? e.target.closest('a') : null;
            if (a && !a.classList.contains('lang-btn')) setOpen(false);
        });
        document.addEventListener('click', function (e) {
            if (!isOpen()) return;
            if (links.contains(e.target) || burger.contains(e.target)) return;
            setOpen(false);
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) setOpen(false); });
        window.addEventListener('resize', function () { if (isOpen()) measure(); });
        if (window.matchMedia) {
            var mq = window.matchMedia('(min-width: 1201px)');
            var onMq = function () { setOpen(false); };
            if (mq.addEventListener) mq.addEventListener('change', onMq);
            else if (mq.addListener) mq.addListener(onMq);
        }
    }

    function inject() {
        var container = document.querySelector('.nav-container');
        var links = document.querySelector('.nav-links');

        if (!container) {
            // pages without a navbar (e.g. admin panel): small floating button
            document.body.appendChild(makeButton('theme-toggle--floating'));
            return;
        }
        if (!links) {
            container.appendChild(makeButton(''));
            return;
        }

        // Some pages have a nav menu but no burger button — add one.
        var burger = container.querySelector('.mobile-toggle');
        if (!burger) {
            burger = document.createElement('button');
            burger.type = 'button';
            burger.className = 'mobile-toggle';
        }
        setupMenu(container, links, burger);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
    else inject();

    // keep several open tabs in sync
    window.addEventListener('storage', function (e) {
        if (e.key === KEY && (e.newValue === 'dark' || e.newValue === 'light')) apply(e.newValue);
    });
    // follow the system theme live, but only until the visitor picks one manually
    if (window.matchMedia) {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        var onChange = function (e) { if (!readSaved()) apply(e.matches ? 'dark' : 'light'); };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
    }

    window.StarthTheme = { toggle: toggle, get: current, set: function (t) { apply(t); try { localStorage.setItem(KEY, t); } catch (e) {} } };
})();
