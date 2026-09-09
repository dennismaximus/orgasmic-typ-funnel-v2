import { getStore } from "@netlify/blobs";

// Primärschlüssel ist jetzt besucher_id (anonyme, client-seitig erzeugte ID aus visitor.js) —
// NICHT der Name. So kann Video-Fortschritt getrackt werden, bevor sich jemand einträgt.
// Trägt sich der Besucher später ein (status: 'formular_abgeschlossen'), wird der Name in
// denselben Datensatz gemerged, der bisherige anonyme Verlauf bleibt erhalten.
//
// Payload-Formen:
// 1) Seite/Video geöffnet: { kunde, besucher_id, status:'seite_geoeffnet', antworten:[{frage:'Video',antwort}], ... }
// 2) Video-Fortschritt:      { kunde, besucher_id, status:'video_fortschritt'|'video_verlassen', antworten:[...], ... }
// 3) Formular (optional):    { kunde, besucher_id, status:'formular_abgeschlossen', antworten:[{frage:'Dein Vorname',...}], ... }
//
// Jede Payload trägt zusätzlich `kanal` (aus visitor.js / window.MX_KANAL):
//   { kanal, kanal_vermutet, nachricht, kampagne, erst_kanal }
// Daraus wird pro Besucher eine Klick-Historie geführt — sichtbar wird damit, über welchen
// Kanal (WhatsApp/Mail/Ads) und über welche Nachricht der Sequenz jemand reingekommen ist.

// Präfix für Versandlisten-Datensätze im selben Blob-Store (siehe versand.js).
// Besucher-Datensätze dürfen diesen Präfix niemals tragen, sonst überschreibt ein
// manipulierter Client eine Versandliste.
const VERSAND_PREFIX = "versand::";

function findAntwort(antworten, frage) {
  return antworten?.find((a) => a.frage === frage)?.antwort;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Ungültiges JSON", { status: 400 });
  }

  const {
    kunde,
    besucher_id,
    status,
    antworten = [],
    query_parameter = {},
    kanal = {},
    variante = null,
    profil_typ = null,
    zeitstempel,
  } = body;

  if (!kunde?.id) {
    return new Response("kunde.id fehlt", { status: 400 });
  }
  if (!besucher_id) {
    return new Response("besucher_id fehlt", { status: 400 });
  }
  if (String(besucher_id).startsWith(VERSAND_PREFIX)) {
    return new Response("Ungültige besucher_id", { status: 400 });
  }

  const store = getStore(`tracking-${kunde.id}`);
  const key = besucher_id;

  // Netlify Blobs liest standardmaessig eventually consistent: direkt nach einem
  // Schreibvorgang kommt noch der alte Stand (oder nichts) zurueck. Ohne strong
  // consistency startet JEDES Event mit einem leeren Datensatz und ueberschreibt
  // das vorherige — im Test ueberlebte nur das letzte von drei Ereignissen.
  const bestehend = (await store.get(key, { type: "json", consistency: "strong" })) || {
    besucher_id,
    name: null,
    quelle: null, // 'personalisierter_link' oder null (organisch/anonym)
    erste_ansicht: zeitstempel,
    erstgespraech_gewuenscht: false,
    video_fortschritt: {},
    video_geoeffnet: {},
    video_gestartet: {}, // Zeitpunkt des ersten echten Play-Klicks, pro Video
    video_beendet: {},   // Zeitpunkt, an dem das Video das Ende erreicht hat, pro Video
    letzte_aktivitaet: zeitstempel,
    events: [],
    // ── Kanal-Ebene ──
    erst_kanal: null,      // erster gemessener Kanal (woher kam die Person ursprünglich)
    letzter_kanal: null,   // Kanal des jüngsten Aufrufs
    kanal_zaehler: {},     // { whatsapp: 3, mail: 1 } — wie oft pro Kanal geöffnet
    kampagnen: [],         // alle Versand-Batches, aus denen geklickt wurde
    klicks: [],            // Historie: welcher Kanal, welche Nachricht, welche Seite, wann
    // ── Splittest ──
    variante: null,        // 'A' | 'B' — Opt-in-Variante des Einstiegs (siehe index.html)
    // ── Profil-Typ ──
    profil_typ: null,      // 1..5 aus dem Selbsttest im Formular (siehe opt-in.html)
  };

  // Altbestände (vor Einführung des Kanal-Trackings) haben diese Felder nicht — nachziehen,
  // damit unten kein undefined-Zugriff passiert.
  bestehend.kanal_zaehler = bestehend.kanal_zaehler || {};
  bestehend.kampagnen = bestehend.kampagnen || [];
  bestehend.klicks = bestehend.klicks || [];

  const eventStatus = status || "seite_geoeffnet";
  bestehend.events.push({ status: eventStatus, zeitstempel, antworten });
  bestehend.letzte_aktivitaet = zeitstempel;
  bestehend.query_parameter = { ...bestehend.query_parameter, ...query_parameter };

  // ── Splittest-Variante ──
  // Nur die ERSTE Zuweisung zaehlt. Wuerde ein spaeteres Ereignis sie ueberschreiben,
  // wanderte ein Besucher, der die Seite mit geleertem Speicher erneut oeffnet, in der
  // Auswertung von einer Variante in die andere — und beide Zahlen waeren falsch.
  if (variante && !bestehend.variante) {
    bestehend.variante = variante;
  }

  // ── Profil-Typ ──
  // Anders als die Splittest-Variante darf er sich aendern: wer das Formular ein
  // zweites Mal ausfuellt, bekommt den neueren Typ. Nur nie mit null ueberschreiben —
  // sonst loescht das naechste Ereignis von einer Videoseite (die keinen Typ kennt)
  // das Ergebnis des Formulars wieder.
  if (profil_typ !== null && profil_typ !== undefined && profil_typ !== "") {
    const nr = Number(profil_typ);
    if (nr >= 1 && nr <= 5) bestehend.profil_typ = nr;
  }

  // ── Kanal verarbeiten ──
  // Nur bei echten Seitenaufrufen als Klick zählen — sonst würde jedes Fortschritts-Event
  // (alle paar Sekunden) die Historie fluten und die Kanal-Zähler unbrauchbar machen.
  if (kanal.kanal) {
    bestehend.letzter_kanal = kanal.kanal;
    if (!bestehend.erst_kanal && !kanal.kanal_vermutet) {
      bestehend.erst_kanal = kanal.erst_kanal || kanal.kanal;
    }
  }
  if (kanal.kampagne && !bestehend.kampagnen.includes(kanal.kampagne)) {
    bestehend.kampagnen.push(kanal.kampagne);
  }

  if (eventStatus === "seite_geoeffnet" && kanal.kanal) {
    const k = kanal.kanal;
    bestehend.kanal_zaehler[k] = (bestehend.kanal_zaehler[k] || 0) + 1;
    bestehend.klicks.push({
      kanal: k,
      vermutet: Boolean(kanal.kanal_vermutet),
      nachricht: kanal.nachricht || null,
      kampagne: kanal.kampagne || null,
      seite: findAntwort(antworten, "Video") || null,
      zeitstempel,
    });
    // Historie deckeln — für den Vertrieb sind die letzten 50 Klicks mehr als genug,
    // und ein Blob-Datensatz soll nicht unbegrenzt wachsen.
    if (bestehend.klicks.length > 50) {
      bestehend.klicks = bestehend.klicks.slice(-50);
    }
  }

  if (eventStatus === "formular_abgeschlossen") {
    // Name wird nachträglich in den bestehenden (evtl. schon anonym aktiven) Datensatz gemerged
    const name = findAntwort(antworten, "Dein Vorname");
    if (name) bestehend.name = name;
    const wunsch = antworten.find((a) => a.frage.includes("Erstgespräch"));
    if (wunsch) bestehend.erstgespraech_gewuenscht = wunsch.antwort === "Ja";
  }

  if (eventStatus === "identifiziert") {
    // Besucher kam über einen personalisierten Link (Ads/E-Mail/WhatsApp mit lead_id/c_id/name
    // im Link, siehe visitor.js) — Name direkt bei Video-Öffnung bekannt, kein Formular nötig.
    const name = findAntwort(antworten, "Dein Vorname");
    if (name && !bestehend.name) bestehend.name = name;
    if (!bestehend.quelle) bestehend.quelle = "personalisierter_link";
  }

  if (eventStatus === "seite_geoeffnet") {
    const video = findAntwort(antworten, "Video");
    if (video && !bestehend.video_geoeffnet[video]) {
      bestehend.video_geoeffnet[video] = zeitstempel;
    }
  }

  if (eventStatus === "video_gestartet") {
    const video = findAntwort(antworten, "Video");
    if (video && !bestehend.video_gestartet[video]) {
      bestehend.video_gestartet[video] = zeitstempel;
    }
  }

  if (eventStatus === "video_beendet") {
    const video = findAntwort(antworten, "Video");
    if (video && !bestehend.video_beendet[video]) {
      bestehend.video_beendet[video] = zeitstempel;
    }
  }

  if (eventStatus === "video_fortschritt" || eventStatus === "video_verlassen") {
    const video = findAntwort(antworten, "Video");
    const prozent = parseInt(findAntwort(antworten, "Fortschritt") || "0", 10);
    const sekunden = findAntwort(antworten, "Sekunden angesehen");
    const geschwindigkeit = findAntwort(antworten, "Wiedergabegeschwindigkeit");

    if (video) {
      const vorher = bestehend.video_fortschritt[video];
      // Nur überschreiben wenn neuer Fortschritt höher ist (kein Rückschritt bei erneutem Ansehen von vorne)
      if (!vorher || prozent > vorher.prozent) {
        bestehend.video_fortschritt[video] = { prozent, sekunden, geschwindigkeit };
      }
    }
  }

  await store.setJSON(key, bestehend);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = { path: "/.netlify/functions/track" };
