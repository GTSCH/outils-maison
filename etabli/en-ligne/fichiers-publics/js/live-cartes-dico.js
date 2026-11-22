// L’Établi (repris de Main levée) : dictionnaire des cartes (marqueurs carrés 4×4 maison)
// 63 codes choisis pour la robustesse : au moins 4 bits d'écart entre deux cartes, quelle que soit
// leur rotation, et au moins 8 bits entre une carte et ses propres rotations (la rotation donne la
// réponse, elle ne doit jamais être confondue). Bit à 1 = case blanche, lecture ligne par ligne.
(function (racine) {
  var CODES = [7086,16161,28916,61546,22356,39922,16005,19517,63036,29749,61093,41427,2715,23811,25185,31503,14499,33684,25235,21014,45126,1211,8688,57657,50511,3479,15720,32422,11819,27333,50832,21277,45882,48100,46726,23266,27941,6743,62730,60266,13848,46318,43904,14225,33375,14866,19547,64517,3880,1422,30958,54948,11475,50073,16058,64696,60904,36197,17262,19817,43888,24867,3915];
  var NOM = "MAIN_LEVEE_4X4";

  function bits(id) {
    return CODES[id].toString(2).padStart(16, "0");
  }

  // Marqueur en SVG : 6×6 cases (bordure noire + 4×4 données), sans marge blanche.
  function svgMarqueur(id) {
    var b = bits(id), d = "";
    for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) if (b[y * 4 + x] === "1") d += "M" + (x + 1) + " " + (y + 1) + "h1v1h-1z";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 6" shape-rendering="crispEdges"><rect width="6" height="6" fill="#000"/><path d="' + d + '" fill="#fff"/></svg>';
  }

  // Lettre levée : le côté du marqueur (dans son sens d'impression) qui est le plus haut dans l'image.
  // coins = sommets dans l'ordre du marqueur : 0 haut-gauche, 1 haut-droite, 2 bas-droite, 3 bas-gauche.
  function lettre(coins) {
    var cy = (coins[0].y + coins[1].y + coins[2].y + coins[3].y) / 4;
    var meilleur = 0, min = Infinity;
    for (var k = 0; k < 4; k++) {
      var a = coins[k], c = coins[(k + 1) % 4];
      var my = (a.y + c.y) / 2 - cy;
      if (my < min) { min = my; meilleur = k; }
    }
    return "ABCD"[meilleur];
  }

  var API = { CODES: CODES, NOM: NOM, MAX: CODES.length, svgMarqueur: svgMarqueur, lettre: lettre };
  racine.CartesML = API;
  if (racine.AR && racine.AR.DICTIONARIES) {
    racine.AR.DICTIONARIES[NOM] = { nBits: 16, tau: 2, codeList: CODES };
  }
})(typeof self !== "undefined" ? self : this);
