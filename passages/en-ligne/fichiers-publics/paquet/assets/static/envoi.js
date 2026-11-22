// Bouton « Envoyer à ma bibliothèque » : un favori qui, sur la page d'un article, lit le PDF avec les accès du navigateur
// (abonnement de l'université, sites gratuits protégés contre les robots) et l'ajoute à la fiche, après confirmation ici.
import { esc, api, toast } from './core.js';

// le code du favori : il tourne sur la page de l'éditeur, ouvre une petite fenêtre de la bibliothèque et lui passe le PDF
export function bookmarklet(origin) {
  const code = `(async()=>{const O=${JSON.stringify(origin)};
const w=window.open(O+'/#recevoir','passages','width=620,height=780');
let ready=false,data=null;const send=()=>{if(ready&&data&&w&&!w.closed){w.postMessage(data,O,data.bytes?[data.bytes]:[]);data=null}};
addEventListener('message',e=>{if(e.source===w&&e.data&&e.data.type==='passages-ready'){ready=true;send()}});
const q=n=>{const m=document.querySelector('meta[name="'+n+'" i],meta[property="'+n+'" i]');return m?m.content||'':''};
const qa=n=>[...document.querySelectorAll('meta[name="'+n+'" i]')].map(x=>x.content).filter(Boolean);
const isPdf=document.contentType==='application/pdf';
const pdf=isPdf?location.href:(q('citation_pdf_url')||[...document.querySelectorAll('a[href]')].map(a=>a.href).find(h=>/\\.pdf([?#]|$)|\\/pdf\\/|\\/epdf\\/|download/i.test(h))||'');
const meta={doi:(q('citation_doi')||q('prism.doi')||q('dc.identifier')||'').replace(/^(doi:\\s*|https?:\\/\\/(dx\\.)?doi\\.org\\/)/i,''),title:q('citation_title')||q('dc.title')||document.title,authors:qa('citation_author'),date:q('citation_publication_date')||q('citation_date')||q('citation_online_date')||q('dc.date'),journal:q('citation_journal_title')||q('citation_conference_title'),volume:q('citation_volume'),issue:q('citation_issue'),first:q('citation_firstpage'),last:q('citation_lastpage'),publisher:q('citation_publisher')||q('dc.publisher'),page:location.href,pdf};
let bytes=null,error='';
if(!pdf)error='Je n’ai pas trouvé de lien vers le PDF sur cette page.';
else{try{const r=await fetch(pdf,{credentials:'include'});const b=await r.arrayBuffer();if(String.fromCharCode(...new Uint8Array(b.slice(0,1024))).includes('%PDF'))bytes=b;else error='Le lien du PDF renvoie une page et non le fichier (accès refusé ou vérification du site).'}catch(e){error='Le navigateur n’a pas pu lire le PDF depuis cette page.'}}
data={type:'passages-pdf',meta,bytes,error};send();})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

// ---------- installation du favori ----------
export function openSendDialog() {
  const d = document.createElement('dialog');
  d.className = 'narrow';
  d.innerHTML = `<div class="dlg-head"><h2>Envoyer à ma bibliothèque</h2><button class="btn ghost" data-x aria-label="Fermer">✕</button></div>
    <div class="dlg-body">
      <p>Un bouton à mettre dans la barre de favoris de ton navigateur. Sur la page d’un article, il récupère le PDF <b>avec tes propres accès</b> (abonnements de l’université, sites gratuits qui bloquent les robots comme OpenEdition, Érudit ou Cairn) et l’ajoute à la bonne fiche.</p>
      <p class="send-bm"><a class="btn primary" id="bmLink" href="${bookmarklet(location.origin)}">Envoyer à ma bibliothèque</a></p>
      <ol>
        <li>Affiche la barre de favoris : Ctrl + Maj + B (Cmd + Maj + B sur Mac).</li>
        <li>Fais glisser le bouton ci-dessus dans cette barre.</li>
        <li>Sur la page d’un article (pas sur le PDF ouvert lui-même), clique sur le favori. Une petite fenêtre de ta bibliothèque s’ouvre : vérifie la référence et confirme.</li>
      </ol>
      <p class="note">Le PDF passe directement de ton navigateur à ta bibliothèque. Si la fenêtre ne s’ouvre pas, autorise les fenêtres surgissantes pour ce site.</p>
    </div>`;
  document.body.append(d);
  d.showModal();
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) return d.close();
    if (e.target.closest('#bmLink')) {
      e.preventDefault();
      toast('Fais glisser ce bouton dans ta barre de favoris, puis utilise-le sur la page d’un article.');
    }
  });
}

// ---------- réception dans la petite fenêtre ----------
const normTitle = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function findItem(meta) {
  if (meta.doi) {
    const { items } = await api(`/api/items?${new URLSearchParams({ q: meta.doi, limit: 5 })}`);
    const hit = items.find((i) => (i.doi || '').toLowerCase() === meta.doi.toLowerCase());
    if (hit) return hit;
  }
  if (meta.title) {
    const { items } = await api(`/api/items?${new URLSearchParams({ q: meta.title.slice(0, 80), limit: 10 })}`);
    const t = normTitle(meta.title);
    const hit = items.find((i) => normTitle(i.title) === t);
    if (hit) return hit;
  }
  return null;
}

async function createItem(meta) {
  if (meta.doi) {
    const r = await api('/api/items', { method: 'POST', body: { doi: meta.doi } }).catch(() => null);
    if (r?.item) return r.item;
  }
  const year = (String(meta.date || '').match(/\d{4}/) || [])[0] || null;
  const pages = meta.first ? `${meta.first}${meta.last ? `-${meta.last}` : ''}` : null;
  const r = await api('/api/items', {
    method: 'POST',
    body: {
      item_type: meta.journal ? 'article' : 'webpage', title: meta.title || 'Sans titre', authors: meta.authors || [], year,
      container: meta.journal || null, volume: meta.volume || null, issue: meta.issue || null, pages, publisher: meta.publisher || null, url: meta.page || null,
    },
  });
  return r.item;
}

export function receive({ indexInBrowser = null, onDone = () => {} } = {}) {
  const d = document.createElement('dialog');
  d.className = 'narrow receive';
  d.innerHTML = `<div class="dlg-head"><h2>Envoyer à ma bibliothèque</h2></div><div class="dlg-body" id="rcvBody"><p class="note">En attente du PDF envoyé par la page de l’article…</p></div>`;
  document.body.append(d);
  d.showModal();
  const body = d.querySelector('#rcvBody');
  if (!window.opener) {
    body.innerHTML = '<p>Cette fenêtre s’ouvre avec le bouton « Envoyer à ma bibliothèque », depuis la page d’un article. Pour l’installer : menu ⋯ › Bouton « Envoyer à ma bibliothèque ».</p>';
    return;
  }
  const ping = setInterval(() => {
    try {
      window.opener?.postMessage({ type: 'passages-ready' }, '*');
    } catch {}
  }, 700);
  setTimeout(() => clearInterval(ping), 120000);

  window.addEventListener('message', async (e) => {
    if (e.source !== window.opener || e.data?.type !== 'passages-pdf') return;
    clearInterval(ping);
    const { meta = {}, bytes, error } = e.data;
    const fromSite = (() => {
      try {
        return new URL(meta.page).host;
      } catch {
        return 'la page';
      }
    })();
    const existing = await findItem(meta).catch(() => null);
    const refHtml = existing
      ? `<p><b>${esc(existing.title)}</b><br><span class="note">Fiche existante${existing.has_pdf ? ' · elle a déjà un PDF' : ' · sans PDF pour l’instant'}</span></p>`
      : `<p><b>${esc(meta.title || 'Sans titre')}</b><br><span class="note">${meta.doi ? `DOI ${esc(meta.doi)} · ` : ''}nouvelle fiche</span></p>`;
    if (!bytes) {
      body.innerHTML = `${refHtml}<p class="err-box">${esc(error || 'Aucun PDF reçu.')}</p>
        ${meta.pdf ? '<p class="note">Je peux essayer de le télécharger depuis le serveur de ta bibliothèque, sans tes accès : ça marche pour les PDF vraiment publics.</p><div class="row"><button class="btn" id="rcvServer">Essayer depuis le serveur</button></div>' : ''}`;
    } else {
      const kb = Math.round(bytes.byteLength / 1024);
      body.innerHTML = `${refHtml}<p class="note">PDF reçu de ${esc(fromSite)} (${kb > 1024 ? `${(kb / 1024).toFixed(1)} Mo` : `${kb} ko`}).</p>
        <div class="row"><button class="btn primary" id="rcvGo">${existing?.has_pdf ? 'Remplacer le PDF de cette fiche' : 'Ajouter à ma bibliothèque'}</button><button class="btn ghost" id="rcvNo">Annuler</button></div>`;
    }
    const finish = async (id, via) => {
      body.innerHTML = '<p class="note">Lecture du texte pour la recherche…</p>';
      let indexed = true;
      try {
        await api(`/api/items/${id}/index`, { method: 'POST' });
      } catch (err) {
        if (/déjà en cours/.test(err.message)) indexed = true;
        else if (indexInBrowser) await indexInBrowser(id, 'PDF reçu').catch(() => (indexed = false));
        else indexed = false;
      }
      body.innerHTML = `<p><b>PDF ajouté${via}.</b> ${indexed ? 'Son texte est indexé : il est cherchable et citable.' : 'Le texte sera indexé plus tard.'}</p>
        <div class="row"><a class="btn primary" href="/#lire/${id}/1" target="_blank" rel="noopener">Ouvrir le PDF</a><button class="btn ghost" id="rcvClose">Fermer cette fenêtre</button></div>`;
      onDone();
    };
    body.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.id === 'rcvNo' || b.id === 'rcvClose') return window.close();
      b.disabled = true;
      try {
        const item = existing || (await createItem(meta));
        if (b.id === 'rcvGo') {
          body.innerHTML = '<p class="note">Envoi du PDF…</p>';
          const name = decodeURIComponent((meta.pdf || '').split(/[?#]/)[0].split('/').pop() || 'document.pdf');
          await api(`/api/items/${item.id}/pdf`, { method: 'PUT', raw: true, body: bytes, headers: { 'content-type': 'application/pdf', 'x-filename': encodeURIComponent(/\.pdf$/i.test(name) ? name : `${name || 'document'}.pdf`) } });
          return finish(item.id, '');
        }
        if (b.id === 'rcvServer') {
          body.innerHTML = '<p class="note">Téléchargement depuis le serveur…</p>';
          await api(`/api/items/${item.id}/fetch-pdf`, { method: 'POST', body: { url: meta.pdf } });
          return finish(item.id, ' (téléchargé par le serveur)');
        }
      } catch (err) {
        body.insertAdjacentHTML('beforeend', `<p class="err-box">${esc(err.message)}</p>`);
        b.disabled = false;
      }
    });
  });
}
