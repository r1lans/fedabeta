/* TheStarth — "Академический блог и советы" on the home page.
 * Posts live in Firestore settings/blog { managed: true, posts: [...] } (Admin panel -> Блог).
 * Until the admin saves the blog once, the three built-in posts below are shown (they are also
 * written into the static HTML of index.html, so the page looks right even without Firebase).
 *
 * Post: { id, tag, title, text, date: 'YYYY-MM-DD', readMin, link, cover, published, srcLang,
 *         i18n: { uz: { tag, title, text }, en: {...} } }
 */
(function () {
    var BUILTIN = [
        { id: 'ielts-speaking', tag: 'IELTS', date: '2026-05-22', readMin: 5, link: 'https://t.me/TheStarth', cover: 'images/blog-ielts.jpg', published: true, srcLang: 'ru',
          title: 'Секреты сдачи IELTS Speaking на балл 7.5+',
          text: 'Разбираем ключевые критерии оценки Speaking: беглость, словарный запас, грамматическая точность и произношение. Пошаговые шаблоны ответов на Part 3.',
          i18n: {
            uz: { tag: 'IELTS', title: "IELTS Speaking'ni 7.5+ ballga topshirish sirlari", text: "Speaking baholashning asosiy mezonlarini tahlil qilamiz: ravonlik, lug'at boyligi, grammatik aniqlik va talaffuz. Part 3 uchun bosqichma-bosqich javob shablonlari." },
            en: { tag: 'IELTS', title: 'Secrets to scoring 7.5+ in IELTS Speaking', text: 'We break down the key Speaking criteria: fluency, vocabulary, grammatical accuracy and pronunciation. Step-by-step answer templates for Part 3.' } } },
        { id: 'sat-math', tag: 'SAT Math', date: '2026-05-18', readMin: 7, link: 'https://t.me/TheStarth', cover: 'images/blog-sat-math.jpg', published: true, srcLang: 'ru',
          title: 'Как взломать SAT Math: 3 фишки от Бехруза',
          text: 'Математическая секция SAT — это не только формулы, но и жесткий тайм-менеджмент. Узнайте, как использовать графический калькулятор Desmos на максимум.',
          i18n: {
            uz: { tag: 'SAT Math', title: "SAT Math'ni qanday yengish mumkin: Behruzdan 3 ta maslahat", text: "SAT matematika bo'limi faqat formulalar emas, balki qat'iy vaqtni boshqarish hamdir. Desmos grafik kalkulyatoridan maksimal darajada qanday foydalanishni bilib oling." },
            en: { tag: 'SAT Math', title: 'How to crack SAT Math: 3 tricks from Behruz', text: 'The SAT Math section is not only about formulas but also strict time management. Learn how to get the most out of the Desmos graphing calculator.' } } },
        { id: 'olympiad-math', tag: 'Математика', date: '2026-05-10', readMin: 6, link: 'https://t.me/TheStarth', cover: 'images/blog-math.jpg', published: true, srcLang: 'ru',
          title: 'Олимпиадная математика vs школьная программа',
          text: 'В чем принципиальная разница подходов к решению задач и как участие в математических олимпиадах помогает поступить в престижные мировые университеты.',
          i18n: {
            uz: { tag: 'Matematika', title: 'Olimpiada matematikasi va maktab dasturi', text: "Masalalarni yechish yondashuvlaridagi tub farq nimada va matematik olimpiadalarda qatnashish nufuzli jahon universitetlariga kirishga qanday yordam beradi." },
            en: { tag: 'Math', title: 'Olympiad math vs. school curriculum', text: 'What is the fundamental difference in approaches to problem solving, and how taking part in math olympiads helps you get into prestigious universities worldwide.' } } }
    ];

    var MONTHS = {
        ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
        uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
        en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    };

    function lang() { return window.StarthI18n ? StarthI18n.lang() : 'ru'; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function safeUrl(u) {
        u = String(u || '').trim();
        return /^(https?:\/\/|images\/|data:image\/(png|jpe?g|webp);base64,)/i.test(u) ? u : '';
    }
    function pick(p, f, l) {
        if (window.StarthI18n) return StarthI18n.pick(p, f, l);
        return p[f] || '';
    }

    /** "22 мая 2026 • 5 мин чтения" in the visitor's language */
    function meta(p, l) {
        l = l || lang();
        var parts = [];
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.date || '');
        if (m) {
            var y = m[1], mo = MONTHS[l][+m[2] - 1] || '', d = +m[3];
            parts.push(l === 'en' ? mo + ' ' + d + ', ' + y : l === 'uz' ? d + '-' + mo + ', ' + y : d + ' ' + mo + ' ' + y);
        }
        var n = parseInt(p.readMin, 10);
        if (n > 0) parts.push(l === 'en' ? n + ' min read' : l === 'uz' ? n + " daqiqalik o'qish" : n + ' мин чтения');
        return parts.join(' • ');
    }

    function linkLabel(link, l) {
        l = l || lang();
        var tg = /(^|\/\/)(t\.me|telegram\.me)\//i.test(link || '');
        if (tg) return { ru: 'Читать в Telegram →', uz: "Telegramda o'qish →", en: 'Read on Telegram →' }[l];
        if (/instagram\.com/i.test(link || '')) return { ru: 'Смотреть в Instagram →', uz: "Instagramda ko'rish →", en: 'View on Instagram →' }[l];
        if (/youtu\.?be/i.test(link || '')) return { ru: 'Смотреть на YouTube →', uz: "YouTube'da ko'rish →", en: 'Watch on YouTube →' }[l];
        return { ru: 'Читать →', uz: "O'qish →", en: 'Read →' }[l];
    }

    function card(p, l) {
        l = l || lang();
        var cover = safeUrl(p.cover), tag = pick(p, 'tag', l), link = safeUrl(p.link);
        return '<div class="blog-card">' +
            '<div class="blog-img-container">' +
                (cover ? '<img class="blog-photo" src="' + esc(cover) + '" alt="' + esc(tag || pick(p, 'title', l)) + '" width="1200" height="632" loading="lazy" decoding="async">'
                       : '<div class="blog-img-placeholder">' + esc((tag || 'TS').slice(0, 2)) + '</div>') +
                (tag ? '<span class="blog-badge">' + esc(tag) + '</span>' : '') +
            '</div>' +
            '<div class="blog-body">' +
                '<div class="blog-meta-info">' + esc(meta(p, l)) + '</div>' +
                '<h3>' + esc(pick(p, 'title', l)) + '</h3>' +
                '<p>' + esc(pick(p, 'text', l)) + '</p>' +
                (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener" class="blog-link">' + esc(linkLabel(link, l)) + '</a>' : '') +
            '</div>' +
        '</div>';
    }

    window.StarthBlog = { BUILTIN: BUILTIN, meta: meta, card: card, linkLabel: linkLabel, safeUrl: safeUrl };

    // ── Home page ──
    function initHome() {
        var grid = document.querySelector('#blog .blog-grid');
        if (!grid || typeof FIREBASE_READY === 'undefined' || !FIREBASE_READY || typeof db === 'undefined') return;
        var posts = null;
        function render() {
            if (!posts) return;
            var list = posts.filter(function (p) { return p && p.published !== false; });
            var sec = document.getElementById('blog');
            if (!list.length) { if (sec) sec.style.display = 'none'; return; }
            if (sec) sec.style.display = '';
            grid.innerHTML = list.map(function (p) { return card(p); }).join('');
        }
        db.collection('settings').doc('blog').get().then(function (d) {
            var x = d.exists ? d.data() : null;
            if (!x || !x.managed || !Array.isArray(x.posts)) return;   // keep the built-in HTML
            posts = x.posts;
            render();
        }).catch(function (e) { console.warn('Blog: using built-in posts.', e); });
        window.addEventListener('starth-lang-changed', render);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHome);
    else initHome();
})();
