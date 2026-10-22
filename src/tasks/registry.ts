import type { TaskDefinition } from './api.js';
import { aleksanderPython } from './aleksander-python.js';
import { eemanBank } from './eeman-bank.js';
import { example } from './example.js';
import { homayoonBar } from './homayoon-bar.js';

/** The tasks the admin steps through, in order. One line per task. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const taskOrder: TaskDefinition<any>[] = [homayoonBar, aleksanderPython, eemanBank];

/** Finds a task by id. The example is only reachable in preview mode. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const findTask = (id: string): TaskDefinition<any> | undefined =>
  [...taskOrder, example].find((t) => t.id === id);
