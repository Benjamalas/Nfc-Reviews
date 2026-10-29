/**
 * Atsiliepimų sistemos backend'as (Google Apps Script + Google Sheet).
 * Įdiegimas: žr. README.md. Po kiekvieno kodo pakeitimo paleiskite setup()
 * ir Deploy → Manage deployments → Edit → New version.
 */

// ---------- Nustatymai ----------
const BUSINESS_NAME = 'KGF parduotuvė';
const REVIEW_URL = 'https://benjamalas.github.io/Nfc-Reviews/kgf/';
const NOTIFY_EMAILS = [];            // kam siųsti pranešimus; tuščia = skripto savininkui
const TZ = 'Europe/Vilnius';
const DELAY_MINUTES = 60;            // po kiek laiko nuo įrašymo siųsti prašymą
const SEND_FROM_HOUR = 9;            // automatinės žinutės siunčiamos tik nuo 9:00…
const SEND_TO_HOUR = 20;             // …iki 20:00
const DEDUPE_DAYS = 90;              // tam pačiam klientui prašymas ne dažniau nei kas 90 d.
const MAX_PER_DAY = 50;              // daugiausiai automatinių žinučių per dieną
const REMINDER_DAYS = 0;             // priminimas neatidariusiems po N d. (0 = išjungta)

// {vardas} = ", Tomas" arba tuščia, {nuoroda} = asmeninė atsiliepimo nuoroda.
const REQUEST_TEXT = 'Sveiki{vardas}! Ačiū, kad apsilankėte KGF parduotuvėje. Būsime labai dėkingi, jei skirsite 30 sek. ir įvertinsite mus: {nuoroda}';
const REMINDER_TEXT = 'Sveiki! Primename – būsime labai dėkingi už 30 sek. įvertinimą: {nuoroda}';
const AUTO_REPLY = true;             // padėkoti el. paštu klientui, palikusiam skundą su el. paštu
const AUTO_REPLY_TEXT = 'Ačiū, kad parašėte. Gavome jūsų žinutę – savininkas susisieks per 24 val.\n\n' + BUSINESS_NAME;

// SMS siunčiamos per „SMS Gateway for Android“ (sms-gate.app) iš parduotuvės telefono.
// Prisijungimą įrašykite į Project Settings → Script properties: SMS_USER ir SMS_PASS
// (ne į kodą – repozitorija vieša).
const SMS_API = 'https://api.sms-gate.app/3rdparty/v1/messages';

const SHEET_FEEDBACK = 'Atsiliepimai';
const SHEET_LOG = 'Veikla';
const SHEET_STATS = 'Statistika';
const SHEET_QUEUE = 'SMS eilė';
const STATUSES = ['Naujas', 'Sprendžiama', 'Išspręsta'];

// SMS eilės stulpeliai (nuo 0). Ranka pildomi tik pirmi du.
const Q = { to: 0, name: 1, status: 2, sendAt: 3, sentAt: 4, opened: 5, rated: 6, reminder: 7,
            channel: 8, created: 9, id: 10, link: 11, text: 12, error: 13 };
const Q_HEADERS = ['Telefonas / el. paštas', 'Vardas', 'Būsena', 'Siųsti', 'Išsiųsta', 'Atidarė', 'Įvertino',
                   'Priminimas', 'Kanalas', 'Sukurta', 'ID', 'Nuoroda', 'Žinutė', 'Klaida'];

// Įvykių kodai iš puslapio -> pavadinimai lentelėje.
const TYPES = {
  visit: 'Apsilankymai',
  rating: 'Įvertinimai',
  google: 'Paspaudė Google',
  feedback: 'Privatūs atsiliepimai',
  request: 'Išsiųsti prašymai'
};

// ---------- Web app ----------

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
  const rating = Number(d.rating) >= 1 && Number(d.rating) <= 5 ? Number(d.rating) : '';
  const ss = SpreadsheetApp.getActive();

  withLock(() => {
    log(ss, now, d.source, d.type, rating, d.channel, d.lang);
    if (d.type === 'feedback') {
      ss.getSheetByName(SHEET_FEEDBACK).appendRow([
        now, rating, clean(d.message, 2000), clean(d.name, 100), clean(d.contact, 100),
        clean(d.source, 40), STATUSES[0], ''
      ]);
    }
    markRequest(ss, d.ref, d.type, rating, now);
  });

  if (d.type === 'feedback') {
    notify(d, rating, ss);
    autoReply(d);
  }
  return json({ ok: true });
}

// Atidarius URL naršyklėje – patikrinimas, kad skriptas veikia.
function doGet() {
  return ContentService.createTextOutput('OK – atsiliepimų sistema veikia.');
}

// ---------- Automatiniai prašymai (SMS / el. paštas) ----------

/**
 * Paleidžiama kas 10 min. (trigeris). Nauji įrašai „SMS eilė“ lape (užtenka telefono
 * ar el. pašto) paruošiami ir išsiunčiami nustatytu laiku; siunčiami ir priminimai.
 */
function processQueue() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_QUEUE);
  if (!sh) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const now = new Date();
    const rows = rowsOf(sh);
    rows.forEach((r, i) => prepare(sh, rows, r, i, now));
    if (inWindow(now)) sendDue(ss, sh, rows, now);
  } finally {
    lock.releaseLock();
  }
}

// Naujai įrašytą eilutę papildo: ID, nuoroda, žinutė, siuntimo laikas.
function prepare(sh, rows, r, i, now) {
  if (r[Q.status] || r[Q.to] === '') return;
  const row = i + 2;
  const to = normalizeTo(r[Q.to]);
  if (!to) {
    r[Q.status] = 'Klaida';
    r[Q.error] = 'Neteisingas telefonas ar el. paštas';
  } else if (recentlySent(rows, i, to, now)) {
    r[Q.status] = 'Praleista';
    r[Q.error] = 'Šiam klientui jau siųsta per ' + DEDUPE_DAYS + ' d.';
  } else {
    const channel = to.indexOf('@') > 0 ? 'email' : 'sms';
    const id = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    const link = REVIEW_URL + '?s=' + channel + '&r=' + id;
    const name = String(r[Q.name] || '').trim();
    r[Q.to] = to;
    r[Q.status] = 'Laukia';
    r[Q.sendAt] = r[Q.sendAt] instanceof Date ? r[Q.sendAt] : allowedTime(new Date(now.getTime() + DELAY_MINUTES * 60000));
    r[Q.channel] = channel;
    r[Q.created] = now;
    r[Q.id] = id;
    r[Q.link] = link;
    r[Q.text] = REQUEST_TEXT.replace('{vardas}', name ? ', ' + name : '').replace('{nuoroda}', link);
    r[Q.error] = '';
  }
  sh.getRange(row, 1, 1, Q_HEADERS.length).setValues([r.slice(0, Q_HEADERS.length).map(v => typeof v === 'string' ? clean(v, 600) : v)]);
}

function sendDue(ss, sh, rows, now) {
  const today = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  let sentToday = rows.filter(r => r[Q.sentAt] instanceof Date &&
    Utilities.formatDate(r[Q.sentAt], TZ, 'yyyy-MM-dd') === today).length;

  rows.forEach((r, i) => {
    if (sentToday >= MAX_PER_DAY) return;
    let text = '';
    let field = -1;
    if (r[Q.status] === 'Laukia' && r[Q.sendAt] instanceof Date && r[Q.sendAt] <= now) {
      text = r[Q.text];
      field = Q.sentAt;
    } else if (REMINDER_DAYS > 0 && r[Q.status] === 'Išsiųsta' && !r[Q.opened] && !r[Q.reminder] &&
               r[Q.sentAt] instanceof Date && now - r[Q.sentAt] >= REMINDER_DAYS * 864e5) {
      text = REMINDER_TEXT.replace('{nuoroda}', r[Q.link]);
      field = Q.reminder;
    }
    if (!text) return;

    const row = i + 2;
    try {
      deliver(r[Q.channel], String(r[Q.to]), String(text));
      sh.getRange(row, field + 1).setValue(now);
      sh.getRange(row, Q.error + 1).setValue('');
      if (field === Q.sentAt) {
        sh.getRange(row, Q.status + 1).setValue('Išsiųsta');
        log(ss, now, r[Q.channel], 'request', '', r[Q.channel], '');
      }
      sentToday++;
    } catch (err) {
      const msg = String(err.message || err).slice(0, 200);
      sh.getRange(row, Q.error + 1).setValue(msg);
      // Jei SMS dar neprijungtos – paliekame eilėje, išsiųs kai bus sukonfigūruota.
      if (field === Q.sentAt && msg.indexOf('nesukonfigūruot') < 0) sh.getRange(row, Q.status + 1).setValue('Klaida');
    }
  });
}

function deliver(channel, to, text) {
  if (channel === 'email') {
    MailApp.sendEmail(to, 'Kaip mums sekėsi? – ' + BUSINESS_NAME, text, { name: BUSINESS_NAME });
    return;
  }
  const props = PropertiesService.getScriptProperties();
  const user = props.getProperty('SMS_USER');
  const pass = props.getProperty('SMS_PASS');
  if (!user || !pass) throw new Error('SMS nesukonfigūruotos (trūksta SMS_USER / SMS_PASS)');
  const res = UrlFetchApp.fetch(SMS_API, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(user + ':' + pass) },
    payload: JSON.stringify({ textMessage: { text: text }, phoneNumbers: [to] }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('SMS klaida ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 150));
  }
}

// Kai klientas atidaro nuorodą ar įvertina – pažymime SMS eilėje.
function markRequest(ss, ref, type, rating, now) {
  ref = String(ref || '').replace(/[^a-z0-9]/gi, '');
  if (!ref || (type !== 'visit' && type !== 'rating')) return;
  const sh = ss.getSheetByName(SHEET_QUEUE);
  if (!sh) return;
  const col = String.fromCharCode(65 + Q.id);
  const cell = sh.getRange(col + ':' + col).createTextFinder(ref).matchEntireCell(true).findNext();
  if (!cell) return;
  const row = cell.getRow();
  if (type === 'visit' && !sh.getRange(row, Q.opened + 1).getValue()) sh.getRange(row, Q.opened + 1).setValue(now);
  if (type === 'rating' && rating) sh.getRange(row, Q.rated + 1).setValue(rating);
}

function recentlySent(rows, self, to, now) {
  const since = now.getTime() - DEDUPE_DAYS * 864e5;
  return rows.some((r, i) => i !== self && String(r[Q.to]) === to && r[Q.created] instanceof Date &&
    r[Q.created].getTime() > since && (r[Q.status] === 'Laukia' || r[Q.status] === 'Išsiųsta'));
}

// Telefono numeris (+370…) arba el. paštas; kitaip – tuščia.
function normalizeTo(raw) {
  const s = String(raw === undefined || raw === null ? '' : raw).trim();
  if (/^\S+@\S+\.\S+$/.test(s)) return s.slice(0, 100);
  let p = s.replace(/[\s\-().]/g, '');
  if (/^8\d{8}$/.test(p)) p = '+370' + p.slice(1);
  else if (/^6\d{7}$/.test(p)) p = '+370' + p;
  else if (/^370\d{8}$/.test(p)) p = '+' + p;
  return /^\+\d{8,15}$/.test(p) ? p : '';
}

function inWindow(date) {
  const h = Number(Utilities.formatDate(date, TZ, 'H'));
  return h >= SEND_FROM_HOUR && h < SEND_TO_HOUR;
}

// Jei laikas patenka į naktį – perkelia į artimiausią leistiną laiką.
function allowedTime(date) {
  let d = new Date(date.getTime());
  for (let i = 0; i < 200 && !inWindow(d); i++) d = new Date(d.getTime() + 10 * 60000);
  return d;
}

// ---------- Pranešimai savininkui ir klientui ----------

function notifyTo() {
  return (NOTIFY_EMAILS.length ? NOTIFY_EMAILS : [Session.getEffectiveUser().getEmail()]).join(',');
}

function notify(d, rating, ss) {
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
  MailApp.sendEmail(notifyTo(), '⚠️ Naujas privatus atsiliepimas (' + (rating || '?') + '★)', lines.join('\n'), options);
}

// Automatinis „gavome jūsų žinutę“ klientui (tik el. paštu, ribotas kiekis).
function autoReply(d) {
  const contact = String(d.contact || '').trim();
  if (!AUTO_REPLY || !/^\S+@\S+\.\S+$/.test(contact)) return;
  const cache = CacheService.getScriptCache();
  const sent = Number(cache.get('auto-replies') || 0);
  if (sent >= 20) return;
  cache.put('auto-replies', String(sent + 1), 21600);
  try {
    MailApp.sendEmail(contact, 'Gavome jūsų žinutę – ' + BUSINESS_NAME, AUTO_REPLY_TEXT, { name: BUSINESS_NAME });
  } catch (err) {
    console.error(err);
  }
}

/** Kasdien 9:00 (trigeris): primena apie neatsakytus skundus ir neišsiųstas žinutes. */
function dailyDigest() {
  const ss = SpreadsheetApp.getActive();
  const now = Date.now();
  const lines = [];

  const open = rowsOf(ss.getSheetByName(SHEET_FEEDBACK))
    .filter(r => r[6] === STATUSES[0] && r[0] instanceof Date && now - r[0].getTime() > 864e5);
  if (open.length) {
    lines.push('Neatsakyti skundai (senesni nei 24 val.): ' + open.length);
    open.forEach(r => lines.push('• ' + Utilities.formatDate(r[0], TZ, 'MM-dd HH:mm') + ', ' + (r[1] || '?') + '★, ' +
      (r[3] || 'be vardo') + ' ' + (r[4] || '') + ': ' + String(r[2]).slice(0, 120)));
    lines.push('Pakeiskite būseną į „Išspręsta“, kai susisieksite.', '');
  }

  const queue = ss.getSheetByName(SHEET_QUEUE);
  const failed = (queue ? rowsOf(queue) : []).filter(r => r[Q.error] && r[Q.status] !== 'Praleista');
  if (failed.length) lines.push('Neišsiųstų žinučių: ' + failed.length + ' (' + failed[0][Q.error] + ')', '');

  if (!lines.length) return;
  lines.push('Lentelė: ' + ss.getUrl());
  MailApp.sendEmail(notifyTo(), '⏰ ' + BUSINESS_NAME + ': laukia jūsų dėmesio', lines.join('\n'), { name: 'Atsiliepimai' });
}

/** Kiekvieną pirmadienį 9:00 (trigeris): savaitės ataskaita. */
function weeklyReport() {
  const ss = SpreadsheetApp.getActive();
  const since = Date.now() - 7 * 864e5;
  const rows = rowsOf(ss.getSheetByName(SHEET_LOG))
    .filter(r => r[0] instanceof Date && r[0].getTime() >= since && String(r[2]).indexOf('test') !== 0);
  const count = label => rows.filter(r => r[3] === label).length;
  const ratings = rows.filter(r => r[3] === TYPES.rating && r[4]);
  const avg = ratings.length ? (ratings.reduce((s, r) => s + Number(r[4]), 0) / ratings.length).toFixed(1) : '—';
  const open = rowsOf(ss.getSheetByName(SHEET_FEEDBACK)).filter(r => r[6] && r[6] !== STATUSES[2]).length;

  const lines = [
    'Paskutinės 7 dienos:',
    '• Išsiųsta prašymų: ' + count(TYPES.request),
    '• Atidarė puslapį: ' + count(TYPES.visit),
    '• Įvertino: ' + ratings.length + ' (vidurkis ' + avg + ' ★)',
    '• Nukreipta į Google: ' + count(TYPES.google),
    '• Privačių skundų: ' + count(TYPES.feedback),
    '',
    'Neišspręstų skundų iš viso: ' + open,
    '',
    'Lentelė: ' + ss.getUrl()
  ];
  MailApp.sendEmail(notifyTo(), '📊 ' + BUSINESS_NAME + ': savaitės ataskaita', lines.join('\n'), { name: 'Atsiliepimai' });
}

// ---------- Pagalbinės ----------

function log(ss, now, source, type, rating, channel, lang) {
  ss.getSheetByName(SHEET_LOG).appendRow([
    now, "'" + Utilities.formatDate(now, TZ, 'yyyy-MM'), clean(source, 40), TYPES[type], rating,
    clean(channel, 20), clean(lang, 5)
  ]);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function rowsOf(sh) {
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
}

// Apriboja ilgį ir neleidžia tekstui virsti formule lentelėje.
function clean(value, max) {
  const s = String(value || '').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Įdiegimas ----------

/** Paleiskite po kiekvieno kodo atnaujinimo: sukuria lapus, statistiką ir automatinius trigerius. */
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

  // Senos struktūros eilę pervadiname, kad nesusimaišytų stulpeliai.
  const old = ss.getSheetByName(SHEET_QUEUE);
  if (old && old.getRange('A1').getValue() !== Q_HEADERS[0]) old.setName(SHEET_QUEUE + ' (sena)');
  const q = sheet(ss, SHEET_QUEUE, Q_HEADERS);
  q.setColumnWidth(1, 190);
  q.getRange('A2:A1000').setNumberFormat('@');
  q.getRange('A1').setNote('Įrašykite kliento telefoną (8 600 12345) arba el. paštą, vardas – neprivalomas. ' +
    'Sistema pati išsiųs atsiliepimo prašymą po ~' + DELAY_MINUTES + ' min. (tik ' + SEND_FROM_HOUR + '–' + SEND_TO_HOUR + ' val.).');
  q.getRange(1, 1, 1, 2).setBackground('#fff3c4');

  // Statistika (testiniai įrašai su šaltiniu „test…“ neįskaičiuojami).
  const st = sheet(ss, SHEET_STATS, []);
  st.clear();
  st.getRange('A1').setValue('Veiksmai per mėnesį').setFontWeight('bold');
  st.getRange('A2').setFormula(
    '=IFERROR(QUERY(Veikla!A:G,"select B, count(A) where A is not null and not C starts with \'test\' group by B pivot D order by B desc",1),"Kol kas duomenų nėra")');
  st.getRange('I1').setValue('Vidutinis įvertinimas').setFontWeight('bold');
  st.getRange('I2').setFormula(
    '=IFERROR(QUERY(Veikla!A:G,"select B, avg(E), count(E) where D = \'Įvertinimai\' and not C starts with \'test\' group by B order by B desc label avg(E) \'Vidurkis\', count(E) \'Kiek\' format avg(E) \'0.0\'",1),"")');
  st.getRange('M1').setValue('Pagal šaltinį (kortelė, QR, SMS)').setFontWeight('bold');
  st.getRange('M2').setFormula(
    '=IFERROR(QUERY(Veikla!A:G,"select C, count(A) where A is not null and not C starts with \'test\' group by C pivot D",1),"")');

  // Automatiniai darbai.
  const handlers = ['processQueue', 'dailyDigest', 'weeklyReport'];
  ScriptApp.getProjectTriggers()
    .filter(t => handlers.indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processQueue').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(9).inTimezone(TZ).create();
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone(TZ).create();

  const sms = PropertiesService.getScriptProperties().getProperty('SMS_USER')
    ? 'prijungtos' : 'NEPRIJUNGTOS – įrašykite SMS_USER ir SMS_PASS (žr. README)';
  Logger.log('Paruošta. SMS: ' + sms + '.');
}

function sheet(ss, name, headers) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
