import { BaseScreen } from './base.screen.js';
import { safeClick, safeTapWithin, PRODUCT_CARD, PRICE } from '../safety/guard.js';

export class HomeScreen extends BaseScreen {
  async isLoaded() {
    for (const selector of [
      '~Account', '~Profile',
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
    await this.scrollToText('Jus+', 6);
    const deadline = Date.now() + 30000;
    let seen = 0;
    while (Date.now() < deadline) {
      const cards = await $$('android=new UiSelector().textContains("Jus+")');
      const candidates = [];
      for (const card of cards) {
        if (!await card.isDisplayed().catch(() => false)) continue;
        const text = (await card.getText().catch(() => '')) || '';
        if (!PRODUCT_CARD.test(text) || !PRICE.test(text)) continue;
        const location = await card.getLocation();
        candidates.push({ card, text, ...location });
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
}
