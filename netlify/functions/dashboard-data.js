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


// Passwort + kunde.id kommen aus Umgebungsvariablen (Netlify-Projekteinstellungen),
// damit sie nicht im Frontend-Code sichtbar sind.
//
// Liefert zwei Datentöpfe aus demselben Blob-Store:
//   leads[]   — alle erfassten Besucher (mit Kanal-Historie, siehe track.js)
//   versand[] — hinterlegte Versandlisten (siehe versand.js), Grundlage für die
//               Nicht-Klicker-Ansicht: wer hat die Nachricht bekommen, aber nie geklickt.

const VERSAND_PREFIX = "versand::";

export default async (req) => {
  const url = new URL(req.url);
  const password = url.searchParams.get("password");

  const expectedPassword = umgebung("DASHBOARD_PASSWORD", TEST_PASSWORT);
  const kundeId = umgebung("KUNDE_ID", TEST_KUNDE_ID);

  if (!expectedPassword || password !== expectedPassword) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const store = getStore(`tracking-${kundeId}`);
  const { blobs } = await store.list();

  const leads = [];
  const versand = [];
  for (const b of blobs) {
    const data = await store.get(b.key, { type: "json" });
    if (!data) continue;
    if (b.key.startsWith(VERSAND_PREFIX)) {
      versand.push(data);
    } else {
      leads.push(data);
    }
  }

  // Identifizierte Leads (Name bekannt) zuerst — die sind für den Vertrieb direkt actionable,
  // anonyme Besucher danach, jeweils nach letzter Aktivität sortiert.
  leads.sort((a, b) => {
    const aNamed = a.name ? 1 : 0;
    const bNamed = b.name ? 1 : 0;
    if (aNamed !== bNamed) return bNamed - aNamed;
    return new Date(b.letzte_aktivitaet) - new Date(a.letzte_aktivitaet);
  });

  versand.sort((a, b) => new Date(b.angelegt_am || 0) - new Date(a.angelegt_am || 0));

  return new Response(JSON.stringify({ leads, versand }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = { path: "/.netlify/functions/dashboard-data" };
