# 🗺️ Créateur de carte au trésor

Un éditeur de carte au trésor simple et responsive pour que les enfants créent leur propre carte, puis l'exportent en PDF (ou en image) pour l'imprimer.

## Utilisation

1. Ouvrir `index.html` dans un navigateur (ou héberger le dossier sur un serveur statique / GitHub Pages).
2. Choisir un fond de carte (parchemin).
3. Ouvrir le tiroir d'objets (🧰 Objets), choisir une catégorie, toucher un objet puis toucher la carte pour le placer.
4. Toucher un objet déjà posé pour le sélectionner : le déplacer par glisser, ou utiliser la barre d'outils pour le tourner, l'agrandir/rapetisser, le mettre devant/derrière ou le supprimer.
5. Ajouter du texte avec le bouton "✏️ Ajouter du texte".
6. Exporter la carte en PDF (format A4 paysage, prêt à imprimer) ou en image PNG.

## Développement

Aucune installation requise : c'est une page HTML/CSS/JS statique, sans étape de build.

```bash
# servir le dossier localement, par exemple :
npx serve .
```

## Crédits

Illustrations : [Cartography Pack de Kenney](https://kenney.nl/assets/cartography-pack) (licence CC0 — domaine public).
Bibliothèque d'export PDF : [jsPDF](https://github.com/parallax/jsPDF) (MIT).
Police : [Pirata One](https://fonts.google.com/specimen/Pirata+One) et [Baloo 2](https://fonts.google.com/specimen/Baloo+2) (Google Fonts, licence OFL).
