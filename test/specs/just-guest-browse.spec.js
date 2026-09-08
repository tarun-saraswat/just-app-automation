import assert from 'node:assert/strict';
import { Results } from '../../src/reporting/results.js';
import { LocationScreen } from '../../src/screens/location.screen.js';
import { HomeScreen } from '../../src/screens/home.screen.js';
import { TaxonomyScreen } from '../../src/screens/taxonomy.screen.js';
import { ProductScreen } from '../../src/screens/product.screen.js';
import { SearchScreen } from '../../src/screens/search.screen.js';
import { AccountScreen } from '../../src/screens/account.screen.js';
import { CartScreen } from '../../src/screens/cart.screen.js';
import { readCsv } from '../../src/utils/csv.js';

const results = new Results();
const location = new LocationScreen();
const home = new HomeScreen();
const taxonomy = new TaxonomyScreen();
const product = new ProductScreen();
const search = new SearchScreen();
const account = new AccountScreen();
const cart = new CartScreen();
const categoryFixture = readCsv('fixtures/categories.csv');
const accountFixture = readCsv('fixtures/account.csv');
let guestReady = false;
// Ranking contract: an Atta product with several pack sizes must appear in the
// top results, so the scan is bounded instead of scrolling the whole catalogue.
const ATTA_TOP_N = 5;

function sampledCategories(rows, count) {
  const seed = process.env.CATEGORY_SAMPLE_SEED || `${Date.now()}`;
  let state = [...seed].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const pool = rows.filter((row) => row.row_type === 'category').map((row) => row.category);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  const selected = pool.slice(0, count);
  console.info(`[category-sample] seed=${JSON.stringify(seed)} selected=${JSON.stringify(selected)}`);
  return { seed, selected };
}

async function testCase(name, expected, body) {
  const started = Date.now();
  console.info(`[case] START name=${name} expected=${JSON.stringify(expected)}`);
  try {
    const observed = await body();
    results.record({ scenario: name, expected, observed: Array.isArray(observed) ? observed.join(' | ') : observed, status: 'PASS', durationMs: Date.now() - started, sessionId: browser.sessionId });
    console.info(`[case] PASS name=${name} durationMs=${Date.now() - started} observed=${JSON.stringify(observed)}`);
    return observed;
  } catch (error) {
    results.record({ scenario: name, expected, observed: `${error.name}: ${error.message}`, status: 'FAIL', durationMs: Date.now() - started, sessionId: browser.sessionId });
    console.error(`[case] FAIL name=${name} durationMs=${Date.now() - started} error=${JSON.stringify(error.message)}`);
    throw error;
  }
}

describe('Just guest flow without login', () => {
  beforeEach(async () => {
    if (!guestReady) return;
    const recovery = await home.recoverBackToHome();
    const cartCleanup = await cart.clearIfPresent();
    const restored = await home.recoverBackToHome();
    console.info(`[case-boundary] beforeEach=${JSON.stringify(recovery)} cart=${JSON.stringify(cartCleanup)} restored=${JSON.stringify(restored)}`);
  });

  afterEach(async function recoverAfterTest() {
    if (!guestReady) return;
    try {
      const recovery = await home.recoverBackToHome();
      console.info(`[case-boundary] afterEach=${JSON.stringify(recovery)}`);
    } catch (error) {
      console.error(`[case-boundary] afterEach recovery failed: ${JSON.stringify(error.message)}`);
      if (this.currentTest?.state !== 'failed') throw error;
    }
  });

  it('skips login and selects Budhwal Haryana manually', async () => {
    await testCase('guest_location', 'Budhwal, Haryana can be selected using the exact query Budhwal Haryana', async () => {
      const observed = await location.selectGuestLocation('Budhwal Haryana', 'Budhwal');
      guestReady = true;
      return observed;
    });
  });

  it('loads the guest home catalogue', async () => {
    await testCase('guest_home', 'guest home catalogue loads without authentication', async () => {
      await home.waitLoaded();
      return 'guest home catalogue loaded';
    });
  });

  it('offers login from Account and returns the guest user Home', async () => {
    await testCase('guest_account_login_option', 'Account shows its configured guest login copy and enabled button, opens login, and Back returns Home', async () => {
      await home.openAccount();
      const opened = await account.openGuestLogin(accountFixture);
      const returned = await account.returnToHome(accountFixture);
      await home.waitLoaded();
      return `${opened}; ${returned}`;
    });
  });

  it('opens and validates the categories catalogue', async () => {
    await testCase('guest_categories', 'Explore Categories opens a populated category catalogue', async () => {
      await home.openTaxonomy();
      await taxonomy.textVisible('Categories', true);
      const catalogue = await taxonomy.assertCatalogue(categoryFixture);
      return catalogue;
    });
  });

  it('opens three sampled categories and validates every subcategory has products', async () => {
    await testCase('guest_category_subcategories', 'three CSV categories open and every discovered left-side subcategory contains at least one product', async () => {
      const { seed, selected } = sampledCategories(categoryFixture, 3);
      assert.equal(selected.length, 3, 'The category CSV must contain at least three categories');
      assert.equal(new Set(selected).size, selected.length, 'The random category sample must not contain duplicates');
      const observations = [];
      for (const categoryName of selected) {
        await home.openTaxonomy();
        await taxonomy.textVisible('Categories', true);
        try {
          await taxonomy.openCategory(categoryName);
          observations.push(await taxonomy.assertEverySubcategoryHasProducts(categoryName));
        } finally {
          const recovery = await home.recoverBackToHome();
          console.info(`[category-sample] category=${JSON.stringify(categoryName)} cleanup=${JSON.stringify(recovery)}`);
        }
      }
      return `seed=${seed}; ${observations.join(' | ')}`;
    });
  });

  it('opens a home product and validates every detail section', async () => {
    await testCase('guest_product', 'any home product opens detail sections that are all present without login', async () => {
      const openedProduct = await home.openAnyProduct();
      const sections = await product.assertAllSections();
      return `${openedProduct}: ${sections}`;
    });
  });

  it('swipes through the product image gallery', async () => {
    await testCase('guest_product_gallery', 'the product gallery can be swiped right without losing the detail page', async () => {
      await home.openAnyProduct();
      return product.swipeProductImages(2);
    });
  });

  it('shares the opened PDP with product text and link', async () => {
    await testCase('guest_product_share', 'Share opens a preview with PDP text and a product-specific HTTPS link', async () => {
      await home.openAnyProduct();
      return product.assertShareBehaviour();
    });
  });

  it('adds one pack of the opened product to the guest cart', async () => {
    await testCase('guest_cart_add', 'one pack of the opened product can be added without checkout', async () => {
      await home.openAnyProduct();
      const added = await product.addOneToCart();
      await product.removeFromCart();
      return `${added}; cart state cleaned up`;
    });
  });

  it('removes the pack from the guest cart', async () => {
    await testCase('guest_cart_remove', 'the recorded trash control returns the product to Add to Cart state', async () => {
      await home.openAnyProduct();
      await product.addOneToCart();
      return product.removeFromCart();
    });
  });

  it('returns the ordered top three products for Toothpaste', async () => {
    await testCase('guest_search_toothpaste', 'Toothpaste returns three ordered products whose names have the Jus+ prefix', async () => {
      await home.openSearch();
      await search.search('Toothpaste');
      await search.assertResultsFor('toothpaste');
      const toothpasteTopThree = await search.topProductNames(3);
      assert.equal(toothpasteTopThree.length, 3, 'Toothpaste must return three visible product names');
      for (const name of toothpasteTopThree) {
        assert.match(name, /^Jus\+\s+/, `Expected Jus+ prefix for search result: ${name}`);
      }
      return toothpasteTopThree;
    });
  });

  it('returns the same top three products for Colgate', async () => {
    await testCase('guest_search_colgate', 'Colgate yields the same top three products as Toothpaste', async () => {
      await home.openSearch();
      await search.search('Toothpaste');
      await search.assertResultsFor('toothpaste');
      const toothpasteTopThree = await search.topProductNames(3);
      await home.recoverBackToHome();
      await home.openSearch();
      await search.search('Colgate');
      await search.assertResultsFor('colgate');
      const colgateTopThree = await search.topProductNames(3);
      assert.deepEqual([...colgateTopThree].sort(), [...toothpasteTopThree].sort());
      return colgateTopThree;
    });
  });

  it('opens and validates multi and single pack-size products from the top Atta results', async () => {
    await testCase('guest_search_atta', 'top Atta results include opened and fully validated multi and single pack-size product pages', async () => {
      await home.openSearch();
      await search.search('Atta');
      const ranked = await search.waitForResultsMatching('Atta');
      console.info(`[atta] ranked top results=${JSON.stringify(ranked)}`);
      const total = Math.min(ranked.length, ATTA_TOP_N);
      assert.ok(total > 0, 'Atta must return at least one priced result');
      const scanned = [];
      let validatedMulti = false;
      let validatedSingle = false;
      for (let index = 0; index < total; index += 1) {
        const name = await search.openResultByIndex(index, ATTA_TOP_N);
        const options = await product.variantOptions();
        const observedCount = options.length || 1;
        console.info(`[atta] opened rank=${index + 1} name=${JSON.stringify(name)} variantCount=${observedCount} variants=${JSON.stringify(options.map((option) => option.text))}`);
        if (options.length >= 2 && !validatedMulti) {
          const visited = await product.assertVariantSwitching(options);
          const sections = await product.assertAllSections();
          scanned.push(`${name}: multi pack-size (${visited.length} switched); ${sections}`);
          validatedMulti = true;
        } else if (options.length < 2 && !validatedSingle) {
          const sections = await product.assertAllSections();
          const packSize = await product.assertSinglePackSize();
          scanned.push(`${name}: single pack-size; ${packSize}; ${sections}`);
          validatedSingle = true;
        } else {
          scanned.push(`${name}: ${observedCount} pack size(s), classification already validated`);
        }
        await product.back();
        await search.waitForResultsMatching('Atta');
        if (validatedMulti && validatedSingle) break;
      }
      assert.ok(validatedMulti, `No multi pack-size product was opened in the top ${ATTA_TOP_N} Atta results (scanned: ${scanned.join(' | ')})`);
      assert.ok(validatedSingle, `No single pack-size product was opened in the top ${ATTA_TOP_N} Atta results (scanned: ${scanned.join(' | ')})`);
      return scanned;
    });
  });
});
