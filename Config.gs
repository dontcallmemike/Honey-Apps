/**
 * Config.gs - Configuration and Constants
 * Centralized configuration management
 */

const CONFIG = {
  // FIXED: Changed to downtime window (script will NOT run during these hours)
  DOWNTIME_HOURS: {
    START: 1,   // 1 AM
    END: 5      // 5 AM
  },

  DEFAULTS: {
    CUTOFF_PERCENT: 0.25,
    REMOVE_CUTOFF: false
  },

  API: {
    PRODUCT_LIMIT: 500,
    INVENTORY_PARAMS: 'includeAllocated=false&includeRoomQuantities=false'
  },

  // Performance settings
  ENABLE_ROW_GROUPING: true, // Set to false if script times out
  MAX_GROUPS: 50, // Maximum number of collapsible groups to prevent timeout

  LOCATIONS: {
    STASH: 'metuchen',
    GROVE: 'clementon'
  },

  // Internal discount filters - customize these keywords for your business
  INTERNAL_DISCOUNT_KEYWORDS: [
    'owner',
    'employee',
    'staff',
    'vendor',
    'comp',
    'complimentary',
    'internal',
    'test',
    'sample',
    'manager',
    'admin',
    // Loyalty/membership program keywords
    'mda',           // MDA members
    'townstash',     // Town-specific loyalty
    'stashlocal',    // Local loyalty
    'eventstash',    // Event loyalty
    'campusstash',   // Campus loyalty
    'middlestash',   // Middlesex loyalty
    'stashbuddy',    // Buddy program
    'first time customer', // New customer only
    'senior discount',     // Senior only
    'first responder',     // First responder only
    'student discount',    // Student only
    'veteran',             // Veteran only
    'birthday'             // Birthday discount (requires verification)
  ],

  // Discount names to completely exclude from Daily Deals (but keep in Promotions)
  // Note: Bundles without product info are now handled automatically
  DAILY_DEALS_EXCLUSIONS: [
    'stash: vip'  // VIP discount - keep excluded
  ],

  // Product categories to exclude from Daily Deals
  EXCLUDED_CATEGORIES: [
    'accessories',
    'accessory',
    'merch',
    'merchandise',
    'apparel',
    'clothing',
    'gear'
  ],

  // Fixed price threshold - discounts below this amount are considered internal
  INTERNAL_FIXED_PRICE_THRESHOLD: 10,

  SHEET_NAMES: {
    SPECIALS: 'Specials',
    PROMOTION_PRODUCTS: 'Promotion Products',
    STASH_PROMOTIONS: 'Honeystash Promotions',
    GROVE_PROMOTIONS: 'HoneyGrove Promotions',
    STASH_DAILY: 'Honeystash Daily Deals',
    GROVE_DAILY: 'HoneyGrove Daily Deals'
  },

  HEADERS: {
    SPECIALS: ['Discount Name', 'Amount', 'Type', 'Source', 'Start Date', 'End Date', 'Store/Locations'],

    PROMOTION_MASTER: [
      'Discount Name', 'Amount', 'Type', 'Ends', 'Stores', 'Products',
      '→ Product', 'Brand', 'Category', 'Available Qty', 'Low Stock'
    ],

    PROMOTION_DETAIL: [
      'Location', 'Discount Name', 'Product', 'Brand', 'Category',
      'Available Qty', 'Amount', 'Type', 'Ends'
    ],

    DAILY_DEALS: [
      'Product', 'Brand', 'Category', 'Available Qty', 'Deal',
      'Type', 'Ends', 'Location'
    ]
  }
};

/**
 * Gets script properties with validation
 */
function getProps() {
  const p = PropertiesService.getScriptProperties();
  const apiKey = p.getProperty('DUTCHIE_API_KEY');
  const apiBase = p.getProperty('DUTCHIE_API_BASE');
  const path = p.getProperty('DUTCHIE_REPORTING_PATH') || '/reporting';

  if (!apiKey || !apiBase) {
    throw new Error('❌ Missing Script Properties: DUTCHIE_API_KEY and/or DUTCHIE_API_BASE.');
  }

  return {
    apiKey,
    apiBase,
    reportingPath: path,
    removeCutoff: p.getProperty('REMOVE_CUTOFF') === 'true',
    cutoffPercent: parseFloat(p.getProperty('CUTOFF_PERCENT') || CONFIG.DEFAULTS.CUTOFF_PERCENT)
  };
}

/**
 * Updates a specific property
 */
function updateProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}
