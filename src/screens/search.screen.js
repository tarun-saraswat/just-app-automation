import { BaseScreen } from './base.screen.js';
import { safeClick, safeKey, safeSetValue, safeTapWithin, PRODUCT_CARD, PRICE } from '../safety/guard.js';

export class SearchScreen extends BaseScreen {
  async search(query) {
    console.info(`[search] submitting query=${JSON.stringify(query)}`);
    const input = await this.firstVisible([
      'android=new UiSelector().className("android.widget.EditText")',
      '//android.widget.EditText',
      'android=new UiSelector().resourceIdMatches(".*search.*").className("android.widget.EditText")'
    ]);
    await input.clearValue().catch(() => {});
    await safeSetValue(input, 'search.input', query);
    await safeKey('search.submit', 'ENTER');
    await browser.pause(500);
    const showAll = await $('android=new UiSelector().textContains("Show all results for")');
    if (await showAll.isDisplayed().catch(() => false)) {
      console.info(`[search] keyboard submission left suggestions open; clicking show-all for query=${JSON.stringify(query)}`);
      await safeClick(showAll, 'search.submit', 'Show all search results');
    }
    await browser.pause(1000);
  }

  // A previous query's cards stay on screen while the new ones load, so wait
  // until the visible results actually belong to this term before reading them.
  async waitForResultsMatching(term, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    const matcher = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    let observed = [];
    let previousSignature = '';
    while (Date.now() < deadline) {
      const cards = await this.resultCards(5);
      observed = cards.map((card) => card.name);
      const signature = observed.join(' | ');
      const allMatch = observed.length > 0 && observed.every((name) => matcher.test(name));
      if (allMatch && signature === previousSignature) {
        console.info(`[search] settled query=${JSON.stringify(term)} results=${JSON.stringify(observed)}`);
        return observed;
      }
      previousSignature = allMatch ? signature : '';
      await browser.pause(700);
    }
    throw new Error(`Search results never settled on "${term}" (observed: ${observed.join(' | ') || 'none'})`);
  }

  async productNames(limit = 10) {
    const elements = await $$('android=new UiSelector().resourceIdMatches(".*(product.*name|item.*name|title).*")');
    const names = [];
    for (const element of elements.slice(0, limit)) {
      const name = (await element.getText()).trim();
      if (name && !names.includes(name) && !/add|₹|off/i.test(name)) names.push(name);
    }
    if (!names.length) {
      const source = await this.source();
      const textValues = [...source.matchAll(/text="([^"]{4,80})"/g)].map((match) => match[1]);
      return textValues.filter((name) => /toothpaste|colgate/i.test(name)).slice(0, limit);
    }
    return names;
  }

  async openProductByName(name) {
    let element;
    try {
      element = await this.textVisible(name);
    } catch (error) {
      const source = await this.source();
      const visibleText = [...source.matchAll(/(?:text|content-desc)="([^"]+)"/g)]
        .map((match) => match[1]).filter(Boolean).slice(0, 20);
      throw new Error(`${error.message}; visible UI: ${visibleText.join(' | ') || 'no accessibility text'}`);
    }
    await safeClick(element, 'search.result_view', 'Product result');
  }

  // Priced result cards in on-screen order. Never scrolls: callers only reason
  // about the top results the ranking puts in the first viewport.
  async resultCards(limit = 5) {
    const deadline = Date.now() + 20000;
    let candidates = [];
    while (Date.now() < deadline) {
      candidates = [];
      const cards = await $$('android=new UiSelector().className("android.widget.Button").clickable(true).textContains("Jus+")');
      for (const card of cards) {
        if (!await card.isDisplayed().catch(() => false)) continue;
        const text = ((await card.getText().catch(() => '')) || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
        if (!PRODUCT_CARD.test(text) || !PRICE.test(text)) continue;
        const location = await card.getLocation();
        const name = (text.match(/^(.+?)(?=\s+(?:Add item\b|\d+(?:\.\d+)?\s*(?:g|kg|ml|l|pc|pcs|piece|pieces)\b|₹))/i)?.[1] || text).trim();
        candidates.push({ card, text, name, ...location });
      }
      if (candidates.length) break;
      await browser.pause(500);
    }
    candidates.sort((a, b) => a.y - b.y || a.x - b.x);
    return [...new Map(candidates.map((entry) => [entry.name, entry])).values()].slice(0, limit);
  }

  // Re-resolves the card list before tapping, because navigating away and back
  // invalidates previously fetched elements.
  async openResultByIndex(index, limit = 5) {
    const cards = await this.resultCards(limit);
    const target = cards[index];
    if (!target) throw new Error(`No priced result card at position ${index + 1} (found ${cards.length})`);
    console.info(`[search] opening rank=${index + 1} name=${JSON.stringify(target.name)} raw=${JSON.stringify(target.text)}`);
    await safeTapWithin(target.card, 'search.result_view', 0.5, 0.35);
    await this.firstVisible([
      'android=new UiSelector().descriptionMatches("(?i)add to cart")',
      'android=new UiSelector().textMatches("(?i)add to cart")'
    ], 20000);
    console.info(`[search] opened product name=${JSON.stringify(target.name)}`);
    return target.name;
  }

  async assertResultsFor(term) {
    await this.firstVisible([
      `android=new UiSelector().textContains("${term}")`,
      `android=new UiSelector().descriptionContains("${term}")`
    ]);
    const source = await this.source();
    if (!/₹|add/i.test(source)) throw new Error(`No purchasable results loaded for ${term}`);
    return `search results loaded for ${term}`;
  }

  async topProductNames(limit = 3) {
    const selectors = [
      'android=new UiSelector().resourceIdMatches(".*(product.*name|item.*name|title).*")'
    ];
    const deadline = Date.now() + 20000;
    let observed = [];
    while (Date.now() < deadline) {
      let elements = await $$(selectors[0]);
      if (!elements.length) elements = await $$('//*[contains(@text,"Toothpaste") or contains(@content-desc,"Toothpaste")]');
      const entries = [];
      for (const element of elements) {
        if (!await element.isDisplayed().catch(() => false)) continue;
        const raw = (await element.getText().catch(() => '')) || (await element.getAttribute('content-desc').catch(() => ''));
        const normalized = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
        // Search result cards are often exposed as one accessibility string:
        // "<product name> Add item <pack/price/details>".
        const name = (normalized.match(/^(.+?)(?=\s+(?:Add item\b|\d+(?:\.\d+)?\s*(?:g|kg|ml|l)\b|₹))/i)?.[1] || normalized).trim();
        if (!/^Jus\+\s+/i.test(name) || /^(add|₹|rs\.?|\d+\s*(g|kg|ml|l)|.*off)$/i.test(name)) continue;
        const location = await element.getLocation();
        entries.push({ name, x: location.x, y: location.y });
      }
      observed = [...new Map(entries.sort((a, b) => a.y - b.y || a.x - b.x).map((entry) => [entry.name, entry])).values()];
      if (observed.length >= limit) return observed.slice(0, limit).map((entry) => entry.name);
      await browser.pause(500);
    }
    throw new Error(`Expected ${limit} visible product names, observed ${observed.length}: ${observed.map((entry) => entry.name).join(' | ')}`);
  }
}
