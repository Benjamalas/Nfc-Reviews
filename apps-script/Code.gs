/**
 * Atsiliepimų sistemos backend'as (Google Apps Script + Google Sheet).
 * Įdiegimas: žr. README.md. Po kodo įklijavimo vieną kartą paleiskite setup().
 */

// Kam siųsti pranešimus apie privačius atsiliepimus. Tuščia = skripto savininkui.
const NOTIFY_EMAILS = [];

const SHEET_FEEDBACK = 'Atsiliepimai';
const SHEET_LOG = 'Veikla';
const SHEET_STATS = 'Statistika';
const STATUSES = ['Naujas', 'Sprendžiama', 'Išspręsta'];

// Įvykių kodai iš puslapio -> pavadinimai lentelėje.
const TYPES = {
  visit: 'Apsilankymai',
  rating: 'Įvertinimai',
  google: 'Paspaudė Google',
  feedback: 'Privatūs atsiliepimai',
  request: 'Išsiųsti prašymai'
};

function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false });
  }
  if (!TYPES[d.type]) return json({ ok: false });
  if (d.website) return json({ ok: true }); // paslėptas laukas užpildytas = botas

  const now = new Date();
  const month = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  const rating = Number(d.rating) >= 1 && Number(d.rating) <= 5 ? Number(d.rating) : '';
  const ss = SpreadsheetApp.getActive();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ss.getSheetByName(SHEET_LOG).appendRow([
      now, "'" + month, clean(d.source, 40), TYPES[d.type], rating, clean(d.channel, 20), clean(d.lang, 5)
    ]);
    if (d.type === 'feedback') {
      ss.getSheetByName(SHEET_FEEDBACK).appendRow([
        now, rating, clean(d.message, 2000), clean(d.name, 100), clean(d.contact, 100),
        clean(d.source, 40), STATUSES[0], ''
      ]);
    }
  } finally {
    lock.releaseLock();
  }

  if (d.type === 'feedback') notify(d, rating, ss);
  return json({ ok: true });
}

// Atidarius URL naršyklėje – patikrinimas, kad skriptas veikia.
function doGet() {
  return ContentService.createTextOutput('OK – atsiliepimų sistema veikia.');
}

function notify(d, rating, ss) {
  const to = (NOTIFY_EMAILS.length ? NOTIFY_EMAILS : [Session.getEffectiveUser().getEmail()]).join(',');
  const contact = String(d.contact || '').trim();
  const lines = [
    'Įvertinimas: ' + (rating ? rating + ' ★' : '—'),
    'Vardas: ' + (d.name || '—'),
    'Kontaktas: ' + (contact || '—'),
    'Šaltinis: ' + (d.source || '—'),
    '',
    String(d.message || ''),
    '',
    'Visi atsiliepimai: ' + ss.getUrl()
  ];
  const options = { name: 'Atsiliepimai' };
  if (/^\S+@\S+\.\S+$/.test(contact)) options.replyTo = contact;
  MailApp.sendEmail(to, '⚠️ Naujas privatus atsiliepimas (' + (rating || '?') + '★)', lines.join('\n'), options);
}

// Apriboja ilgį ir neleidžia tekstui virsti formule lentelėje.
function clean(value, max) {
  const s = String(value || '').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Paleiskite vieną kartą: sukuria lapus, antraštes, būsenų sąrašą ir statistiką. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const first = ss.getSheets()[0];
  if (ss.getSheets().length === 1 && first.getLastRow() === 0 && !ss.getSheetByName(SHEET_FEEDBACK)) {
    first.setName(SHEET_FEEDBACK);
  }

  const fb = sheet(ss, SHEET_FEEDBACK, ['Data', 'Įvertinimas', 'Žinutė', 'Vardas', 'Kontaktas', 'Šaltinis', 'Būsena', 'Pastabos']);
  fb.setColumnWidth(3, 380);
  fb.getRange('C:C').setWrap(true);
  const status = fb.getRange('G2:G1000');
  status.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  fb.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUSES[0]).setBackground('#fde2e2').setRanges([status]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUSES[2]).setBackground('#dff3e4').setRanges([status]).build()
  ]);

  sheet(ss, SHEET_LOG, ['Data', 'Mėnuo', 'Šaltinis', 'Veiksmas', 'Įvertinimas', 'Kanalas', 'Kalba']);

  const st = sheet(ss, SHEET_STATS, []);
  st.clear();
  st.getRange('A1').setValue('Veiksmai per mėnesį').setFontWeight('bold');
  st.getRange('A2').setFormula(
    '=IFERROR(QUERY(Veikla!A:G,"select B, count(A) where A is not null group by B pivot D order by B desc",1),"Kol kas duomenų nėra")');
  st.getRange('I1').setValue('Vidutinis įvertinimas').setFontWeight('bold');
  st.getRange('I2').setFormula(
    '=IFERROR(QUERY(Veikla!A:G,"select B, avg(E), count(E) where D = \'Įvertinimai\' group by B order by B desc label avg(E) \'Vidurkis\', count(E) \'Kiek\' format avg(E) \'0.0\'",1),"")');
  st.getRange('M1').setValue('Pagal šaltinį (kortelė, QR, SMS, darbuotojas)').setFontWeight('bold');
  st.getRange('M2').setFormula(
    '=IFERROR(QUERY(Veikla!A:G,"select C, count(A) where A is not null group by C pivot D",1),"")');
}

function sheet(ss, name, headers) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
