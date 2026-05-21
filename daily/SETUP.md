# Daily Droplet — Setup Guide

A sibling to the main Droplet game. Same Arctic look and feel, same mechanics, but one shared puzzle per day with a leaderboard, streaks, stats, and a 30-day archive.

## What's in this drop

| File | Purpose |
|---|---|
| `daily_droplet.html` | The game. Single file, vanilla JS, Firebase via CDN modules. |
| `admin-daily.html` | Set today's letters, view recent plays. Password-gated. |
| `sw-daily.js` | Service worker for offline shell. |
| `manifest-daily.json` | PWA install manifest. |
| `SETUP.md` | This file. |

You'll also reuse `icon-192.png` and `icon-512.png` from the main game.

## Suggested deployment path

The cleanest approach is a sub-path on the same domain:

```
playdroplet.com/         → letter_drop.html (main game)
playdroplet.com/daily/   → daily_droplet.html
playdroplet.com/daily/admin → admin-daily.html
```

In the GitHub Pages repo, create a `daily/` folder and drop everything in. Update the manifest paths if you change the scope.

## Step-by-step

### 1. Paste in the dictionary and audio

Open `daily_droplet.html` and search for `PASTE-IN`. There are five spots, all in the `<script type="module">` block:

- **[A] `ENABLE_STRING`** — the 152,481-word space-separated dictionary from `letter_drop.html`. Just copy the whole string literal.
- **[B] `CUSTOM_WORDS`** — your 79 British/Australian + modern internet words. The first ~30 are already there as a placeholder; replace with your full list.
- **[C] `PLOP_B64`** — base64 droplet WAV.
- **[D] `SPLASH_B64`** — base64 splash WAV.
- **[E] `MUSIC_B64`** — base64 background music. Optional — leave empty to skip.
- **[F]** — confirm the `firebaseConfig` matches your project. Should already be correct for `droplet-stats-7112c`.

If you skip the audio paste-ins, the game falls back to synth tones via Web Audio API. Functional but not as nice.

### 2. Change the admin password

In `admin-daily.html`, find:

```js
const ADMIN_PASSWORD = 'CHANGE_ME';
```

Set it to something only you know. The password lives in client-side JS — it's a soft gate, not real security. Real security comes from Firestore rules (step 4).

### 3. Set up Firestore collections

You don't need to create the collections manually — they'll be created on first write. But you should know the shape:

| Collection | Doc ID | Fields |
|---|---|---|
| `dailyLetters` | `YYYY-MM-DD` | `letters: "RAT"`, `puzzleNumber: 47`, `createdAt` |
| `dailyPlays` | `{uid}_{YYYY-MM-DD}` | `uid`, `name`, `date`, `puzzleNumber`, `letters`, `score`, `wordsFound`, `topWord`, `words[]`, `timestamp` |
| `streaks` | `{uid}` | `current`, `longest`, `lastPlayedDate` |
| `dailyStats` | `{uid}` | `games`, `totalScore`, `totalWords`, `bestScore`, `lastPlayedDate` |

### 4. Firestore rules

Your existing rules are `allow read, write: if true`. The daily game keeps the same posture for now, but here's a tighter set you can drop in when you're ready to lock things down:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Daily letters: anyone reads, only admin writes (handled outside rules for now)
    match /dailyLetters/{date} {
      allow read: if true;
      allow write: if true;  // tighten once you add auth
    }

    // Daily plays: write once, no overwrites — the transaction in the game enforces this
    match /dailyPlays/{playId} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if false;
    }

    // Streaks / stats: write by anyone (UID-scoped, enforced client-side for now)
    match /streaks/{uid} {
      allow read, write: if true;
    }
    match /dailyStats/{uid} {
      allow read, write: if true;
    }

    // Keep your existing collections (games, users, topscores, highscores, dau, daily)
    // matching their current rules.
  }
}
```

The transaction in `savePlayToFirebase()` already checks for an existing play doc and aborts if found, so even with permissive rules a player can't double-write their own day.

### 5. Composite index for the leaderboard

The leaderboard query is:

```js
where('date', '==', dateKey).orderBy('score', 'desc').limit(100)
```

Firestore needs a composite index for this. First time the query runs, the SDK throws an error in the console with a one-click link to create it. Click that link. Or set it up manually in the Firebase console:

- Collection: `dailyPlays`
- Fields: `date` Ascending, `score` Descending
- Query scope: Collection

### 6. Set the first puzzle

1. Deploy `admin-daily.html` somewhere only you can reach (or just run it locally).
2. Log in with your password.
3. Pick a date (defaults to today), enter 3 letters in CVC pattern (e.g. `RAT`, `BIN`, `LOG`), confirm puzzle number, save.
4. The game will pick it up on next load.

**Suggested letter selection workflow:** The main game's `pickBase()` already filters base combinations to those with ≥1,300 possible words. For the daily game, you want similar quality. A few options:

- Generate candidates by running the main game's `pickBase()` logic in the browser console and copying the result.
- Hand-pick letters and check `countPotential(baseLetters).length` in the daily game's console to confirm word count.
- Aim for 1,500–4,000 possible words. Too few feels punishing, too many feels easy.

### 7. Test the flow

1. Visit `daily_droplet.html` in a private/incognito window (so you get a fresh UID).
2. Pregame screen should show today's letters and puzzle number.
3. Play a game.
4. Game-over screen should show medal, score, words, streak badge, leaderboard rank, share button, countdown.
5. Refresh — you should land on the locked screen with "See my result" leading back to the game-over.
6. Open the archive — past puzzles should be playable but won't affect your streak.

### 8. Going live

When you're ready:
- Add a link from the main game to the daily version (and vice versa).
- Add `daily_droplet.html` and assets to your repo's root or `/daily/` folder.
- Update `manifest.json` for the main game if you want them as separate installable PWAs (they should be — different `start_url` and `scope`).

## Design choices worth knowing about

- **One play per UID per day** is enforced by a Firestore transaction that checks for an existing `{uid}_{date}` doc before writing. Bypass by clearing localStorage gives a new UID, so this is friction not a vault. For real anti-cheating you'd need Firebase Auth + server-side validation.
- **Streaks** count consecutive days. Missing a day resets to 1 on next play. Playing the archive doesn't affect the streak.
- **Display names** are auto-generated (FrostyOtter, GlacialNarwhal, etc.) on first launch. Users can change theirs from the Stats panel. Names are not unique.
- **Share text** uses the format `Daily Droplet #N · LET · X pts · Y words` — keeps it tight for X/Bluesky/SMS.
- **Archive depth** is the last 30 days. Change `limit(30)` in `fetchArchive()` to adjust.
- **No score-tampering protection** beyond the transaction. The leaderboard shows what got written. Same as the main game's posture for now.

## Known caveats / pending

- **Display name uniqueness** — collisions are possible but unlikely. Add a check if it matters.
- **Time zones** — `todayKey()` uses the player's local date. Two players in different time zones might play "different days" simultaneously, and the leaderboard partitions accordingly. This is the right call for a casual daily game; if you'd rather have one global puzzle day, switch to UTC.
- **Archive scoring** — past puzzles can be played for fun and the score is shown on the archive list, but it's read from `dailyPlays` which only stores the actual-day play. Archive replays don't write anywhere, so the archive list only shows your real plays.
- **Firebase quota** — every game write touches three docs (play, streak, stats). At 10k DAU that's 30k writes/day, well within free tier. Reads are heavier — leaderboard fetches can spike. Consider denormalising into a small `dailyLeaderboard/{date}` summary doc later.

## File map for deployment

If using `/daily/` sub-path:

```
playdroplet.com/daily/
  ├── daily_droplet.html       (rename to index.html on deploy if you like)
  ├── admin-daily.html
  ├── sw-daily.js
  ├── manifest-daily.json
  ├── icon-192.png             (symlink or copy from main)
  └── icon-512.png
```

The manifest assumes `/daily/` scope. If you put files at the root, edit `start_url` and `scope` accordingly and adjust paths in `sw-daily.js`.

---

That's it. Paste in the dictionary, set a puzzle, and you should be live.
