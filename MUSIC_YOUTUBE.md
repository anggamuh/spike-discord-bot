# YouTube audio setup

## What the log showed

- Lavalink's built-in YouTube source is already disabled in `lavalink/application.yml`; the `youtube-source` plugin is the active source.
- The configured plugin is snapshot `f45bbb7` on Lavalink 4.2.2. The installed JAR contains `YoutubeRemoteCipherConfig`, `RemoteCipherManager`, and the `/resolve_url` route, so this exact plugin build supports the current yt-cipher API. It also loaded search results; the `must find sig function` error is the local signature extractor failing on a YouTube player script.
- OAuth remains enabled and the existing refresh token has been moved out of YAML into the ignored `.env`; its value is not printed by this project. This avoids changing the OAuth session that was already refreshing successfully.
- Metadata returned by search does not prove a playable stream exists. The bot now advances through a bounded set of YouTube candidates, then existing SoundCloud and Bandcamp fallbacks. A playback `start` event or positive player position is needed before a track is considered started.

The plugin version is intentionally unchanged because the installed JAR already supports remote cipher. The observed signature error is a runtime cipher issue; the official plugin documentation describes a remote cipher service for this case. Plugin release notes alone cannot guarantee a playback fix.

With OAuth already working, `TV` is first in the configured client order because it supports OAuth playback. `WEB` and `MWEB` are the next playback options, followed by `ANDROID_VR`, `TVHTML5_SIMPLY`, and `WEBEMBEDDED`; `MUSIC` stays enabled for YouTube Music search but is last because it only returns metadata. `MWEB` is included because it can expose a playable format when `WEB` returns an empty/SABR-only format list. Login/bot-check failures from clients that do not use OAuth remain possible.

`No supported audio streams available` is a different failure: YouTube supplied no format the plugin can play. Signature decoding cannot create an audio format if YouTube did not return one. This has been reported with newer plugin builds when YouTube returns only SABR data and no downloadable formats; that remains an upstream playback limitation, not an OAuth or cipher configuration error. [Upstream report](https://github.com/lavalink-devs/youtube-source/issues/240).

## First OAuth login

1. Keep `YOUTUBE_REFRESH_TOKEN` empty in the ignored local `.env`. Keep `oauth.enabled: true` in `lavalink/application.yml`.
2. Run `npm run lavalink`. With no token configured and no `skipInitialization`, the plugin can start its official device authorization flow. Follow its instructions in the Lavalink terminal.
3. Complete authorization using a YouTube account you are willing to use for this purpose. The plugin warns that OAuth is not guaranteed and recommends a burner account. Do not paste device codes or tokens into Discord, issue trackers, or chat.
4. The plugin may print a refresh token as part of its own authorization flow. Copy it directly into your local `.env` as `YOUTUBE_REFRESH_TOKEN=...`, stop Lavalink, and restart it. The launcher passes it to Java as a Spring configuration environment property; it is not placed in Java's command-line arguments or YAML.
5. If startup reports HTTP 400, remove the token from `.env` and repeat the device flow. The launcher diagnosis never includes the token. The `.env` file is ignored by Git; `.env.example` contains only empty placeholders.

The YouTube Source plugin's own OAuth logger is set to `INFO` because the official flow needs to display authorization instructions. Treat that terminal output as sensitive during first login. The bot's custom diagnostic logger redacts tokens, device codes, authorization headers, and URLs.

OAuth can reduce some login/bot checks, but the plugin documentation does not promise every video will work. It can also trigger account restrictions. [Official OAuth instructions](https://github.com/lavalink-devs/youtube-source#using-oauth-tokens).

## Optional local signature cipher

This is optional. Leave `YT_CIPHER_ENABLED=false` to use the plugin's built-in cipher. If logs continue to show `must find sig function`, host the [yt-cipher project](https://github.com/kikkia/yt-cipher) locally; this project does not use a public cipher endpoint.

### Prepare yt-cipher on Windows

Install Deno, then from the project root in PowerShell:

```powershell
git clone https://github.com/kikkia/yt-cipher.git
Set-Location yt-cipher
git clone https://github.com/yt-dlp/ejs.git
Set-Location ejs
git checkout cd4e87f52e87ab6d8b318fd3a817adda6fafa8dc
Set-Location ..
deno run --allow-read --allow-write .\scripts\patch-ejs.ts
Set-Location ..
```

Set these values in the ignored local `.env`:

```dotenv
YT_CIPHER_ENABLED=true
YT_CIPHER_HOST=127.0.0.1
YT_CIPHER_PORT=8001
YT_CIPHER_PASSWORD=use-a-long-random-local-secret
YT_CIPHER_DIR=./yt-cipher
```

Start it in terminal 1 with `npm run yt-cipher`. The script binds only to loopback and supplies the password through the child process environment. Start Lavalink in terminal 2 with `npm run lavalink`. Before Java starts, the launcher makes an authenticated local API request and confirms yt-cipher accepts the same password; if the service is absent or the password differs, Lavalink does not start with a broken remote-cipher configuration. It passes the URL and password to the plugin through Java's environment, not YAML or process arguments.

The yt-cipher repository currently recommends the `IAS` player variant for self-hosting. The launcher uses the repository's `OVERRIDE_PLAYER_VARIANT` setting. YouTube can change its cipher again, so a local server may also need updating.

## Playback behavior and verification

Search/load and playback are diagnosed separately. The bot logs safe `[YOUTUBE LOAD]`, `[MUSIC PLAYBACK ATTEMPT]`, `[MUSIC START]`, `[MUSIC PLAYBACK ERROR]`, and `[MUSIC FALLBACK]` messages. `[MUSIC START]` is emitted only after Lavalink reports a start event and the player position advances above zero; source therefore describes the audio track that progressed, not Spotify metadata. Failures are categorized as auth, unavailable video, empty audio formats, signature cipher, or no playable SoundCloud stream. Lavalink stream-format warnings that contain signed stream URLs are suppressed.

Playback start is watched for 20 seconds. If Lavalink does not send `start` or positive position progress, the failed candidate is boundedly retried through the existing fallback path; the bot does not label that track as finished. Queue processing advances and does not retry indefinitely.

Verification commands:

```powershell
npm run build
npm test
npm run lavalink
npm start
```

Then join a voice channel and use `/play` with a YouTube title or URL. Confirm `[YOUTUBE LOAD]`, `[MUSIC PLAYBACK ATTEMPT]`, and `[MUSIC START]` in the bot terminal and listen in Discord. A local unit test cannot verify real YouTube audio or Discord voice. Also test one Spotify playlist and one SoundCloud track; their resolver integrations were left in place.
