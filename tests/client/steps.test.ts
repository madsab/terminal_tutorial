import { describe, expect, test } from 'vitest';
import { visibleStepCount } from '../../src/client/screens/steps.js';

describe('visibleStepCount', () => {
  test('shows goals one at a time', () => {
    expect(visibleStepCount([])).toBe(0);
    expect(visibleStepCount([false, false, false])).toBe(1);
    expect(visibleStepCount([true, false, false])).toBe(2);
    expect(visibleStepCount([true, true])).toBe(2);
    expect(visibleStepCount([false, true, false])).toBe(1); // out of order: step 2 stays hidden
  });
});
