/** Grade list response provides score and max_score on each grade itself. */
export interface ScoredGrade { score: number; max_score: number }
export interface GradeDistributionBucket { name: string; value: number }

const LABELS = [
  'Excellent (16-20)',
  'Bien (14-16)',
  'Assez bien (12-14)',
  'Passable (10-12)',
  'Insuffisant (<10)',
] as const;

/** Normalize each valid grade to a /20 scale and keep all buckets, even zeroes. */
export function buildDepartmentGradeDistribution(
  grades: ScoredGrade[],
): GradeDistributionBucket[] {
  const counts = [0, 0, 0, 0, 0];
  for (const grade of grades) {
    if (
      !grade ||
      !Number.isFinite(grade.score) ||
      !Number.isFinite(grade.max_score) ||
      grade.max_score <= 0 ||
      grade.score < 0 ||
      grade.score > grade.max_score
    ) continue;
    const normalized = (grade.score / grade.max_score) * 20;
    if (normalized >= 16) counts[0]++;
    else if (normalized >= 14) counts[1]++;
    else if (normalized >= 12) counts[2]++;
    else if (normalized >= 10) counts[3]++;
    else counts[4]++;
  }
  return LABELS.map((name, i) => ({ name, value: counts[i] }));
}
