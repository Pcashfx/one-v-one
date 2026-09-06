# One V One — static site

A full multi-page front end: `index.html`, `matchups.html`, `tournaments.html`,
`games.html`, `leaderboard.html`, `login.html`, `signup.html`, `faq.html`,
`about.html`, plus shared `styles.css` and `script.js`.

## Deploy it

This is plain HTML/CSS/JS with no build step, so any static host works:

- **Netlify / Vercel**: drag the folder onto their dashboard, or `netlify deploy` / `vercel` from inside it.
- **GitHub Pages**: push the folder to a repo, enable Pages on the `main` branch.
- **Any web server**: upload the files as-is; `index.html` is the entry point.

## What's real vs. mocked

- Layout, navigation, responsive design, filters, FAQ accordion: fully working, no dependencies beyond Google Fonts.
- Sign in / sign up, matchups, tournaments, and the leaderboard are now wired to the real backend API in `backend/` — see `config.js` to point this front end at your deployed API URL. The JWT session is cached in `localStorage`, but the account itself lives in the backend's database.
- Posting a matchup, challenging one, and entering a tournament all hit real endpoints and move real rows in the wallet ledger (still play-money credits, not actual currency — see `backend/README.md`).
- Deposits/withdrawals are intentionally not implemented (see `backend/src/routes/wallet.js`) — no real payment provider is connected.

Before this works, start the backend (see `backend/README.md`) and make sure `config.js` points at it — `http://localhost:4000/api` for local dev, or your deployed Render URL in production.

## Before this touches real money or real users

If the goal is to actually run cash duels/tournaments, you'll need, at minimum:
- A real backend (accounts, sessions, match state) and a database.
- Identity/age verification and KYC appropriate to your jurisdiction.
- A payment processor willing to support skill-based cash competition, plus escrow/payout logic.
- Legal review — real-money skill-gaming is regulated differently state-by-state and country-by-country; confirm you're allowed to operate before launching.
