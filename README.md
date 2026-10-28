# NFC Reviews

Review page for NFC cards, QR codes and SMS. Customers tap a star:

- **4–5 ★** → thank-you screen, then Google review opens automatically (button + 4 s countdown).
- **1–3 ★** → private form that goes to the owner's email and a Google Sheet. A small "write on Google" link stays visible. **Do not remove it**: hiding Google from unhappy customers is "review gating", which Google bans and can punish by deleting reviews.

## Files

| Path | What |
|---|---|
| `kgf/index.html` | Review page (link for NFC cards / QR) |
| `kgf/darbuotojams.html` | Staff page: send review request by SMS / email / on-screen QR |
| `kgf/qr.html` | Printable stand + stickers, and NFC card links |
| `kgf/config.js` | Everything client-specific (name, colour, Google link, API URL) |
| `assets/` | Shared code and styles for all clients |
| `apps-script/Code.gs` | Backend: saves to Google Sheet, emails complaints |
| `docs/kgf-atsakymai-google.md` | Ready replies to KGF's existing Google reviews |

**New client** = copy the `kgf` folder (e.g. `client2`), edit its `config.js`, make a new Sheet + Apps Script.

## Setup (once per client, ~15 min)

### 1. Google Sheet + backend
1. Go to [sheets.new](https://sheets.new), name it e.g. `KGF atsiliepimai`.
2. **Extensions → Apps Script**, delete the sample code, paste `apps-script/Code.gs`, save.
3. Pick `setup` in the function dropdown → **Run** → allow permissions (Advanced → Go to project).
4. **Deploy → New deployment** → type **Web app** → Execute as **Me**, Who has access **Anyone** → Deploy.
5. Copy the Web app URL (ends with `/exec`) into `apiUrl` in `kgf/config.js`.

Complaint emails go to the Google account that owns the script. To add the owner's email, put it in `NOTIFY_EMAILS` and **Deploy → Manage deployments → Edit → New version**. Every code change needs a new version.

### 2. Hosting (free)
This repo is private, and free GitHub Pages only works for public repos. Pick one:
- Make the repo public → Settings → Pages → Deploy from branch `main`. Link: `https://benjamalas.github.io/Nfc-Reviews/kgf/`
- Or keep it private and connect it to [Cloudflare Pages](https://pages.cloudflare.com) or Netlify (both free).

**Before writing NFC cards, decide the final domain.** Cards can't be updated without re-writing them. Your own domain (~10 €/yr) means you can move hosting later without breaking cards. Set it in `publicUrl`.

### 3. Test
- Open the review page → 5 ★ should open Google's "write a review" window. If it doesn't, get the official link in Google Business Profile → **Ask for reviews** and put it in `googleReviewUrl`.
- 1 ★ → send the form → a row appears in the Sheet and an email arrives.

### 4. NFC cards & QR
- Open `kgf/qr.html` → copy a link per card (`?s=nfc1`, `nfc2`…) → write it with the **NFC Tools** app (Write → Add a record → URL).
- Print the same page for the counter stand and receipt stickers.

## Sheet tabs
- **Atsiliepimai** – private complaints. Owner sets **Būsena** (Naujas → Sprendžiama → Išspręsta) and notes.
- **Veikla** – every visit, rating, Google click and sent request.
- **Statistika** – per month, average rating, and per source (which card / QR / employee works best).
