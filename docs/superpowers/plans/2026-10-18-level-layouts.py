"""Compose suggested LimeZu layouts for the three tasks. Usage: compose.py <limezu dir> <out dir>"""
import sys
from PIL import Image, ImageDraw, ImageFont

L, OUT = sys.argv[1], sys.argv[2]
I = Image.open(f'{L}/Interiors_free/16x16/Interiors_free_16x16.png').convert('RGBA')
R = Image.open(f'{L}/Interiors_free/16x16/Room_Builder_free_16x16.png').convert('RGBA')
CH = {n: Image.open(f'{L}/Characters_free/{n}_16x16.png').convert('RGBA') for n in ['Adam', 'Alex', 'Amelia', 'Bob']}
T, Z = 16, 4
CEIL = (52, 47, 64, 255)
FONT = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 22)
FONT_S = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 17)


def crop(sheet, c, r, w=1, h=1):
    return sheet.crop((c * T, r * T, (c + w) * T, (r + h) * T))


class Map:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w * T, h * T), CEIL)
        self.objs = []  # (sortY, image, px, py)
        self.labels = []  # (tx, ty, text, kind)

    def floor(self, x0, y0, x1, y1, base, cols=3, rows=1, sheet=R):
        c0, r0 = base
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.img.alpha_composite(crop(sheet, c0 + x % cols, r0 + y % rows), (x * T, y * T))

    def wall(self, x0, x1, y, style_row):
        """Two-tile-high wall face from the room builder (left end, middle, right end), with a light top edge."""
        for x in range(x0, x1 + 1):
            c = 0 if x == x0 else 2 if x == x1 else 1
            self.img.alpha_composite(crop(R, c, style_row, 1, 2), (x * T, y * T))

    def ceil(self, x0, y0, x1, y1):
        d = ImageDraw.Draw(self.img)
        d.rectangle([x0 * T, y0 * T, (x1 + 1) * T - 1, (y1 + 1) * T - 1], fill=CEIL)

    def edge(self):
        """White inner outline where ceiling meets floor or wall, like LimeZu's room border tiles."""
        px = self.img.load()
        W, H = self.img.size
        snap = self.img.copy().load()
        for y in range(H):
            for x in range(W):
                if snap[x, y] != CEIL:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and snap[nx, ny] != CEIL:
                        px[x, y] = (238, 236, 244, 255)
                        break

    def obj(self, sheet, c, r, w, h, x, y, sort=None):
        im = crop(sheet, c, r, w, h)
        self.objs.append(((y + h) if sort is None else sort, im, x * T, y * T))

    def sprite(self, im, px, py, sort):
        self.objs.append((sort, im, px, py))

    def char(self, name, x, y, frame=3):
        im = CH[name].crop((frame * 16, 0, frame * 16 + 16, 32))
        self.objs.append((y + 1, im, x * T, (y - 1) * T))

    def label(self, x, y, text, kind='spot'):
        self.labels.append((x, y, text, kind))

    def render(self, path):
        self.edge()
        for _, im, px, py in sorted(self.objs, key=lambda o: o[0]):
            self.img.alpha_composite(im, (px, py))
        big = self.img.resize((self.w * T * Z, self.h * T * Z), Image.NEAREST)
        d = ImageDraw.Draw(big)
        for x, y, text, kind in self.labels:
            cx, cy = int((x + 0.5) * T * Z), int((y + 0.5) * T * Z)
            f = FONT if kind == 'spot' else FONT_S
            tw = d.textlength(text, font=f)
            pad = 8
            box = [cx - tw / 2 - pad, cy - 16, cx + tw / 2 + pad, cy + 16]
            if kind == 'spot':
                d.rounded_rectangle(box, 8, fill=(23, 25, 30, 235), outline=(255, 255, 255, 255), width=2)
                d.text((cx, cy), text, font=f, fill=(255, 255, 255), anchor='mm')
            else:
                d.rounded_rectangle(box, 8, fill=(255, 246, 224, 240), outline=(110, 71, 0, 255), width=2)
                d.text((cx, cy), text, font=f, fill=(79, 53, 0), anchor='mm')
        big.convert('RGB').save(path)


# ---- custom sprites (not in the free pack) ----
def toilet():
    im = Image.new('RGBA', (16, 32))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([3, 6, 12, 14], 2, fill=(245, 245, 248), outline=(60, 60, 80))  # tank
    d.ellipse([2, 15, 13, 27], fill=(250, 250, 252), outline=(60, 60, 80))  # bowl
    d.ellipse([5, 18, 10, 24], fill=(170, 210, 230))
    return im


def cage():
    im = Image.new('RGBA', (32, 32))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 8, 29, 29], fill=(120, 80, 40, 90), outline=(70, 45, 25))
    d.rectangle([2, 6, 29, 9], fill=(150, 100, 50), outline=(70, 45, 25))
    for x in range(5, 29, 4):
        d.line([(x, 9), (x, 28)], fill=(90, 60, 30))
    d.rectangle([2, 27, 29, 30], fill=(150, 100, 50), outline=(70, 45, 25))
    return im


def snake():
    im = Image.new('RGBA', (16, 16))
    d = ImageDraw.Draw(im)
    pts = [(2, 12), (4, 10), (6, 12), (8, 10), (10, 12), (12, 9)]
    d.line(pts, fill=(40, 120, 40), width=3)
    d.rectangle([11, 7, 14, 10], fill=(60, 150, 60))
    im.putpixel((13, 8), (0, 0, 0, 255))
    return im


WOOD_PLANK = (4, 11)
DARK_WOOD = (4, 13)
HERRING = (11, 13)
YELLOW_TILE = (11, 7)
TEAL_TILE = (11, 9)
GREY_FLOOR = (11, 11)
BRICK = (11, 5)


def homayoon_bar():
    m = Map(20, 12)
    # floors: bar room in dark wood, toilet in teal tiles
    m.floor(1, 3, 18, 10, DARK_WOOD, rows=1)
    m.floor(15, 3, 18, 5, TEAL_TILE, rows=2)
    m.wall(1, 18, 1, 13)  # dark wood wall along the top
    m.wall(15, 18, 1, 9)  # mint wall in the toilet
    # toilet partition: vertical ceiling strip + bottom strip with a door gap
    m.ceil(14, 1, 14, 6)
    m.ceil(14, 6, 18, 6)
    m.floor(16, 6, 16, 6, TEAL_TILE, rows=2)
    # entrance gap in the bottom wall
    m.floor(9, 11, 10, 11, DARK_WOOD)
    # bar: bottle shelves on the wall, counter, stools
    for i, c in enumerate((10, 12, 14)):
        m.obj(I, c, 68, 2, 3, 2 + i * 2, 1)
    for x in (2, 4, 6):
        m.obj(I, 5, 55, 2, 2, x, 4)
    for x, c in ((3, 4), (5, 5), (7, 4)):
        m.obj(I, c, 31, 1, 1, x, 6)
    # windows between bar and toilet
    m.obj(I, 7, 24, 2, 2, 9, 1)
    m.obj(I, 7, 24, 2, 2, 11, 1)
    # tables with round stools and food
    for tx, ty in ((6, 7), (11, 7)):
        m.obj(I, 1, 10, 3, 3, tx, ty)
        m.obj(I, 6, 13, 1, 1, tx - 1, ty + 1)
        m.obj(I, 6, 13, 1, 1, tx + 3, ty + 1)
    m.obj(I, 11, 13, 1, 1, 7, 7, sort=99)
    m.obj(I, 12, 14, 1, 1, 12, 7, sort=99)
    # toilet (custom sprite)
    m.sprite(toilet(), 17 * T, 2 * T, 4)
    # plants
    m.obj(I, 10, 44, 2, 3, 16, 8)
    m.obj(I, 12, 45, 1, 2, 1, 8)
    # Homayoon at the entrance
    m.char('Adam', 9, 10)
    m.label(9.5, 9, 'inngang  ~')
    m.label(4, 7.3, 'bar/')
    m.label(9.5, 6.3, 'bord/')
    m.label(16.5, 4.6, 'toalett/')
    m.label(17, 1.3, 'toalett: egen sprite', 'note')
    m.render(f'{OUT}/layout-bar.png')


def homayoon_bar_v2():
    """Follows the owner's sketch: U-shaped bar along the top wall, entrance top right,
    tables along the right and bottom walls (stools at every table), corner table,
    couch corner with a coffee table, toilet bottom left."""
    m = Map(20, 14)
    m.floor(1, 3, 18, 12, DARK_WOOD, rows=1)
    m.wall(1, 18, 1, 13)
    # toilet room bottom left: ceiling strip on top (door gap at col 2); its right wall runs
    # three tiles further up, making a hallway down the left side to the toilet door
    m.ceil(1, 8, 3, 8)
    m.ceil(3, 5, 3, 12)
    m.floor(1, 9, 2, 12, TEAL_TILE, rows=2)
    m.floor(2, 8, 2, 8, TEAL_TILE, rows=2)
    m.sprite(toilet(), 1 * T, 9 * T, 11)
    # entrance: double door in the top wall, top right
    m.obj(I, 11, 24, 2, 2, 15, 1, sort=0)
    m.obj(I, 7, 24, 2, 2, 2, 1, sort=0)
    # U-shaped bar: bottle shelves on the wall, arms down both sides, front counter, bartender inside
    for i, c in enumerate((10, 12, 14, 10)):
        m.obj(I, c, 68, 2, 3, 6 + i * 2, 1)
    m.obj(I, 4, 10, 1, 3, 5, 3)
    m.obj(I, 4, 10, 1, 3, 14, 3)
    for x in (6, 8, 10, 12):
        m.obj(I, 5, 55, 2, 2, x, 5)
    m.char('Bob', 9, 4)
    # couch corner: one L-shaped couch (sofa facing down on top, sofa facing right below it,
    # left edges aligned so they read as one piece) around a coffee table
    m.obj(I, 7, 72, 3, 2, 4, 7, sort=8.5)
    m.sprite(crop(I, 9, 80, 2, 4), 4 * T, 9 * T - 10, 8.6)  # nudged up so the two parts touch
    m.obj(I, 7, 13, 3, 2, 6, 10)
    # two tables against the right wall, stool at each
    for y in (3, 6):
        m.obj(I, 4, 10, 1, 3, 18, y)
        m.obj(I, 6, 13, 1, 1, 17, y + 1)
    # three two-seat tables against the bottom wall, stools on top
    def table2(x, y):
        m.obj(I, 1, 10, 3, 3, x, y)
    for x in (9, 12, 15):
        table2(x, 10)
        m.obj(I, 6, 13, 1, 1, x, 9)
        m.obj(I, 6, 13, 1, 1, x + 1, 9)
    m.obj(I, 11, 13, 1, 1, 9, 10, sort=99)
    m.obj(I, 12, 14, 1, 1, 16, 10, sort=99)
    # corner table bottom right with a stool
    m.obj(I, 4, 10, 1, 3, 18, 10)
    m.obj(I, 6, 13, 1, 1, 17, 10)
    m.char('Adam', 16, 3)
    m.label(16, 2.2, 'inngang  ~')
    m.label(11, 7.4, 'bar/')
    m.label(11, 9, 'bord/')
    m.label(1.6, 12.4, 'toalett/')
    m.label(9.5, 2.6, 'bartender', 'note')
    m.label(1.5, 5.6, 'gang', 'note')
    m.label(6.5, 12.4, 'sofakrok', 'note')
    m.label(17.5, 12.4, 'hjørnebord', 'note')
    m.render(f'{OUT}/layout-bar-v2.png')


def eeman_bank():
    m = Map(16, 10)
    m.floor(1, 3, 14, 8, GREY_FLOOR, rows=2)
    m.floor(1, 3, 14, 4, HERRING, rows=2)  # staff side behind the counter
    m.wall(1, 14, 1, 17)  # grey wall
    m.floor(7, 9, 8, 9, GREY_FLOOR, rows=2)  # entrance gap
    # teller counter with glass windows
    for x, c in ((2, 6), (3, 8), (4, 6), (5, 7), (6, 8), (7, 6), (8, 7), (9, 8), (10, 6), (11, 7), (12, 8), (13, 6)):
        m.obj(I, c, 33, 1, 2, x, 4)
    # cashiers behind the counter
    m.char('Amelia', 6, 4)
    m.char('Bob', 9, 4)
    # safe (the grey cabinet) and wall decor
    m.obj(I, 12, 40, 1, 2, 13, 2)
    m.obj(I, 10, 66, 2, 2, 3, 1)
    m.obj(I, 9, 24, 2, 2, 9, 1)
    # lobby: rug, waiting sofa, plants
    m.obj(I, 3, 42, 3, 2, 6, 6)
    m.obj(I, 1, 72, 3, 2, 1, 6)
    m.obj(I, 13, 44, 2, 2, 13, 7)
    m.obj(I, 12, 45, 1, 2, 1, 3)
    m.char('Alex', 7, 8)
    m.label(7.5, 8.9, 'inngang  ~')
    m.label(7.5, 6.5, 'skranke')
    m.label(13, 1.3, 'safe (forslag)', 'note')
    m.label(2, 5.4, 'venteområde (forslag)', 'note')
    m.render(f'{OUT}/layout-bank.png')


def aleksander_house():
    m = Map(20, 14)
    # rooms: soverom TL, stue TR, kjokken BL, bad BR
    m.floor(1, 3, 8, 6, WOOD_PLANK)
    m.floor(10, 3, 18, 6, HERRING, rows=2)
    m.floor(1, 10, 8, 12, YELLOW_TILE, rows=2)
    m.floor(10, 10, 18, 12, TEAL_TILE, rows=2)
    m.wall(1, 8, 1, 7)
    m.wall(10, 18, 1, 11)
    m.wall(1, 8, 8, 19)
    m.wall(10, 18, 8, 9)
    # interior walls with door gaps
    m.floor(9, 4, 9, 5, WOOD_PLANK)  # soverom <-> stue
    m.floor(4, 7, 5, 9, YELLOW_TILE, rows=2)  # soverom <-> kjokken
    m.floor(13, 7, 14, 9, HERRING, rows=2)  # stue <-> bad
    m.floor(9, 11, 9, 11, YELLOW_TILE, rows=2)  # kjokken <-> bad
    # soverom: bed, window, plant
    m.obj(I, 0, 0, 3, 5, 1, 1)
    m.obj(I, 4, 24, 3, 2, 5, 1)
    m.obj(I, 12, 45, 1, 2, 8, 3)
    # stue: sofa, fireplace, bookshelf, plant, rug
    m.obj(I, 4, 68, 2, 2, 11, 1)
    m.obj(I, 5, 14, 2, 2, 14, 1)
    m.obj(I, 7, 72, 3, 2, 15, 4)
    m.obj(I, 0, 42, 3, 2, 11, 4)
    m.obj(I, 13, 44, 2, 2, 17, 3)
    # kjokken: fridge, counters with fruit, table
    m.obj(I, 12, 40, 1, 2, 1, 8)
    m.obj(I, 3, 55, 2, 2, 2, 9)
    m.obj(I, 5, 55, 2, 2, 6, 9)
    m.obj(I, 0, 53, 1, 1, 6, 9, sort=50)
    m.obj(I, 7, 13, 3, 2, 2, 11)
    # bad: mirror, toilet (custom)
    m.obj(I, 3, 66, 1, 2, 16, 8)
    m.sprite(toilet(), 17 * T, 9 * T, 11)
    # cages + snakes (custom sprites, spawned by the task at runtime)
    m.sprite(cage(), 5 * T, 4 * T, 6)
    m.sprite(snake(), int(5.5 * T), int(4.8 * T), 6.5)
    m.sprite(snake(), 12 * T, 11 * T, 12)
    m.char('Alex', 13, 5)
    m.label(4.5, 6.4, 'soverom/')
    m.label(14, 6.4, 'stue  ~')
    m.label(4.5, 12.6, 'kjokken/')
    m.label(14.5, 12.6, 'bad/')
    m.label(6, 3.2, 'bur: egen sprite', 'note')
    m.label(12.5, 10.3, 'løs slange', 'note')
    m.label(17, 8.3, 'toalett: egen sprite', 'note')
    m.render(f'{OUT}/layout-house.png')


homayoon_bar()
homayoon_bar_v2()
eeman_bank()
aleksander_house()
