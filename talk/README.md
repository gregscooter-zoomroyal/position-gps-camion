# Talk

Talk est un endroit simple pour un petit groupe. On y écrit dans une conversation, on peut se rejoindre en voix, et une personne à la fois peut lancer un direct. Les autres regardent, et la discussion de ce direct reste sous l’image.

L’interface est en français, avec des mots ordinaires.

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

Créez un compte, ouvrez un groupe, puis donnez le code d’invitation à quelqu’un qui entre depuis une autre fenêtre (une fenêtre privée suffit).

## Ce que cette version fait

- Inscription et connexion
- Groupes, membres, rôles (propriétaire, modérateur, membre)
- Conversation en temps réel
- Présence : qui est en ligne
- Appel vocal : rejoindre et quitter la voix du groupe
- Direct : une personne montre sa caméra, ou un dessin si la caméra est refusée ; les autres regardent ; la discussion du direct est liée à ce moment
- Messages privés entre amis
- Amis : ajouter quelqu’un par son identifiant
- Modération : supprimer un message, retirer un membre

Pour vérifier le serveur sans ouvrir le navigateur :

```bash
npm test
```

Le parcours dans le navigateur :

```bash
npm run test:direct
```

## Données

Les comptes, les groupes et les messages restent dans `talk/data/talk.sqlite`. Ce dossier n’est pas versionné. Pour un autre fichier : `TALK_DB=/chemin/talk.sqlite npm start`.
