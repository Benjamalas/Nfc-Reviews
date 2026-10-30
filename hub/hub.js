// Statistikos centras: skaito duomenis iš kliento Apps Script ir parodo,
// ar sistema veikia ir ar ji duoda naudos verslui.
var CLIENTS = window.HUB_CLIENTS || [];
var DAY = 864e5;
var GOOD_FROM = 4;
var WEEKDAYS = ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Še', 'Sk'];
var TYPE_LABEL = {
  visit: 'Atidarė puslapį',
  rating: 'Įvertino',
  google: 'Nukreiptas į Google',
  feedback: 'Paliko privatų atsiliepimą',
  request: 'Išsiųstas prašymas'
};
var nf = new Intl.NumberFormat('lt-LT');
var nf1 = new Intl.NumberFormat('lt-LT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

var state = { client: CLIENTS[0], raw: null, days: 30, hideTest: true, demo: /[?&]demo\b/.test(location.search) };
var $ = function (id) { return document.getElementById(id); };

// ---------- Pagalbinės ----------

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) { return null; }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function pct(a, b) { return b ? Math.round(a / b * 100) + ' %' : '—'; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function md(d) { return pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dateTime(d) { return md(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function ago(d, now) {
  var m = Math.round((now - d) / 6e4);
  if (m < 60) return 'prieš ' + Math.max(m, 1) + ' min.';
  if (m < 48 * 60) return 'prieš ' + Math.round(m / 60) + ' val.';
  return 'prieš ' + Math.round(m / 1440) + ' d.';
}

function sourceName(src) {
  var m;
  if ((m = /^nfc(\d+)/.exec(src))) return 'NFC kortelė ' + m[1];
  var names = {
    'qr-stendas': 'QR stendas', 'qr-lipdukas': 'QR lipdukas', qr: 'QR kodas',
    sms: 'SMS prašymas', email: 'El. pašto prašymas', tiesiogiai: 'Tiesioginė nuoroda', nuoroda: 'Nukopijuota nuoroda'
  };
  return names[src] || src || '—';
}

function starsText(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }

function statusClass(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ---------- Duomenys ----------

function parse(raw) {
  var isTest = function (src) { return state.hideTest && /^test/.test(src); };
  return {
    now: new Date(raw.now),
    sheetUrl: raw.sheetUrl,
    smsConnected: raw.smsConnected,
    events: raw.events.filter(function (e) { return !isTest(e[1]); }).map(function (e) {
      return { t: new Date(e[0]), src: e[1], type: e[2], rating: e[3] };
    }).sort(function (a, b) { return a.t - b.t; }),
    feedback: raw.feedback.filter(function (f) { return !isTest(f[5]); }).map(function (f) {
      return { t: new Date(f[0]), rating: f[1], msg: f[2], name: f[3], contact: f[4], src: f[5], status: f[6] };
    }).sort(function (a, b) { return b.t - a.t; }),
    queue: raw.queue.map(function (q) {
      return { t: new Date(q[0]), kind: q[1], channel: q[2], status: q[3], sent: q[4] ? new Date(q[4]) : null,
               opened: q[5] ? new Date(q[5]) : null, rated: q[6], error: q[7] };
    }),
    google: raw.google.map(function (g) { return { t: new Date(g[0]), rating: g[1], count: g[2] }; })
      .sort(function (a, b) { return a.t - b.t; })
  };
}

function range(d) {
  var to = d.now.getTime() + 1;
  var from;
  if (state.days) from = to - state.days * DAY;
  else from = d.events.length ? startOfDay(d.events[0].t).getTime() : to - 30 * DAY;
  return { from: from, to: to, span: to - from };
}

function metrics(d, from, to) {
  var ev = d.events.filter(function (e) { return e.t >= from && e.t < to; });
  var count = function (type) { return ev.filter(function (e) { return e.type === type; }).length; };
  var ratings = ev.filter(function (e) { return e.type === 'rating' && e.rating; });
  var stars = [0, 0, 0, 0, 0];
  ratings.forEach(function (e) { stars[e.rating - 1]++; });
  var sum = ratings.reduce(function (a, e) { return a + e.rating; }, 0);
  var inQ = function (date) { return date && date >= from && date < to; };
  var requests = d.queue.filter(function (q) { return q.kind !== 'Atsakymas į atsiliepimą'; });
  return {
    events: ev,
    visits: count('visit'),
    ratings: ratings.length,
    positive: ratings.filter(function (e) { return e.rating >= GOOD_FROM; }).length,
    negative: ratings.filter(function (e) { return e.rating < GOOD_FROM; }).length,
    google: count('google'),
    privateCount: count('feedback'),
    avg: ratings.length ? sum / ratings.length : 0,
    stars: stars,
    reqSent: requests.filter(function (q) { return inQ(q.sent); }),
    followups: d.queue.filter(function (q) { return q.kind === 'Atsakymas į atsiliepimą' && inQ(q.sent); }).length
  };
}

// ---------- Įkėlimas ----------

function load() {
  $('error-banner').hidden = true;
  if (state.demo) {
    state.raw = demoData();
    return showDash();
  }
  var key = store('hub-key-' + state.client.id);
  if (!key) return showLogin();
  $('refresh').disabled = true;
  fetch(state.client.apiUrl + '?action=stats&days=730&key=' + encodeURIComponent(key))
    .then(function (r) { return r.text(); })
    .then(function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { throw new Error(/^OK/.test(text) ? 'old' : 'bad'); }
      if (!data.ok && data.error === 'key') {
        store('hub-key-' + state.client.id, null);
        return showLogin('Neteisingas raktas.');
      }
      if (!data.ok) throw new Error(data.error || 'bad');
      state.raw = data;
      showDash();
    })
    .catch(function (e) {
      var msg = e.message === 'old'
        ? 'Backend dar senos versijos: įklijuokite naują apps-script/Code.gs, paleiskite setup ir išleiskite naują versiją (Deploy → Manage deployments → Edit → New version).'
        : 'Nepavyko pasiekti backend. Patikrinkite internetą ir bandykite dar kartą.';
      if (!state.raw) return showLogin(msg);
      $('error-banner').textContent = msg;
      $('error-banner').hidden = false;
    })
    .then(function () { $('refresh').disabled = false; });
}

function showLogin(error) {
  $('dash').hidden = true;
  $('controls').hidden = true;
  $('login').hidden = false;
  $('login-error').textContent = error || '';
  $('login-error').hidden = !error;
}

function showDash() {
  $('login').hidden = true;
  $('controls').hidden = false;
  $('dash').hidden = false;
  $('demo-banner').hidden = !state.demo;
  $('logout').hidden = state.demo;
  render();
}

// ---------- Atvaizdavimas ----------

function render() {
  var d = parse(state.raw);
  var r = range(d);
  var m = metrics(d, r.from, r.to);
  var prev = state.days ? metrics(d, r.from - r.span, r.from) : null;

  document.querySelectorAll('#period button').forEach(function (b) {
    b.classList.toggle('on', Number(b.dataset.days) === state.days);
  });
  $('client-name').textContent = (state.raw.business || state.client.name) + (state.demo ? ' · demonstracija' : '');
  $('foot').innerHTML = 'Duomenys atnaujinti ' + dateTime(d.now) +
    (d.sheetUrl && !state.demo ? ' · <a href="' + esc(d.sheetUrl) + '" target="_blank" rel="noopener">Atidaryti Google Sheet</a>' : '') +
    ' · <a href="' + esc(state.client.reviewUrl || '../kgf/') + '" target="_blank" rel="noopener">Atsiliepimų puslapis</a>';

  renderHealth(d);
  renderVerdict(d, m, r);
  renderTiles(d, m, prev);
  renderCharts(d, m, r);
  renderStars(m);
  renderFunnel(m);
  renderSources(m);
  renderRequests(d, m, r);
  renderGoogle(d);
  renderComplaints(d, r);
  renderFeed(d);
}

function icon(level) {
  var sym = { good: '✓', warn: '!', crit: '×', none: '–' }[level];
  return '<span class="ico ' + level + '" aria-hidden="true">' + sym + '</span>';
}

function pill(level, label, value) {
  return '<span class="pill">' + icon(level) + '<span>' + label + ': <b>' + value + '</b></span></span>';
}

function renderHealth(d) {
  var last = d.events.length ? d.events[d.events.length - 1].t : null;
  var lastLevel = !last ? 'warn' : d.now - last < 3 * DAY ? 'good' : d.now - last < 14 * DAY ? 'warn' : 'crit';
  var errors = d.queue.filter(function (q) { return q.error && q.status !== 'Praleista'; }).length;
  var waiting = d.queue.filter(function (q) { return q.status === 'Laukia'; }).length;
  var open = d.feedback.filter(function (f) { return f.status === 'Naujas'; }).length;
  $('health').innerHTML = [
    pill('good', 'Sistema', state.demo ? 'demonstracija' : 'veikia'),
    pill(lastLevel, 'Paskutinė veikla', last ? ago(last, d.now) : 'dar nėra'),
    pill(d.smsConnected ? 'good' : 'warn', 'SMS', d.smsConnected ? 'prijungtos' : 'neprijungtos'),
    pill(errors ? 'crit' : 'good', 'Žinučių klaidos', nf.format(errors)),
    pill(waiting ? 'none' : 'good', 'Laukia eilėje', nf.format(waiting)),
    pill(open ? 'warn' : 'good', 'Neatsakyti skundai', nf.format(open))
  ].join('');
}

function renderVerdict(d, m, r) {
  var weeks = Math.max(r.span / (7 * DAY), 1);
  var perWeek = function (n) { return nf1.format(n / weeks); };
  var base = d.google[0];
  var lastG = d.google[d.google.length - 1];
  var growth = base && lastG && lastG !== base ? lastG.count - base.count : null;
  var open = d.feedback.filter(function (f) { return f.status === 'Naujas'; }).length;

  var checks = [
    { ok: m.visits / weeks >= 5, text: nf.format(m.visits) + ' apsilankymų – ' + perWeek(m.visits) + ' per savaitę' + (m.visits / weeks >= 5 ? '' : ' (tikslas: bent 5)') },
    { ok: m.visits && m.ratings / m.visits >= 0.5, text: pct(m.ratings, m.visits) + ' atidariusių puslapį jį įvertino' },
    { ok: m.google > 0, text: nf.format(m.google) + ' patenkintų klientų nukreipta rašyti Google atsiliepimo' },
    { ok: true, text: nf.format(m.negative) + ' neigiamų įvertinimų pateko pas savininką, o ne į Google' },
    growth === null
      ? { ok: null, text: 'Google augimo dar nematyti – įrašykite dabartinį Google atsiliepimų skaičių žemiau' }
      : { ok: growth > 0, text: 'Google atsiliepimų: ' + nf.format(base.count) + ' → ' + nf.format(lastG.count) + ' (' + (growth >= 0 ? '+' : '') + nf.format(growth) + ')' },
    { ok: open === 0, text: open ? open + ' skundai laukia savininko atsakymo' : 'Visi skundai sutvarkyti arba sprendžiami' }
  ];
  var passed = checks.filter(function (c) { return c.ok; }).length;

  var level, title, text;
  if (m.ratings < 10) {
    level = 'none';
    title = 'Per mažai duomenų sprendimui';
    text = 'Turime ' + m.ratings + ' įvertinimų. Patikimai išvadai reikia bent 10 – paprastai tai 2–4 savaitės.';
  } else if (passed >= 5) {
    level = 'good';
    title = 'Sistema veikia ir duoda naudos – verta tęsti';
    text = 'Klientai ją naudoja, patenkinti keliauja į Google, o nusivylę – pas savininką. Tinka siūlyti ir kitiems verslams.';
  } else if (passed >= 3) {
    level = 'warn';
    title = 'Veikia, bet galima geriau';
    text = 'Pažiūrėkite pažymėtus punktus: dažniausiai padeda daugiau kortelių ar QR matomose vietose ir SMS prašymai po kiekvieno remonto.';
  } else {
    level = 'crit';
    title = 'Kol kas naudos mažai';
    text = 'Sistema naudojama per retai. Patikrinkite, ar darbuotojai siūlo įvertinti ir ar kortelės / QR gerai matomi.';
  }
  $('verdict').innerHTML =
    '<div class="verdict-head">' + icon(level) + '<div><h2>' + title + '</h2><p>' + text + '</p></div></div>' +
    '<ul>' + checks.map(function (c) {
      return '<li>' + icon(c.ok === null ? 'none' : c.ok ? 'good' : 'warn') + '<span>' + esc(c.text) + '</span></li>';
    }).join('') + '</ul>';
}

function delta(now, before, digits) {
  if (before === null || before === undefined) return '<span class="delta">&nbsp;</span>';
  var diff = now - before;
  if (Math.abs(diff) < (digits ? 0.05 : 0.5)) return '<span class="delta">– kaip ankstesnį laikotarpį</span>';
  var txt = (diff > 0 ? '▲ +' : '▼ ') + (digits ? nf1.format(diff) : nf.format(diff));
  return '<span class="delta ' + (diff > 0 ? 'up' : 'down') + '">' + txt + ' nei ankstesnį laikotarpį</span>';
}

function tile(label, value, extra) {
  return '<div class="tile"><div class="label">' + label + '</div><div class="value">' + value + '</div>' + extra + '</div>';
}

function renderTiles(d, m, prev) {
  var base = d.google[0];
  var lastG = d.google[d.google.length - 1];
  $('tiles').innerHTML = [
    tile('Apsilankymai', nf.format(m.visits), delta(m.visits, prev && prev.visits)),
    tile('Įvertinimai', nf.format(m.ratings), '<span class="delta">' + pct(m.ratings, m.visits) + ' atidariusių</span>'),
    tile('Vidutinis įvertinimas', m.ratings ? nf1.format(m.avg) + ' ★' : '—',
      prev && prev.ratings && m.ratings ? delta(m.avg, prev.avg, 1) : '<span class="delta">&nbsp;</span>'),
    tile('Nukreipta į Google', nf.format(m.google), '<span class="delta">' + pct(m.positive, m.ratings) + ' įvertinusių</span>'),
    tile('Privatūs atsiliepimai', nf.format(m.privateCount), '<span class="delta">sulaikyta nuo Google</span>'),
    tile('Google atsiliepimai', lastG ? nf.format(lastG.count) : '—',
      '<span class="delta' + (lastG && base && lastG.count > base.count ? ' up' : '') + '">' +
      (lastG && base && lastG !== base ? (lastG.count >= base.count ? '+' : '') + nf.format(lastG.count - base.count) + ' nuo pradžios' : 'įrašykite žemiau') + '</span>')
  ].join('');
}

// ---------- Diagramos ----------

// Laiko intervalai: dienos (iki mėn.), savaitės (iki pusmečio), mėnesiai.
function buckets(r) {
  var list = [];
  var unit = r.span <= 32 * DAY ? 'day' : r.span <= 190 * DAY ? 'week' : 'month';
  var start = startOfDay(r.from);
  if (unit === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (unit === 'month') start.setDate(1);
  for (var t = new Date(start); t < r.to;) {
    var next = new Date(t);
    if (unit === 'day') next.setDate(next.getDate() + 1);
    else if (unit === 'week') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    list.push({
      from: t.getTime(), to: next.getTime(),
      label: unit === 'month' ? t.getFullYear() + '-' + pad(t.getMonth() + 1) : md(t),
      title: unit === 'day' ? md(t) : unit === 'week' ? md(t) + ' – ' + md(new Date(next - DAY)) : t.getFullYear() + '-' + pad(t.getMonth() + 1)
    });
    t = next;
  }
  return list;
}

function niceStep(max) {
  var raw = Math.max(max, 1) / 3;
  var mag = Math.pow(10, Math.floor(Math.log10(raw)));
  var steps = [1, 2, 5, 10];
  for (var i = 0; i < steps.length; i++) if (steps[i] * mag >= raw) return Math.max(1, steps[i] * mag);
  return 10 * mag;
}

function topRounded(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
    'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
}

// Stulpelinė diagrama (galima sudėtinė). cols: [{label, title, values}], series: [{name, color}]
function columns(el, cols, series, height) {
  var W = Math.max(el.clientWidth, 260), H = height || 170, L = 30, B = 22, T = 6;
  var iw = W - L - 2, ih = H - B - T;
  var totals = cols.map(function (c) { return c.values.reduce(function (a, v) { return a + v; }, 0); });
  var step = niceStep(Math.max.apply(null, totals.concat(1)));
  var max = step * Math.ceil(Math.max.apply(null, totals.concat(1)) / step);
  var slot = iw / cols.length, bw = Math.max(2, Math.min(24, slot * 0.62));
  var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img">';
  for (var v = 0; v <= max; v += step) {
    var gy = T + ih - v / max * ih;
    svg += '<line class="' + (v ? 'gridline' : 'base') + '" x1="' + L + '" x2="' + W + '" y1="' + gy + '" y2="' + gy + '"/>' +
      '<text x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + nf.format(v) + '</text>';
  }
  var every = Math.ceil(cols.length / Math.max(2, Math.floor(iw / 46)));
  cols.forEach(function (c, i) {
    var x = L + i * slot + (slot - bw) / 2, y = T + ih;
    var shown = series.map(function (s, si) { return si; }).filter(function (si) { return c.values[si] > 0; });
    shown.forEach(function (si, k) {
      var h = c.values[si] / max * ih;
      y -= h;
      var hh = Math.max(h - (k ? 2 : 0), 0.5);
      svg += k === shown.length - 1
        ? '<path d="' + topRounded(x, y, bw, hh, 4) + '" fill="' + series[si].color + '"/>'
        : '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + hh + '" fill="' + series[si].color + '"/>';
    });
    if (i % every === 0 || i === cols.length - 1 && cols.length < 10) {
      svg += '<text x="' + (L + i * slot + slot / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(c.label) + '</text>';
    }
    svg += '<rect class="hit" data-i="' + i + '" x="' + (L + i * slot) + '" y="' + T + '" width="' + slot + '" height="' + ih + '"/>';
  });
  el.innerHTML = svg + '</svg>';
  el.querySelectorAll('.hit').forEach(function (h) {
    var c = cols[h.dataset.i];
    bindTip(h, '<b>' + esc(c.title || c.label) + '</b><br>' + series.map(function (s, si) {
      return '<i style="background:' + s.color + '"></i>' + esc(s.name) + ': ' + nf.format(c.values[si]);
    }).join('<br>'));
  });
}

function bindTip(el, html) {
  var tip = $('tip');
  var show = function (e) {
    tip.innerHTML = html;
    tip.hidden = false;
    var p = e.touches ? e.touches[0] : e;
    var x = Math.min(p.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, p.clientY - tip.offsetHeight - 12) + 'px';
  };
  el.addEventListener('mousemove', show);
  el.addEventListener('touchstart', show, { passive: true });
  el.addEventListener('mouseleave', function () { tip.hidden = true; });
}

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function renderCharts(d, m, r) {
  var bs = buckets(r);
  var count = function (b, test) {
    return m.events.filter(function (e) { return e.t >= b.from && e.t < b.to && test(e); }).length;
  };
  var visitCols = bs.map(function (b) {
    return { label: b.label, title: b.title, values: [count(b, function (e) { return e.type === 'visit'; })] };
  });
  columns($('chart-visits'), visitCols, [{ name: 'Apsilankymai', color: css('--s1') }]);

  var outCols = bs.map(function (b) {
    return { label: b.label, title: b.title, values: [
      count(b, function (e) { return e.type === 'rating' && e.rating >= GOOD_FROM; }),
      count(b, function (e) { return e.type === 'rating' && e.rating && e.rating < GOOD_FROM; })
    ] };
  });
  columns($('chart-outcome'), outCols, [{ name: 'Į Google', color: css('--s1') }, { name: 'Privatus', color: css('--s2') }]);
  $('table-outcome').innerHTML = '<div class="table-wrap"><table><tr><th>Laikotarpis</th><th class="num">Apsilankymai</th><th class="num">Į Google</th><th class="num">Privatus</th></tr>' +
    outCols.map(function (c, i) {
      return '<tr><td>' + esc(c.title) + '</td><td class="num">' + visitCols[i].values[0] + '</td><td class="num">' + c.values[0] + '</td><td class="num">' + c.values[1] + '</td></tr>';
    }).reverse().join('') + '</table></div>';

  var visits = m.events.filter(function (e) { return e.type === 'visit'; });
  var hours = [];
  for (var h = 0; h < 24; h++) hours.push({ label: String(h), title: pad(h) + ':00–' + pad(h) + ':59', values: [0] });
  var days = WEEKDAYS.map(function (w) { return { label: w, title: w, values: [0] }; });
  visits.forEach(function (e) {
    hours[e.t.getHours()].values[0]++;
    days[(e.t.getDay() + 6) % 7].values[0]++;
  });
  columns($('chart-hours'), hours, [{ name: 'Apsilankymai', color: css('--s1') }], 130);
  columns($('chart-days'), days, [{ name: 'Apsilankymai', color: css('--s1') }], 130);
}

function hrow(name, value, max, color, valueHtml) {
  var w = max ? Math.max(value / max * 100, value ? 1.5 : 0) : 0;
  return '<div class="hrow"><span class="name">' + name + '</span><span class="htrack">' +
    '<span class="hbar" style="width:calc((100% - 72px) * ' + (w / 100) + ');background:' + color + '"></span>' +
    '<span class="hval">' + valueHtml + '</span></span></div>';
}

function renderStars(m) {
  var colors = [css('--neg2'), css('--neg1'), css('--mid'), css('--pos1'), css('--pos2')];
  var max = Math.max.apply(null, m.stars.concat(1));
  $('stars-sub').textContent = m.ratings ? 'Vidurkis ' + nf1.format(m.avg) + ' ★ iš ' + nf.format(m.ratings) + ' įvertinimų' : 'Įvertinimų dar nėra';
  var html = '';
  for (var i = 4; i >= 0; i--) {
    html += hrow((i + 1) + ' ★', m.stars[i], max, colors[i], nf.format(m.stars[i]) + ' <small>' + pct(m.stars[i], m.ratings) + '</small>');
  }
  $('chart-stars').innerHTML = html;
}

function renderFunnel(m) {
  var steps = [
    ['Atidarė puslapį', m.visits, css('--o1')],
    ['Įvertino', m.ratings, css('--o2')],
    ['Nukreipti į Google', m.google, css('--o3')]
  ];
  var max = Math.max(m.visits, 1);
  $('funnel').innerHTML = '<div class="funnel">' + steps.map(function (s, i) {
    return hrow(s[0], s[1], max, s[2], nf.format(s[1]) + (i ? ' <small>' + pct(s[1], steps[i - 1][1]) + '</small>' : ''));
  }).join('') + '</div><p class="note">Neigiamai įvertino ' + nf.format(m.negative) + ', iš jų pastebėjimus paliko ' +
    nf.format(m.privateCount) + ' (' + pct(m.privateCount, m.negative) + ').</p>';
}

function renderSources(m) {
  var by = {};
  m.events.forEach(function (e) {
    var s = by[e.src] || (by[e.src] = { visit: 0, rating: 0, google: 0, feedback: 0 });
    if (s[e.type] !== undefined) s[e.type]++;
  });
  var rows = Object.keys(by).map(function (k) { return [k, by[k]]; })
    .filter(function (r) { return r[1].visit || r[1].rating; })
    .sort(function (a, b) { return b[1].visit - a[1].visit; });
  if (!rows.length) { $('sources').innerHTML = '<p class="note">Duomenų dar nėra.</p>'; return; }
  $('sources').innerHTML = '<div class="table-wrap"><table><tr><th>Šaltinis</th><th class="num">Atidarė</th><th class="num">Įvertino</th><th class="num">Į Google</th><th class="num">Privatūs</th></tr>' +
    rows.map(function (r) {
      var s = r[1];
      return '<tr><td>' + esc(sourceName(r[0])) + '</td><td class="num">' + nf.format(s.visit) + '</td><td class="num">' +
        nf.format(s.rating) + ' <span class="muted">' + pct(s.rating, s.visit) + '</span></td><td class="num">' +
        nf.format(s.google) + '</td><td class="num">' + nf.format(s.feedback) + '</td></tr>';
    }).join('') + '</table></div>';
}

function renderRequests(d, m, r) {
  var sent = m.reqSent;
  var opened = sent.filter(function (q) { return q.opened; }).length;
  var rated = sent.filter(function (q) { return q.rated; }).length;
  var sms = sent.filter(function (q) { return q.channel === 'sms'; }).length;
  $('requests').innerHTML = '<div class="kv">' +
    '<div><b>' + nf.format(sent.length) + '</b><span>Išsiųsta prašymų (SMS ' + sms + ', el. paštu ' + (sent.length - sms) + ')</span></div>' +
    '<div><b>' + pct(opened, sent.length) + '</b><span>Atidarė nuorodą (' + opened + ')</span><div class="meter"><i style="width:' + (sent.length ? opened / sent.length * 100 : 0) + '%"></i></div></div>' +
    '<div><b>' + pct(rated, sent.length) + '</b><span>Įvertino (' + rated + ')</span><div class="meter"><i style="width:' + (sent.length ? rated / sent.length * 100 : 0) + '%"></i></div></div>' +
    '<div><b>' + nf.format(m.followups) + '</b><span>Atsakymų į neigiamus atsiliepimus</span></div>' +
    '</div>';
}

function renderGoogle(d) {
  var g = d.google;
  if (!g.length) { $('google').innerHTML = '<p class="note">Įrašų dar nėra.</p>'; return; }
  var base = g[0], last = g[g.length - 1];
  var diff = last.count - base.count;
  var days = Math.max(Math.round((last.t - base.t) / DAY), 1);
  $('google').innerHTML =
    '<div class="growth"><b>' + (diff >= 0 ? '+' : '') + nf.format(diff) + '</b><span class="sub">atsiliepimų per ' + days + ' d. (' +
    nf.format(base.count) + ' → ' + nf.format(last.count) + ', ★ ' + nf1.format(base.rating) + ' → ' + nf1.format(last.rating) + ')</span></div>' +
    '<div class="table-wrap"><table><tr><th>Data</th><th class="num">Įvertinimas</th><th class="num">Atsiliepimų</th></tr>' +
    g.slice().reverse().slice(0, 8).map(function (s, i, arr) {
      return '<tr><td>' + s.t.getFullYear() + '-' + md(s.t) + (s === base ? ' <span class="muted">(prieš sistemą)</span>' : '') +
        '</td><td class="num">' + nf1.format(s.rating) + '</td><td class="num">' + nf.format(s.count) + '</td></tr>';
    }).join('') + '</table></div>' +
    '<p class="note">Kartą per savaitę įrašykite skaičius iš Google Maps – taip matysite tikrą sistemos naudą.</p>';
}

function renderComplaints(d, r) {
  var list = d.feedback.filter(function (f) { return f.t >= r.from; });
  var by = { Naujas: 0, 'Sprendžiama': 0, 'Išspręsta': 0 };
  list.forEach(function (f) { if (by[f.status] !== undefined) by[f.status]++; });
  $('complaints-sub').textContent = list.length
    ? nf.format(list.length) + ' per laikotarpį · nauji ' + by.Naujas + ', sprendžiami ' + by['Sprendžiama'] + ', išspręsti ' + by['Išspręsta']
    : 'Per šį laikotarpį privačių atsiliepimų nėra.';
  $('complaints').innerHTML = '<div class="list">' + list.slice(0, 12).map(function (f) {
    return '<div class="item"><div class="meta"><span>' + dateTime(f.t) + '</span><span class="stars-txt" aria-label="' + f.rating + ' iš 5">' +
      starsText(f.rating) + '</span><span class="status ' + statusClass(f.status) + '">' + esc(f.status) + '</span><span>' +
      esc(f.name || 'Be vardo') + (f.contact ? ' · ' + esc(f.contact) : '') + '</span><span>' + esc(sourceName(f.src)) +
      '</span></div><div class="msg">' + esc(f.msg) + '</div></div>';
  }).join('') + '</div>';
}

function renderFeed(d) {
  var list = d.events.slice(-15).reverse();
  $('feed').innerHTML = list.length ? '<div class="table-wrap feed"><table>' + list.map(function (e) {
    return '<tr><td>' + dateTime(e.t) + '</td><td>' + esc(TYPE_LABEL[e.type] || e.type) + (e.rating ? ' · ' + e.rating + ' ★' : '') +
      '</td><td class="muted">' + esc(sourceName(e.src)) + '</td></tr>';
  }).join('') + '</table></div>' : '<p class="note">Įvykių dar nėra.</p>';
}

// ---------- Google profilio įrašas ----------

function saveSnapshot(e) {
  e.preventDefault();
  var rating = Number($('snap-rating').value.replace(',', '.'));
  var count = Number($('snap-count').value);
  var err = $('snap-error');
  err.hidden = true;
  if (!(rating >= 1 && rating <= 5) || !(count >= 0) || $('snap-count').value === '') {
    err.textContent = 'Įveskite įvertinimą (1–5) ir atsiliepimų skaičių.';
    err.hidden = false;
    return;
  }
  var done = function () { $('snap-rating').value = ''; $('snap-count').value = ''; };
  if (state.demo) {
    state.raw.google.push([new Date().toISOString(), rating, count]);
    done();
    return render();
  }
  fetch(state.client.apiUrl, {
    method: 'POST',
    body: JSON.stringify({ type: 'snapshot', key: store('hub-key-' + state.client.id), rating: rating, count: count })
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (!res.ok) throw new Error(res.error);
    done();
    load();
  }).catch(function () {
    err.textContent = 'Nepavyko įrašyti. Ar backend atnaujintas?';
    err.hidden = false;
  });
}

// ---------- Demonstraciniai duomenys ----------

function demoData() {
  var now = Date.now(), seed = 7;
  var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  var pick = function (pairs) { var x = rnd(), acc = 0; for (var i = 0; i < pairs.length; i++) { acc += pairs[i][1]; if (x < acc) return pairs[i][0]; } return pairs[0][0]; };
  var events = [], feedback = [], queue = [];
  var msgs = ['Remontas užtruko ilgiau nei žadėjo.', 'Niekas nepaskambino, kai telefonas buvo paruoštas.', 'Brangiau nei sakė iš pradžių.',
    'Ekranas po savaitės vėl mirga.', 'Ilgai laukiau eilėje.', 'Darbuotojas nemandagus.'];
  var names = ['Tomas', 'Rasa', '', 'Jonas', 'Inga', '', 'Mantas'];
  for (var day = 120; day >= 0; day--) {
    var base = new Date(now - day * DAY);
    var weekend = base.getDay() === 0 || base.getDay() === 6;
    var visits = Math.round((weekend ? 1.5 : 4) + rnd() * (weekend ? 2 : 5) + (120 - day) / 40);
    for (var v = 0; v < visits; v++) {
      var t = new Date(base);
      t.setHours(pick([[10, .12], [11, .14], [12, .12], [13, .1], [14, .1], [15, .1], [16, .12], [17, .12], [18, .08]]), Math.floor(rnd() * 60));
      if (t > now) continue;
      var src = pick([['nfc1', .38], ['nfc2', .14], ['qr-stendas', .18], ['qr-lipdukas', .06], ['sms', .19], ['email', .05]]);
      var iso = t.toISOString();
      events.push([iso, src, 'visit', 0]);
      if (rnd() > .82) continue;
      var stars = pick([[5, .58], [4, .18], [3, .09], [2, .08], [1, .07]]);
      events.push([iso, src, 'rating', stars]);
      if (stars >= GOOD_FROM) events.push([iso, src, 'google', stars]);
      else if (rnd() < .72) {
        events.push([iso, src, 'feedback', stars]);
        feedback.push([iso, stars, msgs[Math.floor(rnd() * msgs.length)], names[Math.floor(rnd() * names.length)],
          rnd() < .6 ? '+370****' + Math.floor(10 + rnd() * 89) : 'ra***@gmail.com', src,
          day > 6 ? 'Išspręsta' : day > 2 ? pick([['Išspręsta', .6], ['Sprendžiama', .4]]) : pick([['Naujas', .6], ['Sprendžiama', .4]])]);
        queue.push([iso, 'Atsakymas į atsiliepimą', 'sms', 'Išsiųsta', iso, '', 0, 0]);
      }
      if (src === 'sms' || src === 'email') {
        queue.push([new Date(t - 3600e3).toISOString(), 'Prašymas', src, 'Išsiųsta', new Date(t - 3600e3).toISOString(), iso, stars, 0]);
      }
    }
    for (var u = 0; u < (weekend ? 0 : 2); u++) {
      var tq = new Date(base);
      tq.setHours(11 + u * 4);
      if (tq < now) queue.push([tq.toISOString(), 'Prašymas', 'sms', 'Išsiųsta', tq.toISOString(), '', 0, 0]);
    }
  }
  queue.push([new Date(now - 1800e3).toISOString(), 'Prašymas', 'sms', 'Laukia', '', '', 0, 0]);
  var google = [];
  for (var w = 0; w <= 17; w++) {
    var gt = new Date(now - (120 - w * 7) * DAY);
    if (gt <= now) google.push([gt.toISOString(), Math.min(4.3 + w * 0.012, 4.6), 231 + Math.round(w * 4.2)]);
  }
  return { ok: true, business: state.client ? state.client.name : 'Demo', now: new Date(now).toISOString(), sheetUrl: '',
    smsConnected: true, events: events, feedback: feedback, queue: queue, google: google };
}

// ---------- Paleidimas ----------

function init() {
  if (!CLIENTS.length) { showLogin('config.js nėra klientų.'); return; }
  var savedClient = store('hub-client');
  state.client = CLIENTS.filter(function (c) { return c.id === savedClient; })[0] || CLIENTS[0];
  var savedDays = store('hub-days');
  state.days = savedDays !== null && savedDays !== '' ? Number(savedDays) : 30;
  $('client-name').textContent = state.client.name;

  if (CLIENTS.length > 1) {
    $('client').hidden = false;
    $('client').innerHTML = CLIENTS.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    $('client').value = state.client.id;
    $('client').addEventListener('change', function () {
      state.client = CLIENTS.filter(function (c) { return c.id === $('client').value; })[0];
      store('hub-client', state.client.id);
      state.raw = null;
      load();
    });
  }
  document.querySelectorAll('#period button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.days = Number(b.dataset.days);
      store('hub-days', String(state.days));
      render();
    });
  });
  $('hide-test').addEventListener('change', function () { state.hideTest = $('hide-test').checked; render(); });
  $('refresh').addEventListener('click', load);
  $('logout').addEventListener('click', function () { store('hub-key-' + state.client.id, null); state.raw = null; showLogin(); });
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var key = $('key').value.trim();
    if (!key) return;
    store('hub-key-' + state.client.id, key);
    $('key').value = '';
    load();
  });
  $('snap-form').addEventListener('submit', saveSnapshot);
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (state.raw && !$('dash').hidden) render(); }, 200);
  });
  window.addEventListener('scroll', function () { $('tip').hidden = true; }, { passive: true });
  load();
}

init();
