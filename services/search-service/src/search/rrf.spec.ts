import type { EsHit } from '../domain/types';
import { fuseRrf } from './rrf';

const hit = (id: string): EsHit => ({ id, score: 0, source: {} });

describe('fuseRrf', () => {
  it('ranks a doc appearing high in both lists first', () => {
    const bm25 = [hit('a'), hit('b'), hit('c')];
    const knn = [hit('b'), hit('d')];
    const fused = fuseRrf([bm25, knn], 60, 100);
    // b: 1/62 + 1/61 (top of knn, 2nd of bm25) beats everyone.
    expect(fused.map((f) => f.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('works with a single list (degraded/one-leg case)', () => {
    const fused = fuseRrf([[hit('x'), hit('y')]], 60, 100);
    expect(fused.map((f) => f.id)).toEqual(['x', 'y']);
  });

  it('honors the rank window', () => {
    const list = [hit('a'), hit('b'), hit('c')];
    const fused = fuseRrf([list], 60, 2);
    expect(fused.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('supports weighted fusion', () => {
    const bm25 = [hit('a'), hit('b')];
    const knn = [hit('b'), hit('a')];
    // Heavily weight the knn leg -> its top doc (b) wins.
    const fused = fuseRrf([bm25, knn], 60, 100, [0.1, 10]);
    expect(fused[0].id).toBe('b');
  });

  it('is deterministic on ties (tie-break by id)', () => {
    const fused = fuseRrf([[hit('b')], [hit('a')]], 60, 100);
    expect(fused.map((f) => f.id)).toEqual(['a', 'b']);
  });
});
