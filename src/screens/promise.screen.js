import { BaseScreen } from './base.screen.js';

export class PromiseScreen extends BaseScreen {
  async assertRefundSheet() {
    // The current APK exposes the sheet as an AlertDialog. The designed card
    // content is painted into an image/WebView and has no accessible text;
    // the reliable actionable oracle is the separate native Close button.
    await this.firstVisible([
      'android=new UiSelector().className("android.app.AlertDialog")'
    ]);
    await this.firstVisible([
      '~Close',
      'android=new UiSelector().description("Close")',
      'android=new UiSelector().textMatches("(?i)close")'
    ]);
    return 'refund guidance bottom sheet dialog and native Close button are visible';
  }

  async assertRefundSheetClosed() {
    const dialog = await $('android=new UiSelector().className("android.app.AlertDialog")');
    if (await dialog.isDisplayed().catch(() => false)) {
      throw new Error('JUST Promise bottom sheet remained visible after tapping Close');
    }
    return 'JUST Promise bottom sheet dialog is no longer visible after tapping Close';
  }
}
