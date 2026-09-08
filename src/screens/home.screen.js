import { BaseScreen } from './base.screen.js';
import { assertSafeAction, safeClick, safeScroll, safeTapWithin, PRODUCT_CARD } from '../safety/guard.js';

const PROMISE_MAX_SCROLLS = 8;
const PROMISE_BANNER_ASSET = '4476f14b-d28e-4263-bb7e-48c847f7f58b_image14.png';

export class HomeScreen extends BaseScreen {
  async isLoaded() {
    for (const selector of [
      '~Account', '~Profile',
      'android=new UiSelector().descriptionContains("user account")',
      'android=new UiSelector().descriptionMatches("(?i)(account|profile)")'
    ]) {
      const element = await $(selector);
      if (await element.isDisplayed().catch(() => false)) return true;
    }
    return false;
  }

  async waitLoaded() {
    const marker = await this.firstVisible([
      '~Account', '~Profile',
      'android=new UiSelector().descriptionContains("user account")',
      'android=new UiSelector().descriptionMatches("(?i)(account|profile)")'
    ], 30000);
    const source = await this.source();
    if (/unexpected error|something went wrong|try again/i.test(source)) throw new Error('Home loaded an error state');
    return marker;
  }

  async recoverBackToHome(maxBacks = 5) {
    for (let step = 0; step <= maxBacks; step += 1) {
      if (await this.isLoaded()) return `Home restored after ${step} Back action(s)`;
      if (step < maxBacks) {
        await this.back();
        await browser.pause(150);
      }
    }
    throw new Error(`Could not restore Home after ${maxBacks} bounded Back actions`);
  }

  async openAccount() {
    const target = await this.firstVisible([
      '~Account', '~Profile',
      'android=new UiSelector().descriptionContains("user account")',
      'android=new UiSelector().descriptionMatches("(?i)(account|profile)")',
      'android=new UiSelector().textMatches("(?i)(account|profile)")'
    ]);
    await safeClick(target, 'nav.account', 'Account');
  }

  async openSearch() {
    const target = await this.firstVisible([
      '~Search', 'android=new UiSelector().textContains("Search")',
      'android=new UiSelector().descriptionContains("Search")'
    ]);
    await safeClick(target, 'nav.search', 'Search');
  }

  async openCategories() {
    const target = await this.firstVisible([
      '~Categories',
      'android=new UiSelector().textMatches("(?i)(categories|shop by category)")',
      'android=new UiSelector().textContains("Explore Categories")',
      // The home WebView exposes the category carousel cards as ordered "Open"
      // buttons while their visible labels are painted text. Explore Categories
      // is the first card in that carousel.
      '(//android.widget.Button[@content-desc="Open"])[1]'
    ]);
    if ((await target.getAttribute('content-desc').catch(() => '')) === 'Open') {
      await safeTapWithin(target, 'nav.categories');
    } else {
      await safeClick(target, 'nav.categories', 'Categories');
    }
  }

  // Opens whichever product card the catalogue happens to render first so the
  // detail assertions never depend on one merchandised product.
  async openAnyProduct() {
    const titleOpened = await this.openAnyProductByTitle();
    if (titleOpened) return titleOpened;
    const webviewOpened = await this.openAnyProductFromWebView();
    if (webviewOpened) {
      await this.firstVisible([
        'android=new UiSelector().descriptionMatches("(?i)add to cart")',
        'android=new UiSelector().textMatches("(?i)add to cart")'
      ], 15000);
      return webviewOpened;
    }
    const deadline = Date.now() + 30000;
    let seen = 0;
    while (Date.now() < deadline) {
      const cards = [
        ...(await $$('android=new UiSelector().className("android.widget.Image").descriptionContains("Jus+")')),
        ...(await $$('android=new UiSelector().textContains("Jus+")'))
      ];
      const candidates = [];
      for (const card of cards) {
        if (!await card.isDisplayed().catch(() => false)) continue;
        const text = (await card.getText().catch(() => '')) || '';
        const description = (await card.getAttribute('content-desc').catch(() => '')) || '';
        if (!PRODUCT_CARD.test(text) && !PRODUCT_CARD.test(description)) continue;
        const location = await card.getLocation();
        candidates.push({ card, text: text || description, ...location });
      }
      seen = candidates.length;
      if (candidates.length) {
        candidates.sort((a, b) => a.y - b.y || a.x - b.x);
        const [first] = candidates;
        await safeTapWithin(first.card, 'categories.product_view', 0.5, 0.35);
        await this.firstVisible([
          'android=new UiSelector().descriptionMatches("(?i)add to cart")',
          'android=new UiSelector().textMatches("(?i)add to cart")'
        ], 10000);
        return first.text.split(/\s+(?:Add item|₹)/i)[0].trim();
      }
      await browser.pause(150);
    }
    throw new Error(`No priced product card became tappable on home (candidates seen: ${seen})`);
  }

  async openAnyProductByTitle() {
    const titles = await $$('android=new UiSelector().className("android.widget.TextView").textContains("Jus+")');
    for (const title of titles) {
      if (!await title.isDisplayed().catch(() => false)) continue;
      const text = (await title.getText().catch(() => '')) || '';
      if (!PRODUCT_CARD.test(text)) continue;
      await safeTapWithin(title, 'categories.product_view', 0.5, 0.5);
      const detail = await this.firstVisible([
        'android=new UiSelector().descriptionMatches("(?i)add to cart")',
        'android=new UiSelector().textMatches("(?i)add to cart")'
      ], 4000).catch(() => null);
      if (detail) return text;
    }
    return false;
  }

  async openAnyProductFromWebView() {
    assertSafeAction('categories.product_view', 'Guest product card');
    const originalContext = await browser.getContext().catch(() => null);
    const contexts = await browser.getContexts().catch(() => []);
    const webview = contexts.find((context) => String(context).toUpperCase().includes('WEBVIEW'));
    if (!webview) return false;
    try {
      await browser.switchContext(webview);
      return await browser.execute(() => {
        // eslint-disable-next-line no-undef -- executed inside the app WebView
        const candidates = [...document.querySelectorAll('a,button,[role="button"],[aria-label]')];
        const target = candidates.find((element) => {
          const value = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`.replace(/\s+/gu, ' ');
          return /Jus\+/i.test(value) && /₹|Add item/i.test(value);
        });
        if (!target) return false;
        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.click();
        return (target.textContent || target.getAttribute('aria-label') || '').replace(/\s+/gu, ' ').trim();
      });
    } finally {
      if (originalContext) await browser.switchContext(originalContext);
    }
  }

  async openPromiseCard() {
    for (let viewport = 1; viewport <= PROMISE_MAX_SCROLLS; viewport += 1) {
      const before = await this.source();
      await this.scrollToPromiseViewport();
      const target = await this.promiseCardTarget();
      if (target) {
        await safeTapWithin(target, 'home.promise_open');
        return `opened the JUST Promise bottom sheet from Home after ${viewport} viewport scroll(s)`;
      }
      if (await this.source() === before) break;
      const webviewBanner = await this.openBannerAboveGroceryFromWebView();
      if (webviewBanner) {
        console.info(`[guest-issues] clicked Home promise banner identifier=${webviewBanner.identifier}`);
        return `opened the JUST Promise bottom sheet using ${webviewBanner.identifier}`;
      }
    }
    throw new Error(`JUST Promise card was not exposed within ${PROMISE_MAX_SCROLLS} bounded Home viewport scrolls`);
  }

  async openBannerAboveGroceryFromWebView() {
    assertSafeAction('home.promise_open', 'JUST Promise image banner');
    const originalContext = await browser.getContext().catch(() => null);
    const contexts = await browser.getContexts().catch(() => []);
    const webview = contexts.find((context) => String(context).toUpperCase().includes('WEBVIEW'));
    if (!webview) return false;
    try {
      await browser.switchContext(webview);
      return await browser.execute((asset) => {
        /* eslint-disable no-undef -- executed inside the app WebView */
        const hasAsset = (value) => (value || '').includes(asset);
        const bannerImage = [...document.images].find((image) => (
          hasAsset(image.src)
          || hasAsset(image.currentSrc)
          || hasAsset(image.getAttribute('srcset'))
          || hasAsset(image.getAttribute('data-src'))
          || hasAsset(image.getAttribute('data-lazy-src'))
          || hasAsset(image.getAttribute('data-original'))
        ));
        if (bannerImage) {
          const clickTarget = bannerImage.closest('a,button,[role="button"]') || bannerImage;
          clickTarget.scrollIntoView({ block: 'center', inline: 'center' });
          clickTarget.click();
          const visibleRect = bannerImage.getBoundingClientRect();
          return { identifier: `img[src*="${asset}"]`, tag: bannerImage.tagName, className: bannerImage.className, x: visibleRect.left + visibleRect.width / 2, y: visibleRect.top + visibleRect.height / 2 };
        }
        const assetNode = [...document.querySelectorAll('*')].find((element) => (
          [...element.attributes].some((attribute) => hasAsset(attribute.value))
          || hasAsset(element.getAttribute('style'))
        ));
        if (assetNode) {
          const clickTarget = assetNode.closest('a,button,[role="button"]') || assetNode;
          assetNode.scrollIntoView({ block: 'center', inline: 'center' });
          clickTarget.click();
          const rect = assetNode.getBoundingClientRect();
          return { identifier: `*[data-asset*="${asset}"]`, tag: assetNode.tagName, className: assetNode.className, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        // Do not click an inferred sibling: it can be a different catalogue card.
        return false;
      }, PROMISE_BANNER_ASSET);
    } finally {
      if (originalContext) await browser.switchContext(originalContext);
    }
  }

  async promiseCardTarget() {
    const { width, height } = await browser.getWindowSize();
    const assetImage = await $('android=new UiSelector().textContains("4476f14b-d28e-4263-bb7e-48c847f7f58b_image14")');
    if (await assetImage.isExisting().catch(() => false)) return assetImage;
    const images = await $$('android=new UiSelector().className("android.widget.Image")');
    for (const image of images) {
      if (!await image.isDisplayed().catch(() => false)) continue;
      const resourceId = await image.getAttribute('resource-id').catch(() => '');
      const imageAsset = await image.getText().catch(() => '');
      if (imageAsset.includes(PROMISE_BANNER_ASSET.replace(/\.png$/i, ''))
        || /(promise|refund|return|split)/i.test(resourceId)) return image;
    }
    const containers = await $$('android=new UiSelector().resourceIdMatches(".*homeSplitCardContainer")');
    for (const container of containers) {
      if (!await container.isDisplayed().catch(() => false)) continue;
      const [location, size] = await Promise.all([container.getLocation(), container.getSize()]);
      if (size.width >= width * 0.7 && size.height >= 100 && size.height <= height * 0.5
        && location.y >= height * 0.1 && location.y <= height * 0.8) return container;
    }
    return null;
  }

  async scrollToPromiseViewport() {
    await safeScroll('nav.scroll', 'down');
    await browser.pause(400);
  }

  async dismissPromiseCard() {
    const button = await this.firstVisible([
      '~Close',
      'android=new UiSelector().description("Close")',
      'android=new UiSelector().textMatches("(?i)close")'
    ]);
    await safeClick(button, 'home.promise_dismiss', 'Close');
    return 'dismissed the JUST Promise bottom sheet with Close';
  }
}
