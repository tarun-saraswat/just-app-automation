import { BaseScreen } from './base.screen.js';

export class PromiseScreen extends BaseScreen {
  async assertRefundSheet() {
    await this.textVisible('Pasand nahi aaya? Refund lena aasan hai', true);
    await this.textVisible('Not happy with the product? Getting a refund is easy', true);
    await this.textVisible('Open > Profile > Past Orders', true);
    await this.textVisible('Raise a return request', true);
    await this.textVisible('Pickup & Refund', true);
    await this.textVisible('Okay, got it', true);
    return 'refund guidance bottom sheet shows the expected title, steps, policy link, and dismiss CTA';
  }

  async assertRefundSheetClosed() {
    const title = await $(
      'android=new UiSelector().textMatches("(?i)pasand nahi aaya\\? refund lena aasan hai")'
    );
    if (await title.isDisplayed().catch(() => false)) {
      throw new Error('JUST Promise bottom sheet remained visible after tapping Okay, got it');
    }
    return 'JUST Promise bottom sheet closed after tapping Okay, got it';
  }
}
