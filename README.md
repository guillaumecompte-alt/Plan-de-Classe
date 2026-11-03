# Plan de classe

Application web pour faire le plan de classe de ses élèves : on importe la liste (Excel, LibreOffice, CSV),
on place les élèves par glisser-déposer ou automatiquement, puis on imprime / exporte en PDF.

Aucune donnée ne quitte le navigateur : les classes sont enregistrées localement, et peuvent être
exportées dans un fichier de sauvegarde pour les retrouver sur un autre ordinateur.

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

## Développement

Projet [Lovable](https://lovable.dev) (TanStack Start, React, TypeScript, Tailwind CSS).

```sh
npm i
npm run dev     # serveur de développement
npm test        # tests (logique d'import, de placement et de sauvegarde)
npm run build
```

- `src/lib/plan.ts` : toute la logique, sans interface (testée dans `plan.test.ts`).
- `src/components/plan/` : glisser-déposer tactile, étiquettes, import, réglages de la salle et placement.
- `src/routes/index.tsx` : la page.
