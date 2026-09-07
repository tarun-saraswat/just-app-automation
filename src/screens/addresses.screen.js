import { BaseScreen } from './base.screen.js';

export class AddressesScreen extends BaseScreen {
  async assertAddressList(fixtures) {
    const source = await this.source();
    if (!/address|home|work|other/i.test(source)) throw new Error('No saved address loaded');
    for (const row of fixtures.filter((item) => item.expected_non_sensitive_value)) {
      if (!source.toLowerCase().includes(row.expected_non_sensitive_value.toLowerCase())) {
        throw new Error(`Address fixture field not found: ${row.field}`);
      }
    }
    return 'at least one saved address and configured non-sensitive fields loaded';
  }
}

