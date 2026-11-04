# NCS Treasure Hunt — web app

Church treasure trails that run in the phone's web browser: Safari on iPhone/iPad, Chrome on Android. No app store needed. Players can add it to their home screen, where it opens full-screen like a normal app.

## Put it online (about 5 minutes)

The app must be served over **https://**. Phones only share their location with secure sites.

### Option 1: Netlify Drop (easiest)
1. Unzip `ncs-treasure-hunt.zip` so you have the `ncs-treasure-hunt` folder.
2. Go to https://app.netlify.com/drop on your laptop.
3. Drag the `ncs-treasure-hunt` folder onto the page.
4. Sign up or log in (free) to claim the site. Until you claim it, Netlify puts a temporary password on it.
5. You get an address like `https://something.netlify.app`. In Site settings you can rename it, e.g. `ncs-treasure-hunt.netlify.app`.

To update later: open the site in the Netlify dashboard, go to Deploys, and drag the updated folder onto the drop area.

### Option 2: GitHub Pages
1. Create a new public repository on github.com, e.g. `ncs-treasure-hunt`.
2. Upload the contents of the `ncs-treasure-hunt` folder (not the folder itself) with "Add file › Upload files".
3. Settings › Pages › Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
4. After a minute the app is at `https://<your-username>.github.io/ncs-treasure-hunt/`.

## Playing on a phone

**iPhone / iPad (Safari)**
1. Open the address in Safari.
2. Tap Share (the square with an up arrow) › **Add to Home Screen**.
3. Open it from the home screen and tap **Start the hunt**. Allow location when asked.
4. If location was refused: Settings › Privacy & Security › Location Services › Safari Websites › **While Using the App**.

**Android (Chrome)**
1. Open the address in Chrome.
2. Tap **Install** on the start screen, or ⋮ menu › **Add to Home screen**.
3. Tap **Start the hunt** and allow location.

**Test mode:** "Try it at home (test mode)" lets you play from anywhere. Tap the map to move, or use "Jump to this stop".

## How it works

| File | Purpose |
|---|---|
| `index.html` | Start screen and game screen |
| `app.js` | Game logic: GPS, distances, unlocking, answers, scoring, saving progress |
| `styles.css` | Look and feel, light and dark mode |
| `hunts/*.json` | **The routes.** One file per hunt: stops, clues, photos, questions, answers |
| `manifest.webmanifest`, `icons/` | Makes it installable to the home screen |
| `sw.js` | Offline support: caches the app and map tiles you've viewed |
| `vendor/leaflet/` | Map library (Leaflet 1.9.4) with OpenStreetMap tiles |

- A stop unlocks when the phone is within `radius` metres (35 m), plus a little extra for GPS wobble.
- Progress is saved on the phone, so closing the browser mid-hunt is fine.
- The screen is kept awake while playing, on phones that support it.

## The hunts

Church trails, any denomination:
- **Greenwich Churches** (`hunts/greenwich-churches.json`): St Alfege, Our Ladye Star of the Sea, the Chapel at the Old Royal Naval College, Trinity Hospital.
- **Westminster Churches** (`hunts/westminster-churches.json`): St Margaret's, Westminster Abbey, Methodist Central Hall, the Guards' Chapel, Westminster Cathedral, Smith Square Hall.

`hunts/index.json` lists which hunts appear on the start screen, in order.

## Making a new hunt

1. Copy one of the hunt files, e.g. to `hunts/city-churches.json`, and give it a new `id` matching the file name.
2. Add the id to `hunts/index.json`.

Each stop has:

| Field | Meaning |
|---|---|
| `name`, `lat`, `lon` | The church and where to stand. Get coordinates by right-clicking in Google Maps. |
| `clue` | How to find it and what to look for |
| `photo` | Optional photo clue (see below) |
| `inside` | `true` if the answer is inside the church; shows a note about opening hours and services |
| `question`, `hint`, `fact` | Asked on arrival; hint costs 25 points; fact shown after answering |
| `match` / `exact` | Accepted answers (see below) |

Answers are matched loosely: case, spaces and punctuation are ignored.
- `"match": ["tail"]` accepts any answer *containing* "tail".
- `"exact": ["1616"]` accepts only those answers (use it for numbers and dates).

### Photo clues

```json
"photo": {
  "src": "photos/st-alfege-keyboard.jpg",
  "kind": "detail",
  "caption": "Find this keyboard",
  "credit": "Your Name",
  "licence": "All rights reserved",
  "link": "https://..."
}
```

- `kind: "detail"` shows "Find this detail"; `kind: "view"` shows "Look out for this".
- The current photos are Creative Commons (CC BY-SA 2.0) images from Geograph. The licence requires the photographer's credit, which the app shows under each photo. Keep it.
- To use your own photos, put them in a `photos/` folder and point `src` at them, e.g. `photos/st-alfege-keyboard.jpg`. Close-ups of a specific carving, window or inscription make the best "find this detail" clues. Keep each under about 300 KB.

### Photo check page

Open the app with `?photos` on the end, e.g. `https://brandjonathan2-prog.github.io/ncs-treasure-hunt/?photos`. It shows every stop's photo, clue, question and accepted answers on one page, so you can check them.

## Before going public
- Walk the route once to check each clue is visible and each answer is right.
- OpenStreetMap's tile servers are fine for personal and light use. For heavy public traffic, switch to a commercial tile provider (e.g. MapTiler or Stadia Maps). It's a one-line change in `app.js`.
- After changing files, bump `VERSION` in `sw.js` so phones pick up the update.
