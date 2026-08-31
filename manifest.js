// Catalogue des tuiles Kenney Cartography Pack (CC0) utilisées par l'éditeur.
const PAPERS = [
  { id: 'parchmentBasic', label: 'Parchemin', file: 'assets/papers/parchmentBasic.png' },
  { id: 'parchmentAncient', label: 'Ancien', file: 'assets/papers/parchmentAncient.png' },
  { id: 'parchmentCrinkled', label: 'Froissé', file: 'assets/papers/parchmentCrinkled.png' },
  { id: 'parchmentFolded', label: 'Plié', file: 'assets/papers/parchmentFolded.png' },
  { id: 'parchmentFoldedCrinkled', label: 'Plié & froissé', file: 'assets/papers/parchmentFoldedCrinkled.png' },
];

const CATEGORIES = [
  {
    id: 'batiments',
    label: 'Constructions',
    icon: '🏰',
    items: [
      ['castle', 'Château'], ['castleTall', 'Château haut'], ['castleWide', 'Château large'],
      ['castleWideLow', 'Château bas'], ['church', 'Église'], ['churchLarge', 'Grande église'],
      ['house', 'Maison'], ['houseChimney', 'Maison cheminée'], ['houseSmall', 'Petite maison'],
      ['houseTall', 'Maison haute'], ['houseViking', 'Maison viking'], ['houses', 'Maisons'],
      ['tower', 'Tour'], ['towerLow', 'Tour basse'], ['towerTall', 'Tour haute'],
      ['towerWatch', 'Tour de guet'], ['watchtower', 'Guet'], ['mill', 'Moulin'],
      ['stable', 'Écurie'], ['tent', 'Tente'], ['tipi', 'Tipi'], ['well', 'Puits'],
      ['waterWheel', 'Roue à eau'], ['lighthouse', 'Phare'], ['pyramid', 'Pyramide'],
      ['graveyard', 'Cimetière'], ['gate', 'Portail'], ['wall', 'Mur'], ['fence', 'Clôture'],
      ['dock', 'Ponton'], ['bridge', 'Pont'], ['bridgeRope', 'Pont de corde'],
      ['mine', 'Mine'], ['ship', 'Bateau'],
    ],
  },
  {
    id: 'nature',
    label: 'Nature',
    icon: '🌳',
    items: [
      ['bush', 'Buisson'], ['cactus', 'Cactus'], ['cactusLarge', 'Grand cactus'],
      ['palm', 'Palmier'], ['palmLarge', 'Grand palmier'], ['treePine', 'Sapin'],
      ['treePineLarge', 'Grand sapin'], ['treePineTall', 'Sapin haut'],
      ['treePineTallLarge', 'Très grand sapin'], ['treePineTallLow', 'Sapin bas'],
      ['treePines', 'Sapins'], ['treePinesSmall', 'Petits sapins'], ['treeTall', 'Arbre haut'],
      ['rocks', 'Rochers'], ['rocksA', 'Rocher A'], ['rocksB', 'Rocher B'],
      ['rocksMountain', 'Montagne'], ['rocksTall', 'Rocher haut'], ['lake', 'Lac'],
      ['lakeRound', 'Lac rond'], ['vulcano', 'Volcan'], ['runis', 'Ruines'],
    ],
  },
  {
    id: 'chemins',
    label: 'Chemins & flèches',
    icon: '🧭',
    items: [
      ['pathStraight', 'Chemin droit'], ['pathCorner', 'Chemin virage'],
      ['pathCrossing', 'Chemin croisement'], ['pathEnd', 'Fin de chemin'],
      ['pathSplit', 'Chemin embranchement'], ['arrowStraight', 'Flèche droite'],
      ['arrowCorner', 'Flèche virage'], ['arrowCornerSquare', 'Flèche angle'],
      ['arrowCrossing', 'Flèche croisement'], ['arrowEnd', 'Flèche fin'],
      ['arrowHead', 'Pointe de flèche'], ['arrowSmall', 'Petite flèche'],
      ['arrowSplit', 'Flèche embranchement'], ['compass', 'Boussole'],
    ],
  },
  {
    id: 'tresor',
    label: 'Trésor & mystère',
    icon: '💰',
    items: [
      ['chest', 'Coffre au trésor'], ['skull', 'Crâne'], ['campfire', 'Feu de camp'],
      ['flag', 'Drapeau'], ['banner', 'Bannière'], ['elementCircle', 'Cercle'],
      ['elementCross', 'Croix (repère)'], ['elementDiamond', 'Losange'],
      ['elementShield', 'Blason'], ['elementSquare', 'Carré'],
    ],
  },
  {
    id: 'textures',
    label: 'Terrains',
    icon: '🎨',
    items: [
      ['textureBricks', 'Briques'], ['textureStone', 'Pierre'], ['textureWater', 'Eau'],
    ],
  },
];

CATEGORIES.forEach((cat) => {
  cat.items = cat.items.map(([id, label]) => ({ id, label, file: `assets/tiles/${id}.png` }));
});
