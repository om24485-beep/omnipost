# OmniPost

**Every video. Every platform. One place.** A free, keyless, local-first hub for creators:

- **Sign in with Google**, using the account already signed in to your browser (via the free Connector extension or Google's own popup). No client secret needed.
- **Connect YouTube, Instagram and TikTok**: you sign in on the real sites, and OmniPost never sees or stores your password.
- **One unified feed** of all your videos, Shorts, Reels and TikToks, with views, likes, search, sorting and an inline player.
- **Post once, publish everywhere.** Pick a video, choose the platforms, optionally customize the caption per platform, add hashtags, then publish now or schedule it.
- **Repost from any link.** Paste a YouTube / Instagram / TikTok / X / Facebook / Reddit / … link (1,800+ sites via yt-dlp), preview it, then post it to your accounts with an automatic creator credit. Paste a channel or profile link to bulk-import.
- **Built-in video tools:** automatic H.264/AAC conversion so Instagram and TikTok accept the file, plus a one-click **9:16 reframe** with a blurred fill for Shorts, Reels and TikTok.
- **Agent-native CLI.** Every action is scriptable with `--json` output, so cron jobs and AI agents can drive it.

It costs **$0 to run and $0 to post**. There are no API keys, no paid APIs and no cloud servers. Everything runs on your computer.

---

## Quick start

Requirements: **Node.js 20.12+** and **Google Chrome, Microsoft Edge or Brave**.

```bash
git clone https://github.com/om24485-beep/omnipost.git
cd omnipost
npm install        # also builds the web UI
npm start          # opens http://localhost:5170
```

1. *(Recommended)* Install the **OmniPost Connector** extension so you never sign in twice (see below).
2. Click **Continue with Google**. With the Connector, OmniPost uses the Google account already signed in to your browser. Without it, a separate Chrome or Edge window opens and you sign in there.
3. YouTube connects automatically from the same Google session. On **Accounts**, click **Import my logins** (Connector) or **Connect** for Instagram and TikTok.
4. Your feed fills in. Go to **Create**, drop a video, tick the platforms, and **Publish**.

### OmniPost Connector extension (one-time, about 30 seconds)

OmniPost posts through its own browser profile, so by default you'd sign in to each site a second time there. The Connector copies the logins you already have in your everyday Chrome / Edge / Brave into OmniPost instead.

1. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `extension` folder inside this project.
3. Reload OmniPost. The sign-in button now says **Continue as the Google account in this browser**.

It only reads cookies for google.com, youtube.com, instagram.com and tiktok.com, and only hands them to the OmniPost page on `localhost`. Nothing is sent anywhere else. If a copied Google login stops working after a while (Chrome can bind Google sessions to the original browser), click **Connect** on YouTube and sign in once in the OmniPost window.

### Official Google popup (optional, free Client ID)

To get Google's own "Sign in with Google" popup, pre-filled with your browser's account:

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials** → **OAuth client ID**. If asked, configure the consent screen first (External, app name "OmniPost", your email).
2. Application type **Web application**. Under **Authorized JavaScript origins** add both `http://localhost` and `http://localhost:5170`.
3. Copy the Client ID (it ends in `.apps.googleusercontent.com`).
4. Copy `.env.example` to `.env` in the project folder, paste it after `GOOGLE_CLIENT_ID=`, and restart `npm start`.

No client secret and no billing are needed. This popup signs you in to OmniPost only. YouTube posting still uses the Connector or a one-time sign-in in the OmniPost window.

On first run OmniPost downloads the official **yt-dlp** binary from GitHub and checks it against the published SHA-256 sums. ffmpeg comes bundled through `ffmpeg-static`.

## How it works (and why no keys are needed)

| Piece | What it uses |
| --- | --- |
| Google sign-in | The Connector extension copies your browser's Google login into OmniPost's profile, or you sign in once inside that profile. OmniPost then reads your name and email from your own Google Account page. Optionally, `GOOGLE_CLIENT_ID` enables Google's official popup (free, no secret). |
| Platform connections | A real Chrome/Edge/Brave with its own OmniPost profile (`data/browser-profile`), controlled over the Chrome DevTools Protocol with `playwright-core`. Sessions are your normal cookies and stay on your machine. |
| Unified feed | YouTube comes from yt-dlp's channel listing. Instagram comes from instagram.com's own web endpoints, called inside your logged-in tab. TikTok is read from your profile page. |
| Posting | Drives the official web uploaders (YouTube Studio, Instagram "Create", TikTok Studio) step by step, the same way you would click through them. This is the approach used by projects like [social-auto-upload](https://github.com/dreammis/social-auto-upload). |
| Repost / download | [yt-dlp](https://github.com/yt-dlp/yt-dlp), the engine popular downloaders such as [OmniGet](https://github.com/tonhowtf/omniget) build on. If a site needs a login, OmniPost retries automatically with your connected session's cookies. |
| Video processing | ffmpeg (bundled). |

```
web/ (React + Tailwind)  ──REST + SSE──▶  server/ (Express, 127.0.0.1 only)
                                            ├─ lib/browser.js    real Chrome over CDP
                                            ├─ lib/tools.js      yt-dlp + ffmpeg
                                            ├─ lib/jobs.js       queue, scheduler, retries
                                            └─ platforms/*.js    one adapter per network
cli/omnipost.js  ──same REST API (local token)──┘
```

## CLI

The app must be running (`npm start`). Add `--json` to any command for machine-readable output.

```bash
npm run cli -- status
npm run cli -- feed --refresh
npm run cli -- inspect "https://www.instagram.com/reel/XXXX/"
npm run cli -- import  "https://youtu.be/XXXX"
npm run cli -- post ./clip.mp4 --to yt,ig,tt --caption "New drop 🔥" --tags shorts,reels --wait
npm run cli -- repost "https://www.tiktok.com/@user/video/123" --to yt,ig --at 2026-12-01T18:00
npm run cli -- jobs
```

You can also install it globally with `npm link`, then use `omnipost <command>`.

## Configuration (all optional)

Put these in a `.env` file in the project folder (see `.env.example`) or set them in your shell.

| Env var | Purpose |
| --- | --- |
| `PORT` | Server port (default `5170`). |
| `OMNIPOST_DATA` | Where the database, media and browser profile live (default `./data`). |
| `BROWSER_PATH` | Path to a specific Chromium-based browser. |
| `GOOGLE_CLIENT_ID` | Enables Google's official sign-in popup. Add `http://localhost` and `http://localhost:5170` as authorized JavaScript origins. |
| `YTDLP_PATH` / `FFMPEG_PATH` | Use your own binaries. |
| `NO_OPEN=1` | Don't open the browser on start. |

Development: `npm run dev` runs the API with auto-reload and Vite with hot reload on http://localhost:5173.

## Adding a platform

Create `server/platforms/<name>.js` that exports `{ id, name, limits, loginUrl, isLoggedIn(cookies), profile(page, cookies), feed(account, { withPage }), upload(page, post, { step, account }) }`, then register it in `server/platforms/index.js`. The UI picks it up automatically. You'll also want to add an icon and colors in `web/src/ui.jsx`.

## Good to know

- **Keep OmniPost running** for scheduled posts to go out. It's a local app, not a cloud service.
- **Site changes:** posting works by clicking through each site's web UI. When YouTube, Instagram or TikTok redesign their upload pages, an adapter may need a selector update. Failed uploads keep a screenshot (Queue → *Screenshot*) so you can see where it stopped. Keep the sites' language set to **English**.
- **Leave "Show the browser while posting" on** (it's the default). If a site asks for a captcha or 2FA, you can complete it in the window.
- **Google sign-in** can occasionally be refused in automated profiles. If that happens, set `GOOGLE_CLIENT_ID` and use the official button.
- **Reposting:** only repost videos you own or have permission to use. OmniPost adds a creator credit automatically, and you confirm rights before posting imported content. Automating your own account may still conflict with a platform's terms, so use reasonable volumes.
- **Privacy:** the server binds to `127.0.0.1` and rejects requests for non-local hosts. Sessions, media and the database never leave `data/`. Delete that folder to reset everything. Delete `data/db.json` to reset the workspace owner.

## License

MIT
