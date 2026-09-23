# 2-agents

Deux agents IA qui débattent entre eux dans un scénario [Make](https://www.make.com).

| Agent | Rôle | Modèle |
|-------|------|--------|
| Urbaniste | Spécialiste de l'urbanisme français | Claude |
| Avocat | Spécialiste du droit français | Mistral (module Mistral AI) |

## Fichiers

- `prompt-urbaniste.md` : prompt système et message utilisateur de l'urbaniste
- `prompt-avocat.md` : prompt système et message utilisateur de l'avocat

## Structure du scénario Make

1. **Déclencheur** : module manuel ou webhook avec le sujet du débat
2. **Claude (urbaniste)** : position d'ouverture
3. **Mistral (avocat)** : réponse
4. **Claude puis Mistral** : répliques (2 à 3 tours)
5. **Synthèse** : points d'accord et de désaccord
6. **Sortie** : Google Docs, Gmail ou Google Sheets

## Utilisation

1. Créer un scénario dans Make et ajouter les modules ci-dessus.
2. Copier le prompt de chaque agent dans le champ « System message ».
3. Passer le sujet et l'historique du débat dans le message utilisateur (`{{sujet}}` et `{{historique}}`).

## Limites

Les modèles peuvent inventer des articles de loi ou des décisions. Les prompts leur demandent de ne citer que ce dont ils sont certains, mais toute référence juridique doit être vérifiée (Légifrance) avant usage. Ce projet est un exercice et ne remplace pas un conseil juridique.

## Auvers-sur-Oise en 3D

`auvers-3d/index.html` est une maquette 3D (Three.js) du village d'Auvers-sur-Oise. Elle est centrée sur la rue Victor-Hugo, de la rue de Zundert (avec son passage piéton) jusqu'à la rue du Docteur-Gachet et la maison du docteur Gachet au n° 78. On y voit les trottoirs, les réverbères, les numéros de rue, le restaurant du n° 24, les jardinets en terrasse et les portails. Une promenade à hauteur d'homme est proposée. On y trouve aussi l'église Notre-Dame-de-l'Assomption, le château d'Auvers et ses terrasses, la grand-rue, l'Auberge Ravoux, la mairie, le cimetière, le plateau et l'Oise. Il suffit d'ouvrir le fichier dans un navigateur connecté à Internet. Three.js est chargé depuis jsDelivr.

Le plan est une reconstitution approximative et ne suit pas le cadastre.
