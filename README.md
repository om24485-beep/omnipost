# OmniPost

**Every video. Every platform. One place.** A free, keyless, local-first hub for creators:

- **Sign in with Google**: no OAuth app or client secret needed.
- **Connect YouTube, Instagram and TikTok**: you sign in on the real sites, and OmniPost never sees or stores your password.
- **One unified feed** of all your videos, Shorts, Reels and TikToks, with views, likes, search, sorting and an inline player.
- **Post once, publish everywhere.** Pick a video, choose the platforms, optionally customize the caption per platform, add hashtags, then publish now or schedule it.
- **Repost from any link.** Paste a YouTube / Instagram / TikTok / X / Facebook / Reddit / … link (1,800+ sites via yt-dlp), preview it, then post it to your accounts with an automatic creator credit. Paste a channel or profile link to bulk-import.
- **Built-in video tools:** automatic H.264/AAC conversion so Instagram and TikTok accept the file, plus a one-click **9:16 reframe** with a blurred fill for Shorts, Reels and TikTok.
- **Agent-native CLI.** Every action is scriptable with `--json` output, so cron jobs and AI agents can drive it.

It costs **$0 to run and $0 to post**. There are no API keys, no paid APIs and no cloud servers. Everything runs on your computer.

---

## Quick start

Requirements: **Node.js 20+** and **Google Chrome, Microsoft Edge or Brave**.

```bash
git clone https://github.com/om24485-beep/omnipost.git
cd omnipost
npm install        # also builds the web UI
npm start          # opens http://localhost:5170
```

1. Click **Continue with Google**. A normal Chrome or Edge window opens, and you sign in there.
2. YouTube connects automatically from the same Google session. Connect Instagram and TikTok on **Accounts**.
3. Your feed fills in. Go to **Create**, drop a video, tick the platforms, and **Publish**.

On first run OmniPost downloads the official **yt-dlp** binary from GitHub and checks it against the published SHA-256 sums. ffmpeg comes bundled through `ffmpeg-static`.

## How it works (and why no keys are needed)

| Piece | What it uses |
| --- | --- |
| Google sign-in | You sign in inside a dedicated browser profile, and OmniPost reads your name and email from your own Google Account page. Optionally, set `GOOGLE_CLIENT_ID` to also show the official Google button. A client ID is free and needs no secret. |
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

| Env var | Purpose |
| --- | --- |
| `PORT` | Server port (default `5170`). |
| `OMNIPOST_DATA` | Where the database, media and browser profile live (default `./data`). |
| `BROWSER_PATH` | Path to a specific Chromium-based browser. |
| `GOOGLE_CLIENT_ID` | Shows the official "Sign in with Google" button. Add `http://localhost:5170` as an authorized JavaScript origin. |
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
