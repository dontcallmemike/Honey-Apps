/**
 * ApiService.gs - API Communication Layer
 * Handles all external API calls with error handling
 */

const ApiService = {
  /**
   * Creates authorization headers
   */
  makeHeaders(apiKey) {
    return {
      'Authorization': 'Basic ' + Utilities.base64Encode(apiKey + ':'),
      'Accept': 'application/json'
    };
  },

  /**
   * Generic fetch with error handling
   */
  _fetchWithRetry(url, options, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = UrlFetchApp.fetch(url, { ...options, muteHttpExceptions: true });

        if (res.getResponseCode() === 200) {
          return JSON.parse(res.getContentText());
        }

        Logger.log(`❌ API Error (${url}): ${res.getResponseCode()} - ${res.getContentText()}`);

        if (i < retries && res.getResponseCode() >= 500) {
          Utilities.sleep(1000 * (i + 1)); // exponential backoff
          continue;
        }

        return null;
      } catch (e) {
        Logger.log(`❌ Exception calling ${url}: ${e.message}`);
        if (i < retries) {
          Utilities.sleep(1000 * (i + 1));
          continue;
        }
      }
    }
    return null;
  },

  /**
   * Fetches all products and returns as a map
   */
  fetchAllProducts(baseUrl, headers) {
    const url = `${baseUrl}?limit=${CONFIG.API.PRODUCT_LIMIT}`;
    const data = this._fetchWithRetry(url, { method: 'get', headers });

    if (!data || !Array.isArray(data)) return {};

    return data.reduce((map, p) => {
      if (p?.productId) map[p.productId] = p;
      return map;
    }, {});
  },

  /**
   * Fetches inventory and aggregates by product ID
   */
  fetchAllInventory(baseUrl, headers) {
    const url = `${baseUrl}?${CONFIG.API.INVENTORY_PARAMS}`;
    const data = this._fetchWithRetry(url, { method: 'get', headers });

    if (!data || !Array.isArray(data)) return {};

    return data.reduce((qtyMap, it) => {
      const pid = it?.productId;
      if (!pid) return qtyMap;

      const q = Number(it?.quantityAvailable ?? it?.availableQuantity ?? 0);
      qtyMap[pid] = (qtyMap[pid] || 0) + (isFinite(q) ? q : 0);
      return qtyMap;
    }, {});
  },

  /**
   * Fetches all discounts
   */
  fetchAllDiscounts(url, headers) {
    const data = this._fetchWithRetry(url, { method: 'get', headers });
    return Array.isArray(data) ? data : [];
  }
};
