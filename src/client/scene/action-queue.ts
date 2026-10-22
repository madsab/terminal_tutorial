export type SceneAction = { type: 'walkTo'; spot: string } | { type: 'play'; anim: string };

export interface ActionQueueOptions {
  /** How many pending animations to keep. Older ones are dropped. */
  maxPlays?: number;
}

/**
 * Pending character actions. The scene never waits on an animation, so a burst of commands
 * collapses: only the latest walk target matters and only the newest few animations are kept.
 */
export class ActionQueue {
  private walk?: Extract<SceneAction, { type: 'walkTo' }>;
  private plays: Extract<SceneAction, { type: 'play' }>[] = [];
  private readonly maxPlays: number;

  constructor(opts: ActionQueueOptions = {}) {
    this.maxPlays = opts.maxPlays ?? 2;
  }

  get length(): number {
    return (this.walk ? 1 : 0) + this.plays.length;
  }

  /** `preempt`: the caller should redirect a walk already in progress right away. */
  push(action: SceneAction): 'preempt' | 'queued' {
    if (action.type === 'walkTo') {
      this.walk = action;
      return 'preempt';
    }
    this.plays.push(action);
    if (this.plays.length > this.maxPlays) this.plays.shift();
    return 'queued';
  }

  /** Walking comes first so the character keeps up with the terminal, then animations in order. */
  next(): SceneAction | undefined {
    if (this.walk) {
      const w = this.walk;
      this.walk = undefined;
      return w;
    }
    return this.plays.shift();
  }

  drain(): SceneAction[] {
    const out: SceneAction[] = [];
    for (let a = this.next(); a; a = this.next()) out.push(a);
    return out;
  }
}
