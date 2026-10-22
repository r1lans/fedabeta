/* TheStarth — personal cabinet shell (student and teacher): sidebar with sections, one panel at a time, mobile menu.
 *   Cabinet.setup(role, user, profile)   role: 'student' | 'teacher'
 *   Cabinet.go(panel)
 */
(function () {
    'use strict';
    var X = function (m) { return window.X ? window.X(m) : m; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var svg = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
    var I = {
        home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
        progress: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
        lessons: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
        tests: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
        bonus: '<path d="M20 12v9H4v-9"/><rect x="2" y="7" width="20" height="5" rx="1"/><path d="M12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/>',
        review: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
        pay: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
        guide: '<path d="M4 19.5V5a2 2 0 0 1 2-2h12v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M8 7h6M8 11h6"/>',
        profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
        groups: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.8 3.5 6"/>',
        journal: '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z"/><path d="M5 17a2 2 0 0 1 2-2h12"/><path d="m8.5 10 2 2 4-4.5"/>',
        salary: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
        absences: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
        tlessons: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        writing: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'
    };
    var NAV = {
        student: [
            ['Учёба', [['home', 'Главная'], ['progress', 'Мой прогресс'], ['lessons', 'Мои уроки'], ['tests', 'Тесты']]],
            ['Ещё', [['bonus', 'Друзья и бонусы'], ['review', 'Оставить отзыв'], ['pay', 'Оплата']]],
            ['Помощь', [['guide', 'Инструкция'], ['profile', 'Профиль']]]
        ],
        teacher: [
            ['Работа', [['home', 'Главная'], ['groups', 'Мои группы'], ['journal', 'Журнал'], ['absences', 'Предупреждения']]],
            ['Уроки', [['tlessons', 'Индивидуальные уроки'], ['writing', 'Проверка Writing']]],
            ['Деньги', [['salary', 'Зарплата']]],
            ['Помощь', [['guide', 'Инструкция'], ['profile', 'Профиль']]]
        ]
    };
    var HINTS = {
        progress: 'Ваши оценки, посещаемость и результаты mock-тестов на графиках. Нажмите на точку, чтобы увидеть оценку.',
        lessons: 'Не сможете прийти — нажмите «Не смогу прийти» минимум за 24 часа до урока (или /absent в Telegram-боте). Позже урок считается проведённым.',
        tests: 'Тест уровня английского и SAT Math. Пройти можно ещё раз — сохранится последний результат.',
        bonus: 'Пригласите друга — получите скидку 20%. Выполняйте квесты — получайте бонусы.',
        review: 'Ваш отзыв появится на сайте после проверки администратором.',
        guide: 'Короткая инструкция с картинками — можно открыть или скачать.',
        profile: 'Ваши данные, никнейм и учебный ID. Telegram-ник нужен для напоминаний об уроках.',
        groups: 'Создавайте группы, добавляйте учеников по никнейму, отмечайте посещаемость и ставьте оценки.',
        journal: 'Все ваши ученики по всем группам: оценки, посещаемость, динамика. Нажмите на ученика — откроется график.',
        salary: 'Вы получаете свою долю за каждого ученика, который был на уроке или не предупредил о пропуске за 24 часа. Отмечайте посещаемость после каждого урока.',
        absences: 'Ученики, которые предупредили, что не придут. За 24 часа и раньше — урок за этого ученика не оплачивается, позже — оплачивается.',
        tlessons: 'Индивидуальные уроки, которые назначил куратор. После урока отметьте его и оставьте домашнее задание.',
        writing: 'Эссе учеников из mock-тестов: баллы по критериям IELTS, ошибки и советы — разбор уходит ученику.'
    };
    var role = 'student', user = null, profile = null, inited = {}, cur = 'home';

    function label(p) { var out = ''; NAV[role].forEach(function (g) { g[1].forEach(function (it) { if (it[0] === p) out = it[1]; }); }); return out; }
    function group(p) { var out = ''; NAV[role].forEach(function (g) { g[1].forEach(function (it) { if (it[0] === p) out = g[0]; }); }); return out; }

    function buildNav() {
        var nav = document.getElementById('cabNav');
        nav.innerHTML = NAV[role].map(function (g) {
            return '<div class="cab-grp">' + esc(X(g[0])) + '</div>' + g[1].map(function (it) {
                return '<button type="button" class="cab-item" data-go="' + it[0] + '"><span class="ti">' + svg(I[it[0]] || I.home) + '</span><span class="tl">' + esc(X(it[1])) + '</span><span class="cab-badge" id="cabBadge-' + it[0] + '" hidden></span></button>';
            }).join('');
        }).join('');
        nav.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-go')); }; });
    }

    function lazy(p) {
        if (inited[p]) { if (p === 'journal' && inited[p].reload) inited[p].reload(); return; }
        var u = user, root;
        if (p === 'journal' && window.StarthJournal) { root = document.getElementById('tcJournalRoot'); inited[p] = window.StarthJournal.mount(root, { mode: 'teacher', uid: u.uid }) || true; return; }
        if (p === 'salary' && window.StarthTeacherSalary) { inited[p] = true; window.StarthTeacherSalary.mount(document.getElementById('tcSalaryRoot'), { uid: u.uid }).then(function (x) { inited[p] = x || true; }); return; }
        if (p === 'absences' && window.StarthAbsence) { inited[p] = true; window.StarthAbsence.renderTeacher(document.getElementById('tcAbsRoot'), u.uid); return; }
        if (p === 'progress' && window.StudentProgress) { inited[p] = true; window.StudentProgress.progress(document.getElementById('stProgress'), u, profile); return; }
        if (p === 'lessons' && window.StarthAbsence) { inited[p] = true; window.StarthAbsence.renderStudent(document.getElementById('stAbsence'), u, profile); return; }
        if (p === 'guide') { inited[p] = true; renderGuide(); return; }
    }

    function go(p, opts) {
        if (p === 'pay') { var pl = document.getElementById('dashPayLink'); location.href = pl ? pl.href : 'payment'; return; }
        if (!document.querySelector('.cab-panel[data-p="' + p + '"]') || !label(p)) p = 'home';
        cur = p;
        document.querySelectorAll('.cab-item').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-go') === p); });
        document.querySelectorAll('.cab-panel').forEach(function (el) { el.classList.toggle('active', el.getAttribute('data-p') === p); });
        var name = X(label(p));
        document.getElementById('cabTitle').textContent = name;
        document.getElementById('cabMTitle').textContent = name;
        document.getElementById('cabCrumb').textContent = X(group(p));
        var h = HINTS[p] ? X(HINTS[p]) : ''; var hint = document.getElementById('cabHint'); hint.textContent = h; hint.style.display = h ? '' : 'none';
        document.getElementById('cabHead').style.display = p === 'home' ? 'none' : '';
        menu(false);
        try { sessionStorage.setItem('cab:' + role, p); } catch (e) {}
        lazy(p);
        if (!(opts && opts.noScroll)) window.scrollTo({ top: 0 });
    }
    function menu(open) { var s = document.getElementById('cabShell'); if (s) s.classList.toggle('cab-open', !!open); }
    function badge(p, n) { var b = document.getElementById('cabBadge-' + p); if (!b) return; b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n || ''); }

    function renderGuide() {
        var el = document.getElementById('cabGuide'); if (!el) return;
        var t = role === 'teacher';
        var file = t ? 'docs/guide-teacher.pdf' : 'docs/guide-student.pdf', cover = t ? 'docs/guide-teacher-cover.jpg' : 'docs/guide-student-cover.jpg';
        el.innerHTML = '<div class="cab-guide">' +
            '<a class="cab-guide-cover" href="' + file + '" target="_blank" rel="noopener"><img src="' + cover + '" alt="' + esc(X(t ? 'Инструкция для учителя' : 'Инструкция для ученика')) + '" onerror="this.style.display=\'none\'"></a>' +
            '<div class="cab-guide-txt"><h3>' + esc(X(t ? 'Как вести уроки на TheStarth' : 'Как учиться на TheStarth')) + '</h3>' +
            '<p>' + esc(X(t ? 'Группы, видеоурок и доска, посещаемость, оценки, журнал, зарплата и предупреждения учеников — что делает каждая кнопка.'
                : 'Кабинет, вход на урок, доска, оценки и прогресс, «Не смогу прийти» за 24 часа, Telegram-бот, бонусы и оплата.')) + '</p>' +
            '<div class="cab-guide-acts"><a class="btn-primary" href="' + file + '" download>' + (window.Icons ? Icons.svg('download') : '') + ' ' + esc(X('Скачать PDF')) + '</a>' +
            '<a class="btn-outline" href="' + file + '" target="_blank" rel="noopener">' + esc(X('Открыть')) + '</a></div></div></div>';
    }

    function setup(r, u, p) {
        role = r === 'teacher' ? 'teacher' : 'student'; user = u; profile = p || {};
        document.body.classList.toggle('cab-teacher', role === 'teacher');
        document.body.classList.toggle('cab-student', role === 'student');
        var name = [profile.name, profile.surname].filter(Boolean).join(' ') || X('Ученик');
        document.getElementById('cabName').textContent = name;
        document.getElementById('cabRole').textContent = role === 'teacher' ? X('Преподаватель') : (profile.nickname ? '@' + profile.nickname : X('Ученик'));
        document.getElementById('cabAvatar').textContent = (name.trim().charAt(0) || 'S').toUpperCase();
        var navKey = role + ':' + (profile.nickname || u.uid);
        if (setup._key !== navKey) {
            setup._key = navKey; inited = {}; buildNav();
            var start = 'home';
            try { start = sessionStorage.getItem('cab:' + role) || 'home'; } catch (e) {}
            if (location.hash === '#referral') start = 'bonus';
            var m = /^#(\w+)$/.exec(location.hash || ''); if (m && label(m[1])) start = m[1];
            go(start, { noScroll: true });
            if (role === 'teacher' && window.TeacherHome) window.TeacherHome.render(document.getElementById('tcHome'), u, profile);
            if (role === 'student' && window.StudentProgress) window.StudentProgress.home(document.getElementById('stHome'), u, profile);
        }
    }
    window.addEventListener('starth-lang-changed', function () { if (user) { buildNav(); go(cur, { noScroll: true }); } });

    window.Cabinet = { setup: setup, go: go, menu: menu, badge: badge };
})();
