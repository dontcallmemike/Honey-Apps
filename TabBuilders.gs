/**
 * TabBuilders.gs - Individual Tab Building Logic
 * Each function builds a specific spreadsheet tab
 */

const TabBuilders = {
  /**
   * Builds the Specials summary tab
   */
  buildSpecials(ss, discounts) {
    const sheet = SheetUtils.getOrCreateSheet(ss, CONFIG.SHEET_NAMES.SPECIALS, CONFIG.HEADERS.SPECIALS);

    const rows = discounts.map(d => [
      d.discountName || "",
      SheetUtils.formatAmount(d.discountType, d.discountAmount),
      d.discountType || "",
      "POS",
      d.validFrom ? new Date(d.validFrom) : "",
      d.validUntil ? new Date(d.validUntil) : "",
      DiscountFilters.getLocationNames(d).join(', ') || '—'
    ]);

    SheetUtils.writeSheet(sheet, rows);
    return rows.length;
  },

  /**
   * Builds promotion product tabs (master + store-specific)
   * Shows ALL discounts (not just customer-facing) with product breakdowns
   */
  buildPromotionProducts(ss, discounts, productsById, inventoryById, props) {
    const master = SheetUtils.getOrCreateSheet(ss, CONFIG.SHEET_NAMES.PROMOTION_PRODUCTS, CONFIG.HEADERS.PROMOTION_MASTER);
    const stash = SheetUtils.getOrCreateSheet(ss, CONFIG.SHEET_NAMES.STASH_PROMOTIONS, CONFIG.HEADERS.PROMOTION_DETAIL);
    const grove = SheetUtils.getOrCreateSheet(ss, CONFIG.SHEET_NAMES.GROVE_PROMOTIONS, CONFIG.HEADERS.PROMOTION_DETAIL);

    const masterRows = [];
    const stashRows = [];
    const groveRows = [];

    Logger.log(`📊 Building Promotion Products (ALL discounts)`);

    for (const discount of discounts) {
      // Only filter: Must be active today
      if (!DiscountFilters.isActiveToday(discount)) continue;

      // Match and filter products
      let products = DiscountFilters.matchProducts(discount, productsById);

      // Check if this is a bundle without product info
      const isBundleWithoutInfo = DiscountFilters.isBundleWithoutProductInfo(discount);

      if (!products.length && !isBundleWithoutInfo) continue;

      // For bundles without product info, show summary only (no product breakdown)
      if (isBundleWithoutInfo) {
        const locations = DiscountFilters.getLocationNames(discount);
        const amountText = SheetUtils.formatAmount(discount.discountType, discount.discountAmount);
        const storeScope = SheetUtils.getStoreScope(locations);

        masterRows.push([
          discount.discountName || '',
          amountText,
          discount.discountType || '',
          discount.validUntil ? new Date(discount.validUntil) : '',
          storeScope,
          'Bundle deal',
          '', '', '', '', ''
        ]);

        Logger.log(`✓ Bundle (no product details): ${discount.discountName}`);
        continue;
      }

      products = DiscountFilters.filterByInventory(products, inventoryById);
      products = DiscountFilters.applyBassRiverFilter(products, discount);

      const locations = DiscountFilters.getLocationNames(discount);
      const amountText = SheetUtils.formatAmount(discount.discountType, discount.discountAmount);
      const storeScope = SheetUtils.getStoreScope(locations);

      // Add summary row to master
      masterRows.push([
        discount.discountName || '',
        amountText,
        discount.discountType || '',
        discount.validUntil ? new Date(discount.validUntil) : '',
        storeScope,
        products.length + " products",
        '', '', '', '', ''
      ]);

      // Add product detail rows
      products.forEach(product => {
        const qty = inventoryById[product.productId] || 0;

        // Master detail row
        masterRows.push([
          '', '', '', '', '', '',
          "→ " + (product.productName || ''),
          product.brandName || '',
          product.category || '',
          qty,
          qty < 3 ? '⚠️' : ''
        ]);

        // Store-specific detail rows
        const detailRow = [
          SheetUtils.sanitizeLocations(locations).join(', ') || '—',
          discount.discountName || "",
          product.productName || "",
          product.brandName || "",
          product.category || "",
          qty,
          amountText,
          discount.discountType || "",
          discount.validUntil ? new Date(discount.validUntil) : ""
        ];

        if (DiscountFilters.appliesToLocation(discount, 'STASH')) {
          stashRows.push([...detailRow]);
        }
        if (DiscountFilters.appliesToLocation(discount, 'GROVE')) {
          groveRows.push([...detailRow]);
        }
      });
    }

    SheetUtils.writeSheet(master, masterRows, { qtyCol: 10, enableGrouping: true });
    SheetUtils.writeSheet(stash, stashRows, { qtyCol: 6 });
    SheetUtils.writeSheet(grove, groveRows, { qtyCol: 6 });

    Logger.log(`✅ Promotion Products built: Master=${masterRows.length} rows, Stash=${stashRows.length} rows, Grove=${groveRows.length} rows`);

    return { master: masterRows.length, stash: stashRows.length, grove: groveRows.length };
  },

  /**
   * Builds customer-facing daily deals tabs
   * Groups store-wide/brand-wide deals, shows individual products for specific items
   * Applies customer-facing filter and cutoff threshold
   */
  buildDailyDeals(ss, discounts, productsById, inventoryById, props) {
    const stashSheet = SheetUtils.getOrCreateSheet(ss, CONFIG.SHEET_NAMES.STASH_DAILY, CONFIG.HEADERS.DAILY_DEALS);
    const groveSheet = SheetUtils.getOrCreateSheet(ss, CONFIG.SHEET_NAMES.GROVE_DAILY, CONFIG.HEADERS.DAILY_DEALS);

    const stashRows = [];
    const groveRows = [];

    Logger.log(`📊 Building Daily Deals (customer-facing only, cutoff=${props.cutoffPercent})`);

    for (const discount of discounts) {
      // Filter: Must be active today
      if (!DiscountFilters.isActiveToday(discount)) continue;

      // Filter: Must be customer-facing
      if (!DiscountFilters.isCustomerFacing(discount)) {
        Logger.log(`⊗ Not customer-facing: ${discount.discountName}`);
        continue;
      }

      // Filter: Check Daily Deals exclusions
      const discountNameLower = (discount.discountName || '').toLowerCase();
      if (CONFIG.DAILY_DEALS_EXCLUSIONS.some(excluded => discountNameLower.includes(excluded))) {
        Logger.log(`⊗ Daily Deals exclusion: ${discount.discountName}`);
        continue;
      }

      // Filter: Apply cutoff threshold
      if (!DiscountFilters.meetsCutoffThreshold(discount, props.removeCutoff, props.cutoffPercent)) {
        Logger.log(`⊗ Filtered by cutoff: ${discount.discountName} (${discount.discountAmount})`);
        continue;
      }

      // Match products and declare variables EARLY
      let products = DiscountFilters.matchProducts(discount, productsById);
      const amountText = SheetUtils.formatAmount(discount.discountType, discount.discountAmount);
      const ends = discount.validUntil ? new Date(discount.validUntil) : '';
      const toStash = DiscountFilters.appliesToLocation(discount, 'STASH');
      const toGrove = DiscountFilters.appliesToLocation(discount, 'GROVE');

      if (!toStash && !toGrove) {
        Logger.log(`⊗ No location match: ${discount.discountName}`);
        continue;
      }

      // Check if bundle without product info
      const isBundleWithoutInfo = DiscountFilters.isBundleWithoutProductInfo(discount);

      if (!products.length && !isBundleWithoutInfo) {
        Logger.log(`⊗ No eligible products: ${discount.discountName}`);
        continue;
      }

      // Handle bundles without product info
      if (isBundleWithoutInfo) {
        const bundleRow = [
          discount.discountName || '', '', '', '',
          amountText, discount.discountType || '', ends, ''
        ];

        if (toStash) {
          const row = [...bundleRow];
          row[7] = 'HoneyStash - Metuchen';
          stashRows.push(row);
        }
        if (toGrove) {
          const row = [...bundleRow];
          row[7] = 'HoneyGrove - Clementon';
          groveRows.push(row);
        }

        Logger.log(`✓ Bundle (text-only): ${discount.discountName}`);
        continue;
      }

      // Filter products
      products = DiscountFilters.filterByInventory(products, inventoryById);
      products = DiscountFilters.applyBassRiverFilter(products, discount);

      if (!products.length) {
        Logger.log(`⊗ No eligible products after filters: ${discount.discountName}`);
        continue;
      }

      // Grouping logic
      const isStorewideOrBrandwide = discount.appliesToAllProducts ||
                                      (discount.brands?.ids?.length && !discount.products?.ids?.length) ||
                                      (discount.productCategories?.ids?.length && !discount.products?.ids?.length);
      const shouldGroup = isStorewideOrBrandwide || products.length > 3;

      if (shouldGroup) {
        const groupedRow = [
          `${discount.discountName || ''} (${products.length} products)`,
          '', '', '', amountText, discount.discountType || '', ends, ''
        ];

        if (toStash) {
          const row = [...groupedRow];
          row[7] = 'HoneyStash - Metuchen';
          stashRows.push(row);
        }
        if (toGrove) {
          const row = [...groupedRow];
          row[7] = 'HoneyGrove - Clementon';
          groveRows.push(row);
        }

        Logger.log(`✓ Grouped: ${discount.discountName} (${products.length} products)`);
      } else {
        products.forEach(product => {
          const qty = inventoryById[product.productId] || 0;
          const baseRow = [
            product.productName || '', product.brandName || '', product.category || '',
            qty, amountText, discount.discountType || '', ends, ''
          ];

          if (toStash) {
            const row = [...baseRow];
            row[7] = 'HoneyStash - Metuchen';
            stashRows.push(row);
          }
          if (toGrove) {
            const row = [...baseRow];
            row[7] = 'HoneyGrove - Clementon';
            groveRows.push(row);
          }
        });

        Logger.log(`✓ Individual products: ${discount.discountName} (${products.length} products)`);
      }
    }

    SheetUtils.writeSheet(stashSheet, stashRows, { qtyCol: 4 });
    SheetUtils.writeSheet(groveSheet, groveRows, { qtyCol: 4 });

    Logger.log(`✅ Daily Deals built: Stash=${stashRows.length} rows, Grove=${groveRows.length} rows`);

    return { stash: stashRows.length, grove: groveRows.length };
  }
};
