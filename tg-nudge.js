/* Reminder: add a Telegram username (needed for lesson reminders in the bot). */
(function () {
  if (window.__tgNudge) return; window.__tgNudge = 1;
  var L = (document.documentElement.lang || localStorage.getItem('lang') || 'ru').slice(0, 2);
  var T = {
    ru: ['Добавьте Telegram, чтобы получать напоминания об уроках и ссылку на занятие', 'Добавить', 'Позже'],
    uz: ["Dars eslatmalari va havolasini olish uchun Telegram'ingizni qo'shing", "Qo'shish", 'Keyinroq'],
    en: ['Add your Telegram to get lesson reminders and the lesson link', 'Add', 'Later']
  }[L] || null;
  T = T || {ru: 0}.x || ['Добавьте Telegram, чтобы получать напоминания об уроках и ссылку на занятие', 'Добавить', 'Позже'];
  function open() {
    if (window.ProfileEditor) window.ProfileEditor.open();
    else location.href = 'dashboard.html?editprofile=1';
  }
  function run(p) {
    if (!p) return;
    if (/[?&]editprofile=1/.test(location.search) && window.ProfileEditor) {
      setTimeout(function () { window.ProfileEditor.open(); }, 300);
    }
    if (p.telegram || p.role === 'admin' || /video-lesson/.test(location.pathname)) return;
    try { if (sessionStorage.getItem('tgNudgeOff')) return; } catch (_) {}
    if (document.getElementById('tgNudge')) return;
    var b = document.createElement('div'); b.id = 'tgNudge'; b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;max-width:calc(100vw - 24px);display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center;padding:12px 16px;border-radius:14px;background:#1b1b22;color:#fff;border:1px solid #d4af37;box-shadow:0 8px 30px rgba(0,0,0,.4);font:500 14px/1.3 system-ui,sans-serif';
    var s = document.createElement('span'); s.textContent = '✈️ ' + T[0];
    var a = document.createElement('button'); a.type = 'button'; a.textContent = T[1];
    a.style.cssText = 'background:#d4af37;color:#111;border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer';
    var c = document.createElement('button'); c.type = 'button'; c.textContent = T[2];
    c.style.cssText = 'background:transparent;color:#bbb;border:0;cursor:pointer;padding:8px';
    function off() { try { sessionStorage.setItem('tgNudgeOff', '1'); } catch (_) {} b.remove(); }
    a.onclick = function () { off(); open(); }; c.onclick = off;
    b.append(s, a, c); document.body.appendChild(b);
  }
  run(window.currentUserProfile);
  window.addEventListener('starth-auth-ready', function (e) { if (e.detail && e.detail.user) run(e.detail.profile); });
})();
