// Main levée · détection des cartes dans un fil séparé (l'interface reste fluide)
importScripts("/js/vendor/cv.js", "/js/vendor/aruco.js", "/js/cartes-dico.js");

var detecteur = new AR.Detector({ dictionaryName: CartesML.NOM });

// Seuils adaptatifs essayés à tour de rôle : salle bien éclairée, moyenne, sombre.
// Une carte est confirmée côté page après deux lectures concordantes, quel que soit le seuil.
var SEUILS = [12, 5, 20, 8];
var tour = 0;

function detecter(image, seuil) {
  var d = detecteur;
  CV.grayscale(image, d.grey);
  CV.adaptiveThreshold(d.grey, d.thres, 2, seuil);
  d.contours = CV.findContours(d.thres, d.binary);
  d.candidates = d.findCandidates(d.contours, image.width * 0.01, 0.05, 6);
  d.candidates = d.clockwiseCorners(d.candidates);
  d.candidates = d.notTooNear(d.candidates, 10);
  return d.findMarkers(d.grey, d.candidates, 49);
}

self.onmessage = function (ev) {
  var m = ev.data;
  var t0 = Date.now();
  var seuil = SEUILS[tour++ % SEUILS.length];
  var marqueurs = [];
  try {
    marqueurs = detecter({ width: m.width, height: m.height, data: new Uint8ClampedArray(m.buffer) }, seuil);
  } catch (e) {
    marqueurs = [];
  }
  var cartes = [];
  var vus = {};
  for (var i = 0; i < marqueurs.length; i++) {
    var mk = marqueurs[i];
    if (mk.id >= CartesML.MAX || mk.hammingDistance > 1 || vus[mk.id]) continue;
    vus[mk.id] = true;
    cartes.push({
      carte: mk.id + 1,
      lettre: CartesML.lettre(mk.corners),
      coins: mk.corners.map(function (c) { return { x: c.x, y: c.y }; }),
    });
  }
  self.postMessage({ cartes: cartes, buffer: m.buffer, ms: Date.now() - t0, seuil: seuil }, [m.buffer]);
};
