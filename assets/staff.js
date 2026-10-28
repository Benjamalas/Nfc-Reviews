// Darbuotojų puslapis: atsiliepimo prašymas per SMS, el. paštą arba QR.
var $ = function (id) { return document.getElementById(id); };
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
var textEdited = false;

function staffCode() {
  var s = $('staff').value;
  return s ? '-' + slug(s) : '';
}

function link(channel) {
  return reviewUrl(channel + staffCode());
}

function message(channel) {
  var name = $('cname').value.trim();
  var template = cfg.smsText || 'Sveiki{vardas}! Būsime dėkingi, jei įvertinsite mus: {nuoroda}';
  return template.replace('{vardas}', name ? ', ' + name : '').replace('{nuoroda}', link(channel));
}

// 8 600 12345 / 600 12345 / 370... -> +37060012345
function normalizePhone(raw) {
  var p = raw.replace(/[\s\-().]/g, '');
  if (/^8\d{8}$/.test(p)) return '+370' + p.slice(1);
  if (/^6\d{7}$/.test(p)) return '+370' + p;
  if (/^370\d{8}$/.test(p)) return '+' + p;
  return p;
}

function fail(text) {
  $('error').textContent = text;
  $('error').hidden = !text;
  $('ok').hidden = true;
}

function done(channel, text) {
  fail('');
  $('ok').textContent = text;
  $('ok').hidden = false;
  send({ type: 'request', source: channel + staffCode(), channel: channel }, true);
}

function refreshText() {
  if (!textEdited) $('text').value = message('sms');
}

function sendSms() {
  var to = $('to').value.trim();
  if (!to || to.indexOf('@') >= 0) return fail('Įveskite telefono numerį.');
  var body = encodeURIComponent($('text').value);
  done('sms', 'Atidaroma SMS programėlė…');
  location.href = 'sms:' + normalizePhone(to) + (isIOS ? '&' : '?') + 'body=' + body;
}

function sendEmail() {
  var to = $('to').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(to)) return fail('Įveskite el. pašto adresą.');
  var body = $('text').value.split(link('sms')).join(link('email'));
  var subject = 'Kaip mums sekėsi? – ' + (cfg.businessName || '');
  done('email', 'Atidaromas el. paštas…');
  location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}

function showQr() {
  var qr = qrcode(0, 'M');
  qr.addData(link('qr'));
  qr.make();
  $('qr-code').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  $('qr-box').hidden = false;
  $('qr-box').scrollIntoView({ behavior: 'smooth' });
  done('qr', 'QR kodas parodytas.');
}

function copyLink() {
  var url = link('nuoroda');
  var ok = function () { done('nuoroda', 'Nuoroda nukopijuota: ' + url); };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, function () { prompt('Nukopijuokite:', url); });
  else prompt('Nukopijuokite:', url);
}

function init() {
  var staff = cfg.staff || [];
  if (staff.length) {
    $('staff-wrap').hidden = false;
    $('staff').innerHTML = '<option value="">—</option>' + staff.map(function (s) {
      return '<option>' + s.replace(/[<>&"]/g, '') + '</option>';
    }).join('');
    $('staff').value = store('staff') || '';
  }
  $('staff').addEventListener('change', function () { store('staff', $('staff').value); textEdited = false; refreshText(); });
  $('cname').addEventListener('input', refreshText);
  $('text').addEventListener('input', function () { textEdited = true; });
  $('sms').addEventListener('click', sendSms);
  $('email').addEventListener('click', sendEmail);
  $('qr').addEventListener('click', showQr);
  $('copy').addEventListener('click', copyLink);
  refreshText();
}

init();
