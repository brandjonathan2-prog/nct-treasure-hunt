/* NCT Treasure Hunt — game logic
   Works in Safari (iPhone/iPad) and Chrome (Android). Needs HTTPS for GPS. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const HUNT_ID = (params.get("hunt") || "").replace(/[^a-z0-9-]/gi, "");
  const keyFor = id => `nct-hunt-${id}-v1`;
  const goTo = id => { location.href = id ? `?hunt=${encodeURIComponent(id)}` : location.pathname; };

  /* ---------- Geo helpers ---------- */
  const R = 6371000, rad = d => d * Math.PI / 180;
  function dist(a, b) {
    const dl = rad(b.lat - a.lat), dn = rad(b.lon - a.lon);
    const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dn / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  const compass = d => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];
  const fmtDist = d => d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(d < 10000 ? 2 : 0)} km`;
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- State (saved on the phone so a closed tab can resume) ---------- */
  const KEY = keyFor(HUNT_ID);
  const fresh = () => ({ i: 0, score: 0, unlocked: false, tries: 0, hint: false, solved: false, results: [], started: false });
  let S = fresh();
  try { const s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(KEY.replace("nct-", "ncs-")) || "null"); if (s && typeof s.i === "number") S = { ...S, ...s }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  let HUNT, map, layers = {}, pos = null, acc = null, mode = "none", watchId = null, msg = null, followed = false;

  /* ---------- Boot ---------- */
  const getJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  setupInstall();
  if (params.has("photos")) initPhotoCheck();
  else if (!HUNT_ID) initChooser();
  else getJSON(`hunts/${HUNT_ID}.json`)
    .then(h => { HUNT = h; initIntro(); })
    .catch(() => { $("intro").hidden = false; $("geoNote").hidden = false; $("introTitle").textContent = "Hunt not found";
      $("geoNote").textContent = "This hunt couldn't be loaded. Check your connection, or go back to the list of hunts."; });
  $("backBtn").onclick = () => goTo("");

  /* ---------- Photo clues ---------- */
  function photoCard(p) {
    const label = p.kind === "detail" ? "Find this detail" : "Look out for this";
    return `<figure class="photo" data-src="${esc(p.src)}">
      <span class="photo-label">${label}</span>
      <button type="button" class="photo-btn" aria-label="Enlarge photo"><img src="${esc(p.src)}" alt="${esc(p.caption || label)}" loading="lazy" onerror="this.closest('figure').classList.add('broken')"></button>
      <figcaption><span>${esc(p.caption || "")}</span><a href="${esc(p.link)}" target="_blank" rel="noopener">Photo © ${esc(p.credit)}, ${esc(p.licence)}</a></figcaption>
      <p class="photo-missing">The photo couldn't load. Check your connection.</p>
    </figure>`;
  }
  function openLightbox(src, alt) {
    const lb = $("lightbox"); $("lbImg").src = src; $("lbImg").alt = alt || ""; lb.hidden = false; $("lbClose").focus();
  }
  $("lbClose").onclick = () => { $("lightbox").hidden = true; };
  $("lightbox").onclick = e => { if (e.target.id === "lightbox") $("lightbox").hidden = true; };
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("lightbox").hidden = true; });
  document.addEventListener("click", e => {
    const b = e.target.closest(".photo-btn"); if (!b) return;
    const img = b.querySelector("img"); openLightbox(img.src, img.alt);
  });

  /* ---------- Photo check (open the app with ?photos) ---------- */
  function initPhotoCheck() {
    $("photocheck").hidden = false;
    const out = $("pcList");
    getJSON("hunts/index.json")
      .then(ix => Promise.all(ix.hunts.map(id => getJSON(`hunts/${id}.json`).catch(() => null))))
      .then(hunts => {
        out.innerHTML = hunts.filter(Boolean).map(h => `<section class="pc-hunt"><h2>${esc(h.title)}</h2>${h.stops.map((s, k) => `
          <article class="pc-stop"><p class="eyebrow"><span>Stop ${k + 1}</span></p><h3>${esc(s.name)}</h3>
          ${s.photo ? photoCard(s.photo) : `<p class="locked">No photo yet.</p>`}
          <p class="clue"><b>Clue:</b> ${esc(s.clue)}</p><p class="clue"><b>Question:</b> ${esc(s.question)}</p>
          <p class="clue"><b>Accepted answers:</b> ${esc((s.exact || s.match).join(", "))}${s.exact ? " (exact)" : " (contains)"}</p></article>`).join("")}</section>`).join("");
      });
  }

  /* ---------- Hunt chooser ---------- */
  function initChooser() {
    $("chooser").hidden = false;
    const list = $("huntList");
    getJSON("hunts/index.json")
      .then(ix => Promise.all(ix.hunts.map(id => getJSON(`hunts/${id}.json`).catch(() => null))))
      .then(hunts => {
        list.innerHTML = "";
        hunts.filter(Boolean).forEach(h => {
          let p = null; try { p = JSON.parse(localStorage.getItem(keyFor(h.id)) || "null"); } catch (e) {}
          const n = h.stops.length;
          const state = !p || !p.started ? "" : p.i >= n ? `<span class="state done">Completed · ${p.score} points</span>`
            : `<span class="state going">In progress · stop ${p.i + 1} of ${n}</span>`;
          const li = document.createElement("li");
          li.innerHTML = `<button class="hunt-card"><span class="area">${esc(h.area || "")}</span><span class="name">${esc(h.title)}</span><span class="meta">${esc(h.subtitle)}</span>${state}</button>`;
          li.firstChild.onclick = () => goTo(h.id);
          list.appendChild(li);
        });
      })
      .catch(() => { list.innerHTML = `<li class="hunt-loading">The hunts couldn't be loaded. Check your connection and reload the page.</li>`; });
  }

  function initIntro() {
    document.title = `${HUNT.title} · NCT Treasure Hunt`;
    $("introTitle").textContent = HUNT.title; $("barTitle").textContent = HUNT.title;
    $("introSub").textContent = HUNT.subtitle;
    $("introRadius").textContent = HUNT.radius;
    $("introStart").innerHTML = `Start at <b>${esc(HUNT.start.label)}</b>.`;
    $("intro").hidden = false;
    if (S.started && S.i > 0) $("startBtn").textContent = `Continue from stop ${Math.min(S.i + 1, HUNT.stops.length)}`;
    $("startBtn").onclick = startLive;
    $("testBtn").onclick = startTest;
  }

  function enterGame() {
    S.started = true; save();
    $("intro").hidden = true; $("app").hidden = false;
    if (!map) initMap(); else map.invalidateSize();
    requestWakeLock();
    render();
  }

  /* ---------- Location ---------- */
  function startLive() {
    if (!("geolocation" in navigator)) return geoFail({ code: 0 });
    if (!window.isSecureContext) return geoFail({ code: -1 });
    $("startBtn").disabled = true; $("startBtn").textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(p => {
      mode = "live"; onPos(p); enterGame();
      watchId = navigator.geolocation.watchPosition(onPos, e => { if (e.code === 1) geoLost(); },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
    }, geoFail, { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  }
  function onPos(p) {
    pos = { lat: p.coords.latitude, lon: p.coords.longitude }; acc = p.coords.accuracy;
    checkArrival(); if (map) { updateMe(); if (!followed) { followed = true; render(); refit(); } else render(); }
  }
  function geoFail(e) {
    $("startBtn").disabled = false; $("startBtn").textContent = "Start the hunt";
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const t = {
      1: ios ? "Location is blocked. On iPhone go to Settings › Privacy & Security › Location Services › Safari Websites and choose “While Using”, then try again."
             : "Location is blocked. Tap the lock icon next to the address, allow Location, then try again.",
      2: "Your phone couldn't get a location fix. Step outside or wait a moment and try again.",
      3: "Finding your location took too long. Try again outdoors.",
      0: "This browser doesn't support location. Try Safari on iPhone or Chrome on Android.",
      "-1": "Location only works when the page is opened over https://."
    }[e.code] || "Couldn't get your location.";
    $("geoNote").hidden = false; $("geoNote").textContent = t + " You can also try test mode.";
  }
  function geoLost() { msg = { t: "Location access was turned off. Switch on location for this site or use test mode.", c: "bad" }; render(); }

  function startTest() {
    mode = "test";
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    pos = pos || { lat: HUNT.start.lat, lon: HUNT.start.lon }; acc = 5;
    enterGame(); updateMe(); refit();
  }

  /* ---------- Screen wake lock (keeps the map on while walking) ---------- */
  let lock = null;
  async function requestWakeLock() { try { if ("wakeLock" in navigator) lock = await navigator.wakeLock.request("screen"); } catch (e) {} }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.started) requestWakeLock(); });

  /* ---------- Map ---------- */
  function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    map.setView([HUNT.stops[0].lat, HUNT.stops[0].lon], 16);
    loadLegs();
    map.on("click", e => { if (mode === "test") { pos = { lat: e.latlng.lat, lon: e.latlng.lng }; acc = 5; updateMe(); checkArrival(); render(); } });
    $("recentre").onclick = frame;
    if ("ResizeObserver" in window) new ResizeObserver(() => map.invalidateSize()).observe($("map"));
    drawRoute();
  }
  /* Walking route for each leg: legs[k] runs from the previous stop (or the start) to stop k.
     Uses routes stored in the hunt file; otherwise asks the OpenStreetMap walking router once
     and keeps the answer on the phone; otherwise falls back to straight lines. */
  const LEGS_KEY = () => `nct-legs-${HUNT.id}-v1`;
  let legs = null;
  function legPoints(k) {
    if (legs && legs[k] && legs[k].p) return legs[k].p;
    const a = k === 0 ? HUNT.start : HUNT.stops[k - 1], b = HUNT.stops[k];
    return [[a.lat, a.lon], [b.lat, b.lon]];
  }
  function loadLegs() {
    if (HUNT.legs) { legs = HUNT.legs; return; }
    try { const c = JSON.parse(localStorage.getItem(LEGS_KEY()) || "null"); if (c && c.length === HUNT.stops.length) { legs = c; return; } } catch (e) {}
    const pts = [HUNT.start, ...HUNT.stops];
    Promise.all(HUNT.stops.map((b, k) => {
      const a = pts[k];
      return fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=false`)
        .then(r => r.json()).then(j => { const r = j.routes[0]; return { m: Math.round(r.distance), s: Math.round(r.duration), p: r.geometry.coordinates.map(c => [c[1], c[0]]) }; });
    })).then(res => {
      legs = res; try { localStorage.setItem(LEGS_KEY(), JSON.stringify(res)); } catch (e) {}
      if (map) { drawRoute(); render(); }
    }).catch(() => {}); // straight lines stay
  }
  function drawRoute() {
    Object.values(layers).forEach(l => l && map.removeLayer(l));
    const st = HUNT.stops, ll = s => [s.lat, s.lon], route = getVar("--route"), chart = getVar("--chart");
    layers.paths = L.layerGroup(st.map((_, k) => {
      const pts = legPoints(k);
      if (k < S.i) return L.polyline(pts, { color: route, weight: 4, opacity: .75 });
      if (k === S.i) return L.polyline(pts, { color: chart, weight: 6, opacity: .9, lineCap: "round", lineJoin: "round" });
      return L.polyline(pts, { color: route, weight: 3, opacity: .4, dashArray: "6 8" });
    })).addTo(map);
    layers.start = L.marker(ll(HUNT.start), { icon: L.divIcon({ className: "", html: '<div class="pin start" title="Start">S</div>', iconSize: [24, 24], iconAnchor: [12, 12] }), keyboard: false, interactive: false }).addTo(map);
    layers.pins = L.layerGroup(st.map((s, k) => {
      const cls = k < S.i ? "done" : k === S.i ? "cur" : "";
      const size = cls === "cur" ? 34 : 28;
      return L.marker(ll(s), { icon: L.divIcon({ className: "", html: `<div class="pin ${cls}">${k < S.i ? "✓" : k + 1}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        zIndexOffset: cls === "cur" ? 500 : 0, keyboard: false });
    })).addTo(map);
    const cur = st[S.i];
    layers.fence = cur ? L.circle(ll(cur), { radius: HUNT.radius, color: chart, weight: 1, fillOpacity: .12 }).addTo(map) : null;
    if (layers.me) layers.me.addTo(map);
  }
  function updateMe() {
    if (!pos || !map) return;
    if (!layers.me) layers.me = L.marker([pos.lat, pos.lon], { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, interactive: false }).addTo(map);
    else layers.me.setLatLng([pos.lat, pos.lon]);
  }
  function frame() {
    const k = Math.min(S.i, HUNT.stops.length - 1);
    const pts = legPoints(k).slice();
    if (pos && dist(pos, HUNT.stops[k]) < 5000) pts.push([pos.lat, pos.lon]);
    map.fitBounds(pts, { padding: [50, 50], maxZoom: 18 });
  }
  const getVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------- Game flow ---------- */
  function checkArrival() {
    const s = HUNT && HUNT.stops[S.i]; if (!s || !pos || S.unlocked) return;
    const slack = Math.min(acc || 0, 20); // forgive some GPS wobble
    if (dist(pos, s) <= HUNT.radius + slack) {
      S.unlocked = true; save();
      msg = { t: "You've arrived. Answer the question to move on.", c: "good" };
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    }
  }
  const points = () => Math.max(25, 100 - (S.hint ? 25 : 0) - S.tries * 10);
  function answer(v) {
    const s = HUNT.stops[S.i], n = norm(v); if (!n) return;
    const ok = s.exact ? s.exact.includes(n) : s.match.some(m => n.includes(m));
    if (ok) { const p = points(); S.score += p; S.solved = true; S.results.push({ name: s.name, pts: p }); msg = { t: `Correct. +${p} points.`, c: "good" }; }
    else { S.tries++; msg = { t: S.tries >= 3 ? "Not quite. Take a hint or skip this one." : "Not quite. Try again.", c: "bad" }; }
    save(); render();
  }
  function next() { S.i++; S.unlocked = false; S.tries = 0; S.hint = false; S.solved = false; msg = null; checkArrival(); save(); drawRoute(); render(); $("sheet").scrollTop = 0; if (S.i < HUNT.stops.length) refit(); }
  // Frame the map after the sheet below it has settled to its new height
  function refit() { requestAnimationFrame(() => { map.invalidateSize(); frame(); }); }
  function skip() { S.results.push({ name: HUNT.stops[S.i].name, pts: 0 }); S.solved = true; msg = { t: "Skipped. No points for this stop.", c: "bad" }; save(); render(); }
  function restart() { S = { ...fresh(), started: true }; msg = null; save(); checkArrival(); drawRoute(); frame(); render(); }

  /* ---------- Bottom sheet ---------- */
  function render() {
    if (!HUNT || $("app").hidden) return;
    const st = HUNT.stops, el = $("sheet");
    $("score").textContent = S.score;
    $("prog").textContent = `${Math.min(S.i + 1, st.length)}/${st.length}`;
    $("modeDot").classList.toggle("live", mode === "live");
    $("modeTxt").textContent = mode === "live" ? (acc ? `GPS ±${Math.round(acc)} m` : "GPS live") : "Test mode · tap map";

    if (S.i >= st.length) {
      el.className = "sheet done";
      el.innerHTML = `<div class="eyebrow"><span>Hunt complete</span><span>${S.score} / ${st.length * 100}</span></div>
        <h2>${esc(HUNT.finish || "Hunt complete")}</h2>
        <ul class="log">${S.results.map((r, k) => `<li><span>${k + 1}. ${esc(r.name)}</span><span>${r.pts}</span></li>`).join("")}</ul>
        <div class="tools"><button id="againB">Play again</button><button class="primary" id="allB">Choose another hunt</button></div>`;
      $("againB").onclick = restart; $("allB").onclick = () => goTo(""); return;
    }
    el.className = "sheet";
    const s = st[S.i], d = pos ? dist(pos, s) : null, b = pos ? bearing(pos, s) : 0;
    const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=walking`;
    let h = `<div class="eyebrow"><span>Stop ${S.i + 1} of ${st.length}</span><span>${s.lat.toFixed(4)}°N ${Math.abs(s.lon).toFixed(4)}°W</span></div>
      <h2>${esc(s.name)}</h2><p class="clue">${esc(s.clue)}</p>`;
    if (s.photo && !S.solved) h += photoCard(s.photo);
    if (s.inside && !S.solved) h += `<p class="inside">This clue is inside the church. Check it's open, and if a service is on, please wait or come back later.</p>`;
    if (!S.unlocked) {
      h += `<div class="nav">${d == null ? `<span class="dir">Waiting for your location…</span>` :
        `<span class="arrow" style="transform:rotate(${Math.round(b)}deg)" aria-hidden="true">↑</span><span class="dist">${fmtDist(d)}</span><span class="dir">${compass(b)} · ${Math.round(b)}°</span>`}
        <a href="${gmaps}" target="_blank" rel="noopener">Directions ↗</a></div>`;
      const leg = legs && legs[S.i];
      if (leg && leg.m) h += `<p class="legline">Follow the magenta route: ${fmtDist(leg.m)} on foot from ${S.i === 0 ? esc(HUNT.start.label) : "the last stop"}, about ${Math.max(1, Math.round(leg.s / 60))} min.</p>`;
      if (d != null && d > 3000 && mode === "live") h += `<p class="locked">You're ${fmtDist(d)} from this stop. Head to ${esc(HUNT.start.label)} to begin, or use test mode to try it from here.</p>`;
      else h += `<p class="locked">The question unlocks when you're within ${HUNT.radius} m of this stop.</p>`;
      if (msg && msg.c === "bad") h += `<p class="msg bad">${esc(msg.t)}</p>`;
    } else if (!S.solved) {
      h += `<form class="q" id="qf"><p>${esc(s.question)}</p>
        <div class="row"><input type="text" id="ans" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="go" placeholder="Your answer" aria-label="Your answer"><button class="primary" type="submit">Check</button></div>
        ${msg ? `<p class="msg ${msg.c}">${esc(msg.t)}</p>` : ""}
        ${S.hint ? `<p class="hint">Hint: ${esc(s.hint)}</p>` : ""}
        <div class="row">${S.hint ? "" : `<button type="button" class="link" id="hintB">Show hint (−25)</button>`}${S.tries >= 2 ? `<button type="button" class="link" id="skipB">Skip this stop</button>` : ""}</div></form>`;
    } else {
      h += `${msg ? `<p class="msg ${msg.c}">${esc(msg.t)}</p>` : ""}<p class="fact">${esc(s.fact)}</p>
        <div class="row"><button class="primary" id="nextB">${S.i === st.length - 1 ? "Finish" : "Next stop →"}</button></div>`;
    }
    h += `<div class="tools">${mode === "test" ? `<button id="jumpB">Jump to this stop</button>` : `<button class="link" id="testB2">Switch to test mode</button>`}<button class="link" id="restartB">Restart</button><button class="link" id="allB">All hunts</button></div>`;
    el.innerHTML = h;

    const on = (id, fn) => { const x = $(id); if (x) x.onclick = fn; };
    const f = $("qf"); if (f) f.onsubmit = e => { e.preventDefault(); $("ans").blur(); answer($("ans").value); };
    on("hintB", () => { S.hint = true; save(); render(); });
    on("skipB", skip); on("allB", () => goTo("")); on("nextB", next); on("testB2", startTest);
    on("restartB", () => { const x = $("restartB"); if (x.dataset.sure) restart(); else { x.dataset.sure = 1; x.textContent = "Tap again to restart"; } });
    on("jumpB", () => { pos = { lat: s.lat - 0.00012, lon: s.lon + 0.00008 }; acc = 5; updateMe(); checkArrival(); render(); refit(); });
  }

  /* ---------- Add to Home Screen ---------- */
  function setupInstall() {
    const box = $("install");
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (standalone) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) {
      box.hidden = false;
      box.innerHTML = `<span><b>Add to your Home Screen</b> for a full-screen app: tap Safari's Share button (the square with an arrow pointing up), then “Add to Home Screen”.</span>`;
    }
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();
      box.hidden = false;
      box.innerHTML = `<span><b>Install the app</b> to play full-screen and start it from your home screen.</span><button id="instB">Install</button>`;
      $("instB").onclick = async () => { e.prompt(); await e.userChoice; box.hidden = true; };
    });
  }

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
