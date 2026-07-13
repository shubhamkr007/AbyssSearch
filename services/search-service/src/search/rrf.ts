import type { EsHit } from '../domain/types';

export interface FusedDoc {
  id: string;
  score: number;
}

/**
 * Reciprocal Rank Fusion. For each ranked list, a document at 1-based rank `r`
 * contributes `1 / (rankConstant + r)`; contributions are summed across lists.
 * RRF fuses by rank, so no score normalization is needed - which is exactly why
 * it works well for blending BM25 and kNN whose score scales are unrelated.
 *
 * Optional per-list weights allow biasing one leg (weighted RRF).
 */
export function fuseRrf(
  lists: EsHit[][],
  rankConstant: number,
  window: number,
  weights?: number[],
): FusedDoc[] {
  const scores = new Map<string, number>();

  lists.forEach((list, listIndex) => {
    const weight = weights?.[listIndex] ?? 1;
    list.slice(0, window).forEach((hit, idx) => {
      const rank = idx + 1;
      const contribution = weight * (1 / (rankConstant + rank));
      scores.set(hit.id, (scores.get(hit.id) ?? 0) + contribution);
    });
  });

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    // Deterministic tie-break by id keeps output stable for snapshot tests.
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
