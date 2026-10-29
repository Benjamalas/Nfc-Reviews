// Bendros funkcijos visiems puslapiams.
var cfg = window.REVIEW_CONFIG || {};
document.documentElement.style.setProperty('--accent', cfg.accent || '#1f4fd8');

// Paverčia tekstą saugiu šaltinio kodu: "Jonas Žukas" -> "jonas-zukas".
function slug(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40);
}

// Atsiliepimų puslapio adresas (šio aplanko index.html).
function reviewUrl(source) {
  var base = cfg.publicUrl || new URL('./', location.href).href;
  return source ? base + '?s=' + encodeURIComponent(source) : base;
}

// Siunčia įvykį į Google Sheet. beacon = true, kai puslapis tuoj bus paliktas.
function send(data, beacon) {
  if (!cfg.apiUrl) return Promise.resolve();
  var body = JSON.stringify(data);
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(cfg.apiUrl, body);
    return Promise.resolve();
  }
  // no-cors: atsakymo neskaitome, klaida būna tik dingus internetui.
  return fetch(cfg.apiUrl, { method: 'POST', mode: 'no-cors', body: body });
}

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) { return null; }
}
