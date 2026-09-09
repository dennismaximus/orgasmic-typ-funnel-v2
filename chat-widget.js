// Chat-Widget mit aktivem Terminangebot — Live ORGASMIC, 8-Tage-Challenge.
//
// ── WAS IM CALL BESTELLT WURDE (11.08.2026, 00:25–00:34) ────────────────────
// Alexandra hatte die Idee: "Was ist denn, wenn man irgendwie so ein Pop-up macht und
// da so reinmacht: morgen um … und nächster Termin wäre dann …"
//
// Sebastian dazu: "Es wäre ja quasi wie ein Chat-Widget, nur dass du nicht beginnst und
// sowas sagst wie 'Hey, melde dich, wenn du Fragen hast', sondern du würdest AKTIV
// sagen: nächster Termin dann und dann." Deshalb meldet sich der Chat von selbst und
// steht nicht stumm in der Ecke.
//
// Christian hielt dagegen — und das ist der wichtigste Satz für dieses Widget:
// "Commitment ist da eine Sache. Einfach nur zu sagen 'Ich will einen Termin' ist halt
// auch super unverbindlich, und die Herausforderung liegt da nicht. Die liegt darin,
// den Prozess gut zu designen, dass er marketingtechnisch Sinn macht."
//
// Sebastians Antwort darauf: "Du kannst ja in dem Chat auch Commitment aufbauen, indem
// du sagst: beantworte mal zehn Fragen. Und wenn man das durchlaufen ist, dann ist das
// auch irgendwo ein realer Lead."
//
// Genau das ist der Ablauf hier: Termin anbieten → Qualifizierungsfragen → erst DANN
// in den Kalender. Wer nur klickt, kommt nicht durch; wer die Fragen beantwortet, ist
// ein Lead, hinter dem etwas steht.
//
// Alexandra ergänzte die Personalisierung: "dass wir nicht sagen 'hier sind noch
// Termine frei', sondern 'hey, du hattest dich …' — was auf das Formular referenziert,
// das sie vorher ausgefüllt hat. Das wirkt nochmal cooler, als wenn du es einfach so
// random sagst." Umgesetzt über den Vornamen aus dem Opt-in; die inhaltliche
// Rückreferenz auf einzelne Formularantworten braucht die Hyperpersonalisierung, die
// laut Call noch nicht gebaut ist.
//
// ── DREI FRAGEN, NICHT ZEHN ─────────────────────────────────────────────────
// Sebastian sagte "zehn Fragen". Das Widget steht aber auf der Angebotsseite, also
// direkt hinter dem Opt-in mit seinen elf Schritten — dieselbe Frau hat gerade eben
// elf Fragen beantwortet. Zehn weitere kosten hier mehr Abbrüche, als sie an
// Commitment bringen. Es sind drei, sie stehen in config.js, und wer anderer Meinung
// ist, ändert sie dort ohne diese Datei anzufassen.
//
// ── KEINE ERFUNDENEN TERMINE ────────────────────────────────────────────────
// Die angebotenen Zeiten kommen aus /.netlify/functions/termine, die sie live aus
// Easy!Appointments zieht. Liefert sie nichts (Buchungstool nicht erreichbar), zeigt
// das Widget KEINE Zeit, sondern führt in den Kalender. Ein erfundener Termin wäre
// hier besonders teuer: die Frau klickt auf "Donnerstag 18:30" und steht dann vor
// einem Kalender, in dem genau das nicht geht.
//
// ── WAS BEWUSST NICHT DRIN IST ──────────────────────────────────────────────
// Die Übergabe an einen echten Menschen ("bis du es halt übergibst an den Operator",
// Christian). Dafür braucht es einen besetzten Posteingang mit Reaktionszeit — sonst
// schreibt jemand in ein Feld, das niemand liest. Der Freitext bei "beide passen
// nicht" geht ins Dashboard, nicht in einen Chat, der nicht bemannt ist.

(function () {
  const CFG = (window.MX_CONFIG || {});
  const C = CFG.CHAT || {};
  if (!C.aktiv) return;

  // Auf sehr kleinen Höhen (Tastatur offen auf dem Handy) würde das Panel die Seite
  // verdecken — dann lieber gar nicht automatisch aufgehen.
  const AUTO_MIN_HOEHE = 480;

  const ZUSTAND_KEY = "mx_chat_zustand";
  const STORE = (function () {
    try {
      const roh = localStorage.getItem(ZUSTAND_KEY);
      return roh ? JSON.parse(roh) : {};
    } catch (e) { return {}; }
  })();

  function merken(feld, wert) {
    STORE[feld] = wert;
    try { localStorage.setItem(ZUSTAND_KEY, JSON.stringify(STORE)); } catch (e) {}
  }

  // ── Tracking ───────────────────────────────────────────────────────────────
  // Dieselbe Form wie trackOto() in oto.html, damit die Antworten im bestehenden
  // Dashboard neben den Formular-Antworten stehen und nicht in einem zweiten Topf.
  function track(status, antworten) {
    try {
      fetch(CFG.TRACK_URL || "/.netlify/functions/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kunde: { name: CFG.KUNDE_NAME, id: CFG.KUNDE_ID },
          besucher_id: window.MX_VISITOR_ID,
          status: status,
          antworten: antworten || [],
          kanal: window.MX_KANAL || {},
          zeitstempel: new Date().toISOString(),
        }),
      }).catch(function () {});
    } catch (e) {}
  }

  // ── Stil ───────────────────────────────────────────────────────────────────
  // Eigene Fallback-Werte hinter jedem var(): das Widget läuft auch auf den
  // Videoseiten, die andere Tokens setzen als die Angebotsseite.
  const CSS = `
  .mxc-blase{position:fixed;right:20px;bottom:20px;z-index:9998;width:60px;height:60px;border-radius:50%;
    background:var(--gold,#c9a44c);color:var(--navy,#1a2642);border:none;cursor:pointer;
    box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;
    font-size:26px;transition:transform .2s ease}
  .mxc-blase:hover{transform:scale(1.06)}
  .mxc-blase[hidden]{display:none}
  .mxc-punkt{position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;
    background:var(--rose,#c07860);border:2px solid var(--cream,#f5f0e8)}
  .mxc-teaser{position:fixed;right:88px;bottom:32px;z-index:9998;max-width:230px;
    background:var(--cream,#f5f0e8);color:var(--text-dark,#1a1a2e);padding:11px 14px;border-radius:14px 14px 2px 14px;
    box-shadow:0 6px 24px rgba(0,0,0,.3);font:400 14px/1.4 'Inter',system-ui,sans-serif;cursor:pointer}
  .mxc-teaser[hidden]{display:none}
  .mxc-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:352px;max-width:calc(100vw - 32px);
    max-height:min(600px,calc(100vh - 40px));background:var(--navy,#1a2642);border:1px solid rgba(201,164,76,.35);
    border-radius:18px;display:flex;flex-direction:column;overflow:hidden;
    box-shadow:0 18px 60px rgba(0,0,0,.5);font:400 15px/1.5 'Inter',system-ui,sans-serif}
  .mxc-panel[hidden]{display:none}
  .mxc-kopf{display:flex;align-items:center;gap:10px;padding:13px 15px;background:var(--navy-mid,#1e3158);
    border-bottom:1px solid rgba(201,164,76,.25);flex:0 0 auto}
  .mxc-avatar{width:34px;height:34px;border-radius:50%;background:var(--gold,#c9a44c);color:var(--navy,#1a2642);
    display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;flex:0 0 auto}
  .mxc-titel{font-weight:600;font-size:14px;color:var(--text-light,#f0ece2);line-height:1.25}
  .mxc-status{font-size:11.5px;color:var(--gold-light,#dfc07a)}
  .mxc-zu{margin-left:auto;background:none;border:none;color:var(--text-light,#f0ece2);opacity:.65;
    cursor:pointer;font-size:22px;line-height:1;padding:2px 5px;border-radius:6px}
  .mxc-zu:hover{opacity:1;background:rgba(255,255,255,.08)}
  .mxc-lauf{flex:1 1 auto;overflow-y:auto;padding:15px;display:flex;flex-direction:column;gap:9px}
  .mxc-msg{max-width:86%;padding:10px 13px;border-radius:14px;font-size:14.5px;white-space:pre-wrap;
    animation:mxcAuf .22s ease}
  @keyframes mxcAuf{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .mxc-von-uns{align-self:flex-start;background:var(--cream,#f5f0e8);color:var(--text-dark,#1a1a2e);border-bottom-left-radius:3px}
  .mxc-von-ihr{align-self:flex-end;background:var(--gold,#c9a44c);color:var(--navy,#1a2642);border-bottom-right-radius:3px;font-weight:500}
  .mxc-tippt{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:var(--cream,#f5f0e8);border-radius:14px}
  .mxc-tippt i{width:6px;height:6px;border-radius:50%;background:var(--text-mid,#5a5a6a);animation:mxcTipp 1.2s infinite}
  .mxc-tippt i:nth-child(2){animation-delay:.18s}
  .mxc-tippt i:nth-child(3){animation-delay:.36s}
  @keyframes mxcTipp{0%,60%,100%{opacity:.25}30%{opacity:1}}
  .mxc-fuss{flex:0 0 auto;padding:11px 15px 14px;display:flex;flex-direction:column;gap:7px;
    border-top:1px solid rgba(201,164,76,.18)}
  .mxc-wahl{background:transparent;color:var(--text-light,#f0ece2);border:1px solid rgba(201,164,76,.5);
    border-radius:10px;padding:10px 13px;font:inherit;font-size:14px;text-align:left;cursor:pointer;transition:.15s}
  .mxc-wahl:hover{background:var(--gold,#c9a44c);color:var(--navy,#1a2642);border-color:var(--gold,#c9a44c)}
  .mxc-wahl.mxc-haupt{background:var(--gold,#c9a44c);color:var(--navy,#1a2642);border-color:var(--gold,#c9a44c);
    font-weight:600;text-align:center;text-decoration:none;display:block}
  .mxc-wahl.mxc-haupt:hover{background:var(--gold-light,#dfc07a)}
  .mxc-leise{background:none;border:none;color:var(--gold-light,#dfc07a);font:inherit;font-size:13px;
    cursor:pointer;opacity:.8;padding:3px}
  .mxc-leise:hover{opacity:1;text-decoration:underline}
  .mxc-eingabe{display:flex;gap:7px}
  .mxc-eingabe textarea{flex:1;resize:none;border-radius:10px;border:1px solid rgba(201,164,76,.4);
    background:rgba(255,255,255,.06);color:var(--text-light,#f0ece2);padding:9px 11px;font:inherit;font-size:14px;min-height:62px}
  .mxc-eingabe textarea::placeholder{color:rgba(240,236,226,.45)}
  .mxc-senden{background:var(--gold,#c9a44c);color:var(--navy,#1a2642);border:none;border-radius:10px;
    padding:0 15px;font:inherit;font-weight:600;cursor:pointer;align-self:stretch}
  .mxc-fortschritt{font-size:11.5px;color:var(--gold-light,#dfc07a);opacity:.75;padding:0 2px}
  @media (max-width:520px){
    .mxc-panel{right:10px;left:10px;bottom:10px;width:auto;max-height:calc(100vh - 20px)}
    .mxc-teaser{display:none}
  }
  @media (prefers-reduced-motion:reduce){
    .mxc-msg{animation:none}.mxc-tippt i{animation:none;opacity:.6}.mxc-blase{transition:none}
  }`;

  // ── Aufbau ─────────────────────────────────────────────────────────────────
  const stil = document.createElement("style");
  stil.textContent = CSS;
  document.head.appendChild(stil);

  const vorname = (window.MX_KNOWN_NAME || "").trim();
  const initialen = (C.absender || "O").trim().charAt(0).toUpperCase();

  const blase = document.createElement("button");
  blase.className = "mxc-blase";
  blase.type = "button";
  blase.setAttribute("aria-label", "Chat öffnen");
  blase.innerHTML = '<span aria-hidden="true">💬</span><span class="mxc-punkt"></span>';

  const teaser = document.createElement("div");
  teaser.className = "mxc-teaser";
  teaser.hidden = true;
  teaser.setAttribute("role", "button");
  teaser.tabIndex = 0;

  const panel = document.createElement("div");
  panel.className = "mxc-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Termin-Chat");
  panel.innerHTML =
    '<div class="mxc-kopf">' +
      '<div class="mxc-avatar" aria-hidden="true">' + initialen + "</div>" +
      "<div>" +
        '<div class="mxc-titel"></div>' +
        '<div class="mxc-status">Antwortet meist sofort</div>' +
      "</div>" +
      '<button class="mxc-zu" type="button" aria-label="Chat schließen">×</button>' +
    "</div>" +
    '<div class="mxc-lauf"></div>' +
    '<div class="mxc-fuss"></div>';

  panel.querySelector(".mxc-titel").textContent = C.absender || "Team";

  document.body.appendChild(blase);
  document.body.appendChild(teaser);
  document.body.appendChild(panel);

  const lauf = panel.querySelector(".mxc-lauf");
  const fuss = panel.querySelector(".mxc-fuss");

  function ansTiefste() { lauf.scrollTop = lauf.scrollHeight; }

  function sagen(text, wer) {
    const el = document.createElement("div");
    el.className = "mxc-msg " + (wer === "ihr" ? "mxc-von-ihr" : "mxc-von-uns");
    el.textContent = text;
    lauf.appendChild(el);
    ansTiefste();
    return el;
  }

  // Kurze Tippanzeige vor jeder Antwort — ohne sie wirken drei Nachrichten am Stück
  // wie ein Formular, das sich als Chat verkleidet.
  function tippenDann(fn, ms) {
    const t = document.createElement("div");
    t.className = "mxc-tippt";
    t.innerHTML = "<i></i><i></i><i></i>";
    lauf.appendChild(t);
    ansTiefste();
    setTimeout(function () { t.remove(); fn(); }, ms || 620);
  }

  function fussLeeren() { fuss.innerHTML = ""; }

  function knopf(text, fn, haupt) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mxc-wahl" + (haupt ? " mxc-haupt" : "");
    b.textContent = text;
    b.addEventListener("click", fn);
    fuss.appendChild(b);
    return b;
  }

  // ── Ablauf ─────────────────────────────────────────────────────────────────
  let termine = [];
  let gewaehlt = null;
  const antworten = [];

  function begruessen() {
    const anrede = (C.begruessung || "Hey{name}:").replace("{name}", vorname ? " " + vorname : "");
    sagen(anrede);
    tippenDann(termineAnbieten, 700);
  }

  function termineAnbieten() {
    fussLeeren();

    if (termine.length) {
      sagen(C.termin_frage || "Welche Zeit passt dir besser?");
      termine.forEach(function (t, i) {
        knopf(t.label, function () { terminGewaehlt(t, i); });
      });
      knopf(C.andere_zeit_label || "Beide passen nicht", andereZeit);
    } else {
      // Keine echten Zeiten abrufbar → keine erfinden.
      sagen(C.termin_frage_ohne_zeiten || "Möchtest du dir deinen Termin sichern?");
      knopf(C.kalender_label || "Freie Zeiten ansehen", function () {
        track("chat_kalender_direkt", [{ frage: "Chat", antwort: "Kalender ohne Vorschlag" }]);
        weiterZumKalender(null);
      }, true);
      knopf(C.andere_zeit_label || "Ich schreibe lieber", andereZeit);
    }
    ansTiefste();
  }

  function terminGewaehlt(t, i) {
    gewaehlt = t;
    sagen(t.label, "ihr");
    merken("termin", t.label);
    track("chat_termin_gewaehlt", [
      { frage: "Gewählter Termin", antwort: t.label },
      { frage: "Position", antwort: i === 0 ? "Vorschlag A" : "Vorschlag B" },
    ]);
    fussLeeren();
    tippenDann(function () {
      sagen(C.fragen_vorspann || "Drei kurze Fragen:");
      tippenDann(function () { frageStellen(0); }, 500);
    }, 650);
  }

  function frageStellen(index) {
    const liste = C.fragen || [];
    if (index >= liste.length) return abschliessen();

    const f = liste[index];
    sagen(f.frage);
    fussLeeren();

    if (liste.length > 1) {
      const fort = document.createElement("div");
      fort.className = "mxc-fortschritt";
      fort.textContent = "Frage " + (index + 1) + " von " + liste.length;
      fuss.appendChild(fort);
    }

    (f.optionen || []).forEach(function (opt) {
      knopf(opt, function () {
        sagen(opt, "ihr");
        antworten.push({ frage: f.frage, antwort: opt });
        // Jede Antwort sofort melden, nicht erst am Ende: wer nach Frage zwei
        // abspringt, ist im Dashboard sonst unsichtbar — und genau der Absprung
        // ist die Information, die den Prozess verbessert.
        track("chat_antwort", [{ frage: f.frage, antwort: opt }]);
        fussLeeren();
        tippenDann(function () { frageStellen(index + 1); }, 480);
      });
    });
    ansTiefste();
  }

  function abschliessen() {
    fussLeeren();
    sagen(C.abschluss || "Danke dir. Jetzt nur noch eintragen:");
    track("chat_qualifiziert", antworten.concat(
      gewaehlt ? [{ frage: "Gewählter Termin", antwort: gewaehlt.label }] : []
    ));
    merken("qualifiziert", true);

    const b = knopf(C.abschluss_button || "Platz sichern", function () {
      track("chat_zum_kalender", [{ frage: "Termin", antwort: gewaehlt ? gewaehlt.label : "ohne Vorschlag" }]);
      if (typeof fbq === "function") fbq("track", "Schedule");
      weiterZumKalender(gewaehlt);
    }, true);
    b.focus();
  }

  function weiterZumKalender(termin) {
    // Der Link wird NICHT hier zusammengebaut, sondern von visitor.js — sonst gäbe es
    // zwei Stellen, an denen die Lead-ID angehängt wird.
    const zusatz = termin ? { date: termin.datum } : null;
    const ziel = typeof window.MX_BUCHUNGSLINK === "function"
      ? window.MX_BUCHUNGSLINK(CFG.BOOKING_URL, zusatz)
      : (CFG.BOOKING_URL || "#");
    window.open(ziel, "_blank", "noopener");
  }

  function andereZeit() {
    fussLeeren();
    sagen(C.andere_zeit_label || "Beide passen nicht", "ihr");
    track("chat_andere_zeit", [{ frage: "Chat", antwort: "Termine passen nicht" }]);

    tippenDann(function () {
      sagen(C.andere_zeit_frage || "Wann passt es dir besser?");

      const box = document.createElement("div");
      box.className = "mxc-eingabe";
      const feld = document.createElement("textarea");
      feld.placeholder = "z.B. Dienstag ab 19 Uhr, Donnerstag vormittags …";
      feld.setAttribute("aria-label", "Deine Wunschzeiten");
      const senden = document.createElement("button");
      senden.type = "button";
      senden.className = "mxc-senden";
      senden.textContent = "Senden";

      function absenden() {
        const text = feld.value.trim();
        if (!text) { feld.focus(); return; }
        sagen(text, "ihr");
        track("chat_wunschzeit", [{ frage: "Wunschzeiten", antwort: text }]);
        merken("wunschzeit", text);
        fussLeeren();
        tippenDann(function () {
          sagen(C.andere_zeit_dank || "Danke, das geht ans Team.");
          knopf(C.kalender_label || "Freie Zeiten ansehen", function () {
            track("chat_kalender_nach_wunsch", [{ frage: "Chat", antwort: "Kalender nach Wunschzeit" }]);
            weiterZumKalender(null);
          }, true);
        }, 600);
      }

      senden.addEventListener("click", absenden);
      feld.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) absenden();
      });

      box.appendChild(feld);
      box.appendChild(senden);
      fuss.appendChild(box);
      feld.focus();
    }, 550);
  }

  // ── Öffnen / Schließen ─────────────────────────────────────────────────────
  let gestartet = false;

  function oeffnen(quelle) {
    panel.hidden = false;
    blase.hidden = true;
    teaser.hidden = true;
    if (!gestartet) {
      gestartet = true;
      track("chat_geoeffnet", [{ frage: "Chat geöffnet über", antwort: quelle || "Blase" }]);
      begruessen();
    }
    ansTiefste();
  }

  function schliessen() {
    panel.hidden = true;
    blase.hidden = false;
    merken("geschlossen", true);
  }

  blase.addEventListener("click", function () { oeffnen("Blase"); });
  teaser.addEventListener("click", function () { oeffnen("Teaser"); });
  teaser.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); oeffnen("Teaser"); }
  });
  panel.querySelector(".mxc-zu").addEventListener("click", schliessen);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) schliessen();
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  // Termine holen, bevor sich der Chat meldet. Kommt nichts zurück, meldet er sich
  // trotzdem — nur ohne konkrete Zeiten.
  fetch("/.netlify/functions/termine")
    .then(function (r) { return r.ok ? r.json() : { termine: [] }; })
    .then(function (d) { termine = (d && d.termine) || []; })
    .catch(function () { termine = []; })
    .finally(function () {
      // Wer den Chat schon einmal weggeklickt hat, bekommt ihn nicht erneut ins
      // Gesicht geschoben. Die Blase bleibt, der Griff dazu auch.
      if (STORE.geschlossen || STORE.qualifiziert) return;
      setTimeout(function () {
        if (!panel.hidden) return;
        if (window.innerHeight < AUTO_MIN_HOEHE) return;

        if (termine.length) {
          teaser.textContent = "Nächster freier Termin: " + termine[0].label + " →";
        } else {
          teaser.textContent = "Sollen wir dir deinen Exploration Call sichern? →";
        }
        teaser.hidden = false;
        track("chat_teaser_gezeigt", [{ frage: "Teaser", antwort: teaser.textContent }]);
      }, Math.max(3, Number(C.oeffnet_nach_sekunden) || 25) * 1000);
    });
})();
