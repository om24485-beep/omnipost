# Driving OmniPost from an AI agent

OmniPost exposes everything through a local CLI that talks to the running app (`npm start`).
Use `--json` for structured output. Exit code is non-zero on failure and `{"error": "..."}` is printed.

| Goal | Command |
| --- | --- |
| Check state | `node cli/omnipost.js status --json` |
| List all videos across platforms | `node cli/omnipost.js feed --refresh --json` |
| Get metadata for any URL (video, profile, channel, playlist) | `node cli/omnipost.js inspect <url> --json` |
| Download a video into the library | `node cli/omnipost.js import <url> --json` → `mediaId` |
| Publish a local file or library item | `node cli/omnipost.js post <file\|mediaId> --to yt,ig,tt --title T --caption C --tags a,b --visibility public --wait --json` |
| Schedule | add `--at 2026-12-01T18:00` |
| Repost a link with credit | `node cli/omnipost.js repost <url> --to yt,ig,tt --wait --json` |
| Inspect queue | `node cli/omnipost.js jobs --json` |

Rules for agents:

- Connecting accounts (`connect <platform>`) needs a human to sign in inside the browser window. Never try to type credentials.
- Only repost content the user owns or has permission to use.
- Platform names: `youtube|yt`, `instagram|ig`, `tiktok|tt`.

The HTTP API is also available at `http://127.0.0.1:5170/api/*`. Send the header `x-omnipost-token: <contents of data/cli-token>`.
