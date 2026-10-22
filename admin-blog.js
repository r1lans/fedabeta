/* Admin panel -> «Блог и статьи».
 * Edits Firestore settings/blog { managed, posts[] } — shown on the home page (blog.js).
 * Covers: generated right here (same dark/gold look as the built-in ones), uploaded, or a link.
 * Needs (from admin.html): db, escapeHtml, setStatus, StarthI18n, StarthBlog.
 */
(function () {
    var DOC = function () { return db.collection('settings').doc('blog'); };
    var MAX_DOC = 950 * 1024;            // Firestore document limit is 1 MiB
    var posts = null, managed = false, editingId = null, coverMode = 'make', coverData = '', loaded = false;

    function $(id) { return document.getElementById(id); }
    function esc(s) { return escapeHtml(s); }
    function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function sizeOf(list) { return new Blob([JSON.stringify(list)]).size; }
    function kb(n) { return Math.round(n / 1024) + ' КБ'; }

    /* ───────────── Cover generator ───────────── */
    var MOTIFS = [['globe', 'Глобус (языки, IELTS)'], ['chart', 'График (SAT, математика)'], ['symbols', 'Формулы и знаки'], ['book', 'Открытая книга'], ['cap', 'Шапка выпускника (поступление)'], ['none', 'Без рисунка']];
    var GOLD = '#E3B04B';

    function drawCover(canvas, o) {
        var W = 1200, H = 632, c = canvas.getContext('2d');
        canvas.width = W; canvas.height = H;
        var g = c.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#0E1220'); g.addColorStop(1, '#1D1F26');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.strokeStyle = 'rgba(255,255,255,0.045)'; c.lineWidth = 1;
        for (var x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
        for (var y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
        var hasArt = o.motif && o.motif !== 'none';
        var gx = hasArt ? 900 : 600, rg = c.createRadialGradient(gx, 300, 10, gx, 300, 470);
        rg.addColorStop(0, 'rgba(227,176,75,0.42)'); rg.addColorStop(0.55, 'rgba(227,176,75,0.10)'); rg.addColorStop(1, 'rgba(227,176,75,0)');
        c.fillStyle = rg; c.fillRect(0, 0, W, H);
        if (hasArt) drawMotif(c, o.motif, 945, 316);

        // Big title (auto-fit), gold rule, subtitle
        var big = String(o.big || '').trim() || 'TheStarth';
        var maxW = hasArt ? 560 : 1040, size = 150;
        c.textBaseline = 'alphabetic';
        do { c.font = '700 ' + size + 'px Fraunces, Georgia, serif'; size -= 4; } while (c.measureText(big).width > maxW && size > 40);
        size += 4;
        var lines = [big];
        if (c.measureText(big).width > maxW && big.indexOf(' ') > 0) {   // two lines for long words
            var words = big.split(/\s+/), half = Math.ceil(words.length / 2);
            lines = [words.slice(0, half).join(' '), words.slice(half).join(' ')];
            size = 120;
            do { c.font = '700 ' + size + 'px Fraunces, Georgia, serif'; size -= 4; } while (Math.max(c.measureText(lines[0]).width, c.measureText(lines[1]).width) > maxW && size > 36);
            size += 4;
        }
        c.font = '700 ' + size + 'px Fraunces, Georgia, serif';
        var x0 = hasArt ? 92 : (W - Math.max.apply(null, lines.map(function (l) { return c.measureText(l).width; }))) / 2;
        var lh = size * 1.05, blockH = lh * lines.length + 34 + (o.sub ? 50 : 0);
        var top = (H - blockH) / 2 + size * 0.82;
        c.fillStyle = '#F7F1E3';
        lines.forEach(function (l, i) { c.fillText(l, x0, top + i * lh); });
        var ry = top + (lines.length - 1) * lh + 44;
        c.fillStyle = GOLD; roundRect(c, x0, ry, 210, 8, 4); c.fill();
        if (o.sub) {
            var s = 32;
            do { c.font = '600 ' + s + 'px Inter, system-ui, sans-serif'; s -= 1; } while (c.measureText(o.sub).width > maxW && s > 16);
            c.fillStyle = '#C3C8D4';
            c.fillText(o.sub, x0, ry + 62);
        }
    }
    function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function drawMotif(c, m, cx, cy) {
        c.save(); c.strokeStyle = GOLD; c.fillStyle = GOLD; c.lineWidth = 3.2; c.lineCap = 'round'; c.lineJoin = 'round';
        if (m === 'globe') {
            var R = 205;
            c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
            [0.32, 0.64, 0.9].forEach(function (k) { c.beginPath(); c.ellipse(cx, cy, R * k, R, 0, 0, Math.PI * 2); c.stroke(); });
            c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
            [-0.62, -0.3, 0, 0.3, 0.62].forEach(function (k) { var yy = cy + R * k, hw = Math.sqrt(R * R - (R * k) * (R * k)); c.beginPath(); c.moveTo(cx - hw, yy); c.lineTo(cx + hw, yy); c.stroke(); });
        } else if (m === 'chart') {
            c.lineWidth = 2.5; c.globalAlpha = 0.75;
            c.beginPath(); c.moveTo(cx - 200, cy + 170); c.lineTo(cx + 210, cy + 170); c.moveTo(cx - 170, cy + 200); c.lineTo(cx - 170, cy - 200); c.stroke();
            c.globalAlpha = 1; c.lineWidth = 4;
            c.beginPath();
            for (var i = 0; i <= 60; i++) { var t = -1 + i / 30, px = cx + 20 + t * 175, py = cy - 120 + t * t * 260; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
            c.stroke();
            c.strokeStyle = '#7FB2E5'; c.lineWidth = 3;
            c.beginPath(); c.moveTo(cx - 190, cy + 110); c.lineTo(cx + 210, cy - 150); c.stroke();
            c.fillStyle = '#F7F1E3'; c.beginPath(); c.arc(cx + 70, cy - 50, 9, 0, Math.PI * 2); c.fill();
            c.font = '600 28px Inter, system-ui, sans-serif'; c.fillStyle = '#F7F1E3';
            c.fillText('y = ax² + bx + c', cx - 110, cy - 215);
        } else if (m === 'symbols') {
            var S = [['π', 0, -150, 92], ['Σ', 150, -30, 104], ['∫', 60, 130, 120], ['√x', -150, 120, 70], ['∞', -110, -40, 80], ['Δ', 190, 170, 60], ['x²', -40, -230, 54], ['%', 185, -215, 50]];
            S.forEach(function (s, i) { c.globalAlpha = i % 3 === 2 ? 0.55 : 0.95; c.font = '600 ' + s[3] + 'px Fraunces, Georgia, serif'; c.fillText(s[0], cx + s[1] - s[3] / 3, cy + s[2] + s[3] / 3); });
        } else if (m === 'book') {
            c.lineWidth = 4;
            c.beginPath(); c.moveTo(cx, cy - 120); c.quadraticCurveTo(cx - 100, cy - 175, cx - 230, cy - 140); c.lineTo(cx - 230, cy + 140); c.quadraticCurveTo(cx - 100, cy + 105, cx, cy + 160); c.closePath(); c.stroke();
            c.beginPath(); c.moveTo(cx, cy - 120); c.quadraticCurveTo(cx + 100, cy - 175, cx + 230, cy - 140); c.lineTo(cx + 230, cy + 140); c.quadraticCurveTo(cx + 100, cy + 105, cx, cy + 160); c.stroke();
            c.lineWidth = 2.4; c.globalAlpha = 0.7;
            for (var k = 0; k < 5; k++) { var yy2 = cy - 80 + k * 42; c.beginPath(); c.moveTo(cx - 190, yy2 - 10); c.quadraticCurveTo(cx - 100, yy2 - 34, cx - 30, yy2 + 4); c.stroke(); c.beginPath(); c.moveTo(cx + 30, yy2 + 4); c.quadraticCurveTo(cx + 100, yy2 - 34, cx + 190, yy2 - 10); c.stroke(); }
        } else if (m === 'cap') {
            c.lineWidth = 4;
            c.beginPath(); c.moveTo(cx, cy - 150); c.lineTo(cx + 240, cy - 50); c.lineTo(cx, cy + 50); c.lineTo(cx - 240, cy - 50); c.closePath(); c.stroke();
            c.beginPath(); c.moveTo(cx - 140, cy - 8); c.lineTo(cx - 140, cy + 100); c.quadraticCurveTo(cx, cy + 175, cx + 140, cy + 100); c.lineTo(cx + 140, cy - 8); c.stroke();
            c.beginPath(); c.moveTo(cx + 200, cy - 66); c.lineTo(cx + 200, cy + 90); c.stroke();
            c.beginPath(); c.arc(cx + 200, cy + 106, 14, 0, Math.PI * 2); c.fill();
        }
        c.restore();
    }

    function makeCoverData() {
        var cv = $('blg-cover-canvas');
        drawCover(cv, { big: $('blg-big').value, sub: $('blg-sub').value, motif: $('blg-motif').value });
        return toJpeg(cv, 120 * 1024);
    }
    function toJpeg(canvas, maxBytes) {
        var q = 0.86, out = canvas.toDataURL('image/jpeg', q);
        while (out.length * 0.75 > maxBytes && q > 0.5) { q -= 0.07; out = canvas.toDataURL('image/jpeg', q); }
        if (out.length * 0.75 > maxBytes) {               // still heavy: shrink
            var s = document.createElement('canvas'); s.width = 900; s.height = 474;
            s.getContext('2d').drawImage(canvas, 0, 0, 900, 474);
            out = s.toDataURL('image/jpeg', 0.8);
        }
        return out;
    }
    function uploadCover(file) {
        return new Promise(function (resolve, reject) {
            if (!file || !/^image\//.test(file.type)) return reject(new Error('Выберите картинку (JPG, PNG или WEBP).'));
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                var W = 1200, H = 632, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
                var r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r;
                var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H);
                cx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
                resolve(toJpeg(cv, 120 * 1024));
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать картинку.')); };
            img.src = url;
        });
    }

    /* ───────────── UI ───────────── */
    function shell() {
        var root = $('blog-root');
        root.innerHTML =
            '<div class="adm-addbar"><button class="btn-primary" id="blg-add-btn" type="button"><svg class="ico" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><path d="M12 5v14M5 12h14"/></svg> Новая статья</button>' +
                '<span class="adm-muted" id="blg-usage"></span></div>' +
            '<div class="admin-form adm-collapsible" id="blg-form" hidden>' +
                '<div class="adm-form-head"><h3 id="blg-form-title">Новая статья</h3><button type="button" class="adm-x" id="blg-close" aria-label="Свернуть"><svg class="ico" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' +
                '<div class="adm-split">' +
                '<div class="adm-split-main">' +
                    '<div class="adm-step"><span>1</span> Текст</div>' +
                    '<div class="adm-grid2">' +
                        '<div><label for="blg-tag">Категория (значок на картинке)</label><input id="blg-tag" maxlength="24" placeholder="IELTS, SAT Math, Математика…" list="blg-tags"></div>' +
                        '<div><label for="blg-lang">Язык, на котором пишете</label><select id="blg-lang"><option value="ru">Русский</option><option value="uz">O‘zbekcha</option><option value="en">English</option></select></div>' +
                    '</div>' +
                    '<datalist id="blg-tags"><option value="IELTS"><option value="SAT"><option value="SAT Math"><option value="Математика"><option value="CEFR"><option value="Поступление"><option value="Советы"></datalist>' +
                    '<label for="blg-title">Заголовок *</label><input id="blg-title" maxlength="120" placeholder="Например: Как поднять IELTS Writing с 6.0 до 7.0">' +
                    '<label for="blg-text">Короткое описание * <span class="adm-muted" id="blg-text-n"></span></label><textarea id="blg-text" maxlength="320" placeholder="2–3 предложения: о чём статья и чем полезна."></textarea>' +
                    '<label for="blg-link">Ссылка — куда ведёт кнопка «Читать»</label><input id="blg-link" maxlength="400" placeholder="https://t.me/TheStarth/123">' +
                    '<p class="adm-help">Ссылка на пост в Telegram, Instagram, YouTube или любую страницу. Кнопка сама подпишется: «Читать в Telegram →», «Смотреть на YouTube →» и т.д.</p>' +
                    '<div class="adm-grid2">' +
                        '<div><label for="blg-date">Дата</label><input type="date" id="blg-date"></div>' +
                        '<div><label for="blg-min">Время чтения, мин</label><input type="number" id="blg-min" min="1" max="60" value="5"></div>' +
                    '</div>' +
                    '<div class="adm-step"><span>2</span> Картинка</div>' +
                    '<div class="adm-seg" id="blg-seg">' +
                        '<button type="button" data-m="make" class="on">Сделать обложку</button>' +
                        '<button type="button" data-m="upload">Загрузить свою</button>' +
                        '<button type="button" data-m="url">Ссылка на картинку</button>' +
                        '<button type="button" data-m="keep" id="blg-seg-keep" hidden>Оставить как есть</button>' +
                    '</div>' +
                    '<div data-pane="make">' +
                        '<div class="adm-grid2">' +
                            '<div><label for="blg-big">Крупная надпись</label><input id="blg-big" maxlength="22" placeholder="IELTS"></div>' +
                            '<div><label for="blg-motif">Рисунок справа</label><select id="blg-motif">' + MOTIFS.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select></div>' +
                        '</div>' +
                        '<label for="blg-sub">Подпись под надписью (необязательно)</label><input id="blg-sub" maxlength="48" placeholder="Band 7.5+ · Speaking · Writing">' +
                    '</div>' +
                    '<div data-pane="upload" hidden><label for="blg-file">Картинка (обрежется до 1200×632 и сожмётся)</label><input type="file" id="blg-file" accept="image/*"></div>' +
                    '<div data-pane="url" hidden><label for="blg-url">Ссылка на картинку</label><input id="blg-url" maxlength="500" placeholder="https://…/cover.jpg"></div>' +
                    '<label class="adm-check"><input type="checkbox" id="blg-pub" checked> Показывать на сайте</label>' +
                    '<div class="adm-actions">' +
                        '<button class="btn-primary" type="button" id="blg-save">Опубликовать статью</button>' +
                        '<button class="btn-small" type="button" id="blg-cancel">Отмена</button>' +
                    '</div>' +
                    '<div class="status-msg" id="blg-status"></div>' +
                '</div>' +
                '<div class="adm-split-side"><div class="adm-preview-label">Так будет на сайте</div><div id="blg-preview" class="adm-blog-preview"></div>' +
                    '<canvas id="blg-cover-canvas" width="1200" height="632" hidden></canvas></div>' +
                '</div>' +
            '</div>' +
            '<h3 class="adm-listhead">Статьи на сайте <span class="adm-count" id="blg-count"></span></h3>' +
            '<p class="adm-help" style="margin-top:-.4rem">Порядок здесь = порядок на главной. Скрытые статьи на сайте не видны.</p>' +
            '<div id="blg-list"><div class="empty-state">Загрузка…</div></div>';

        $('blg-add-btn').onclick = function () { resetForm(); openForm(); };
        $('blg-close').onclick = closeForm;
        $('blg-cancel').onclick = function () { resetForm(); closeForm(); };
        $('blg-save').onclick = save;
        $('blg-seg').addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (b) setMode(b.getAttribute('data-m')); });
        $('blg-file').onchange = function () {
            var f = this.files && this.files[0]; if (!f) return;
            setStatus('blg-status', 'Обрабатываю картинку…', true);
            uploadCover(f).then(function (d) { coverData = d; setStatus('blg-status', '', true); preview(); })
                .catch(function (e) { setStatus('blg-status', e.message, false); });
        };
        ['blg-tag', 'blg-title', 'blg-text', 'blg-link', 'blg-date', 'blg-min', 'blg-big', 'blg-sub', 'blg-motif', 'blg-url', 'blg-lang'].forEach(function (id) {
            $(id).addEventListener('input', onInput); $(id).addEventListener('change', onInput);
        });
    }
    var bigTouched = false;
    function onInput(e) {
        if (e && e.target.id === 'blg-big') bigTouched = true;
        if (e && e.target.id === 'blg-tag' && !bigTouched) $('blg-big').value = $('blg-tag').value;
        $('blg-text-n').textContent = $('blg-text').value.length + '/320';
        clearTimeout(onInput.t); onInput.t = setTimeout(preview, 120);
    }
    function setMode(m) {
        coverMode = m;
        document.querySelectorAll('#blg-seg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-m') === m); });
        document.querySelectorAll('#blg-form [data-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== m; });
        if (m === 'upload') coverData = '';
        preview();
    }
    function currentCover() {
        if (coverMode === 'make') return makeCoverData();
        if (coverMode === 'upload') return coverData;
        if (coverMode === 'url') { var u = $('blg-url').value.trim(); return /^(https:\/\/|images\/)/i.test(u) ? u : ''; }
        var p = editingId && posts.find(function (x) { return x.id === editingId; });
        return p ? p.cover : '';
    }
    function formPost() {
        return {
            tag: $('blg-tag').value.trim(), title: $('blg-title').value.trim(), text: $('blg-text').value.trim(),
            link: $('blg-link').value.trim(), date: $('blg-date').value, readMin: Math.max(0, parseInt($('blg-min').value, 10) || 0),
            srcLang: $('blg-lang').value || 'ru', published: $('blg-pub').checked
        };
    }
    function preview() {
        var p = formPost();
        p.cover = currentCover();
        if (!p.title) p.title = 'Заголовок статьи';
        if (!p.text) p.text = 'Короткое описание статьи появится здесь.';
        $('blg-preview').innerHTML = StarthBlog.card(p, p.srcLang);
    }
    function openForm() { $('blg-form').hidden = false; $('blg-add-btn').hidden = true; preview(); $('blg-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    function closeForm() { $('blg-form').hidden = true; $('blg-add-btn').hidden = false; }
    function resetForm() {
        editingId = null; coverData = ''; bigTouched = false;
        ['blg-tag', 'blg-title', 'blg-text', 'blg-big', 'blg-sub', 'blg-url'].forEach(function (id) { $(id).value = ''; });
        $('blg-link').value = 'https://t.me/TheStarth';
        $('blg-date').value = today(); $('blg-min').value = 5; $('blg-lang').value = 'ru'; $('blg-motif').value = 'globe';
        $('blg-file').value = ''; $('blg-pub').checked = true;
        $('blg-seg-keep').hidden = true; setMode('make');
        $('blg-form-title').textContent = 'Новая статья'; $('blg-save').textContent = 'Опубликовать статью';
        setStatus('blg-status', '', true); onInput();
    }
    function edit(id) {
        var p = posts.find(function (x) { return x.id === id; }); if (!p) return;
        resetForm(); editingId = id;
        $('blg-tag').value = p.tag || ''; $('blg-title').value = p.title || ''; $('blg-text').value = p.text || '';
        $('blg-link').value = p.link || ''; $('blg-date').value = p.date || ''; $('blg-min').value = p.readMin || '';
        $('blg-lang').value = p.srcLang || 'ru'; $('blg-pub').checked = p.published !== false;
        $('blg-big').value = p.tag || ''; bigTouched = false;
        $('blg-seg-keep').hidden = !p.cover; setMode(p.cover ? 'keep' : 'make');
        $('blg-form-title').textContent = 'Изменить статью'; $('blg-save').textContent = 'Сохранить изменения';
        onInput(); openForm();
    }

    function renderList() {
        var wrap = $('blg-list');
        $('blg-count').textContent = posts.length ? posts.length : '';
        var used = sizeOf(posts);
        $('blg-usage').textContent = 'Место под статьи: ' + kb(used) + ' из ' + kb(MAX_DOC) + (used > MAX_DOC * 0.8 ? ' — почти заполнено, удалите старые статьи' : '');
        if (!posts.length) { wrap.innerHTML = '<div class="empty-state">Статей пока нет — нажмите «Новая статья». Пока статей нет, блок блога на главной скрыт.</div>'; return; }
        wrap.innerHTML = posts.map(function (p, i) {
            var cover = StarthBlog.safeUrl(p.cover);
            return '<div class="adm-item' + (p.published === false ? ' is-off' : '') + '">' +
                (cover ? '<img class="adm-item-cover" src="' + esc(cover) + '" alt="">' : '<div class="adm-item-cover"></div>') +
                '<div class="adm-item-main">' +
                    '<div class="adm-item-top"><span class="chip">№' + (i + 1) + '</span>' + (p.tag ? '<span class="chip">' + esc(p.tag) + '</span>' : '') +
                        (p.published === false ? '<span class="adm-pill off">Скрыта</span>' : '<span class="adm-pill on">На сайте</span>') + '</div>' +
                    '<h3>' + esc(p.title) + '</h3>' +
                    '<div class="meta">' + esc(StarthBlog.meta(p, 'ru')) + (p.link ? ' · <a href="' + esc(p.link) + '" target="_blank" rel="noopener">' + esc(p.link.replace(/^https?:\/\//, '').slice(0, 40)) + '</a>' : '') + '</div>' +
                    '<div class="admin-card-actions">' +
                        '<button class="btn-small" data-a="up" data-id="' + esc(p.id) + '"' + (i === 0 ? ' disabled' : '') + ' title="Показывать раньше">↑</button>' +
                        '<button class="btn-small" data-a="down" data-id="' + esc(p.id) + '"' + (i === posts.length - 1 ? ' disabled' : '') + ' title="Показывать позже">↓</button>' +
                        '<button class="btn-small primary" data-a="edit" data-id="' + esc(p.id) + '">Изменить</button>' +
                        '<button class="btn-small" data-a="toggle" data-id="' + esc(p.id) + '">' + (p.published === false ? 'Показать' : 'Скрыть') + '</button>' +
                        '<button class="btn-small danger" data-a="del" data-id="' + esc(p.id) + '">Удалить</button>' +
                    '</div>' +
                '</div></div>';
        }).join('');
    }

    async function fresh() {
        var d = await DOC().get();
        var x = d.exists ? d.data() : null;
        managed = !!(x && x.managed && Array.isArray(x.posts));
        return managed ? x.posts : clone(StarthBlog.BUILTIN);
    }
    async function write(list) {
        if (sizeOf(list) > MAX_DOC) throw new Error('Не хватает места: удалите старые статьи или используйте «Ссылка на картинку» вместо загрузки.');
        await DOC().set({ managed: true, posts: list, updatedAt: new Date().toISOString() });
        managed = true; posts = list; renderList();
    }

    async function save() {
        var f = formPost();
        if (!f.title || !f.text) return setStatus('blg-status', 'Заполните заголовок и короткое описание.', false);
        if (f.link && !/^https?:\/\//i.test(f.link)) return setStatus('blg-status', 'Ссылка должна начинаться с https://', false);
        if (coverMode === 'upload' && !coverData) return setStatus('blg-status', 'Выберите картинку или переключитесь на «Сделать обложку».', false);
        if (coverMode === 'url' && !currentCover()) return setStatus('blg-status', 'Ссылка на картинку должна начинаться с https://', false);
        var btn = $('blg-save'); btn.disabled = true;
        try {
            var list = await fresh();
            var prev = editingId ? list.find(function (x) { return x.id === editingId; }) : null;
            var post = Object.assign({}, prev || { id: newId(), createdAt: new Date().toISOString() }, f);
            post.cover = currentCover();

            // Translate only what changed. A Latin-only category (IELTS, SAT Math) stays as it is.
            var need = {}, same = prev && prev.srcLang === f.srcLang;
            if (!same || prev.title !== f.title) need.title = f.title;
            if (!same || prev.text !== f.text) need.text = f.text;
            var tagLatin = !/[А-Яа-яЁёЎўҚқҒғҲҳ]/.test(f.tag) && f.srcLang !== 'uz';
            if (f.tag && !tagLatin && (!same || prev.tag !== f.tag)) need.tag = f.tag;
            var i18n = same && prev.i18n ? clone(prev.i18n) : {};
            var warn = '';
            if (Object.keys(need).length) {
                setStatus('blg-status', 'Перевожу на другие языки…', true);
                var tr = await StarthI18n.translateFields(need, f.srcLang, function (d, n) { setStatus('blg-status', 'Перевожу на другие языки… ' + d + '/' + n, true); });
                StarthI18n.LANGS.filter(function (l) { return l !== f.srcLang; }).forEach(function (l) { i18n[l] = Object.assign({}, i18n[l] || {}, tr[l] || {}); });
                if (tr._failed) warn = ' Часть текста не удалось перевести (лимит сервиса перевода) — на UZ/EN покажется оригинал; откройте статью и сохраните ещё раз позже.';
            }
            StarthI18n.LANGS.filter(function (l) { return l !== f.srcLang; }).forEach(function (l) {
                i18n[l] = i18n[l] || {};
                if (!f.tag) delete i18n[l].tag; else if (tagLatin) i18n[l].tag = f.tag;
            });
            post.i18n = i18n;
            if (prev) list = list.map(function (x) { return x.id === prev.id ? post : x; });
            else list.unshift(post);                     // newest first
            await write(list);
            var wasEdit = !!prev;
            resetForm(); closeForm();
            flash(wasEdit ? 'Статья сохранена.' + warn : 'Статья опубликована — она уже на главной.' + warn, !warn);
        } catch (e) {
            setStatus('blg-status', 'Ошибка: ' + e.message, false);
        } finally { btn.disabled = false; }
    }
    function flash(text, ok) {
        var el = document.createElement('div');
        el.className = 'status-msg ' + (ok ? 'ok' : 'error') + ' adm-flash';
        el.textContent = text;
        $('blg-list').before(el);
        setTimeout(function () { el.remove(); }, 6000);
    }

    async function act(a, id) {
        try {
            var list = await fresh(), i = list.findIndex(function (x) { return x.id === id; });
            if (i < 0) return;
            if (a === 'edit') { posts = list; renderList(); return edit(id); }
            if (a === 'del') { if (!confirm('Удалить статью «' + list[i].title + '»?')) return; list.splice(i, 1); }
            if (a === 'toggle') list[i].published = list[i].published === false;
            if (a === 'up' && i > 0) list.splice(i - 1, 0, list.splice(i, 1)[0]);
            if (a === 'down' && i < list.length - 1) list.splice(i + 1, 0, list.splice(i, 1)[0]);
            await write(list);
        } catch (e) { alert('Ошибка: ' + e.message); }
    }

    window.loadBlogAdmin = async function () {
        if (!$('blog-root')) return;
        if (!loaded) {
            shell(); resetForm(); loaded = true;
            $('blg-list').addEventListener('click', function (e) { var b = e.target.closest('button[data-a]'); if (b) act(b.getAttribute('data-a'), b.getAttribute('data-id')); });
            if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('700 100px Fraunces'), document.fonts.load('600 30px Inter')]).then(preview).catch(function () {}); }
        }
        try { posts = await fresh(); renderList(); }
        catch (e) { $('blg-list').innerHTML = '<div class="empty-state">Не удалось загрузить статьи: ' + esc(e.message) + '</div>'; }
    };
    window.StarthBlogAdmin = { drawCover: drawCover };
})();
