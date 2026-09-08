import { config as guestConfig } from './wdio.guest.cloud.conf.js';

export const config = {
  ...guestConfig,
  specs: ['./test/specs/just-guest-issue-tracker.spec.js']
};
