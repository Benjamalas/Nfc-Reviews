// Atsiliepimų puslapis: žvaigždutės -> Google (geras) arba privatus atsiliepimas (blogas).
var TEXT = {
  lt: {
    rateTitle: 'Kaip mums sekėsi?',
    rateSub: 'Įvertinkite apsilankymą – tai užtruks vos kelias sekundes.',
    stars: ['Labai blogai', 'Blogai', 'Vidutiniškai', 'Gerai', 'Puikiai!'],
    goodTitle: 'Ačiū! Atidarome Google…',
    goodText: 'Jei langas neatsidarė, spauskite mygtuką.',
    googleBtn: 'Rašyti atsiliepimą Google',
    change: 'Pakeisti įvertinimą',
    badTitle: 'Kaip galėtume pagerėti?',
    badText: 'Papasakokite, kas jums nepatiko. Kiekvieną atsiliepimą skaitome ir stengiamės padėti.',
    private: 'Šis atsiliepimas privatus – jį gaus tik parduotuvės savininkas.',
    msgLabel: 'Jūsų atsiliepimas',
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
    stars: ['Very bad', 'Bad', 'Okay', 'Good', 'Excellent!'],
    goodTitle: 'Thank you! Opening Google…',
    goodText: 'If it did not open, tap the button.',
    googleBtn: 'Write a Google review',
    change: 'Change rating',
    badTitle: 'How can we improve?',
    badText: 'Tell us what you did not like. We read every review and want to help.',
    private: 'This review is private – only the shop owner will see it.',
    msgLabel: 'Your review',
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

function show(step) {
  ['rate', 'good', 'bad', 'done'].forEach(function (s) { $('step-' + s).hidden = s !== step; });
  window.scrollTo(0, 0);
}

function label(n) {
  $('star-label').textContent = n ? t('stars')[n - 1] : ' ';
}

function paintStars(n) {
  document.querySelectorAll('.star').forEach(function (s, i) { s.classList.toggle('on', i < n); });
  label(n);
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
    $('mini-stars').innerHTML = [1, 2, 3, 4, 5].map(function (i) {
      return STAR_SVG.replace('<svg', '<svg class="' + (i <= n ? 'on' : '') + '"');
    }).join('');
    show('bad');
  }
}

function validContact(v) {
  return /^\S+@\S+\.\S+$/.test(v) || v.replace(/[^\d]/g, '').length >= 8;
}

function submitForm(e) {
  e.preventDefault();
  var err = $('error');
  var btn = $('form').querySelector('button[type=submit]');
  var message = $('msg').value.trim();
  var contact = $('contact').value.trim();
  err.hidden = true;
  if (message.length < 3) {
    err.textContent = t('errEmpty');
    err.hidden = false;
    return $('msg').focus();
  }
  if (!validContact(contact)) {
    err.textContent = t('errContact');
    err.hidden = false;
    return $('contact').focus();
  }
  btn.disabled = true;
  btn.textContent = t('sending');
  event('feedback', {
    message: message,
    name: $('name').value.trim(),
    contact: contact,
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

  $('google-btn').href = cfg.googleReviewUrl;
  $('google-btn').addEventListener('click', goGoogle);
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
