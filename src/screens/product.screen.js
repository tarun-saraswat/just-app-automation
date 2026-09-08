import { BaseScreen } from './base.screen.js';
import { safeClick, safeSwipeWithin, safeTapWithin, PRODUCT_CARD, PRICE, PACK_SIZE } from '../safety/guard.js';

// Per-unit rate such as "₹150/100 g" or "₹60.8/kg".
const UNIT_RATE = /₹\s?[\d.,]+\s*\/\s*\d*\s*(?:g|kg|ml|l|pc|pcs|piece)\b/i;

export class ProductScreen extends BaseScreen {
  async loadedDocumentSource() {
    const nativeSource = await this.source();
    const originalContext = await browser.getContext().catch(() => null);
    const contexts = await browser.getContexts().catch(() => []);
    const webview = contexts.find((context) => String(context).toUpperCase().includes('WEBVIEW'));
    if (!webview) return nativeSource;
    try {
      await browser.switchContext(webview);
      return `${nativeSource}\n${await browser.getPageSource()}`;
    } finally {
      if (originalContext) await browser.switchContext(originalContext);
    }
  }

  async assertDisplay() {
    const source = await this.source();
    this.assertSourceHas(source, [
      /product|item|title/i,
      /image|content-desc="[^"]+"/i,
      /₹|rs\.?|price/i,
      /\b(g|kg|ml|l|piece|pack)\b/i,
      /available|in stock|out of stock|add/i
    ], 'Product display');
    if (!/description|details|information|about|ingredients|specification/i.test(source)) {
      throw new Error('Product informational section did not load');
    }
    return 'name, image, price, unit, availability and informational section loaded';
  }

  async assertNamedProduct(name) {
    await this.textVisible(name);
    const source = await this.source();
    if (!/₹|price/i.test(source)) throw new Error('Product price did not load');
    if (!/g|kg|ml|pack size/i.test(source)) throw new Error('Product pack size did not load');
    return `${name} product details loaded with price and pack size`;
  }

  // Section-level validation only: labels and value shapes are asserted, never
  // a specific product's catalogue data.
  async assertAllSections() {
    await this.firstVisible([
      'android=new UiSelector().descriptionMatches("(?i)add to cart")',
      'android=new UiSelector().textMatches("(?i)add to cart")'
    ], 20000);
    await this.firstVisible([
      'android=new UiSelector().textContains("Genuine Product")',
      'android=new UiSelector().textContains("Quality Tested")'
    ], 20000);
    const top = await this.loadedDocumentSource();
    this.assertSourceHas(top, [
      PRODUCT_CARD,               // branded product title
      PRICE,                      // selling price
      UNIT_RATE,                  // per-unit rate, e.g. ₹150/100 g
      PACK_SIZE,                  // pack size value
      /View image \d+ fullscreen/i, // gallery
      /genuine product/i,
      /quality tested/i,
      /safety tested/i,
      /pack size/i,
      /add to cart/i
    ], 'Product detail sections');
    await this.assertPromiseBanner();

    // PDP sections are loaded into the accessibility hierarchy together. Read
    // them in place; a vertical gesture here is not a refresh or discovery step.
    let details = top;
    const detailsDeadline = Date.now() + 5000;
    while (!/Seller Details/i.test(details) && Date.now() < detailsDeadline) {
      await browser.pause(100);
      details = await this.loadedDocumentSource();
    }
    this.assertSourceHas(details, [
      /MRP/i,
      /Date of Manufacturing/i,
      /Seller Details/i,
      /\d{2}[-/]\d{2}[-/]\d{4}/                      // a real date value, any date
    ], 'Product metadata sections');
    return 'title, price, per-unit rate, pack size, promise banner, trust badges, pack metadata, seller details and Add to Cart present';
  }

  async productTitle() {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const titles = [];
      const nodes = await $$('android=new UiSelector().className("android.widget.TextView").textContains("Jus+")');
      for (const node of nodes) {
        if (!await node.isDisplayed().catch(() => false)) continue;
        const text = ((await node.getText().catch(() => '')) || '').trim();
        if (!PRODUCT_CARD.test(text)) continue;
        titles.push({ node, text, y: (await node.getLocation()).y });
      }
      titles.sort((a, b) => a.y - b.y);
      if (titles.length) return titles[0];
      await browser.pause(100);
    }
    throw new Error('Product title was not rendered within 10 seconds after opening PDP');
  }

  async assertShareBehaviour() {
    const title = (await this.productTitle()).text.replace(/\s*\([^)]*\)\s*$/, '').trim();
    await this.loadedDocumentSource();
    const share = await this.firstVisible([
      '~Share',
      'android=new UiSelector().descriptionMatches("(?i)share")'
    ]);
    await safeClick(share, 'product.share', 'Share');
    let source = '';
    const shareDeadline = Date.now() + 2000;
    while (Date.now() < shareDeadline) {
      source = await this.source();
      if (/intentresolver|resolveractivity|sharesheet|quick share|share with|sharing/i.test(source)) break;
      await browser.pause(100);
    }
    if (!/intentresolver|resolveractivity|sharesheet|quick share|share with|sharing/i.test(source)) {
      throw new Error('Share button did not open the Android share sheet');
    }
    const visible = [...source.matchAll(/(?:text|content-desc)="([^"]+)"/g)]
      .map((match) => match[1].replaceAll('&amp;', '&').replaceAll('&quot;', '"').trim())
      .filter(Boolean);
    const url = visible.join(' ').match(/https:\/\/[^\s"<>]+/i)?.[0];
    if (!url) throw new Error(`Share sheet exposed no HTTPS product link (visible text: ${visible.join(' | ')})`);
    const parsed = new URL(url);
    if (!parsed.hostname || parsed.pathname === '/') throw new Error(`Shared product link is not product-specific: ${url}`);
    const sharedText = visible.find((value) => value.toLocaleLowerCase().includes(title.toLocaleLowerCase()));
    if (!sharedText) throw new Error(`Share text does not contain the displayed product title ${JSON.stringify(title)} (visible text: ${visible.join(' | ')})`);

    console.info(`[pdp-share] title=${JSON.stringify(title)} text=${JSON.stringify(sharedText)} link=${JSON.stringify(url)}`);
    await this.back();
    await this.firstVisible(['~Share', 'android=new UiSelector().descriptionMatches("(?i)share")']);
    return `share sheet opened with product text and a product-specific HTTPS link, then returned to PDP`;
  }

  // The Jus+ Promise banner is a tappable image with no accessible copy, so it
  // is verified structurally: a full-width control between the title and the
  // trust badges.
  async assertPromiseBanner() {
    const { width } = await browser.getWindowSize();
    const title = await this.productTitle();
    const badge = await this.firstVisible(['android=new UiSelector().textContains("Genuine Product")']);
    const badgeY = (await badge.getLocation()).y;
    const nodes = await $$('android=new UiSelector().clickable(true)');
    for (const node of nodes) {
      if (!await node.isDisplayed().catch(() => false)) continue;
      const [location, size] = await Promise.all([node.getLocation(), node.getSize()]);
      if (location.y > title.y && location.y < badgeY && size.width >= width * 0.7) return true;
    }
    throw new Error('Jus+ Promise banner was not rendered between the product title and the trust badges');
  }

  async openPromiseCard() {
    const { width } = await browser.getWindowSize();
    const title = await this.productTitle();
    const badge = await this.firstVisible(['android=new UiSelector().textContains("Genuine Product")']);
    const badgeY = (await badge.getLocation()).y;
    const nodes = await $$('android=new UiSelector().clickable(true)');
    for (const node of nodes) {
      if (!await node.isDisplayed().catch(() => false)) continue;
      const [location, size] = await Promise.all([node.getLocation(), node.getSize()]);
      if (location.y <= title.y || location.y >= badgeY || size.width < width * 0.7) continue;
      await safeTapWithin(node, 'product.promise_open');
      return 'opened the JUST Promise bottom sheet from the PDP';
    }
    throw new Error('JUST Promise banner was not tappable on the PDP');
  }

  async dismissPromiseCard() {
    const button = await this.firstVisible([
      'android=new UiSelector().textMatches("(?i)okay,? got it")',
      'android=new UiSelector().descriptionMatches("(?i)okay,? got it")'
    ]);
    await safeClick(button, 'product.promise_dismiss', 'Okay, got it');
    return 'dismissed the JUST Promise bottom sheet';
  }

  async imageCarousel() {
    return this.firstVisible([
      'android=new UiSelector().className("android.webkit.WebView")',
      'android=new UiSelector().className("android.widget.FrameLayout").scrollable(true)'
    ]);
  }

  // Swipes the gallery and reports whether the rendered image nodes changed.
  async swipeProductImages(swipes = 2) {
    const carousel = await this.imageCarousel();
    const signature = async () => {
      const source = await this.source();
      return [...source.matchAll(/<[^>]*(?:Image|image)[^>]*bounds="([^"]+)"[^>]*>/g)].map((match) => match[1]).join(',');
    };
    const before = await signature();
    const observed = [];
    for (let index = 0; index < swipes; index += 1) {
      await safeSwipeWithin(carousel, 'product.image_swipe', { yFraction: 0.22 });
      await browser.pause(700);
      const source = await this.source();
      if (/unexpected error|something went wrong|try again/i.test(source)) {
        throw new Error('Product gallery swipe produced an error state');
      }
      this.assertSourceHas(source, [PRODUCT_CARD, PRICE], 'Product page after gallery swipe');
      observed.push(index + 1);
    }
    const after = await signature();
    return `${observed.length} gallery swipe(s) kept the product page intact (image nodes ${before === after ? 'not exposed to accessibility' : 'changed'})`;
  }

  // Pack-size options rendered above the fold; the sticky bottom bar repeats the
  // selected option and is excluded by position.
  async variantOptions() {
    const { height } = await browser.getWindowSize();
    const nodes = await $$('android=new UiSelector().clickable(true)');
    const options = [];
    for (const node of nodes) {
      if (!await node.isDisplayed().catch(() => false)) continue;
      const text = ((await node.getText().catch(() => '')) || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
      if (!PACK_SIZE.test(text) || !PRICE.test(text)) continue;
      if (/add to cart/i.test(text)) continue;
      const location = await node.getLocation();
      if (location.y > height * 0.7) continue;
      const size = text.match(PACK_SIZE)?.[0]?.replace(/\s+/g, '') ?? '';
      options.push({ node, text, size, y: location.y, x: location.x });
    }
    options.sort((a, b) => a.y - b.y || a.x - b.x);
    return [...new Map(options.map((option) => [option.size, option])).values()];
  }

  // The sticky bar is read relative to the Add to Cart control and restricted to
  // TextView nodes, so the Pack Size row (rendered as View nodes at a similar
  // height) can never stand in for the bar's own pack size and price.
  async selectedSummary() {
    const cta = await this.firstVisible([
      'android=new UiSelector().descriptionMatches("(?i)add to cart")',
      'android=new UiSelector().textMatches("(?i)add to cart")'
    ]);
    const [ctaLocation, ctaSize] = await Promise.all([cta.getLocation(), cta.getSize()]);
    const top = ctaLocation.y - 60;
    const bottom = ctaLocation.y + ctaSize.height + 60;
    const nodes = await $$('android=new UiSelector().className("android.widget.TextView")');
    const parts = [];
    for (const node of nodes) {
      if (!await node.isDisplayed().catch(() => false)) continue;
      const location = await node.getLocation();
      if (location.y < top || location.y > bottom) continue;
      const text = ((await node.getText().catch(() => '')) || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
      if (text) parts.push({ text, x: location.x, y: location.y });
    }
    const summary = parts.sort((a, b) => a.y - b.y || a.x - b.x).map((part) => part.text).join(' ');
    if (!summary) throw new Error('Sticky pack-size summary bar did not expose any priced text');
    return summary;
  }

  async assertSinglePackSize() {
    const row = await this.textVisible('Pack Size');
    const rowText = ((await row.getText().catch(() => '')) || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const source = await this.source();
    // The row label and its value can be separate nodes, so fall back to source.
    if (!PACK_SIZE.test(rowText) && !PACK_SIZE.test(source)) {
      throw new Error(`Pack Size row exposed no pack-size value (observed: ${rowText})`);
    }
    const summary = await this.selectedSummary();
    if (!PACK_SIZE.test(summary)) throw new Error(`Summary bar exposed no pack size (observed: ${summary})`);
    if (!PRICE.test(summary)) throw new Error(`Summary bar exposed no price (observed: ${summary})`);
    const size = summary.match(PACK_SIZE)?.[0]?.replace(/\s+/g, '');
    return `single pack size ${size} shown in the Pack Size row and summary bar: ${summary}`;
  }

  // Multi-variant products: every option must be tappable and must drive the
  // sticky summary bar to that option's pack size and price.
  async assertVariantSwitching(options) {
    const visited = [];
    for (const option of options) {
      await safeTapWithin(option.node, 'product.variant_select', 0.5, 0.5);
      await browser.pause(900);
      const summary = await this.selectedSummary();
      const normalized = summary.replace(/\s+/g, '');
      if (!normalized.includes(option.size)) {
        throw new Error(`Selecting ${option.size} did not update the summary bar (observed: ${summary})`);
      }
      if (!PRICE.test(summary)) throw new Error(`Summary bar lost its price after selecting ${option.size}`);
      const source = await this.source();
      // Variant selection may briefly rebuild the WebView accessibility tree.
      // Validate the variant-specific stable controls here; assertAllSections()
      // validates trust badges once after all variant switches are complete.
      this.assertSourceHas(source, [PRODUCT_CARD, /add to cart/i], `Sections after selecting ${option.size}`);
      visited.push(`${option.size} -> ${summary}`);
    }
    if (new Set(visited.map((entry) => entry.split(' -> ')[1])).size < visited.length) {
      throw new Error(`Summary bar did not change between pack sizes: ${visited.join(' | ')}`);
    }
    return visited;
  }

  async addOneToCart() {
    await this.productTitle();
    await this.loadedDocumentSource();
    const button = await this.firstVisible([
      'android=new UiSelector().textMatches("(?i)add to cart")',
      'android=new UiSelector().descriptionMatches("(?i)add to cart")'
    ]);
    await safeClick(button, 'product.cart_add', 'Add to Cart');
    await this.firstVisible([
      'android=new UiSelector().textMatches("(?i)your cart")',
      'android=new UiSelector().descriptionMatches("(?i)your cart.*")',
      'android=new UiSelector().text("1")',
      'android=new UiSelector().descriptionMatches("(?i)(delete|remove|trash).*")',
      'android=new UiSelector().resourceIdMatches(".*(delete|remove|trash).*")'
    ], 2000);
    return 'one product added to the guest cart';
  }

  async openCart() {
    const target = await this.firstVisible([
      'android=new UiSelector().textMatches("(?i)your cart")',
      'android=new UiSelector().descriptionMatches("(?i)(your cart|cart)")',
      'android=new UiSelector().textMatches("(?i)view cart")'
    ]);
    await safeClick(target, 'cart.view', 'Cart');
    return 'opened the guest cart';
  }

  async removeFromCart() {
    const remove = await this.firstVisible([
      'android=new UiSelector().descriptionMatches("(?i)(delete|remove|trash).*")',
      'android=new UiSelector().resourceIdMatches(".*(delete|remove|trash).*")'
    ]);
    await safeClick(remove, 'product.cart_remove', 'Remove from Cart');
    await this.firstVisible([
      'android=new UiSelector().textMatches("(?i)add to cart")',
      'android=new UiSelector().descriptionMatches("(?i)add to cart")'
    ]);
    return 'guest cart returned to Add to Cart state';
  }
}
