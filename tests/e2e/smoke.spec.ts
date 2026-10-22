import { expect, test, type Page } from '@playwright/test';

async function type(page: Page, line: string) {
  const input = page.locator('.xterm-helper-textarea');
  await input.pressSequentially(line);
  await input.press('Enter');
  await page.waitForTimeout(150);
}

async function join(page: Page, name: string, os: 'macOS' | 'Linux' | 'Windows') {
  await page.goto('/');
  await page.getByPlaceholder('Navnet ditt').fill(name);
  await page.getByRole('button', { name: 'Neste' }).click();
  await page.getByRole('button', { name: os, exact: true }).click();
  await expect(page.getByText('Venter på at oppgaven starter…')).toBeVisible();
}

test('admin starts task 1, two students finish with different endings', async ({ browser }) => {
  const adminPage = await (await browser.newContext()).newPage();
  await adminPage.goto('/admin');
  await adminPage.getByPlaceholder('Passord').fill('e2e-pw');
  await adminPage.getByRole('button', { name: 'Logg inn' }).click();
  await expect(adminPage.getByText('Ingen oppgave startet')).toBeVisible();

  const ola = await (await browser.newContext()).newPage();
  const kari = await (await browser.newContext()).newPage();
  await join(ola, 'Ola', 'macOS');
  await join(kari, 'Kari', 'Windows');
  await expect(adminPage.getByText('2 elever har koblet til')).toBeVisible();

  await adminPage.getByRole('button', { name: /Start neste oppgave/ }).click();
  for (const p of [ola, kari]) await expect(p.getByRole('heading', { name: 'Oppgave 1: Homayoon Bar' })).toBeVisible();
  await expect(adminPage.getByText('0 / 2 ferdig')).toBeVisible();

  // Ola: macOS, right ending at the toilet.
  for (const line of ['ls', 'cd bar-omrade', 'cd bar', 'kjop-hiroshima', 'cd ..', 'cd toalettet', 'tiss']) await type(ola, line);
  const panelEnding = ola.locator('.task-ending');
  await expect(panelEnding.getByText('Ahh, mye bedre!')).toBeVisible();
  await expect(panelEnding.getByText('Venter på neste oppgave…')).toBeVisible();

  // The result dialog opens after the last scene effect: ending text, all goals ticked.
  const olaDialog = ola.getByRole('dialog');
  await expect(olaDialog.getByRole('heading', { name: 'Godt jobbet!' })).toBeVisible();
  await expect(olaDialog.getByText('Ahh, mye bedre!')).toBeVisible();
  const olaGoals = olaDialog.locator('.result-goal');
  expect(await olaGoals.count()).toBeGreaterThan(0);
  await expect(olaDialog.locator('.result-goal.done')).toHaveCount(await olaGoals.count());

  // Esc closes the dialog; the panel's ending card stays, and the dialog does not come back.
  await ola.keyboard.press('Escape');
  await expect(olaDialog).toHaveCount(0);
  await expect(panelEnding.getByText('Ahh, mye bedre!')).toBeVisible();
  await ola.waitForTimeout(1000);
  await expect(ola.getByRole('dialog')).toHaveCount(0);

  // Kari: Windows PowerShell, funny ending at the entrance.
  for (const line of ['cd bar-omrade', 'cd bar', 'kjop-hiroshima', 'cd ..', 'cd ..', 'tiss']) await type(kari, line);
  const kariDialog = kari.getByRole('dialog');
  await expect(kariDialog.getByText('Rett utenfor døra? Seriøst?')).toBeVisible();
  await expect(kariDialog.getByRole('heading', { name: 'Oi da!' })).toBeVisible();
  expect(await kariDialog.locator('.result-goal:not(.done)').count()).toBeGreaterThan(0);

  await expect(adminPage.getByText('2 / 2 ferdig')).toBeVisible();
  const olaRow = adminPage.locator('tr', { hasText: 'Ola' });
  await expect(olaRow).toContainText('macOS');
  await expect(olaRow).toContainText('✓ toalett');
  await expect(olaRow).toContainText('1');
  const kariRow = adminPage.locator('tr', { hasText: 'Kari' });
  await expect(kariRow).toContainText('Windows');
  await expect(kariRow).toContainText('✗ inngang');

  // A reload after the ending brings the ending screen back, not a fresh task.
  await ola.reload();
  await expect(ola.getByText('Ahh, mye bedre!')).toBeVisible();

  // Kari leaves the dialog open; the next task replaces the whole screen, dialog and blur layer included.
  await adminPage.getByRole('button', { name: /Start neste oppgave/ }).click();
  await expect(kari.getByRole('heading', { name: 'Oppgave 2: Aleksanders pythonslange' })).toBeVisible();
  await expect(kari.locator('dialog')).toHaveCount(0);
  await expect(kari.locator('[inert]')).toHaveCount(0);
  expect(await kari.evaluate(() => document.querySelector(':modal'))).toBeNull();
});

// The server's task state is shared by the whole run, so this test starts a new session and one test walks all three levels and checks both sizes on each.
test('every level\'s map fills the scene at 1440x900 and 1920x1080', async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/admin');
  await admin.getByPlaceholder('Passord').fill('e2e-pw');
  await admin.getByRole('button', { name: 'Logg inn' }).click();
  admin.on('dialog', (d) => d.accept());
  await admin.getByRole('button', { name: 'Ny økt' }).click();
  await expect(admin.getByText('Ingen oppgave startet')).toBeVisible();
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await join(student, 'Fit', 'macOS');

  const titles = ['Oppgave 1: Homayoon Bar', 'Oppgave 2: Aleksanders pythonslange', 'Oppgave 3: Eeman i banken'];
  for (const title of titles) {
    await admin.getByRole('button', { name: /Start neste oppgave/ }).click();
    await expect(student.getByRole('heading', { name: title })).toBeVisible();
    for (const size of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      await student.setViewportSize(size);
      await expect(student.locator('.scene')).toHaveAttribute('data-zoom', /.+/);
      await student.waitForTimeout(400);
      const m = await student.locator('.scene').evaluate((el) => ({
        w: el.clientWidth, h: el.clientHeight,
        cw: Number((el as HTMLElement).dataset.contentW), ch: Number((el as HTMLElement).dataset.contentH),
      }));
      const label = `${title} at ${size.width}x${size.height}`;
      expect(Math.max(m.cw / m.w, m.ch / m.h), label).toBeGreaterThanOrEqual(0.85);
      expect(m.cw, label).toBeLessThanOrEqual(m.w + 1);
      expect(m.ch, label).toBeLessThanOrEqual(m.h + 1);
      await student.screenshot({ path: `${process.env.SHOTS ?? 'test-results'}/level-${titles.indexOf(title) + 1}-${size.width}.png` });
    }
  }
});

test('the robber mask and gun stay on Eeman after the robbery, also after a cd', async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/admin');
  await admin.getByPlaceholder('Passord').fill('e2e-pw');
  await admin.getByRole('button', { name: 'Logg inn' }).click();
  admin.on('dialog', (d) => d.accept());
  await admin.getByRole('button', { name: 'Ny økt' }).click();
  await expect(admin.getByText('Ingen oppgave startet')).toBeVisible();
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await join(student, 'Robber', 'macOS');
  for (const title of ['Oppgave 1: Homayoon Bar', 'Oppgave 2: Aleksanders pythonslange', 'Oppgave 3: Eeman i banken']) {
    await admin.getByRole('button', { name: /Start neste oppgave/ }).click();
    await expect(student.getByRole('heading', { name: title })).toBeVisible();
  }
  const heroChildren = () =>
    student.locator('.scene').evaluate((el) => {
      const game = (el as unknown as { __game: { scene: { getScene(k: string): { hero?: { list: { name: string }[] } } } } }).__game;
      return game.scene.getScene('view')?.hero?.list.map((o) => o.name) ?? [];
    });
  await expect(student.locator('.scene')).toHaveAttribute('data-zoom', /.+/); // the scene is mounted and ready
  expect(await heroChildren()).not.toContain('robber-mask');

  await type(student, 'sudo skrik-gi-meg-penger');
  await type(student, 'bank123');
  await expect.poll(heroChildren, { timeout: 5000 }).toEqual(expect.arrayContaining(['robber-mask', 'robber-gun']));
  await type(student, 'cd sofa');
  await student.waitForTimeout(1500);
  expect(await heroChildren()).toEqual(expect.arrayContaining(['robber-mask', 'robber-gun']));
  await student.locator('.scene').screenshot({ path: `${process.env.SHOTS ?? 'test-results'}/robber.png` });
});

test('everyone but the cashiers runs out of the bank', async ({ browser }) => {
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await student.goto('/?task=eeman-bank');
  await expect(student.locator('.scene')).toHaveAttribute('data-zoom', /.+/);
  const scene = () =>
    student.locator('.scene').evaluate((el) => {
      const game = (el as unknown as { __game: { scene: { getScene(k: string): { npcs?: { sprite: { active: boolean } }[]; hero?: { list: { name: string }[] } } } } }).__game;
      const view = game.scene.getScene('view');
      return { npcs: view?.npcs?.filter((n) => n.sprite.active).length ?? -1, gear: view?.hero?.list.map((o) => o.name) ?? [] };
    });
  await expect.poll(async () => (await scene().catch(() => ({ npcs: -1 }))).npcs).toBe(5);
  await type(student, 'sudo skrik-gi-meg-penger');
  await type(student, 'bank123');
  await student.waitForTimeout(450);
  await student.locator('.scene').screenshot({ path: `${process.env.SHOTS ?? 'test-results'}/panic.png` });
  await type(student, 'cd safe');
  await type(student, 'ring-politiet');
  await expect.poll(async () => (await scene()).npcs, { timeout: 10000 }).toBe(2);
  expect((await scene()).gear).toEqual(expect.arrayContaining(['robber-mask', 'robber-gun']));
});

test('the plant lies on its side with dirt after sudo velt-plante', async ({ browser }) => {
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await student.goto('/?task=eeman-bank');
  await expect(student.locator('.scene')).toHaveAttribute('data-zoom', /.+/);
  const names = () =>
    student.locator('.scene').evaluate((el) => {
      const game = (el as unknown as { __game: { scene: { getScene(k: string): { children?: { list: { name: string }[] } } } } }).__game;
      return game.scene.getScene('view')?.children?.list.map((o) => o.name) ?? [];
    });
  await type(student, 'cd plante');
  await type(student, 'velt-plante');
  expect(await names()).not.toContain('plant-dirt');
  await type(student, 'sudo velt-plante');
  await type(student, 'bank123');
  await expect.poll(names, { timeout: 5000 }).toEqual(expect.arrayContaining(['plant-dirt']));
  const tiles = () =>
    student.locator('.scene').evaluate((el) => {
      type Layer = { getTileAt(x: number, y: number): unknown };
      const game = (el as unknown as { __game: { scene: { getScene(k: string): { tileLayers: Map<string, Layer> } } } }).__game;
      const layers = game.scene.getScene('view').tileLayers;
      const at = (n: string) => [13, 14].flatMap((x) => [7, 8].map((y) => !!layers.get(n)?.getTileAt(x, y)));
      return { ground: at('ground'), furniture: at('furniture'), above: at('above') };
    });
  expect(await tiles()).toEqual({ ground: [true, true, true, true], furniture: [false, false, false, false], above: [false, false, false, false] });
  await student.waitForTimeout(500);
  await student.locator('.scene').screenshot({ path: `${process.env.SHOTS ?? 'test-results'}/plant.png` });
});

test('Homayoon lies on the floor after passing out', async ({ browser }) => {
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await student.goto('/?task=homayoon-bar');
  await expect(student.locator('.scene')).toHaveAttribute('data-zoom', /.+/);
  await type(student, 'cd bar-omrade');
  await type(student, 'cd bar');
  for (let i = 0; i < 11; i++) await type(student, 'kjop-hiroshima');
  const angle = () =>
    student.locator('.scene').evaluate((el) => {
      const game = (el as unknown as { __game: { scene: { getScene(k: string): { hero?: { angle: number } } } } }).__game;
      return game.scene.getScene('view')?.hero?.angle ?? 0;
    });
  await expect.poll(angle, { timeout: 8000 }).toBe(90);
  await student.waitForTimeout(500);
  await student.locator('.scene').screenshot({ path: `${process.env.SHOTS ?? 'test-results'}/besvim.png` });
});

test('tiss leaves a yellow stain under Homayoon', async ({ browser }) => {
  const student = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await student.goto('/?task=homayoon-bar');
  await expect(student.locator('.scene')).toHaveAttribute('data-zoom', /.+/);
  await type(student, 'cd bar-omrade');
  await type(student, 'cd bar');
  await type(student, 'kjop-hiroshima');
  await type(student, 'cd ..');
  await type(student, 'cd sofakrok');
  await type(student, 'tiss');
  const stain = () =>
    student.locator('.scene').evaluate((el) => {
      const game = (el as unknown as { __game: { scene: { getScene(k: string): { hero: { x: number; y: number }; children: { list: { name: string; x: number; y: number }[] } } } } }).__game;
      const v = game.scene.getScene('view');
      const s = v.children.list.find((o) => o.name === 'tiss-stain');
      return s ? { dx: Math.abs(s.x - v.hero.x), dy: Math.abs(s.y + 1 - v.hero.y) } : null;
    });
  let d: { dx: number; dy: number } | null = null;
  await expect.poll(async () => (d = await stain()) !== null, { timeout: 8000 }).toBe(true); // first sighting: later walks move the hero, not the stain
  d = d!;
  expect(d!.dx).toBeLessThanOrEqual(2);
  expect(d!.dy).toBeLessThanOrEqual(3); // the stain sits at hero.y - 1; the hero may be mid-bob (up to 3px)
  await student.waitForTimeout(800);
  await student.locator('.scene').screenshot({ path: `${process.env.SHOTS ?? 'test-results'}/tiss.png` });
});
