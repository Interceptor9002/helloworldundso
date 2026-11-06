/* Rahmen, Prüfsumme, Passwort. Reine Rechnung, kein Bluetooth. */
"use strict";

window.RK = (() => {
  const hex = b => Array.from(b).map(x => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  const enc = s => new TextEncoder().encode(s);

  let seq = 1;
  function naechste(){
    seq = (seq + 1) & 0xFFFF;
    return seq.toString(16).toUpperCase().padStart(4, "0");
  }

  function crc16(b){
    let c = 0;
    for(const x of b){
      c ^= x << 8;
      for(let i = 0; i < 8; i++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
    }
    return c & 0xFFFF;
  }

  function frame(cmd, payload){
    const p = payload ? Array.from(payload) : [];
    const f = new Uint8Array(8 + p.length);
    f[0] = 0x46; f[1] = 0x43;
    f[2] = (cmd >> 8) & 0xFF; f[3] = cmd & 0xFF;
    f[4] = (p.length >> 8) & 0xFF; f[5] = p.length & 0xFF;
    f.set(p, 6);
    const c = crc16(f.subarray(0, 6 + p.length));
    f[6 + p.length] = (c >> 8) & 0xFF;
    f[7 + p.length] = c & 0xFF;
    return f;
  }

  function frameOk(b){
    if(!(b instanceof Uint8Array) || b.length < 8) return "zu kurz";
    if(b[0] !== 0x46 || b[1] !== 0x43) return "kein Rahmen";
    const len = (b[4] << 8) | b[5];
    if(len !== b.length - 8) return "Länge falsch";
    const c = crc16(b.subarray(0, b.length - 2));
    if(((c >> 8) & 0xFF) !== b[b.length - 2] || (c & 0xFF) !== b[b.length - 1]) return "Prüfsumme falsch";
    return true;
  }

  function at(op, felder){
    const f = (felder || []).map(String);
    const s = naechste();
    return enc(f.length ? "AT+" + op + "=" + f.join(",") + "," + s + "$\r\n"
                        : "AT+" + op + "," + s + "$\r\n");
  }

  function atLime(typ, daten, pw){
    const s = naechste();
    return enc("AT+" + typ + "," + (pw || "000000") + "," + Date.now() + "," + s +
      (daten ? ",{" + daten + "}$\r\n" : "$\r\n"));
  }

  function vonHex(s){
    const h = String(s || "").replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
    const o = new Uint8Array(Math.floor(h.length / 2));
    for(let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16);
    return o;
  }

  const D_IP=[58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,
  57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
  const D_FP=[40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,
  36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
  const D_E=[32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,
  20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
  const D_P=[16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
  const D_PC1=[57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,
  63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
  const D_PC2=[14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,
  47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
  const D_SH=[1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
  const D_S=[
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,
  4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,
  0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,
  13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,
  10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,
  4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,
  9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,
  1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,
  7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
  ];

  const bits = b => { const o = []; for(const x of b) for(let i = 7; i >= 0; i--) o.push((x >> i) & 1); return o };
  const unbits = b => {
    const o = new Uint8Array(b.length / 8);
    for(let i = 0; i < o.length; i++){
      let v = 0;
      for(let j = 0; j < 8; j++) v = (v << 1) | b[i * 8 + j];
      o[i] = v;
    }
    return o;
  };
  const perm = (b, t) => t.map(p => b[p - 1]);
  const rot = (b, n) => b.slice(n).concat(b.slice(0, n));

  function desKeys(key){
    const k = perm(bits(key), D_PC1);
    let C = k.slice(0, 28), D = k.slice(28);
    const out = [];
    for(let i = 0; i < 16; i++){
      C = rot(C, D_SH[i]); D = rot(D, D_SH[i]);
      out.push(perm(C.concat(D), D_PC2));
    }
    return out;
  }

  function desF(R, K){
    const x = perm(R, D_E).map((v, i) => v ^ K[i]);
    const o = [];
    for(let i = 0; i < 8; i++){
      const b = x.slice(i * 6, i * 6 + 6);
      const r = (b[0] << 1) | b[5];
      const c = (b[1] << 3) | (b[2] << 2) | (b[3] << 1) | b[4];
      const v = D_S[i][r * 16 + c];
      o.push((v >> 3) & 1, (v >> 2) & 1, (v >> 1) & 1, v & 1);
    }
    return perm(o, D_P);
  }

  function desBlock(block, keys){
    const b = perm(bits(block), D_IP);
    let L = b.slice(0, 32), R = b.slice(32);
    for(let i = 0; i < 16; i++){
      const f = desF(R, keys[i]);
      const n = L.map((v, j) => v ^ f[j]);
      L = R; R = n;
    }
    return unbits(perm(R.concat(L), D_FP));
  }

  const FEST = new Uint8Array([0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88]);
  let KEYS = null;
  const keys = () => { if(!KEYS) KEYS = desKeys(FEST); return KEYS };

  function passwortAus(nummer){
    const z = String(nummer || "").replace(/\D/g, "");
    if(z.length < 8) return "";
    const k = keys();
    const roh = enc(z.padEnd(16, "0"));
    const a = desBlock(roh.slice(0, 8), k);
    const b = desBlock(roh.slice(8, 16), k);
    const alle = new Uint8Array(16);
    alle.set(a, 0); alle.set(b, 8);
    return hex(alle).replace(/ /g, "");
  }

  function kennungBlock(block){
    return hex(desBlock(block, keys())).replace(/ /g, "").slice(24, 32);
  }

  return { hex, enc, crc16, frame, frameOk, at, atLime, vonHex, passwortAus, kennungBlock };
})();