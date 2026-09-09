// Legt die Anmeldung aus opt-in.html als Kontakt in CHRISTIANS MAUTIC an und gibt die
// Mautic-Contact-ID zurück.
//
// WARUM ES DIESE FUNKTION GIBT (Befund 18.08.2026):
// Der Funnel hatte bis hierher keinen einzigen Schreibweg nach Mautic. `track.js`
// schreibt ausschließlich in den Netlify-Blob-Store, der n8n-Workflow `Netlify`
// kennt Close und Brevo — aber kein Mautic. Mautic kam im Code nur LESEND vor:
// `visitor.js` erwartet eine Lead-ID *aus* dem Link. Wer sich also über den Funnel
// einträgt, existierte in Mautic nicht, bekam keine Sequenz und musste beim Buchen
// alle Daten erneut tippen.
//
// WARUM NICHT ÜBER n8n:
//   1. Der erste Node dort (`Filter Organic Leads`) verwirft jede Anmeldung ohne
//      `utm_campaign_id` — also allen organischen und WhatsApp-Traffic.
//   2. Der n8n-Webhook antwortet sofort mit "Workflow got started" und kann die
//      Mautic-ID deshalb nie an die Seite zurückgeben. Ohne ID keine Buchungs-Brücke.
// n8n bleibt für Close, Meta-CAPI und Telegram zuständig — das hier läuft daneben.
//
// ERWARTETE UMGEBUNGSVARIABLEN (im Netlify-Projekt setzen, niemals im Code):
//   MAUTIC_URL           Basis-URL ohne Schrägstrich am Ende, z.B. https://mautic.orgasmic.live
//   MAUTIC_USER          Mautic-Benutzer mit Kontakt-Rechten
//   MAUTIC_PASSWORD      dessen Passwort
//                        → In Mautic muss unter Einstellungen > Konfiguration > API
//                          sowohl "API aktiviert" als auch "HTTP-Basic-Auth aktiviert" stehen.
//   MAUTIC_SEGMENT_ID    optional: ID des Segments "Challenge 8 Tage" (nur die Zahl)
//   MAUTIC_TAGS          optional: Komma-Liste, Standard "challenge-8-tage"
//   MAUTIC_FELD_SCORE    optional: Alias des Mautic-Feldes für den Lead-Score
//   MAUTIC_FELD_KANAL    optional: Alias für den Kanal (whatsapp/mail/ads/…)
//   MAUTIC_FELD_KAMPAGNE optional: Alias für den Versand-Batch
//   MAUTIC_FELD_BESUCHER optional: Alias für die besucher_id (Brücke ins Tracking)
//
// Die vier FELD-Variablen sind bewusst NICHT vorbelegt: Feld-Aliase sind pro
// Mautic-Installation eigene Namen. Ein geratener Alias wird von Mautic still
// ignoriert — es sieht dann monatelang nach "läuft" aus, und die Felder bleiben leer.
// Was nicht gesetzt ist, wird nicht mitgeschickt.
//
// GRUNDREGEL: Diese Funktion darf den Funnel niemals sichtbar brechen. Fehlt die
// Konfiguration oder ist Mautic nicht erreichbar, kommt `ok:false` mit Status 200
// zurück, der Fehler steht im Netlify-Function-Log, und die Anmeldung läuft weiter.

const ZEITLIMIT_MS = 8000;

function basicAuth(user, passwort) {
  return "Basic " + Buffer.from(user + ":" + passwort).toString("base64");
}

async function mauticFetch(pfad, optionen, konfig) {
  const controller = new AbortController();
  const abbruch = setTimeout(() => controller.abort(), ZEITLIMIT_MS);
  try {
    return await fetch(konfig.url + pfad, {
      ...optionen,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: basicAuth(konfig.user, konfig.passwort),
        ...(optionen.headers || {}),
      },
    });
  } finally {
    clearTimeout(abbruch);
  }
}

// Mautic legt bei `contacts/new` IMMER einen neuen Datensatz an — auch wenn die
// E-Mail schon existiert. Bei einer 8-Tage-Sequenz mit mehreren Einstiegspunkten
// stünden dieselben Frauen sonst mehrfach im Segment und bekämen jede Nachricht
// doppelt. Deshalb wird vorher gesucht und bei Treffer bearbeitet.
async function findeKontakt(email, konfig) {
  const suche = encodeURIComponent("email:" + email);
  const res = await mauticFetch(`/api/contacts?search=${suche}&limit=1`, { method: "GET" }, konfig);
  if (!res.ok) return null;
  const daten = await res.json();
  const treffer = Object.values(daten.contacts || {});
  return treffer.length ? treffer[0] : null;
}

function baueFelder(body, ip) {
  const felder = {};

  if (body.vorname) felder.firstname = body.vorname;
  if (body.nachname) felder.lastname = body.nachname;
  if (body.email) felder.email = body.email;
  // `mobile` zusätzlich zu `phone`: die Sequenz läuft über WhatsApp, und Mautic liest
  // für den WhatsApp-Versand das Mobilfeld. `phone` wird mitgefüllt, damit das
  // Buchungstool die Nummer auf jeden Fall findet.
  if (body.telefon) {
    felder.mobile = body.telefon;
    felder.phone = body.telefon;
  }
  // Nachweis der Einwilligung: Mautic speichert die IP am Kontakt. Ohne sie steht bei
  // einer DSGVO-Nachfrage nur "hat sich mal eingetragen" im Raum.
  if (ip) felder.ipAddress = ip;

  const tags = (process.env.MAUTIC_TAGS || "challenge-8-tage")
    .split(",").map((t) => t.trim()).filter(Boolean);

  // Stufe der Anmeldung. Seit 02.09.2026 schreibt der Funnel den Kontakt schon
  // nach Schritt 2 (Name, E-Mail, Telefon), nicht erst nach Schritt 15. Vorher war
  // jede Abbrecherin dazwischen fuer Mautic unsichtbar: sie hatte ihre E-Mail
  // gegeben, stand in keinem Segment und bekam keine einzige Nachricht.
  //
  // Der Tag trennt die beiden Faelle. Beim vollstaendigen Absenden wird er mit dem
  // Minus-Praefix wieder entfernt, das ist Mautics Schreibweise fuer "Tag abziehen".
  // Ohne das Entfernen truege jede Frau den Abbrecher-Tag fuer immer, und ein
  // Segment "hat abgebrochen" waere wertlos.
  if (body.stufe === "teil") {
    tags.push("anmeldung-unvollstaendig");
  } else if (body.stufe === "voll") {
    tags.push("-anmeldung-unvollstaendig");
    tags.push("anmeldung-komplett");
  }

  if (tags.length) felder.tags = tags;

  // Nur gesetzte Aliase schicken — siehe Kopfkommentar.
  const zuordnung = [
    [process.env.MAUTIC_FELD_SCORE, body.score],
    [process.env.MAUTIC_FELD_KANAL, body.kanal && body.kanal.kanal],
    [process.env.MAUTIC_FELD_KAMPAGNE, body.kanal && body.kanal.kampagne],
    [process.env.MAUTIC_FELD_BESUCHER, body.besucher_id],
  ];
  for (const [alias, wert] of zuordnung) {
    if (alias && wert !== undefined && wert !== null && wert !== "") {
      felder[alias] = String(wert);
    }
  }

  return felder;
}

function antwort(nutzlast) {
  return new Response(JSON.stringify(nutzlast), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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

  const konfig = {
    url: (process.env.MAUTIC_URL || "").replace(/\/+$/, ""),
    user: process.env.MAUTIC_USER,
    passwort: process.env.MAUTIC_PASSWORD,
  };

  if (!konfig.url || !konfig.user || !konfig.passwort) {
    console.error(
      "MAUTIC_URL / MAUTIC_USER / MAUTIC_PASSWORD fehlen — Lead NICHT nach Mautic übertragen:",
      body.email || body.vorname || "(ohne Kennung)"
    );
    return antwort({ ok: false, grund: "Mautic nicht konfiguriert" });
  }

  if (!body.email) {
    console.error("Lead ohne E-Mail — Mautic braucht sie als Schlüssel:", body.besucher_id);
    return antwort({ ok: false, grund: "E-Mail fehlt" });
  }

  const ip = (req.headers.get("x-nf-client-connection-ip") ||
              req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const felder = baueFelder(body, ip);

  try {
    const bestehend = await findeKontakt(body.email, konfig);

    const pfad = bestehend ? `/api/contacts/${bestehend.id}/edit` : "/api/contacts/new";
    // PATCH statt PUT beim Bearbeiten: PUT leert in Mautic jedes Feld, das nicht
    // mitgeschickt wird. Ein zweiter Eintrag würde sonst alles löschen, was Christian
    // oder eine frühere Kampagne am Kontakt gesammelt hat.
    const methode = bestehend ? "PATCH" : "POST";

    const res = await mauticFetch(pfad, { method: methode, body: JSON.stringify(felder) }, konfig);

    if (!res.ok) {
      const text = await res.text();
      console.error("Mautic-Fehler:", res.status, text.slice(0, 500));
      return antwort({ ok: false, grund: "Mautic-API-Fehler " + res.status });
    }

    const daten = await res.json();
    const leadId = daten.contact && daten.contact.id;

    if (!leadId) {
      console.error("Mautic antwortete ohne Kontakt-ID:", JSON.stringify(daten).slice(0, 300));
      return antwort({ ok: false, grund: "keine Kontakt-ID" });
    }

    // Segment setzen. Bewusst NACH der Kontaktanlage und mit eigenem Fehlerpfad:
    // scheitert das Segment, ist der Kontakt trotzdem da und die ID nutzbar — die
    // Buchungs-Brücke funktioniert dann, auch wenn die Sequenz noch nicht läuft.
    const segment = process.env.MAUTIC_SEGMENT_ID;
    let imSegment = false;
    if (segment) {
      try {
        const segRes = await mauticFetch(
          `/api/segments/${segment}/contact/${leadId}/add`,
          { method: "POST", body: "{}" },
          konfig
        );
        imSegment = segRes.ok;
        if (!segRes.ok) {
          console.error("Segment-Zuordnung fehlgeschlagen:", segRes.status, await segRes.text());
        }
      } catch (e) {
        console.error("Segment-Zuordnung fehlgeschlagen:", e.message);
      }
    }

    return antwort({ ok: true, lead_id: String(leadId), neu: !bestehend, im_segment: imSegment });
  } catch (err) {
    console.error("mautic-lead Fehler:", err.name === "AbortError" ? "Zeitlimit" : err.message);
    return antwort({ ok: false, grund: "Mautic nicht erreichbar" });
  }
};

export const config = { path: "/.netlify/functions/mautic-lead" };
