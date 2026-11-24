# Humster

Humster is a timeline game for works of art, literature, and music.

[Play Humster](https://coderkearns.github.io/humster/)

## Create a library

Add each work with its title, artist or creator, year, kind, and game media:

- **Art:** PNG, JPEG, WebP, or GIF image.
- **Literature:** pasted excerpt.
- **Music:** MP3, WAV, OGG, or M4A audio.

Use the work grid to preview items and the pencil icon to edit them. **Save .humster** downloads a portable library file. **Open .humster** reloads one for further editing. The library is also saved in this browser using IndexedDB; download the file to back it up or transfer it to another device. A running game stays in page memory only and is lost if the page reloads.

## Start a game

1. Select **Start game** below the library editor.
2. Open a `.humster` library file, enter 2–10 team names, and choose a timeline size needed to win. The default is 10 items, including each team's starter. The library must have enough works to leave one starter for every other team while a team can reach the target.
3. On each turn, place the displayed work before, between, or after the works already in your team's timeline.

The work's year and creator are revealed after each guess. Equal-year works can go on either side of each other. Correctly placed works stay in the timeline; missed works return to the unclaimed pile. When the pile runs out, its unclaimed works are shuffled and dealt again. A team that reaches the target triggers the round finish: remaining teams take their turns before the final standings are shown. If every work is claimed before the target is reached, standings use timeline size. **See every timeline** displays the completed timelines with their work media.

## `.humster` files

A `.humster` file is a ZIP archive containing `works.json` and any image or audio files under `media/`. Literature excerpts are stored in `works.json`. Image and audio files can be up to 30 MB each; the full archive can be up to 100 MB. Literature excerpts can be up to 50,000 characters.

Each work has a title, artist/creator, integer year, and kind (`Art`, `Literature`, or `Music`). Image and audio media refer to a file under `media/`; text media contains an excerpt.

## Development

The app is a static site with native JavaScript modules; it has no server, account, framework runtime, or build step. The published site can be hosted on GitHub Pages.

- `app.js` — browser UI and event wiring.
- `src/works.js` — work validation and media rules.
- `src/library-storage.js` — IndexedDB persistence.
- `src/archive.js` — `.humster` ZIP import/export.
- `src/game-engine.js` — placement, round, win, and card-cycling rules.
- `styles.css` — responsive visual theme.

Run `npm test` for the game and archive tests.
