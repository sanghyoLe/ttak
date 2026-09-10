import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expect3D(page: Page) {
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-renderer', 'webgl');
  await expect(page.locator('canvas')).toBeVisible();
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '직접 해보기' }).click();
  await expect3D(page);
}

async function dragToSocket(page: Page) {
  const piece = await page.getByTestId('active-piece').boundingBox();
  expect(piece).not.toBeNull();
  await page.mouse.move(piece!.x + piece!.width / 2, piece!.y + piece!.height / 2);
  await page.mouse.down();
  const circle = await page.getByTestId('game-stage').getAttribute('data-scene') === 'circle';
  for (let i = 0; i < (circle ? 3 : 1); i++) {
    const target = await page.getByTestId('drop-target').boundingBox();
    expect(target).not.toBeNull();
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 24 });
    // Let a moving socket finish its visible dodge before following it again.
    if (circle) await page.waitForTimeout(260);
  }
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'near');
  await page.mouse.up();
  await finishInsertion(page);
}

async function finishInsertion(page: Page) {
  const stage = page.getByTestId('game-stage');
  if (await stage.getAttribute('data-scene') !== 'circle') {
    await expect(stage).toHaveAttribute('data-phase', 'jammed');
    const button = await page.getByTestId('press-control').boundingBox();
    await page.mouse.move(button!.x + button!.width / 2, button!.y + button!.height / 2);
    await page.mouse.down();
    await expect(stage).toHaveAttribute('data-phase', 'seated');
    await page.mouse.up();
  } else await expect(stage).toHaveAttribute('data-phase', 'seated');
  await expect(page.getByRole('meter', { name: '맞물림' })).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'failed', { timeout: 10000 });
}

for (const width of [320, 375, 414, 768]) {
  test(`3D home and play fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect3D(page);
    await expect(page.getByRole('button', { name: '직접 해보기' })).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `test-results/visual/home-3d-${width}.png` });
    await page.getByRole('button', { name: '직접 해보기' }).click();
    await expect3D(page);
    await expect(page.getByTestId('active-piece')).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });
}

test('desktop presents the game beside the title', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect3D(page);
  await expect(page.getByRole('button', { name: '직접 해보기' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/visual/home-3d-desktop.png' });
  await expectNoHorizontalOverflow(page);
});

test('all four actual 3D drags fail, wait for the player, and produce a result', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const titles = ['마지막 한 조각', '가운데 홈', '마지막 칸', '끝까지 밀기'];
  for (const [index, title] of titles.entries()) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect3D(page);
    await page.screenshot({ path: `test-results/visual/scene-3d-${index}-ready.png` });
    await dragToSocket(page);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await page.screenshot({ path: `test-results/visual/scene-3d-${index}-failed.png` });
    await page.getByRole('button', { name: index < 3 ? '다음 조각' : '결과 보기' }).click();
  }
  await expect(page.getByRole('heading', { name: /분명.*맞았는데/ })).toBeVisible();
  await expect(page.getByText('4번 도전. 완벽한 순간은 0번.')).toBeVisible();
  await expect3D(page);
  await page.screenshot({ path: 'test-results/visual/result-3d.png' });
  expect(errors).toEqual([]);
});

test('tapping or dropping away from a socket does not cause a failure', async ({ page }) => {
  await start(page);
  const piece = page.getByTestId('active-piece');
  await piece.click();
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'ready');
  const bounds = await piece.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 10, bounds!.y + bounds!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByRole('button', { name: '다음 조각' })).not.toBeVisible();
});

test('keyboard, retry and reduced motion keep working', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await page.getByTestId('active-piece').press('Enter');
  await finishInsertion(page);
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'failed');
  await page.getByRole('button', { name: '한 번 더' }).click();
  await expect3D(page);
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('active-piece')).toBeEnabled();
  await page.getByRole('button', { name: '다른 각도' }).click();
  await page.getByTestId('active-piece').press('Enter');
  await finishInsertion(page);
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'failed');
});

test('touch drag places the 3D piece using pointer capture', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await start(page);
  const piece = await page.getByTestId('active-piece').boundingBox();
  const target = await page.getByTestId('drop-target').boundingBox();
  const session = await context.newCDPSession(page);
  const x = piece!.x + piece!.width / 2, y = piece!.y + piece!.height / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (target!.x + 2 - x) * i / 12, y: y + (target!.y + 2 - y) * i / 12 }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'jammed');
  const press = await page.getByTestId('press-control').boundingBox();
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: press!.x + press!.width / 2, y: press!.y + press!.height / 2 }] });
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'seated');
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'failed', { timeout: 10000 });
  await context.close();
});

test('retry changes the physical sabotage across all twelve variations', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const variants = [['grow', 'turn', 'exchange'], ['escape', 'lid', 'through'], ['domino', 'elevator', 'bow'], ['rebound', 'roof', 'back']];
  for (let scene = 0; scene < 4; scene++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const stage = page.getByTestId('game-stage');
      await expect(stage).toHaveAttribute('data-trap', variants[scene][attempt]);
      await page.getByTestId('active-piece').press('Enter');
      await finishInsertion(page);
      await page.screenshot({ path: `test-results/visual/trap-${variants[scene][attempt]}.png` });
      if (attempt < 2) await page.getByRole('button', { name: '한 번 더' }).click();
    }
    await page.getByRole('button', { name: scene === 3 ? '결과 보기' : '다음 조각' }).click();
  }
  await expect(page.getByText('12번 도전. 완벽한 순간은 0번.')).toBeVisible();
});

test('releasing pressure and cancelling a touch do not complete the insertion', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await start(page);
  await page.getByTestId('active-piece').press('Enter');
  const stage = page.getByTestId('game-stage');
  await expect(stage).toHaveAttribute('data-phase', 'jammed');
  const button = page.getByTestId('press-control');
  await expect(button).toBeInViewport();
  await button.focus();
  await page.keyboard.down('Space');
  await expect(stage).toHaveAttribute('data-phase', 'pressing');
  await page.keyboard.up('Space');
  await expect(stage).toHaveAttribute('data-phase', 'jammed');
  await button.dispatchEvent('pointercancel');
  await expect(stage).toHaveAttribute('data-phase', 'jammed');
  await page.screenshot({ path: 'test-results/visual/jammed-375x667.png' });
  await expect(page.getByRole('button', { name: '다음 조각' })).not.toBeVisible();
  await page.getByRole('button', { name: '처음 위치', exact: true }).click();
  await expect(stage).toHaveAttribute('data-phase', 'ready');
});
