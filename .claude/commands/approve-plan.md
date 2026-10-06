---
description: HUMAN VALIDATION — l'utilisateur valide explicitement le plan en attente et lève le verrou d'implémentation (équivalent à répondre « OK »)
argument-hint: "[remarques éventuelles]"
---

L'utilisateur valide explicitement le plan présenté juste avant. Remarques : $ARGUMENTS

Le hook `workflow-gate.mjs` a levé le verrou HUMAN VALIDATION (seul un message de
l'utilisateur peut le faire). Si le contexte ajouté par le hook n'indique pas
« Plan validé explicitement », c'est qu'aucun plan n'était en attente : le signaler
et ne rien implémenter.

Sinon, reprendre le workflow en cours (`/feature` ou autre commande gatée) à
l'étape ARCHITECTURE CHECK, en intégrant les remarques ci-dessus si elles restent
dans le périmètre du plan. Si les remarques modifient le plan de façon
significative, présenter le plan révisé et redemander la validation.
