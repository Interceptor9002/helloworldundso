const ERLAUBT = [
  "web-production.lime.bike", "lime.bike", "www.li.me",
  "api.mail.tm", "api.mail.gw"
];

const KORB = new Map();

export default {
  async fetch(anfrage){
    const kopf = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Expose-Headers": "*"
    };
    if(anfrage.method === "OPTIONS") return new Response(null, { headers:kopf });

    const ziel = new URL(anfrage.url).searchParams.get("u");
    if(!ziel) return new Response(JSON.stringify({ fehler:"kein Ziel" }),
      { status:400, headers:Object.assign({ "Content-Type":"application/json" }, kopf) });

    let z;
    try{ z = new URL(ziel) }catch(_){
      return new Response(JSON.stringify({ fehler:"Ziel kaputt" }),
        { status:400, headers:Object.assign({ "Content-Type":"application/json" }, kopf) });
    }
    if(!ERLAUBT.some(h => z.hostname === h || z.hostname.endsWith("." + h))){
      return new Response(JSON.stringify({ fehler:"nicht erlaubt: " + z.hostname }),
        { status:403, headers:Object.assign({ "Content-Type":"application/json" }, kopf) });
    }

    const kk = z.hostname;
    const alter = KORB.get(kk) || "";
    const kopfAus = new Headers();
    anfrage.headers.forEach((v, k) => {
      if(!["host","origin","referer","cookie","cf-connecting-ip"].includes(k.toLowerCase())){
        kopfAus.set(k, v);
      }
    });
    if(alter) kopfAus.set("Cookie", alter);
    if(!kopfAus.has("User-Agent")) kopfAus.set("User-Agent", "Mozilla/5.0 (Linux; Android 14)");
    kopfAus.set("Origin", z.origin);
    kopfAus.set("Referer", z.origin + "/");

    const rumpf = ["GET","HEAD"].includes(anfrage.method) ? undefined : await anfrage.arrayBuffer();

    let antwort;
    for(let i = 0; i < 3; i++){
      antwort = await fetch(z.toString(), {
        method:anfrage.method, headers:kopfAus, body:rumpf, redirect:"follow"
      });
      if(antwort.status !== 429 && antwort.status !== 503) break;
      await new Promise(r => setTimeout(r, 700 * (i + 1)));
    }

    const kuchen = antwort.headers.get("set-cookie");
    if(kuchen){
      const neu = (alter ? alter + "; " : "") + kuchen.split(";")[0];
      KORB.set(kk, neu.slice(0, 2000));
    }

    const aus = new Headers(kopf);
    aus.set("Content-Type", antwort.headers.get("content-type") || "text/plain; charset=utf-8");
    return new Response(await antwort.arrayBuffer(), { status:antwort.status, headers:aus });
  }
};