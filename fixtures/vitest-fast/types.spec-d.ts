import { test, expectTypeOf } from 'vitest';

test('a type test (run only with typecheck on)', () => {
  expectTypeOf(1).toEqualTypeOf<number>();
});
