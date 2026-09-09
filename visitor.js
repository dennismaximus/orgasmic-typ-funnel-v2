
// ═══════════════════════════════════════════════════════════════════════════
// PERSONALISIERUNG
// ═══════════════════════════════════════════════════════════════════════════
// Der Vorname liegt laengst vor - aus `?name=` im Link oder aus dem Formular
// (MX_KNOWN_NAME). Genutzt hat ihn bisher nur danke.html. Hier steht die
// gemeinsame Mechanik, damit nicht jede Seite ihre eigene baut.
//
// Ein Element bekommt `data-mx-name` und im Text einen Platzhalter:
//   {name}   -> der Vorname, sonst nichts
//   {,name}  -> ", Anna", sonst nichts        (der haeufigere Fall)
// Beispiel: "Du bist die Harmonie-Geberin{,name}."
//        -> mit Namen  "Du bist die Harmonie-Geberin, Anna."
//        -> ohne Namen "Du bist die Harmonie-Geberin."
//
// Ohne Namen darf NICHTS stehen bleiben - kein "Hallo ," und kein "{name}".
// Die Vorlage wird beim ersten Lauf in `data-mx-vorlage` gesichert, sonst waere
// der Platzhalter nach dem ersten Ersetzen weg und ein zweiter Aufruf (z. B.
// nachdem das Formular den Namen nachgeliefert hat) haette nichts mehr zu tun.
window.MX_PERSONALISIEREN = function () {
  var name = (window.MX_KNOWN_NAME || '').trim().split(/\s+/)[0] || '';
  var knoten = document.querySelectorAll('[data-mx-name]');
  for (var i = 0; i < knoten.length; i++) {
    var el = knoten[i];
    var vorlage = el.getAttribute('data-mx-vorlage');
    if (vorlage === null) { vorlage = el.textContent; el.setAttribute('data-mx-vorlage', vorlage); }
    el.textContent = vorlage
      .replace(/\{,name\}/g, name ? ', ' + name : '')
      .replace(/\{name\}/g,  name);
    // Elemente, die nur aus der Anrede bestehen, verschwinden ohne Namen ganz.
    if (el.hasAttribute('data-mx-nur-mit-name')) el.hidden = !name;
  }
  return name;
};
// ═══════════════════════════════════════════════════════════════════════════
// TESTMODUS  —  Aufruf einer beliebigen Funnel-Seite mit ?test=1
// ═══════════════════════════════════════════════════════════════════════════
// Zweck: den kompletten Funnel durchklicken, ohne dass ein Lead entsteht.
//
// Warum hier und nicht in jeder Seite einzeln: visitor.js liegt in JEDER Seite
// des Funnels und wird vom Bau-Skript mitkopiert. Die acht Videoseiten erzeugt
// `_build-videoseiten.py` neu — was dort ins HTML geschrieben wird, ist beim
// naechsten Lauf weg. In dieser Datei ueberlebt es.
//
// Abgeklemmt wird:
//   · n8n-Webhook          -> der eigentliche Lead (feuert absolut, auch von localhost)
//   · /.netlify/functions/ -> Mautic-Kontakt und Tracking-Dashboard
//   · Buchungslinks        -> sonst steht ein echter Termin im Kalender
//   · Meta-Pixel           -> soweit von hier erreichbar (siehe Einschraenkung unten)
//
// EINSCHRAENKUNG, bewusst so: der Pixel-Schnipsel und Clarity stehen in jeder
// Seite VOR visitor.js. Ein PageView kann von hier aus nicht mehr verhindert
// werden — nur die spaeteren Ereignisse (Lead, Schedule, ViewContent, Contact).
// Auf `opt-in.html` steht zusaetzlich ein frueher Block ganz oben, der auch den
// PageView und Clarity abfaengt. Ein PageView ist kein Lead.
(function () {
  var an = /[?&]test=1(&|$)/.test(location.search);
  try {
    if (an) sessionStorage.setItem('mx_test', '1');
    else if (sessionStorage.getItem('mx_test') === '1') an = true;
  } catch (e) {}
  window.MX_TEST = window.MX_TEST || an;
  if (!an) return;

  // Meta-Pixel: hier nur noch die Folge-Ereignisse. fbq existiert an dieser
  // Stelle schon, deshalb wird es ersetzt und nicht vorbelegt.
  var altFbq = window.fbq;
  window.fbq = function () { console.log('[TEST] fbq unterdrueckt:', arguments); };
  if (altFbq) { window.fbq.queue = altFbq.queue || []; window.fbq.loaded = true; window.fbq.version = '2.0'; }

  // Ausgehende Aufrufe abfangen. Doppelt-Wrappen vermeiden: opt-in.html patcht
  // schon oben in der Seite, damit der Pixel gar nicht erst laedt.
  if (!window.__mxTestFetch) {
    window.__mxTestFetch = true;
    var echt = window.fetch.bind(window);
    window.fetch = function (url, opt) {
      var u = String((url && url.url) || url || '');
      var eigen = /n8n\.|\/\.netlify\/functions\/|\/api\//.test(u);
      if (!eigen) return echt(url, opt);
      var koerper = opt && opt.body;
      try { koerper = JSON.parse(koerper); } catch (e) {}
      console.log('[TEST] NICHT gesendet an ' + u, koerper);
      return Promise.resolve({
        ok: true, status: 200,
        json: function () { return Promise.resolve({ ok: true, test: true, mautic_id: 'TEST' }); },
        text: function () { return Promise.resolve('{"ok":true,"test":true}'); }
      });
    };
  }

  // Buchung ist ein FREMDES System (Easy!Appointments). Ein Klick dort erzeugt
  // einen echten Termin, den kein Schalter von hier aus zuruecknimmt. Also wird
  // der Weg dorthin zugemacht, statt darauf zu hoffen, dass niemand klickt.
  function istBuchung(u) {
    var hosts = (window.MX_CONFIG && window.MX_CONFIG.BOOKING_HOSTS) ||
                ['booking.orgasmic.live', 'calendly.com', 'cal.com'];
    for (var i = 0; i < hosts.length; i++) if (u.indexOf(hosts[i]) > -1) return true;
    return false;
  }
  // Unuebersehbar melden, nicht nur den Balken kurz umschreiben. Am 07.09.2026
  // hat genau das zu der Fehldiagnose gefuehrt, die Buchungslinks seien kaputt:
  // der Klick tat scheinbar nichts, der Balkentext wechselte fuer fuenf Sekunden.
  // Der zweite Knopf ist wichtig: wer den Link pruefen will, muss den Kalender
  // auch wirklich oeffnen koennen, ohne den Testmodus zu verlassen.
  function testHinweis(ziel) {
    var alt = document.getElementById('mx-testhinweis');
    if (alt) alt.remove();
    var h = document.createElement('div');
    h.id = 'mx-testhinweis';
    h.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(20,6,12,.72);' +
      'display:flex;align-items:center;justify-content:center;padding:24px';
    var k = document.createElement('div');
    k.style.cssText = 'background:#fff;border-radius:12px;max-width:420px;width:100%;padding:26px 24px;' +
      'font:400 15px/1.55 Quicksand,system-ui,sans-serif;color:#14060C;text-align:center;' +
      'box-shadow:0 18px 50px rgba(0,0,0,.4)';
    var t = document.createElement('div');
    t.style.cssText = 'font-weight:800;font-size:17px;margin-bottom:10px';
    t.textContent = 'Testmodus: Buchung gestoppt';
    var p = document.createElement('p');
    p.style.cssText = 'margin:0 0 18px';
    p.textContent = 'Der Link ist in Ordnung. Im Echtbetrieb wuerde jetzt der Kalender oeffnen. ' +
                    'Hier wird er angehalten, damit kein echter Termin entsteht.';
    var oeffnen = document.createElement('a');
    oeffnen.href = ziel; oeffnen.target = '_blank'; oeffnen.rel = 'noopener';
    oeffnen.textContent = 'Kalender trotzdem oeffnen';
    oeffnen.style.cssText = 'display:block;background:#14060C;color:#fff;text-decoration:none;' +
      'border-radius:8px;padding:13px 16px;font-weight:700;margin-bottom:10px';
    var zu = document.createElement('button');
    zu.type = 'button'; zu.textContent = 'Weiter testen';
    zu.style.cssText = 'display:block;width:100%;background:none;border:0;padding:10px;' +
      'font:inherit;font-weight:700;color:#8A6072;cursor:pointer;text-decoration:underline';
    zu.onclick = function () { h.remove(); };
    h.onclick = function (ev) { if (ev.target === h) h.remove(); };
    k.appendChild(t); k.appendChild(p); k.appendChild(oeffnen); k.appendChild(zu);
    h.appendChild(k); document.body.appendChild(h);
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || !istBuchung(a.href)) return;
    e.preventDefault(); e.stopPropagation();
    melde('Buchung im Testmodus gestoppt — sonst stuende jetzt ein echter Termin im Kalender.');
    testHinweis(a.href);
  }, true);
  var altOpen = window.open;
  window.open = function (u) {
    if (u && istBuchung(String(u))) {
      melde('Buchung im Testmodus gestoppt — sonst stuende jetzt ein echter Termin im Kalender.');
      testHinweis(String(u));
      return null;
    }
    return altOpen.apply(window, arguments);
  };

  // Sichtbarer Balken. Ein stiller Testmodus ist gefaehrlicher als keiner: sonst
  // testet man in dem Glauben, es sei scharf — oder haelt Scharfes fuer einen Test.
  var balken;
  function melde(text) {
    if (!balken) return;
    var alt = balken.firstChild.textContent;
    balken.firstChild.textContent = text;
    setTimeout(function () { if (balken) balken.firstChild.textContent = alt; }, 5000);
  }
  function bauen() {
    if (document.getElementById('mx-testbalken')) { balken = document.getElementById('mx-testbalken'); return; }
    balken = document.createElement('div');
    balken.id = 'mx-testbalken';
    var t = document.createElement('span');
    t.textContent = 'TESTMODUS — es geht nichts raus. Kein Lead, kein Mautic, keine Buchung.';
    var aus = document.createElement('a');
    aus.textContent = 'beenden';
    aus.href = '#';
    aus.style.cssText = 'margin-left:14px;color:#14060C;text-decoration:underline;cursor:pointer';
    aus.onclick = function (ev) {
      ev.preventDefault();
      try { sessionStorage.removeItem('mx_test'); } catch (e) {}
      location.href = location.pathname;
    };
    balken.appendChild(t); balken.appendChild(aus);
    balken.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#FFDE59;' +
      'color:#14060C;font:700 13px/1.4 Quicksand,system-ui,sans-serif;text-align:center;padding:9px 12px;' +
      'letter-spacing:.02em;box-shadow:0 2px 10px rgba(0,0,0,.35)';
    document.body.appendChild(balken);
    document.body.style.paddingTop = '38px';
  }
  // Im Editor-Rahmen KEIN Balken. Der Editor speichert das lebende DOM — ein zur
  // Laufzeit angehaengtes Element landet sonst dauerhaft in der Datei. Geblockt
  // wird trotzdem alles, nur die Anzeige entfaellt.
  var imRahmen = (function () { try { return window.top !== window.self; } catch (e) { return true; } })();
  if (!imRahmen) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bauen);
    else bauen();
  }

  console.log('%c[TEST] Testmodus aktiv auf ' + location.pathname +
              ' — n8n, Mautic, Tracking, Buchung und Pixel-Ereignisse sind abgeklemmt.',
              'background:#FFDE59;color:#14060C;padding:2px 6px');
})();

// Besucher-Identifikation + Kanal-Erkennung — Live ORGASMIC, 8-Tage-Challenge.
//
// Diese Datei ist die Zusammenführung von drei Bausteinen:
//   1) der Besucher-Identifikation aus dem ersten Build (Juli 2026) inkl.
//      Calendly-Vorbefüllung für booking.orgasmic.live,
//   2) dem Kanal-Tracking-Standard vom 05.08.2026, der im ersten Build noch fehlte,
//   3) der Lead-ID-Brücke zum Buchungstool (Call Christian Wennmacher, 11.08.2026) —
//      siehe Block "BUCHUNGSLINK-BRÜCKE" weiter unten.
//
// ── ZWEI IDs, DIE NICHT DASSELBE SIND ───────────────────────────────────────
// besucher_id  = unsere ID. Zählt Videofortschritt, Kanal, Termin-Klicks. Existiert
//                auch für anonyme Besucherinnen.
// MX_LEAD_ID   = Christians Mautic-ID. Existiert nur, wenn die Frau aus dem Formular
//                oder aus WhatsApp kommt. Sie ist der Schlüssel, mit dem sein
//                Buchungstool Name/Telefon/E-Mail selbst aus Mautic zieht.
// Sie werden getrennt geführt und getrennt weitergegeben.
//
// ── IDENTITÄT — drei Stufen, je nachdem woher der Besucher kommt ─────────────
// 1) Personalisierter Link mit CRM-ID (?lead_id=13629 / ?c_id=13629):
//    → Identität von Anfang an bekannt, KEIN Formular nötig.
// 2) Personalisierter Link mit Namen (?name=Anna):
//    → Name wird beim Öffnen ans Backend gemeldet (identifiziert).
// 3) Organischer/anonymer Traffic ohne Parameter:
//    → anonyme ID wird erzeugt; der Name kommt später über das Opt-in-Formular
//      in denselben Datensatz (Primärschlüssel ist die besucher_id, nicht der Name).
//
// Das Video bleibt in allen Fällen auf UNSERER Seite (YouTube-IFrame-API statt
// Weiterleitung zu youtube.com) — nur so bleibt Prozent-Tracking der Watch-Time
// möglich. Ein Redirect in die native App verliert jede Prozent-Genauigkeit.
//
// ── KANAL-ERKENNUNG ─────────────────────────────────────────────────────────
// Ausgewertet in dieser Reihenfolge:
//   ?src=whatsapp   → expliziter Kanal (whatsapp | mail | sms | ads | linkedin | organisch)
//   ?utm_source=... → Fallback, wenn src fehlt (Versand-Tools setzen das oft automatisch)
//   document.referrer → schwaches Fallback, NUR als "vermutet" markiert
//   ?msg=3          → welche Nachricht der Sequenz den Klick ausgelöst hat (= Tag 3)
//   ?cmp=welle-08   → Versand-Batch, Schlüssel für den Nicht-Klicker-Abgleich
//
// WICHTIG — was hier NICHT möglich ist: Der Klick INNERHALB von WhatsApp ist nicht
// trackbar (WhatsApp gibt kein Klick-Event heraus). Getrackt wird das Öffnen der
// Seite danach. Die WhatsApp-Linkvorschau führt kein JavaScript aus und erzeugt
// deshalb KEINEN Fake-Klick — die Zahlen bleiben sauber.
//
// Für diese Challenge ist das der entscheidende Punkt: die acht Tage werden über
// WhatsApp vom Challenge-Guide verschickt. Ohne ?src/?msg/?cmp in jedem Link
// steht am Ende nur "irgendwer war da" im Dashboard, aber nicht, welcher Tag
// welche Frau zurückgeholt hat.

(function () {
  const STORAGE_KEY = "mx_visitor_id";
  const NAME_KEY = "mx_known_name";
  const EMAIL_KEY = "mx_known_email";
  const FIRST_CHANNEL_KEY = "mx_first_channel";

  const LEAD_ID_KEY = "mx_lead_id";

  // Alle Schreibweisen, unter denen die Mautic-/CRM-ID hereinkommen kann.
  // Beim LESEN großzügig — jedes Versandtool benennt sie anders, und ein Tippfehler
  // im Link darf die Identität nicht kosten. Beim SCHREIBEN genau einer, nämlich der
  // aus config.js; sonst hingen am Buchungslink fünf Parameter mit demselben Wert.
  const ID_ALIASE = ["lead_id", "c_id", "contact_id", "mautic_id", "mtc_id", "lid"];

  const params = new URLSearchParams(window.location.search);

  const linkId = (function () {
    for (let i = 0; i < ID_ALIASE.length; i++) {
      const wert = params.get(ID_ALIASE[i]);
      if (wert && wert.trim()) return wert.trim();
    }
    return null;
  })();
  const linkName = params.get("name");

  // Erlaubte Kanal-Werte — alles andere wird auf "sonstiges" normalisiert, damit im
  // Dashboard nicht durch Tippfehler im Versand-Tool zehn Varianten von "WhatsApp" stehen.
  const KANAELE = ["whatsapp", "mail", "sms", "ads", "linkedin", "organisch"];

  function normalisiereKanal(wert) {
    if (!wert) return null;
    const w = String(wert).toLowerCase().trim();
    if (KANAELE.includes(w)) return w;
    if (w === "wa" || w.includes("whatsapp")) return "whatsapp";
    if (w === "email" || w === "e-mail" || w.includes("brevo") || w.includes("newsletter")) return "mail";
    if (w === "facebook" || w === "fb" || w === "ig" || w === "instagram" || w === "meta" || w === "google") return "ads";
    if (w.includes("linkedin")) return "linkedin";
    return "sonstiges";
  }

  function kanalAusReferrer() {
    const ref = document.referrer || "";
    if (!ref) return null;
    try {
      if (new URL(ref).host === window.location.host) return null;
    } catch (e) {}
    if (/facebook|instagram|fb\.me|l\.facebook/i.test(ref)) return "ads";
    if (/linkedin|lnkd\.in/i.test(ref)) return "linkedin";
    if (/mail\.google|outlook|mail\.yahoo|web\.de|gmx/i.test(ref)) return "mail";
    if (/google\.|bing\.|duckduckgo/i.test(ref)) return "organisch";
    return null;
  }

  function getOrCreateId() {
    try {
      let id = localStorage.getItem(STORAGE_KEY);
      if (linkId) {
        // Bekannte CRM-ID aus dem Link hat Vorrang und überschreibt eine vorher
        // erzeugte anonyme ID — sonst läge dieselbe Frau zweimal im Store.
        id = "crm_" + linkId;
        localStorage.setItem(STORAGE_KEY, id);
      } else if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : "v_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch (e) {
      // localStorage blockiert (strikter Privacy-Modus) — Fallback ohne Persistenz
      return linkId ? "crm_" + linkId : "v_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
  }

  function getKnownName() {
    try {
      if (linkName) {
        localStorage.setItem(NAME_KEY, linkName);
        return linkName;
      }
      return localStorage.getItem(NAME_KEY) || null;
    } catch (e) {
      return linkName || null;
    }
  }

  // E-Mail wird ausschließlich lokal gehalten (localStorage, gesetzt beim Absenden
  // des Opt-in-Formulars) — absichtlich NICHT über die URL weitergegeben, damit sie
  // nicht in Server-Logs, Referrern oder geteilten Links landet. Gebraucht wird sie
  // nur, um den Calendly-Link vorzubefüllen. (Kanal-Tracking-Regel 6.)
  function getKnownEmail() {
    try { return localStorage.getItem(EMAIL_KEY) || null; } catch (e) { return null; }
  }

  // Die Mautic-Lead-ID — getrennt von der besucher_id geführt.
  //
  // Warum sie GESPEICHERT wird und nicht nur aus der URL gelesen: sie kommt genau
  // einmal herein, nämlich beim ersten Aufruf aus dem Formular oder aus WhatsApp.
  // Geklickt wird der Buchungsbutton aber irgendwann später — auf der OTO, auf Tag 6,
  // nach einem Neuladen, am nächsten Tag. Bis dahin ist die URL längst eine andere.
  // Dazu kommt: Netlify schreibt './video4.html' zu '/video4' um und wirft die
  // Parameter dabei weg. Aus dem Speicher übersteht die ID beides.
  //
  // Genau das meinte Christian mit "Das muss abgespeichert werden und dann dem
  // Buchungstool im Link übergeben werden".
  function getLeadId() {
    try {
      if (linkId) {
        localStorage.setItem(LEAD_ID_KEY, linkId);
        return linkId;
      }
      return localStorage.getItem(LEAD_ID_KEY) || null;
    } catch (e) {
      return linkId || null;
    }
  }

  function getKanalInfo() {
    const explizit = normalisiereKanal(params.get("src") || params.get("kanal") || params.get("utm_source"));
    const vermutet = explizit ? null : kanalAusReferrer();

    const info = {
      kanal: explizit || vermutet || null,
      // true = aus dem Referrer geraten, nicht aus dem Link gemessen
      kanal_vermutet: Boolean(!explizit && vermutet),
      // Position in der Sequenz — bei dieser Challenge: welcher Tag verschickt wurde
      nachricht: params.get("msg") || params.get("utm_content") || null,
      // Versand-Batch — Schlüssel für den Nicht-Klicker-Abgleich gegen die Versandliste
      kampagne: params.get("cmp") || params.get("utm_campaign") || null,
      // Erster jemals gemessener Kanal dieser Besucherin — beantwortet "woher kam sie ursprünglich"
      erst_kanal: null,
    };

    try {
      const gespeichert = localStorage.getItem(FIRST_CHANNEL_KEY);
      if (gespeichert) {
        info.erst_kanal = gespeichert;
      } else if (info.kanal && !info.kanal_vermutet) {
        // Nur GEMESSENE Kanäle als First-Touch festschreiben — ein geratener
        // Referrer-Wert darf den ersten echten Kanal nicht blockieren.
        localStorage.setItem(FIRST_CHANNEL_KEY, info.kanal);
        info.erst_kanal = info.kanal;
      }
    } catch (e) {
      info.erst_kanal = info.kanal;
    }

    return info;
  }

  window.MX_VISITOR_ID = getOrCreateId();
  window.MX_KNOWN_NAME = getKnownName();
  // Anreden einsetzen, sobald der Name feststeht.
  if (window.MX_PERSONALISIEREN) {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', window.MX_PERSONALISIEREN);
    else window.MX_PERSONALISIEREN();
  }
  window.MX_KNOWN_EMAIL = getKnownEmail();
  // Mautic-Lead-ID für die Brücke zum Buchungstool (siehe unten)
  window.MX_LEAD_ID = getLeadId();
  // true nur beim allerersten Aufruf mit frischem Link-Parameter — steuert, ob ein
  // "identifiziert"-Event ans Backend geht (siehe videoX.html)
  window.MX_JUST_IDENTIFIED = Boolean(linkName || linkId);
  // Kanal-Kontext dieses Aufrufs — wird bei JEDEM track()-Aufruf mitgeschickt
  window.MX_KANAL = getKanalInfo();

  // ══ BUCHUNGSLINK-BRÜCKE ═══════════════════════════════════════════════════════
  //
  // Aufgabe (Call mit Christian Wennmacher, 11.08.2026, 01:12–01:16): jeder Link auf
  // das Buchungstool muss die Mautic-Lead-ID tragen. Das Tool fragt damit bei Mautic
  // Name, Telefonnummer und E-Mail ab, überspringt Schritt 2 (Daten eingeben) und
  // geht direkt auf die Bestätigung.
  //
  // Sebastians Einwand im Call war der eigentliche Knackpunkt: "ich gebe das ja einmal
  // ein, dann ist die Internetseite da, und da kann ich ja nicht jetzt individuell
  // irgendwelche Dinge eingeben" — im Seiten-Builder steht EIN statischer Link, für
  // alle Besucherinnen derselbe. Christian: "Dann musst du gucken, ob du das mit einem
  // Javascript überschreiben kannst. Weil, so muss es sein, anders geht es ja nicht
  // dynamisch." Genau das passiert hier: der href wird zur Laufzeit überschrieben.
  //
  // Der Parametername steht in config.js (BUCHUNG_ID_PARAM) und ist der einzige Wert,
  // den Christian noch bestätigen muss.

  const CFG = window.MX_CONFIG || {};
  const ID_PARAM = CFG.BUCHUNG_ID_PARAM || "lead_id";

  // Hosts, an die die ID angehängt werden darf. Bewusst eine Positivliste: die ID ist
  // ein Personenbezug, sie hat an einem Impressums- oder Datenschutz-Link nichts zu
  // suchen. Der Host aus BOOKING_URL kommt automatisch dazu, damit ein Wechsel des
  // Buchungstools nur an EINER Stelle in config.js passiert.
  const BUCHUNG_HOSTS = (function () {
    const liste = (CFG.BOOKING_HOSTS || ["booking.orgasmic.live", "calendly.com", "cal.com"]).slice();
    try {
      const h = new URL(CFG.BOOKING_URL, window.location.href).host.toLowerCase();
      if (h && liste.indexOf(h) === -1) liste.push(h);
    } catch (e) {}
    return liste.map(function (h) { return String(h).toLowerCase(); });
  })();

  function istBuchungslink(a) {
    const roh = a.getAttribute("href");
    if (!roh || roh.charAt(0) === "#") return false;
    let host;
    try {
      host = new URL(a.href, window.location.href).host.toLowerCase();
    } catch (e) {
      return false;
    }
    return BUCHUNG_HOSTS.some(function (h) {
      return host === h || host.endsWith("." + h);
    });
  }

  // Setzt die Parameter an EINEM Link. Mehrfach aufrufbar: searchParams.set()
  // überschreibt, statt anzuhängen — der Link wächst also nicht bei jedem Durchlauf.
  function buchungslinkAufbereiten(a) {
    try {
      const url = new URL(a.href, window.location.href);

      if (window.MX_LEAD_ID) {
        url.searchParams.set(ID_PARAM, window.MX_LEAD_ID);
        // Name und E-Mail wandern dann NICHT zusätzlich in die URL: das Buchungstool
        // holt beides über die ID aus Mautic. Alles, was hier trotzdem mitginge,
        // stünde danach in Server-Logs, Referrern und geteilten Links
        // (Kanal-Tracking-Regel 6). Die ID ersetzt die Klartextdaten — sie ergänzt
        // sie nicht.
        url.searchParams.delete("email");
      } else {
        // Kein Lead in Mautic (organischer Traffic, Direktaufruf): dann bleibt es beim
        // bisherigen Verhalten und wir befüllen vor, so gut wir können.
        if (window.MX_KNOWN_NAME) url.searchParams.set("name", window.MX_KNOWN_NAME);
        if (window.MX_KNOWN_EMAIL) url.searchParams.set("email", window.MX_KNOWN_EMAIL);
      }

      // Besucher-ID immer mit: nur darüber lässt sich die gebuchte Terminierung im
      // Dashboard derselben Frau zuordnen, die vorher die Videos gesehen hat
      // (siehe netlify/functions/calendly-webhook.js).
      if (window.MX_VISITOR_ID) url.searchParams.set("a1", window.MX_VISITOR_ID);

      const neu = url.toString();
      if (neu !== a.href) a.href = neu;
    } catch (e) {}
  }

  function alleBuchungslinksAufbereiten(wurzel) {
    const bereich = wurzel && wurzel.querySelectorAll ? wurzel : document;
    const treffer = bereich.querySelectorAll("a[href]");
    for (let i = 0; i < treffer.length; i++) {
      if (istBuchungslink(treffer[i])) buchungslinkAufbereiten(treffer[i]);
    }
  }

  // Alter Name bleibt bestehen: die zehn Seiten und _build-videoseiten.py rufen
  // MX_PREFILL_CALENDLY() auf, nachdem sie den Button-href aus config.js gesetzt haben.
  window.MX_PREFILL_CALENDLY = function () { alleBuchungslinksAufbereiten(document); };
  window.MX_BUCHUNGSLINKS_AUFBEREITEN = window.MX_PREFILL_CALENDLY;

  // Fertigen Buchungslink zurückgeben — für Code, der NICHT über ein <a> im DOM geht
  // (das Chat-Widget etwa leitet per window.location weiter). Läuft absichtlich durch
  // dieselbe Funktion wie die Links auf der Seite: sonst gäbe es zwei Stellen, an denen
  // die ID angehängt wird, und irgendwann hängt sie nur noch an einer davon.
  //
  // `zusatz` erlaubt seitenspezifische Parameter, z.B. {date:'2026-08-14'} für den
  // Terminvorschlag aus dem Chat.
  window.MX_BUCHUNGSLINK = function (basis, zusatz) {
    const a = document.createElement("a");
    a.href = basis || CFG.BOOKING_URL || "";
    buchungslinkAufbereiten(a);
    if (zusatz) {
      try {
        const url = new URL(a.href);
        Object.keys(zusatz).forEach(function (k) {
          if (zusatz[k] !== null && zusatz[k] !== undefined && zusatz[k] !== "") {
            url.searchParams.set(k, zusatz[k]);
          }
        });
        return url.toString();
      } catch (e) {}
    }
    return a.href;
  };

  // ── Drei Netze, weil ein einziger Durchlauf beim Laden nicht reicht ──────────
  //
  // 1) sofort + DOMContentLoaded → alles, was fest im Markup steht.
  // 2) MutationObserver → Links, die erst später entstehen: die Editor-Fassung, ein
  //    nachgeladenes Chat-Widget, eine Sektion, die per JS eingehängt wird. Ohne
  //    dieses Netz trüge ausgerechnet der Button aus dem geplanten Chat-Widget
  //    (Thema desselben Calls) die ID nicht.
  // 3) Klick in der Capture-Phase → das letzte Netz, direkt vor dem Absprung. Es
  //    greift auch dann, wenn ein Seiten-Builder den href zwischendurch selbst
  //    wieder auf den statischen Wert zurücksetzt.
  alleBuchungslinksAufbereiten(document);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      alleBuchungslinksAufbereiten(document);
    });
  }

  if (window.MutationObserver) {
    const beobachter = new MutationObserver(function (eintraege) {
      for (let i = 0; i < eintraege.length; i++) {
        const e = eintraege[i];
        if (e.type === "attributes") {
          if (e.target && e.target.tagName === "A" && istBuchungslink(e.target)) {
            buchungslinkAufbereiten(e.target);
          }
          continue;
        }
        for (let j = 0; j < e.addedNodes.length; j++) {
          const knoten = e.addedNodes[j];
          if (knoten.nodeType !== 1) continue;
          if (knoten.tagName === "A") {
            if (istBuchungslink(knoten)) buchungslinkAufbereiten(knoten);
          } else {
            alleBuchungslinksAufbereiten(knoten);
          }
        }
      }
    });
    // Das Setzen des href löst den Beobachter erneut aus — buchungslinkAufbereiten()
    // schreibt aber nur bei echter Änderung, die Schleife läuft also nach einem
    // zusätzlichen Durchlauf aus.
    beobachter.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"],
    });
  }

  ["pointerdown", "click", "auxclick"].forEach(function (ereignis) {
    document.addEventListener(ereignis, function (ev) {
      const ziel = ev.target;
      const a = ziel && ziel.closest ? ziel.closest("a[href]") : null;
      if (a && istBuchungslink(a)) buchungslinkAufbereiten(a);
    }, true);
  });

  // Reicht den Kanal-Kontext an INTERNE Weiter-Links durch (Tag 3 → Tag 4).
  //
  // ?src wird bewusst NICHT mitgegeben (Kanal-Tracking-Regel 2): sonst zählte jeder
  // interne Weiterklick als neuer WhatsApp-Klick und die Kanal-Zahlen wären erfunden.
  // ?msg bleibt ebenfalls draußen — es beschreibt die verschickte Nachricht, nicht die
  // Seite. Mit muss alles, was die Person identifiziert (name, lead_id) und der
  // Versand-Batch (cmp), sonst reißt die Zuordnung ab der Folgeseite ab (Regel 3).
  window.MX_INTERNE_PARAMETER = function () {
    const qs = new URLSearchParams();
    ["cmp", "cluster"].forEach(function (k) {
      const v = params.get(k);
      if (v) qs.set(k, v);
    });
    // Name und ID kommen aus dem SPEICHER, nicht aus der URL. Vorher wurde nur
    // durchgereicht, was gerade in der Adresszeile stand — und dort steht ab der
    // zweiten Seite nichts mehr, weil Netlify './video4.html' zu '/video4' umschreibt
    // und die Parameter dabei wegwirft. Zusätzlich fiel '?contact_id=' hier komplett
    // durch: visitor.js las es oben, reichte es aber nie weiter.
    // Ausgegeben wird nur noch der kanonische Name 'lead_id' — ein Alias-Zoo in den
    // internen Links bringt nichts, gelesen werden sie oben ohnehin alle.
    if (window.MX_KNOWN_NAME) qs.set("name", window.MX_KNOWN_NAME);
    if (window.MX_LEAD_ID) qs.set("lead_id", window.MX_LEAD_ID);
    return qs.toString() ? "?" + qs.toString() : "";
  };
})();
