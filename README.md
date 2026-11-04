# NCS Treasure Hunt — web app

Walking treasure hunts that run in the phone's web browser: Safari on iPhone/iPad, Chrome on Android. No app store needed. Players can add it to their home screen, where it opens full-screen like a normal app.

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
| `hunts/greenwich.json` | **The route.** Stops, clues, questions, answers, hints, facts |
| `manifest.webmanifest`, `icons/` | Makes it installable to the home screen |
| `sw.js` | Offline support: caches the app and map tiles you've viewed |
| `vendor/leaflet/` | Map library (Leaflet 1.9.4) with OpenStreetMap tiles |

- A stop unlocks when the phone is within `radius` metres (35 m), plus a little extra for GPS wobble.
- Progress is saved on the phone, so closing the browser mid-hunt is fine.
- The screen is kept awake while playing, on phones that support it.

## The hunts

The first hunt is the **Greenwich Meridian Hunt** (`hunts/greenwich.json`), 7 stops from Cutty Sark to the Royal Observatory. It loads by default.

## Making a new hunt

Copy `hunts/greenwich.json` to e.g. `hunts/soho.json`, edit it, and open the app with `?hunt=soho` on the end of the address.

Answers are matched loosely: case, spaces and punctuation are ignored.
- `"match": ["tail"]` accepts any answer *containing* "tail" ("a horse's tail", "Tail").
- `"exact": ["1pm", "1300"]` accepts only those answers (use it for numbers and times).

Tip: get coordinates by right-clicking a spot in Google Maps; the first item in the menu is the latitude, longitude.

## Before going public
- Walk the route once to check each clue is visible and each answer is right.
- OpenStreetMap's tile servers are fine for personal and light use. For heavy public traffic, switch to a commercial tile provider (e.g. MapTiler or Stadia Maps). It's a one-line change in `app.js`.
- After changing files, bump `VERSION` in `sw.js` so phones pick up the update.
