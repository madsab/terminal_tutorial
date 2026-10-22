import { buildCommands } from "../shell/commands/index.js"
import { Shell, type RunResult, type ScriptCall, type ShellEvent } from "../shell/engine.js"
import { buildSkeleton, osHome, psError, type OsMode } from "../shell/modes.js"
import { Vfs } from "../shell/vfs.js"
import type { SceneApi, TaskCtx, TaskDefinition, TaskUpdate, TreeSpec } from "./api.js"

function folders(tree: TreeSpec, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([name, sub]) => {
    const path = prefix ? `${prefix}/${name}` : name
    return [path, ...folders(sub, path)]
  })
}

/** Turns shell events into steps, endings, hints, stats and scene commands. */
export class TaskRuntime<S> {
  readonly shell: Shell
  readonly vfs = new Vfs()
  readonly home: string
  state: S
  private listeners: ((u: TaskUpdate) => void)[] = []
  private pendingFeedback?: string
  private ended?: NonNullable<TaskUpdate["ending"]>
  private current: TaskUpdate
  private readonly allFolders: string[]

  constructor(
    readonly def: TaskDefinition<S>,
    readonly mode: OsMode,
    readonly scene: SceneApi,
  ) {
    this.state = structuredClone(def.initialState)
    this.home = osHome(mode, def.user)
    buildSkeleton(this.vfs, mode, def.user)
    this.allFolders = [".", ...folders(def.tree)]
    for (const f of this.allFolders) if (f !== ".") this.vfs.mkdir(`${this.home}/${f}`)

    for (const f of def.hiddenFolders ?? []) this.vfs.setHidden(this.abs(f), true)

    this.shell = new Shell({
      mode,
      vfs: this.vfs,
      user: def.user,
      host: def.host,
      home: this.home,
      commands: buildCommands(mode, def.commands),
    })
    this.shell.env.sudoPassword = def.sudoPassword
    this.shell.scriptHandler = (call) => this.runScript(call)
    this.syncScripts()
    def.setup?.(this.ctx())
    this.shell.on((e) => this.handle(e))
    this.current = this.compute()
  }

  get update(): TaskUpdate {
    return this.current
  }

  onUpdate(cb: (u: TaskUpdate) => void): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb)
    }
  }

  /** Path relative to the task root, "." for the entrance, absolute when outside it. */
  relative(path: string): string {
    if (path === this.home) return "."
    return path.startsWith(this.home + "/") ? path.slice(this.home.length + 1) : path
  }

  private ctx(sudo = false, args: string[] = []): TaskCtx<S> {
    const self = this
    return {
      get state() {
        return self.state
      },
      args,
      cwd: this.relative(this.shell?.cwd ?? this.home),
      vfs: this.vfs,
      shell: this.shell,
      scene: this.scene,
      sudo,
      relative: (path) => this.relative(path),
      feedback: (text) => {
        this.pendingFeedback = text
      },
    }
  }

  private scriptDirs(dir: string | string[]): string[] {
    if (dir === "*") return this.allFolders
    return Array.isArray(dir) ? dir : [dir]
  }

  private abs(rel: string): string {
    return rel === "." ? this.home : `${this.home}/${rel}`
  }

  /** Scripts exist only while visible: add or remove them to match the state. */
  private syncScripts(): void {
    this.syncDoors()
    for (const [name, script] of Object.entries(this.def.scripts)) {
      const visible = !script.visibleWhen || script.visibleWhen(this.state)
      for (const dir of this.scriptDirs(script.dir)) {
        const abs = this.abs(dir)
        const present = this.vfs.stat(`${abs}/${name}`) !== undefined
        if (visible && !present) this.vfs.addScript(abs, name)
        else if (!visible && present) this.vfs.remove(`${abs}/${name}`)
      }
    }
  }

  /** Doors exist only while visible, like scripts. */
  private syncDoors(): void {
    for (const door of this.def.doors ?? []) {
      const visible = !door.visibleWhen || door.visibleWhen(this.state)
      for (const from of door.from) {
        const abs = this.abs(from)
        const present = this.vfs.stat(`${abs}/${door.name}`)?.target !== undefined
        if (visible && !present) this.vfs.link(abs, door.name, this.abs(door.to))
        else if (!visible && present) this.vfs.remove(`${abs}/${door.name}`)
      }
    }
  }

  private runScript(call: ScriptCall): RunResult {
    const script = this.def.scripts[call.name]
    if (!script || this.ended) return { output: "" }
    if (script.requiresSudo && !call.sudo) {
      script.onDenied?.(this.ctx())
      return { output: this.deniedText(call), ok: false }
    }
    const out = script.run(this.ctx(call.sudo, call.args))
    return { output: typeof out === "string" ? out : "" }
  }

  /** The permission error a script that needs root prints without sudo. It points toward sudo. */
  private deniedText(call: ScriptCall): string {
    if (this.mode !== "windows") {
      return `${call.name}: Permission denied`
    }
    return psError({
      name: call.name,
      message: `Access is denied. This action requires administrator rights`,
      category: "PermissionDenied: (:) [], UnauthorizedAccessException",
      id: "UnauthorizedAccess",
      line: call.line,
      col: call.col,
      underline: call.text.length,
    })
  }

  private handle(e: ShellEvent): void {
    if (this.ended) return
    if (e.type === "cwdChanged") this.walkScene(e.to)
    this.def.onEvent?.(e, this.ctx())
    this.syncScripts()
    for (const ending of this.def.endings) {
      if (ending.when(this.state, e)) {
        this.ended = { id: ending.id, text: ending.text, correct: ending.correct }
        break
      }
    }
    this.current = this.compute()
    this.pendingFeedback = undefined
    for (const l of [...this.listeners]) l(this.current)
  }

  private walkScene(to: string): void {
    const rel = this.relative(to)
    if (rel.startsWith("/")) {
      this.scene.walkTo(this.def.spots["."])
      return
    }
    let probe = rel
    while (probe !== ".") {
      if (probe in this.def.spots) return this.scene.walkTo(this.def.spots[probe])
      probe = probe.includes("/") ? probe.slice(0, probe.lastIndexOf("/")) : "."
    }
    this.scene.walkTo(this.def.spots["."])
  }

  private hint(s: S, cwd: string): string {
    const h = this.def.hints.find((x) => x.when(s, cwd))
    if (!h) return ""
    return typeof h.text === "function" ? h.text(this.mode, s) : h.text
  }

  private compute(): TaskUpdate {
    const s = this.state
    const cwd = this.relative(this.shell.cwd)
    const stepsDone = this.def.steps.map((st) => st.done(s))
    return {
      stepTexts: this.def.steps.map((st) => (typeof st.text === "function" ? st.text(s) : st.text)),
      stepsDone,
      stepCompletionTexts: this.def.steps.map(({ textOnCompletion: t }, i) =>
        stepsDone[i] && t !== undefined ? (typeof t === "function" ? t(s) : t) : undefined,
      ),
      hint: this.hint(s, cwd),
      stats: this.def.stats?.(s) ?? {},
      ending: this.ended,
      feedback: this.pendingFeedback,
    }
  }
}
