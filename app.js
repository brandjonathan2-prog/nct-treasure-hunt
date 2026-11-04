/* NCT Treasure Hunt — game logic
   Works in Safari (iPhone/iPad) and Chrome (Android). Needs HTTPS for GPS. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const HUNT_ID = (params.get("hunt") || "").replace(/[^a-z0-9-]/gi, "");
  const keyFor = id => `nct-hunt-${id}-v1`;
  const goTo = id => { location.href = id ? `?hunt=${encodeURIComponent(id)}` : location.pathname; };
  const START_ID = (params.get("start") || "").replace(/[^a-z0-9-]/gi, ""); // from a church's QR code

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
  // start: index of the church the player began at; i: how many churches they've finished
  const fresh = () => ({ start: null, i: 0, score: 0, unlocked: false, tries: 0, hint: false, solved: false, results: [], started: false });
  let S = fresh();
  try { const s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(KEY.replace("nct-", "ncs-")) || "null"); if (s && typeof s.i === "number") S = { ...S, ...s }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  let installPrompt = null; // Chrome's "install this app" prompt, saved for when the player taps Install
  let HUNT, map, layers = {}, pos = null, acc = null, mode = "none", watchId = null, msg = null, followed = false;

  /* ---------- The loop ---------- */
  const N = () => HUNT.stops.length;
  const startIdx = () => (S.start == null ? 0 : S.start);
  const stopAt = j => (startIdx() + j) % N();            // the j-th church of this player's walk
  const stepOf = k => (k - startIdx() + N()) % N();       // where church k falls in their walk
  const curK = () => stopAt(S.i);
  const prevK = k => (k - 1 + N()) % N();
  const stopIndexById = id => HUNT.stops.findIndex(s => s.id === id);
  // Walking distance for the whole trail from a given start (every leg except the one back to the start)
  const trailMetres = k => HUNT.legs ? HUNT.legs.reduce((t, l, x) => x === k ? t : t + l.m, 0) : null;

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
          <p class="clue"><b>Getting here:</b> ${esc(s.getThere || "")}</p><p class="clue"><b>At the church:</b> ${esc(s.find || "")}</p>
          <p class="clue"><b>Question:</b> ${esc(s.question)}</p>
          <p class="clue"><b>QR code link:</b> <a href="?hunt=${esc(h.id)}&start=${esc(s.id)}">${esc(location.origin + location.pathname)}?hunt=${esc(h.id)}&amp;start=${esc(s.id)}</a></p>
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
            : `<span class="state going">In progress · ${p.i} of ${n} churches visited</span>`;
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
    $("introTransport").textContent = HUNT.transport || "";
    $("intro").hidden = false;
    const n = N(), qr = START_ID ? stopIndexById(START_ID) : -1;
    const inProgress = S.started && S.start != null && S.i > 0 && S.i < n;

    if (inProgress) {
      $("continueBtn").hidden = false;
      $("continueBtn").textContent = `Continue · ${S.i} of ${n} churches visited`;
      $("continueBtn").onclick = () => startLive("continue");
    }
    if (qr >= 0) {
      // Arrived from the QR code on a church notice board
      const m = trailMetres(qr);
      $("introWhere").innerHTML = `<span class="here"><span>You're at</span><b>${esc(HUNT.stops[qr].name)}</b><span>Start the trail here and carry on round the loop to the other ${n - 1} churches${m ? `, about ${fmtDist(m)} on foot` : ""}.</span></span>`;
      $("startBtn").textContent = inProgress ? `Start again from ${HUNT.stops[qr].name}` : "Start here";
      if (inProgress) $("startBtn").classList.remove("primary");
      $("startBtn").onclick = () => startLive(qr, true);
      $("startListLabel").textContent = "Or start somewhere else";
    } else {
      $("introWhere").textContent = `It's a loop: start at any of the ${n} churches and carry on round until you've visited them all.`;
      $("startBtn").textContent = inProgress ? "Start again at the church nearest me" : "Start at the church nearest me";
      if (inProgress) $("startBtn").classList.remove("primary");
      $("startBtn").onclick = () => startLive("nearest");
    }
    $("startList").innerHTML = HUNT.stops.map((st, k) => k === qr ? "" :
      `<li><button data-k="${k}">${esc(st.name)}${trailMetres(k) ? `<span>${fmtDist(trailMetres(k))} trail</span>` : ""}</button></li>`).join("");
    $("startList").onclick = e => { const b = e.target.closest("button[data-k]"); if (b) startLive(+b.dataset.k, false); };
    $("testBtn").onclick = () => startTest(qr >= 0 ? qr : null);
  }

  // Begin a fresh walk from church k
  function begin(k, atChurch) {
    S = { ...fresh(), start: k, started: true };
    if (atChurch) S.unlocked = true; // scanned the QR code standing at this church
    msg = atChurch ? { t: `Welcome to ${HUNT.stops[k].name}. Answer the question to begin.`, c: "good" } : null;
    save(); if (map) drawRoute();
  }
  function nearestStop(p) {
    let best = 0, bd = Infinity;
    HUNT.stops.forEach((s, k) => { const d = dist(p, s); if (d < bd) { bd = d; best = k; } });
    return { k: best, d: bd };
  }

  function enterGame() {
    S.started = true; save();
    $("intro").hidden = true; $("app").hidden = false;
    if (!map) initMap(); else map.invalidateSize();
    requestWakeLock();
    render();
  }

  /* ---------- Location ---------- */
  // choice: a church index, "nearest", or "continue"
  /* Full screen (Android Chrome and other browsers that allow it; iPhone Safari doesn't) */
  const canFullscreen = () => !isIOS() && !isStandalone() && document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
  function goFullscreen() {
    if (!canFullscreen() || document.fullscreenElement) return;
    document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }
  document.addEventListener("fullscreenchange", () => { if (HUNT && !$("app").hidden) render(); });

  function startLive(choice, atChurch) {
    goFullscreen(); // must run straight from the tap
    if (!("geolocation" in navigator)) return geoFail({ code: 0 });
    if (!window.isSecureContext) return geoFail({ code: -1 });
    const btn = choice === "continue" ? $("continueBtn") : $("startBtn");
    btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(p => {
      btn.disabled = false; btn.textContent = btn.dataset.label;
      const here = { lat: p.coords.latitude, lon: p.coords.longitude };
      if (choice === "nearest") {
        const nr = nearestStop(here);
        begin(nr.k, nr.d <= HUNT.radius * 2);
        if (nr.d > 3000) msg = { t: `The nearest church on this trail is ${fmtDist(nr.d)} away. Use Directions to get there, or try test mode.`, c: "bad" };
      } else if (choice !== "continue") begin(choice, !!atChurch);
      mode = "live"; onPos(p); enterGame();
      watchId = navigator.geolocation.watchPosition(onPos, e => { if (e.code === 1) geoLost(); },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
    }, e => { btn.disabled = false; btn.textContent = btn.dataset.label; geoFail(e); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  }
  function onPos(p) {
    pos = { lat: p.coords.latitude, lon: p.coords.longitude }; acc = p.coords.accuracy;
    checkArrival(); if (map) { updateMe(); if (!followed) { followed = true; render(); refit(); } else render(); }
  }
  function geoFail(e) {
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

  // Test mode: tap the map to move. Starts at the QR church if there is one.
  function startTest(qr) {
    goFullscreen();
    mode = "test";
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    const inProgress = S.started && S.start != null && S.i > 0 && S.i < N();
    if (qr != null) begin(qr, true);
    else if (!inProgress) begin(0, false);
    const c = HUNT.stops[curK()];
    pos = qr != null ? { lat: c.lat, lon: c.lon } : (pos || { lat: c.lat - 0.0015, lon: c.lon }); acc = 5;
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
    map.setView([HUNT.stops[curK()].lat, HUNT.stops[curK()].lon], 16);
    loadLegs();
    map.on("click", e => { if (mode === "test") { pos = { lat: e.latlng.lat, lon: e.latlng.lng }; acc = 5; updateMe(); checkArrival(); render(); } });
    $("recentre").onclick = frame;
    if ("ResizeObserver" in window) new ResizeObserver(() => map.invalidateSize()).observe($("map"));
    drawRoute();
  }
  /* Walking route for each leg: legs[k] runs from the church before k on the loop to church k.
     Uses routes stored in the hunt file; otherwise asks the OpenStreetMap walking router once
     and keeps the answer on the phone; otherwise falls back to straight lines. */
  const LEGS_KEY = () => `nct-legs-${HUNT.id}-loop-v1`;
  let legs = null;
  function legPoints(k) {
    if (legs && legs[k] && legs[k].p) return legs[k].p;
    const a = HUNT.stops[prevK(k)], b = HUNT.stops[k];
    return [[a.lat, a.lon], [b.lat, b.lon]];
  }
  function loadLegs() {
    if (HUNT.legs) { legs = HUNT.legs; return; }
    try { const c = JSON.parse(localStorage.getItem(LEGS_KEY()) || "null"); if (c && c.length === N()) { legs = c; return; } } catch (e) {}
    Promise.all(HUNT.stops.map((b, k) => {
      const a = HUNT.stops[prevK(k)];
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
      const j = stepOf(k), pts = legPoints(k); // leg into church k is walked at step j
      if (j === 0) return L.polyline(pts, { color: route, weight: 2, opacity: .3, dashArray: "2 6" }); // back to the start: not walked
      if (j < S.i) return L.polyline(pts, { color: route, weight: 4, opacity: .75 });
      if (j === S.i) return L.polyline(pts, { color: chart, weight: 6, opacity: .9, lineCap: "round", lineJoin: "round" });
      return L.polyline(pts, { color: route, weight: 3, opacity: .4, dashArray: "6 8" });
    })).addTo(map);
    layers.pins = L.layerGroup(st.map((s, k) => {
      const j = stepOf(k), cls = j < S.i ? "done" : j === S.i ? "cur" : "";
      const size = cls === "cur" ? 34 : 28;
      return L.marker(ll(s), { icon: L.divIcon({ className: "", html: `<div class="pin ${cls}">${j < S.i ? "✓" : j + 1}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        zIndexOffset: cls === "cur" ? 500 : 0, keyboard: false, title: s.name });
    })).addTo(map);
    const cur = S.i < N() ? st[curK()] : null;
    layers.fence = cur ? L.circle(ll(cur), { radius: HUNT.radius, color: chart, weight: 1, fillOpacity: .12 }).addTo(map) : null;
    if (layers.me) layers.me.addTo(map);
  }
  function updateMe() {
    if (!pos || !map) return;
    if (!layers.me) layers.me = L.marker([pos.lat, pos.lon], { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, interactive: false }).addTo(map);
    else layers.me.setLatLng([pos.lat, pos.lon]);
  }
  function frame() {
    if (S.i >= N()) { map.fitBounds(HUNT.stops.map(s => [s.lat, s.lon]), { padding: [40, 40] }); return; }
    const k = curK(), c = HUNT.stops[k];
    const pts = S.i > 0 ? legPoints(k).slice() : [[c.lat, c.lon]];
    if (pos && dist(pos, c) < 5000) pts.push([pos.lat, pos.lon]);
    if (pts.length === 1) map.setView(pts[0], 17); else map.fitBounds(pts, { padding: [50, 50], maxZoom: 18 });
  }
  const getVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------- Game flow ---------- */
  function checkArrival() {
    if (!HUNT || S.i >= N()) return;
    const s = HUNT.stops[curK()]; if (!pos || S.unlocked) return;
    const slack = Math.min(acc || 0, 20); // forgive some GPS wobble
    if (dist(pos, s) <= HUNT.radius + slack) {
      S.unlocked = true; save();
      msg = { t: "You've arrived. Answer the question to move on.", c: "good" };
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    }
  }
  const points = () => Math.max(25, 100 - (S.hint ? 25 : 0) - S.tries * 10);
  function answer(v) {
    const s = HUNT.stops[curK()], n = norm(v); if (!n) return;
    const ok = s.exact ? s.exact.includes(n) : s.match.some(m => n.includes(m));
    if (ok) { const p = points(); S.score += p; S.solved = true; S.results.push({ name: s.name, pts: p }); msg = { t: `Correct. +${p} points.`, c: "good" }; }
    else { S.tries++; msg = { t: S.tries >= 3 ? "Not quite. Take a hint or skip this one." : "Not quite. Try again.", c: "bad" }; }
    save(); render();
    if (ok) $("sheet").scrollTop = 0;
    showResult();
  }
  // Bring the "Correct" / "Not quite" line into view. Wait for the on-screen keyboard to close first:
  // on iPhone it leaves the page scrolled, which would otherwise hide the message.
  function showResult() {
    setTimeout(() => {
      window.scrollTo(0, 0);
      const sheet = $("sheet"), m = sheet.querySelector(".msg");
      if (!m) return;
      const top = m.offsetTop - sheet.offsetTop - 12;
      if (top < sheet.scrollTop || top + m.offsetHeight > sheet.scrollTop + sheet.clientHeight) sheet.scrollTop = Math.max(0, top);
    }, 350);
  }
  function next() { S.i++; S.unlocked = false; S.tries = 0; S.hint = false; S.solved = false; msg = null; checkArrival(); save(); drawRoute(); render(); $("sheet").scrollTop = 0; refit(); }
  // Frame the map after the sheet below it has settled to its new height
  function refit() { requestAnimationFrame(() => { map.invalidateSize(); frame(); }); }
  function skip() { S.results.push({ name: HUNT.stops[curK()].name, pts: 0 }); S.solved = true; msg = { t: "Skipped. No points for this stop.", c: "bad" }; save(); render(); }
  function restart() { begin(startIdx(), false); checkArrival(); drawRoute(); render(); refit(); }

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
        ${installHint("Try another trail next time.")}
        <div class="tools"><button id="againB">Play again from ${esc(st[startIdx()].name)}</button><button class="primary" id="allB">Choose another hunt</button></div>`;
      $("againB").onclick = restart; $("allB").onclick = () => goTo(""); return;
    }
    el.className = "sheet";
    const k = curK(), s = st[k], d = pos ? dist(pos, s) : null, b = pos ? bearing(pos, s) : 0;
    const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=walking`;
    let h = `<div class="eyebrow"><span>Church ${S.i + 1} of ${st.length}</span><span>${s.lat.toFixed(4)}°N ${Math.abs(s.lon).toFixed(4)}°W</span></div>
      <h2>${esc(s.name)}</h2>`;
    if (!S.unlocked && S.i > 0 && s.getThere) h += `<p class="getthere"><b>Getting here from ${esc(st[prevK(k)].name)}</b>${esc(s.getThere)}</p>`;
    if (!S.solved) h += `<p class="clue">${esc(s.find)}</p>`; // once answered, the result comes straight after the name
    if (s.photo && !S.solved) h += photoCard(s.photo);
    if (s.inside && !S.solved) h += `<p class="inside">This clue is inside the church. Check it's open, and if a service is on, please wait or come back later.</p>`;
    if (!S.unlocked) {
      h += `<div class="nav">${d == null ? `<span class="dir">Waiting for your location…</span>` :
        `<span class="arrow" style="transform:rotate(${Math.round(b)}deg)" aria-hidden="true">↑</span><span class="dist">${fmtDist(d)}</span><span class="dir">${compass(b)} · ${Math.round(b)}°</span>`}
        <a href="${gmaps}" target="_blank" rel="noopener">Directions ↗</a></div>`;
      const leg = legs && legs[k];
      if (S.i > 0 && leg && leg.m) h += `<p class="legline">Follow the red route: ${fmtDist(leg.m)} on foot, about ${Math.max(1, Math.round(leg.s / 60))} min.</p>`;
      if (S.i === 0) h += `<p class="legline">Make your way to ${esc(s.name)} to begin. ${esc(HUNT.transport || "")}</p>`;
      if (d != null && d > 3000 && mode === "live") h += `<p class="locked">You're ${fmtDist(d)} from this church. Use Directions to get there, or try test mode from here.</p>`;
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
        <div class="row"><button class="primary" id="nextB">${S.i === st.length - 1 ? "Finish" : `Next: ${esc(st[stopAt(S.i + 1)].name)} →`}</button></div>`;
    }
    h += `<div class="tools">${mode === "test" ? `<button id="jumpB">Jump to this stop</button>` : `<button class="link" id="testB2">Switch to test mode</button>`}${canFullscreen() && !document.fullscreenElement ? `<button class="link" id="fullB">Full screen</button>` : ""}<button class="link" id="restartB">Restart</button><button class="link" id="allB">All hunts</button></div>`;
    el.innerHTML = h;

    const on = (id, fn) => { const x = $(id); if (x) x.onclick = fn; };
    const f = $("qf"); if (f) f.onsubmit = e => { e.preventDefault(); $("ans").blur(); answer($("ans").value); };
    on("hintB", () => { S.hint = true; save(); render(); });
    on("skipB", skip); on("allB", () => goTo("")); on("fullB", goFullscreen); on("nextB", next); on("testB2", startTest);
    on("restartB", () => { const x = $("restartB"); if (x.dataset.sure) restart(); else { x.dataset.sure = 1; x.textContent = "Tap again to restart"; } });
    on("jumpB", () => { pos = { lat: s.lat - 0.00012, lon: s.lon + 0.00008 }; acc = 5; updateMe(); checkArrival(); render(); refit(); });
  }

  /* ---------- Add to Home Screen ---------- */
  // Install hints: on the hunt list, and on the finish screen of every hunt
  function isStandalone() { return matchMedia("(display-mode: standalone)").matches || navigator.standalone; }
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function installHint(lead) {
    if (isStandalone()) return "";
    if (installPrompt) return `<div class="install"><span><b>${lead}</b> Install NCT Treasure Hunt to open it full-screen from your home screen.</span><button type="button" class="install-btn">Install</button></div>`;
    if (isIOS()) return `<div class="install"><span><b>${lead}</b> Add NCT Treasure Hunt to your Home Screen: tap Safari's Share button (the square with an arrow pointing up), then “Add to Home Screen”.</span></div>`;
    return `<div class="install"><span><b>${lead}</b> Add NCT Treasure Hunt to your home screen from your browser's menu (⋮ › Add to Home screen).</span></div>`;
  }
  document.addEventListener("click", async e => {
    if (!e.target.closest(".install-btn") || !installPrompt) return;
    installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null;
    document.querySelectorAll(".install").forEach(x => { x.hidden = true; });
  });
  function setupInstall() {
    if (isStandalone()) return;
    const box = $("install");
    if (isIOS()) { box.hidden = false; box.outerHTML = installHint("For a full-screen app,").replace('<div class="install">', '<div class="install" id="install">'); }
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault(); installPrompt = e;
      const b = $("install"); if (b) { b.outerHTML = installHint("For a full-screen app,").replace('<div class="install">', '<div class="install" id="install">'); }
      if (S.i >= (HUNT ? N() : Infinity)) render();
    });
  }


  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
