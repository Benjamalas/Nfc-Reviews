// Atsiliepimų puslapis: žvaigždutės -> Google (geras) arba privatus atsiliepimas (blogas).
var TEXT = {
  lt: {
    rateTitle: 'Kaip mums sekėsi?',
    rateSub: 'Įvertinkite apsilankymą – tai užtruks vos kelias sekundes.',
    tapHint: 'Pasirinkite nuo 1 iki 5 žvaigždučių',
    stars: ['😞 Labai blogai', '😕 Blogai', '😐 Vidutiniškai', '🙂 Gerai', '🤩 Puikiai!'],
    badTitle: 'Padėkite mums tobulėti',
    badText: 'Papasakokite, kas jums nepatiko. Kiekvieną atsiliepimą skaitome ir stengiamės padėti.',
    msgLabel: 'Jūsų pastebėjimai',
    contactLabel: 'Telefonas arba el. paštas',
    contactHint: 'Kad galėtume su jumis susisiekti ir padėti.',
    nameLabel: 'Vardas', optional: '(neprivaloma)',
    send: 'Palikti atsiliepimą',
    sending: 'Siunčiama…',
    errEmpty: 'Parašykite bent kelis žodžius.',
    errContact: 'Įveskite telefono numerį arba el. paštą, kad galėtume susisiekti.',
    errNet: 'Nepavyko išsiųsti. Patikrinkite internetą ir bandykite dar kartą.',
    doneTitle: 'Ačiū už atsiliepimą!'
  },
  en: {
    rateTitle: 'How did we do?',
    rateSub: 'Rate your visit – it only takes a few seconds.',
    tapHint: 'Choose 1 to 5 stars',
    stars: ['😞 Very bad', '😕 Bad', '😐 Okay', '🙂 Good', '🤩 Excellent!'],
    badTitle: 'Help us improve',
    badText: 'Tell us what you did not like. We read every review and want to help.',
    msgLabel: 'Your comments',
    contactLabel: 'Phone or email',
    contactHint: 'So we can get in touch and help.',
    nameLabel: 'Name', optional: '(optional)',
    send: 'Leave a review',
    sending: 'Sending…',
    errEmpty: 'Please write at least a few words.',
    errContact: 'Please enter a phone number or email so we can get in touch.',
    errNet: 'Could not send. Check your connection and try again.',
    doneTitle: 'Thank you for your review!'
  }
};

var STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95z"/></svg>';

var params = new URLSearchParams(location.search);
var source = slug(params.get('s')) || 'tiesiogiai';
var ref = (params.get('r') || '').replace(/[^a-z0-9]/gi, '').slice(0, 12); // SMS prašymo ID
var lang = store('lang') || (/^lt\b/i.test(navigator.language || 'lt') ? 'lt' : 'en');
var rating = 0;

var $ = function (id) { return document.getElementById(id); };
var t = function (key) { return TEXT[lang][key]; };

function event(type, extra, beacon) {
  var data = { type: type, source: source, ref: ref, lang: lang, rating: rating || '' };
  for (var k in extra) data[k] = extra[k];
  return send(data, beacon);
}

function applyLang() {
  document.documentElement.lang = lang;
  $('lang').textContent = lang === 'lt' ? 'EN' : 'LT';
  document.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = t(el.dataset.t); });
  $('promise').textContent = (cfg.replyPromise || {})[lang] || '';
  document.querySelectorAll('.star').forEach(function (s, i) { s.setAttribute('aria-label', t('stars')[i]); });
  label(rating);
}

// Atsiliepimo burbulas iššoka iš po žvaigždučių kortelės.
function showForm() {
  var card = $('form-card');
  if (!card.hidden) return;
  card.hidden = false;
  setTimeout(function () { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 250);
}

function showDone() {
  $('rate-card').hidden = true;
  $('form-card').hidden = true;
  $('done-card').hidden = false;
  window.scrollTo(0, 0);
}

function label(n) {
  var el = $('star-label');
  el.textContent = n ? t('stars')[n - 1] : t('tapHint');
  el.dataset.level = n || '';
}

function paintStars(n) {
  document.querySelectorAll('.star').forEach(function (s, i) { s.classList.toggle('on', i < n); });
  label(n);
}

function goGoogle() {
  event('google', {}, true);
  location.href = cfg.googleReviewUrl;
}

function rate(n) {
  rating = n;
  paintStars(n);
  var star = document.querySelectorAll('.star')[n - 1];
  star.classList.remove('pop');
  void star.offsetWidth; // iš naujo paleidžia animaciją
  star.classList.add('pop');
  if (n >= (cfg.goodFrom || 4)) {
    // Geras įvertinimas – iškart į Google rašymo langą, be jokio tarpinio ekrano.
    event('rating', {}, true);
    goGoogle();
  } else {
    event('rating');
    showForm();
  }
}

function markInvalid(id, on) {
  $(id).parentNode.classList.toggle('invalid', on);
}

function validContact(v) {
  return /^\S+@\S+\.\S+$/.test(v) || v.replace(/[^\d]/g, '').length >= 8;
}

function submitForm(e) {
  e.preventDefault();
  var err = $('error');
  var btn = $('form').querySelector('button[type=submit] span');
  var message = $('msg').value.trim();
  var contact = $('contact').value.trim();
  err.hidden = true;
  markInvalid('msg', false);
  markInvalid('contact', false);
  if (message.length < 3) {
    markInvalid('msg', true);
    err.textContent = t('errEmpty');
    err.hidden = false;
    return $('msg').focus();
  }
  if (!validContact(contact)) {
    markInvalid('contact', true);
    err.textContent = t('errContact');
    err.hidden = false;
    return $('contact').focus();
  }
  btn.parentNode.disabled = true;
  btn.textContent = t('sending');
  event('feedback', {
    message: message,
    name: $('name').value.trim(),
    contact: contact,
    website: $('website').value
  }).then(function () {
    showDone();
  }).catch(function () {
    err.textContent = t('errNet');
    err.hidden = false;
  }).then(function () {
    btn.parentNode.disabled = false;
    btn.textContent = t('send');
  });
}

function init() {
  $('biz').textContent = cfg.businessName || '';
  $('tagline').textContent = cfg.tagline || '';
  $('foot').textContent = [cfg.businessName, cfg.city].filter(Boolean).join(' · ');
  document.title = (cfg.businessName ? cfg.businessName + ' – ' : '') + 'atsiliepimas';
  if (cfg.logo) {
    var img = document.createElement('img');
    img.src = cfg.logo;
    img.alt = cfg.businessName || '';
    $('logo').appendChild(img);
  } else {
    $('logo').textContent = cfg.logoText || (cfg.businessName || '?').slice(0, 3);
  }

  var stars = $('stars');
  for (var i = 1; i <= 5; i++) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'star';
    b.innerHTML = STAR_SVG;
    b.addEventListener('click', rate.bind(null, i));
    b.addEventListener('mouseenter', paintStars.bind(null, i));
    stars.appendChild(b);
  }
  stars.addEventListener('mouseleave', function () { paintStars(rating); });

  $('form').addEventListener('submit', submitForm);
  $('lang').addEventListener('click', function () {
    lang = lang === 'lt' ? 'en' : 'lt';
    store('lang', lang);
    applyLang();
  });

  applyLang();
  event('visit', {}, true);
}

init();
