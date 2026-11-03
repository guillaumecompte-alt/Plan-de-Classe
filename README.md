# Plan de classe

Application web pour faire le plan de classe de ses élèves : on importe la liste (Excel, LibreOffice, CSV),
on place les élèves par glisser-déposer ou automatiquement, puis on imprime / exporte en PDF.

**Aucune donnée ne quitte le navigateur** : pas de compte, pas de serveur, pas de police ni de script
chargés depuis un autre site. Les classes sont enregistrées dans le navigateur et peuvent être exportées
dans un fichier de sauvegarde pour les retrouver sur un autre ordinateur.

Site en ligne : https://guillaumecompte-alt.github.io/Plan-de-Classe/

## Fonctionnalités

- **Import de liste** : colonnes du nom, du prénom et du genre détectées automatiquement (exports Pronote,
  ENT, tableur), avec aperçu et correction avant d'importer. Réimporter une liste garde la place des élèves
  dont le nom n'a pas changé.
- **Placement à la souris, au doigt et au clavier** : glisser-déposer (appui long sur tablette / TBI), ou
  toucher un élève puis une place. Poser un élève sur une place occupée échange les deux.
- **Plusieurs classes**, chacune avec son plan.
- **Salle configurable** : 1 à 6 colonnes de tables, 1 à 10 rangées, 1 à 4 places par table.
- **Placement automatique** : au hasard ou en alternant filles et garçons, en plaçant devant les élèves
  prioritaires et en séparant les élèves qui ne doivent pas être voisins. Bouton « Annuler ».
- **Impression / PDF** : fond clair, portrait ou paysage selon la largeur de la salle, sur une page.
- **Sauvegarde** : export / import de toutes les classes dans un fichier `.json`.

## Travailler sur le code

Il faut [Node.js](https://nodejs.org) 20.19 ou plus récent.

```sh
npm ci            # installe les dépendances (exactement celles de package-lock.json)
npm run dev       # site de développement sur http://localhost:5173
npm test          # tests
npm run lint      # vérification du code
npm run build     # site final dans le dossier dist/
npm run preview   # affiche le site final en local
```

Technologies : React, TypeScript, Vite, Tailwind CSS. Le site final est un simple dossier de fichiers
statiques (`dist/`), utilisable sur n'importe quel hébergement.

| Fichier | Rôle |
| --- | --- |
| `src/lib/plan.ts` | Toute la logique, sans interface : import, salle, placement, sauvegarde (testée dans `plan.test.ts`) |
| `src/App.tsx` | La page |
| `src/components/plan/` | Glisser-déposer tactile, étiquettes, import, réglages de la salle et placement |
| `src/styles.css` | Couleurs, impression |

## Mise en ligne

À chaque modification de la branche `main`, GitHub vérifie le code (lint, tests, construction) puis publie
le site sur GitHub Pages (`.github/workflows/deploy.yml`). Si une vérification échoue, le site en ligne
reste sur la version précédente.

Réglage à faire une seule fois : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

Pour un autre hébergeur (Netlify, Cloudflare Pages, serveur de l'établissement…), il suffit de publier le
dossier `dist/` produit par `npm run build`.

## Bibliothèque Excel

La lecture des fichiers Excel utilise SheetJS (`xlsx` 0.18.5, dernière version publiée sur npm). Les
versions plus récentes ne sont distribuées que depuis le site de SheetJS ; pour mettre à jour :

```sh
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Les failles connues de la 0.18.5 concernent l'ouverture de fichiers piégés ; ici, chacun n'ouvre que ses
propres listes, dans son propre navigateur.
