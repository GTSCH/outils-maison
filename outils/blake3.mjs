// BLAKE3 (empreinte de 32 octets), sans dépendance : sert à calculer l'empreinte des fichiers d'interface comme le fait
// wrangler (blake3 du contenu en base64 suivi de l'extension, 32 premiers caractères hexadécimaux).
// Vérifié le 26.10.2026 contre la bibliothèque blake3 de référence (fichiers réels et tailles limites).
const IV = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
const PERM = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];
const CHUNK_START = 1, CHUNK_END = 2, PARENT = 4, ROOT = 8;
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

function g(s, a, b, c, d, x, y) {
  s[a] = (s[a] + s[b] + x) >>> 0; s[d] = rotr(s[d] ^ s[a], 16);
  s[c] = (s[c] + s[d]) >>> 0; s[b] = rotr(s[b] ^ s[c], 12);
  s[a] = (s[a] + s[b] + y) >>> 0; s[d] = rotr(s[d] ^ s[a], 8);
  s[c] = (s[c] + s[d]) >>> 0; s[b] = rotr(s[b] ^ s[c], 7);
}

function compresser(cv, m, compteur, longueur, drapeaux) {
  const s = new Uint32Array(16);
  s.set(cv, 0); s.set(IV.subarray(0, 4), 8);
  s[12] = compteur >>> 0; s[13] = Math.floor(compteur / 0x100000000) >>> 0; s[14] = longueur; s[15] = drapeaux;
  let w = Uint32Array.from(m);
  for (let r = 0; r < 7; r++) {
    g(s, 0, 4, 8, 12, w[0], w[1]); g(s, 1, 5, 9, 13, w[2], w[3]); g(s, 2, 6, 10, 14, w[4], w[5]); g(s, 3, 7, 11, 15, w[6], w[7]);
    g(s, 0, 5, 10, 15, w[8], w[9]); g(s, 1, 6, 11, 12, w[10], w[11]); g(s, 2, 7, 8, 13, w[12], w[13]); g(s, 3, 4, 9, 14, w[14], w[15]);
    if (r < 6) { const p = new Uint32Array(16); for (let i = 0; i < 16; i++) p[i] = w[PERM[i]]; w = p; }
  }
  for (let i = 0; i < 8; i++) { s[i] ^= s[i + 8]; s[i + 8] ^= cv[i]; }
  return s;
}

function mots(octets, debut, fin) {
  const m = new Uint32Array(16);
  for (let i = debut, j = 0; i < fin; i++, j++) m[j >> 2] |= octets[i] << (8 * (j & 3));
  return m;
}

// Traite un morceau de 1024 octets au plus ; renvoie ce qu'il faut pour sa dernière compression.
function morceau(octets, debut, fin, indice) {
  let cv = IV, pos = debut, premier = true;
  while (fin - pos > 64) {
    cv = compresser(cv, mots(octets, pos, pos + 64), indice, 64, premier ? CHUNK_START : 0).subarray(0, 8);
    pos += 64; premier = false;
  }
  return { cv, m: mots(octets, pos, fin), compteur: indice, longueur: fin - pos, drapeaux: (premier ? CHUNK_START : 0) | CHUNK_END };
}

const cvDe = (o) => compresser(o.cv, o.m, o.compteur, o.longueur, o.drapeaux).subarray(0, 8);
const parent = (gauche, droite) => { const m = new Uint32Array(16); m.set(gauche, 0); m.set(droite, 8); return { cv: IV, m, compteur: 0, longueur: 64, drapeaux: PARENT }; };

/** Empreinte BLAKE3 (32 octets) en hexadécimal. */
export function blake3Hex(donnees) {
  const octets = donnees instanceof Uint8Array ? donnees : new TextEncoder().encode(String(donnees));
  const n = Math.max(1, Math.ceil(octets.length / 1024));
  const pile = [];
  for (let k = 0; k < n - 1; k++) {
    let cv = cvDe(morceau(octets, k * 1024, (k + 1) * 1024, k));
    let total = k + 1;
    while ((total & 1) === 0) { cv = cvDe(parent(pile.pop(), cv)); total >>= 1; }
    pile.push(cv);
  }
  let sortie = morceau(octets, (n - 1) * 1024, octets.length, n - 1);
  for (let i = pile.length - 1; i >= 0; i--) sortie = parent(pile[i], cvDe(sortie));
  const s = compresser(sortie.cv, sortie.m, 0, sortie.longueur, sortie.drapeaux | ROOT);
  let hex = "";
  for (let i = 0; i < 8; i++) for (let b = 0; b < 4; b++) hex += ((s[i] >>> (8 * b)) & 255).toString(16).padStart(2, "0");
  return hex;
}

/** Empreinte d'un fichier d'interface, comme wrangler : blake3(base64(contenu) + extension sans point), 32 caractères. */
export function empreinteFichier(contenu, chemin) {
  const ext = (chemin.match(/\.([^./]+)$/) || [, ""])[1];
  return blake3Hex(Buffer.from(contenu).toString("base64") + ext).slice(0, 32);
}
