import { BaseScreen } from './base.screen.js';

export class CartScreen extends BaseScreen {
  async assertBagWidget() {
    await this.textVisible('Delivery without carry bags', true);
    await this.textVisible("We don't use carry bags to keep prices low for you. Items will be securely packed.", true);
    return 'cart shows the Delivery without carry bags widget with the expected JUST copy';
  }
}
