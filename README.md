# NFC Reviews

Review system for NFC cards, QR codes and automatic SMS/email requests.

- **4–5 ★** → Google "write a review" window opens immediately.
- **1–3 ★** → private review form (phone or email required) that goes to the owner's email and a Google Sheet. The customer then gets an automatic follow-up asking what went wrong and how to help.

⚠️ Not showing Google to unhappy customers is "review gating". Google's rules forbid it, and if reported, Google can remove reviews or penalise the profile.

Live (KGF): https://benjamalas.github.io/Nfc-Reviews/kgf/

## What runs on its own
| | |
|---|---|
| Review requests | Type the customer's phone or email into the **SMS eilė** sheet (Google Sheets app on a phone works). The system sends the SMS/email ~1 h later (only 9:00–20:00), at most once per 90 days per customer, max 50/day |
| Tracking | Each request has its own link, so the **SMS eilė** sheet shows who opened it and how many ★ they gave |
| Complaint handling | Email to the owner instantly + automatic follow-up to the customer by SMS or email (`FOLLOWUP_TEXT` in Code.gs). Email replies go to the owner, SMS replies to the shop phone |
| Daily 9:00 | Email to owner if a complaint is still "Naujas" after 24 h or a message failed to send |
| Monday 9:00 | Weekly report: requests sent, opened, ratings, Google clicks, complaints |
| Reminder (off) | Set `REMINDER_DAYS = 3` in Code.gs to re-send once to people who didn't open the link |

## Files
| Path | What |
|---|---|
| `kgf/index.html` | Review page (link for NFC cards / QR) |
| `kgf/qr.html` | Printable stand + stickers, and NFC card links |
| `kgf/config.js` | Client settings (name, colour, Google link, API URL) |
| `apps-script/Code.gs` | Backend: Sheet, emails, SMS queue, daily/weekly emails. SMS text and timing settings are at the top |
| `docs/kgf-atsakymai-google.md` | Ready replies to KGF's existing Google reviews |

**New client** = copy the `kgf` folder, edit its `config.js`, make a new Sheet + Apps Script (change `BUSINESS_NAME`, `REVIEW_URL`, `REQUEST_TEXT` at the top).

## Updating the backend (after every Code.gs change)
1. Open the Sheet → **Extensions → Apps Script** → replace all code with `apps-script/Code.gs` → Save.
2. Choose `setup` → **Run** → allow the new permissions (Advanced → Go to project).
3. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## Automatic SMS (free, from the shop's own SIM)
Needs an Android phone with a SIM card that stays in the shop, charged and online.
1. Install **SMS Gateway for Android** (sms-gate.app) on that phone, from Google Play or GitHub releases.
2. Open it → enable **Cloud server** → **Online**. It shows a **username** and **password**.
3. In Apps Script: **⚙️ Project Settings → Script properties → Add**: `SMS_USER` = username, `SMS_PASS` = password → Save.
4. Test: type your own number in **SMS eilė** → within 10 min it shows *Laukia* with a send time → the SMS arrives about 1 h later.

Until step 3 is done, SMS requests wait in the queue and go out automatically once it's connected. Email requests work right away.

Customers should agree to receive the SMS (staff can ask: "Ar galime atsiųsti trumpą SMS dėl įvertinimo?").

## Sheet tabs
- **Atsiliepimai**: private complaints. Owner sets **Būsena** (Naujas → Sprendžiama → Išspręsta).
- **SMS eilė**: fill only the yellow columns (phone/email, name). The rest fills in by itself: status, send time, opened, rating, errors. Follow-ups after private reviews also appear here (Tipas: *Atsakymas į atsiliepimą*).
- **Veikla**: every visit, rating, Google click and sent request.
- **Statistika**: per month, average rating, per source. Rows with source `test…` are ignored.

## NFC cards & QR
Open `kgf/qr.html` → copy a link per card (`?s=nfc1`, `nfc2`…) → write it with the **NFC Tools** app (Write → Add a record → URL). Print the same page for the counter stand and receipt stickers. Don't rename or move the repo, or the cards will stop working.
