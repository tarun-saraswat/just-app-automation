import { BaseScreen } from './base.screen.js';
import { safeClick } from '../safety/guard.js';

export class OrdersScreen extends BaseScreen {
  async openExistingOrder() {
    const target = await this.firstVisible([
      'android=new UiSelector().resourceIdMatches(".*order.*card.*")',
      'android=new UiSelector().textMatches("(?i)(delivered|order id|order #|view details|track order)")'
    ], 20000);
    await safeClick(target, 'orders.existing_order_view', 'Existing order details');
  }

  async assertOrderDetails() {
    const source = await this.source();
    this.assertSourceHas(source, [
      /order\s*(id|#)|order details/i,
      /date|placed on|delivered on/i,
      /status|delivered|processing|on the way/i,
      /item|product/i,
      /total|₹|rs\.?/i,
      /delivery address|delivered to/i,
      /payment|paid via|payment method/i
    ], 'Order details');
    return 'order identifier, date, status, items, total, address summary and payment summary loaded';
  }

  async openTracking() {
    const target = await this.firstVisible([
      'android=new UiSelector().textMatches("(?i)(track order|view tracking|order status)")'
    ]);
    await safeClick(target, 'orders.tracking_view', 'Track order');
  }

  async assertTracking() {
    const source = await this.source();
    this.assertSourceHas(source, [/track|order status|arriving|delivered/i, /status|confirmed|packed|picked|arriving|delivered/i], 'Tracking');
    return 'tracking status components loaded';
  }
}

