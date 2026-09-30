/**
 * TheStarth — Sheets logging backend (Google Apps Script)
 * ------------------------------------------------
 * Mirrors new student sign-ups and payment requests into a Google Sheet,
 * so a curator/accountant can see them without touching Firebase.
 *
 * News, reviews, site settings, and student accounts now live in
 * Firebase — see firebase-backend/FIREBASE_SETUP.md. This script does
 * NOT handle those anymore.
 *
 * SETUP — see SETUP.md in this folder.
 */

const SHEET_NAMES = {
  SIGNUPS: 'Signups',
  PAYMENTS: 'Payments',
  CONTACTS: 'Contacts',
  TRIAL_REQUESTS: 'TrialRequests',
  CAREER_APPLICATIONS: 'CareerApplications',
  TEST_LEADS: 'TestLeads'
};

// Column titles. If a tab does not exist yet it is created automatically with
// these titles, so a forgotten tab can no longer make a sign-up fail.
const HEADERS = {
  Signups: ['date', 'name', 'surname', 'student_id', 'phone', 'nickname', 'course', 'email', 'uid'],
  Payments: ['date', 'order_id', 'name', 'student_id', 'phone', 'course', 'amount', 'method', 'status'],
  Contacts: ['date', 'name', 'phone', 'message'],
  TrialRequests: ['date', 'name', 'phone', 'course'],
  CareerApplications: ['date', 'name', 'phone', 'email', 'vacancy', 'score', 'message'],
  TestLeads: ['date', 'name', 'phone', 'source', 'score']
};

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(HEADERS[name] || ['date']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}


// Writes one row by COLUMN TITLE, not by position. The order of columns in the sheet
// does not matter: drag 'surname' next to 'name' (or anywhere) and it keeps working.
// A column that is in HEADERS but missing from the sheet is added at the end.
function appendByHeaders_(tabName, values) {
  const sheet = getSheet_(tabName);
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  let titles = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  (HEADERS[tabName] || []).forEach(function (h) {
    if (titles.indexOf(h) === -1) {
      titles.push(h);
      sheet.getRange(1, titles.length).setValue(h);
    }
  });
  const row = titles.map(function (h) {
    return Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '';
  });
  sheet.appendRow(row);
}

// The endpoint is public, so text that starts with = + - @ would be run as a
// spreadsheet formula. A leading apostrophe stores it as plain text instead
// (this also keeps phone numbers like +998... intact).
function clean_(v) {
  v = (v === undefined || v === null) ? '' : String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

// Student ID like 000001: the leading apostrophe makes Google Sheets keep it as text,
// otherwise it would turn into the number 1 and lose the zeros.
function id_(v) {
  v = (v === undefined || v === null) ? '' : String(v).replace(/[^0-9]/g, '');
  return v ? "'" + v : '';
}

// Open the /exec address in a browser: you should see {"ok":true,...}. That proves the deployment works.
function doGet() {
  return jsonOut_({ ok: true, service: 'TheStarth sheets logging' });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Both actions below are intentionally public (no token/password) —
// they only ever APPEND a row. They never read or expose existing data,
// so there's nothing sensitive to protect here.
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'bad_json' });
  }

  try {
    if (data.action === 'log_signup') {
      const p = data.payload || {};
      appendByHeaders_(SHEET_NAMES.SIGNUPS, {
        date: new Date(), name: clean_(p.name), surname: clean_(p.surname), student_id: id_(p.student_id),
        phone: clean_(p.phone), nickname: clean_(p.nickname), course: clean_(p.course),
        email: clean_(p.email), uid: clean_(p.uid)
      });
      return jsonOut_({ ok: true });
    }

    if (data.action === 'log_contact') {
      const p = data.payload || {};
      appendByHeaders_(SHEET_NAMES.CONTACTS, {
        date: new Date(), name: clean_(p.name), phone: clean_(p.phone), message: clean_(p.message)
      });
      return jsonOut_({ ok: true });
    }

    if (data.action === 'log_payment') {
      const p = data.payload || {};
      appendByHeaders_(SHEET_NAMES.PAYMENTS, {
        date: new Date(), order_id: clean_(p.order_id), name: clean_(p.name), student_id: id_(p.student_id),
        phone: clean_(p.phone), course: clean_(p.course), amount: clean_(p.amount),
        method: clean_(p.method), status: clean_(p.status) || 'Ожидает подтверждения'
      });
      return jsonOut_({ ok: true });
    }

    if (data.action === 'log_trial_request') {
      const p = data.payload || {};
      appendByHeaders_(SHEET_NAMES.TRIAL_REQUESTS, {
        date: new Date(), name: clean_(p.name), phone: clean_(p.phone), course: clean_(p.course)
      });
      return jsonOut_({ ok: true });
    }

    if (data.action === 'log_career_application') {
      const p = data.payload || {};
      appendByHeaders_(SHEET_NAMES.CAREER_APPLICATIONS, {
        date: new Date(), name: clean_(p.name), phone: clean_(p.phone), email: clean_(p.email),
        vacancy: clean_(p.vacancy), score: clean_(p.score), message: clean_(p.message)
      });
      return jsonOut_({ ok: true });
    }

    if (data.action === 'log_test_lead') {
      const p = data.payload || {};
      appendByHeaders_(SHEET_NAMES.TEST_LEADS, {
        date: new Date(), name: clean_(p.name), phone: clean_(p.phone),
        source: clean_(p.source), score: clean_(p.score)
      });
      return jsonOut_({ ok: true });
    }

    return jsonOut_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}
