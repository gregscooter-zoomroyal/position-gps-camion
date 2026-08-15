# Zoom Royal

Site d’enchères automobiles de collection, dans l’esprit Barrett-Jackson : hero cinéma, docket de lots, carrousel, fiches véhicule avec galerie **et vidéo**, galerie média, consignations.

Le GPS camion n’est pas modifié. Ce dossier est le site web, à part.

## En ligne

Après déploiement Pages : [zoom-royal/](../zoom-royal/) sur le même GitHub Pages que le GPS.

## Lancer en local

```bash
python3 -m http.server 4173
```

Puis ouvre http://localhost:4173/zoom-royal/

## Intégrer des vidéos

1. **Studio** (menu → Studio) — colle une URL YouTube, Vimeo ou un fichier `.mp4`.
2. Fichier `js/catalog.js` — champ `video` sur chaque lot ou item média.
