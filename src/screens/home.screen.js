import { BaseScreen } from './base.screen.js';
import { assertSafeAction, safeClick, safeScroll, safeTapWithin, PRODUCT_CARD } from '../safety/guard.js';

const PROMISE_MAX_SCROLLS = 24;
const PROMISE_BANNER_ASSET_STEM = '4476f14b-d28e-4263-bb7e-48c847f7f58b_image14';
const PROMISE_HALF_CARD_ASSET = 'Half%20Card%20(1).png';

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
        '~Add item',
        'android=new UiSelector().description("Add item")',
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
          '~Add item',
          'android=new UiSelector().description("Add item")',
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
        '~Add item',
        'android=new UiSelector().description("Add item")',
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

  async openPromiseHalfCard() {
    for (let viewport = 0; viewport <= PROMISE_MAX_SCROLLS; viewport += 1) {
      const target = await this.nativePromiseBanner();
      if (target) {
        await safeTapWithin(target, 'home.promise_open');
        return `opened the JUST Promise bottom sheet from Home after ${viewport} viewport scroll(s)`;
      }
      const webviewBanner = await this.clickPromiseBannerInWebView();
      if (webviewBanner) {
        console.info(`[guest-issues] clicked Home promise banner identifier=${webviewBanner.identifier}`);
        return `opened the JUST Promise bottom sheet using ${webviewBanner.identifier}`;
      }
      if (viewport < PROMISE_MAX_SCROLLS) {
        await safeScroll('nav.scroll', 'down');
        await browser.pause(400);
      }
    }
    throw new Error(`JUST Promise card was not exposed within ${PROMISE_MAX_SCROLLS} bounded Home viewport scrolls`);
  }

  async clickPromiseBannerInWebView() {
    assertSafeAction('home.promise_open', 'JUST Promise image banner');
    const originalContext = await browser.getContext().catch(() => null);
    const contexts = await browser.getContexts().catch(() => []);
    const webview = contexts.find((context) => String(context).toUpperCase().includes('WEBVIEW'));
    if (!webview) return false;
    try {
      await browser.switchContext(webview);
      return await browser.execute((bannerAssetStem, halfCardAsset) => {
        /* eslint-disable no-undef -- executed inside the app WebView */
        const deeplinkNode = [...document.querySelectorAll('a[href],[data-deeplink]')]
          .find((element) => [...element.attributes].some(({ value }) => (
            value.includes('externalWidget')
            && value.includes('card_type=HALF_CARD')
            && (value.includes(halfCardAsset) || value.includes('Half Card (1).png'))
          )));
        const bannerImage = [...document.images].find((image) => (
          [image.src, image.currentSrc, image.srcset, image.getAttribute('data-src')]
            .some((value) => (value || '').includes(bannerAssetStem))
        ));
        const normalize = (value) => (value || '').replace(/\s+/gu, ' ').trim();
        const groceryHeading = [...document.querySelectorAll('*')]
          .find((element) => normalize(element.textContent) === 'Grocery & Kitchen');
        let anchoredImage = null;
        if (groceryHeading) {
          const headingTop = groceryHeading.getBoundingClientRect().top;
          anchoredImage = [...document.images]
            .map((image) => ({ image, rect: image.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width >= window.innerWidth * 0.9
              && rect.height / rect.width >= 0.18
              && rect.height / rect.width <= 0.25
              && rect.bottom <= headingTop + 8)
            .sort((left, right) => (headingTop - left.rect.bottom) - (headingTop - right.rect.bottom))[0]?.image || null;
        }
        const identifiedNode = deeplinkNode || bannerImage || anchoredImage;
        if (identifiedNode) {
          const clickTarget = identifiedNode.matches('a,button,[role="button"]')
            ? identifiedNode
            : identifiedNode.closest('a,button,[role="button"]')
              || identifiedNode.querySelector('a,button,[role="button"]')
              || identifiedNode;
          clickTarget.scrollIntoView({ block: 'center', inline: 'center' });
          clickTarget.click();
          return {
            identifier: deeplinkNode
              ? 'deeplink[card_type=HALF_CARD]'
              : bannerImage
                ? `img[src*="${bannerAssetStem}"]`
                : 'fullwidth-image-before=Grocery & Kitchen',
            tag: identifiedNode.tagName,
            className: identifiedNode.className
          };
        }
        return false;
      }, PROMISE_BANNER_ASSET_STEM, PROMISE_HALF_CARD_ASSET);
    } finally {
      if (originalContext) await browser.switchContext(originalContext);
    }
  }

  async nativePromiseBanner() {
    const image = await $(`android=new UiSelector().className("android.widget.Image").textContains("${PROMISE_BANNER_ASSET_STEM}")`);
    return await image.isDisplayed().catch(() => false) ? image : null;
  }
}
