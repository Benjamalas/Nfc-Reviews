// Atsiliepimų puslapis: žvaigždutės -> Google (geras) arba privati forma (blogas).
var TEXT = {
  lt: {
    rateTitle: 'Kaip mums sekėsi?',
    rateSub: 'Paspauskite žvaigždutę – tai užtruks 5 sekundes.',
    bad: 'Blogai', great: 'Puikiai',
    goodTitle: 'Ačiū! Atidarome Google…',
    goodText: 'Jei langas neatsidarė, spauskite mygtuką.',
    goodTip: 'Patarimas: paminėkite, ką taisėme ar pirkome.',
    googleBtn: 'Rašyti atsiliepimą Google',
    change: 'Pakeisti įvertinimą',
    badTitle: 'Atsiprašome, kad nepavyko',
    badText: 'Parašykite, kas nutiko – norime tai ištaisyti.',
    msgLabel: 'Kas nutiko?',
    nameLabel: 'Vardas', contactLabel: 'Telefonas arba el. paštas', optional: '(neprivaloma)',
    send: 'Siųsti savininkui',
    sending: 'Siunčiama…',
    errEmpty: 'Parašykite bent kelis žodžius.',
    errNet: 'Nepavyko išsiųsti. Patikrinkite internetą ir bandykite dar kartą.',
    publicNote: 'Norite palikti viešą atsiliepimą?',
    publicLink: 'Rašyti Google',
    doneTitle: 'Ačiū, gavome jūsų žinutę'
  },
  en: {
    rateTitle: 'How did we do?',
    rateSub: 'Tap a star – it takes 5 seconds.',
    bad: 'Bad', great: 'Great',
    goodTitle: 'Thank you! Opening Google…',
    goodText: 'If it did not open, tap the button.',
    goodTip: 'Tip: mention what we repaired or what you bought.',
    googleBtn: 'Write a Google review',
    change: 'Change rating',
    badTitle: 'We are sorry it did not go well',
    badText: 'Tell us what happened – we want to make it right.',
    msgLabel: 'What happened?',
    nameLabel: 'Name', contactLabel: 'Phone or email', optional: '(optional)',
    send: 'Send to the owner',
    sending: 'Sending…',
    errEmpty: 'Please write at least a few words.',
    errNet: 'Could not send. Check your connection and try again.',
    publicNote: 'Want to leave a public review?',
    publicLink: 'Write on Google',
    doneTitle: 'Thank you, we got your message'
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
  document.querySelectorAll('.star').forEach(function (s, i) {
    s.setAttribute('aria-label', (i + 1) + ' / 5');
  });
}

function show(step) {
  ['rate', 'good', 'bad', 'done'].forEach(function (s) { $('step-' + s).hidden = s !== step; });
}

function paintStars(n) {
  document.querySelectorAll('.star').forEach(function (s, i) { s.classList.toggle('on', i < n); });
}

function goGoogle(e) {
  if (e) e.preventDefault();
  event('google', {}, true);
  location.href = cfg.googleReviewUrl;
}

function rate(n) {
  rating = n;
  paintStars(n);
  if (n >= (cfg.goodFrom || 4)) {
    // Geras įvertinimas – iškart į Google rašymo langą.
    event('rating', {}, true);
    show('good');
    goGoogle();
  } else {
    event('rating');
    show('bad');
    $('msg').focus();
  }
}

function submitForm(e) {
  e.preventDefault();
  var form = $('form');
  var err = $('error');
  var btn = form.querySelector('button[type=submit]');
  var message = $('msg').value.trim();
  err.hidden = true;
  if (message.length < 3) {
    err.textContent = t('errEmpty');
    err.hidden = false;
    return;
  }
  btn.disabled = true;
  btn.textContent = t('sending');
  event('feedback', {
    message: message,
    name: $('name').value.trim(),
    contact: $('contact').value.trim(),
    website: $('website').value
  }).then(function () {
    show('done');
  }).catch(function () {
    err.textContent = t('errNet');
    err.hidden = false;
  }).then(function () {
    btn.disabled = false;
    btn.textContent = t('send');
  });
}

function init() {
  $('biz').textContent = cfg.businessName || '';
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

  $('google-btn').href = cfg.googleReviewUrl;
  $('google-small').href = cfg.googleReviewUrl;
  $('google-btn').addEventListener('click', goGoogle);
  $('google-small').addEventListener('click', goGoogle);
  $('form').addEventListener('submit', submitForm);
  document.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () { show('rate'); });
  });
  $('lang').addEventListener('click', function () {
    lang = lang === 'lt' ? 'en' : 'lt';
    store('lang', lang);
    applyLang();
  });

  applyLang();
  event('visit', {}, true);
}

init();
