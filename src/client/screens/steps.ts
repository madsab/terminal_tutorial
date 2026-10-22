/** How many goals to show: every done one plus the first not-yet-done one. */
export function visibleStepCount(stepsDone: boolean[]): number {
  const firstOpen = stepsDone.indexOf(false);
  return firstOpen === -1 ? stepsDone.length : firstOpen + 1;
}
