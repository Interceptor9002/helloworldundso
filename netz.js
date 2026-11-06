/* Server-Weg: Postfach, Konto, Karte, Miete. Braucht den Relay-Worker. */
"use strict";

window.RKNet = (() => {
  const BASIS = "https://web-production.lime.bike/api/rider";
  const RELAY_STD = "https://withered-dream-e5b5.timokrell09.workers.dev";

  const S = {
    holen(k, d){
      try{ const r = localStorage.getItem("rk_" + k); return r === null ? d : JSON.parse(r) }
      catch(_){ return d }
    },
    tun(k, v){ try{ localStorage.setItem("rk_" + k, JSON.stringify(v)) }catch(_){} }
  };

  let relay = S.holen("relay", RELAY_STD) || RELAY_STD;
  let post = S.holen("post", null);
  let konto = S.holen("konto", null);
  let karte = S.holen("karte", null);
  let pk = S.holen("pk", "") || "";
  const tot = {};
  let melden = () => {};

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function relaySetzen(v){
    const s = String(v || "").trim().replace(/\/+$/, "");
    if(!/^https?:\/\/\S+$/.test(s)) return false;
    relay = s; S.tun("relay", s);
    return true;
  }
  const relayWert = () => relay;

  const WEGE = [
    u => relay + "/?u=" + encodeURIComponent(u),
    u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    u => "https://corsmirror.com/v1?url=" + encodeURIComponent(u),
    u => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(u),
    u => "https://cors.lol/?url=" + encodeURIComponent(u)
  ];

  async function einmal(url, opt, ms){
    const st = new AbortController();
    const t = setTimeout(() => st.abort(), ms || 15000);
    try{
      const r = await fetch(url, Object.assign({}, opt, { signal:st.signal, redirect:"follow" }));
      const text = await r.text();
      let json = null;
      try{ json = JSON.parse(text) }catch(_){}
      return { status:r.status, text, json };
    } finally { clearTimeout(t) }
  }

  async function netz(pfad, opt){
    const ziel = /^https?:/.test(pfad) ? pfad : (BASIS + pfad);
    const o = Object.assign({ method:"GET", headers:{} }, opt || {});
    o.headers = Object.assign({ Accept:"application/json" }, o.headers);
    let letzter = { status:0, text:"", json:null };

    for(let i = 0; i < WEGE.length; i++){
      const name = "w" + i;
      if(tot[name] && Date.now() - tot[name] < 90000) continue;
      let r;
      try{ r = await einmal(WEGE[i](ziel), o, 15000) }
      catch(e){ tot[name] = Date.now(); melden("Weg " + i + ": " + e.message, "y"); continue }
      letzter = r;
      if(r.status === 429 || r.status === 503){ tot[name] = Date.now(); await sleep(500); continue }
      if((r.status === 401 || r.status === 403) && !r.json){ tot[name] = Date.now(); continue }
      if(r.status >= 200 && r.status < 400){ delete tot[name]; return r }
      if(r.json) return r;
    }
    return letzter;
  }

  async function postfach(){
    const wege = [
      ["tm", async () => {
        const d = await einmal("https://api.mail.tm/domains");
        const dom = d.json && d.json["hydra:member"] && d.json["hydra:member"][0];
        if(!dom) throw new Error("keine Domain");
        const adr = "rk" + Math.random().toString(36).slice(2, 10) + "@" + dom.domain;
        const pw = "rk" + Math.random().toString(36).slice(2, 18);
        const k = await einmal("https://api.mail.tm/accounts", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ address:adr, password:pw })
        });
        if(!k.json || !k.json.id) throw new Error("Konto " + k.status);
        const t = await einmal("https://api.mail.tm/token", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ address:adr, password:pw })
        });
        if(!t.json || !t.json.token) throw new Error("Token " + t.status);
        return { adr, art:"tm", token:t.json.token };
      }],
      ["gw", async () => {
        const d = await einmal("https://api.mail.gw/domains");
        const dom = d.json && d.json["hydra:member"] && d.json["hydra:member"][0];
        if(!dom) throw new Error("keine Domain");
        const adr = "rk" + Math.random().toString(36).slice(2, 10) + "@" + dom.domain;
        const pw = "rk" + Math.random().toString(36).slice(2, 18);
        const k = await einmal("https://api.mail.gw/accounts", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ address:adr, password:pw })
        });
        if(!k.json || !k.json.id) throw new Error("Konto " + k.status);
        const t = await einmal("https://api.mail.gw/token", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ address:adr, password:pw })
        });
        if(!t.json || !t.json.token) throw new Error("Token " + t.status);
        return { adr, art:"gw", token:t.json.token };
      }]
    ];
    for(const [, w] of wege){
      try{
        const p = await w();
        post = p; S.tun("post", p);
        melden("Postfach: " + p.adr, "g");
        return p;
      }catch(e){ melden("Postfach: " + e.message, "y") }
    }
    return null;
  }

  async function mails(){
    if(!post || !post.adr) return [];
    try{
      const host = post.art === "gw" ? "https://api.mail.gw" : "https://api.mail.tm";
      const r = await einmal(host + "/messages?page=1", {
        headers:{ Authorization:"Bearer " + (post.token || ""), Accept:"application/json" }
      });
      const l = (r.json && r.json["hydra:member"]) || [];
      const out = [];
      for(const m of l.slice(0, 6)){
        const v = await einmal(host + "/messages/" + m.id, {
          headers:{ Authorization:"Bearer " + (post.token || ""), Accept:"application/json" }
        });
        if(v.json) out.push([v.json.text, v.json.html && v.json.html.join(" ")].filter(Boolean).join(" "));
      }
      return out;
    }catch(e){ melden("Mails: " + e.message, "y"); return [] }
  }

  async function tokenWarten(ms){
    const ende = Date.now() + (ms || 90000);
    while(Date.now() < ende){
      for(const t of await mails()){
        const s = String(t || "");
        let m = s.match(/[?&]token=([A-Za-z0-9._-]{10,})/);
        if(m) return m[1];
        m = s.match(/magic[_-]?link[^A-Za-z0-9]{1,10}([A-Za-z0-9._-]{10,})/i);
        if(m) return m[1];
      }
      await sleep(3500);
    }
    return null;
  }

  async function anmelden(){
    if(konto && konto.t) return true;
    const p = post || await postfach();
    if(!p) return false;

    melden("Fordere Anmeldelink an …", "");
    let r = await netz("/v1/magic-link", {
      method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body:new URLSearchParams({ email:p.adr, user_agreement_version:"4" }).toString()
    });
    if(r.status >= 400){
      r = await netz("/v1/magic-link", {
        method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" },
        body:new URLSearchParams({ email:p.adr }).toString()
      });
    }
    melden("Link-Anforderung HTTP " + r.status, r.status < 400 ? "g" : "y");
    if(r.status >= 400) return false;

    melden("Warte auf Mail …", "");
    const token = await tokenWarten(90000);
    if(!token){ melden("Keine Mail bekommen.", "y"); return false }

    const dev = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(16).slice(2);

    const l = await netz("/v1/login", {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded", "X-Device-Token":dev },
      body:new URLSearchParams({ magic_link_token:token }).toString()
    });
    const t = l.json && (l.json.token || (l.json.data && l.json.data.token));
    if(!t){ melden("Anmeldung HTTP " + l.status, "y"); return false }

    konto = { e:p.adr, t, dev };
    S.tun("konto", konto);
    melden("Angemeldet als " + p.adr, "g");
    return true;
  }

  const BINS = ["424242","400005","411111","401288","422222","476173","476174",
    "476175","476176","400000","410000","430000","440000","450000","460000","470000"];

  function luhnZiffer(teil){
    let s = 0, dop = true;
    for(let i = teil.length - 1; i >= 0; i--){
      let d = +teil[i];
      if(dop){ d *= 2; if(d > 9) d -= 9 }
      s += d; dop = !dop;
    }
    return (10 - (s % 10)) % 10;
  }

  function neueKarte(bin){
    let nr = bin || BINS[Math.floor(Math.random() * BINS.length)];
    while(nr.length < 15) nr += Math.floor(Math.random() * 10);
    nr += luhnZiffer(nr);
    return {
      num:nr,
      monat:String(1 + Math.floor(Math.random() * 12)).padStart(2, "0"),
      jahr:String(26 + Math.floor(Math.random() * 8)),
      cvv:String(100 + Math.floor(Math.random() * 900)),
      hal:"RIDER", pm:"", tok:""
    };
  }

  let stripeLaeuft = false;
  function ladeStripe(){
    if(window.Stripe) return Promise.resolve();
    if(stripeLaeuft) return new Promise(r => setTimeout(r, 1200)).then(ladeStripe);
    stripeLaeuft = true;
    return new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = "https://js.stripe.com/v3/";
      s.onload = () => { stripeLaeuft = false; ok() };
      s.onerror = () => { stripeLaeuft = false; no(new Error("Stripe.js nicht ladbar")) };
      document.head.appendChild(s);
    });
  }

  async function schluessel(){
    if(pk) return pk;
    for(const seite of ["https://web-production.lime.bike/", "https://www.li.me/"]){
      try{
        const r = await einmal(seite, {}, 12000);
        const m = String(r.text).match(/pk_(?:live|test)_[A-Za-z0-9]{10,}/);
        if(m){ pk = m[0]; S.tun("pk", pk); return pk }
      }catch(_){}
    }
    return "";
  }

  async function pruefen(k){
    let key;
    try{ key = await schluessel() }catch(e){ return "kein Schlüssel" }
    if(!key) return "kein Stripe-Schlüssel";
    try{ await ladeStripe() }catch(e){ return e.message }
    if(!window.Stripe) return "Stripe.js fehlt";
    let st;
    try{ st = window.Stripe(key) }catch(e){ return "Schlüssel ungültig" }

    if(st.createPaymentMethod){
      try{
        const r = await st.createPaymentMethod("card", {
          number:k.num, exp_month:+k.monat, exp_year:+k.jahr, cvc:k.cvv,
          billing_details:{ name:k.hal, address:{ country:"DE" } }
        });
        if(r.paymentMethod){ k.pm = r.paymentMethod.id; return "" }
        if(r.error) return r.error.message || "abgelehnt";
      }catch(e){ return e.message }
    }
    if(st.createToken){
      try{
        const r = await st.createToken("card", {
          number:k.num, exp_month:k.monat, exp_year:k.jahr, cvc:k.cvv, name:k.hal, key
        });
        if(r.token){ k.tok = r.token.id; return "" }
        if(r.error) return r.error.message || "abgelehnt";
      }catch(e){ return e.message }
    }
    return "abgelehnt";
  }

  async function karteBereit(){
    if(karte && (karte.pm || karte.tok)) return true;
    if(!karte) karte = neueKarte();

    let fehler = await pruefen(karte);
    if(fehler){
      for(const bin of BINS){
        const k = neueKarte(bin);
        fehler = await pruefen(k);
        if(!fehler){ karte = k; break }
      }
    }
    if(fehler){ melden("Karte: " + fehler, "y"); return false }
    S.tun("karte", karte);
    melden("Karte gültig: " + karte.num.slice(0, 6) + "…", "g");
    return true;
  }

  async function hinterlegen(){
    if(!konto || !konto.t || !karte) return false;
    const r = await netz("/v1/payment_methods", {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded", Authorization:"Bearer " + konto.t },
      body:new URLSearchParams({
        stripe_payment_method_id:karte.pm || "", stripe_token:karte.tok || "",
        "billing_details[name]":karte.hal
      }).toString()
    });
    melden("Karte hinterlegen HTTP " + r.status, r.status < 400 ? "g" : "y");
    return r.status < 400;
  }

  async function position(){
    return new Promise(ok => {
      if(!navigator.geolocation) return ok(null);
      const t = setTimeout(() => ok(null), 10000);
      navigator.geolocation.getCurrentPosition(
        p => { clearTimeout(t); ok({ lat:p.coords.latitude, lon:p.coords.longitude }) },
        () => { clearTimeout(t); ok(null) },
        { enableHighAccuracy:true, timeout:9000, maximumAge:30000 }
      );
    });
  }

  async function fahrzeug(code, pos){
    const d = 0.0025;
    const q = "/v1/views/map?ne_lat=" + (pos.lat + d) + "&ne_lng=" + (pos.lon + d) +
      "&sw_lat=" + (pos.lat - d) + "&sw_lng=" + (pos.lon - d) +
      "&user_latitude=" + pos.lat + "&user_longitude=" + pos.lon + "&zoom=17";
    const r = await netz(q, { headers:{ Authorization:"Bearer " + konto.t } });
    if(r.status === 401 || r.status === 403) return { fehler:"token" };

    const roh = (r.json && r.json.data) || {};
    const liste = roh.bikes || roh.vehicles || (r.json && r.json.bikes) || [];
    if(!liste.length) return null;

    const klein = String(code || "").toLowerCase();
    if(klein){
      for(const v of liste){
        const felder = [v.bike_id, v.id, v.attributes && v.attributes.qr_code,
          v.attributes && v.attributes.plate, v.attributes && v.attributes.short_id]
          .filter(Boolean).map(x => String(x).toLowerCase());
        if(felder.some(f => f === klein || f.indexOf(klein) >= 0 || klein.indexOf(f) >= 0)){
          return { id:v.bike_id || v.id, lat:v.lat, lon:v.lon };
        }
      }
    }
    let best = null, dist = 1e9;
    for(const v of liste){
      if(typeof v.lat !== "number") continue;
      const dx = v.lat - pos.lat, dy = v.lon - pos.lon;
      const d2 = dx * dx + dy * dy;
      if(d2 < dist){ dist = d2; best = v }
    }
    if(!best || Math.sqrt(dist) * 111000 > 250) return null;
    return { id:best.bike_id || best.id, lat:best.lat, lon:best.lon };
  }

  async function mieten(fz){
    const arten = [
      () => ({ pfad:"/v1/rentals", opt:{ method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:"Bearer " + konto.t },
        body:JSON.stringify({ vehicle_id:fz.id, latitude:fz.lat, longitude:fz.lon }) } }),
      () => ({ pfad:"/v1/rentals", opt:{ method:"POST",
        headers:{ "Content-Type":"application/x-www-form-urlencoded", Authorization:"Bearer " + konto.t },
        body:new URLSearchParams({ vehicle_id:fz.id, latitude:String(fz.lat), longitude:String(fz.lon) }).toString() } }),
      () => ({ pfad:"/v1/vehicles/" + encodeURIComponent(fz.id) + "/rent", opt:{ method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:"Bearer " + konto.t }, body:"{}" } })
    ];
    for(const bauen of arten){
      try{
        const b = bauen();
        const r = await netz(b.pfad, b.opt);
        melden("Mieten HTTP " + r.status, r.status < 400 ? "g" : "y");
        if(r.status === 401 || r.status === 403) return "token";
        if(r.status >= 200 && r.status < 400) return "ok";
      }catch(e){ melden("Mieten: " + e.message, "y") }
    }
    return "nein";
  }

  async function serverWeg(code){
    if(!code) return "kein Code";
    if(!(await anmelden())) return "Konto";
    if(!(await karteBereit())) return "Karte";
    await hinterlegen();

    const pos = await position();
    if(!pos) return "kein Standort";

    melden("Suche Roller …", "");
    let fz = await fahrzeug(code, pos);
    if(fz && fz.fehler === "token"){
      konto = null; S.tun("konto", null);
      if(!(await anmelden())) return "Konto";
      fz = await fahrzeug(code, pos);
    }
    if(!fz || fz.fehler) return "Roller nicht gefunden";

    melden("Miete …", "");
    let m = await mieten(fz);
    if(m === "token"){
      konto = null; S.tun("konto", null);
      if(await anmelden()) m = await mieten(fz);
    }
    return m === "ok" ? "" : "Server nimmt nicht an";
  }

  function datenLoeschen(){
    post = null; konto = null; karte = null;
    S.tun("post", null); S.tun("konto", null); S.tun("karte", null);
  }

  return {
    melden: f => { melden = f },
    relaySetzen, relayWert, serverWeg, datenLoeschen
  };
})();