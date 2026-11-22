/*
 * L'Établi : badges imprimables des élèves (/badges/?classe=<id>&espace=), feuilles A4 de 8 ou 10 badges.
 * Chaque badge : prénom, code de la classe, mot secret, consignes courtes et QR code de connexion directe
 * (https://<hôte>/eleve/#b=<code>.<eleveId>.<mot secret>).
 *
 * Les mots secrets ne sont jamais relisibles sur le serveur : le pupitre les dépose dans sessionStorage
 * (clé « etabli.badges ») juste après leur création ou leur régénération, puis ouvre cette page dans le même
 * onglet. La page les lit et les efface aussitôt : ils ne vivent plus qu'en mémoire, le temps d'imprimer.
 */
(function () {
  'use strict';
  const CLE = 'etabli.badges';
  const NB = ' ';
  const VALIDITE = 30 * 60000;

  // lecture et effacement immédiats, avant tout le reste
  let donnees = null;
  try {
    const brut = sessionStorage.getItem(CLE);
    sessionStorage.removeItem(CLE);
    donnees = brut ? JSON.parse(brut) : null;
  } catch (e) { donnees = null; }

  const E = window.Etabli, UI = window.EtabliUI;
  const ecran = document.getElementById('ecran');
  const apercu = document.getElementById('apercu');

  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') { for (const s in v) { if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; } }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) ajouter(el, arguments[i]);
    return el;
  }
  function ajouter(el, x) {
    if (x == null || x === false) return;
    if (Array.isArray(x)) { x.forEach((y) => ajouter(el, y)); return; }
    el.appendChild(typeof x === 'string' || typeof x === 'number' ? document.createTextNode(String(x)) : x);
  }
  const ico = (n) => UI.icone(n);
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);
  const codeBrut = (c) => String(c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const formatCode = (c) => { const s = codeBrut(c); return s.length === 6 ? s.slice(0, 3) + '-' + s.slice(3) : s; };
  const lienBadge = (code, eleveId, secret) => location.origin + '/eleve/#b=' + [codeBrut(code), eleveId, secret].map((x) => encodeURIComponent(String(x || ''))).join('.');
  const adresse = () => location.host + '/eleve';

  /** QR code en SVG (bibliothèque /js/vendor/qrcode.js), correction M, marge de 2 modules. */
  function qrSvg(texte, label) {
    if (!window.qrcode) return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(texte);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += 'M' + (x + 2) + ' ' + (y + 2) + 'h1v1h-1z';
    const t = n + 4;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges" role="img" aria-label="' + UI.esc(label) + '"><rect width="' + t + '" height="' + t + '" fill="#fff"/><path d="' + d + '" fill="#141A1E"/></svg>';
  }

  async function demarrer() {
    const classeId = E.param('classe');
    const barre = UI.barre({ titre: 'Badges des élèves', type: 'classe' });
    barre.el.classList.add('bd-barre');
    await E.pret;
    const urlClasse = classeId ? (E.urlOutil ? E.urlOutil('classe', classeId) : '/#classes/' + encodeURIComponent(classeId)) + '/comptes' : '/#classes';
    barre.actions.appendChild(h('a', { class: 'btn btn-sm btn-ghost', href: urlClasse }, h('span', { html: ico('retour') }), h('span', {}, 'Retour à la classe')));
    const valides = donnees && donnees.classeId === classeId && Array.isArray(donnees.comptes) && donnees.comptes.length && Date.now() - (donnees.cree || 0) < VALIDITE;
    if (!valides) {
      donnees = null;
      document.title = 'Badges des élèves · L’Établi';
      ecran.replaceChildren(h('div', { class: 'bd-vide' },
        h('span', { class: 'bd-vide-ico', html: ico('badge') }),
        h('h1', {}, 'Pas de badges à imprimer'),
        h('p', {}, 'Les mots secrets des élèves ne sont jamais gardés : ils passent par cette page une seule fois, juste après leur création. Pour imprimer ou réimprimer des badges, crée de nouveaux mots secrets depuis la classe, onglet ' + '« ' + NB + 'Élèves en ligne' + NB + '».'),
        h('a', { class: 'btn btn-primary', href: urlClasse }, h('span', { html: ico('eleve') }), classeId ? 'Ouvrir les comptes de la classe' : 'Mes classes')));
      return;
    }
    const comptes = donnees.comptes.filter((k) => k && k.secret);
    const code = donnees.code;
    const titre = donnees.titre || 'Classe';
    barre.setTitre('Badges · ' + titre);
    const format = h('select', { class: 'select', id: 'bd-format' },
      h('option', { value: '8' }, '8 badges par page A4 (grands)'),
      h('option', { value: '10' }, '10 badges par page A4'));
    const resume = h('p', { class: 'bd-resume', role: 'status' });
    const imprimer = h('button', { type: 'button', class: 'btn btn-primary bd-imprimer', onclick: () => window.print() }, h('span', { html: ico('imprimer') }), h('span', {}, 'Imprimer'));
    ecran.replaceChildren(
      h('div', { class: 'bd-intro' },
        h('div', {},
          h('p', { class: 'eyebrow' }, titre + ' · Élèves en ligne'),
          h('h1', {}, comptes.length > 1 ? 'Badges à imprimer' : 'Badge de ' + comptes[0].prenom),
          h('p', {}, 'Chaque élève reçoit son badge : en scannant le QR code avec une tablette ou un téléphone, elle ou il est connecté·e directement. Sans appareil photo : ', h('b', {}, adresse()), ', le code de la classe, son prénom et son mot secret.')),
        h('div', { class: 'bd-code' }, h('span', {}, 'Code de la classe'), h('b', { class: 'num' }, formatCode(code)))),
      h('div', { class: 'bd-alerte', role: 'note' }, h('span', { html: ico('cle') }),
        h('p', {}, h('b', {}, 'Imprime maintenant. '), 'Ces mots secrets ne s’afficheront plus : si tu quittes ou recharges cette page, il faudra en créer de nouveaux depuis la classe. Range les badges comme une clé : chaque élève garde le sien.')),
      h('div', { class: 'bd-reglages' },
        h('label', { class: 'field' }, h('span', {}, 'Format'), format),
        imprimer,
        h('a', { class: 'btn btn-ghost bd-retour', href: urlClasse }, h('span', { html: ico('retour') }), h('span', {}, 'Retour à la classe'))),
      resume);

    function badge(k) {
      const lien = lienBadge(code, k.eleveId, k.secret);
      return h('div', { class: 'bd-badge', dataset: { compte: k.id || '', eleve: k.eleveId || '' } },
        h('div', { class: 'bd-qr', html: qrSvg(lien, 'QR code de connexion de ' + k.prenom) }),
        h('div', { class: 'bd-txt' },
          h('p', { class: 'bd-prenom' }, k.prenom),
          h('p', { class: 'bd-ligne' }, h('span', {}, 'Classe'), h('b', { class: 'bd-code-v' }, formatCode(code))),
          h('p', { class: 'bd-ligne' }, h('span', {}, 'Mot secret'), h('b', { class: 'bd-secret' }, k.secret)),
          h('ol', { class: 'bd-consignes' },
            h('li', {}, 'Scanne le QR code.'),
            h('li', {}, 'Ou va sur ', h('b', {}, adresse()), ', tape le code de la classe, choisis ton prénom et écris ton mot secret.')),
          h('p', { class: 'bd-pied' }, 'Garde ce badge pour toi.')));
    }
    function dessiner() {
      const parPage = Number(format.value) || 8;
      const feuilles = [];
      for (let i = 0; i < comptes.length; i += parPage) {
        const lot = comptes.slice(i, i + parPage).map(badge);
        while (lot.length < parPage) lot.push(h('div', { class: 'bd-badge vide' }));
        feuilles.push(h('div', { class: 'bd-cadre' }, h('div', { class: 'bd-feuille f' + parPage }, lot)));
      }
      resume.replaceChildren(h('b', {}, pluriel(comptes.length, 'badge', 'badges')), ', ' + pluriel(feuilles.length, 'page', 'pages') + ' A4. Imprime à 100' + NB + '% (taille réelle), puis découpe le long des pointillés.');
      const largeur = Math.min(window.innerWidth, 1120) - 32;
      const parLigne = largeur > 900 ? 3 : largeur > 560 ? 2 : 1;
      const z = Math.max(0.3, Math.min(0.5, (largeur - 20 * (parLigne - 1)) / parLigne / 794));
      apercu.style.setProperty('--z', z);
      apercu.replaceChildren(...feuilles);
    }
    format.addEventListener('change', dessiner);
    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(dessiner, 150); });
    dessiner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
