"use strict";

const $ = s => document.querySelector(s);
const logEl = $("#log");
const enc = s => new TextEncoder().encode(s);
const hex = b => Array.from(b).map(x => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const OKAI_PW = "OKAIYLBT";
const OKAI_SVC = "OKAI_CAR";

const S = {
  dev:null, schreib:null, schreibListe:[], lesbar:null, verbunden:false,
  busy:false, antwort:0, leben:0, freiTimer:0, gesperrt:true,
  merker:{}, pw:"", imei:"", sucht:false, letzter:"", marke:"auto"
};

function log(t, cls){
  const d = document.createElement("div");
  d.className = "ln" + (cls ? " " + cls : "");
  const a = document.createElement("span"); a.className = "t";
  a.textContent = new Date().toTimeString().slice(0, 8);
  const m = document.createElement("span"); m.className = "m"; m.textContent = t;
  d.append(a, m); logEl.append(d);
  while(logEl.children.length > 600) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

function stat(t, art){
  const e = $("#status");
  e.textContent = t;
  e.className = art || "";
}

function pill(t, an){
  const e = $("#pill");
  e.textContent = t;
  e.className = an ? "on" : "";
}

function setz(id, wert){
  const e = $("#" + id);
  if(e) e.textContent = String(wert);
}

function zustand(t){
  S.gesperrt = (t === "gesperrt");
  setz("ckZust", t);
}

function speichern(k, v){ try{ localStorage.setItem("rk_" + k, JSON.stringify(v)) }catch(_){} }
function holen(k, d){
  try{
    const r = localStorage.getItem("rk_" + k);
    return r === null ? d : JSON.parse(r);
  }catch(_){ return d }
}

function wache(ms, name){
  let fertig = false;
  const t = setTimeout(() => {
    if(fertig) return;
    S.busy = false;
    stat(name + ": Zeitüberschreitung.", "err");
  }, ms);
  return () => { fertig = true; clearTimeout(t) };
}

function cockAuf(){
  $("#cockpit").classList.remove("aus");
  document.body.style.overflow = "hidden";
}
function cockZu(){
  $("#cockpit").classList.add("aus");
  document.body.style.overflow = "";
}

function kette(an){
  const lime = an ? [
    ["Text unlock", () => enc("unlock")],
    ["Rahmen 1114", () => RK.frame(0x1114)],
    ["Rahmen 1661 F1", () => RK.frame(0x1661, [0xF1])],
    ["Rahmen 1661 F1 0000", () => RK.frame(0x1661, [0xF1, 0x00, 0x00])],
    ["Dauer 1663 F1", () => RK.frame(0x1663, [0xF1])],
    ["Text unlockforever", () => enc("unlockforever")],
    ["AT Anmeldung", () => RK.atLime("ATH", "", S.pw)],
    ["AT Befehl", () => RK.atLime("CMD", '"unlock":1', S.pw)],
    ["AT Abfrage", () => RK.atLime("QRY", '"unlock":1', S.pw)]
  ] : [
    ["Text lock", () => enc("lock")],
    ["Rahmen 1613 F1", () => RK.frame(0x1613, [0xF1])],
    ["Rahmen 1661 F0", () => RK.frame(0x1661, [0xF0])],
    ["AT Befehl zu", () => RK.atLime("CMD", '"unlock":0', S.pw)]
  ];

  const okai = an ? [
    ["AT Passwort", () => RK.at("OKPWD", [OKAI_PW])],
    ["AT auf", () => RK.at("OKSCM", [OKAI_PW, "0"])],
    ["AT Testmodus", () => RK.at("OKXWM", [OKAI_SVC, "2"])],
    ["AT auf erneut", () => RK.at("OKSCM", [OKAI_PW, "0"])],
    ["AT Fahrstufe", () => RK.at("OKECP", [OKAI_PW, "3"])]
  ] : [
    ["AT Passwort", () => RK.at("OKPWD", [OKAI_PW])],
    ["AT zu", () => RK.at("OKSCM", [OKAI_PW, "1"])]
  ];

  let liste = markeJetzt() === "lime" ? lime.concat(okai) : okai.concat(lime);
  const gemerkt = S.dev ? S.merker[S.dev.id] : "";
  if(gemerkt){
    const i = liste.findIndex(x => x[0] === gemerkt);
    if(i > 0) liste = [liste[i], ...liste.slice(0, i), ...liste.slice(i + 1)];
  }
  return liste;
}

function boostRahmen(){
  return [
    ["Testmodus", () => RK.at("OKXWM", [OKAI_SVC, "2"])],
    ["Passwort", () => RK.at("OKPWD", [OKAI_PW])],
    ["Fahrstufe 9", () => RK.at("OKECP", [OKAI_PW, "9"])],
    ["Wert Maximum", () => RK.frame(0x1661, [0xF1, 0xFF, 0xFF])],
    ["Register FF", () => RK.frame(0x1663, [0x0D, 0xFF])],
    ["Dauer F1", () => RK.frame(0x1663, [0xF1])]
  ];
}

function markeErkennen(name){
  const n = String(name || "").toLowerCase();
  let m = "";
  if(n.indexOf("lime") >= 0) m = "lime";
  else if(n.indexOf("voi") >= 0) m = "voi";
  else if(n.indexOf("dott") >= 0) m = "dott";
  else if(n.indexOf("bolt") >= 0) m = "bolt";
  if(m){
    setz("erkannt", "Erkannt: " + m.toUpperCase());
    if($("#marke").value === "auto") S.marke = m;
  }else{
    setz("erkannt", "Marke nicht erkannt — es werden alle Wege probiert.");
  }
  return m;
}

function markeJetzt(){
  const g = $("#marke").value;
  if(g !== "auto") return g;
  return S.marke === "auto" ? "lime" : S.marke;
}

const DIENSTE = [
  "00002c00-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ffe5-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "0000fee9-0000-1000-8000-00805f9b34fb",
  "0000fe95-0000-1000-8000-00805f9b34fb"
];

function knoepfe(an){
  ["bUnlock","bLock","bCock","bForever","bBeep","bDrop","bApply","bSpeedReset",
   "bRead","bBoost","bShot","bCkUnlock","bCkLock"].forEach(id => {
    const e = $("#" + id); if(e) e.disabled = !an;
  });
}

function ausTrennen(){
  clearInterval(S.leben); clearInterval(S.freiTimer);
  S.verbunden = false;
  S.schreib = null; S.schreibListe = []; S.lesbar = null;
  pill("aus", false);
  knoepfe(false);
  cockZu();
  $("#bConn").disabled = false;
  stat("Verbindung weg.", "warn");
}

async function verbinden(){
  if(!navigator.bluetooth){
    stat("Kein Bluetooth verfügbar. Bluefy oder Chrome nutzen.", "err");
    return false;
  }
  $("#bConn").disabled = true;
  try{
    const dev = await navigator.bluetooth.requestDevice({
      acceptAllDevices:true, optionalServices:DIENSTE
    });
    if(!dev){ $("#bConn").disabled = false; return false }
    S.dev = dev;
    dev.removeEventListener("gattserverdisconnected", ausTrennen);
    dev.addEventListener("gattserverdisconnected", ausTrennen);
    log("Gewählt: " + (dev.name || "ohne Namen"), "ok");
    markeErkennen(dev.name);
    await aufbauen();
    return S.verbunden;
  }catch(e){
    log("Verbinden: " + e.message, "err");
    stat("Verbinden abgebrochen.", "warn");
    $("#bConn").disabled = false;
    return false;
  }
}

async function aufbauen(){
  const server = await S.dev.gatt.connect();
  S.verbunden = true;
  pill(S.dev.name || "verbunden", true);
  log("Verbunden. Suche Kanäle …");

  let svc = [];
  try{ svc = await server.getPrimaryServices() }catch(e){ log("Dienste: " + e.message, "warn") }

  S.schreibListe = []; S.lesbar = null;
  let melder = 0;

  for(const s of svc){
    let chs = [];
    try{ chs = await s.getCharacteristics() }catch(_){ continue }
    log("Dienst " + s.uuid.slice(4, 8), "dim");
    for(const ch of chs){
      const p = ch.properties || {};
      const art = ["read","write","writeWithoutResponse","notify","indicate"].filter(k => p[k]);
      log("  Kanal " + ch.uuid.slice(4, 8) + " [" + (art.join(" ") || "–") + "]", "dim");
      if(p.read && !S.lesbar) S.lesbar = ch;
      if(p.notify || p.indicate){
        melder++;
        ch.startNotifications()
          .then(() => ch.addEventListener("characteristicvaluechanged", empfangen))
          .catch(() => {});
      }
      if(p.write || p.writeWithoutResponse) S.schreibListe.push(ch);
    }
  }

  const sel = $("#wsel");
  sel.innerHTML = '<option value="">– keiner –</option>';
  S.schreibListe.forEach((c, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = c.uuid.slice(0, 8) + (c.properties.write ? " W" : " w/o");
    sel.append(o);
  });
  if(S.schreibListe.length) sel.value = "0";
  S.schreib = S.schreibListe[0] || null;

  log(svc.length + " Dienste, " + S.schreibListe.length + " schreibbar, " + melder + " meldend.", "dim");

  if(!S.schreib){
    stat("Der Roller nimmt keine Daten an. Anderen Roller probieren.", "err");
    S.verbunden = false;
    return;
  }

  await sleep(1200);
  if($("#oLife").checked) lebenszeichen();
  knoepfe(true);
  stat("Verbunden. Jetzt ENTSPERREN drücken.", "ok");
}

function lebenszeichen(){
  clearInterval(S.leben);
  S.leben = setInterval(() => {
    if(!S.verbunden || !S.lesbar) return;
    S.lesbar.readValue().catch(() => {});
  }, 2000);
}

async function schreiben(bytes){
  const daten = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ziel = S.schreib;
  if(!ziel) throw new Error("kein Kanal");
  const art = $("#wmode").value;
  const p = ziel.properties || {};

  if($("#oBcast").checked){
    await Promise.all(S.schreibListe.map(c => {
      const q = c.properties || {};
      if(q.writeWithoutResponse && c.writeValueWithoutResponse) return c.writeValueWithoutResponse(daten).catch(() => {});
      if(q.write && c.writeValueWithResponse) return c.writeValueWithResponse(daten).catch(() => {});
      return Promise.resolve();
    }));
    return;
  }
  if((art === "noresp" || (art === "auto" && p.writeWithoutResponse)) && ziel.writeValueWithoutResponse){
    return ziel.writeValueWithoutResponse(daten);
  }
  if(ziel.writeValueWithResponse) return ziel.writeValueWithResponse(daten);
  return ziel.writeValue(daten);
}

async function senden(bytes, pause){
  if(!S.verbunden) throw new Error("nicht verbunden");
  const daten = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  log("» " + hex(daten), "tx");
  await schreiben(daten);
  if(pause) await sleep(pause);
}

function empfangen(ev){
  const ch = ev.target;
  if(!ch || !ch.value) return;
  let b;
  try{
    const v = ch.value;
    b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }catch(_){ return }
  S.antwort++;
  log("« " + hex(b), "rx");

  if(b[0] === 0x46 && b[1] === 0x58 && b.length >= 42){
    setz("ckSpd", b[8]);
    setz("ckBat", b[19] + "%");
  }
  if(b[0] === 0x46 && b[1] === 0x43 && b.length >= 8){
    const c = RK.crc16(b.subarray(0, b.length - 2));
    if(((c >> 8) & 0xFF) === b[b.length - 2] && (c & 0xFF) === b[b.length - 1]){
      log("Antwort mit gültiger Prüfsumme.", "ok");
    }
    if(b[2] === 0x16 && b[3] === 0x12 && b.length > 5) setz("ckBat", b[5] + "%");
    if(b[2] === 0x16 && b[3] === 0x13 && b.length > 6) setz("ckSpd", ((b[5] << 8) | b[6]) / 100);
  }

  const t = new TextDecoder().decode(b);
  if(t.indexOf("OKSCM") >= 0){
    const f = (t.split("=")[1] || "");
    if(f.indexOf(",1") >= 0) zustand("gesperrt");
    if(f.indexOf(",0") >= 0) zustand("frei");
  }
  const mb = t.match(/OKBAT[^0-9]*(\d{1,3})/i);
  if(mb) setz("ckBat", mb[1] + "%");
}

async function schalten(an){
  if(S.busy) return;
  if(!S.verbunden){ stat("Erst verbinden.", "warn"); return }

  S.busy = true;
  knoepfe(false);
  const schritte = kette(an);
  let erfolg = false;

  try{
    for(let runde = 1; runde <= 3 && !erfolg; runde++){
      if(runde > 1) log("Runde " + runde + " …", "warn");
      for(const [name, bauen] of schritte){
        stat("Versuche: " + name + " …", "");
        S.antwort = 0;
        try{
          await senden(bauen(), 320);
        }catch(e){
          log(name + ": " + e.message, "err");
          if(/disconnect|GATT/i.test(e.message) && $("#oRecon").checked){
            try{ await aufbauen(); await senden(bauen(), 320) }catch(_){}
          }
        }
        if(S.antwort > 0){
          erfolg = true;
          S.letzter = name;
          if(S.dev){ S.merker[S.dev.id] = name; speichern("merker", S.merker) }
          log("Antwort auf: " + name, "ok");
          break;
        }
      }
    }
    if(!erfolg){
      log("Kein Rückkanal — sende blind.", "warn");
      for(let i = 0; i < 4; i++){
        try{ await senden(an ? RK.frame(0x1114) : RK.frame(0x1613, [0xF1]), 600) }catch(_){}
        try{ await senden(an ? enc("unlock") : enc("lock"), 600) }catch(_){}
      }
    }
  }finally{
    S.busy = false;
    knoepfe(true);
  }

  zustand(an ? "frei" : "gesperrt");
  if(erfolg) stat(an ? "Roller ist offen. Viel Spaß." : "Roller ist zu.", "ok");
  else stat(an ? "Blind gesendet — probier, ob er rollt." : "Blind gesendet. Probier das Schloss.", "warn");
  if(an) freiHalten();
}

function freiHalten(){
  clearInterval(S.freiTimer);
  let n = 0;
  S.freiTimer = setInterval(() => {
    if(!S.verbunden || S.gesperrt || S.busy || n++ > 15) return clearInterval(S.freiTimer);
    const b = S.letzter === "Rahmen 1114" ? RK.frame(0x1114)
      : S.letzter === "Text unlock" ? enc("unlock")
      : RK.frame(0x1663, [0xF1]);
    schreiben(b).catch(() => {});
  }, 1500);
}

async function wertSenden(wert){
  const hi = (wert >> 8) & 0xFF, lo = wert & 0xFF;
  const reg = parseInt(($("#reg").value || "0D").replace(/[^0-9a-f]/gi, ""), 16) || 0x0D;
  const schritte = [
    ["Testmodus", () => RK.at("OKXWM", [OKAI_SVC, "2"])],
    ["Passwort", () => RK.at("OKPWD", [OKAI_PW])],
    ["Fahrstufe", () => RK.at("OKECP", [OKAI_PW, String(wert)])],
    ["Rahmen 1661", () => RK.frame(0x1661, [0xF1, hi, lo])],
    ["Rahmen 1663", () => RK.frame(0x1663, [reg, lo])],
    ["Rahmen 1663 F1", () => RK.frame(0x1663, [0xF1])]
  ];
  let fehler = "";
  for(const [name, bauen] of schritte){
    try{ await senden(bauen(), 260) }
    catch(e){ fehler = name + ": " + e.message; log(fehler, "err") }
  }
  if(fehler) throw new Error(fehler);
}

async function tunen(){
  if(!S.verbunden){ stat("Erst verbinden.", "warn"); return }
  const wert = +$("#tune").value;
  speichern("tune", wert);
  stat("Setze Tempo auf " + wert + " km/h …", "");
  try{
    await wertSenden(wert);
    stat("Tempo " + wert + " km/h gesendet. Probefahrt machen.", "ok");
  }catch(e){ stat("Tempo: " + e.message, "err") }
}

async function zurueck20(){
  if(!S.verbunden){ stat("Erst verbinden.", "warn"); return }
  $("#tune").value = 20; setz("tv", "20"); speichern("tune", 20);
  stat("Setze auf 20 km/h zurück …", "");
  try{
    await wertSenden(20);
    stat("Auf 20 km/h zurückgesetzt.", "ok");
  }catch(e){ stat("Zurück: " + e.message, "err") }
}

async function boost(){
  if(!S.verbunden){ stat("Erst verbinden.", "warn"); return }
  stat("Boost wird gesetzt …", "");
  try{
    for(const [, bauen] of boostRahmen()) await senden(bauen(), 280);
    speichern("boost", true);
    stat("Boost gesetzt. Keine Grenze mehr — Akku hält kürzer.", "ok");
  }catch(e){ stat("Boost: " + e.message, "err") }
}

async function registerLesen(){
  if(!S.verbunden){ stat("Erst verbinden.", "warn"); return }
  const reg = parseInt(($("#reg").value || "0D").replace(/[^0-9a-f]/gi, ""), 16) || 0x0D;
  try{
    await senden(RK.frame(0x1661, [reg]), 400);
    stat("Register " + reg.toString(16).toUpperCase() + " abgefragt.", "ok");
  }catch(e){ stat("Lesen: " + e.message, "err") }
}

async function serverWeg(){
  if(S.busy) return;
  const code = ($("#imei").value || "").replace(/\s/g, "");
  if(!code){
    stat("Roller-Nummer eintragen oder QR scannen.", "warn");
    setz("srvOut", "Nummer fehlt");
    return;
  }
  S.busy = true;
  $("#bServer").disabled = true;
  const los = wache(200000, "Server-Weg");
  setz("srvOut", "läuft …");
  let fehler = "";
  try{ fehler = await RKNet.serverWeg(code) }
  catch(e){ fehler = e.message }
  finally{ los(); S.busy = false; $("#bServer").disabled = false }

  if(!fehler){
    setz("srvOut", "erfolgreich");
    stat("Über Server freigegeben. Kosten trägt die Demo-Karte.", "ok");
    zustand("frei");
    return;
  }

  setz("srvOut", fehler);
  stat("Server: " + fehler + " — versuche Bluetooth.", "warn");
  if(!S.verbunden && !(await verbinden())) return;
  await schalten(true);
}

async function nummerSuchen(){
  if(S.sucht){ S.sucht = false; stat("Suche abgebrochen.", "warn"); return }

  const fest = ($("#imei").value || "").replace(/\D/g, "");
  const m = ((S.dev && S.dev.name) || "").match(/([0-9A-Fa-f]{8})\s*$/);

  if(!m){ stat("Erst verbinden — der Name muss die Kennung enthalten.", "warn"); return }
  if(fest.length < 8){ stat("Mindestens 8 Ziffern eintragen.", "warn"); return }

  const ziel = m[1].toUpperCase();
  const laenge = 14;
  const offen = laenge - fest.length;

  if(offen < 0){ stat("Zu viele Ziffern.", "warn"); return }
  if(offen === 0){
    S.imei = fest; S.pw = RK.passwortAus(fest);
    speichern("imei", fest); speichern("pw", S.pw);
    setz("pwOut", S.pw);
    stat("Nummer vollständig, Passwort gerechnet.", "ok");
    return;
  }
  if(offen > 7){ stat("Zu viele Stellen offen. Mehr Ziffern eintragen.", "warn"); return }

  S.sucht = true;
  const block = new Uint8Array(8);
  const stellen = [];
  for(let p = 0; p < 16; p++){
    const w = p < fest.length ? fest.charCodeAt(p) : 48;
    if(p >= 8) block[p - 8] = w;
    if(p >= fest.length && p < laenge) stellen.push(p);
  }

  const gesamt = Math.pow(10, offen);
  let start = 0, treffer = "";

  while(start < gesamt && S.sucht && !treffer){
    const ende = Math.min(start + 50000, gesamt);
    for(let n = start; n < ende; n++){
      const ziffern = String(n).padStart(offen, "0");
      for(let k = 0; k < stellen.length; k++){
        const p = stellen[k];
        if(p >= 8) block[p - 8] = ziffern.charCodeAt(k);
      }
      if(RK.kennungBlock(block) === ziel){ treffer = fest + ziffern; break }
    }
    start = ende;
    stat("Suche … " + Math.round(start / gesamt * 100) + " %", "");
    await sleep(0);
  }

  S.sucht = false;
  if(treffer){
    S.imei = treffer;
    S.pw = RK.passwortAus(treffer);
    speichern("imei", treffer); speichern("pw", S.pw);
    $("#imei").value = treffer;
    setz("pwOut", "Nummer " + treffer + " — Passwort gerechnet.");
    stat("Nummer gefunden: " + treffer, "ok");
  }else{
    stat("Nicht gefunden. Mehr Ziffern eintragen.", "err");
  }
}

async function testlauf(){
  if(!S.verbunden){ stat("Erst verbinden.", "warn"); return }
  stat("Teste alle Formate …", "");
  for(const [name, bauen] of kette(true)){
    S.antwort = 0;
    try{ await senden(bauen(), 300) }catch(_){}
    log((S.antwort ? "✔ " : "✘ ") + name, S.antwort ? "ok" : "dim");
  }
  stat("Testlauf fertig. Was ein ✔ hat, funktioniert.", "ok");
}

async function geraetZeigen(){
  if(!S.verbunden){ stat("Erst verbinden.", "warn"); return }
  log("Name: " + (S.dev.name || "ohne"), "k");
  log("Kennung: " + S.dev.id, "k");
  const m = (S.dev.name || "").match(/([0-9A-Fa-f]{8})\s*$/);
  if(m){ log("Namens-Kennung: " + m[1].toUpperCase(), "ok"); stat("Nummer suchen möglich.", "ok") }
  else stat("Der Name enthält keine Kennung.", "warn");
}

function start(){
  if(!window.RK){ alert("protokoll.js fehlt."); return }
  if(!window.RKNet){ alert("netz.js fehlt."); return }

  RKNet.melden((t, art) => {
    log(t, art === "g" ? "ok" : art === "y" ? "warn" : "");
  });

  S.merker = holen("merker", {}) || {};
  S.imei = holen("imei", "") || "";
  S.pw = holen("pw", "") || "";
  S.marke = holen("marke", "auto") || "auto";
  if(S.imei) $("#imei").value = S.imei;

  const t = holen("tune", 25);
  $("#tune").value = t;
  setz("tv", t);

  $("#iRelay").value = RKNet.relayWert();

  $("#bConn").onclick = verbinden;
  $("#bUnlock").onclick = () => schalten(true);
  $("#bLock").onclick = () => schalten(false);
  $("#bCock").onclick = cockAuf;
  $("#bCockClose").onclick = cockZu;
  $("#bCkUnlock").onclick = () => schalten(true);
  $("#bCkLock").onclick = () => schalten(false);
  $("#bServer").onclick = serverWeg;

  $("#bRelay").onclick = () => {
    if(RKNet.relaySetzen($("#iRelay").value)) stat("Relay gespeichert.", "ok");
    else stat("Kein gültiger Relay-Link.", "warn");
  };
  $("#bSrvWeg").onclick = () => {
    RKNet.datenLoeschen();
    setz("srvOut", "Server-Daten gelöscht");
    stat("Konto und Karte vergessen.", "ok");
  };

  document.addEventListener("keydown", e => {
    if(e.key === "Escape" && !$("#cockpit").classList.contains("aus")) cockZu();
  });

  $("#bBeep").onclick = async () => {
    if(!S.verbunden){ stat("Erst verbinden.", "warn"); return }
    try{
      await senden(RK.frame(0x1663, [0xF0]), 200);
      await senden(RK.at("OKBCL", [OKAI_PW]), 200);
      stat("Signalton gesendet.", "ok");
    }catch(e){ stat("Hupe: " + e.message, "err") }
  };

  $("#bForever").onclick = async () => {
    if(!S.verbunden){ stat("Erst verbinden.", "warn"); return }
    try{
      await senden(RK.frame(0x1663, [0xF1]), 200);
      await senden(enc("unlockforever"), 200);
      stat("Roller bleibt nach dem Trennen offen.", "ok");
    }catch(e){ stat("Frei halten: " + e.message, "err") }
  };

  $("#bDrop").onclick = () => {
    try{ if(S.dev && S.dev.gatt.connected) S.dev.gatt.disconnect() }catch(_){}
    ausTrennen();
    stat("Getrennt.", "");
  };

  $("#tune").oninput = () => setz("tv", $("#tune").value);
  $("#bApply").onclick = tunen;
  $("#bSpeedReset").onclick = zurueck20;
  $("#bBoost").onclick = boost;
  $("#bRead").onclick = registerLesen;
  $("#bShot").onclick = testlauf;
  $("#bGatt").onclick = geraetZeigen;
  $("#bImei").onclick = nummerSuchen;

  $("#bPw").onclick = () => {
    const z = ($("#imei").value || "").replace(/\D/g, "");
    if(z.length < 8){ stat("Mindestens 8 Ziffern.", "warn"); return }
    S.pw = RK.passwortAus(z);
    speichern("pw", S.pw);
    setz("pwOut", S.pw || "geht nicht");
    stat("Passwort gerechnet.", "ok");
  };

  $("#bSend").onclick = async () => {
    const cmd = parseInt(($("#cCmd").value || "").replace(/[^0-9a-f]/gi, ""), 16);
    if(isNaN(cmd)){ stat("Befehl fehlt.", "warn"); return }
    try{ await senden(RK.frame(cmd, RK.vonHex($("#cPay").value)), 300); stat("Gesendet.", "ok") }
    catch(e){ stat("Senden: " + e.message, "err") }
  };

  $("#bRaw").onclick = async () => {
    const t2 = ($("#cRaw").value || "").trim();
    if(!t2) return;
    const b = /^[0-9a-f\s]+$/i.test(t2) ? RK.vonHex(t2) : enc(t2);
    try{ await senden(b, 300); stat("Gesendet.", "ok") }
    catch(e){ stat("Senden: " + e.message, "err") }
  };

  $("#wsel").onchange = () => {
    const i = $("#wsel").value;
    S.schreib = i === "" ? null : S.schreibListe[+i] || null;
  };
  $("#oLife").onchange = () => {
    if($("#oLife").checked) lebenszeichen(); else clearInterval(S.leben);
  };

  $("#bClear").onclick = () => { logEl.innerHTML = "" };
  $("#bCopy").onclick = async () => {
    try{ await navigator.clipboard.writeText(logEl.innerText); stat("Protokoll kopiert.", "ok") }
    catch(_){ stat("Kopieren ging nicht.", "warn") }
  };

  $("#marke").value = S.marke;
  $("#marke").onchange = () => { S.marke = $("#marke").value; speichern("marke", S.marke) };

  window.addEventListener("error", e => log("Fehler: " + e.message, "err"));

  for(const seite of [true, false]){
    for(const [name, bauen] of kette(seite)){
      try{
        const b = bauen();
        if(b[0] === 0x46){
          const ok = RK.frameOk(b);
          if(ok !== true) log("Rahmen " + name + ": " + ok, "err");
        }
      }catch(e){ log("Rahmen " + name + ": " + e.message, "err") }
    }
  }

  stat("Bereit. Erst verbinden.", "");
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start();