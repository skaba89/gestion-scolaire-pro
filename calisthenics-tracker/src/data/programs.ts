import type { Program } from '../lib/types'

export const programs: Program[] = [
  {
    id: 'debutant-full-body',
    name: 'Débutant — Full Body 3x/semaine',
    difficulty: 'debutant',
    description:
      'Programme d\'introduction pour construire les bases de force sur tout le corps. À faire 3 fois par semaine avec un jour de repos entre chaque séance.',
    days: [
      {
        name: 'Séance A',
        slots: [
          { exerciseId: 'knee-push-up', sets: 3, reps: '8-12', restSeconds: 60 },
          { exerciseId: 'inverted-row', sets: 3, reps: '8-12', restSeconds: 60 },
          { exerciseId: 'bodyweight-squat', sets: 3, reps: '12-15', restSeconds: 60 },
          { exerciseId: 'plank', sets: 3, reps: '20-30s', restSeconds: 45 },
        ],
      },
      {
        name: 'Séance B',
        slots: [
          { exerciseId: 'push-up', sets: 3, reps: '6-10', restSeconds: 60 },
          { exerciseId: 'pull-up-negative', sets: 3, reps: '4-6', restSeconds: 90 },
          { exerciseId: 'bulgarian-split-squat', sets: 3, reps: '8-10', restSeconds: 60 },
          { exerciseId: 'mountain-climber', sets: 3, reps: '30s', restSeconds: 45 },
        ],
      },
    ],
  },
  {
    id: 'intermediaire-ppl',
    name: 'Intermédiaire — Push / Pull / Legs',
    difficulty: 'intermediaire',
    description:
      'Split classique en 3 jours pour progresser en force et en volume, à répéter 2x par semaine (6 séances/semaine) ou 1x pour un rythme plus léger.',
    days: [
      {
        name: 'Jour 1 — Push',
        slots: [
          { exerciseId: 'push-up', sets: 4, reps: '10-15', restSeconds: 60 },
          { exerciseId: 'pike-push-up', sets: 3, reps: '6-10', restSeconds: 90 },
          { exerciseId: 'dips', sets: 3, reps: '8-12', restSeconds: 90 },
          { exerciseId: 'diamond-push-up', sets: 3, reps: 'AMRAP', restSeconds: 60 },
        ],
      },
      {
        name: 'Jour 2 — Pull',
        slots: [
          { exerciseId: 'pull-up', sets: 4, reps: '5-8', restSeconds: 90 },
          { exerciseId: 'inverted-row', sets: 3, reps: '10-12', restSeconds: 60 },
          { exerciseId: 'leg-raise', sets: 3, reps: '10-15', restSeconds: 60 },
        ],
      },
      {
        name: 'Jour 3 — Legs & Core',
        slots: [
          { exerciseId: 'bulgarian-split-squat', sets: 4, reps: '10-12', restSeconds: 75 },
          { exerciseId: 'calf-raise', sets: 3, reps: '15-20', restSeconds: 45 },
          { exerciseId: 'hollow-body-hold', sets: 3, reps: '20-40s', restSeconds: 45 },
          { exerciseId: 'burpee', sets: 3, reps: '10-15', restSeconds: 60 },
        ],
      },
    ],
  },
  {
    id: 'avance-skills',
    name: 'Avancé — Skills & Force',
    difficulty: 'avance',
    description:
      'Programme orienté figures avancées (L-sit, pistol squat, handstand) pour pratiquants confirmés.',
    days: [
      {
        name: 'Jour 1 — Push avancé',
        slots: [
          { exerciseId: 'handstand-push-up', sets: 4, reps: '3-6', restSeconds: 120 },
          { exerciseId: 'dips', sets: 4, reps: '10-15', restSeconds: 90 },
          { exerciseId: 'diamond-push-up', sets: 3, reps: '12-20', restSeconds: 60 },
        ],
      },
      {
        name: 'Jour 2 — Pull avancé',
        slots: [
          { exerciseId: 'chin-up-weighted', sets: 5, reps: '3-6', restSeconds: 120 },
          { exerciseId: 'pull-up', sets: 3, reps: '8-12', restSeconds: 90 },
          { exerciseId: 'l-sit', sets: 4, reps: '10-20s', restSeconds: 60 },
        ],
      },
      {
        name: 'Jour 3 — Legs & Core avancé',
        slots: [
          { exerciseId: 'pistol-squat', sets: 4, reps: '5-8 / jambe', restSeconds: 90 },
          { exerciseId: 'l-sit', sets: 3, reps: 'Max', restSeconds: 60 },
          { exerciseId: 'burpee', sets: 4, reps: '15-20', restSeconds: 45 },
        ],
      },
    ],
  },
]

export function getProgramById(id: string): Program | undefined {
  return programs.find((p) => p.id === id)
}
