import type Phaser from 'phaser';

type Tex = Phaser.Textures.TextureManager;

function canvas(textures: Tex, key: string, w: number, h: number) {
  if (textures.exists(key)) textures.remove(key);
  const tex = textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  return { tex, ctx };
}

const px = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

/** Two walk frames of a simple 16x16 body, so the photo head can sit on top. */
export function makeBody(textures: Tex, shirt: string): void {
  for (const frame of [0, 1]) {
    const { tex, ctx } = canvas(textures, `body${frame}`, 16, 16);
    px(ctx, shirt, 3, 0, 10, 8); // torso
    px(ctx, '#e8b88a', 1, 1, 2, 6); // arms
    px(ctx, '#e8b88a', 13, 1, 2, 6);
    px(ctx, '#33415c', frame ? 3 : 4, 8, 4, 8); // legs, alternating
    px(ctx, '#33415c', frame ? 9 : 8, 8, 4, 7);
    tex.refresh();
  }
}

/** A coloured head with the character's initial, used until the owner supplies a photo. */
export function makePlaceholderHead(textures: Tex, color: string, initial: string): void {
  const { tex, ctx } = canvas(textures, 'head', 16, 16);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(1, 1, 14, 14, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, 8, 9);
  tex.refresh();
}

/** Crops the photo to a square, shrinks it to a tiny size and draws it as a chunky 16x16 head. */
export function makePhotoHead(textures: Tex, img: CanvasImageSource & { width: number; height: number }): void {
  const size = Math.min(img.width, img.height);
  const sx = (img.width - size) / 2;
  const sy = (img.height - size) * 0.15;
  const small = document.createElement('canvas');
  small.width = small.height = 12;
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(img, sx, sy, size, size, 0, 0, 12, 12);
  const { tex, ctx } = canvas(textures, 'head', 16, 16);
  ctx.beginPath();
  ctx.roundRect(1, 1, 14, 14, 5);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, 12, 12, 1, 1, 14, 14);
  tex.refresh();
}

const OUTLINE = '#2b2d3a';

/** Fills a rectangle with a dark 1 px outline. */
const boxed = (ctx: CanvasRenderingContext2D, fill: string, x: number, y: number, w: number, h: number) => {
  px(ctx, OUTLINE, x, y, w, h);
  px(ctx, fill, x + 1, y + 1, w - 2, h - 2);
};

/** Things the free LimeZu pack lacks, drawn in the same flat style on a 16 px grid. */
export function makeEntityArt(textures: Tex): void {
  {
    // toilet: tank on top, bowl below (16x32, feet at the bottom edge)
    const { tex, ctx } = canvas(textures, 'toilet', 16, 32);
    boxed(ctx, '#f5f5f8', 3, 6, 10, 9); // tank
    px(ctx, '#c9ccd6', 4, 7, 8, 1);
    boxed(ctx, '#fafafc', 2, 15, 12, 12); // bowl
    px(ctx, '#aad2e6', 5, 18, 6, 6); // water
    px(ctx, OUTLINE, 5, 18, 6, 1);
    px(ctx, OUTLINE, 6, 27, 4, 3); // base
    px(ctx, '#d6d9e2', 4, 8, 1, 1);
    tex.refresh();
  }
  {
    // bathtub: 32x16
    const { tex, ctx } = canvas(textures, 'bathtub', 32, 16);
    boxed(ctx, '#f3f5f8', 1, 3, 30, 12); // rim and body
    boxed(ctx, '#aad2e6', 3, 5, 26, 7); // water
    px(ctx, '#ffffff', 5, 6, 6, 1); // shine
    px(ctx, OUTLINE, 2, 15, 3, 1); // feet
    px(ctx, OUTLINE, 27, 15, 3, 1);
    boxed(ctx, '#b8bcc8', 28, 0, 3, 4); // tap
    tex.refresh();
  }
  {
    // cage: one tile, wooden frame with bars and a dim glass back
    const { tex, ctx } = canvas(textures, 'cage', 16, 16);
    px(ctx, OUTLINE, 1, 2, 14, 13);
    px(ctx, '#dfe3ea', 2, 4, 12, 9);
    for (let x = 4; x < 14; x += 3) px(ctx, '#7c5a36', x, 4, 1, 9);
    boxed(ctx, '#a8773f', 1, 2, 14, 3); // top rail
    boxed(ctx, '#a8773f', 1, 12, 14, 3); // base
    tex.refresh();
  }
  {
    // snake: a wavy green body with a head, eye and tongue
    const { tex, ctx } = canvas(textures, 'snake', 16, 16);
    const body = '#3fa34d';
    const seg = (x: number, y: number, w: number, h: number) => {
      px(ctx, OUTLINE, x - 1, y - 1, w + 2, h + 2);
    };
    const parts: [number, number, number, number][] = [[2, 10, 3, 2], [4, 8, 3, 2], [6, 10, 3, 2], [8, 8, 3, 2], [10, 6, 4, 4]];
    for (const [x, y, w, h] of parts) seg(x, y, w, h);
    for (const [x, y, w, h] of parts) px(ctx, body, x, y, w, h);
    px(ctx, '#ffffff', 12, 7, 1, 1); // eye
    px(ctx, '#d33', 14, 8, 2, 1); // tongue
    tex.refresh();
  }
  {
    const { tex, ctx } = canvas(textures, 'blob', 12, 12);
    px(ctx, '#7a5cc7', 1, 1, 10, 10);
    px(ctx, '#b9a6f0', 3, 3, 4, 4);
    tex.refresh();
  }
}

/** Small icons that float up when the character does something (`play(anim)`), in the same flat outlined style. */
export function makeEffectArt(textures: Tex): void {
  const icon = (key: string, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const { tex, ctx } = canvas(textures, `fx-${key}`, 14, 14);
    draw(ctx);
    tex.refresh();
  };
  icon('drink', (ctx) => {
    boxed(ctx, '#e8a317', 2, 4, 8, 9); // mug
    px(ctx, '#f6c94c', 3, 6, 2, 5); // shine
    boxed(ctx, '#ffffff', 2, 2, 8, 3); // foam
    px(ctx, OUTLINE, 10, 6, 3, 1); // handle
    px(ctx, OUTLINE, 12, 7, 1, 3);
    px(ctx, OUTLINE, 10, 10, 3, 1);
  });
  icon('tiss', (ctx) => {
    for (const [x, y] of [[3, 1], [8, 4], [4, 8]]) {
      px(ctx, OUTLINE, x, y, 3, 5); // drop outline
      px(ctx, '#4aa3df', x + 1, y + 1, 1, 3);
      px(ctx, '#4aa3df', x, y + 2, 3, 2);
      px(ctx, '#bfe3f7', x + 1, y + 2, 1, 1);
    }
  });
  icon('laugh', (ctx) => {
    px(ctx, OUTLINE, 3, 1, 8, 12);
    px(ctx, OUTLINE, 1, 3, 12, 8);
    px(ctx, '#ffd23f', 3, 2, 8, 10);
    px(ctx, '#ffd23f', 2, 3, 10, 8);
    px(ctx, OUTLINE, 3, 4, 3, 1); // closed eyes
    px(ctx, OUTLINE, 8, 4, 3, 1);
    px(ctx, OUTLINE, 3, 7, 8, 1); // open mouth
    px(ctx, '#ffffff', 4, 8, 6, 1);
    px(ctx, OUTLINE, 4, 9, 6, 1);
    px(ctx, '#4aa3df', 1, 6, 1, 2); // tear
  });
  icon('cash', (ctx) => {
    boxed(ctx, '#3fa34d', 0, 3, 14, 8);
    px(ctx, '#8fd19a', 2, 5, 10, 4);
    px(ctx, OUTLINE, 6, 4, 2, 6); // $
    px(ctx, '#3fa34d', 5, 5, 4, 1);
    px(ctx, '#3fa34d', 5, 8, 4, 1);
    px(ctx, OUTLINE, 5, 5, 3, 1);
    px(ctx, OUTLINE, 6, 7, 3, 1);
    px(ctx, OUTLINE, 5, 9, 3, 1);
  });
  icon('spark', (ctx) => {
    px(ctx, OUTLINE, 5, 1, 4, 12);
    px(ctx, OUTLINE, 1, 5, 12, 4);
    px(ctx, '#ffd23f', 6, 2, 2, 10);
    px(ctx, '#ffd23f', 2, 6, 10, 2);
  });
}

/** The robber look (ski mask over the 16x16 head, small pistol) and the dynamite flash and smoke puffs. */
export function makeRobberArt(textures: Tex): void {
  {
    const { tex, ctx } = canvas(textures, 'fx-mask', 16, 16);
    px(ctx, OUTLINE, 1, 2, 14, 13); // knitted cap and face cover, rounded by clipping the corners
    px(ctx, '#2a2a33', 2, 3, 12, 11);
    px(ctx, '#3a3a46', 2, 5, 12, 1); // knit rows
    px(ctx, '#3a3a46', 2, 11, 12, 1);
    px(ctx, '#e8b88a', 3, 7, 4, 2); // eye slits
    px(ctx, '#e8b88a', 9, 7, 4, 2);
    px(ctx, '#ffffff', 4, 7, 1, 1);
    px(ctx, '#ffffff', 10, 7, 1, 1);
    for (const [x, y] of [[1, 2], [14, 2], [1, 14], [14, 14]]) ctx.clearRect(x, y, 1, 1);
    tex.refresh();
  }
  {
    const { tex, ctx } = canvas(textures, 'fx-gun', 10, 7);
    px(ctx, OUTLINE, 0, 0, 9, 4); // slide
    px(ctx, '#6b7280', 1, 1, 7, 2);
    px(ctx, '#d1d5db', 1, 1, 4, 1);
    px(ctx, OUTLINE, 1, 4, 4, 3); // grip
    px(ctx, '#3b3f4a', 2, 4, 2, 2);
    tex.refresh();
  }
  {
    const { tex, ctx } = canvas(textures, 'fx-flash', 16, 16);
    px(ctx, '#ffd23f', 6, 0, 4, 16);
    px(ctx, '#ffd23f', 0, 6, 16, 4);
    px(ctx, '#ffffff', 4, 4, 8, 8);
    px(ctx, '#ff9f1c', 2, 2, 2, 2);
    px(ctx, '#ff9f1c', 12, 2, 2, 2);
    px(ctx, '#ff9f1c', 2, 12, 2, 2);
    px(ctx, '#ff9f1c', 12, 12, 2, 2);
    tex.refresh();
  }
  {
    const { tex, ctx } = canvas(textures, 'fx-smoke', 8, 8);
    px(ctx, '#9aa0ac', 1, 2, 6, 4);
    px(ctx, '#9aa0ac', 2, 1, 4, 6);
    px(ctx, '#c9ccd6', 2, 2, 3, 2);
    tex.refresh();
  }
}
