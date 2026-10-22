export type EntryKind = 'dir' | 'script' | 'file';

/** `hidden` is the effective flag: a dot name or an explicit hide, unless forced visible. */
export interface Entry {
  name: string;
  kind: EntryKind;
  hidden: boolean;
}

interface Node {
  kind: EntryKind;
  hidden: boolean;
  forceVisible: boolean;
  content?: string;
  children?: Map<string, Node>;
  /** POSIX path a link leads to. Links are directories to every reader. */
  target?: string;
}

const MAX_LINK_DEPTH = 16;

function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

const newNode = (kind: EntryKind): Node => ({
  kind,
  hidden: false,
  forceVisible: false,
  children: kind === 'dir' ? new Map() : undefined,
});

/** In-memory filesystem. Paths are POSIX; the OS mode translates them for display. */
export class Vfs {
  private root = newNode('dir');

  /** Walks a path, jumping to the target whenever it passes through a link (the last one only if `followLast`). */
  private get(path: string, followLast = true, depth = 0): Node | undefined {
    if (depth > MAX_LINK_DEPTH) return undefined;
    let node: Node | undefined = this.root;
    const segs = segments(path);
    for (const [i, seg] of segs.entries()) {
      node = node.children?.get(seg);
      if (!node) return undefined;
      if (node.target && (followLast || i < segs.length - 1)) {
        node = this.get(node.target, true, depth + 1);
        if (!node) return undefined;
      }
    }
    return node;
  }

  private effectiveHidden(name: string, n: Node): boolean {
    return !n.forceVisible && (n.hidden || name.startsWith('.'));
  }

  mkdir(path: string): void {
    let node = this.root;
    for (const seg of segments(path)) {
      let next = node.children?.get(seg);
      if (!next) {
        next = newNode('dir');
        node.children!.set(seg, next);
      }
      if (next.target) next = this.get(next.target);
      if (next?.kind !== 'dir') throw new Error(`Not a directory: ${path}`);
      node = next;
    }
  }

  private addLeaf(dir: string, name: string, kind: EntryKind, content?: string): void {
    this.mkdir(dir);
    const parent = this.get(dir)!;
    if (parent.children!.has(name)) return;
    const n = newNode(kind);
    n.content = content;
    parent.children!.set(name, n);
  }

  addScript(dir: string, name: string): void {
    this.addLeaf(dir, name, 'script');
  }

  addFile(dir: string, name: string, content = ''): void {
    this.addLeaf(dir, name, 'file', content);
  }

  /** Adds a directory-like node that leads to `target`. Removing it never touches the target. */
  link(dir: string, name: string, target: string): void {
    this.mkdir(dir);
    const parent = this.get(dir)!;
    if (parent.children!.has(name)) return;
    const n = newNode('dir');
    n.target = target;
    parent.children!.set(name, n);
  }

  remove(path: string): void {
    const segs = segments(path);
    const name = segs.pop();
    if (!name) return;
    this.get('/' + segs.join('/'))?.children?.delete(name);
  }

  exists(path: string): boolean {
    return this.get(path) !== undefined;
  }

  isDir(path: string): boolean {
    return this.get(path)?.kind === 'dir';
  }

  stat(path: string): (Entry & { forceVisible: boolean; content?: string; target?: string }) | undefined {
    const n = this.get(path, false);
    if (!n) return undefined;
    const name = segments(path).at(-1) ?? '';
    return { name, kind: n.kind, hidden: this.effectiveHidden(name, n), forceVisible: n.forceVisible, content: n.content, target: n.target };
  }

  list(dir: string, opts: { all: boolean }): Entry[] {
    const node = this.get(dir);
    if (!node?.children) return [];
    const out: Entry[] = [];
    for (const [name, n] of node.children) {
      const hidden = this.effectiveHidden(name, n);
      if (hidden && !opts.all) continue;
      out.push({ name, kind: n.kind, hidden });
    }
    return out;
  }

  /** Finds the stored name of a child, optionally ignoring letter case. */
  find(dir: string, name: string, ignoreCase: boolean): string | undefined {
    const kids = this.get(dir)?.children;
    if (!kids) return undefined;
    if (kids.has(name)) return name;
    if (!ignoreCase) return undefined;
    const lower = name.toLowerCase();
    for (const k of kids.keys()) if (k.toLowerCase() === lower) return k;
    return undefined;
  }

  setHidden(path: string, hidden: boolean): void {
    const n = this.get(path, false);
    if (n) n.hidden = hidden;
  }

  setForceVisible(path: string, visible: boolean): void {
    const n = this.get(path, false);
    if (n) n.forceVisible = visible;
  }
}
