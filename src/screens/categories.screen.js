import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { BaseScreen } from './base.screen.js';
import { assertSafeAction, safeClick, safeScroll, safeScrollRegion, PRICE } from '../safety/guard.js';

function iconFingerprint(base64) {
  const image = PNG.sync.read(Buffer.from(base64, 'base64'));
  const cropHeight = Math.max(1, Math.floor(image.height * 0.72));
  const cells = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 9; column += 1) {
      const x0 = Math.floor(column * image.width / 9);
      const x1 = Math.max(x0 + 1, Math.floor((column + 1) * image.width / 9));
      const y0 = Math.floor(row * cropHeight / 8);
      const y1 = Math.max(y0 + 1, Math.floor((row + 1) * cropHeight / 8));
      let brightness = 0;
      let pixels = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * image.width + x) * 4;
          brightness += image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114;
          pixels += 1;
        }
      }
      cells.push(brightness / pixels);
    }
  }
  const mean = cells.reduce((sum, value) => sum + value, 0) / cells.length;
  const variance = cells.reduce((sum, value) => sum + (value - mean) ** 2, 0) / cells.length;
  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const offset = row * 9 + column;
      bits += cells[offset] > cells[offset + 1] ? '1' : '0';
    }
  }
  return { hash: BigInt(`0b${bits}`).toString(16).padStart(16, '0'), variance };
}

function hammingDistance(left, right) {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
}

export class CategoriesScreen extends BaseScreen {
  async openCategoryFromWebView(name) {
    assertSafeAction('categories.category_view', name);
    const originalContext = await browser.getContext().catch(() => null);
    const contexts = await browser.getContexts().catch(() => []);
    const webview = contexts.find((context) => String(context).toUpperCase().includes('WEBVIEW'));
    if (!webview) return false;
    try {
      await browser.switchContext(webview);
      return Boolean(await browser.execute((categoryName) => {
        // eslint-disable-next-line no-undef -- executed inside the app WebView
        const elements = [...document.querySelectorAll('[aria-label], button, a')];
        const target = elements.find((element) =>
          element.getAttribute('aria-label')?.trim() === categoryName
          || element.textContent?.replace(/\s+/gu, ' ').trim() === categoryName);
        if (!target) return false;
        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.click();
        return true;
      }, name));
    } finally {
      if (originalContext) await browser.switchContext(originalContext);
    }
  }

  async openCategory(name) {
    const escaped = name.replaceAll('"', '\\"');
    const selectors = [
      `android=new UiSelector().description("${escaped}")`,
      `android=new UiSelector().text("${escaped}")`
    ];
    if (await this.openCategoryFromWebView(name)) {
      const opened = await this.firstVisible([
        'android=new UiSelector().className("android.widget.ToggleButton").clickable(true)'
      ], 4000).catch(() => null);
      if (opened) {
        console.info(`[category-sample] opened category=${JSON.stringify(name)} using=webview-exact-match`);
        return;
      }
    }
    for (let step = 0; step <= 4; step += 1) {
      for (const selector of selectors) {
        const target = await $(selector);
        if (!await target.isDisplayed().catch(() => false)) continue;
        const { height } = await browser.getWindowSize();
        const [location, size] = await Promise.all([target.getLocation(), target.getSize()]);
        const centerY = location.y + size.height / 2;
        if (centerY < height * 0.10 || centerY > height * 0.94) continue;
        let opened = false;
        for (let attempt = 1; attempt <= 3 && !opened; attempt += 1) {
          await safeClick(target, 'categories.category_view', 'Category navigation');
          opened = Boolean(await this.firstVisible([
            'android=new UiSelector().className("android.widget.ToggleButton").clickable(true)'
          ], 2000).catch(() => null));
          if (!opened) console.info(`[category-sample] navigation retry category=${JSON.stringify(name)} attempt=${attempt}`);
        }
        if (!opened) throw new Error(`Category card remained on the catalogue after three navigation attempts: ${name}`);
        console.info(`[category-sample] opened category=${JSON.stringify(name)} fallbackSteps=${step}`);
        return;
      }
      if (step < 4) {
        const before = await this.source();
        await safeScroll('nav.scroll', 'down');
        await browser.pause(150);
        if (await this.source() === before) break;
      }
    }
    throw new Error(`CSV category was previously validated but could not be brought into view with targeted lookup plus four bounded scrolls: ${name}`);
  }

  async visibleSubcategories() {
    const { width, height } = await browser.getWindowSize();
    const found = [];
    for (const node of await $$('android=new UiSelector().className("android.widget.ToggleButton").clickable(true)')) {
      if (!await node.isDisplayed().catch(() => false)) continue;
      const [location, size] = await Promise.all([node.getLocation(), node.getSize()]);
      if (location.x > width * 0.36 || location.y < height * 0.1 || size.height < 80) continue;
      const text = ((await node.getAttribute('content-desc').catch(() => '')) || (await node.getText().catch(() => '')) || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
      if (!text || /^(go back|search)$/i.test(text) || PRICE.test(text)) continue;
      found.push({ name: text, y: location.y });
    }
    return found.sort((a, b) => a.y - b.y);
  }

  async collectSubcategoryNames() {
    // This app loads the complete subcategory rail into the Android accessibility
    // hierarchy. Read that model directly; swiping the page is not discovery or refresh.
    const names = (await this.visibleSubcategories()).map((entry) => entry.name);
    assert.ok(names.length > 0, 'Opened category exposes no left-side subcategories');
    assert.equal(new Set(names.map((name) => name.toLocaleLowerCase())).size, names.length, 'Left-side subcategory names must not repeat');
    return names;
  }

  async findSubcategory(name, maxScrolls = 3) {
    const escaped = name.replaceAll('"', '\\"');
    for (let step = 0; step <= maxScrolls; step += 1) {
      const nodes = await $$(`//*[@content-desc="${escaped}" or @text="${escaped}"]`);
      for (const node of nodes) {
        if (!await node.isDisplayed().catch(() => false)) continue;
        const { width, height } = await browser.getWindowSize();
        const [location, size] = await Promise.all([node.getLocation(), node.getSize()]);
        if (location.x > width * 0.36) continue;
        const top = height * 0.12;
        const bottom = height * 0.92;
        if (location.y >= top && location.y + size.height <= bottom) return node;
        await safeScrollRegion('categories.subcategory_scroll', location.y < top ? 'up' : 'down');
        await browser.pause(150);
        break;
      }
    }
    throw new Error(`Subcategory could not be brought into the tappable viewport: ${name}`);
  }

  async visibleProductCards(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let cards = [];
    while (Date.now() < deadline) {
      cards = [];
      for (const node of await $$('//android.widget.Button[contains(@text,"Add item")]')) {
        if (!await node.isDisplayed().catch(() => false)) continue;
        const text = ((await node.getText().catch(() => '')) || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
        if (PRICE.test(text) && /add item/i.test(text)) cards.push(text);
      }
      if (cards.length) return cards;
      await browser.pause(150);
    }
    const visibleButtons = [];
    for (const node of await $$('android=new UiSelector().className("android.widget.Button").clickable(true)')) {
      if (!await node.isDisplayed().catch(() => false)) continue;
      const text = ((await node.getText().catch(() => '')) || (await node.getAttribute('content-desc').catch(() => '')) || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
      if (text) visibleButtons.push(text.slice(0, 160));
    }
    console.error(`[category-detail] no product card matched price + Add item; visibleButtons=${JSON.stringify(visibleButtons)}`);
    return cards;
  }

  async assertEverySubcategoryHasProducts(categoryName) {
    const subcategories = await this.collectSubcategoryNames();
    console.info(`[category-detail] category=${JSON.stringify(categoryName)} subcategories=${JSON.stringify(subcategories)}`);
    for (const name of subcategories) {
      const target = await this.findSubcategory(name);
      await safeClick(target, 'categories.subcategory_view', 'Subcategory navigation');
      const products = await this.visibleProductCards();
      assert.ok(products.length > 0, `Category ${JSON.stringify(categoryName)} subcategory ${JSON.stringify(name)} contains no product`);
      console.info(`[category-detail] category=${JSON.stringify(categoryName)} subcategory=${JSON.stringify(name)} products=${products.length} first=${JSON.stringify(products[0])}`);
    }
    return `${categoryName}: ${subcategories.length} subcategories opened; every subcategory contained at least one product`;
  }

  async catalogue(expectedCount, maxScrolls = 4) {
    const categories = new Map();
    const sections = [];
    let activeSection = '';
    let unchanged = 0;
    for (let step = 0; step <= maxScrolls && unchanged < 2; step += 1) {
      const headings = [];
      for (const node of await $$('//android.widget.TextView[@heading="true"]')) {
        if (!await node.isDisplayed().catch(() => false)) continue;
        const name = ((await node.getText().catch(() => '')) || '').trim();
        if (name) headings.push({ type: 'section', name, y: (await node.getLocation()).y });
      }
      const cards = [];
      for (const node of await $$('android=new UiSelector().className("android.widget.Button").clickable(true)')) {
        if (!await node.isDisplayed().catch(() => false)) continue;
        const name = ((await node.getAttribute('content-desc').catch(() => '')) || '').trim();
        if (!name || /^(go back|search)$/i.test(name)) continue;
        const [location, size] = await Promise.all([node.getLocation(), node.getSize()]);
        if (size.height < 180) continue;
        cards.push({ type: 'category', node, name, y: location.y });
      }
      const before = categories.size;
      for (const item of [...headings, ...cards].sort((a, b) => a.y - b.y)) {
        if (item.type === 'section') {
          activeSection = item.name;
          if (!sections.includes(item.name)) sections.push(item.name);
        } else if (activeSection && !categories.has(item.name)) {
          const icon = iconFingerprint(await browser.takeElementScreenshot(item.node.elementId));
          categories.set(item.name, { section: activeSection, category: item.name, iconHash: icon.hash, iconVariance: icon.variance });
          console.info(`[categories] section=${JSON.stringify(activeSection)} category=${JSON.stringify(item.name)} iconHash=${icon.hash} variance=${icon.variance.toFixed(2)}`);
        }
      }
      if (categories.size === expectedCount) break;
      unchanged = categories.size === before ? unchanged + 1 : 0;
      if (step < maxScrolls && unchanged < 1) {
        await safeScroll('nav.scroll', 'down');
        await browser.pause(150);
      }
    }
    return { sections, categories: [...categories.values()] };
  }

  async assertCatalogue(expectedRows) {
    const expectedSections = expectedRows.filter((row) => row.row_type === 'section').map((row) => row.section);
    const expectedCategories = expectedRows.filter((row) => row.row_type === 'category');
    const observed = await this.catalogue(expectedCategories.length);
    assert.deepEqual(observed.sections, expectedSections, `Category section headers differ. Observed: ${observed.sections.join(' | ')}`);
    assert.deepEqual(observed.categories.map((row) => row.category), expectedCategories.map((row) => row.category), `Category names differ. Observed: ${observed.categories.map((row) => row.category).join(' | ')}`);
    assert.equal(new Set(observed.categories.map((row) => row.category.toLocaleLowerCase())).size, observed.categories.length, 'Category names must not repeat');
    assert.equal(new Set(observed.categories.map((row) => row.iconHash)).size, observed.categories.length, 'Category icon images must not repeat');
    for (const [index, category] of observed.categories.entries()) {
      assert.ok(category.iconVariance > 5, `${category.category} does not contain a visible non-blank icon image`);
      assert.ok(hammingDistance(category.iconHash, expectedCategories[index].icon_hash) <= 12, `${category.category} icon differs from its CSV representation`);
    }
    return `${observed.sections.length} headers and ${observed.categories.length} uniquely named categories with unique non-blank icons validated`;
  }
}
