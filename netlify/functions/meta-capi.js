// Schickt Lead-Ereignisse serverseitig an die Meta Conversions API.
//
// WARUM ES DIESE FUNKTION GIBT (Befund 02.09.2026):
// Der Funnel meldete an Meta bisher NUR aus dem Browser: `PageView` und
// `ViewContent` auf Schritt 2. Kein einziges `Lead`-Ereignis, weder im Browser
// noch serverseitig. Meta konnte also nie lernen, wer sich eintraegt, und
// optimierte auf Seitenaufrufe statt auf Anmeldungen.
//
// WARUM NICHT UEBER n8n: derselbe Grund wie bei `mautic-lead.js`. Der erste Node
// dort verwirft jede Anmeldung ohne `utm_campaign_id`, also allen organischen und
// allen WhatsApp-Traffic. Genau diese Leads fehlten Meta.
//
// WARUM SERVERSEITIG UND IM BROWSER GLEICHZEITIG:
// Der Browser-Pixel wird von Adblockern und iOS-Trackingschutz verschluckt, der
// Server-Aufruf nicht. Beide schicken dasselbe `event_id`, Meta wirft das Duplikat
// weg (Deduplizierung). Ohne gemeinsames `event_id` zaehlt jeder Lead doppelt.
//
// ERWARTETE UMGEBUNGSVARIABLEN (im Netlify-Projekt setzen, niemals im Code):
//   META_PIXEL_ID    Pixel-ID, hier 884943434243515 (steht auch in opt-in.html)
//   META_CAPI_TOKEN  System-User-Token aus dem Events Manager
//   META_CAPI_AKTIV  "1" sendet wirklich. Alles andere ist Trockenlauf.
//   META_TEST_CODE   optional: Testereignis-Code aus dem Events Manager
//
// AUSLIEFERUNGSZUSTAND IST DER TROCKENLAUF (`META_CAPI_AKTIV` ungesetzt).
// Erst scharfschalten, wenn das Testereignis im Events Manager mit einer
// Uebereinstimmungsqualitaet groesser 0 ankommt. Vorher steht die Nutzlast nur
// im Function-Log, und es wird nichts gesendet.
//
// HASHING: Meta will ungepfeffertes SHA-256 ueber die normalisierte Rohadresse.
// Ein gepfefferter Hash wird angenommen und ordnet nichts zu, `events_received: 1`
// bei Trefferquote null. Die Rohwerte kommen aus dem Formular, werden im Speicher
// gehasht und nirgends abgelegt.
//
// GRUNDREGEL: Diese Funktion darf den Funnel niemals sichtbar brechen. Fehlt die
// Konfiguration, kommt `ok:false` mit Status 200 zurueck und die Anmeldung laeuft
// weiter.

import crypto from "node:crypto";

const ZEITLIMIT_MS = 6000;
const API_VERSION = "v21.0";

// Nur diese Ereignisse duerfen gesendet werden. Ohne Positivliste kann ein
// manipulierter Aufruf beliebige Ereignisse in das Pixel schreiben und die
// Optimierung des Kontos verderben.
const ERLAUBT = new Set(["Lead", "CompleteRegistration", "Schedule", "Purchase"]);

function hash(wert) {
  if (wert === undefined || wert === null) return undefined;
  const s = String(wert).trim().toLowerCase();
  if (!s) return undefined;
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// Telefonnummern normalisiert Meta als reine Ziffernfolge mit Laendervorwahl,
// ohne Plus, ohne Leerzeichen. "+49 170 123" und "0170123" muessen denselben
// Hash ergeben, sonst ordnet Meta dieselbe Frau zwei Personen zu.
function hashTelefon(nummer) {
  if (!nummer) return undefined;
  let z = String(nummer).replace(/[^\d+]/g, "");
  if (z.startsWith("+")) z = z.slice(1);
  else if (z.startsWith("00")) z = z.slice(2);
  else if (z.startsWith("0")) z = "49" + z.slice(1);   // Zielgruppe ist DACH, Standard Deutschland
  if (!z) return undefined;
  return crypto.createHash("sha256").update(z, "utf8").digest("hex");
}

function antwort(nutzlast) {
  return new Response(JSON.stringify(nutzlast), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Ungueltiges JSON", { status: 400 });
  }

  const ereignis = String(body.ereignis || "Lead");
  if (!ERLAUBT.has(ereignis)) {
    return antwort({ ok: false, grund: "Ereignis nicht erlaubt: " + ereignis });
  }

  const pixel = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;

  const ip = (req.headers.get("x-nf-client-connection-ip") ||
              req.headers.get("x-forwarded-for") || "").split(",")[0].trim();

  const namensteile = String(body.vorname || "").trim().split(/\s+/);

  const user_data = {
    em: hash(body.email),
    ph: hashTelefon(body.telefon),
    fn: hash(namensteile[0]),
    ln: hash(body.nachname),
    // fbp und fbc kommen aus den Cookies der Seite. Sie sind der staerkste
    // Zuordnungsschluessel: ohne sie muss Meta ueber gehashte Kontaktdaten raten.
    fbp: body.fbp || undefined,
    fbc: body.fbc || undefined,
    client_ip_address: ip || undefined,
    client_user_agent: req.headers.get("user-agent") || undefined,
    // Eigene ID des Besuchers, damit spaetere Ereignisse derselben Person
    // zugeordnet werden, auch wenn Cookies fehlen.
    external_id: body.besucher_id ? hash(body.besucher_id) : undefined,
  };
  for (const k of Object.keys(user_data)) if (user_data[k] === undefined) delete user_data[k];

  const daten = {
    event_name: ereignis,
    // Sekunden, nicht Millisekunden. Meta verwirft Ereignisse mit einem
    // Zeitstempel in Millisekunden kommentarlos als "zu weit in der Zukunft".
    event_time: Math.floor(Date.now() / 1000),
    // Derselbe Wert wie im Browser-Pixel. Fehlt er, zaehlt jeder Lead doppelt.
    event_id: body.event_id || undefined,
    event_source_url: body.quelle_url || undefined,
    action_source: "website",
    user_data,
    custom_data: {
      content_name: body.inhalt || "Live ORGASMIC Typ-Funnel",
      // Der Lead Score ist als erwarteter Wert der Anfrage gerechnet (siehe
      // opt-in.html). Damit kann Meta auf Wert optimieren statt auf Stueckzahl.
      value: typeof body.score === "number" ? body.score : undefined,
      currency: typeof body.score === "number" ? "EUR" : undefined,
      status: body.stufe || undefined,     // "teil" oder "voll"
      profil_typ: body.profil_typ || undefined,
    },
  };
  for (const k of Object.keys(daten.custom_data)) {
    if (daten.custom_data[k] === undefined) delete daten.custom_data[k];
  }

  if (!pixel || !token) {
    console.error("META_PIXEL_ID / META_CAPI_TOKEN fehlen, Ereignis NICHT gesendet:", ereignis);
    return antwort({ ok: false, grund: "Meta-CAPI nicht konfiguriert" });
  }

  if (process.env.META_CAPI_AKTIV !== "1") {
    console.log("[Trockenlauf] Meta-CAPI wuerde senden:", JSON.stringify(daten));
    return antwort({ ok: true, trockenlauf: true, ereignis });
  }

  const nutzlast = { data: [daten] };
  if (process.env.META_TEST_CODE) nutzlast.test_event_code = process.env.META_TEST_CODE;

  const controller = new AbortController();
  const abbruch = setTimeout(() => controller.abort(), ZEITLIMIT_MS);
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixel}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nutzlast),
        signal: controller.signal,
      }
    );
    const text = await res.text();
    if (!res.ok) {
      console.error("Meta-CAPI-Fehler:", res.status, text.slice(0, 500));
      return antwort({ ok: false, grund: "Meta-API-Fehler " + res.status });
    }
    return antwort({ ok: true, ereignis, meta: text.slice(0, 300) });
  } catch (err) {
    console.error("meta-capi Fehler:", err.name === "AbortError" ? "Zeitlimit" : err.message);
    return antwort({ ok: false, grund: "Meta nicht erreichbar" });
  } finally {
    clearTimeout(abbruch);
  }
};

export const config = { path: "/.netlify/functions/meta-capi" };
