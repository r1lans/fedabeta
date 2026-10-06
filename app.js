function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ══════════════════════════════════════════════════
// Google Sheets logging (same Apps Script as before) —
// used ONLY to mirror sign-ups and payments into a
// spreadsheet for the curator/accountant. Everything else
// (accounts, news, reviews, settings) lives in Firestore now.
// See sheets-logging/SETUP.md.
// ══════════════════════════════════════════════════
// SHEETS_LOG_URL and logToSheet() live in sheets-config.js (loaded before this file).

function submitContactForm() {
    const statusEl = document.getElementById('contactStatus');
    const name = document.getElementById('contactName').value.trim();
    const phone = document.getElementById('contactPhone').value.trim();
    const message = document.getElementById('contactMessage').value.trim();
    if (!name || !phone) {
        statusEl.textContent = t('js.contact_required');
        statusEl.style.color = 'var(--accent-warm)';
        return;
    }
    if (!SHEETS_LOG_URL) {
        statusEl.textContent = t('js.contact_not_ready');
        statusEl.style.color = 'var(--accent-warm)';
        return;
    }
    logToSheet('log_contact', { name, phone, message });
    statusEl.textContent = t('js.contact_thanks');
    statusEl.style.color = 'var(--accent)';
    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '';
    document.getElementById('contactMessage').value = '';
}

// ══════════════════════════════════════════════════
// Site content (settings, news, reviews) from Firestore.
// Configure firebase-config.js — see firebase-backend/FIREBASE_SETUP.md.
// Site works fine with Firebase left unconfigured; it just skips
// the dynamic content and shows the static fallback instead.
// ══════════════════════════════════════════════════
// Mix a #rrggbb colour with white (used to keep a custom accent readable in dark mode)
function lightenHex(hex, amount) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const mix = (c) => Math.round(c + (255 - c) * amount);
    const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function renderReviewsEmpty(message) {
    const wrap = document.getElementById('reviews-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.innerHTML = '<strong>' + t('reviews.empty_title') + '</strong>' + escapeHtml(message || t('reviews.empty_default'));
    wrap.appendChild(el);
    const btn = document.getElementById('reviews-show-more');
    if (btn) btn.style.display = 'none';
}

function openReviewModal() {
    const m = document.getElementById('reviewModal');
    if (m) m.classList.add('show');
}
function closeReviewModal() {
    const m = document.getElementById('reviewModal');
    if (m) m.classList.remove('show');
}
window.addEventListener('click', (e) => {
    const m = document.getElementById('reviewModal');
    if (m && e.target === m) closeReviewModal();
});

// Approved reviews only; sorted here (newest first) instead of in the query.
// A query with where(published) + orderBy(createdAt) needs a hand-made composite
// index in Firestore — without it the request silently fails and no review shows up.
// Language helpers for content typed in by people (reviews, news): texts are translated
// once in the admin panel and stored with the item — see content-i18n.js.
function pickText(obj, field) {
    return (window.StarthI18n ? StarthI18n.pick(obj, field) : obj[field]) || '';
}
function dateLocale() {
    const l = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'ru';
    return l === 'uz' ? 'uz-UZ' : (l === 'en' ? 'en-GB' : 'ru-RU');
}

function renderReviews() {
    const wrap = document.getElementById('reviews-list');
    const items = window.__reviewItems;
    if (!wrap || !items) return;
    wrap.innerHTML = '';
    items.forEach((r, i) => {
        const rating = Math.max(1, Math.min(5, Number(r.rating) || 5));
        const name = String(r.name || '').trim();
        const card = document.createElement('div');
        card.className = 'card review-card';
        if (i >= 6 && !window.__reviewsExpanded) card.style.display = 'none';
        card.dataset.reviewIndex = i;
        card.innerHTML = `
            <div class="stars" aria-label="${t('reviews.rating_label').replace('{n}', rating)}">${'★'.repeat(rating)}<span style="opacity:.28">${'★'.repeat(5 - rating)}</span></div>
            <p style="margin-bottom: 1.25rem;">${escapeHtml(pickText(r, 'text'))}</p>
            <div class="review-author">
                <div class="review-avatar">${escapeHtml((name[0] || '?').toUpperCase())}</div>
                <div>
                    <strong>${escapeHtml(name)}</strong>
                    <div class="review-date">${r.createdAt ? new Date(r.createdAt).toLocaleDateString(dateLocale()) : ''}</div>
                </div>
            </div>
        `;
        wrap.appendChild(card);
    });
    const showMoreBtn = document.getElementById('reviews-show-more');
    if (showMoreBtn) showMoreBtn.style.display = (items.length > 6 && !window.__reviewsExpanded) ? 'inline-block' : 'none';
}

function renderNewsList() {
    const newsWrap = document.getElementById('news-list');
    const news = window.__newsItems;
    if (!newsWrap || !news || !news.length) return;
    const newsSection = document.getElementById('news');
    if (newsSection) newsSection.style.display = 'block';
    newsWrap.innerHTML = '';
    news.forEach(n => {
        const item = document.createElement('div');
        item.className = 'news-item';
        item.style.cssText = 'background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 1.5rem;';
        item.innerHTML = `
            <div style="color: var(--ink-soft); font-size: 0.82rem; margin-bottom: 0.4rem;">${n.date ? new Date(n.date).toLocaleDateString(dateLocale()) : ''}</div>
            <h3 style="margin-bottom: 0.5rem;">${escapeHtml(pickText(n, 'title'))}</h3>
            <p style="color: var(--ink-soft); line-height: 1.6;">${escapeHtml(pickText(n, 'body'))}</p>
        `;
        newsWrap.appendChild(item);
    });
}
window.addEventListener('starth-lang-changed', () => { renderReviews(); renderNewsList(); });

async function loadReviews() {
    const wrap = document.getElementById('reviews-list');
    if (!wrap) return;
    if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) {
        renderReviewsEmpty(t('reviews.empty_admin'));
        return;
    }
    try {
        const snap = await db.collection('reviews').where('published', '==', true).get();
        const items = [];
        snap.forEach(doc => items.push(doc.data()));
        items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        if (!items.length) { renderReviewsEmpty(); return; }

        window.__reviewItems = items;
        renderReviews();
    } catch (err) {
        console.warn('Reviews failed to load:', err);
        renderReviewsEmpty(t('reviews.load_error'));
    }
}

async function loadSiteData() {
    loadReviews();
    if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) return;
    try {
        const settingsDoc = await db.collection('settings').doc('site').get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};

        // Accent color override. In dark mode the same colour is lightened so
        // it doesn't turn into a dark-on-dark smudge.
        if (settings.accent_color) {
            const st = document.createElement('style');
            st.id = 'custom-accent';
            st.textContent =
                `:root { --accent: ${settings.accent_color}; }\n` +
                `:root[data-theme="dark"] { --accent: ${lightenHex(settings.accent_color, 0.45)}; }`;
            document.head.appendChild(st);
        }

        // Logo image override (falls back to the built-in logo image if empty)
        if (settings.logo_image_url) {
            document.querySelectorAll('.site-logo-full').forEach(el => {
                el.src = settings.logo_image_url;
            });
        }

        // Announcement banner
        if (settings.announcement_active && settings.announcement_text) {
            const bar = document.createElement('div');
            bar.id = 'site-announcement';
            bar.style.cssText = 'background: var(--accent); color: var(--on-accent); text-align: center; padding: 0.6rem 1rem; font-size: 0.88rem; position: relative; z-index: 1001;';
            const link = settings.announcement_link;
            bar.innerHTML = link
                ? `<a href="${escapeHtml(link)}" style="color: var(--on-accent); text-decoration: underline;">${escapeHtml(settings.announcement_text)}</a>`
                : escapeHtml(settings.announcement_text);
            document.body.prepend(bar);
        }

        // News list (any element with id="news-list") — sorted here, see loadReviews()
        const newsWrap = document.getElementById('news-list');
        if (newsWrap) {
            const newsSnap = await db.collection('news').where('published', '==', true).get();
            const news = [];
            newsSnap.forEach(doc => news.push(doc.data()));
            news.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
            window.__newsItems = news;
            renderNewsList();
        }
    } catch (err) {
        console.warn('Site content failed to load from Firestore, showing static content instead.', err);
    }
}
loadSiteData();

function showMoreReviews() {
    window.__reviewsExpanded = true;
    document.querySelectorAll('#reviews-list [data-review-index]').forEach(card => card.style.display = '');
    const btn = document.getElementById('reviews-show-more');
    if (btn) btn.style.display = 'none';
}

async function submitPublicReview() {
    const statusEl = document.getElementById('pubReviewStatus');
    const name = document.getElementById('pubReviewName').value.trim();
    const rating = document.getElementById('pubReviewRating').value;
    const text = document.getElementById('pubReviewText').value.trim();
    if (!name || !text) {
        statusEl.textContent = t('review.fill');
        statusEl.style.color = 'var(--accent-warm)';
        return;
    }
    if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) {
        statusEl.textContent = t('review.not_ready');
        statusEl.style.color = 'var(--accent-warm)';
        return;
    }
    try {
        await db.collection('reviews').add({
            name, rating, text, published: false, createdAt: new Date().toISOString()
        });
        statusEl.textContent = t('review.thanks');
        statusEl.style.color = 'var(--accent)';
        document.getElementById('pubReviewName').value = '';
        document.getElementById('pubReviewText').value = '';
        setTimeout(() => { closeReviewModal(); statusEl.textContent = ''; }, 1800);
    } catch (err) {
        statusEl.textContent = t('js.error_prefix') + err.message;
        statusEl.style.color = 'var(--accent-warm)';
    }
}

document.addEventListener('DOMContentLoaded', () => {

    // Smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return; // FIX: пропускаем пустые якоря
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Reveal Animations
    const revealElements = document.querySelectorAll('.reveal-up, .reveal-fade');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    });
    revealElements.forEach(el => revealObserver.observe(el));

    // Animate numbers
    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start) + '+';
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.innerHTML = end + '+'; // FIX: гарантированное финальное значение
            }
        };
        window.requestAnimationFrame(step);
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const students = document.getElementById('students-count');
                const certs    = document.getElementById('certs-count');
                const teachers = document.getElementById('teachers-count');
                if (students) { students.innerText = '0+'; animateValue(students, 0, 1200, 2000); }
                if (certs)    { certs.innerText = '0+'; animateValue(certs,    0,  850, 2000); }
                if (teachers) { teachers.innerText = '0+'; animateValue(teachers, 0,   45, 2000); }
                observer.unobserve(entry.target);
            }
        });
    });

    const metricsSection = document.querySelector('.trust-metrics');
    if (metricsSection) observer.observe(metricsSection);

    // Mobile / dropdown menu is built and handled by theme.js (loaded on every page)

    // Modal — FIX: полная null-проверка
    const modal    = document.getElementById('appModal');
    const closeBtn = document.querySelector('.close-modal');
    const leadForm = document.getElementById('leadForm');

    if (modal && closeBtn) {
        document.querySelectorAll('.open-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => modal.classList.add('show'));
        });
        closeBtn.addEventListener('click', () => modal.classList.remove('show'));
        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
        // FIX: закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') modal.classList.remove('show');
        });
        if (leadForm) {
            leadForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const name = leadForm.elements['name'].value.trim();
                const phone = leadForm.phone.value.trim();
                const course = leadForm.course.value;
                logToSheet('log_trial_request', { name, phone, course });
                alert(t('app.alert'));
                modal.classList.remove('show');
                e.target.reset();
            });
        }
    }

    // FAQ — FIX: один открытый вопрос за раз
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(q => {
        q.addEventListener('click', () => {
            faqQuestions.forEach(other => {
                if (other !== q && other.classList.contains('active')) {
                    other.classList.remove('active');
                    other.nextElementSibling.style.maxHeight = '0px';
                }
            });
            q.classList.toggle('active');
            const answer = q.nextElementSibling;
            answer.style.maxHeight = q.classList.contains('active')
                ? answer.scrollHeight + 'px'
                : '0px';
        });
    });

    // Certificate verification
    const verifyBtn  = document.getElementById('verify-cert-btn');
    const certInput  = document.getElementById('cert-input');
    const certResult = document.getElementById('cert-result');

    if (verifyBtn && certInput && certResult) {
        // List of valid certificates
        const validCerts = ['TS-2026-001', 'TS-2026-002', 'TS-2026-003', 'TS-2026-004'];
        
        verifyBtn.addEventListener('click', () => {
            const val = certInput.value.trim().toUpperCase();
            certResult.style.display = 'block';
            if (!val) {
                certResult.style.color = '#e74c3c';
                certResult.innerText   = t('cert.empty');
                return;
            }
            if (validCerts.includes(val)) {
                certResult.style.color = '#25D366';
                certResult.innerText   = t('cert.valid_app');
            } else {
                certResult.style.color = '#e74c3c';
                certResult.innerText   = t('cert.invalid_app');
            }
        });
        // FIX: сброс при новом вводе
        certInput.addEventListener('input', () => {
            certResult.style.display = 'none';
        });
    }

    // --- AUTH LOGIC (Firebase Authentication + Firestore) ---
    const authModal = document.getElementById('authModal');
    const closeAuthModalBtn = document.querySelector('.close-auth-modal');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    const showForgotLink = document.getElementById('show-forgot');
    const showLoginFromForgotLink = document.getElementById('show-login-from-forgot');
    const forgotForm = document.getElementById('forgotForm');

    function showAuthView(viewId) {
        ['auth-login-view', 'auth-register-view', 'auth-forgot-view'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = id === viewId ? 'block' : 'none';
        });
        if (viewId === 'auth-register-view') updateRefNote_();
    }
    if (showForgotLink) showForgotLink.onclick = (e) => { e.preventDefault(); showAuthView('auth-forgot-view'); };
    if (showLoginFromForgotLink) showLoginFromForgotLink.onclick = (e) => { e.preventDefault(); showAuthView('auth-login-view'); };

    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('forgot-form-error');
            errEl.style.color = 'var(--ink-soft)';
            errEl.textContent = '';
            if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) {
                errEl.style.color = 'var(--accent-warm)';
                errEl.textContent = t('js.accounts_not_ready');
                return;
            }
            const btn = forgotForm.querySelector('button');
            const originalText = btn.textContent;
            btn.textContent = t('js.sending');
            btn.disabled = true;
            try {
                await auth.sendPasswordResetEmail(forgotForm.email.value.trim());
                errEl.style.color = 'var(--accent)';
                errEl.textContent = t('js.reset_sent');
            } catch (err) {
                errEl.style.color = 'var(--accent-warm)';
                errEl.textContent = translateFirebaseError_(err.code, err.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    if (showRegisterLink) showRegisterLink.onclick = (e) => {
        e.preventDefault();
        document.getElementById('auth-login-view').style.display = 'none';
        document.getElementById('auth-register-view').style.display = 'block';
    };
    if (showLoginLink) showLoginLink.onclick = (e) => {
        e.preventDefault();
        document.getElementById('auth-register-view').style.display = 'none';
        document.getElementById('auth-login-view').style.display = 'block';
    };

    window.currentUserProfile = null;

    // Public "phone book" entry (name, nickname, role) so people can find each other in the messenger.
    window.starthDirKeys = function (p) {
        const set = new Set();
        [p.name, p.surname, p.nickname].forEach((v) => String(v || '').toLowerCase().split(/\s+/).forEach((w) => {
            w = w.trim(); if (!w) return;
            for (let i = 2; i <= Math.min(w.length, 15); i++) set.add(w.slice(0, i));
        }));
        return Array.from(set).slice(0, 80);
    };
    window.starthDirEntry = function (uid, p) {
        return { uid, name: p.name || '', surname: p.surname || '', nickname: p.nickname || '', role: p.role === 'teacher' ? 'teacher' : 'student', keys: window.starthDirKeys(p) };
    };
    async function syncDirectory(user, profile) {
        if (!user || !profile || !profile.nickname) return;
        const sig = [profile.name, profile.surname, profile.nickname, profile.role || 'student'].join('|');
        try { if (sessionStorage.getItem('dirSig:' + user.uid) === sig) return; } catch (e) {}
        try {
            await db.collection('directory').doc(user.uid).set(window.starthDirEntry(user.uid, profile));
            try { sessionStorage.setItem('dirSig:' + user.uid, sig); } catch (e) {}
        } catch (e) { console.warn('directory sync', e); }
    }

    function updateAuthUI(user) {
        window.currentAuthUser = user;
        const authLinks = document.querySelectorAll('.nav-links a[href="dashboard.html"], .nav-links a[href="#"], .nav-links a.auth-nav-link');
        authLinks.forEach(link => {
            if (link.classList.contains('lang-btn')) return;
            // Recognise the button by attribute, not by its (translated) text
            const isAuthLink = link.classList.contains('auth-nav-link') ||
                link.getAttribute('data-i18n') === 'nav.dashboard' ||
                link.textContent.includes('Личный кабинет') || link.textContent.includes('Войти');
            if (!isAuthLink) return;
            link.classList.add('auth-nav-link');

            if (!user) {
                link.href = "#";
                link.removeAttribute('data-i18n');
                link.title = '';
                link.innerHTML = t('nav.login') + " <span style='font-size:0.8em; margin-left:5px;'>" + (window.Icons ? window.Icons.svg('lock') : '') + "</span>";
                link.classList.add('btn-outline');
                link.classList.remove('auth-nav-user');
                link.onclick = (e) => {
                    e.preventDefault();
                    if (authModal) authModal.style.display = 'block';
                };
            } else {
                const profile = window.currentUserProfile || {};
                const fullName = (profile.name || '').trim() || user.email || t('nav.profile');
                const roleLabel = profile.role === 'teacher' ? t('role.teacher') : t('role.student');
                // Убираем data-i18n, чтобы смена языка не затирала имя пользователя
                link.removeAttribute('data-i18n');
                link.href = "dashboard.html";
                link.classList.add('auth-nav-user');
                link.title = t('nav.open_dashboard');
                link.innerHTML =
                    "<span class='auth-nav-name'>" + escapeHtml(fullName) + "</span>" +
                    "<span class='auth-nav-role'>" + roleLabel + "</span>";
                link.onclick = null;
            }
        });
        // "Мессенджер" in the menu — only for signed-in people
        document.querySelectorAll('.nav-links').forEach((nav) => {
            let a = nav.querySelector('.nav-msg-link');
            if (!user) { if (a) a.remove(); return; }
            if (!a) {
                a = document.createElement('a'); a.className = 'nav-msg-link btn-outline'; a.href = 'messenger.html'; a.setAttribute('data-i18n', 'nav.messenger');
                a.textContent = t('nav.messenger');
                const anchor = nav.querySelector('a.auth-nav-link'); if (anchor) nav.insertBefore(a, anchor); else nav.appendChild(a);
            }
            if (/messenger\.html/.test(location.pathname)) a.classList.add('active');
        });
    }

    // Re-render the nav button (login / name+role) when the language changes
    window.addEventListener('starth-lang-changed', () => { updateAuthUI(window.currentAuthUser || null); });

    function translateFirebaseError_(code, message) {
        const map = {
            'auth/email-already-in-use': t('err.email_in_use'),
            'auth/invalid-email': t('err.invalid_email'),
            'auth/weak-password': t('err.weak_password'),
            'auth/user-not-found': t('err.user_not_found'),
            'auth/wrong-password': t('err.wrong_password'),
            'auth/invalid-credential': t('err.invalid_credential'),
            'auth/too-many-requests': t('err.too_many'),
            'permission-denied': t('err.permission'),
            'custom/nickname-taken': t('err.nick_taken'),
            'custom/bad-nickname': t('err.bad_nick'),
            'custom/bad-telegram': t('err.bad_tg')
        };
        return map[code] || (message ? `${t('js.error_prefix')}${message} (${code || t('err.no_code')})` : t('err.generic'));
    }

    if (typeof FIREBASE_READY !== 'undefined' && FIREBASE_READY) {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const doc = await db.collection('users').doc(user.uid).get();
                    window.currentUserProfile = doc.exists ? doc.data() : null;
                } catch (e) {
                    window.currentUserProfile = null;
                }
            } else {
                window.currentUserProfile = null;
            }
            updateAuthUI(user);
            syncDirectory(user, window.currentUserProfile);
            window.dispatchEvent(new CustomEvent('starth-auth-ready', { detail: { user, profile: window.currentUserProfile } }));
            // notifications about new messages (badge, tab title, system notification) on every page
            if (user && !window.StarthPresence && !document.querySelector('script[data-presence]')) {
                const sp = document.createElement('script'); sp.src = 'presence.js'; sp.dataset.presence = '1'; document.head.appendChild(sp);
            }
            if (user && !window.__tgNudge && !document.querySelector('script[data-tg-nudge]')) {
                const sn = document.createElement('script'); sn.src = 'tg-nudge.js'; sn.dataset.tgNudge = '1'; document.head.appendChild(sn);
            }
            if (user && !window.StarthNotify && !document.querySelector('script[data-msg-notify]')) {
                const sc = document.createElement('script'); sc.src = 'msg-notify.js'; sc.dataset.msgNotify = '1'; document.head.appendChild(sc);
            }
        });
    } else {
        updateAuthUI(null);
    }

    if (closeAuthModalBtn && authModal) {
        closeAuthModalBtn.onclick = () => authModal.style.display = 'none';
    }
    window.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('login-form-error');
            errEl.textContent = '';
            if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) {
                errEl.textContent = t('js.accounts_not_ready');
                return;
            }
            const btn = loginForm.querySelector('button');
            const originalText = btn.textContent;
            btn.textContent = t('js.logging_in');
            btn.disabled = true;
            try {
                await auth.signInWithEmailAndPassword(loginForm.email.value.trim(), loginForm.password.value);
                authModal.style.display = 'none';
                window.location.href = 'dashboard.html';
            } catch (err) {
                errEl.textContent = translateFirebaseError_(err.code, err.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    // ── REFERRALS ──────────────────────────────────────────────────────────────
    // Invite code = the student's nickname. Link: index.html?ref=<nickname>.
    // The code is remembered in this browser, and when the visitor registers we write
    // referrals/<new uid> (status "registered"). The admin later marks it "paid" / "rewarded".
    const REF_RE = /^[a-z0-9_]{3,20}$/;
    try {
        const refParam = (new URLSearchParams(window.location.search).get('ref') || '').trim().toLowerCase();
        if (REF_RE.test(refParam)) localStorage.setItem('starth_ref', refParam);
    } catch (e) {}
    if (window.starthGetRefOnce === undefined) {
        window.starthGetRefOnce = true;
        window.addEventListener('load', () => {
            const r = (function(){ try { return localStorage.getItem('starth_ref') || ''; } catch (e) { return ''; } })();
            if (REF_RE.test(r) && /[?&]ref=/.test(window.location.search) && window.showToast) {
                setTimeout(() => window.showToast(trOr_('ref.landing_toast', 'Вас пригласил друг! Зарегистрируйтесь — и получите скидку 10% на первый месяц'), 'gift'), 1200);
            }
        });
    }
    window.starthGetRef = function () {
        try { const r = localStorage.getItem('starth_ref') || ''; return REF_RE.test(r) ? r : ''; } catch (e) { return ''; }
    };
    window.starthReferralLink = function (nickname) {
        return window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'index.html?ref=' + encodeURIComponent(nickname);
    };
    function trOr_(key, fallback) { const v = (typeof t === 'function') ? t(key) : key; return (v && v !== key) ? v : fallback; }

    async function createReferral_(uid, nickname, name, surname) {
        const ref = window.starthGetRef();
        if (!ref || ref === nickname) return;
        try {
            const nd = await db.collection('nicknames').doc(ref).get();
            const referrerUid = nd.exists ? nd.data().uid : '';
            if (!referrerUid || referrerUid === uid) { localStorage.removeItem('starth_ref'); return; }
            await db.collection('referrals').doc(uid).set({
                referrerUid, referrerNickname: ref,
                referredUid: uid, referredNickname: nickname,
                referredName: [name, (surname || '').charAt(0) ? surname.charAt(0) + '.' : ''].filter(Boolean).join(' '),
                status: 'registered',
                createdAt: new Date().toISOString()
            });
            await db.collection('users').doc(uid).set({ referredBy: ref }, { merge: true });
            localStorage.removeItem('starth_ref');
        } catch (e) { console.warn('Referral was not saved', e); }
    }

    // Note above the registration form: "You were invited by @nick"
    function updateRefNote_() {
        if (!registerForm) return;
        let note = document.getElementById('ref-note');
        const ref = window.starthGetRef();
        if (!ref) { if (note) note.remove(); return; }
        if (!note) {
            note = document.createElement('div');
            note.id = 'ref-note';
            note.style.cssText = 'margin:0.75rem 0 0.25rem;padding:0.7rem 0.9rem;border-radius:10px;border:1px dashed var(--accent);background:var(--accent-tint);color:var(--ink);font-size:0.85rem;line-height:1.45;';
            registerForm.parentNode.insertBefore(note, registerForm);
        }
        note.innerHTML = (window.Icons ? window.Icons.svg('gift') + ' ' : '') + trOr_('ref.invited_by', 'Вас пригласил') + ' <strong>@' + escapeHtml(ref) + '</strong>. ' + trOr_('ref.friend_bonus', 'После регистрации вы получите скидку 10% на первый месяц обучения.');
    }

    // Reserves the next student ID and saves the profile in ONE transaction.
    // profileData/nickname are given for a new registration; for an old account that
    // has no ID yet (nickname omitted) only the studentId field is added.
    function formatStudentId_(n) { return String(n).padStart(6, '0'); }
    async function nextStudentId_(uid, profileData, nickname) {
        const counterRef = db.collection('counters').doc('students');
        const userRef = db.collection('users').doc(uid);
        return db.runTransaction(async (tx) => {
            const cSnap = await tx.get(counterRef);
            const next = (cSnap.exists ? (cSnap.data().last || 0) : 0) + 1;
            const id = formatStudentId_(next);
            if (cSnap.exists) tx.update(counterRef, { last: next });
            else tx.set(counterRef, { last: next });
            if (nickname) {
                tx.set(userRef, Object.assign({ studentId: id }, profileData));
                const dn = [profileData.name, (profileData.surname || '').charAt(0) ? (profileData.surname.charAt(0) + '.') : ''].filter(Boolean).join(' ');
                tx.set(db.collection('nicknames').doc(nickname), { uid, displayName: dn });
            } else {
                tx.set(userRef, { studentId: id }, { merge: true });
            }
            return id;
        });
    }
    // Used by the dashboard: gives an ID to students who registered before IDs existed.
    window.starthEnsureStudentId = async function (uid, profile) {
        if (profile && profile.studentId) return profile.studentId;
        if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) return '';
        return nextStudentId_(uid, null, null);
    };

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('register-form-error');
            errEl.textContent = '';
            if (typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY) {
                errEl.textContent = t('js.accounts_not_ready');
                return;
            }
            const btn = registerForm.querySelector('button');
            const originalText = btn.textContent;
            btn.textContent = t('js.creating');
            btn.disabled = true;

            const name = registerForm.name.value.trim();
            const surname = registerForm.surname.value.trim();
            const phone = registerForm.phone.value.trim();
            const nickname = registerForm.nickname.value.trim().toLowerCase();
            const telegram = (registerForm.telegram ? registerForm.telegram.value : '').trim().replace(/^@/, '').toLowerCase();
            const course = registerForm.course.value;
            const email = registerForm.email.value.trim();
            const password = registerForm.password.value;

            try {
                if (!/^[a-z0-9_]{3,20}$/.test(nickname)) {
                    throw { code: 'custom/bad-nickname' };
                }
                if (registerForm.telegram && !/^[a-z0-9_]{5,32}$/.test(telegram)) {
                    throw { code: 'custom/bad-telegram' };
                }
                const nickDoc = await db.collection('nicknames').doc(nickname).get();
                if (nickDoc.exists) {
                    throw { code: 'custom/nickname-taken' };
                }

                const cred = await auth.createUserWithEmailAndPassword(email, password);
                const uid = cred.user.uid;

                // Sequential student ID (000001, 000002, ...) taken from a counter in Firestore.
                // A transaction guarantees two people can never get the same number.
                const studentId = await nextStudentId_(uid, {
                    name, surname, phone, nickname, telegram, course, email,
                    createdAt: new Date().toISOString()
                }, nickname);

                await createReferral_(uid, nickname, name, surname);

                // Google Sheets: the row is sent once the ID is known. The password is never sent.
                const sheetSent = logToSheet('log_signup', { name, surname, student_id: studentId, phone, nickname, course, email, uid });

                // Give the sheet request a moment to finish before leaving the page (max 2.5 s;
                // keepalive delivers it even if the page changes first).
                await Promise.race([sheetSent, new Promise(r => setTimeout(r, 2500))]);

                authModal.style.display = 'none';
                window.location.href = 'dashboard.html';
            } catch (err) {
                errEl.textContent = translateFirebaseError_(err.code, err.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    }

    window.starthLogout = function() {
        if (typeof FIREBASE_READY !== 'undefined' && FIREBASE_READY) auth.signOut();
        window.location.href = 'index.html';
    };

    // Hero no longer uses a canvas animation — replaced with a static score-report visual.
    const steps = document.querySelectorAll('.stepper-item');
    const stepProgressLine = document.getElementById('step-line-progress');
    
    if (steps.length > 0 && stepProgressLine) {
        function updateStepperProgress(activeIndex) {
            const totalSteps = steps.length;
            const percentage = (activeIndex / (totalSteps - 1)) * 100;
            
            // Set vertical progress for mobile, horizontal for desktop
            if (window.innerWidth <= 768) {
                stepProgressLine.style.width = '2px';
                stepProgressLine.style.height = `calc((100% - 56px) * ${percentage / 100})`;   // line only spans circle-centre to circle-centre
            } else {
                stepProgressLine.style.height = '2px';
                stepProgressLine.style.width = `${percentage}%`;
            }

            steps.forEach((step, idx) => {
                if (idx <= activeIndex) {
                    step.classList.add('active');
                } else {
                    step.classList.remove('active');
                }
            });
        }

        steps.forEach((step, idx) => {
            step.addEventListener('mouseenter', () => {
                updateStepperProgress(idx);
            });
            step.addEventListener('click', () => {      // phones have no hover: tap instead
                updateStepperProgress(idx);
            });
        });

        // Initialize progress line matching first active step (Step 1 = 0%)
        updateStepperProgress(0);
        
        window.addEventListener('resize', () => {
            const activeStep = document.querySelector('.stepper-item.active:last-of-type');
            if (activeStep) {
                const idx = parseInt(activeStep.getAttribute('data-step')) - 1;
                updateStepperProgress(idx);
            }
        });
    }

    // ── 4. CHAT WIDGET POPUP LOGIC ──
    const chatTrigger = document.getElementById('chatTrigger');
    const chatPopup = document.getElementById('chatPopup');
    
    if (chatTrigger && chatPopup) {
        chatTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            chatPopup.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!chatPopup.contains(e.target) && !chatTrigger.contains(e.target)) {
                chatPopup.classList.remove('show');
            }
        });
    }

    // ── 5. COOKIE CONSENT BANNER LOGIC ──
    const cookieBanner = document.getElementById('cookieBanner');
    const acceptCookiesBtn = document.getElementById('acceptCookiesBtn');

    if (cookieBanner && acceptCookiesBtn) {
        // Display banner after a 2-second delayed entry if not yet accepted
        if (!localStorage.getItem('cookieAccepted')) {
            setTimeout(() => {
                cookieBanner.classList.add('show');
                document.documentElement.style.setProperty('--cookie-h', (cookieBanner.offsetHeight + 12) + 'px');
                document.body.classList.add('cookie-open');
            }, 2000);
        }

        acceptCookiesBtn.addEventListener('click', () => {
            localStorage.setItem('cookieAccepted', 'true');
            cookieBanner.classList.remove('show');
            document.body.classList.remove('cookie-open');
        });
    }

    // ── 6. STARTH LOYALTY & REWARDS SYSTEM ──
    
    // Check quests achievements and mark them completed
    if (localStorage.getItem('levelTestScore') || localStorage.getItem('levelTestCompleted')) {
        const chk = document.getElementById('chk-level-test');
        const item = document.getElementById('quest-level-test');
        if (chk && item) {
            item.classList.add('completed');
        }
    }
    if (localStorage.getItem('quest_telegram_completed')) {
        const chk = document.getElementById('chk-telegram');
        const item = document.getElementById('quest-telegram');
        if (chk && item) {
            item.classList.add('completed');
        }
    }

    // Toast Notification System
    window.showToast = function(message, icon = 'sparkles') {
        const toast = document.getElementById('starth-toast');
        const toastMsg = document.getElementById('starth-toast-message');
        const toastIcon = toast ? toast.querySelector('.starth-toast-icon') : null;
        
        if (!toast || !toastMsg) return;
        
        toastMsg.textContent = message;
        if (toastIcon) { if (window.Icons && window.Icons.has(icon)) toastIcon.innerHTML = window.Icons.svg(icon); else if (icon && !/^[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(icon)) toastIcon.textContent = icon; }
        
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    };

    // Pricing Format Switcher (texts come from translations.js)
    window.addEventListener('starth-lang-changed', () => {
        const g = document.getElementById('btn-pricing-grp');
        window.setPricingMode(g && g.classList.contains('active') ? 'grp' : 'ind');
    });
    window.setPricingMode = function(mode) {
        const btnInd = document.getElementById('btn-pricing-ind');
        const btnGrp = document.getElementById('btn-pricing-grp');
        const desc = document.getElementById('pricing-toggle-desc');
        
        if (!btnInd || !btnGrp || !desc) return;
        
        if (mode === 'ind') {
            btnInd.classList.add('active');
            btnGrp.classList.remove('active');
            desc.textContent = t('pricing.desc_ind');
        } else {
            btnGrp.classList.add('active');
            btnInd.classList.remove('active');
            desc.textContent = t('pricing.desc_grp');
        }
        
        // Update price tags
        const priceTrial = document.getElementById('price-trial');
        const priceStandard = document.getElementById('price-standard');
        const priceIntensive = document.getElementById('price-intensive');
        
        if (priceTrial) {
            priceTrial.textContent = parseFloat(priceTrial.getAttribute('data-' + mode)) === 0 ? t('pricing.free') : priceTrial.getAttribute('data-' + mode);
        }
        if (priceStandard) {
            priceStandard.textContent = priceStandard.getAttribute('data-' + mode);
        }
        if (priceIntensive) {
            priceIntensive.textContent = priceIntensive.getAttribute('data-' + mode);
        }
        
        // Dynamic card context updating
        const trialDesc = document.getElementById('trial-card-desc');
        if (trialDesc) {
            trialDesc.textContent = t(mode === 'ind' ? 'pricing.trial_desc_ind' : 'pricing.trial_desc_grp');
        }
        
        const trialFeatures = document.getElementById('trial-card-features');
        if (trialFeatures) {
            trialFeatures.innerHTML = mode === 'ind' 
                ? `<li>${t('pricing.trial_f_ind1')}</li>
                   <li>${t('pricing.trial_f_ind2')}</li>
                   <li>${t('pricing.trial_f_ind3')}</li>`
                : `<li>${t('pricing.trial_f_grp1')}</li>
                   <li>${t('pricing.trial_f_grp2')}</li>
                   <li>${t('pricing.trial_f_grp3')}</li>`;
        }
        
        const standardFeatures = document.getElementById('standard-card-features');
        if (standardFeatures) {
            standardFeatures.innerHTML = mode === 'ind'
                ? `<li>${t('pricing.std_f_ind1')}</li>
                   <li>${t('pricing.std_f_ind2')}</li>
                   <li>${t('pricing.std_f_ind3')}</li>`
                : `<li>${t('pricing.std_f_grp1')}</li>
                   <li>${t('pricing.std_f_grp2')}</li>
                   <li>${t('pricing.std_f_grp3')}</li>`;
        }
        
        const intensiveFeatures = document.getElementById('intensive-card-features');
        if (intensiveFeatures) {
            intensiveFeatures.innerHTML = mode === 'ind'
                ? `<li>${t('pricing.int_f_ind1')}</li>
                   <li>${t('pricing.int_f_ind2')}</li>
                   <li>${t('pricing.int_f_ind3')}</li>`
                : `<li>${t('pricing.int_f_grp1')}</li>
                   <li>${t('pricing.int_f_grp2')}</li>
                   <li>${t('pricing.int_f_grp3')}</li>`;
        }
        
        // Re-calculate active coupon discounts dynamically
        if (window.currentActivePromo) {
            window.applyPromoCode(true);
        }
    };

    (function () {
        const g = document.getElementById('btn-pricing-grp');
        if (document.getElementById('pricing-toggle-desc')) window.setPricingMode(g && g.classList.contains('active') ? 'grp' : 'ind');
    })();

    // Logout is defined in the Firebase auth block above (window.starthLogout)

    // Referral link (home page "Получить реф-ссылку" button): logged-in students get their real link,
    // everybody else is sent to the referral section of the personal cabinet (asks to log in).
    window.generateReferralLink = function() {
        const profile = window.currentUserProfile;
        if (!profile || !profile.nickname) { window.location.href = 'dashboard.html#referral'; return; }
        const link = window.starthReferralLink(profile.nickname);
        navigator.clipboard.writeText(link).then(() => {
            window.showToast(t('js.ref_copied'), 'users');
        }).catch(() => { window.location.href = 'dashboard.html#referral'; });
    };

    // Quests action triggers
    window.completeTelegramQuest = function(event) {
        const chk = document.getElementById('chk-telegram');
        const item = document.getElementById('quest-telegram');
        if (chk && item) {
            item.classList.add('completed');
            localStorage.setItem('quest_telegram_completed', 'true');
            window.showToast(t('js.quest_done'), 'book');
        }
    };

    // Interactive Promo Code dynamic calculation box
    window.currentActivePromo = null;
    window.applyPromoCode = function(silent = false) {
        const promoInput = document.getElementById('promo-code-input');
        const feedback = document.getElementById('promo-feedback');
        if (!promoInput || !feedback) return;
        
        const code = promoInput.value.trim().toUpperCase();
        if (!code) {
            if (!silent) {
                feedback.className = 'promo-feedback error';
                feedback.textContent = t('promo.enter');
                feedback.style.display = 'block';
            }
            return;
        }
        
        let discountPct = 0;
        let description = '';
        
        if (code === 'FRIEND20') {
            discountPct = 20;
            description = t('promo.desc_friend');
        } else if (code === 'START10' || code === 'QUEST10') {
            discountPct = 10;
            description = t('promo.desc_quest');
        } else if (code === 'GEMINI') {
            discountPct = 15;
            description = t('promo.desc_dev');
        }
        
        if (discountPct > 0) {
            window.currentActivePromo = { code, discountPct };
            feedback.className = 'promo-feedback success';
            feedback.innerHTML = (window.Icons ? window.Icons.svg('check') + ' ' : '') + escapeHtml(t('promo.success') + ' ' + description);
            feedback.style.display = 'block';
            
            if (!silent) {
                window.showToast(t('promo.toast').replace('{code}', code).replace('{pct}', discountPct), 'ticket');
            }
            
            // Recompute values
            const priceTrial = document.getElementById('price-trial');
            const priceStandard = document.getElementById('price-standard');
            const priceIntensive = document.getElementById('price-intensive');
            
            const activeMode = document.getElementById('btn-pricing-grp').classList.contains('active') ? 'grp' : 'ind';
            
            if (priceTrial && parseFloat(priceTrial.getAttribute('data-' + activeMode)) > 0) {
                const origVal = parseFloat(priceTrial.getAttribute('data-' + activeMode));
                const finalVal = Math.round(origVal * (1 - discountPct / 100));
                priceTrial.innerHTML = `<span style="text-decoration: line-through; opacity: 0.5; font-size: 0.75em; margin-right: 5px;">$${origVal}</span>${finalVal}<span class="price-discount-tag">-${discountPct}%</span>`;
            }
            if (priceStandard) {
                const origVal = parseFloat(priceStandard.getAttribute('data-' + activeMode));
                const finalVal = Math.round(origVal * (1 - discountPct / 100));
                priceStandard.innerHTML = `<span style="text-decoration: line-through; opacity: 0.5; font-size: 0.75em; margin-right: 5px;">$${origVal}</span>${finalVal}<span class="price-discount-tag">-${discountPct}%</span>`;
            }
            if (priceIntensive) {
                const origVal = parseFloat(priceIntensive.getAttribute('data-' + activeMode));
                const finalVal = Math.round(origVal * (1 - discountPct / 100));
                priceIntensive.innerHTML = `<span style="text-decoration: line-through; opacity: 0.5; font-size: 0.75em; margin-right: 5px;">$${origVal}</span>${finalVal}<span class="price-discount-tag">-${discountPct}%</span>`;
            }
        } else {
            feedback.className = 'promo-feedback error';
            feedback.textContent = t('promo.invalid');
            feedback.style.display = 'block';
            
            // Revert changes if error entered
            window.currentActivePromo = null;
            const activeMode = document.getElementById('btn-pricing-grp').classList.contains('active') ? 'grp' : 'ind';
            window.setPricingMode(activeMode);
        }
    };
});
