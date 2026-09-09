// Zentrale Konfiguration der 8-Tage-Challenge.
//
// Warum eine eigene Datei: im ersten Build (Juli 2026) standen Kunden-ID, Pixel-ID
// und Buchungslink in jeder der zehn Seiten einzeln. Beim Ändern einer Zahl musste
// man zehn Dateien anfassen — und beim ersten vergessenen File läuft eine Seite
// still auf dem alten Wert weiter. Ab hier: eine Stelle.

window.MX_CONFIG = {
  // ── Kunde / Datentopf ──
  // KUNDE_ID bestimmt den Netlify-Blob-Store (`tracking-<id>`). Wird sie geändert,
  // sind alle bisher erfassten Besucher aus dem Dashboard verschwunden — nicht
  // gelöscht, aber in einem anderen Topf. Muss identisch zur Umgebungsvariablen
  // KUNDE_ID im Netlify-Projekt sein, sonst liest das Dashboard einen leeren Store.
  KUNDE_NAME: 'Live ORGASMIC (Alexandra & Christian Wennmacher) — 8-Tage-Challenge',
  // Eigener Datentopf des Typ-Funnels, gesetzt von _build-typfunnel.py.
  // Getrennt vom 8-Tage-Stand, damit sich die Zahlen beider Funnel nicht
  // vermischen — sonst laesst sich der Umbau nicht messen.
  KUNDE_ID: 'christian-alexandra-typ',

  // ── Endpunkte ──
  TRACK_URL: '/.netlify/functions/track',

  // ── Buchung ──
  // Wird über visitor.js vorbefüllt (siehe Lead-ID-Brücke weiter unten).
  // Der Link, den Christian am 11.08.2026 geschickt hat. `service=2` und
  // `provider=any-provider` MÜSSEN dranbleiben — ohne sie startet Easy!Appointments
  // bei der Dienstleistungsauswahl statt beim Kalender.
  BOOKING_URL: 'https://booking.orgasmic.live/index.php/?service=2&provider=any-provider',
  // Alle Hosts, die als Buchungslink gelten. visitor.js hängt NUR an diesen Links
  // die Lead-ID an — an keinem anderen externen Link, damit die ID nicht versehentlich
  // an Impressum, Datenschutz oder eine fremde Seite weitergereicht wird.
  BOOKING_HOSTS: ['booking.orgasmic.live', 'calendly.com', 'cal.com'],
  // Alexandra nennt den Termin in Tag 7 wörtlich "kostenfreier Exploration Call"
  // und stellt ihn ausdrücklich gegen ein Verkaufsgespräch. Die Seiten müssen
  // dieselbe Vokabel benutzen — sonst klingt der Button nach etwas anderem als
  // das, was sie im Video gerade angekündigt hat.
  BOOKING_LABEL: 'Kostenfreien Exploration Call buchen',

  // ── Lead-ID-Brücke zum Buchungstool (Christian Wennmacher, Call 11.08.2026) ──
  // Christians Buchungstool überspringt die Datenabfrage (Schritt 2 von 3), wenn im
  // Link die Mautic-Lead-ID mitkommt: es fragt damit bei Mautic Name, Telefonnummer
  // und E-Mail ab und geht direkt auf die Bestätigung. Ohne die ID tippt jede Frau
  // ihre Daten ein zweites Mal — nach dem Formular, das sie gerade ausgefüllt hat.
  //
  // ⚠ DIESER EINE WERT MUSS VON CHRISTIAN BESTÄTIGT WERDEN: wie der Parameter heißt,
  // den sein Tool ausliest. Im Call fiel nur "die ID mitgeben", kein Feldname. Bis zur
  // Bestätigung steht hier der Name, unter dem die ID auch hereinkommt. Falsch geraten
  // heißt: das Tool ignoriert den Parameter und fragt die Daten wie bisher ab — es
  // geht nichts kaputt, es wird nur nichts gespart.
  BUCHUNG_ID_PARAM: 'lead_id',

  // ── Chat-Widget (Call 11.08.2026) ────────────────────────────────────────
  // Alles hier ist Text und Zahl, kein Code — Alexandra und Christian können die
  // Ansprache selbst ändern, ohne chat-widget.js anzufassen.
  //
  // Christian im Call: "lasst uns den Funnel erst einmal komplett zu Ende bauen und
  // dann das reinfügen". Deshalb der Schalter: `aktiv: false` nimmt das Widget
  // vollständig aus der Seite, ohne irgendwo ein <script> entfernen zu müssen.
  CHAT: {
    aktiv: true,

    // Sekunden, bis sich der Chat von selbst meldet. Er meldet sich AKTIV mit einem
    // Terminangebot — nicht mit "melde dich, wenn du Fragen hast" (Sebastian im Call:
    // "nur dass du nicht beginnst und sowas sagst wie 'Hey, melde dich, wenn du Fragen
    // hast', sondern du würdest aktiv sagen: nächster Termin dann und dann").
    oeffnet_nach_sekunden: 25,

    absender: 'Team ORGASMIC',

    // {name} wird durch den Vornamen ersetzt, wenn er bekannt ist. Ist er es nicht,
    // fällt der ganze Satzteil weg statt "Hey {name}" oder "Hey ," auszuliefern.
    begruessung: 'Hey{name} — kurz was Praktisches:',

    // Wird nur gezeigt, wenn die Function echte freie Zeiten geliefert hat.
    termin_frage: 'Für deinen kostenfreien Exploration Call sind aktuell diese beiden Zeiten frei. Welche passt dir besser?',
    // Wenn keine Zeiten abrufbar sind (Buchungstool nicht erreichbar): kein erfundener
    // Termin, sondern der ehrliche Weg in den Kalender.
    termin_frage_ohne_zeiten: 'Möchtest du dir deinen kostenfreien Exploration Call sichern? Ich zeige dir die freien Zeiten.',
    andere_zeit_label: 'Beide passen nicht',
    kalender_label: 'Freie Zeiten ansehen',

    // Sebastian im Call: "Wann passt es dir besser? Schreib doch mal 3 Termine von
    // deiner Seite rein."
    andere_zeit_frage: 'Kein Problem. Schreib mir zwei, drei Zeiten, die dir passen würden — ich gebe sie weiter.',
    andere_zeit_dank: 'Danke dir, das geht direkt ans Team. Du hörst zeitnah von uns.',

    // ── Die Qualifizierungsfragen ──
    // Der eigentliche Punkt aus dem Call. Christian: "einfach nur zu sagen 'Ich will
    // einen Termin' ist halt auch super unverbindlich, und die Herausforderung liegt
    // da nicht." Sebastian: "Du kannst ja in dem Chat eigentlich auch Commitment
    // aufbauen, indem du sagst: beantworte mal 10 Fragen."
    //
    // Hier stehen bewusst DREI statt zehn. Das Widget steht auf der Angebotsseite,
    // also direkt hinter dem Opt-in-Formular mit seinen elf Schritten — dieselbe Frau
    // hat gerade eben elf Fragen beantwortet. Zehn weitere kosten hier mehr Abbrüche,
    // als sie an Commitment bringen. Die drei unten fragen deshalb nur, was das
    // Formular NICHT schon weiß.
    fragen_vorspann: 'Gute Wahl. Drei kurze Fragen, damit Alexandra weiß, worum es bei dir geht:',
    fragen: [
      {
        frage: 'Worum soll es bei dir vor allem gehen?',
        optionen: [
          'Ich spüre kaum noch Lust',
          'Mein Körper fühlt sich fremd an',
          'Die Nähe in meiner Beziehung fehlt',
          'Ich will mein Schutzprogramm lösen',
        ],
      },
      {
        frage: 'Bist du zu der Zeit ungestört und ganz für dich?',
        optionen: ['Ja, ganz für mich', 'Ich richte es mir ein', 'Weiß ich noch nicht'],
      },
      {
        frage: 'Wenn du im Call einen klaren Weg bekommst — gehst du ihn dann auch?',
        optionen: ['Ja, ich bin bereit', 'Ich will es erst hören'],
      },
    ],

    abschluss: 'Danke dir. Jetzt nur noch eintragen, dann steht dein Platz:',
    abschluss_button: 'Platz sichern',
  },

  // ── Challenge-Guide (WhatsApp) ──
  // Jedes Tagesvideo endet mit einer Aufgabe an den Challenge-Guide ("schreib mir
  // das Wort"). Ohne diesen Rückkanal bricht die Mechanik der Challenge ab.
  //
  // Format: internationale Nummer OHNE +, ohne Leerzeichen (z.B. '4917012345678').
  // Solange der Wert leer ist, wird der WhatsApp-Button auf allen Seiten
  // ausgeblendet — bewusst so, damit nie ein Button ausgeliefert wird, der
  // ins Leere führt.
  //
  // Stand 19.08.2026: WhatsApp-Business-Nummer +49 1516 7098941.
  // Ersetzt Sebastians vorherige private Nummer, die hier und in den
  // Priority-Service-Links auf oto.html stand — beides ist umgestellt.
  WHATSAPP_GUIDE: '4915167098941',

  // ── Zugangsfrist ──
  // Evergreen-Countdown über 7 Tage. Gestartet wird er beim ABSENDEN des
  // Opt-in-Formulars, nicht beim ersten Seitenaufruf.
  //
  // Grund (Lehrgeld aus dem Vegan-Mind-Funnel v15): startete die Frist beim ersten
  // Besuch der Videoseite, wurde jede Frau sofort ausgesperrt, die die Seite vor
  // Tagen einmal anonym geöffnet und sich erst heute eingetragen hatte.
  FRIST_STUNDEN: 168,
  FRIST_KEY: 'mx_cd_orgasmic-8tage',
};
