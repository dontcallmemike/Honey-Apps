/**
 * DiscountFilters.gs - Business Logic for Discount Filtering
 * Handles discount validation and product matching
 */

const DiscountFilters = {
  /**
   * Checks if discount is active today
   */
  isActiveToday(discount) {
    const now = new Date();

    if (discount.validFrom && new Date(discount.validFrom) > now) return false;
    if (discount.validUntil && new Date(discount.validUntil) < now) return false;
    if (discount.isDeleted || discount.isActive === false) return false;

    return true;
  },

  /**
   * Checks if discount meets cutoff threshold
   * Returns true if discount should be INCLUDED
   * FIXED: Changed > to >= so 30% is included when cutoff is 30%
   */
  meetsCutoffThreshold(discount, removeCutoff, cutoffPercent) {
    // If cutoff is removed, include everything
    if (removeCutoff) return true;

    const type = (discount.discountType || '').toLowerCase();

    // Non-percent discounts always pass (dollar amounts, etc.)
    if (!type.includes('percent')) return true;

    // For percent discounts, check if discount amount meets or exceeds cutoff
    // FIXED: Using >= instead of > so 30% is included when cutoff is 30%
    const amount = Number(discount.discountAmount);
    return amount >= cutoffPercent;
  },

  /**
   * Checks if discount is customer-facing (available to any random customer)
   * Returns true if a basic customer walking in would automatically get this deal
   */
  isCustomerFacing(discount) {
    // 1. Check application method - must be automatic
    const appMethod = (discount.applicationMethod || '').toLowerCase();
    if (appMethod !== 'automatic') {
      return false; // Manual, Code, or Alpine IQ = not customer-facing
    }

    // 2. Check for internal discount keywords in name
    if (this.isInternalDiscount(discount)) {
      return false;
    }

    // 3. All automatic discounts without internal keywords are customer-facing
    // This includes:
    // - Percent off
    // - Amount off
    // - BOGO deals (using "Price to Amount" for the reward)
    // - Bundle deals
    // - Purchase requirement deals

    return true; // Passes all customer-facing checks
  },

  /**
   * Checks if discount is storewide (applies to all products)
   */
  isStorewide(discount) {
    if (discount.appliesToAllProducts) return true;

    const name = (discount.discountName || '').toLowerCase();
    return name.includes('storewide') ||
           name.includes('all menu') ||
           name.includes('entire menu');
  },

  /**
   * Checks if discount is internal/owner discount (not customer-facing)
   * Filters out employee, owner, vendor, and other internal discounts
   */
  isInternalDiscount(discount) {
    const name = (discount.discountName || '').toLowerCase();

    // Check if discount name contains any internal keywords from config
    if (CONFIG.INTERNAL_DISCOUNT_KEYWORDS.some(keyword => name.includes(keyword))) {
      return true;
    }

    // Check for suspiciously low fixed amounts (like $1 or $5 menu prices)
    const type = (discount.discountType || '').toLowerCase();
    if (type === 'fixed' || type === 'fixedprice') {
      const amount = Number(discount.discountAmount);
      // If fixed price is under threshold, it's likely an internal discount
      if (amount > 0 && amount < CONFIG.INTERNAL_FIXED_PRICE_THRESHOLD) {
        return true;
      }
    }

    return false;
  },

  /**
   * Bass River safety checks
   */
  isBassRiverHighlight(discount) {
    const name = (discount.discountName || '').toLowerCase();
    return name.includes('bass river') && name.includes('highlight');
  },

  isBassRiverBrand(product) {
    return (product.brandName || '').toLowerCase().includes('bass river');
  },

  isPreRollCategory(product) {
    const category = (product.category || '').toLowerCase();
    return category.includes('pre roll') || category.includes('pre-roll');
  },

  /**
   * Applies Bass River safety filter
   */
  applyBassRiverFilter(products, discount) {
    if (!this.isBassRiverHighlight(discount)) return products;

    return products.filter(p =>
      !(this.isBassRiverBrand(p) && this.isPreRollCategory(p))
    );
  },

  /**
   * Matches products for a discount based on its rules
   */
  matchProducts(discount, productsById) {
    // 1) Explicit product list (not exclusion)
    if (discount.products?.ids?.length && !discount.products.isExclusion) {
      return discount.products.ids
        .map(pid => productsById[pid])
        .filter(Boolean);
    }

    // 2) Category/Brand constraints
    const categoryIds = (discount.productCategories?.ids && !discount.productCategories.isExclusion)
      ? discount.productCategories.ids : null;
    const brandIds = (discount.brands?.ids && !discount.brands.isExclusion)
      ? discount.brands.ids : null;

    const allProducts = Object.values(productsById);

    if (categoryIds && brandIds) {
      return allProducts.filter(p =>
        categoryIds.includes(p.categoryId) && brandIds.includes(p.brandId)
      );
    }

    if (categoryIds) {
      return allProducts.filter(p => categoryIds.includes(p.categoryId));
    }

    if (brandIds) {
      return allProducts.filter(p => brandIds.includes(p.brandId));
    }

    // No constraints = all products qualify
    return allProducts;
  },

  /**
   * Checks if product is in an excluded category (like accessories)
   */
  isExcludedCategory(product) {
    const category = (product.category || '').toLowerCase();
    return CONFIG.EXCLUDED_CATEGORIES.some(excluded => category.includes(excluded));
  },

  /**
   * Checks if discount is a bundle deal without product information
   * These are typically "Price To Amount" deals where the API doesn't return
   * the bundle requirements/rewards structure
   */
  isBundleWithoutProductInfo(discount) {
    const isPriceToAmount = (discount.discountType || '').toLowerCase().includes('price to amount');
    const hasNoProductInfo = !discount.products &&
                             !discount.productCategories &&
                             !discount.brands &&
                             !discount.vendors &&
                             !discount.strains &&
                             !discount.tags;

    return isPriceToAmount && hasNoProductInfo;
  },

  /**
   * Filters products by inventory availability and excluded categories
   */
  filterByInventory(products, inventoryById, minQty = 1) {
    return products.filter(p => {
      // Check inventory
      if ((inventoryById[p.productId] || 0) < minQty) return false;

      // Check if category is excluded
      if (this.isExcludedCategory(p)) return false;

      return true;
    });
  },

  /**
   * Gets location names from discount, normalized
   */
  getLocationNames(discount) {
    return (discount.appliesToLocations || [])
      .map(l => l.locationName || '')
      .filter(Boolean);
  },

  /**
   * Checks if discount applies to a specific location
   * IMPROVED: Also checks discount name for location prefixes like "GROVE:" or "STASH:"
   */
  appliesToLocation(discount, locationKey) {
    const locs = this.getLocationNames(discount);
    const searchTerm = CONFIG.LOCATIONS[locationKey];

    // First check the appliesToLocations array
    if (locs.some(l => l.toLowerCase().includes(searchTerm))) {
      return true;
    }

    // Also check discount name for location prefix (e.g., "GROVE:" or "STASH:")
    const discountName = (discount.discountName || '').toLowerCase();
    if (locationKey === 'GROVE' && discountName.startsWith('grove:')) {
      return true;
    }
    if (locationKey === 'STASH' && (discountName.startsWith('stash:') || discountName.startsWith('honey:'))) {
      return true;
    }

    // If no location specified in API and no prefix, assume it applies to all
    if (locs.length === 0) {
      return true;
    }

    return false;
  }
};
