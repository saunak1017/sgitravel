# Company Travel Tracker (Cloudflare Pages + D1 + FlightAware)

This repo deploys a password-protected webpage for tracking company travel:
- Bookings with multiple segments (flight number + date, auto-filled from FlightAware)
- Multiple travelers per booking (PNR per traveler, reason/category per traveler)
- Cancel ticket without deleting (refund method stored)
- Dashboard with filters + CSV export
- Admin page to manage people + download backup JSON

## Why FlightAware?
FlightAware's AeroAPI has a **free tier** that includes **500 requests/responses per month** with **5 queries per minute** (no credit card required).

It authenticates with an `x-apikey` header per the AeroAPI OpenAPI specification.

---

# A–Z Setup (GitHub + Cloudflare)

## 0) Create the GitHub repo
1. Create a new GitHub repo (private is fine), e.g. `company-travel-tracker`
2. Upload **all files** from this zip into the repo root.

## 1) Create the D1 database
1. In Cloudflare Dashboard → **Workers & Pages** → **D1**
2. Click **Create database**
3. Name it: `company-travel-tracker`
4. After it creates, click into the DB → open **Console**
5. Run the contents of `schema.sql` (copy/paste) and execute.

## 2) Create the Pages project
1. Cloudflare Dashboard → **Workers & Pages** → **Pages**
2. **Create a project** → Connect to GitHub → select your repo.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: `public`
4. Deploy.

## 3) Bind D1 to Pages
1. In your Pages project → **Settings** → **Functions** → **D1 database bindings**
2. Add a binding:
   - Variable name: `DB`
   - Database: `company-travel-tracker`

## 4) Add secrets (Password + token secret + FlightAware key)
In Pages project → **Settings** → **Environment variables** (Production + Preview)

Add these **as secrets**:
- `AUTH_PASSWORD` = `fancyshape123`
- `TOKEN_SECRET` = any long random string (32+ chars). You can generate one online or use your password manager.
- `FLIGHTAWARE_APIKEY` = your FlightAware AeroAPI key (steps below)

Redeploy after adding.

---

# FlightAware AeroAPI key (A–Z, literally)

## A) Create a FlightAware account
1. Go to FlightAware and create an account.
2. Log in to the AeroAPI developer portal.

## B) Confirm the free tier
FlightAware lists a free **STARTER** tier (500 requests/responses per month, 5 queries/min, no card required).

## C) Get your API key
1. In the AeroAPI portal, find your **API key**.
2. Copy the key.

## D) Put the key into Cloudflare Pages
1. Cloudflare → Pages project → Settings → Environment variables
2. Add `FLIGHTAWARE_APIKEY` as a **secret**
3. Deploy.

## E) How the site uses the key
The backend calls the AeroAPI REST endpoint:
- `GET https://aeroapi.flightaware.com/aeroapi/flights/{ident}` with header `x-apikey: <your key>`

The UI requests `/api/flight-lookup?flight_number=VS45&flight_date=2026-02-06` and the server picks the best matching flight from the returned list.

### Flight number format tip
If `VS45` doesn't match, try:
- `VIR45` (ICAO operator code)
- `VS0045` (leading zeros sometimes help)
Different airlines/providers are inconsistent; the server returns a helpful error message if nothing is found.

---

# Using the site

## 1) Add people (Admin tab)
- Add each employee once.
- You can deactivate people later.

## 2) New booking
- Choose booking type (Roundtrip / One-way / Multi-city)
- Choose payment type (Cash / Miles) — validation enforced
- Select travelers (multi-select) and enter PNR + reason per traveler
- Add segments:
  - enter Flight number + date
  - click **Fetch** to auto-fill route/times/aircraft if available
- Save

## 3) Cancel a ticket
Open booking → traveler card → **Cancel ticket** and choose refund method.
Canceled tickets remain in reporting.

---

# Local dev (optional)
If you want to run locally:
1. Install Node.js
2. `npm install`
3. `npm run dev`

(For local D1 binding and secrets, you can use `wrangler.toml` + `.dev.vars` — optional.)
