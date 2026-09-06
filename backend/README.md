# One V One — backend API

Express + SQLite. Real auth (bcrypt + JWT), a real wallet ledger, and working
matchup/tournament logic — with payment and identity verification left as
clearly marked stubs (see "Payments & identity verification" below).

## Setup

```bash
cd backend
npm install
cp .env.example .env
# open .env and set a real JWT_SECRET (e.g. `openssl rand -hex 32`)
npm run seed     # creates the SQLite file and inserts sample games/matchups
npm run dev       # starts the API on http://localhost:4000
```

> This was written and syntax-checked in an environment without internet
> access, so `npm install` and a live boot haven't been run end-to-end here.
> The code follows standard Express/better-sqlite3 patterns and should run
> as-is, but test it locally before relying on it.

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | – | Create an account. Body: `username, email, password, ageConfirmed, termsAccepted` |
| POST | `/api/auth/login` | – | Get a session token. Body: `email, password` |
| GET | `/api/auth/me` | ✅ | Current user |
| GET | `/api/games` | – | List games |
| GET | `/api/matchups?game=slug` | – | List open matchups |
| POST | `/api/matchups` | ✅ | Post a new matchup (debits entry fee if set) |
| POST | `/api/matchups/:id/challenge` | ✅ | Accept an open matchup |
| POST | `/api/matchups/:id/report` | ✅ | Report a winner (pays out the prize) |
| GET | `/api/tournaments` | – | List open tournaments |
| POST | `/api/tournaments/:id/enter` | ✅ | Enter a tournament (debits entry fee if set) |
| GET | `/api/leaderboard` | – | Top players by XP |
| GET | `/api/wallet` | ✅ | Balance + recent transactions |
| POST | `/api/wallet/deposit` | ✅ | **Stub — returns 501** until a payment provider is connected |
| POST | `/api/wallet/withdraw` | ✅ | **Stub — returns 501**, and separately blocks on identity verification |

Auth routes return `{ token, user }`; send the token on subsequent requests as
`Authorization: Bearer <token>`.

## Connecting the front end

Already wired. The front end (`../script.js`) calls this API directly, caches
the returned JWT in `localStorage`, and renders matchups/tournaments/
leaderboard from live data. To point it at a different backend URL (e.g.
after deploying to Render), edit `../config.js`:

```js
window.OVO_API_BASE = "https://your-backend.onrender.com/api";
```

### Running both together locally

```bash
# terminal 1
cd backend
npm install && cp .env.example .env   # set JWT_SECRET
npm run seed
npm run dev

# terminal 2 — serve the front end as static files, e.g.:
cd ..
python3 -m http.server 5500
# visit http://localhost:5500
```

`config.js` defaults to `http://localhost:4000/api`, matching the backend's
default `PORT`, so local dev works without editing anything.

## Payments & identity verification

Nothing here moves real money or verifies a real identity yet — `wallet.js`
has two clearly marked stub functions where that logic goes. To go live you
need accounts with real providers, opened and verified under your own
business:

**Identity/age verification (KYC)**
- Stripe Identity, Persona, or Veriff are the common choices; all offer a
  hosted verification flow plus a webhook you'd use to set a
  `users.identity_verified` flag.

**Payment processing / payouts**
- Stripe is the default choice for most marketplaces, but skill-based cash
  gaming is often flagged as a restricted/high-risk category — Stripe (or
  any processor) reviews your specific business model at signup and can
  decline it.
- If declined, the realistic path is a processor that explicitly serves
  fantasy sports / skill-gaming (this list changes; search for current
  providers rather than trusting an old list) or a specialist high-risk
  payments provider.
- Either way, you're the one who creates the account, provides business
  documentation, and gets approved — I can't do that step, only build the
  integration code once you have credentials.

**Before any of this goes live**, get a lawyer to confirm which states or
countries permit paid skill-based competitions, since it varies (and some
jurisdictions require money-transmitter licensing regardless of the
"skill vs. chance" distinction). This is general information, not legal
advice.
