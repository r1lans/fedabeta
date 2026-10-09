/* TheStarth — Google Sheets logging (shared by every page).
 *
 * >>> Вставьте сюда ОДИН РАЗ адрес веб-приложения Google Apps Script
 * >>> (заканчивается на /exec) — инструкция в sheets-logging/SETUP.md.
 * Пока адрес пустой, запись в таблицу отключена, а сайт работает как обычно.
 */
var SHEETS_LOG_URL = "https://script.google.com/macros/s/AKfycbz2Tc78_wjK4CKOjP60HXP-fo65I0lhxO0EBwl8OR6cYXrOKsZntubMqQ0oAOSV8M-Elw/exec";

/* Send one row to the sheet. Never throws and never blocks the site.
 *  - keepalive: the request survives the page navigating away right after
 *    sign-up (a plain fetch() gets cancelled when the page changes — the most
 *    common reason rows go missing);
 *  - if the network is down, the row is kept in this browser and re-sent on
 *    the next page load.
 * Returns a Promise (true = sent) so callers may wait for it briefly. */
function logToSheet(action, payload) {
    if (!SHEETS_LOG_URL) return Promise.resolve(false);
    var body = JSON.stringify({ action: action, payload: payload });
    return sendToSheet_(body).then(function (ok) {
        if (!ok) queueSheetRow_(body);
        return ok;
    });
}

function sendToSheet_(body) {
    try {
        return fetch(SHEETS_LOG_URL, {
            method: 'POST',
            mode: 'no-cors',                       // Apps Script does not send CORS headers; the row is still written
            keepalive: true,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: body
        }).then(function () { return true; }).catch(function (err) {
            console.warn('Sheet logging failed, will retry later:', err);
            return false;
        });
    } catch (e) {
        try {
            return Promise.resolve(!!(navigator.sendBeacon && navigator.sendBeacon(SHEETS_LOG_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }))));
        } catch (e2) { return Promise.resolve(false); }
    }
}

function queueSheetRow_(body) {
    try {
        var q = JSON.parse(localStorage.getItem('starthSheetQueue') || '[]');
        q.push(body);
        localStorage.setItem('starthSheetQueue', JSON.stringify(q.slice(-50)));
    } catch (e) {}
}

(function flushSheetQueue() {
    if (!SHEETS_LOG_URL) return;
    var q;
    try { q = JSON.parse(localStorage.getItem('starthSheetQueue') || '[]'); } catch (e) { return; }
    if (!q.length) return;
    try { localStorage.removeItem('starthSheetQueue'); } catch (e) {}
    q.forEach(function (body) {
        sendToSheet_(body).then(function (ok) { if (!ok) queueSheetRow_(body); });
    });
})();
