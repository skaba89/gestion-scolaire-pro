import type { Exercise } from '../lib/types'

export const exercises: Exercise[] = [
  // PUSH
  {
    id: 'knee-push-up',
    name: 'Pompes sur genoux',
    muscleGroup: 'push',
    difficulty: 'debutant',
    description: 'Version accessible de la pompe classique, pour construire la force de base.',
    instructions: [
      'Genoux au sol, corps aligné des genoux à la tête',
      'Mains légèrement plus larges que les épaules',
      'Descendre poitrine proche du sol, coudes à ~45°',
      'Pousser pour remonter en contractant les abdos',
    ],
    progressionTo: 'push-up',
  },
  {
    id: 'push-up',
    name: 'Pompes',
    muscleGroup: 'push',
    difficulty: 'debutant',
    description: 'Exercice de base pour pectoraux, épaules et triceps.',
    instructions: [
      'Corps gainé, mains sous les épaules',
      'Descendre jusqu\'à ce que la poitrine frôle le sol',
      'Pousser explosivement en gardant le corps droit',
    ],
    progressionFrom: 'knee-push-up',
    progressionTo: 'diamond-push-up',
  },
  {
    id: 'diamond-push-up',
    name: 'Pompes diamant',
    muscleGroup: 'push',
    difficulty: 'intermediaire',
    description: 'Variante mains rapprochées, accent sur les triceps.',
    instructions: [
      'Mains sous la poitrine, pouces et index formant un diamant',
      'Descendre en gardant les coudes proches du corps',
      'Pousser en extension complète',
    ],
    progressionFrom: 'push-up',
    progressionTo: 'pike-push-up',
  },
  {
    id: 'pike-push-up',
    name: 'Pike push-up',
    muscleGroup: 'push',
    difficulty: 'intermediaire',
    description: 'Prépare le handstand push-up en ciblant les épaules.',
    instructions: [
      'Position en V inversé, hanches hautes',
      'Descendre la tête vers le sol entre les mains',
      'Pousser pour revenir en position de départ',
    ],
    progressionFrom: 'diamond-push-up',
    progressionTo: 'handstand-push-up',
  },
  {
    id: 'handstand-push-up',
    name: 'Handstand push-up (contre un mur)',
    muscleGroup: 'push',
    difficulty: 'avance',
    description: 'Pompe verticale en équilibre, exercice avancé pour les épaules.',
    instructions: [
      'En appui contre un mur, corps aligné',
      'Descendre en contrôlant jusqu\'à effleurer le sol de la tête',
      'Pousser pour revenir à la verticale',
    ],
    progressionFrom: 'pike-push-up',
  },
  {
    id: 'dips',
    name: 'Dips (bancs ou barres)',
    muscleGroup: 'push',
    difficulty: 'intermediaire',
    description: 'Travail des triceps et du bas des pectoraux.',
    instructions: [
      'Bras tendus, corps droit',
      'Descendre jusqu\'à un angle de 90° au coude',
      'Pousser pour remonter en extension complète',
    ],
  },

  // PULL
  {
    id: 'inverted-row',
    name: 'Rowing australien (inverted row)',
    muscleGroup: 'pull',
    difficulty: 'debutant',
    description: 'Introduction au tirage horizontal, base pour le tractage.',
    instructions: [
      'Sous une barre basse, corps incliné et gainé',
      'Tirer la poitrine vers la barre',
      'Redescendre en contrôlant',
    ],
    progressionTo: 'pull-up-negative',
  },
  {
    id: 'pull-up-negative',
    name: 'Tractions négatives',
    muscleGroup: 'pull',
    difficulty: 'debutant',
    description: 'Phase excentrique seule pour construire la force de traction.',
    instructions: [
      'Sauter ou monter en haut de la barre, menton au-dessus',
      'Descendre le plus lentement possible (4-6s)',
      'Répéter en contrôlant la descente',
    ],
    progressionFrom: 'inverted-row',
    progressionTo: 'pull-up',
  },
  {
    id: 'pull-up',
    name: 'Tractions',
    muscleGroup: 'pull',
    difficulty: 'intermediaire',
    description: 'Exercice roi du dos et des biceps en callisthénie.',
    instructions: [
      'Suspendu, prise pronation largeur épaules',
      'Tirer jusqu\'à ce que le menton dépasse la barre',
      'Redescendre en contrôlant jusqu\'à extension complète',
    ],
    progressionFrom: 'pull-up-negative',
    progressionTo: 'chin-up-weighted',
  },
  {
    id: 'chin-up-weighted',
    name: 'Tractions lestées / archer',
    muscleGroup: 'pull',
    difficulty: 'avance',
    description: 'Traction à un bras dominant ou lestée pour continuer à progresser.',
    instructions: [
      'Ajouter du poids (sac/ceinture) ou décaler le centre de gravité vers un bras',
      'Tirer en gardant le tronc gainé',
      'Contrôler la descente',
    ],
    progressionFrom: 'pull-up',
  },

  // LEGS
  {
    id: 'bodyweight-squat',
    name: 'Squat au poids du corps',
    muscleGroup: 'legs',
    difficulty: 'debutant',
    description: 'Mouvement fondamental pour les jambes et les fessiers.',
    instructions: [
      'Pieds largeur épaules, dos droit',
      'Descendre hanches en arrière et en bas',
      'Remonter en poussant sur les talons',
    ],
    progressionTo: 'bulgarian-split-squat',
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Fentes bulgares',
    muscleGroup: 'legs',
    difficulty: 'intermediaire',
    description: 'Travail unilatéral, prépare le pistol squat.',
    instructions: [
      'Pied arrière surélevé sur un banc',
      'Descendre le genou avant à 90°',
      'Remonter en poussant sur la jambe avant',
    ],
    progressionFrom: 'bodyweight-squat',
    progressionTo: 'pistol-squat',
  },
  {
    id: 'pistol-squat',
    name: 'Pistol squat',
    muscleGroup: 'legs',
    difficulty: 'avance',
    description: 'Squat à une jambe, exercice avancé d\'équilibre et de force.',
    instructions: [
      'Une jambe tendue devant soi',
      'Descendre en contrôlant sur la jambe d\'appui',
      'Remonter sans poser l\'autre pied',
    ],
    progressionFrom: 'bulgarian-split-squat',
  },
  {
    id: 'calf-raise',
    name: 'Extensions mollets',
    muscleGroup: 'legs',
    difficulty: 'debutant',
    description: 'Isolation des mollets, debout ou sur marche.',
    instructions: [
      'Debout, monter sur la pointe des pieds',
      'Marquer un temps en haut',
      'Redescendre en contrôlant',
    ],
  },

  // CORE
  {
    id: 'plank',
    name: 'Gainage (planche)',
    muscleGroup: 'core',
    difficulty: 'debutant',
    description: 'Gainage isométrique de base pour la sangle abdominale.',
    instructions: [
      'Avant-bras et pointes de pieds au sol',
      'Corps aligné tête-bassin-talons',
      'Contracter abdos et fessiers, tenir la position',
    ],
    progressionTo: 'hollow-body-hold',
  },
  {
    id: 'hollow-body-hold',
    name: 'Hollow body hold',
    muscleGroup: 'core',
    difficulty: 'intermediaire',
    description: 'Position de gainage clé pour la gymnastique et la callisthénie.',
    instructions: [
      'Allongé sur le dos, bas du dos plaqué au sol',
      'Lever bras et jambes légèrement au-dessus du sol',
      'Maintenir la position en respirant',
    ],
    progressionFrom: 'plank',
    progressionTo: 'l-sit',
  },
  {
    id: 'l-sit',
    name: 'L-sit',
    muscleGroup: 'core',
    difficulty: 'avance',
    description: 'Maintien en équilibre jambes tendues à l\'horizontale.',
    instructions: [
      'En appui sur les mains (sol, barres parallèles ou anneaux)',
      'Lever les jambes tendues à l\'horizontale',
      'Maintenir en gardant les épaules basses',
    ],
    progressionFrom: 'hollow-body-hold',
  },
  {
    id: 'leg-raise',
    name: 'Relevés de jambes suspendu',
    muscleGroup: 'core',
    difficulty: 'intermediaire',
    description: 'Travail des abdos inférieurs suspendu à la barre.',
    instructions: [
      'Suspendu à la barre, gainage actif',
      'Lever les jambes tendues jusqu\'à l\'horizontale ou plus haut',
      'Redescendre en contrôlant sans balancer',
    ],
  },

  // FULL BODY
  {
    id: 'burpee',
    name: 'Burpees',
    muscleGroup: 'full-body',
    difficulty: 'intermediaire',
    description: 'Enchaînement cardio complet, corps entier.',
    instructions: [
      'Squat, poser les mains, sauter les pieds en arrière',
      'Pompe optionnelle',
      'Ramener les pieds et sauter verticalement',
    ],
  },
  {
    id: 'mountain-climber',
    name: 'Mountain climbers',
    muscleGroup: 'full-body',
    difficulty: 'debutant',
    description: 'Exercice cardio et gainage dynamique.',
    instructions: [
      'Position de planche haute',
      'Ramener alternativement les genoux vers la poitrine',
      'Garder le bassin stable',
    ],
  },
]

export function getExerciseById(id: string): Exercise | undefined {
  return exercises.find((e) => e.id === id)
}
