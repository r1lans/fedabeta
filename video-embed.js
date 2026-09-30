// Shared by index.html (carousel) and admin.html (validation + preview).
// Turns a pasted link into something the carousel can play:
//   YouTube (watch / youtu.be / shorts / live / embed) -> { type:'youtube', id }
//   Instagram (reel / p / tv)                          -> { type:'instagram', kind, code }
//   anything else over https                           -> { type:'file', url } (direct .mp4 / .webm)
window.parseVideoLink = function (raw) {
    raw = String(raw || '').trim();
    if (!/^https:\/\//i.test(raw)) return null;
    let u;
    try { u = new URL(raw); } catch (e) { return null; }
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/i, '').toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);

    // ── YouTube ──
    if (host === 'youtu.be' && parts[0] && /^[\w-]{11}$/.test(parts[0])) {
        return { type: 'youtube', id: parts[0] };
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        let id = '';
        if (parts[0] === 'watch') id = u.searchParams.get('v') || '';
        else if (['shorts', 'embed', 'live', 'v'].indexOf(parts[0]) !== -1) id = parts[1] || '';
        if (/^[\w-]{11}$/.test(id)) return { type: 'youtube', id };
        return null;
    }

    // ── Instagram ──
    if (host === 'instagram.com' || host === 'instagr.am') {
        // /reel/CODE/, /p/CODE/, /tv/CODE/ — also /username/reel/CODE/
        let i = parts.findIndex(p => ['reel', 'reels', 'p', 'tv'].indexOf(p) !== -1);
        if (i !== -1 && parts[i + 1] && /^[\w-]+$/.test(parts[i + 1])) {
            return { type: 'instagram', kind: parts[i] === 'reels' ? 'reel' : parts[i], code: parts[i + 1] };
        }
        return null;
    }

    return { type: 'file', url: raw };
};

// iframe src for an embed descriptor
window.videoEmbedSrc = function (info, opts) {
    opts = opts || {};
    if (!info) return '';
    if (info.type === 'youtube') {
        // controls=0 / modestbranding / iv_load_policy / fs=0 / disablekb hide YouTube's own buttons, logo,
        // title strip and annotations. Play / pause / sound are handled by our own overlay and mute button.
        const q = ['controls=0', 'rel=0', 'playsinline=1', 'modestbranding=1', 'iv_load_policy=3',
                   'fs=0', 'disablekb=1', 'cc_load_policy=0', 'enablejsapi=1'];
        if (opts.origin) q.push('origin=' + encodeURIComponent(opts.origin));
        if (opts.autoplay) q.push('autoplay=1', 'mute=1');
        if (opts.loop) q.push('loop=1', 'playlist=' + info.id);
        return 'https://www.youtube-nocookie.com/embed/' + info.id + '?' + q.join('&');
    }
    if (info.type === 'instagram') {
        return 'https://www.instagram.com/' + info.kind + '/' + info.code + '/embed';
    }
    return '';
};
