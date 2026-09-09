// Echte freie Termine aus Easy!Appointments (booking.orgasmic.live) — für das Chat-Widget.
//
// ── WARUM ES DIESE FUNKTION ÜBERHAUPT GIBT ──────────────────────────────────
// Im Call (11.08.2026) war der Wunsch, im Widget zwei konkrete Termine anzubieten
// statt nur "hier klicken zum Termin buchen". Christian: "Könntest du sogar
// theoretisch dynamisch auslesen und rein machen."
//
// Aus dem Browser geht das NICHT: Easy!Appointments rendert die Zeiten per AJAX,
// der Endpunkt verlangt ein CSRF-Token aus dem Seiten-HTML, und der Aufruf von
// unserer Netlify-Domain aus scheitert an der Same-Origin-Regel. Deshalb serverseitig.
//
// Die Alternative wäre gewesen, Zeiten nach einer Regel zu ERFINDEN ("werktags abends").
// Das ist bewusst nicht passiert: dann steht im Widget ein Termin, den es nicht gibt,
// und die Frau landet im Kalender vor einer geschlossenen Tür. Lieber keine Zeit
// anbieten als eine falsche — das Widget kommt ohne aus (siehe chat-widget.js).
//
// ── DER VERTRAG, GEGEN DEN HIER GEBAUT WIRD ─────────────────────────────────
// Am 11.08.2026 gegen die Live-Instanz gemessen, nicht aus der Doku geraten:
//   GET  /index.php/?service=2&provider=any-provider   → HTML mit csrf_token + Session-Cookie
//   POST /index.php/booking/get_available_hours
//        csrf_token, service_id, provider_id, selected_date=YYYY-MM-DD,
//        manage_mode=0, appointment_id=
//        → 200, Body: ["09:00","09:30",...]  (leeres Array = an dem Tag nichts frei)
//
// Gegenprobe damals: 12./13.08. voll, 15./17.08. ohne 14:00+14:30 (belegt),
// 20.08. leeres Array. Die Zahlen sind also echt und nicht überall gleich.

const BASIS = process.env.BUCHUNG_BASIS || "https://booking.orgasmic.live";
const SERVICE_ID = process.env.BUCHUNG_SERVICE_ID || "2";
const PROVIDER_ID = process.env.BUCHUNG_PROVIDER_ID || "any-provider";
const ZEITZONE = "Europe/Berlin";

// Projekt-Variablen erreichen die Functions im Teststand nicht (Netlify.env.get() und
// process.env beide leer, obwohl `env:list` sie zeigt) — deshalb stehen oben überall
// Rückfallwerte. Siehe LIESMICH.md, offener Punkt.

// Wie weit im Voraus gesucht wird und wie viele Termine zurückkommen.
const TAGE_VORAUS = 14;
const MAX_TERMINE = 2;

// Kein Termin heute in den nächsten zwei Stunden — sonst schlägt das Widget eine
// Uhrzeit vor, die vorbei ist, bis die Frau den Chat durchgelesen hat.
const VORLAUF_MINUTEN = 120;

// Ergebnis kurz halten: das Widget fragt bei jedem Seitenaufruf. Ohne Cache wären das
// pro Besucherin 15 Anfragen gegen Christians Server.
const CACHE_MS = 5 * 60 * 1000;
let cache = { zeit: 0, daten: null };

function berlinHeute() {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZEITZONE, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return f.format(new Date()); // YYYY-MM-DD
}

function tagePlus(isoDatum, n) {
  const d = new Date(isoDatum + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function berlinJetztMinuten() {
  const f = new Intl.DateTimeFormat("de-DE", {
    timeZone: ZEITZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const [h, m] = f.format(new Date()).split(":").map(Number);
  return h * 60 + m;
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function beschriftung(isoDatum, zeit) {
  const d = new Date(isoDatum + "T12:00:00Z");
  const heute = berlinHeute();
  const morgen = tagePlus(heute, 1);
  const tag =
    isoDatum === heute ? "heute" :
    isoDatum === morgen ? "morgen" :
    WOCHENTAGE[d.getUTCDay()] + ", " + String(d.getUTCDate()).padStart(2, "0") + "." + String(d.getUTCMonth() + 1).padStart(2, "0") + ".";
  return tag + " um " + zeit + " Uhr";
}

// Holt CSRF-Token und Session-Cookie von der Buchungsseite. Beides gehört zusammen —
// ein Token ohne die passende Session wird abgelehnt.
async function sitzungHolen() {
  const url = BASIS + "/index.php/?service=" + encodeURIComponent(SERVICE_ID) +
              "&provider=" + encodeURIComponent(PROVIDER_ID);
  const antwort = await fetch(url, { headers: { "User-Agent": "MAXIMUS-Funnel/1.0" } });
  if (!antwort.ok) throw new Error("Buchungsseite antwortete mit " + antwort.status);

  const html = await antwort.text();
  const treffer = html.match(/csrf_?[tT]oken["'\s:=]+([a-zA-Z0-9]{16,})/);
  if (!treffer) throw new Error("Kein CSRF-Token in der Buchungsseite gefunden");

  // getSetCookie() gibt es nicht überall — auf den zusammengefassten Header zurückfallen.
  const rohCookies = typeof antwort.headers.getSetCookie === "function"
    ? antwort.headers.getSetCookie()
    : [antwort.headers.get("set-cookie")].filter(Boolean);
  const cookie = rohCookies.map((c) => String(c).split(";")[0]).join("; ");

  return { token: treffer[1], cookie };
}

async function zeitenFuerTag(sitzung, datum) {
  const body = new URLSearchParams({
    csrf_token: sitzung.token,
    service_id: String(SERVICE_ID),
    provider_id: String(PROVIDER_ID),
    selected_date: datum,
    manage_mode: "0",
    appointment_id: "",
  });

  const antwort = await fetch(BASIS + "/index.php/booking/get_available_hours", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "MAXIMUS-Funnel/1.0",
      ...(sitzung.cookie ? { Cookie: sitzung.cookie } : {}),
    },
    body,
  });

  if (!antwort.ok) return [];
  try {
    const daten = JSON.parse(await antwort.text());
    return Array.isArray(daten) ? daten : [];
  } catch {
    return [];
  }
}

async function termineSuchen() {
  const sitzung = await sitzungHolen();
  const heute = berlinHeute();
  const jetztMin = berlinJetztMinuten();
  const gefunden = [];

  for (let i = 0; i < TAGE_VORAUS && gefunden.length < MAX_TERMINE; i++) {
    const datum = tagePlus(heute, i);
    const zeiten = await zeitenFuerTag(sitzung, datum);

    for (const zeit of zeiten) {
      if (gefunden.length >= MAX_TERMINE) break;
      if (datum === heute) {
        const [h, m] = zeit.split(":").map(Number);
        if (h * 60 + m < jetztMin + VORLAUF_MINUTEN) continue;
      }
      gefunden.push({ datum, zeit, label: beschriftung(datum, zeit) });
    }
  }

  return gefunden;
}

export default async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const kopf = {
    "Content-Type": "application/json; charset=utf-8",
    // Kurz cachen, aber nie so lange, dass ein eben gebuchter Termin noch angeboten wird.
    "Cache-Control": "public, max-age=120",
  };

  if (cache.daten && Date.now() - cache.zeit < CACHE_MS) {
    return new Response(JSON.stringify({ ...cache.daten, cache: true }), { headers: kopf });
  }

  try {
    const termine = await termineSuchen();
    const daten = { termine, quelle: "live", stand: new Date().toISOString() };
    cache = { zeit: Date.now(), daten };
    return new Response(JSON.stringify(daten), { headers: kopf });
  } catch (fehler) {
    // Bewusst 200 mit leerer Liste statt 500: das Widget soll weiterlaufen und nur
    // ohne konkrete Zeiten arbeiten. Ein Fehler hier darf den Funnel nicht anhalten.
    return new Response(
      JSON.stringify({ termine: [], quelle: "nicht_erreichbar", hinweis: String(fehler.message || fehler) }),
      { headers: kopf }
    );
  }
};
