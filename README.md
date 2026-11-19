# Bloxscope

A Roblox player explorer with live username autocomplete and detailed public profiles. Built with HTML, CSS, JavaScript, and a Node.js Vercel Function. No dependencies, account cookies, API keys, or database needed.

## Deploy to Vercel

Import this repository. Choose framework preset **Other**, root directory **.**, no build command, and output directory **.**. The included vercel.json configures the static site and `/api/roblox` Node.js function. If this repository is already connected to Vercel, a push to main normally triggers deployment; check that the project uses Node.js 22 or newer. No environment variables are required.

A static-only host such as GitHub Pages cannot run the API. Deploy on Vercel for live search and profiles.

## Local development

Requires Node.js 22 or newer. Run `npm run dev` and open http://localhost:3000. No installation step is required. Run `npm test` for API validation and regression checks.

## Features

- Debounced username / player ID search, avatar suggestions, keyboard selection
- Shareable player links via `#player/USER_ID`
- Account creation timestamp, account age, description, verified badge, public banned flag
- Friends, followers, and following counts
- Current avatar items with catalog links
- Saved outfits with thumbnails, pagination, and outfit item inspector
- Groups with roles and member counts
- Created games and favourite games
- Badges and connection lists where Roblox permits unauthenticated access
- Inventory visibility and public inventory categories
- Username history, paginated lists, per-panel retries, privacy-aware error states
- Responsive layout, accessible labels, reduced-motion support, text escaping

## Public data and limits

Every result comes from Roblox public endpoints. Not every endpoint is available for every player. Roblox may return 401/403 responses for badges, connection lists, or other sections even when a public Roblox webpage shows similar information. Those sections explicitly show the restriction rather than inventing results or reporting zero. No login or cookie-based fallback is used. Private inventory cannot be viewed. Robux balances, private messages, email, location, passwords, private account information, and hidden presence are not collected.

Roblox rate limits requests. Profile details are cached in server memory for 30 minutes; outfit lists for 30 minutes, and other successful upstream responses for 5 minutes. Previously fetched data can be reused for up to 30 additional minutes during temporary upstream failures. In-memory caches are per server instance. Successful assembled responses are cached in Vercel’s CDN for 5 minutes with up to 10 minutes of stale-while-revalidate; partial fallback profiles are not CDN-cached. The browser reuses successful profiles for 5 minutes and searches for 2 minutes. Rate-limit cooldowns apply per HTTP method and endpoint, and respect Roblox’s Retry-After response (bounded to 1–300 seconds). The homepage only loads a thumbnail, rather than an entire profile. If profile details are limited, an unauthenticated identity lookup can provide a partial profile with unavailable fields explicitly labelled. Countdowns attempt profile and section recovery once per failing request; further attempts are manual. Outfit lists fetch up to 50 results per page to reduce repeated calls. Sections retain successful results while navigating profiles; next-page failures preserve the loaded grid. Concurrent identical section requests share one browser request. Data is not real-time. Thumbnail requests are best-effort; missing or moderated images show placeholders. Unavailable counts show a dash instead of zero. Outfit pagination follows Roblox’s continuation tokens. The friends list can be limited to 50 results when Roblox returns an unpaginated list; this is labelled in the UI.

## Structure

- `index.html`, `style.css`, `script.js`: frontend
- `api/roblox.js`: fixed-endpoint public Roblox API adapter, validation, caching, timeout handling
- `dev.js`: local development server with a static-file allowlist
- `tests/api.test.js`: API regression checks

The API never accepts arbitrary upstream URLs or forwards user credentials. Google Fonts is optional and has system font fallbacks. Bloxscope is an independent fan project, not affiliated with or endorsed by Roblox Corporation.

## Optional server-owned Roblox session (connection lists only)

Set `ROBLOX_SESSION_COOKIE` in Vercel Production environment variables as a **Secret**. Enter only the dedicated account’s raw `.ROBLOSECURITY` value, without the cookie name or semicolon. Never commit it, send it to chat, or put it in frontend code. Redeploy after adding or changing it. Use an account you control with no valuable assets; the credential grants account access.

The session is sent only to fixed read-only friends/followers/following endpoints on `https://friends.roblox.com`. It is never sent to thumbnails, users, avatar endpoints, redirects, arbitrary hosts, or a browser. Account actions such as follow/unfollow and friend requests are not implemented. Connection results are not CDN-cached. Server memory entries are separated by a hash of the configured session and expire after one minute; stale authenticated results are not served.

An expired or rejected session falls back to the official Roblox list links. Roblox may reject sessions from server infrastructure or apply challenges/rate limits; the setup requires a live test and does not guarantee access. It does not bypass player privacy. Remove the environment variable and redeploy to disable the integration. Never rotate accounts to evade rate limits.

## Online status and joining

`kind=presence` uses the public Roblox presence endpoint without the server account cookie. The site displays Online, In a game, In Roblox Studio, Offline or hidden, or Status unavailable. A zero/offline response is not proof that a player is offline. No background monitoring or activity history is collected. Presence is fetched on opening a profile and on manual refresh, with a 15-second cache, no stale fallback, and no CDN caching.

Last seen is explicitly unavailable because Roblox deprecated the last-online endpoint. Legacy lastOnline values are ignored. The Join exact server link is only enabled when Roblox’s public response discloses an in-game status, valid place ID, and valid server instance ID. It uses a direct Roblox app link containing that exact instance. It never falls back to a random game server, scans servers, or overrides joins-off/privacy settings. The Roblox app must be installed; admission remains controlled by Roblox. The launch format is a legacy Roblox deep link and may stop working if Roblox changes support. Actual admission to a game must be checked by Roblox.
