# Talk

Talk est un lieu pour un petit groupe : une **cale** où l’on s’amarre, des **courants** où l’on écrit, et au plus un **éclat** à la fois — quelqu’un montre, les autres s’assoient, et la **houle** recueille les mots de ce moment-là.

L’interface est en français.

## Prérequis

- Node.js 22.14 ou plus récent

## Installation

Depuis la racine du dépôt :

```bash
cd talk
npm install
```

## Lancement

```bash
npm start
```

Talk écoute sur [http://localhost:4730](http://localhost:4730). Le port se change avec la variable `PORT`.

Le compte se crée sur le seuil. Le premier geste utile : ouvrir une cale, copier le code d’amarre, puis le donner à quelqu’un qui entre depuis une autre fenêtre (une fenêtre privée suffit).

## Ce que cette version fait

- Inscription et connexion
- Cales, membres, rôles (lampiste, veilleur, passant)
- Courants et lignes en temps réel
- Présence : qui est à quai
- Éclat : une personne émet un flux (lentille, ou dessin si la lentille est refusée), les autres le regardent, la houle est liée à cet éclat
- Modération : rayer une ligne ou une parole, retirer un membre

Pour vérifier le serveur sans ouvrir le navigateur :

```bash
npm test
```

Le parcours visuel, lentille factice comprise :

```bash
npm run test:direct
```

## Données

Les comptes et les cales restent dans `talk/data/talk.sqlite`. Ce dossier n’est pas versionné. Pour un autre fichier : `TALK_DB=/chemin/talk.sqlite npm start`.
