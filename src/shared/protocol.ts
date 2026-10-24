export type Os = 'mac' | 'linux' | 'windows';
export type Stats = Record<string, number>;

/** Student -> server. */
export type ClientMsg =
  | { type: 'ping' }
  | { type: 'hello'; clientId: string; name: string; os: Os }
  | { type: 'progress'; taskId: string; stepsDone: boolean[]; stats: Stats }
  | { type: 'ended'; taskId: string; endingId: string; correct: boolean; stats: Stats };

export interface MyResult {
  endingId: string;
  correct: boolean;
  stats: Stats;
}

/** Server -> student. */
export type ServerMsg =
  | { type: 'pong' }
  | { type: 'task'; taskId: string | null; myResult?: MyResult }
  | { type: 'reset' }
  /** Students may switch between all tasks on their own. Nothing they do is reported back. */
  | { type: 'freeplay' };

/** Admin -> server, on the same socket as students. Nothing but a correct `auth` makes a socket an admin. */
export type AdminMsg = { type: 'auth'; password: string }
  /** `after` is the task the admin saw as current. A repeated click with a stale `after` is ignored. */
  | { type: 'startNext'; after?: string | null } | { type: 'newSession' }
  /** Only accepted once every task has started. */
  | { type: 'freeplay' };

export type RowStatus = 'venter' | 'jobber' | 'ferdig';

export interface Row {
  clientId: string;
  name: string;
  os: Os;
  status: RowStatus;
  endingId?: string;
  correct?: boolean;
  /** Steps done so far, for "jobber" rows. */
  steps?: number;
  stats: Stats;
}

export interface AdminTaskTable {
  taskId: string;
  title: string;
  /** Story text for the admin to read aloud. */
  intro?: string;
  rows: Row[];
}

/** Server -> admin. */
export type AdminServerMsg =
  | {
      type: 'state';
      currentTaskId: string | null;
      /** Next task in the order, or null when the list is used up. */
      nextTask: { taskId: string; title: string } | null;
      tasks: AdminTaskTable[];
      students: number;
      freeplay: boolean;
    }
  | { type: 'authFailed' }
  | { type: 'authOk' };

export const OS_LIST: Os[] = ['mac', 'linux', 'windows'];
