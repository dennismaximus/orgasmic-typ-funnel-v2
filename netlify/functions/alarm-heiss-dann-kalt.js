import { getStore } from "@netlify/blobs";

// ═══════════════════════════════════════════════════════════════════
// HEISS-DANN-KALT-ALARM — läuft automatisch 1x täglich
// ═══════════════════════════════════════════════════════════════════
//
// Problem, das das löst: Das wertvollste Signal im Funnel ist NICHT "hat sich
// eingetragen", sondern "war nachweislich interessiert und ist dann verschwunden".
// Wer Tag 5 zu 90% geschaut hat und seit 3 Tagen weg ist, ist ein warmer Lead, der
// gerade abkühlt — aber niemand merkt es, weil es im Dashboard nur passiv sichtbar ist.
//
// Dieser Job dreht das um: statt dass jemand ins Dashboard schauen muss, kommt der
// Alarm aktiv rein. Einmal pro Lead (kein Spam bei jedem Durchlauf).
//
// ALARM-KRITERIEN (alle müssen zutreffen):
//   1. Nachweisliches Interesse — mind. ein Video zu >= MIN_PROZENT gesehen
//      ODER mind. VIDEO_SCHWELLE verschiedene Tage geöffnet
//   2. Seit >= STUNDEN_INAKTIV keine Aktivität mehr
//   3. Hat KEINEN Termin gebucht (sonst ist der Lead schon im Sales-Prozess)
//   4. Wurde für diesen Lead noch kein Alarm verschickt
//
// SETUP (Netlify Environment Variables):
//   BREVO_API_KEY      — API-Key aus Brevo (Transactional Email)
//   ALARM_EMAIL_TO     — Empfänger, mehrere per Komma getrennt
//   ALARM_EMAIL_FROM   — verifizierte Absender-Adresse in Brevo
//   KUNDE_ID           — optional, Standard: christian-alexandra-8tage
//
// Zeitplan siehe `config.schedule` unten (Cron, UTC).

const MIN_PROZENT = 50;        // ab wieviel % Watch-Time gilt jemand als "heiß"
const VIDEO_SCHWELLE = 3;      // alternativ: so viele Tage überhaupt geöffnet
const STUNDEN_INAKTIV = 48;    // ab wann gilt "abgekühlt"
const MAX_TAGE_ALT = 30;       // Leads älter als das ignorieren (nicht mehr relevant)

function analysiere(lead) {
  const fortschritt = lead.video_fortschritt || {};
  let maxProzent = 0;
  let bestesVideo = null;

  for (const [video, daten] of Object.entries(fortschritt)) {
    const p = Number(daten?.prozent) || 0;
    if (p > maxProzent) {
      maxProzent = p;
      bestesVideo = video;
    }
  }

  const geoeffneteTage = Object.keys(lead.video_geoeffnet || {}).filter((k) =>
    k.startsWith("Tag ")
  ).length;

  const istHeiss = maxProzent >= MIN_PROZENT || geoeffneteTage >= VIDEO_SCHWELLE;

  return { maxProzent, bestesVideo, geoeffneteTage, istHeiss };
}

function stundenSeit(iso) {
  if (!iso) return Infinity;
  const diffMs = Date.now() - new Date(iso).getTime();
  return diffMs / (1000 * 60 * 60);
}

function baueEmail(kandidaten) {
  const zeilen = kandidaten
    .map((k) => {
      const a = k.analyse;
      const name = k.lead.name || `Anonym (${(k.lead.besucher_id || "").slice(0, 8)})`;
      const kontakt = [k.lead.email, k.lead.telefon].filter(Boolean).join(" · ") || "—";
      const inaktivTage = Math.floor(k.stundenInaktiv / 24);
      const waHinweis = k.lead.whatsapp_kontakt
        ? ' <span style="color:#b8923c;font-weight:700;">· hat WhatsApp geklickt</span>'
        : "";
      return `
        <tr>
          <td style="padding:10px 12px;border-top:1px solid #eee;font-weight:700;">${name}${waHinweis}</td>
          <td style="padding:10px 12px;border-top:1px solid #eee;">${kontakt}</td>
          <td style="padding:10px 12px;border-top:1px solid #eee;">${a.bestesVideo || "—"} · <strong>${a.maxProzent}%</strong></td>
          <td style="padding:10px 12px;border-top:1px solid #eee;">${a.geoeffneteTage} von 8</td>
          <td style="padding:10px 12px;border-top:1px solid #eee;color:#c0392b;font-weight:700;">${inaktivTage > 0 ? inaktivTage + " Tage" : Math.floor(k.stundenInaktiv) + " Std."}</td>
        </tr>`;
    })
    .join("");

  return `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:820px;margin:0 auto;color:#1a1f3a;">
    <div style="background:#1a1f3a;padding:20px 24px;">
      <div style="color:#c9a84c;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">
        Live ORGASMIC · Heiß-dann-kalt-Alarm
      </div>
    </div>
    <div style="padding:24px;background:#f9f5ef;">
      <h2 style="margin:0 0 6px;font-size:20px;">${kandidaten.length} ${kandidaten.length === 1 ? "Lead kühlt ab" : "Leads kühlen ab"}</h2>
      <p style="margin:0 0 18px;font-size:13px;color:#4a4f6a;">
        Diese Personen haben die Video-Serie nachweislich konsumiert, aber keinen Termin gebucht
        und sich seit mindestens ${STUNDEN_INAKTIV} Stunden nicht mehr gemeldet.
        Sie sind jetzt am wärmsten, den sie noch sein werden — jeder Tag Wartezeit kostet.
      </p>
      <table style="width:100%;border-collapse:collapse;background:#fff;font-size:13px;">
        <thead>
          <tr style="background:#f2ebe0;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#4a4f6a;">
            <th style="padding:10px 12px;">Name</th>
            <th style="padding:10px 12px;">Kontakt</th>
            <th style="padding:10px 12px;">Höchster Fortschritt</th>
            <th style="padding:10px 12px;">Tage geöffnet</th>
            <th style="padding:10px 12px;">Inaktiv seit</th>
          </tr>
        </thead>
        <tbody>${zeilen}</tbody>
      </table>
      <p style="margin:18px 0 0;font-size:12px;color:#8a8fa8;">
        Jeder Lead wird nur einmal gemeldet. Kriterien: mind. ${MIN_PROZENT}% eines Videos
        oder ${VIDEO_SCHWELLE}+ geöffnete Tage, kein gebuchter Termin.
      </p>
    </div>
  </div>`;
}

export default async () => {
  const apiKey = Netlify.env.get("BREVO_API_KEY");
  const empfaenger = Netlify.env.get("ALARM_EMAIL_TO");
  const absender = Netlify.env.get("ALARM_EMAIL_FROM");
  const kundeId = Netlify.env.get("KUNDE_ID") || "christian-alexandra-8tage";

  const store = getStore(`tracking-${kundeId}`);
  const { blobs } = await store.list();

  const kandidaten = [];

  for (const b of blobs) {
    const lead = await store.get(b.key, { type: "json" });
    if (!lead) continue;

    // Bereits gemeldet? Dann überspringen (kein Spam).
    if (lead.alarm_gesendet_am) continue;

    // Termin gebucht → ist im Sales-Prozess, kein Alarm nötig.
    if (lead.termin_gebucht) continue;

    const stundenInaktiv = stundenSeit(lead.letzte_aktivitaet);
    if (stundenInaktiv < STUNDEN_INAKTIV) continue;
    if (stundenInaktiv > MAX_TAGE_ALT * 24) continue;

    const analyse = analysiere(lead);
    if (!analyse.istHeiss) continue;

    kandidaten.push({ key: b.key, lead, analyse, stundenInaktiv });
  }

  // Heißeste zuerst
  kandidaten.sort((a, b) => b.analyse.maxProzent - a.analyse.maxProzent);

  if (kandidaten.length === 0) {
    return new Response(JSON.stringify({ ok: true, gemeldet: 0, hinweis: "keine Kandidaten" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Ohne Mail-Konfiguration nicht abbrechen, aber auch nicht als "gemeldet" markieren —
  // sonst gehen die Leads verloren, sobald die Konfiguration nachgezogen wird.
  if (!apiKey || !empfaenger || !absender) {
    return new Response(
      JSON.stringify({
        ok: false,
        gefunden: kandidaten.length,
        fehler: "BREVO_API_KEY / ALARM_EMAIL_TO / ALARM_EMAIL_FROM nicht gesetzt",
        namen: kandidaten.map((k) => k.lead.name || k.key),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Live ORGASMIC Funnel", email: absender },
      to: empfaenger.split(",").map((e) => ({ email: e.trim() })),
      subject: `🔥→❄️ ${kandidaten.length} ${kandidaten.length === 1 ? "Lead kühlt" : "Leads kühlen"} ab — Video-Serie`,
      htmlContent: baueEmail(kandidaten),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(JSON.stringify({ ok: false, fehler: "Brevo-Versand fehlgeschlagen", status: res.status, details: text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Erst NACH erfolgreichem Versand markieren, damit bei einem Fehlschlag
  // beim nächsten Durchlauf erneut versucht wird.
  const jetzt = new Date().toISOString();
  for (const k of kandidaten) {
    k.lead.alarm_gesendet_am = jetzt;
    await store.setJSON(k.key, k.lead);
  }

  return new Response(
    JSON.stringify({ ok: true, gemeldet: kandidaten.length, namen: kandidaten.map((k) => k.lead.name || k.key) }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

// Täglich 07:00 UTC (= 09:00 deutsche Sommerzeit) — früh genug, dass das Sales-Team
// den Alarm zum Arbeitsbeginn hat.
export const config = { schedule: "0 7 * * *" };
