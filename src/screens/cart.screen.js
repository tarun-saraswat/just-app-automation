import { BaseScreen, CART_REMOVE_SELECTORS } from './base.screen.js';
import { safeClick, safeWebViewCartOpen } from '../safety/guard.js';

const CLEAR_CART_SELECTORS = [
  'android=new UiSelector().textMatches("(?i)^clear cart$")',
  'android=new UiSelector().descriptionMatches("(?i)^clear cart$")'
];

const CART_VIEW_SELECTORS = [
  'android=new UiSelector().textContains("Your Cart")',
  'android=new UiSelector().descriptionContains("Your Cart")',
  'android=new UiSelector().textContains("View Cart")',
  'android=new UiSelector().descriptionContains("View Cart")',
  'android=new UiSelector().textMatches("(?i)your cart.*")',
  'android=new UiSelector().descriptionMatches("(?i)(your|view) cart.*")'
];

export class CartScreen extends BaseScreen {
  async clearUnserviceablePopupIfPresent(timeoutMs = 500) {
    const clear = await this.firstVisible(CLEAR_CART_SELECTORS, timeoutMs).catch(() => null);
    if (!clear) return false;
    await safeClick(clear, 'cart.clear_unserviceable', 'Clear Cart');
    await browser.waitUntil(async () => {
      for (const selector of CLEAR_CART_SELECTORS) {
        if (await $(selector).isDisplayed().catch(() => false)) return false;
      }
      return true;
    }, {
      timeout: 5000,
      interval: 150,
      timeoutMsg: 'Unserviceable-cart popup remained visible after Clear Cart'
    });
    return true;
  }

  async openExistingCart() {
    const nativeCart = await this.firstVisible(CART_VIEW_SELECTORS, 1200).catch(() => null);
    if (nativeCart) {
      await safeClick(nativeCart, 'cart.view', 'Cart');
      return true;
    }
    return Boolean(await safeWebViewCartOpen({ required: false }));
  }

  async clearIfPresent(maxRemovals = 30) {
    if (await this.clearUnserviceablePopupIfPresent(1200)) {
      return 'cleared an unserviceable cart from the Clear Cart popup';
    }

    if (!await this.openExistingCart()) return 'cart already empty';

    if (await this.clearUnserviceablePopupIfPresent(2000)) {
      return 'cleared an unserviceable cart from the Clear Cart popup';
    }

    let removals = 0;
    while (removals < maxRemovals) {
      const remove = await this.firstVisible(CART_REMOVE_SELECTORS, 800).catch(() => null);
      if (!remove) break;
      const before = await this.source();
      await safeClick(remove, 'product.cart_remove', 'Remove from Cart');
      removals += 1;
      await browser.waitUntil(async () => {
        if (!await remove.isExisting().catch(() => false)) return true;
        return await this.source() !== before;
      }, {
        timeout: 5000,
        interval: 150,
        timeoutMsg: 'Cart did not change after removing an item'
      });
    }

    const remaining = await this.firstVisible(CART_REMOVE_SELECTORS, 300).catch(() => null);
    if (remaining) throw new Error(`Cart still contains items after ${maxRemovals} bounded remove actions`);
    if (!removals) throw new Error('Existing cart opened without an accessible remove control');
    return `cleared a serviceable cart with ${removals} remove action(s)`;
  }

  async assertBagWidget() {
    await this.textVisible('Delivery without carry bags', true);
    await this.textVisible("We don't use carry bags to keep prices low for you. Items will be securely packed.", true);
    return 'cart shows the Delivery without carry bags widget with the expected JUST copy';
  }
}
