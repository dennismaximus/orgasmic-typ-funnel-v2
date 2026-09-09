import { getStore } from "@netlify/blobs";

// ⚠ Automatisch eingesetzt von _build-typfunnel.py.
//
// Auf diesem Projekt erreichen die Projekt-Variablen die Funktionen nicht:
// `Netlify.env.get()` UND `process.env` liefern beide nichts, obwohl
// `netlify env:list --site …` die Werte am Projekt zeigt. Ohne Rückfallwert
// antwortet das Dashboard immer mit 401 und der Store hieße `tracking-undefined`.
//
// ⚠ Solange das ungeklärt ist, steht hier ein Passwort im Funktions-Code. Der
// Quelltext wird nicht ausgeliefert, nur der Endpunkt — für einen internen Stand
// vertretbar, für einen Echtstand mit Kundendaten nicht. Vor dem Scharfschalten
// muss geklärt sein, warum die Projekt-Variablen nicht ankommen.
const TEST_KUNDE_ID = "christian-alexandra-typ";
const TEST_PASSWORT = "Tp7kQx2mVhRb4nZwLsJdCyF8";

function umgebung(name, rueckfall) {
  try {
    const v = typeof Netlify !== "undefined" ? Netlify.env.get(name) : null;
    if (v) return v;
  } catch (e) {}
  try {
    if (process.env[name]) return process.env[name];
  } catch (e) {}
  return rueckfall;
}


// Versandlisten-Verwaltung — die Grundlage für die Nicht-Klicker-Ansicht.
//
// Das Tracking-System sieht von sich aus nur, WER kommt. Wer eine WhatsApp-/Mail-Nachricht
// bekommen und NICHT geklickt hat, ist unsichtbar — und genau das ist die Follow-up-Liste.
// Deshalb wird beim Versand die Empfängerliste hier hinterlegt; das Dashboard gleicht sie
// dann gegen die tatsächlich eingegangenen Klicks ab.
//
// Geschrieben wird vom Link-Generator (link-generator.html) direkt nach dem Erzeugen der Links.
//
// Endpunkte (alle passwortgeschützt über ?password= / DASHBOARD_PASSWORD):
//   POST   { kampagne, kanal, versendet_am, empfaenger:[{lead_id,name,telefon,email,nachricht}] }
//   DELETE ?kampagne=<id>   → Versandliste löschen
//
// Speicherort: derselbe Blob-Store wie die Besucherdaten, aber mit Präfix `versand::`,
// damit dashboard-data.js beides in einem Rutsch lesen kann, ohne die Datensätze zu vermischen.

const VERSAND_PREFIX = "versand::";

const CORS = {
  // Der Link-Generator wird oft lokal geöffnet (file:// oder localhost), nicht nur vom
  // Deployment aus — ohne CORS würde der Push der Versandliste von dort blockiert.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(daten, status = 200) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Kampagnen-ID wird Teil eines Blob-Keys — nur unkritische Zeichen zulassen,
// damit niemand über einen präparierten Namen aus dem Präfix ausbricht.
function saubereKampagne(wert) {
  return String(wert || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 60);
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const password = url.searchParams.get("password");
  const expectedPassword = umgebung("DASHBOARD_PASSWORD", TEST_PASSWORT);
  const kundeId = umgebung("KUNDE_ID", TEST_KUNDE_ID);

  if (!expectedPassword || password !== expectedPassword) {
    return json({ error: "Unauthorized" }, 401);
  }

  const store = getStore(`tracking-${kundeId}`);

  if (req.method === "DELETE") {
    const kampagne = saubereKampagne(url.searchParams.get("kampagne"));
    if (!kampagne) return json({ error: "kampagne fehlt" }, 400);
    await store.delete(VERSAND_PREFIX + kampagne);
    return json({ ok: true, geloescht: kampagne });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ungültiges JSON" }, 400);
  }

  const kampagne = saubereKampagne(body.kampagne);
  const empfaenger = Array.isArray(body.empfaenger) ? body.empfaenger : [];

  if (!kampagne) return json({ error: "kampagne fehlt" }, 400);
  if (!empfaenger.length) return json({ error: "empfaenger ist leer" }, 400);

  const key = VERSAND_PREFIX + kampagne;
  const bestehend = (await store.get(key, { type: "json" })) || {
    typ: "versandliste",
    kampagne,
    kanal: body.kanal || null,
    angelegt_am: body.versendet_am || new Date().toISOString(),
    empfaenger: [],
  };

  // Nachträglich ergänzte Empfänger werden gemerged, nicht überschrieben — ein zweiter
  // Versand-Batch derselben Kampagne (z.B. Nachzügler) soll die erste Liste nicht löschen.
  // Schlüssel ist die lead_id, weil darüber auch der Klick-Abgleich läuft (besucher_id = "crm_"+lead_id).
  const vorhandeneIds = new Set(bestehend.empfaenger.map((e) => String(e.lead_id)));
  let neu = 0;
  for (const e of empfaenger) {
    const leadId = String(e.lead_id || "").trim();
    if (!leadId || vorhandeneIds.has(leadId)) continue;
    vorhandeneIds.add(leadId);
    bestehend.empfaenger.push({
      lead_id: leadId,
      name: e.name || null,
      telefon: e.telefon || null,
      email: e.email || null,
      nachricht: e.nachricht || null, // Position in der Sequenz (msg=1,2,3…)
      versendet_am: e.versendet_am || body.versendet_am || new Date().toISOString(),
    });
    neu++;
  }

  bestehend.aktualisiert_am = new Date().toISOString();
  if (body.kanal) bestehend.kanal = body.kanal;

  await store.setJSON(key, bestehend);

  return json({ ok: true, kampagne, neu, gesamt: bestehend.empfaenger.length });
};

export const config = { path: "/.netlify/functions/versand" };
