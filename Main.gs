/**
 * Main.gs - Entry Points and Menu Functions
 * Main orchestration and user-facing functions
 */

/* ========================== MAIN ENTRY POINT ========================== */
function getDailyPromotions(ignoreHours = false) {
  try {
    // FIXED: Changed to downtime check (1am-5am = don't run)
    if (!ignoreHours) {
      const hour = new Date().getHours();
      if (hour >= CONFIG.DOWNTIME_HOURS.START && hour < CONFIG.DOWNTIME_HOURS.END) {
        Logger.log(`⏸ Skipping run during downtime hours (${CONFIG.DOWNTIME_HOURS.START}am-${CONFIG.DOWNTIME_HOURS.END}am).`);
        return;
      }
    }

    // Get configuration
    const props = getProps();
    const headers = ApiService.makeHeaders(props.apiKey);
    const baseUrl = `${props.apiBase}${props.reportingPath}`;

    // Fetch all data
    Logger.log('📥 Fetching data from API...');
    const productsById = ApiService.fetchAllProducts(`${baseUrl}/products`, headers);
    const inventoryById = ApiService.fetchAllInventory(`${baseUrl}/inventory`, headers);
    const discounts = ApiService.fetchAllDiscounts(`${baseUrl}/discounts`, headers);

    Logger.log(`✓ Fetched: ${Object.keys(productsById).length} products, ${Object.keys(inventoryById).length} inventory items, ${discounts.length} discounts`);

    // Build all tabs
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    Logger.log('📝 Building Specials tab...');
    const specialsCount = TabBuilders.buildSpecials(ss, discounts);

    Logger.log('📝 Building Promotion Products tabs...');
    const promoStats = TabBuilders.buildPromotionProducts(ss, discounts, productsById, inventoryById, props);

    Logger.log('📝 Building Daily Deals tabs...');
    const dealsStats = TabBuilders.buildDailyDeals(ss, discounts, productsById, inventoryById, props);

    // Log results
    Logger.log(`✅ Complete! Specials=${specialsCount}, Promotions: Master=${promoStats.master}, Stash=${promoStats.stash}, Grove=${promoStats.grove}, Daily Deals: Stash=${dealsStats.stash}, Grove=${dealsStats.grove}`);

  } catch (error) {
    Logger.log(`❌ Error in getDailyPromotions: ${error.message}`);
    throw error;
  }
}

/* ========================== TRIGGER MANAGEMENT ========================== */
function createFrequentTrigger() {
  const functionName = 'getDailyPromotions';
  const existingTriggers = ScriptApp.getProjectTriggers();

  // Check if trigger already exists
  const exists = existingTriggers.some(t => t.getHandlerFunction() === functionName);

  if (exists) {
    Logger.log('⏰ Trigger already exists.');
    return;
  }

  // Create new trigger
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log('✅ 15-minute trigger created.');
}

function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log(`🗑️ Deleted ${triggers.length} trigger(s).`);
}

/* ========================== CUSTOM MENU ========================== */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🍯 Promotions')
    .addSubMenu(ui.createMenu('📊 Cutoff Filter')
      .addItem('Remove Cutoff (Show All)', 'setRemoveCutoff')
      .addSeparator()
      .addItem('Set 10%', 'setCutoff10')
      .addItem('Set 15%', 'setCutoff15')
      .addItem('Set 20%', 'setCutoff20')
      .addItem('Set 25% (Default)', 'setCutoff25')
      .addItem('Set 30%', 'setCutoff30'))
    .addSeparator()
    .addItem('🔄 Refresh Now', 'forceRun')
    .addItem('⏰ Setup Auto-Refresh (15 min)', 'createFrequentTrigger')
    .addItem('🗑️ Remove Auto-Refresh', 'deleteAllTriggers')
    .addSeparator()
    .addSubMenu(ui.createMenu('🔧 Debug Tools')
      .addItem('Debug All Discounts', 'debugDiscounts')
      .addItem('Debug Sample Raw Data', 'debugSampleDiscounts')
      .addItem('Debug Location Filtering', 'debugLocationFiltering')
      .addItem('Debug Grove Specifically', 'debugGroveDiscounts'))
    .addToUi();
}

/* ========================== MENU ACTIONS ========================== */
function setRemoveCutoff() {
  updateProperty('REMOVE_CUTOFF', 'true');
  SpreadsheetApp.getUi().alert('✅ Cutoff removed - showing ALL promotions regardless of discount %.');
}

function setCutoff10() { setCutoff(0.10); }
function setCutoff15() { setCutoff(0.15); }
function setCutoff20() { setCutoff(0.20); }
function setCutoff25() { setCutoff(0.25); }
function setCutoff30() { setCutoff(0.30); }

function setCutoff(percent) {
  updateProperty('REMOVE_CUTOFF', 'false');
  updateProperty('CUTOFF_PERCENT', percent);
  SpreadsheetApp.getUi().alert(`✅ Now showing promotions ${(percent * 100).toFixed(0)}% OFF or higher.`);
}

function forceRun() {
  getDailyPromotions(true);
  SpreadsheetApp.getUi().alert('✅ Promotions refreshed!');
}

/* ========================== DEBUG FUNCTIONS ========================== */
function debugDiscounts() {
  const props = getProps();
  const headers = ApiService.makeHeaders(props.apiKey);
  const baseUrl = `${props.apiBase}${props.reportingPath}`;

  const discounts = ApiService.fetchAllDiscounts(`${baseUrl}/discounts`, headers);
  const productsById = ApiService.fetchAllProducts(`${baseUrl}/products`, headers);

  Logger.log(`\n=== DISCOUNT DEBUG ===`);
  Logger.log(`Total discounts: ${discounts.length}`);
  Logger.log(`Cutoff percent: ${props.cutoffPercent}`);
  Logger.log(`Remove cutoff: ${props.removeCutoff}`);
  Logger.log(`\n`);

  let customerFacingCount = 0;

  discounts.forEach(d => {
    const isActive = DiscountFilters.isActiveToday(d);
    const isCustomerFacing = DiscountFilters.isCustomerFacing(d);
    const meetsCutoff = DiscountFilters.meetsCutoffThreshold(d, props.removeCutoff, props.cutoffPercent);
    const isInternal = DiscountFilters.isInternalDiscount(d);
    const products = DiscountFilters.matchProducts(d, productsById);

    if (isCustomerFacing) customerFacingCount++;

    Logger.log(`\n📋 ${d.discountName}`);
    Logger.log(`   RAW API Data:`);
    Logger.log(`     applicationMethod: ${d.applicationMethod}`);
    Logger.log(`     discountType: ${d.discountType}`);
    Logger.log(`     discountMethod: ${d.discountMethod}`);
    Logger.log(`     isActive: ${d.isActive}`);
    Logger.log(`     isDeleted: ${d.isDeleted}`);
    Logger.log(`   Computed:`);
    Logger.log(`     Active Today: ${isActive}`);
    Logger.log(`     Customer-Facing: ${isCustomerFacing}`);
    Logger.log(`     Is Internal (keywords): ${isInternal}`);
    Logger.log(`     Meets Cutoff: ${meetsCutoff}`);
    Logger.log(`     Products: ${products.length}`);

    if (!isActive) Logger.log(`   ❌ FILTERED: Not active`);
    if (!isCustomerFacing) Logger.log(`   ❌ FILTERED: Not customer-facing`);
    if (isInternal) Logger.log(`   ❌ FILTERED: Internal discount`);
    if (!meetsCutoff) Logger.log(`   ❌ FILTERED: Below cutoff`);
    if (products.length === 0) Logger.log(`   ❌ FILTERED: No products`);
  });

  Logger.log(`\n=== SUMMARY ===`);
  Logger.log(`Customer-facing discounts: ${customerFacingCount}`);
  Logger.log(`=== END DEBUG ===\n`);
}

function debugSampleDiscounts() {
  const props = getProps();
  const headers = ApiService.makeHeaders(props.apiKey);
  const baseUrl = `${props.apiBase}${props.reportingPath}`;

  const discounts = ApiService.fetchAllDiscounts(`${baseUrl}/discounts`, headers);

  Logger.log(`\n=== FIRST 5 DISCOUNTS - RAW DATA ===\n`);

  discounts.slice(0, 5).forEach(d => {
    Logger.log(`\n${d.discountName}:`);
    Logger.log(JSON.stringify(d, null, 2));
  });

  Logger.log(`\n=== END SAMPLE ===\n`);
}

/**
 * NEW: Debug function specifically for Grove discounts
 */
function debugGroveDiscounts() {
  const props = getProps();
  const headers = ApiService.makeHeaders(props.apiKey);
  const baseUrl = `${props.apiBase}${props.reportingPath}`;

  const discounts = ApiService.fetchAllDiscounts(`${baseUrl}/discounts`, headers);
  const productsById = ApiService.fetchAllProducts(`${baseUrl}/products`, headers);
  const inventoryById = ApiService.fetchAllInventory(`${baseUrl}/inventory`, headers);

  Logger.log(`\n=== GROVE DISCOUNT DEBUG ===`);
  Logger.log(`Looking for location containing: "${CONFIG.LOCATIONS.GROVE}"`);
  Logger.log(`Cutoff: ${props.cutoffPercent} (${props.cutoffPercent * 100}%)`);
  Logger.log(`\n`);

  let groveCount = 0;
  let passedFiltersCount = 0;

  discounts.forEach(d => {
    const discountName = d.discountName || '';
    const locs = DiscountFilters.getLocationNames(d);
    const toGrove = DiscountFilters.appliesToLocation(d, 'GROVE');

    // Only show Grove-related discounts
    if (!toGrove && !discountName.toLowerCase().includes('grove')) return;

    groveCount++;

    const isActive = DiscountFilters.isActiveToday(d);
    const isCustomerFacing = DiscountFilters.isCustomerFacing(d);
    const meetsCutoff = DiscountFilters.meetsCutoffThreshold(d, props.removeCutoff, props.cutoffPercent);
    const isInternal = DiscountFilters.isInternalDiscount(d);
    let products = DiscountFilters.matchProducts(d, productsById);
    const productCountBefore = products.length;
    products = DiscountFilters.filterByInventory(products, inventoryById);
    const productCountAfter = products.length;
    const isBundleNoInfo = DiscountFilters.isBundleWithoutProductInfo(d);

    const passesAll = isActive && isCustomerFacing && meetsCutoff && !isInternal && (productCountAfter > 0 || isBundleNoInfo);
    if (passesAll) passedFiltersCount++;

    Logger.log(`\n${passesAll ? '✅' : '❌'} ${discountName}`);
    Logger.log(`   Locations from API: ${JSON.stringify(locs)}`);
    Logger.log(`   → Matches Grove: ${toGrove}`);
    Logger.log(`   Application Method: ${d.applicationMethod}`);
    Logger.log(`   Discount Type: ${d.discountType}`);
    Logger.log(`   Discount Amount: ${d.discountAmount}`);
    Logger.log(`   ---`);
    Logger.log(`   Active: ${isActive}`);
    Logger.log(`   Customer-Facing: ${isCustomerFacing}`);
    Logger.log(`   Meets Cutoff (>=${props.cutoffPercent * 100}%): ${meetsCutoff}`);
    Logger.log(`   Internal: ${isInternal}`);
    Logger.log(`   Products (before inventory filter): ${productCountBefore}`);
    Logger.log(`   Products (after inventory filter): ${productCountAfter}`);
    Logger.log(`   Is Bundle (no product info): ${isBundleNoInfo}`);

    if (!isActive) Logger.log(`   ⛔ BLOCKED: Not active today`);
    if (!isCustomerFacing) Logger.log(`   ⛔ BLOCKED: Not automatic (method: ${d.applicationMethod})`);
    if (!meetsCutoff) Logger.log(`   ⛔ BLOCKED: Below cutoff (${d.discountAmount} < ${props.cutoffPercent})`);
    if (isInternal) Logger.log(`   ⛔ BLOCKED: Contains internal keyword`);
    if (productCountAfter === 0 && !isBundleNoInfo) Logger.log(`   ⛔ BLOCKED: No products with inventory`);
  });

  Logger.log(`\n=== GROVE SUMMARY ===`);
  Logger.log(`Total Grove discounts found: ${groveCount}`);
  Logger.log(`Passed all filters: ${passedFiltersCount}`);
  Logger.log(`=== END GROVE DEBUG ===\n`);
}

function showBundleJSON() {
  const props = getProps();
  const headers = ApiService.makeHeaders(props.apiKey);
  const baseUrl = `${props.apiBase}${props.reportingPath}`;

  const discounts = ApiService.fetchAllDiscounts(`${baseUrl}/discounts`, headers);

  Logger.log('\n=== SEARCHING FOR BUNDLES ===\n');

  // Search for all three problematic bundles
  const bundleNames = ['Bass River', 'Joy Stick', 'Test Kitchen'];

  bundleNames.forEach(searchTerm => {
    const bundle = discounts.find(d =>
      (d.discountName || '').includes(searchTerm)
    );

    if (bundle) {
      Logger.log(`\n=== ${bundle.discountName} ===`);
      Logger.log(JSON.stringify(bundle, null, 2));
    } else {
      Logger.log(`\n⊗ Not found: ${searchTerm}`);
    }
  });

  Logger.log('\n=== END ===\n');
}

function debugLocationFiltering() {
  const props = getProps();
  const headers = ApiService.makeHeaders(props.apiKey);
  const baseUrl = `${props.apiBase}${props.reportingPath}`;

  const discounts = ApiService.fetchAllDiscounts(`${baseUrl}/discounts`, headers);

  Logger.log(`\n=== LOCATION FILTERING DEBUG ===`);
  Logger.log(`Looking for: STASH="${CONFIG.LOCATIONS.STASH}", GROVE="${CONFIG.LOCATIONS.GROVE}"`);
  Logger.log(`\n`);

  discounts.forEach(d => {
    const locations = DiscountFilters.getLocationNames(d);
    const toStash = DiscountFilters.appliesToLocation(d, 'STASH');
    const toGrove = DiscountFilters.appliesToLocation(d, 'GROVE');

    Logger.log(`\n${d.discountName}`);
    Logger.log(`  Locations: ${JSON.stringify(locations)}`);
    Logger.log(`  → Stash match: ${toStash}`);
    Logger.log(`  → Grove match: ${toGrove}`);
  });

  Logger.log(`\n=== END LOCATION DEBUG ===\n`);
}
