/*
 * L'Établi : outils des sondages de dates (window.SondageOutils), sans dépendance.
 * Partagés par l'éditeur (/sondage/) et la page publique (/d/<jeton>, public/p/sondage.html).
 *
 * dateLongue(iso), dateCourte(iso), libelleOption(o), heures(o)     textes en français
 * minutes('16:30') -> 990, hm(990) -> '16:30'
 * creneaux({ debut, fin, duree, pause })                             créneaux d'une journée [[debut, fin], ...]
 * totaux(options, reponses), meilleures(options, reponses)           décompte et meilleure(s) option(s)
 * ics({ nom, evenements: [{ uid, date, debut?, fin?, titre, lieu?, description? }] })   fichier .ics (Europe/Zurich)
 * csv(lignes)                                                        fichier CSV (point-virgule, BOM)
 */
(function (g) {
  'use strict';
  if (g.SondageOutils) return;
  const NB = '\u202F'; // espace fine insécable
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad = (n) => String(n).padStart(2, '0');

  function date(iso) { const p = String(iso || '').split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1, 12); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ajouterJours(s, n) { const d = date(s); d.setDate(d.getDate() + n); return iso(d); }
  const er = (n) => n + (n === 1 ? 'er' : '');
  function dateLongue(s, annee) {
    const d = date(s);
    const avecAnnee = annee === true || (annee !== false && d.getFullYear() !== new Date().getFullYear());
    return JOURS[d.getDay()] + ' ' + er(d.getDate()) + ' ' + MOIS[d.getMonth()] + (avecAnnee ? ' ' + d.getFullYear() : '');
  }
  function dateCourte(s) { const d = date(s); return JOURS[d.getDay()].slice(0, 3) + '. ' + d.getDate() + ' ' + MOIS_COURT[d.getMonth()]; }
  function moisAnnee(d) { return MOIS[d.getMonth()] + ' ' + d.getFullYear(); }
  function minutes(h) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function hm(min) { min = Math.max(0, Math.min(24 * 60 - 1, Math.round(min))); return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  /** « 16:00 à 16:30 », « dès 16:00 » ou « journée entière » */
  function heures(o) {
    if (!o || !o.debut) return 'journée entière';
    return o.fin ? o.debut + ' à ' + o.fin : 'dès ' + o.debut;
  }
  function libelleOption(o, annee) {
    return dateLongue(o.date, annee) + (o.debut ? ', ' + heures(o) : '') + (o.libelle ? ' (' + o.libelle + ')' : '');
  }
  const trier = (l) => l.slice().sort((a, b) => (a.date + (a.debut || '')).localeCompare(b.date + (b.debut || '')));

  /** Créneaux d'une journée : de debut à fin, par duree minutes, avec une pause éventuelle entre deux. */
  function creneaux(o) {
    const d = minutes(o.debut), f = minutes(o.fin), duree = Math.max(5, Number(o.duree) || 15), pause = Math.max(0, Number(o.pause) || 0);
    const out = [];
    if (d == null || f == null || f <= d) return out;
    for (let t = d; t + duree <= f && out.length < 96; t += duree + pause) out.push([hm(t), hm(t + duree)]);
    return out;
  }

  /** { optionId: { oui, peutetre, non, sans } } */
  function totaux(options, reponses) {
    const t = {};
    options.forEach((o) => { t[o.id] = { oui: 0, peutetre: 0, non: 0, sans: 0 }; });
    (reponses || []).forEach((r) => options.forEach((o) => {
      const v = r.choix && r.choix[o.id];
      if (v === 'oui' || v === 'peutetre' || v === 'non') t[o.id][v]++; else t[o.id].sans++;
    }));
    return t;
  }
  /** Identifiants des meilleures options : le plus de « oui », puis le plus de « peut-être » ; [] sans réponse positive. */
  function meilleures(options, reponses) {
    const t = totaux(options, reponses);
    let max = null;
    options.forEach((o) => {
      const x = t[o.id];
      const s = x.oui * 1000 + x.peutetre;
      if (max === null || s > max) max = s;
    });
    if (!max) return [];
    return options.filter((o) => t[o.id].oui * 1000 + t[o.id].peutetre === max).map((o) => o.id);
  }

  /* ---------------- .ics ---------------- */
  const VTIMEZONE = [
    'BEGIN:VTIMEZONE', 'TZID:Europe/Zurich',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
  ];
  function echapper(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  /** Plie les lignes à 75 octets (RFC 5545), sans couper un caractère. */
  function plier(ligne) {
    const enc = new TextEncoder();
    if (enc.encode(ligne).length <= 75) return ligne;
    const morceaux = [];
    let cur = '', taille = 0, max = 75;
    for (const ch of ligne) {
      const t = enc.encode(ch).length;
      if (taille + t > max) { morceaux.push(cur); cur = ''; taille = 0; max = 74; }
      cur += ch; taille += t;
    }
    morceaux.push(cur);
    return morceaux.join('\r\n ');
  }
  const compact = (s) => String(s).replace(/-/g, '');
  const horodatage = (h) => (h || '00:00').replace(':', '') + '00';
  function stampUTC(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  /** evenements : [{ uid, date, debut?, fin?, duree? (min), titre, lieu?, description? }] */
  function ics(o) {
    const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//L Etabli//Sondages de dates//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (o.nom) l.push('X-WR-CALNAME:' + echapper(o.nom));
    const avecHeure = (o.evenements || []).some((e) => e.debut);
    if (avecHeure) l.push(...VTIMEZONE);
    const stamp = stampUTC(new Date());
    (o.evenements || []).forEach((e) => {
      l.push('BEGIN:VEVENT', 'UID:' + e.uid, 'DTSTAMP:' + stamp);
      if (e.debut) {
        const fin = e.fin || hm(minutes(e.debut) + (Number(e.duree) || 60));
        l.push('DTSTART;TZID=Europe/Zurich:' + compact(e.date) + 'T' + horodatage(e.debut));
        l.push('DTEND;TZID=Europe/Zurich:' + compact(e.date) + 'T' + horodatage(fin));
      } else {
        l.push('DTSTART;VALUE=DATE:' + compact(e.date), 'DTEND;VALUE=DATE:' + compact(ajouterJours(e.date, 1)));
      }
      l.push('SUMMARY:' + echapper(e.titre || 'Rendez-vous'));
      if (e.lieu) l.push('LOCATION:' + echapper(e.lieu));
      if (e.description) l.push('DESCRIPTION:' + echapper(e.description));
      l.push('END:VEVENT');
    });
    l.push('END:VCALENDAR');
    return l.map(plier).join('\r\n') + '\r\n';
  }

  /* ---------------- CSV ---------------- */
  function cellule(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // pas de formule dans un tableur
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  /** lignes : tableau de tableaux de valeurs -> texte CSV (séparateur « ; », pour les tableurs en français). */
  function csv(lignes) { return '\uFEFF' + lignes.map((l) => l.map(cellule).join(';')).join('\r\n') + '\r\n'; }

  /** Nom de fichier sûr à partir d'un titre. */
  function nomFichier(t, ext) {
    const s = String(t || 'sondage').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
    return (s || 'sondage') + '.' + ext;
  }
  function telecharger(nom, texte, type) {
    const blob = new Blob([texte], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  g.SondageOutils = {
    NB, JOURS, MOIS, date, iso, ajouterJours, dateLongue, dateCourte, moisAnnee, minutes, hm, heures, libelleOption, trier,
    creneaux, totaux, meilleures, ics, csv, nomFichier, telecharger,
  };
})(window);
