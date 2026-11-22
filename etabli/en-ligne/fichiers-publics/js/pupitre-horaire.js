/*
 * L'Établi : organisation d'une classe dans le pupitre (onglets de #classes/<id>).
 * PP.horaire.panneau(ctx)      emploi du temps : grille lundi à vendredi, modèles, pinceau, duplication
 * PP.calendrierClasse.panneau(ctx)  canton, année, calendrier personnalisé (rentrée, fin, congés)
 * PP.familles.panneau(ctx)     devoirs publics : lien, QR, retrait
 * ctx : { d (data de la classe), modifie(), id(), assurerId(), titre(), membres: [{ uid, nom, couleur, moi }] }
 */
(function (g) {
  'use strict';
  const PP = g.PP, E = g.Etabli, UI = g.EtabliUI;
  const C = () => g.EtabliCalendrier;
  const { h, ico, NB } = PP;
  const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const JOURS_C = ['', 'Lu', 'Ma', 'Me', 'Je', 'Ve'];
  const PX = 1.2; // pixels par minute dans la grille
  const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  const mn = (x) => C().minutes(x);
  const hm = (m) => PP.hm(m);
  function trier(l) { return l.sort((a, b) => a.jour - b.jour || mn(a.debut) - mn(b.debut)); }
  function dureeMin(cr) { return Math.max(0, mn(cr.fin) - mn(cr.debut)); }

  /* =============================== emploi du temps =============================== */
  function panneauHoraire(ctx) {
    const d = ctx.d;
    if (!Array.isArray(d.horaire)) d.horaire = [];
    let pinceau = null; // null : inactif ; '' : effacer ; 'Français' : branche à poser
    const aujJ = C().jourSemaine(C().aujourdhui());
    let jourListe = aujJ <= 5 ? aujJ : 1;
    const racine = h('section', { class: 'hr', 'aria-labelledby': 'hr-t' });
    const zone = h('div', { class: 'hr-zone' });
    const barrePinceau = h('div', { class: 'hr-pinceau', hidden: true, role: 'toolbar', 'aria-label': 'Remplir vite' });
    const bilan = h('div', { class: 'hr-bilan' });
    const resumeTete = h('p', { class: 'muted hr-sous' });
    const btnPinceau = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: () => basculerPinceau() }, h('span', { html: ico('pinceau') }), 'Remplir vite');
    const btnModeles = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-haspopup': 'menu', onclick: (e) => menuModeles(e.currentTarget) }, h('span', { html: ico('horaire') }), 'Modèles');
    racine.append(
      h('div', { class: 'pp-panneau-tete hr-tete' },
        h('div', {}, h('h2', { class: 'pp-h2', id: 'hr-t' }, 'Emploi du temps'), resumeTete),
        h('div', { class: 'pp-boutons' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => editer(null, { jour: jourParDefaut() }) }, h('span', { html: ico('plus') }), 'Ajouter un créneau'),
          btnPinceau, btnModeles)),
      barrePinceau, zone, bilan);

    function jourParDefaut() { return racine.querySelector('.hr-liste') && getComputedStyle(racine.querySelector('.hr-liste')).display !== 'none' ? jourListe : 1; }
    const membres = () => (ctx.membres || []).filter((m) => m && m.uid);
    const membre = (uid) => membres().find((m) => m.uid === uid) || null;
    const branchesUtilisees = () => PP.orga.branchesDe({ horaire: d.horaire });
    const proposees = () => { const u = branchesUtilisees(); return u.concat(PP.orga.listeBranches(d.niveau).filter((b) => u.indexOf(b) < 0)); };

    /* ----- rendu ----- */
    function rendre() {
      trier(d.horaire);
      const n = d.horaire.length;
      const minutes = d.horaire.reduce((a, c) => a + dureeMin(c), 0);
      resumeTete.textContent = n ? PP.pluriel(n, 'créneau', 'créneaux') + ', ' + PP.dureeTexte(minutes) + ' de cours par semaine' : 'Les créneaux de la semaine : le pupitre saura où tu en es, et le plan de la semaine les reprendra.';
      btnModeles.hidden = false;
      if (!n) { zone.replaceChildren(vide()); bilan.replaceChildren(); rendrePinceau(); return; }
      zone.replaceChildren(grille(), liste());
      rendreBilan();
      rendrePinceau();
    }

    function vide() {
      return h('div', { class: 'hr-vide' },
        h('p', { class: 'pp-vide-titre' }, 'Pars d’un horaire type'),
        h('p', { class: 'muted' }, 'Choisis la grille de ton école, puis donne une branche à chaque créneau en deux clics avec « Remplir vite ». Tout reste modifiable.'),
        h('div', { class: 'hr-modeles' }, PP.orga.MODELES_HORAIRE.map((m) => h('button', { type: 'button', class: 'hr-modele', dataset: { modele: m.id }, onclick: () => appliquerModele(m) },
          h('b', {}, m.nom), h('small', {}, m.desc), miniGrille(m)))),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => editer(null, { jour: 1 }) }, h('span', { html: ico('plus') }), 'Ou ajoute tes créneaux un à un'));
    }
    function miniGrille(m) {
      const l = PP.orga.creneauxModele(m);
      const a = 7 * 60, b = 17 * 60;
      return h('span', { class: 'hr-mini', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((j) => h('span', { class: 'hr-mini-j' },
        l.filter((c) => c.jour === j).map((c) => h('i', { style: { top: ((mn(c.debut) - a) / (b - a)) * 100 + '%', height: (dureeMin(c) / (b - a)) * 100 + '%' } })))));
    }

    function bornes() {
      let a = 8 * 60, b = 16 * 60;
      d.horaire.forEach((c) => { a = Math.min(a, mn(c.debut)); b = Math.max(b, mn(c.fin)); });
      return { a: Math.floor(a / 60) * 60, b: Math.min(24 * 60, Math.ceil(b / 60) * 60) };
    }
    /** Pistes pour les créneaux qui se chevauchent (affichés côte à côte). */
    function pistes(l) {
      const res = new Map();
      let groupe = [], finGroupe = -1;
      const fermer = () => { const k = Math.max(1, ...groupe.map((x) => res.get(x).piste + 1)); groupe.forEach((x) => { res.get(x).n = k; }); groupe = []; };
      l.forEach((c) => {
        const a = mn(c.debut), b = mn(c.fin);
        if (a >= finGroupe && groupe.length) fermer();
        const prises = new Set(groupe.filter((x) => mn(x.fin) > a).map((x) => res.get(x).piste));
        let p = 0; while (prises.has(p)) p++;
        res.set(c, { piste: p, n: 1 });
        groupe.push(c);
        finGroupe = Math.max(finGroupe, b);
      });
      if (groupe.length) fermer();
      return res;
    }

    function grille() {
      const { a, b } = bornes();
      const H = (b - a) * PX;
      const maintenant = new Date();
      const mNow = maintenant.getHours() * 60 + maintenant.getMinutes();
      const g_ = h('div', { class: 'hr-grille', style: { '--hh': 60 * PX + 'px' } });
      const heures = h('div', { class: 'hr-heures', style: { height: H + 'px' } });
      for (let m = a; m <= b; m += 60) heures.appendChild(h('span', { class: 'num', style: { top: (m - a) * PX + 'px' } }, hm(m)));
      g_.appendChild(h('div', { class: 'hr-coin' }));
      for (let j = 1; j <= 5; j++) {
        g_.appendChild(h('div', { class: 'hr-jour-tete' + (j === aujJ ? ' auj' : '') },
          h('span', {}, JOURS[j]),
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm hr-ajout-jour', title: 'Ajouter un créneau le ' + JOURS[j].toLowerCase(), 'aria-label': 'Ajouter un créneau le ' + JOURS[j].toLowerCase(), html: ico('plus'), onclick: () => editer(null, { jour: j }) })));
      }
      g_.appendChild(heures);
      for (let j = 1; j <= 5; j++) {
        const col = h('div', { class: 'hr-col' + (j === aujJ ? ' auj' : ''), style: { height: H + 'px' }, dataset: { jour: String(j) } });
        const l = d.horaire.filter((c) => Number(c.jour) === j);
        const pi = pistes(l);
        l.forEach((c) => {
          const p = pi.get(c);
          col.appendChild(blocCreneau(c, { top: (mn(c.debut) - a) * PX, hauteur: Math.max(18, dureeMin(c) * PX - 2), piste: p.piste, n: p.n }));
        });
        if (j === aujJ && mNow >= a && mNow <= b) col.appendChild(h('span', { class: 'hr-maintenant', style: { top: (mNow - a) * PX + 'px' }, title: 'Maintenant' }));
        const fantome = h('span', { class: 'hr-fantome', hidden: true, 'aria-hidden': 'true' });
        col.appendChild(fantome);
        const minuteDe = (ev) => { const r = col.getBoundingClientRect(); return Math.round((a + (ev.clientY - r.top) / PX) / 5) * 5; };
        col.addEventListener('pointermove', (ev) => {
          if (ev.target !== col && ev.target !== fantome) { fantome.hidden = true; return; }
          const m = minuteDe(ev);
          fantome.hidden = false;
          fantome.style.top = (m - a) * PX + 'px';
          fantome.textContent = '+ ' + hm(m);
        });
        col.addEventListener('pointerleave', () => { fantome.hidden = true; });
        col.addEventListener('click', (ev) => {
          if (ev.target !== col && ev.target !== fantome) return;
          const m = minuteDe(ev);
          const suivant = l.map((c) => mn(c.debut)).filter((x) => x > m).sort((x, y) => x - y)[0];
          const fin = Math.min(m + 45, suivant || 24 * 60 - 1);
          if (fin - m < 5) return;
          const cr = { id: E.nouvelId('h'), jour: j, debut: hm(m), fin: hm(fin), branche: '', salle: '' };
          if (pinceau !== null) { cr.branche = pinceau; d.horaire.push(cr); ctx.modifie(); rendre(); return; }
          editer(cr, { nouveau: true });
        });
        g_.appendChild(col);
      }
      return g_;
    }

    function chevauche(c) {
      return d.horaire.some((x) => x !== c && Number(x.jour) === Number(c.jour) && mn(x.debut) < mn(c.fin) && mn(c.debut) < mn(x.fin));
    }
    function blocCreneau(c, pos) {
      const coul = PP.orga.couleurBranche(c.branche);
      const m = membre(c.enseignant);
      const court = pos.hauteur < 44;
      const etiquette = (c.branche || 'Branche à choisir') + ', ' + JOURS[c.jour].toLowerCase() + ' ' + PP.orga.plage(c) + (c.salle ? ', ' + c.salle : '') + (m ? ', ' + m.nom : '');
      const b = h('button', {
        type: 'button', class: 'hr-cr' + (c.branche ? '' : ' sans') + (court ? ' court' : '') + (chevauche(c) ? ' chevauche' : '') + (pinceau !== null ? ' peindre' : ''),
        style: { top: pos.top + 'px', height: pos.hauteur + 'px', '--bc': coul, left: 'calc(' + (pos.piste * 100 / pos.n) + '% + 3px)', width: 'calc(' + (100 / pos.n) + '% - 6px)' },
        title: etiquette + (chevauche(c) ? ' (chevauche un autre créneau)' : ''), 'aria-label': etiquette, dataset: { id: c.id },
        onclick: (ev) => { ev.stopPropagation(); cliquerCreneau(c); },
      },
      h('b', {}, c.branche || 'À choisir'),
      h('small', { class: 'num' }, c.debut + (court ? '' : ' à ' + c.fin) + (c.salle && !court && pos.hauteur < 62 ? ', ' + c.salle : '')),
      c.salle && !court && pos.hauteur >= 62 ? h('small', { class: 'hr-salle' }, c.salle) : null,
      m ? h('i', { class: 'hr-ens', style: { background: m.couleur || 'var(--muted)' }, title: m.nom }, PP.initiale(m.nom)) : null);
      return b;
    }

    function liste() {
      const l = h('div', { class: 'hr-liste' });
      const onglets = h('div', { class: 'hr-jours', role: 'tablist', 'aria-label': 'Jour' }, [1, 2, 3, 4, 5].map((j) => h('button', {
        type: 'button', role: 'tab', class: 'hr-jour-onglet' + (j === aujJ ? ' auj' : ''), 'aria-selected': String(j === jourListe),
        onclick: () => { jourListe = j; rendre(); },
      }, JOURS_C[j], h('small', { class: 'num' }, String(d.horaire.filter((c) => Number(c.jour) === j).length)))));
      const lignes = d.horaire.filter((c) => Number(c.jour) === jourListe);
      l.append(onglets,
        lignes.length ? h('ul', { class: 'hr-lignes' }, lignes.map((c) => {
          const m = membre(c.enseignant);
          return h('li', {}, h('button', { type: 'button', class: 'hr-ligne' + (c.branche ? '' : ' sans') + (chevauche(c) ? ' chevauche' : ''), style: { '--bc': PP.orga.couleurBranche(c.branche) }, dataset: { id: c.id }, onclick: () => cliquerCreneau(c) },
            h('span', { class: 'num hr-l-h' }, c.debut, h('small', {}, c.fin)),
            h('span', { class: 'hr-l-b' }, h('b', {}, c.branche || 'Branche à choisir'), c.salle ? h('small', {}, c.salle) : null),
            m ? h('i', { class: 'hr-ens', style: { background: m.couleur || 'var(--muted)' } }, PP.initiale(m.nom)) : null,
            h('span', { class: 'hr-l-chev', html: ico(pinceau !== null ? 'pinceau' : 'chevron') })));
        })) : h('p', { class: 'muted hr-l-vide' }, 'Pas de cours le ' + JOURS[jourListe].toLowerCase() + '.'),
        h('button', { type: 'button', class: 'btn hr-l-ajout', onclick: () => editer(null, { jour: jourListe }) }, h('span', { html: ico('plus') }), 'Ajouter un créneau le ' + JOURS[jourListe].toLowerCase()));
      return l;
    }

    function rendreBilan() {
      const parB = new Map();
      d.horaire.forEach((c) => { const k = c.branche || ''; const x = parB.get(k) || { n: 0, m: 0 }; x.n++; x.m += dureeMin(c); parB.set(k, x); });
      const l = Array.from(parB.entries()).sort((a, b) => b[1].m - a[1].m);
      bilan.replaceChildren(
        h('h3', { class: 'hr-bilan-t' }, 'Par branche'),
        h('ul', { class: 'hr-bilan-l' }, l.map(([b, x]) => h('li', { style: { '--bc': PP.orga.couleurBranche(b) } },
          h('i', { class: 'or-pt', style: { background: PP.orga.couleurBranche(b) } }),
          h('span', { class: 'hr-bilan-txt' }, h('b', {}, b || 'Sans branche'), h('small', { class: 'muted num' }, PP.pluriel(x.n, 'créneau', 'créneaux') + ', ' + PP.dureeTexte(x.m))),
          b && ctx.id() ? h('a', { class: 'pp-lien-discret hr-plan', href: '#', onclick: async (e) => { e.preventDefault(); const id = await ctx.assurerId(); if (id) PP.orga.creerPlanification({ id, titre: ctx.titre() }, b, null, true); } }, 'Planification') : null))));
    }

    /* ----- pinceau ----- */
    function basculerPinceau(v) {
      pinceau = v !== undefined ? v : pinceau === null ? (branchesUtilisees()[0] || proposees()[0] || '') : null;
      btnPinceau.setAttribute('aria-pressed', String(pinceau !== null));
      rendre();
      if (pinceau !== null) { const p = barrePinceau.querySelector('[aria-pressed="true"]'); if (p) p.focus(); }
    }
    function rendrePinceau() {
      barrePinceau.hidden = pinceau === null;
      racine.classList.toggle('hr-mode-pinceau', pinceau !== null);
      if (pinceau === null) { barrePinceau.replaceChildren(); return; }
      const autre = h('input', { class: 'input hr-p-autre', placeholder: 'Autre branche…', maxlength: '60', 'aria-label': 'Autre branche', list: 'hr-dl' });
      autre.addEventListener('change', () => { if (autre.value.trim()) { pinceau = autre.value.trim(); rendre(); } });
      const puce = (b, label) => h('button', { type: 'button', class: 'pp-puce hr-p-puce', 'aria-pressed': String(pinceau === b), style: { '--bc': b ? PP.orga.couleurBranche(b) : 'var(--faint)' }, onclick: () => { pinceau = b; rendre(); } },
        h('i', { class: 'or-pt', style: { background: b ? PP.orga.couleurBranche(b) : 'transparent' } }), label || b);
      barrePinceau.replaceChildren(
        h('p', { class: 'hr-p-txt' }, h('span', { html: ico('pinceau') }), h('span', {}, h('b', {}, 'Remplir vite' + NB + ': '), 'choisis une branche, puis clique sur les créneaux (ou dans une case vide pour en créer un).')),
        h('div', { class: 'hr-p-puces' }, proposees().map((b) => puce(b)), puce('', 'Effacer'), autre,
          h('datalist', { id: 'hr-dl' }, PP.orga.listeBranches(d.niveau).map((b) => h('option', { value: b })))),
        h('button', { type: 'button', class: 'btn btn-primary btn-sm hr-p-fin', onclick: () => basculerPinceau(null) }, h('span', { html: ico('check') }), 'Terminé'));
    }
    function cliquerCreneau(c) {
      if (pinceau !== null) { c.branche = pinceau; ctx.modifie(); rendre(); const b = racine.querySelector('.hr-cr[data-id="' + c.id + '"], .hr-ligne[data-id="' + c.id + '"]'); if (b && b.offsetParent) b.focus(); return; }
      editer(c, {});
    }

    /* ----- modèles ----- */
    function menuModeles(ancre) {
      PP.menu(ancre, PP.orga.MODELES_HORAIRE.map((m) => ({ label: m.nom, icone: 'horaire', fn: () => appliquerModele(m) }))
        .concat(d.horaire.length ? ['sep', { label: 'Tout effacer', icone: 'poubelle', danger: true, fn: toutEffacer }] : []));
    }
    async function appliquerModele(m) {
      if (d.horaire.length) {
        const ok = await UI.confirmer({ titre: 'Remplacer l’emploi du temps' + NB + '?', message: 'Les ' + PP.pluriel(d.horaire.length, 'créneau actuel sera remplacé', 'créneaux actuels seront remplacés') + ' par la grille ' + PP.guillemets(m.nom) + '.', ok: 'Remplacer' });
        if (!ok) return;
      }
      d.horaire = PP.orga.creneauxModele(m);
      ctx.modifie();
      pinceau = PP.orga.listeBranches(d.niveau)[0];
      btnPinceau.setAttribute('aria-pressed', 'true');
      rendre();
      UI.toast('Grille ' + PP.guillemets(m.nom) + ' posée : choisis une branche, puis clique sur ses créneaux.', { duree: 6000 });
    }
    async function toutEffacer() {
      const ancien = d.horaire.slice();
      d.horaire = [];
      ctx.modifie();
      rendre();
      UI.toast('Emploi du temps effacé.', { action: { label: 'Annuler', fn: () => { d.horaire = ancien; ctx.modifie(); rendre(); } } });
    }

    /* ----- édition d'un créneau ----- */
    async function editer(c, o) {
      o = o || {};
      const nouveau = !c || o.nouveau;
      const cr = Object.assign({ id: E.nouvelId('h'), jour: o.jour || 1, debut: '', fin: '', branche: '', salle: '' }, c || {});
      if (!c) {
        // à la suite du dernier créneau du jour, sinon 08:00
        const l = d.horaire.filter((x) => Number(x.jour) === Number(cr.jour));
        const fin = l.length ? Math.max(...l.map((x) => mn(x.fin))) : 8 * 60;
        cr.debut = hm(fin);
        cr.fin = hm(Math.min(fin + 45, 23 * 60 + 55));
      }
      const err = h('p', { class: 'pp-erreur', hidden: true, role: 'alert' });
      const listeId = 'hr-ed-dl';
      const branche = h('input', { class: 'input', id: 'hr-ed-branche', value: cr.branche || '', list: listeId, maxlength: '60', placeholder: 'Français, Mathématiques…', autocomplete: 'off' });
      const puces = h('div', { class: 'pp-puces hr-ed-puces' }, branchesUtilisees().slice(0, 12).map((b) => h('button', { type: 'button', class: 'pp-puce', 'aria-pressed': String(b === cr.branche), onclick: () => { branche.value = b; majPuces(); } }, h('i', { class: 'or-pt', style: { background: PP.orga.couleurBranche(b) } }), b)));
      const majPuces = () => puces.querySelectorAll('.pp-puce').forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === branche.value.trim())));
      branche.addEventListener('input', majPuces);
      let jour = Number(cr.jour) || 1;
      const jours = h('div', { class: 'hr-ed-jours', role: 'radiogroup', 'aria-label': 'Jour' }, [1, 2, 3, 4, 5].map((j) => h('button', { type: 'button', role: 'radio', class: 'pp-puce', 'aria-checked': String(j === jour), dataset: { j: String(j) }, onclick: () => { jour = j; jours.querySelectorAll('[role="radio"]').forEach((x) => x.setAttribute('aria-checked', String(Number(x.dataset.j) === j))); majCopies(); } }, JOURS_C[j])));
      const debut = h('input', { class: 'input num', type: 'time', id: 'hr-ed-debut', value: cr.debut, step: '300' });
      const fin = h('input', { class: 'input num', type: 'time', id: 'hr-ed-fin', value: cr.fin, step: '300' });
      const duree = (n) => h('button', { type: 'button', class: 'pp-puce', onclick: () => { const a = mn(debut.value); if (!isNaN(a)) fin.value = hm(Math.min(a + n, 23 * 60 + 55)); } }, n + ' min');
      const salle = h('input', { class: 'input', id: 'hr-ed-salle', value: cr.salle || '', maxlength: '40', placeholder: 'Salle 12, gymnase…' });
      const ens = membres().length > 1 ? h('select', { class: 'select', id: 'hr-ed-ens' }, h('option', { value: '' }, 'Le duo ou indifférent'), membres().map((m) => h('option', { value: m.uid, selected: m.uid === cr.enseignant ? true : null }, m.nom + (m.moi ? ' (toi)' : '')))) : null;
      const copies = new Set();
      const zoneCopies = h('div', { class: 'hr-ed-jours', role: 'group', 'aria-label': 'Copier aussi sur' });
      function majCopies() {
        copies.delete(jour);
        zoneCopies.replaceChildren(...[1, 2, 3, 4, 5].filter((j) => j !== jour).map((j) => h('button', { type: 'button', class: 'pp-puce', 'aria-pressed': String(copies.has(j)), onclick: (e) => { if (copies.has(j)) copies.delete(j); else copies.add(j); e.currentTarget.setAttribute('aria-pressed', String(copies.has(j))); } }, JOURS_C[j])));
      }
      majCopies();
      const contenu = h('div', { class: 'pp-form hr-ed' },
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'hr-ed-branche' }, 'Branche'), puces.childNodes.length ? puces : null, branche, h('datalist', { id: listeId }, PP.orga.listeBranches(d.niveau).map((b) => h('option', { value: b })))),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Jour'), jours),
        h('div', { class: 'hr-ed-heures' },
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'hr-ed-debut' }, 'Début'), debut),
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'hr-ed-fin' }, 'Fin'), fin),
          h('div', { class: 'pp-puces hr-ed-durees' }, duree(45), duree(90))),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'hr-ed-salle' }, 'Salle (facultatif)'), salle),
        ens ? h('div', { class: 'field' }, h('label', { class: 'label', for: 'hr-ed-ens' }, 'Enseignant·e du duo'), ens) : null,
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Copier aussi sur'), zoneCopies, h('p', { class: 'hint' }, 'Mêmes heures, même branche, sur les jours choisis.')),
        err);
      const actions = [];
      if (!nouveau) actions.push({ label: 'Supprimer', danger: true, valeur: 'supprimer' });
      actions.push({ label: 'Annuler', valeur: null });
      actions.push({ label: nouveau ? 'Ajouter' : 'Enregistrer', primaire: true, valeur: () => {
        const a = mn(debut.value), b = mn(fin.value);
        if (isNaN(a) || isNaN(b)) { err.hidden = false; err.textContent = 'Indique l’heure de début et l’heure de fin.'; return undefined; }
        if (b <= a) { err.hidden = false; err.textContent = 'La fin doit venir après le début.'; fin.focus(); return undefined; }
        return 'ok';
      } });
      const v = await UI.dialogue({ titre: nouveau ? 'Nouveau créneau' : 'Modifier le créneau', contenu, actions });
      if (v === 'supprimer') {
        const i = d.horaire.indexOf(c);
        if (i >= 0) d.horaire.splice(i, 1);
        ctx.modifie();
        rendre();
        UI.toast('Créneau retiré.', { action: { label: 'Annuler', fn: () => { d.horaire.push(c); ctx.modifie(); rendre(); } } });
        return;
      }
      if (v !== 'ok') return;
      const valeurs = { jour, debut: debut.value, fin: fin.value, branche: branche.value.trim(), salle: salle.value.trim() };
      if (ens) valeurs.enseignant = ens.value || undefined;
      let cible = c && !o.nouveau ? c : null;
      if (cible) Object.assign(cible, valeurs);
      else { cible = Object.assign({ id: cr.id }, valeurs); d.horaire.push(cible); }
      if (cible.enseignant === undefined) delete cible.enseignant;
      copies.forEach((j) => d.horaire.push(Object.assign({}, cible, { id: E.nouvelId('h'), jour: j })));
      ctx.modifie();
      jourListe = jour;
      rendre();
      if (copies.size) UI.toast('Créneau copié sur ' + PP.pluriel(copies.size, 'autre jour', 'autres jours') + '.');
    }

    rendre();
    return { el: racine, rendre, fermer() { pinceau = null; } };
  }

  /* =============================== calendrier =============================== */
  const CANTONS = [['VS', 'Valais (partie francophone)'], ['GE', 'Genève'], ['FR', 'Fribourg'], ['autre', 'Autre canton ou calendrier propre']];

  function panneauCalendrier(ctx) {
    const d = ctx.d;
    const racine = h('section', { class: 'cal', 'aria-labelledby': 'cal-t' });
    const anneeCourante = C().anneeScolaire();
    if (!d.annee) d.annee = anneeCourante;
    const canton = h('select', { class: 'select', id: 'cal-canton' }, CANTONS.map(([v, l]) => h('option', { value: v, selected: (d.canton || 'VS') === v ? true : null }, l)));
    const y = Number(anneeCourante.slice(0, 4));
    const annees = Array.from(new Set([y - 1 + '-' + y, anneeCourante, y + 1 + '-' + (y + 2), d.annee])).sort();
    const annee = h('select', { class: 'select', id: 'cal-annee' }, annees.map((a) => h('option', { value: a, selected: a === d.annee ? true : null }, a)));
    const resume = h('div', { class: 'cal-resume' });
    const bande = h('div', { class: 'cal-bande-zone' });
    const conges = h('div', { class: 'cal-conges' });
    canton.addEventListener('change', () => {
      d.canton = canton.value;
      if (d.canton === 'autre') assurerPerso();
      ctx.modifie();
      rendre();
    });
    annee.addEventListener('change', () => { d.annee = annee.value; ctx.modifie(); rendre(); });
    racine.append(
      h('div', { class: 'pp-panneau-tete' }, h('div', {}, h('h2', { class: 'pp-h2', id: 'cal-t' }, 'Calendrier scolaire'), h('p', { class: 'muted hr-sous' }, 'Rentrée, vacances et jours fériés : les semaines de classe de la planification et du plan de la semaine en dépendent.'))),
      h('div', { class: 'cal-choix' },
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'cal-canton' }, 'Canton'), canton),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'cal-annee' }, 'Année scolaire'), annee)),
      resume, bande, conges);

    const perso = () => d.calendrierPerso && d.calendrierPerso[d.annee] && d.calendrierPerso[d.annee].rentree ? d.calendrierPerso[d.annee] : null;
    const officiel = () => { const c = C().CANTONS[d.canton || 'VS']; return c && c.annees[d.annee] && !c.annees[d.annee].incomplet ? c.annees[d.annee] : null; };
    function assurerPerso() {
      if (perso()) return perso();
      const base = C().calendrier({ canton: d.canton, annee: d.annee }, d.annee);
      d.calendrierPerso = d.calendrierPerso || {};
      d.calendrierPerso[d.annee] = { rentree: base.rentree, fin: base.fin || C().ajouterJours(base.rentree, 7 * 44 - 3), conges: (base.conges || []).map((x) => Object.assign({}, x)) };
      return d.calendrierPerso[d.annee];
    }

    function rendre() {
      const cal = C().calendrier(d, d.annee);
      const sem = C().semaines(cal);
      const nCours = sem.filter((w) => w.numero).length;
      const p = perso();
      resume.replaceChildren(
        h('dl', { class: 'cal-chiffres' },
          h('div', {}, h('dt', {}, 'Rentrée'), h('dd', {}, cal.rentree ? PP.majuscule(C().format(cal.rentree)) : 'à préciser')),
          h('div', {}, h('dt', {}, 'Fin de l’année'), h('dd', {}, cal.fin ? PP.majuscule(C().format(cal.fin)) : 'à préciser')),
          h('div', {}, h('dt', {}, 'Semaines de classe'), h('dd', { class: 'num' }, String(nCours)))),
        h('p', { class: 'hint cal-source' }, p ? 'Calendrier personnalisé pour ' + d.annee + '.' : cal.incomplet ? (cal.source || 'Calendrier à compléter.') + ' Complète-le ci-dessous.' : 'Source : ' + (cal.source || 'calendrier officiel') + '. Les congés communaux s’ajoutent en corrigeant une date.'));
      bande.replaceChildren(bandeAnnee(cal, sem));
      rendreConges(cal, p);
    }

    function bandeAnnee(cal, sem) {
      const auj = C().aujourdhui();
      const lAuj = C().lundi(auj);
      const zone = h('div', { class: 'cal-bande', role: 'img', 'aria-label': 'Année scolaire ' + d.annee + ' : ' + sem.filter((w) => w.numero).length + ' semaines de classe' });
      let moisPrec = -1;
      sem.forEach((w) => {
        const dt = C().date(w.lundi);
        const mois = dt.getMonth();
        const nouveauMois = mois !== moisPrec;
        moisPrec = mois;
        zone.appendChild(h('span', {
          class: 'cal-sem ' + w.statut + (w.lundi === lAuj ? ' auj' : '') + (nouveauMois ? ' mois' : ''),
          title: (w.numero ? 'Semaine de classe ' + w.numero : 'Vacances') + ', du ' + C().format(w.lundi, { annee: false }) + (w.conges.length ? ' : ' + w.conges.join(', ') : '') + (w.statut === 'partielle' ? ' (' + PP.pluriel(w.jours, 'jour', 'jours') + ' de classe)' : ''),
          dataset: nouveauMois ? { mois: MOIS_COURTS[mois], m: MOIS_COURTS[mois].charAt(0).toUpperCase() } : {},
        }));
      });
      return h('div', { class: 'cal-bande-cadre' }, zone,
        h('p', { class: 'cal-legende' }, [['cours', 'Semaine de classe'], ['partielle', 'Semaine avec congé'], ['vacances', 'Vacances'], ['auj', 'Cette semaine']].map(([k, l]) => h('span', { class: 'cal-li' }, h('span', { class: 'cal-l ' + k }), l))));
    }

    function rendreConges(cal, p) {
      const off = officiel();
      if (!p) {
        conges.replaceChildren(
          h('div', { class: 'pp-panneau-tete' }, h('h3', { class: 'cal-h3' }, 'Congés et vacances'),
            h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { assurerPerso(); ctx.modifie(); rendre(); const x = conges.querySelector('input'); if (x) x.focus(); } }, h('span', { html: ico('crayon') }), 'Corriger une date')),
          (cal.conges || []).length ? h('ul', { class: 'cal-liste' }, cal.conges.map((x) => h('li', {}, h('b', {}, x.nom), h('span', { class: 'muted' }, texteConge(x))))) : h('p', { class: 'muted' }, 'Aucun congé connu pour cette année. Corrige le calendrier pour les ajouter.'));
        return;
      }
      const lignes = h('ul', { class: 'cal-edit' });
      const rentree = h('input', { class: 'input', type: 'date', id: 'cal-rentree', value: p.rentree || '' });
      const fin = h('input', { class: 'input', type: 'date', id: 'cal-fin', value: p.fin || '' });
      rentree.addEventListener('change', () => { if (rentree.value) { p.rentree = rentree.value; ctx.modifie(); rendreLeger(); } });
      fin.addEventListener('change', () => { p.fin = fin.value || null; ctx.modifie(); rendreLeger(); });
      function ligne(x) {
        const nom = h('input', { class: 'input', value: x.nom || '', maxlength: '60', 'aria-label': 'Nom du congé', placeholder: 'Nom du congé' });
        const de = h('input', { class: 'input', type: 'date', value: x.debut || '', 'aria-label': 'Premier jour' });
        const a = h('input', { class: 'input', type: 'date', value: x.fin || '', 'aria-label': 'Dernier jour' });
        const demi = h('input', { type: 'checkbox', checked: x.demiDebut ? true : null });
        nom.addEventListener('input', () => { x.nom = nom.value; ctx.modifie(); });
        de.addEventListener('change', () => { x.debut = de.value; if (!x.fin || x.fin < x.debut) { x.fin = de.value; a.value = de.value; } ctx.modifie(); rendreLeger(); });
        a.addEventListener('change', () => { x.fin = a.value; ctx.modifie(); rendreLeger(); });
        demi.addEventListener('change', () => { if (demi.checked) x.demiDebut = true; else delete x.demiDebut; ctx.modifie(); rendreLeger(); });
        return h('li', { class: 'cal-ligne' }, nom, h('span', { class: 'cal-dates' }, de, h('span', { class: 'muted' }, 'au'), a),
          h('label', { class: 'cal-demi' }, demi, h('span', {}, 'École le matin du premier jour')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', title: 'Retirer ce congé', 'aria-label': 'Retirer ' + (x.nom || 'ce congé'), html: ico('poubelle'), onclick: () => { p.conges.splice(p.conges.indexOf(x), 1); ctx.modifie(); rendre(); } }));
      }
      (p.conges || []).slice().sort((x, y) => (x.debut || '').localeCompare(y.debut || '')).forEach((x) => lignes.appendChild(ligne(x)));
      conges.replaceChildren(
        h('div', { class: 'cal-bornes' },
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'cal-rentree' }, 'Rentrée'), rentree),
          h('div', { class: 'field' }, h('label', { class: 'label', for: 'cal-fin' }, 'Dernier jour'), fin)),
        h('div', { class: 'pp-panneau-tete' }, h('h3', { class: 'cal-h3' }, 'Congés et vacances'),
          h('div', { class: 'pp-boutons' },
            h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { p.conges = p.conges || []; const base = p.conges.length ? p.conges[p.conges.length - 1].fin : p.rentree; const x = { nom: '', debut: base || '', fin: base || '' }; p.conges.push(x); ctx.modifie(); rendre(); const ins = conges.querySelectorAll('.cal-ligne input:not([type])'); const dern = Array.from(ins).find((i) => !i.value); if (dern) dern.focus(); } }, h('span', { html: ico('plus') }), 'Ajouter un congé'),
            off ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: async () => {
              const ok = await UI.confirmer({ titre: 'Revenir au calendrier officiel' + NB + '?', message: 'Tes corrections pour ' + d.annee + ' seront oubliées.', ok: 'Revenir au calendrier officiel' });
              if (!ok) return;
              delete d.calendrierPerso[d.annee];
              ctx.modifie();
              rendre();
            } }, 'Revenir au calendrier officiel') : null)),
        lignes.childNodes.length ? lignes : h('p', { class: 'muted' }, 'Aucun congé : ajoute les vacances et les jours fériés de ton école.'));
    }
    function rendreLeger() {
      const cal = C().calendrier(d, d.annee);
      const sem = C().semaines(cal);
      bande.replaceChildren(bandeAnnee(cal, sem));
      const dd = resume.querySelectorAll('dd');
      if (dd.length === 3) {
        dd[0].textContent = cal.rentree ? PP.majuscule(C().format(cal.rentree)) : 'à préciser';
        dd[1].textContent = cal.fin ? PP.majuscule(C().format(cal.fin)) : 'à préciser';
        dd[2].textContent = String(sem.filter((w) => w.numero).length);
      }
    }
    function texteConge(x) {
      if (!x.debut) return '';
      if (x.debut === x.fin || !x.fin) return PP.majuscule(C().format(x.debut, { annee: false })) + (x.demiDebut ? ', dès midi' : '');
      return 'Du ' + C().format(x.debut, { annee: false }) + (x.demiDebut ? ' à midi' : '') + ' au ' + C().format(x.fin, { annee: false });
    }

    rendre();
    return { el: racine, rendre };
  }

  /* =============================== devoirs pour les familles =============================== */
  function panneauFamilles(ctx) {
    const racine = h('section', { class: 'fam', 'aria-labelledby': 'fam-t' });
    const etat = h('div', { class: 'fam-etat' });
    racine.append(
      h('div', { class: 'pp-panneau-tete' }, h('div', {}, h('h2', { class: 'pp-h2', id: 'fam-t' }, 'Devoirs pour les familles'),
        h('p', { class: 'muted hr-sous' }, 'Une page simple, lisible sur téléphone et sans compte, avec les devoirs de la classe : la semaine passée et les trois semaines à venir. Elle ne montre que le nom de la classe, les branches et les devoirs.'))),
      h('p', { class: 'pp-note pp-note-attention fam-rappel' }, h('span', { html: ico('attention') }), h('span', {}, h('b', {}, 'N’écris jamais de nom d’élève dans les devoirs.'), ' Toute personne qui a le lien peut lire la page.')),
      etat);

    async function charger() {
      if (E.mode() !== 'compte') {
        etat.replaceChildren(h('div', { class: 'pp-vide' }, h('span', { class: 'pp-vide-ico', html: ico('globe') }),
          h('p', { class: 'pp-vide-titre' }, 'La page des familles demande un compte'),
          h('p', { class: 'muted' }, 'Elle est servie par le serveur de l’Établi. Crée un compte gratuit : tes documents d’essai te suivent.'),
          h('a', { class: 'btn btn-primary', href: '#inscription' }, 'Créer un compte')));
        return;
      }
      if (!E.publications) {
        etat.replaceChildren(h('p', { class: 'pp-note' }, h('span', { html: ico('attention') }), h('span', {}, 'La publication des devoirs n’est pas encore disponible sur ce serveur.')));
        return;
      }
      const id = ctx.id();
      if (!id) {
        etat.replaceChildren(h('p', { class: 'muted' }, 'Donne d’abord un nom à la classe : elle s’enregistre, puis tu pourras activer le lien.'));
        return;
      }
      etat.replaceChildren(h('p', { class: 'muted' }, 'Chargement…'));
      let liste = [];
      try { const r = await E.publications.lister(id); liste = Array.isArray(r) ? r : (r && r.publications) || []; }
      catch (e) { etat.replaceChildren(h('p', { class: 'pp-erreur' }, PP.messageErreur(e))); return; }
      rendre(liste);
    }
    const urlDe = (p) => {
      if (!p) return '';
      const u = p.url || (p.jeton ? '/devoirs/' + p.jeton : '');
      return /^https?:/.test(u) ? u : u ? location.origin + u : '';
    };
    function rendre(liste) {
      const actives = liste.filter((p) => p && !p.retire);
      if (!actives.length) {
        etat.replaceChildren(h('div', { class: 'fam-off' },
          h('p', {}, 'Aucun lien actif pour l’instant. Tu choisis à qui tu le donnes : message aux parents, QR code sur la porte, agenda.'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: activer }, h('span', { html: ico('globe') }), 'Activer le lien pour les familles')));
        return;
      }
      etat.replaceChildren(...actives.map((p) => carteLien(p)));
    }
    function carteLien(p) {
      const url = urlDe(p);
      const champ = h('input', { class: 'input fam-url', readonly: true, value: url || 'Lien actif', 'aria-label': 'Adresse de la page des familles' });
      champ.addEventListener('focus', () => champ.select());
      return h('div', { class: 'fam-lien' },
        url ? h('div', { class: 'fam-qr', html: PP.qrSvg(url, { label: 'QR code de la page des devoirs' }) }) : null,
        h('div', { class: 'fam-lien-txt' },
          h('p', { class: 'fam-actif' }, h('i', { class: 'or-pt', style: { background: 'var(--ok)' } }), 'Lien actif' + (p.cree ? ', créé ' + UI.dateRelative(p.cree) : '')),
          champ,
          h('div', { class: 'pp-boutons' },
            url ? h('button', { type: 'button', class: 'btn', onclick: async () => { const ok = await PP.copier(url); UI.toast(ok ? 'Lien copié.' : 'Copie impossible : sélectionne le lien et copie-le à la main.', ok ? {} : { ton: 'erreur' }); } }, h('span', { html: ico('copie') }), 'Copier le lien') : null,
            url ? h('a', { class: 'btn btn-ghost', href: url, target: '_blank', rel: 'noopener' }, h('span', { html: ico('projeter') }), 'Voir la page') : null,
            h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: () => retirer(p) }, h('span', { html: ico('fermer') }), 'Retirer le lien')),
          h('p', { class: 'hint' }, 'Retirer le lien le désactive aussitôt : les familles verront un message. Tu pourras en créer un nouveau.')));
    }
    async function activer(ev) {
      const b = ev && ev.currentTarget;
      if (b) b.disabled = true;
      try {
        const id = await ctx.assurerId();
        await E.publications.creer({ classeId: id });
        UI.toast('Lien activé. Donne-le aux familles.');
        await charger();
      } catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); if (b) b.disabled = false; }
    }
    async function retirer(p) {
      const ok = await UI.confirmer({ titre: 'Retirer le lien' + NB + '?', message: 'Les familles qui l’ont ne verront plus les devoirs. Tu pourras créer un nouveau lien, différent.', ok: 'Retirer le lien', danger: true });
      if (!ok) return;
      try { await E.publications.retirer(p.jeton || p.id); UI.toast('Lien retiré.'); await charger(); }
      catch (e) { UI.toast(PP.messageErreur(e), { ton: 'erreur' }); }
    }
    charger();
    return { el: racine, rendre: charger };
  }

  PP.horaire = { panneau: panneauHoraire };
  PP.calendrierClasse = { panneau: panneauCalendrier };
  PP.familles = { panneau: panneauFamilles };
})(window);
