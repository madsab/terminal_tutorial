import type Phaser from 'phaser';
import type { SceneApi } from '../../tasks/api.js';
import { ActionQueue } from './action-queue.js';
import { resolveHead } from './head.js';
import { chooseMap, tilesetUrlPath } from './map-choice.js';
import { contentBounds, fitView, parseMap, type MapData, type Point, type SpriteObject } from './map-data.js';
import { makeBody, makeEffectArt, makeEntityArt, makePhotoHead, makeRobberArt, makePlaceholderHead } from './placeholder-art.js';
import { defaultArea, nextFreeTile, tileKey } from './placement.js';
import { findPath } from './pathfinder.js';
import { fleeing } from './stampede.js';

export type MountedScene = SceneApi & { destroy(): void };

const SPEED = 80; // px per second
const EFFECTS = new Set(['drink', 'tiss', 'laugh', 'cash']);

interface Entity {
  obj: Phaser.GameObjects.Container;
  /** The name tag, drawn above the `above` layer so it stays readable. It follows `obj`. */
  label?: Phaser.GameObjects.Text;
  labelLift: number;
  kind: string;
  wandering: boolean;
  nextWander: number;
}

const here = (path: string) => new URL(path, document.baseURI).href;

type TilesetRef = { name: string; image: string };
type BodyName = 'Adam' | 'Alex' | 'Amelia' | 'Bob';
/** Order of the direction blocks in the LimeZu character sheets. */
const DIRS = ['right', 'up', 'left', 'down'] as const;
const DOWN = 3;
const BODIES: string[] = ['Adam', 'Alex', 'Amelia', 'Bob'];
const LABEL_DEPTH = 25; // over `above` (20), under speech bubbles (30)
const PHOTO_HEAD_Y = -8; // LimeZu body: rows 0-8 are empty, the drawn head starts at row 9, so the photo sits 8px lower
const LAYER_DEPTH: Record<string, number> = { ground: 0, walls: 1, furniture: 2, above: 20 };
/** The bank's right-hand plant: Interiors_free sheet (col 13, row 44, 2x2 tiles), standing on map tiles (13, 7). */
/** The cake on the table: a tile of the `above` layer. */
const CAKE = { x: 16, y: 10 };
const PLANT = { tileset: 'Interiors_free_16x16', sheet: { x: 13 * 16, y: 44 * 16 }, tile: { x: 13, y: 7 }, size: 2 };

const probeImage = (url: string) =>
  new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });

/** Names of the LimeZu tilesets in `json` whose image can't be loaded. The placeholder tileset is always there. */
async function probeTilesets(json: { tilesets: TilesetRef[] }): Promise<Set<string>> {
  const missing = new Set<string>();
  await Promise.all(
    json.tilesets
      .filter((ts) => ts.name !== 'placeholder')
      .map(async (ts) => {
        if (!(await probeImage(here(tilesetUrlPath(ts.image))))) missing.add(ts.name);
      }),
  );
  return missing;
}

/**
 * Mounts a Phaser scene in `el` showing the Tiled map `mapName` (from maps/) with the controlled character.
 * Every SceneApi call returns at once. The terminal never waits on an animation.
 */
export async function mountScene(
  el: HTMLElement,
  mapName: string,
  character: { name: string; head: string; body?: BodyName },
): Promise<MountedScene> {
  const bodyName: BodyName = character.body ?? 'Adam';
  let chosenMap = mapName;
  let json = await (await fetch(here(`maps/${mapName}`))).json();
  const missingTilesets = await probeTilesets(json);
  chosenMap = chooseMap(mapName, missingTilesets);
  if (chosenMap !== mapName) json = await (await fetch(here(`maps/${chosenMap}`))).json();
  const data = parseMap(json);
  const Phaser = (await import('phaser')).default;
  const T = data.tileWidth;

  class View extends Phaser.Scene implements SceneApi {
    private queue = new ActionQueue();
    private body!: Phaser.GameObjects.Sprite;
    private head!: Phaser.GameObjects.Sprite;
    private hero!: Phaser.GameObjects.Container;
    private lyingDown = false;
    private plantDown = false;
    private tileLayers = new Map<string, Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer>();
    /** Every standing character from the `sprites` layer, for the stampede. */
    private npcs: { o: SpriteObject; sprite: Phaser.GameObjects.Sprite }[] = [];
    private path: Point[] = [];
    private busy = false;
    private walkToken = 0;
    private entities = new Map<string, Entity>();
    private bubble?: Phaser.GameObjects.Text;
    private bubbleTimer?: Phaser.Time.TimerEvent;
    private frameClock = 0;
    private ready = false;
    private buffered: (() => void)[] = [];
    private missingHead = false;
    private missingBody = false;
    private limezu = false;
    private facing = DOWN;

    constructor() {
      super('view');
    }

    preload() {
      this.load.on('loaderror', (f: { key: string }) => {
        if (f.key === 'headphoto') this.missingHead = true;
        if (f.key === 'body-idle' || f.key === 'body-run') this.missingBody = true;
      });
      this.load.tilemapTiledJSON('map', here(`maps/${chosenMap}`));
      for (const ts of json.tilesets as TilesetRef[]) {
        this.load.image(`ts-${ts.name}`, here(tilesetUrlPath(ts.image, ts.name === 'placeholder')));
      }
      const frame = { frameWidth: 16, frameHeight: 32 };
      this.load.spritesheet('body-idle', here(`local-assets/limezu/Characters_free/${bodyName}_idle_16x16.png`), frame);
      this.load.spritesheet('body-run', here(`local-assets/limezu/Characters_free/${bodyName}_run_16x16.png`), frame);
      for (const n of new Set(data.sprites.map((o) => o.name).filter((n) => BODIES.includes(n as BodyName)))) {
        this.load.spritesheet(`npc-${n}`, here(`local-assets/limezu/Characters_free/${n}_idle_16x16.png`), frame);
      }
      this.load.image('headphoto', here(`local-assets/heads/${character.head}`));
    }

    create() {
      const map = this.make.tilemap({ key: 'map' });
      const tilesets = (json.tilesets as { name: string }[]).map((ts) => {
        const key = this.textures.exists(`ts-${ts.name}`) ? `ts-${ts.name}` : 'ts-placeholder';
        if (key === 'ts-placeholder' && ts.name !== 'placeholder') console.warn(`Mangler tileset «${ts.name}», bruker plassholder.`);
        return map.addTilesetImage(ts.name, key)!;
      });
      // Optional layers are skipped when the map doesn't have them. `above` is drawn over the character.
      for (const l of Object.keys(LAYER_DEPTH)) if (data.tileLayers.includes(l)) {
        const layer = map.createLayer(l, tilesets);
        if (layer) this.tileLayers.set(l, layer.setDepth(LAYER_DEPTH[l]));
      }

      if (missingTilesets.size > 0 || this.missingBody) console.warn('Mangler LimeZu-grafikk, bruker plassholderkart og plassholderfigur.');
      this.limezu = !this.missingBody && this.textures.exists('body-idle') && this.textures.exists('body-run');
      makeBody(this.textures, '#c0392b');
      makeEntityArt(this.textures);
      makeEffectArt(this.textures);
      makeRobberArt(this.textures);
      const available = new Set<string>();
      if (!this.missingHead && this.textures.exists('headphoto')) available.add(character.head);
      const spec = resolveHead(character.head, available);
      if (spec.kind === 'photo') makePhotoHead(this.textures, this.textures.get('headphoto').getSourceImage() as HTMLImageElement);
      else if (!this.limezu) makePlaceholderHead(this.textures, spec.color, spec.initial);

      if (this.limezu) {
        DIRS.forEach((d, i) =>
          this.anims.create({ key: `walk-${d}`, frames: this.anims.generateFrameNumbers('body-run', { start: i * 6, end: i * 6 + 5 }), frameRate: 6, repeat: -1 }),
        );
      } else this.anims.create({ key: 'walk', frames: [{ key: 'body0' }, { key: 'body1' }], frameRate: 6, repeat: -1 });
      this.body = this.limezu ? this.add.sprite(0, 0, 'body-idle', DOWN) : this.add.sprite(0, 0, 'body0');
      this.body.setOrigin(0.5, 1);
      // The photo covers the top 16x16 of the 16x32 LimeZu sprite; without a photo the plain LimeZu head shows.
      this.head = this.add.sprite(0, this.limezu ? PHOTO_HEAD_Y : -14, 'head').setOrigin(0.5, 1);
      this.head.setVisible(!this.limezu || spec.kind === 'photo');
      this.placeSprites();
      this.hero = this.add.container(0, 0, [this.body, this.head]).setDepth(10);
      const start = Object.values(data.spots)[0] ?? { x: 1, y: 1 };
      this.place(this.hero, start);

      this.ready = true;
      for (const f of this.buffered.splice(0)) f();
    }

    /** The optional `sprites` layer: custom textures (toilet, bathtub) and static characters from the LimeZu sheets. */
    private placeSprites() {
      for (const o of data.sprites) {
        const isBody = BODIES.includes(o.name);
        const key = isBody ? `npc-${o.name}` : o.name;
        if (!this.textures.exists(key)) continue; // missing art: leave it out, the level still plays
        const sprite = isBody ? this.add.sprite(o.x, o.y, key, DIRS.indexOf(o.facing ?? 'down')) : this.add.sprite(o.x, o.y, key);
        sprite.setOrigin(0.5, 1).setDepth(o.depth ?? (isBody ? 3 : 2.5));
        if (isBody) {
          this.npcs.push({ o, sprite });
          this.idleTurn(sprite);
        }
      }
    }

    /** Standing characters from the `sprites` layer look in a random direction every 3-7 seconds. */
    private idleTurn(sprite: Phaser.GameObjects.Sprite) {
      const turn = () => {
        this.time.delayedCall(Phaser.Math.Between(3000, 7000), () => {
          if (!sprite.active) return;
          sprite.setFrame(Phaser.Math.Between(0, DIRS.length - 1));
          turn();
        });
      };
      turn();
    }

    private center(p: Point) {
      return { x: p.x * T + T / 2, y: p.y * T + T - 2 };
    }

    private place(obj: Phaser.GameObjects.Container, p: Point) {
      const c = this.center(p);
      obj.setPosition(c.x, c.y);
    }

    private tileOf(obj: { x: number; y: number }): Point {
      return { x: Math.min(data.width - 1, Math.max(0, Math.floor(obj.x / T))), y: Math.min(data.height - 1, Math.max(0, Math.floor((obj.y + 2) / T - 0.01))) };
    }

    /** A spot name, or the id of an object already in the scene (e.g. a cage). */
    private pointOf(ref: string): Point | undefined {
      if (data.spots[ref]) return data.spots[ref];
      const e = this.entities.get(ref);
      return e ? this.tileOf(e.obj) : undefined;
    }

    private defer(f: () => void) {
      if (this.ready) f();
      else this.buffered.push(f);
    }

    // ---- SceneApi ----

    walkTo(spot: string) {
      this.defer(() => {
        if (!this.pointOf(spot)) return;
        if (this.queue.push({ type: 'walkTo', spot }) === 'preempt') this.startNext(true);
      });
    }

    play(anim: string) {
      this.defer(() => {
        this.queue.push({ type: 'play', anim });
        if (!this.busy) this.startNext(false);
      });
    }

    say(text: string) {
      this.defer(() => {
        this.bubble?.destroy();
        this.bubbleTimer?.remove();
        this.bubble = this.add
          .text(0, 0, text, { fontFamily: 'monospace', fontSize: '8px', color: '#111', backgroundColor: '#fffbe6', padding: { x: 3, y: 2 }, wordWrap: { width: 110 } })
          .setOrigin(0.5, 1)
          .setDepth(30);
        this.bubbleTimer = this.time.delayedCall(3500, () => this.bubble?.destroy());
      });
    }

    spawn(id: string, kind: string, spot: string, label?: string) {
      this.defer(() => {
        this.remove(id);
        const p = this.pointOf(spot);
        if (!p) return;
        const tex = this.textures.exists(kind) ? kind : 'blob';
        const sprite = this.add.sprite(0, 0, tex).setOrigin(0.5, 1);
        const obj = this.add.container(0, 0, [sprite]).setDepth(kind === 'cage' ? 4 : 6);
        const slot = this.slotFor(kind, spot, p);
        const c = this.center(slot.tile);
        obj.setPosition(c.x + slot.dx, c.y + slot.dy);
        const entity: Entity = { obj, kind, wandering: false, nextWander: 0, labelLift: sprite.height + 1 };
        if (label) {
          // Neighbouring cages are narrower than their names, so every second column lifts its tag a little.
          entity.labelLift += (this.tileOf(obj).x % 2) * 9;
          entity.label = this.add
            .text(obj.x, obj.y - entity.labelLift, label, { fontFamily: 'monospace', fontSize: '8px', color: '#fff', backgroundColor: '#000c', padding: { x: 2, y: 0 } })
            .setOrigin(0.5, 1)
            .setDepth(LABEL_DEPTH);
        }
        this.entities.set(id, entity);
      });
    }

    /**
     * Where a new object stands. Cages take the next free floor tile of their room. Things spawned on an object (snakes in
     * a cage) stay on its tile with a tiny offset. Everything else, and cages in a full room, get today's jitter.
     */
    private slotFor(kind: string, spot: string, p: Point): { tile: Point; dx: number; dy: number } {
      const sameTile = (t: Point) => [...this.entities.values()].filter((e) => e.kind === kind && this.tileOf(e.obj).x === t.x && this.tileOf(e.obj).y === t.y).length;
      if (!data.spots[spot]) {
        const n = sameTile(p);
        return { tile: p, dx: ((n * 3) % 7) - 3, dy: -((n * 2) % 3) };
      }
      if (kind === 'cage') {
        // The spot itself is where the character stands, so cages ring around it instead of covering him.
        const taken = new Set<string>([tileKey(p)]);
        for (const e of this.entities.values()) if (e.kind === 'cage') taken.add(tileKey(this.tileOf(e.obj)));
        const free = nextFreeTile(data.areas[spot] ?? defaultArea(p), p, taken, data.blocked);
        if (free) return { tile: free, dx: 0, dy: 0 };
      }
      const n = sameTile(p);
      return { tile: p, dx: ((n * 5) % 11) - 5, dy: -((n * 3) % 7) };
    }

    move(id: string, spot: string) {
      this.defer(() => {
        const e = this.entities.get(id);
        const p = this.pointOf(spot);
        if (!e || !p) return;
        e.wandering = false;
        const c = this.center(p);
        this.tweens.add({ targets: e.obj, x: c.x, y: c.y, duration: 250 });
      });
    }

    wander(id: string) {
      this.defer(() => {
        const e = this.entities.get(id);
        if (e) e.wandering = true;
      });
    }

    remove(id: string) {
      this.defer(() => {
        const e = this.entities.get(id);
        e?.obj.destroy();
        e?.label?.destroy();
        this.entities.delete(id);
      });
    }

    // ---- action loop ----

    private startNext(preempt: boolean) {
      if (preempt) {
        this.path = [];
        this.walkToken++;
        this.settleHero();
        this.busy = false;
        this.body.anims.stop();
      }
      if (this.busy) return;
      const action = this.queue.next();
      if (!action) return;
      this.busy = true;
      if (action.type === 'walkTo') this.beginWalk(action.spot);
      else this.beginPlay(action.anim);
    }

    /** Finish the current play after a delay, unless a walk preempted it meanwhile (a stale finish would cut the new walk short). */
    private finishLater(ms: number) {
      const token = this.walkToken;
      this.time.delayedCall(ms, () => token === this.walkToken && this.finish());
    }

    private finish() {
      this.busy = false;
      this.body.anims.stop();
      this.showIdle();
      this.startNext(false);
    }

    private showIdle() {
      if (this.limezu) this.body.setTexture('body-idle', this.facing);
      else this.body.setTexture('body0');
    }

    private beginWalk(spot: string) {
      const target = this.pointOf(spot)!;
      const token = ++this.walkToken;
      void findPath(data.blocked, this.tileOf(this.hero), target).then((path) => {
        if (token !== this.walkToken) return;
        if (!path || path.length < 2) return this.finish();
        this.path = path.slice(1);
        this.body.anims.play(this.limezu ? `walk-${DIRS[this.facing]}` : 'walk');
      });
    }

    /** Persistent: lie down on the floor. Rotating around the feet puts the body one tile to the right, so shift left by T. */
    private passOut() {
      this.body.anims.stop();
      this.showIdle();
      if (!this.lyingDown) {
        this.lyingDown = true;
        this.tweens.add({ targets: this.hero, angle: 90, x: this.hero.x - T, duration: 400 });
      }
      this.finishLater(450);
    }

    private bobbing = false;
    private restY = 0;

    /** Finish a bob still in flight so the hero is back on the tile's rest y. */
    private settleHero() {
      if (!this.bobbing) return;
      this.tweens.killTweensOf(this.hero);
      this.hero.y = this.restY;
      this.bobbing = false;
    }

    private bobHero() {
      if (this.lyingDown) return;
      this.bobbing = true;
      this.tweens.add({ targets: this.hero, y: this.restY - 3, yoyo: true, duration: 120, repeat: 1, onComplete: () => (this.bobbing = false) });
    }

    private beginPlay(anim: string) {
      this.settleHero();
      this.restY = this.hero.y;
      if (anim === 'besvim') return this.passOut();
      if (anim === 'robber') {
        this.putOnRobberGear();
        this.stampede();
      }
      else if (anim === 'dynamite') this.dynamiteBurst();
      else if (anim === 'police') this.policeLights();
      if (anim === 'robber' || anim === 'dynamite' || anim === 'police') {
        this.bobHero();
        this.finishLater(anim === 'police' ? 300 : 500);
        return;
      }
      if (anim === 'girl-flee') {
        const girl = this.npcs.find((n) => n.o.role === 'girl');
        if (girl) this.runOut(girl.o, girl.sprite, 'Aaaaaaahhhhh', 0);
        this.bobHero();
        this.finishLater(500);
        return;
      }
      if (anim === 'spis-kake') this.eatCake();
      if (anim === 'velt-plante') {
        this.fallPlant();
        this.bobHero();
        this.finishLater(500);
        return;
      }
      if (anim === 'tiss') this.peeStain();
      const icon = this.add.image(this.hero.x, this.hero.y - 34, EFFECTS.has(anim) ? `fx-${anim}` : 'fx-spark').setOrigin(0.5).setDepth(40);
      this.tweens.add({ targets: icon, y: icon.y - 14, alpha: 0, duration: 700, onComplete: () => icon.destroy() });
      this.bobHero();
      this.finishLater(500);
    }

    /** Persistent: a yellow puddle on the floor where he stands. A scene child, so it stays put when he walks on. */
    private peeStain() {
      const stain = this.add.ellipse(this.hero.x, this.restY - 1, 14, 6, 0xe8d33a, 0.75).setName('tiss-stain').setDepth(1.5).setScale(0.2);
      this.tweens.add({ targets: stain, scale: 1, duration: 600 });
    }

    /** Persistent: the plant tiles (not the floor under them) are cut out of the map and drawn again lying on their side, with dirt on the floor. Safe to call twice. */
    private fallPlant() {
      if (this.plantDown) return;
      this.plantDown = true;
      const { tile, size, sheet } = PLANT;
      const key = `ts-${PLANT.tileset}`;
      for (const name of ['furniture', 'above']) for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) this.tileLayers.get(name)?.removeTileAt(tile.x + dx, tile.y + dy);
      const cx = (tile.x + size / 2) * T;
      const cy = (tile.y + size / 2) * T;
      const dirt = (x: number, y: number, w: number, h: number) =>
        this.add.ellipse(x, y, w, h, 0x5a3a1e, 0.9).setName('plant-dirt').setDepth(1.5);
      dirt(cx - 4, cy + 6, 26, 10);
      dirt(cx + 10, cy + 10, 10, 5);
      dirt(cx - 14, cy + 11, 8, 4);
      if (!this.textures.exists(key)) return; // placeholder map: only the dirt
      const tex = this.textures.get(key);
      if (!tex.has('plant')) tex.add('plant', 0, sheet.x, sheet.y, size * T, size * T);
      this.add.image(cx - 8, cy, key, 'plant').setName('fallen-plant').setDepth(2.6).setAngle(-90);
    }

    /** Persistent: mask over the head and a pistol at the hand, as children of the hero so they follow every walk. Safe to call twice. */
    private putOnRobberGear() {
      if (this.hero.getByName('robber-mask')) return;
      const mask = this.add.image(0, this.limezu && !this.head.visible ? -11 : this.head.y, 'fx-mask').setOrigin(0.5, 1).setName('robber-mask');
      const gun = this.add.image(8, this.limezu ? -8 : this.head.y + 8, 'fx-gun').setOrigin(0.5, 0.5).setName('robber-gun');
      this.hero.add([mask, gun]);
    }

    /** Persistent: everyone but the staff screams and runs out through the entrance, twice as fast as the hero walks. */
    private stampede() {
      const crowd = new Set(fleeing(this.npcs.map((n) => n.o)));
      for (const { o, sprite } of this.npcs) if (crowd.has(o)) this.runOut(o, sprite, 'AAAH!', Phaser.Math.Between(0, 400));
    }

    /** One character shouts `text` and runs out through the entrance, then disappears. A character already running is left alone. */
    private runOut(o: SpriteObject, sprite: Phaser.GameObjects.Sprite, text: string, delay: number) {
      const exit = data.spots['inngang'];
      if (!sprite.active || sprite.getData('fleeing')) return;
      sprite.setData('fleeing', true);
      const scream = this.add
        .text(sprite.x, sprite.y - 26, text, { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#c00', backgroundColor: '#fffbe6', padding: { x: 2, y: 1 } })
        .setOrigin(0.5, 1)
        .setDepth(35);
      const follow = () => scream.setPosition(sprite.x, sprite.y - 26);
      const leave = () => {
        scream.destroy();
        sprite.destroy();
      };
      const fadeOut = () => this.tweens.add({ targets: [sprite, scream], alpha: 0, duration: 400, onComplete: leave });
      this.time.delayedCall(delay, () => {
        if (!sprite.active) return scream.destroy();
        if (!exit) return fadeOut();
        void findPath(data.blocked, { x: Math.floor(o.x / T), y: Math.floor(o.y / T) - 1 }, exit).then((path) => {
          if (!sprite.active) return scream.destroy();
          if (!path) return fadeOut();
          const route = [...path.slice(1).map((p) => this.center(p)), { x: this.center(exit).x, y: this.center(exit).y + T }];
          const step = () => {
            const next = route.shift();
            if (!next) return leave();
            const dx = next.x - sprite.x;
            const dy = next.y - sprite.y;
            sprite.setFrame(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy < 0 ? 1 : DOWN);
            this.tweens.add({ targets: sprite, x: next.x, y: next.y, duration: (Math.hypot(dx, dy) / (SPEED * 2)) * 1000, onUpdate: follow, onComplete: step });
          };
          step();
        });
      });
    }

    /** Persistent: the cake's tile is cut out of the `above` layer. The table tiles under it stay. Safe to call twice. */
    private eatCake() {
      this.tileLayers.get('above')?.removeTileAt(CAKE.x, CAKE.y);
    }

    private dynamiteBurst() {
      const flash = this.add.image(this.hero.x, this.hero.y - 14, 'fx-flash').setDepth(41).setScale(1);
      this.tweens.add({ targets: flash, scale: 3, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
      for (let i = 0; i < 8; i++) {
        const puff = this.add.image(this.hero.x, this.hero.y - 10, 'fx-smoke').setDepth(40).setAlpha(0.9);
        const a = (i / 8) * Math.PI * 2;
        this.tweens.add({
          targets: puff,
          x: puff.x + Math.cos(a) * 18,
          y: puff.y + Math.sin(a) * 12 - 10,
          scale: 2,
          alpha: 0,
          duration: 900,
          onComplete: () => puff.destroy(),
        });
      }
    }

    /** Red and blue wash over the whole map for about two seconds, then removes itself. */
    private policeLights() {
      const wash = this.add.rectangle(0, 0, data.width * T, data.height * T, 0xff0000, 0.3).setOrigin(0, 0).setDepth(50);
      let n = 0;
      this.time.addEvent({
        delay: 250,
        repeat: 7,
        callback: () => {
          n++;
          wash.setFillStyle(n % 2 ? 0x1f4fff : 0xff0000, 0.3);
          if (n === 8) wash.destroy();
        },
      });
    }

    update(time: number, delta: number) {
      if (this.path.length) {
        const next = this.center(this.path[0]);
        const dx = next.x - this.hero.x;
        const dy = next.y - this.hero.y;
        const dist = Math.hypot(dx, dy);
        const step = (SPEED * delta) / 1000;
        if (this.limezu) {
          const dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy < 0 ? 1 : DOWN;
          if (dir !== this.facing || !this.body.anims.isPlaying) {
            this.facing = dir;
            this.body.anims.play(`walk-${DIRS[dir]}`, true);
          }
        } else if (dx !== 0) this.body.setFlipX(dx < 0);
        if (dist <= step) {
          this.hero.setPosition(next.x, next.y);
          this.path.shift();
          if (!this.path.length) this.finish();
        } else this.hero.setPosition(this.hero.x + (dx / dist) * step, this.hero.y + (dy / dist) * step);
      }
      this.bubble?.setPosition(this.hero.x, this.hero.y - 32);
      this.frameClock += delta;
      for (const e of this.entities.values()) e.label?.setPosition(e.obj.x, e.obj.y - e.labelLift);
      for (const e of this.entities.values()) {
        if (!e.wandering || time < e.nextWander) continue;
        e.nextWander = time + 700 + Math.random() * 1500;
        const t = this.tileOf(e.obj);
        const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([ax, ay]) => ({ x: t.x + ax, y: t.y + ay }))
          .filter((p) => data.blocked[p.y]?.[p.x] === false);
        const pick = opts[Math.floor(Math.random() * opts.length)];
        if (pick) {
          const c = this.center(pick);
          this.tweens.add({ targets: e.obj, x: c.x, y: c.y, duration: 450 });
        }
      }
    }
  }

  const view = new View();
  const bounds = contentBounds(data);
  const edge = (json as { backgroundcolor?: string }).backgroundcolor ?? '#1d1d1d';
  el.style.position = 'relative';
  el.style.background = edge;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: el,
    width: Math.max(1, el.clientWidth),
    height: Math.max(1, el.clientHeight),
    pixelArt: true,
    roundPixels: true,
    backgroundColor: edge,
    scale: { mode: Phaser.Scale.NONE },
    scene: view,
  });
  /** The canvas is the host's full size; the camera zooms to the content bounds and centres on them. */
  const fit = () => {
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    game.scale.resize(w, h);
    const { zoom, scrollX, scrollY } = fitView({ w, h }, bounds, T);
    const cam = game.scene.getScene('view')?.cameras?.main;
    cam?.setZoom(zoom).setScroll(scrollX, scrollY);
    el.dataset.zoom = String(zoom);
    el.dataset.contentW = String(bounds.w * T * zoom);
    el.dataset.contentH = String(bounds.h * T * zoom);
  };
  (el as unknown as { __game: Phaser.Game }).__game = game; // lets e2e tests inspect the scene; set before the first data-zoom
  const observer = new ResizeObserver(() => fit());
  observer.observe(el);
  await new Promise<void>((resolve) => {
    const check = () => ((view as unknown as { ready: boolean }).ready ? resolve() : setTimeout(check, 30));
    check();
  });

  fit();

  const api: MountedScene = {
    walkTo: (s) => view.walkTo(s),
    spawn: (a, b, c, d) => view.spawn(a, b, c, d),
    move: (a, b) => view.move(a, b),
    wander: (a) => view.wander(a),
    remove: (a) => view.remove(a),
    play: (a) => view.play(a),
    say: (a) => view.say(a),
    destroy: () => {
      observer.disconnect();
      game.destroy(true);
    },
  };
  return api;
}

export type { MapData };
