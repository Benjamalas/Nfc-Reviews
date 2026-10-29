// Darbuotojų puslapis: atsiliepimo prašymas automatiškai (per sistemą), per savo telefoną arba QR.
var $ = function (id) { return document.getElementById(id); };
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
var textEdited = false;
var ref = newRef();

var ERRORS = {
  pin: 'Neteisingas PIN.',
  locked: 'Per daug neteisingų PIN bandymų. Palaukite valandą.',
  to: 'Neteisingas telefonas ar el. paštas.',
  recent: 'Šiam klientui prašymas jau siųstas neseniai – antrą kartą nesiunčiame.',
  setup: 'Sistema neatnaujinta – Apps Script paleiskite setup().'
};

// Unikalus prašymo ID: pagal jį sistema mato, ar klientas atidarė nuorodą.
function newRef() {
  return Math.random().toString(36).slice(2, 8);
}

function staffCode() {
  var s = $('staff').value;
  return s ? '-' + slug(s) : '';
}

function isEmail(v) {
  return /^\S+@\S+\.\S+$/.test(v);
}

function channel() {
  return isEmail($('to').value.trim()) ? 'email' : 'sms';
}

function link(source, withRef) {
  return reviewUrl(source + staffCode()) + (withRef ? '&r=' + ref : '');
}

function message() {
  var name = $('cname').value.trim();
  var template = cfg.smsText || 'Sveiki{vardas}! Būsime dėkingi, jei įvertinsite mus: {nuoroda}';
  return template.replace('{vardas}', name ? ', ' + name : '').replace('{nuoroda}', link(channel(), true));
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

function ok(text) {
  fail('');
  $('ok').textContent = text;
  $('ok').hidden = false;
}

function refreshText() {
  if (!textEdited) $('text').value = message();
}

function target() {
  var to = $('to').value.trim();
  if (isEmail(to)) return to;
  var phone = normalizePhone(to);
  return /^\+\d{8,15}$/.test(phone) ? phone : '';
}

function resetForm() {
  $('to').value = '';
  $('cname').value = '';
  ref = newRef();
  textEdited = false;
  refreshText();
}

function autoSend() {
  var to = target();
  var pin = $('pin').value.trim() || store('pin') || '';
  if (!to) return fail('Įveskite teisingą telefoną (pvz. 8 600 12345) arba el. paštą.');
  if (!pin) return fail('Įveskite darbuotojų PIN.');
  if (!cfg.apiUrl) return fail('Sistema neprijungta (config.js → apiUrl).');

  var btn = $('auto');
  btn.disabled = true;
  api({
    type: 'queue', pin: pin, to: to, name: $('cname').value.trim(), staff: $('staff').value,
    when: $('when').value, text: $('text').value, link: link(channel(), true), ref: ref
  }).then(function (res) {
    if (res.ok) {
      store('pin', pin);
      $('pin-wrap').hidden = true;
      ok('✔ Įtraukta. Bus išsiųsta ' + res.sendAt + '.');
      resetForm();
    } else {
      if (res.error === 'pin') { store('pin', ''); $('pin-wrap').hidden = false; }
      fail(ERRORS[res.error] || 'Klaida: ' + (res.error || 'Apps Script neatnaujintas'));
    }
  }).catch(function () {
    fail('Nepavyko susisiekti su sistema. Patikrinkite internetą.');
  }).then(function () {
    btn.disabled = false;
  });
}

// Atsarginis būdas: atidaro SMS ar el. pašto programėlę šiame telefone.
function manualSend() {
  var to = target();
  if (!to) return fail('Įveskite teisingą telefoną arba el. paštą.');
  var body = encodeURIComponent($('text').value);
  send({ type: 'request', source: channel() + staffCode(), ref: ref, channel: channel() + '-rankinis' }, true);
  if (isEmail(to)) {
    var subject = encodeURIComponent('Kaip mums sekėsi? – ' + (cfg.businessName || ''));
    location.href = 'mailto:' + to + '?subject=' + subject + '&body=' + body;
  } else {
    location.href = 'sms:' + to + (isIOS ? '&' : '?') + 'body=' + body;
  }
  ok('Atidaroma programėlė…');
}

function showQr() {
  var qr = qrcode(0, 'M');
  qr.addData(link('qr'));
  qr.make();
  $('qr-code').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  $('qr-box').hidden = false;
  $('qr-box').scrollIntoView({ behavior: 'smooth' });
  send({ type: 'request', source: 'qr' + staffCode(), channel: 'qr' }, true);
}

function copyLink() {
  var url = link('nuoroda');
  var copied = function () { ok('Nuoroda nukopijuota: ' + url); };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(copied, function () { prompt('Nukopijuokite:', url); });
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
  $('pin-wrap').hidden = !!store('pin');
  $('staff').addEventListener('change', function () { store('staff', $('staff').value); textEdited = false; refreshText(); });
  $('to').addEventListener('input', refreshText);
  $('cname').addEventListener('input', refreshText);
  $('text').addEventListener('input', function () { textEdited = true; });
  $('auto').addEventListener('click', autoSend);
  $('manual').addEventListener('click', manualSend);
  $('qr').addEventListener('click', showQr);
  $('copy').addEventListener('click', copyLink);
  refreshText();
}

init();
