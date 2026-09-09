import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// Empfängt Calendly-Webhooks (invitee.created / invitee.canceled) und schreibt die
// ECHTE Buchung in denselben Datensatz, den auch die Video-Seiten befüllen.
//
// Warum das nötig ist: die Seiten können nur den KLICK auf den Calendly-Button sehen.
// Ob danach wirklich gebucht wurde, weiß nur Calendly. Ohne diesen Webhook sieht das
// Dashboard "Erstgespräch gewünscht: Ja" auch bei Leuten, die abgesprungen sind.
//
// Zuordnung läuft über die E-Mail: Sie wird beim Formular-Absenden im Tracking-
// Datensatz gespeichert (siehe track.js, Status "identifiziert"/"formular_abgeschickt")
// und Calendly liefert sie im Payload mit.
//
// Einrichtung in Calendly:
//   1. Webhook-Subscription anlegen auf diese URL:
//      https://<domain>/.netlify/functions/calendly-webhook
//   2. Events: invitee.created, invitee.canceled
//   3. Signing Key aus Calendly als Netlify-Env-Var CALENDLY_WEBHOOK_SIGNING_KEY setzen.

function verifySignature(rawBody, signatureHeader, signingKey) {
  // Calendly-Header-Format: "t=<timestamp>,v1=<signature>"
  if (!signatureHeader) return false;
  const parts = {};
  signatureHeader.split(",").forEach((kv) => {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  });
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return false;

  const expected = crypto
    .createHmac("sha256", signingKey)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // Signatur prüfen, damit niemand fremde "Buchungen" in die Daten schreiben kann.
  const signingKey = Netlify.env.get("CALENDLY_WEBHOOK_SIGNING_KEY");
  if (signingKey) {
    const sig = req.headers.get("calendly-webhook-signature");
    if (!verifySignature(rawBody, sig, signingKey)) {
      return new Response("Ungültige Signatur", { status: 401 });
    }
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Ungültiges JSON", { status: 400 });
  }

  const event = body.event;
  const payload = body.payload || {};
  const email = (payload.email || "").trim().toLowerCase();

  if (!email) {
    // Ohne E-Mail keine Zuordnung möglich — trotzdem 200, damit Calendly nicht endlos retryt.
    return new Response(JSON.stringify({ ok: true, hinweis: "keine E-Mail im Payload" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const kundeId = Netlify.env.get("KUNDE_ID") || "christian-alexandra-8tage";
  const store = getStore(`tracking-${kundeId}`);
  const { blobs } = await store.list();

  // Passenden Datensatz über die E-Mail finden
  let treffer = null;
  for (const b of blobs) {
    const data = await store.get(b.key, { type: "json" });
    if (data && data.email && data.email === email) {
      treffer = { key: b.key, data };
      break;
    }
  }

  if (!treffer) {
    // Buchung ohne passenden Funnel-Datensatz (z.B. direkt über Calendly gekommen).
    // Separat ablegen, damit sie nicht verloren geht.
    const key = `calendly-unmatched-${email}`;
    const vorhanden = (await store.get(key, { type: "json" })) || { besucher_id: key, events: [] };
    vorhanden.name = vorhanden.name || payload.name || null;
    vorhanden.email = email;
    vorhanden.quelle = "calendly_direkt";
    vorhanden.termin_gebucht = event === "invitee.created";
    vorhanden.letzte_aktivitaet = new Date().toISOString();
    vorhanden.events.push({ status: event, zeitstempel: new Date().toISOString(), antworten: [] });
    await store.setJSON(key, vorhanden);
    return new Response(JSON.stringify({ ok: true, zuordnung: "unmatched" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { key, data } = treffer;
  const jetzt = new Date().toISOString();
  const terminZeit = payload.scheduled_event?.start_time || null;

  if (event === "invitee.created") {
    data.termin_gebucht = true;
    data.termin_gebucht_am = jetzt;
    data.termin_startet_am = terminZeit;
    data.termin_abgesagt = false;
    data.erstgespraech_gewuenscht = true;
  } else if (event === "invitee.canceled") {
    data.termin_gebucht = false;
    data.termin_abgesagt = true;
    data.termin_abgesagt_am = jetzt;
  }

  data.letzte_aktivitaet = jetzt;
  data.events = data.events || [];
  data.events.push({
    status: event,
    zeitstempel: jetzt,
    antworten: terminZeit ? [{ frage: "Termin", antwort: terminZeit }] : [],
  });

  await store.setJSON(key, data);

  return new Response(JSON.stringify({ ok: true, zuordnung: "matched", besucher_id: key }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = { path: "/.netlify/functions/calendly-webhook" };
