/*
 * L'Établi : cartes mémoire dans l'espace élève (window.EleveMemo).
 * La révision est faite par le composant MemoEtude (/js/memo-etude.js, avec /js/memo-fsrs.js et
 * /css/memo-etude.css, chargés à la demande) : accueil du paquet, choix du mode, séance, jardin du paquet.
 * Cette page s'occupe du stockage : états lus par EtabliEleve.memo.charger, progrès envoyés par
 * EtabliEleve.memo.envoyer par petits lots pendant la séance, à la fin et en quittant (la file d'attente hors
 * ligne est gérée par le client).
 *
 *   EleveMemo.outils()                       -> Promise<bool> : composant chargé
 *   EleveMemo.donnees(E, C, tache)           -> Promise<{ paquet, etats }>
 *   EleveMemo.jardin([{ paquet, etats }])    -> élément (jardin de tous les paquets) ou null
 *   EleveMemo.stats(paquet, etats)           -> { n, nouvelles, ancrees, aReactiver, prochaine }
 *   EleveMemo.monter(zone, ctx)              -> fonction de nettoyage (envoie ce qui reste)
 *   ctx : { tache, E (EtabliEleve), C (EleveC), serie, majTache(patch), rafraichir(), sessionPerdue(),
 *           memoriser(docId, { paquet, etats }) }
 */
(function (global) {
  'use strict';
  const LOT = 5;          // envoi après 5 réponses...
  const ATTENTE = 4000;   // ...ou 4 secondes après la dernière

  const copie = (o) => { try { return JSON.parse(JSON.stringify(o || {})); } catch (e) { return {}; } };

  let promesseOutils = null;
  function outils() {
    if (global.MemoEtude && global.MemoFSRS) return Promise.resolve(true);
    if (promesseOutils) return promesseOutils;
    const C = global.EleveC;
    promesseOutils = (async () => {
      try {
        await Promise.all([C.feuille('/css/memo-etude.css'), C.script('/js/memo-fsrs.js')]);
        await C.script('/js/memo-etude.js');
      } catch (e) { /* vérifié juste après */ }
      const ok = !!(global.MemoEtude && typeof global.MemoEtude.monter === 'function' && global.MemoFSRS);
      if (!ok) promesseOutils = null;
      return ok;
    })();
    return promesseOutils;
  }

  /** Paquet (document memo de la tâche) et états de l'élève pour ce paquet. */
  async function donnees(E, C, tache) {
    const c = C.normContenu(await E.contenu(tache.id), 'memo');
    const docId = (c.doc && c.doc.id) || tache.ref;
    const prog = await E.memo.charger(docId);
    return {
      paquet: { id: docId, titre: (c.doc && c.doc.titre) || tache.docTitre || tache.titre, data: (c.doc && c.doc.data) || {} },
      etats: copie(prog && prog.etats),
    };
  }

  function stats(paquet, etats) {
    const M = global.MemoFSRS;
    if (!M || !paquet) return null;
    try { return M.stats(paquet.data && paquet.data.cartes, etats || {}, paquet.data && paquet.data.reglages, Date.now()); } catch (e) { return null; }
  }

  function jardin(liste) {
    const ME = global.MemoEtude;
    if (!ME || typeof ME.jardin !== 'function' || !liste.length) return null;
    try { return ME.jardin(null, { paquets: liste.map((x) => ({ paquet: x.paquet, etats: x.etats })) }); } catch (e) { return null; }
  }

  function monter(zone, ctx) {
    const { tache, E, C } = ctx;
    const { h, brut, icone, message } = C;
    let actif = true, paquet = null, docId = null, etats = {}, instance = null;
    const vus = new Set();                 // réponses du journal déjà prises en compte
    const attente = { cles: new Set(), journal: [] };
    let minuteur = 0, envoiEnCours = null, derniereStats = null;

    const ligneEnvoi = h('p', { class: 'el-envoi', role: 'status', 'aria-live': 'polite' });
    function direEnvoi(ton, texte) {
      ligneEnvoi.dataset.ton = ton;
      ligneEnvoi.replaceChildren(brut(icone(ton === 'ok' ? 'check' : ton === 'attente' ? 'nuage' : 'horloge')), h('span', null, texte));
    }

    async function charger() {
      zone.replaceChildren(h('p', { class: 'el-chargement', role: 'status', style: { margin: '24px 0' } }, 'Je prépare tes cartes…'));
      const ok = await outils();
      if (!actif) return;
      if (!ok) {
        zone.replaceChildren(message('attention', 'La révision des cartes n’est pas disponible pour l’instant.', 'Réessaie plus tard ou demande à ton enseignant·e.'),
          h('div', null, h('button', { type: 'button', class: 'el-btn', onclick: charger }, 'Réessayer')));
        return;
      }
      let d;
      try { d = await donnees(E, C, tache); }
      catch (e) {
        if (e && e.code === 'non_connecte') { ctx.sessionPerdue(); return; }
        zone.replaceChildren(message('erreur', e && e.code === 'reseau' ? 'Pas de connexion à internet.' : (e && e.message) || 'Le paquet n’a pas pu s’ouvrir.', 'Réessaie dans un instant.'),
          h('div', null, h('button', { type: 'button', class: 'el-btn', onclick: charger }, 'Réessayer')));
        return;
      }
      if (!actif) return;
      paquet = d.paquet;
      docId = paquet.id;
      etats = d.etats;
      if (ctx.memoriser) ctx.memoriser(docId, { paquet, etats });
      const racine = h('div', { class: 'el-etude' });
      zone.replaceChildren(racine, ligneEnvoi);
      direEnvoi('ok', 'Tes progrès sont enregistrés à mesure.');
      try {
        instance = global.MemoEtude.monter(racine, {
          paquet, etats, mode: 'jour', titre: false,
          serie: typeof ctx.serie === 'number' ? ctx.serie : undefined,
          compact: global.matchMedia ? global.matchMedia('(max-width: 560px)').matches : false,
          surRevision: (journal, info) => surRevision(journal, info),
          surFin: (bilan) => { surFin(bilan); },
        });
      } catch (e) {
        console.error(e);
        zone.replaceChildren(message('erreur', 'La révision n’a pas pu démarrer.', 'Recharge la page.'));
      }
    }

    /* ---------- progrès ---------- */
    function surRevision(journal, info) {
      if (!actif || !paquet) return;
      info = info || {};
      const liste = Array.isArray(journal) ? journal : (info.entree ? [info.entree] : []);
      let nouvelles = 0;
      liste.forEach((x) => {
        if (!x || !x.c) return;
        const sig = x.c + '|' + (x.sens || 'recto') + '|' + (x.t || '') + '|' + x.note + '|' + (x.rep ? 1 : 0);
        if (vus.has(sig)) return;
        vus.add(sig);
        const j = { c: x.c, sens: x.sens || 'recto', note: x.note, t: x.t || Date.now(), ms: x.ms || 0 };
        if (x.rep) j.rep = 1;
        attente.journal.push(j);
        nouvelles++;
      });
      // états changés par cette réponse (le composant modifie aussi l'objet etats sur place)
      const modifies = info.modifies && typeof info.modifies === 'object' ? info.modifies : {};
      Object.keys(modifies).forEach((k) => { if (modifies[k]) { etats[k] = modifies[k]; attente.cles.add(k); } });
      if (!Object.keys(modifies).length && info.entree && info.entree.c) attente.cles.add(info.entree.c + '|' + (info.entree.sens || 'recto'));
      if (info.stats && typeof info.stats.n === 'number') derniereStats = info.stats;
      if (!nouvelles && !Object.keys(modifies).length) return;
      direEnvoi('local', 'Progrès gardés ici, envoi dans un instant…');
      clearTimeout(minuteur);
      if (attente.journal.length >= LOT) envoyer();
      else minuteur = setTimeout(envoyer, ATTENTE);
    }

    async function envoyer() {
      clearTimeout(minuteur);
      while (envoiEnCours) { await envoiEnCours; }
      if (!paquet || (!attente.cles.size && !attente.journal.length)) return;
      const lot = { etats: {}, journal: attente.journal.splice(0), stats: stats(paquet, etats) || derniereStats || null };
      attente.cles.forEach((k) => { if (etats[k]) lot.etats[k] = etats[k]; });
      attente.cles.clear();
      envoiEnCours = (async () => {
        try {
          const r = await E.memo.envoyer(docId, lot);
          // un autre appareil a revu des cartes plus récemment : ses états remplacent les nôtres
          if (r && r.plusRecents && typeof r.plusRecents === 'object') Object.keys(r.plusRecents).forEach((k) => { if (r.plusRecents[k]) etats[k] = r.plusRecents[k]; });
          // statut de la tâche (en cours, puis fait quand l'objectif est atteint)
          const ta = r && Array.isArray(r.taches) ? r.taches.find((x) => x && x.id === tache.id) : null;
          if (ta && ta.statut && actif && (ta.statut !== tache.statut || ta.score !== tache.score)) ctx.majTache({ statut: ta.statut, score: ta.score, total: ta.total, stats: r.stats || tache.stats });
          direEnvoi(r && r.enAttente ? 'attente' : 'ok', r && r.enAttente ? 'Pas de connexion : tes progrès partiront dès qu’elle revient.' : 'Progrès enregistrés.');
        } catch (e) {
          if (e && e.code === 'non_connecte') direEnvoi('attente', 'Reconnecte-toi pour enregistrer tes progrès.');
          else direEnvoi('attente', 'Pas de connexion : tes progrès partiront dès qu’elle revient.');
        }
      })();
      try { await envoiEnCours; } finally { envoiEnCours = null; }
    }

    async function surFin() {
      await envoyer();
      try {
        const t = ctx.rafraichir ? await ctx.rafraichir() : null;
        if (t && actif) ctx.majTache({ statut: t.statut, stats: t.stats || stats(paquet, etats) });
      } catch (e) { /* l'en-tête sera à jour au prochain passage */ }
    }

    const cache = () => { if (document.visibilityState === 'hidden') envoyer(); };
    const quitte = () => { envoyer(); };
    document.addEventListener('visibilitychange', cache);
    global.addEventListener('pagehide', quitte);

    charger();
    return async () => {
      actif = false;
      document.removeEventListener('visibilitychange', cache);
      global.removeEventListener('pagehide', quitte);
      const i = instance;
      instance = null;
      if (i && typeof i.detruire === 'function') { try { i.detruire(); } catch (e) { /* rien */ } }
      await envoyer();
    };
  }

  global.EleveMemo = { monter, outils, donnees, jardin, stats };
})(typeof window !== 'undefined' ? window : globalThis);
