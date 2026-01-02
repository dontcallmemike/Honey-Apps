/**
 * SheetUtils.gs - Spreadsheet Management Utilities
 * Handles all sheet creation, formatting, and writing
 */

const SheetUtils = {
  /**
   * Creates or clears a sheet with headers
   */
  getOrCreateSheet(ss, name, headers) {
    let sh = ss.getSheetByName(name);

    // If sheet doesn't exist, create it
    if (!sh) {
      sh = ss.insertSheet(name);
    } else {
      // Sheet exists - properly reset it by deleting excess rows
      const maxRows = sh.getMaxRows();

      // Clear all content and formatting first
      sh.clear();
      sh.clearFormats();

      // Delete all rows except row 1 (header row) and row 2 (we need at least 2 rows)
      if (maxRows > 2) {
        sh.deleteRows(3, maxRows - 2);
      }
    }

    // Write headers with bold formatting
    const headerRange = sh.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');

    // Add "Updated" column header
    sh.getRange(1, headers.length + 1).setValue('Updated').setFontWeight('bold');

    return sh;
  },

  /**
   * Writes data rows to sheet with formatting
   * Supports row grouping for hierarchical data
   */
  writeSheet(sheet, rows, options = {}) {
    const { qtyCol, timestampOnly = false, enableGrouping = false } = options;

    // Always update timestamp
    const timestampCol = sheet.getLastColumn() || 2;
    sheet.getRange(1, timestampCol).setValue('Updated: ' + new Date());

    // If no data or timestamp-only mode, we're done
    if (!rows || !rows.length || timestampOnly) {
      Logger.log(`ℹ️ ${sheet.getName()}: No data to write (${rows ? rows.length : 0} rows)`);
      return;
    }

    // Validate rows have data
    if (!rows[0] || !rows[0].length) {
      Logger.log(`⚠️ ${sheet.getName()}: Invalid row data structure`);
      return;
    }

    // Write data starting at row 2
    const dataRange = sheet.getRange(2, 1, rows.length, rows[0].length);
    dataRange.setValues(rows);

    // Apply formatting to discount header rows (bold text)
    if (enableGrouping) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const isDiscountHeader = row[0] && row[0] !== '' && !row[0].toString().startsWith('→');

        if (isDiscountHeader) {
          const headerRange = sheet.getRange(i + 2, 1, 1, rows[0].length);
          headerRange.setFontWeight('bold');
          headerRange.setBackground('#f3f3f3'); // Light gray background for headers
        }
      }
    }

    // Format quantity column as number (no decimals)
    if (qtyCol && qtyCol <= rows[0].length) {
      const qtyRange = sheet.getRange(2, qtyCol, rows.length, 1);
      qtyRange.setNumberFormat('0');
    }

    // Apply row grouping if enabled (for master summary tabs)
    if (enableGrouping && CONFIG.ENABLE_ROW_GROUPING) {
      this.applyRowGrouping(sheet, rows);
    } else if (enableGrouping && !CONFIG.ENABLE_ROW_GROUPING) {
      Logger.log(`ℹ️ Row grouping disabled in config for performance`);
    }

    Logger.log(`✓ ${sheet.getName()}: Wrote ${rows.length} rows × ${rows[0].length} columns`);
  },

  /**
   * Applies row grouping to create collapsible discount sections
   * Optimized to avoid timeouts with batch operations
   */
  applyRowGrouping(sheet, rows) {
    try {
      const startTime = new Date().getTime();

      // First, clear all existing row groups quickly
      try {
        const maxRows = sheet.getMaxRows();
        // Try to clear all at once if possible
        if (maxRows > 1) {
          sheet.getRange(2, 1, maxRows - 1, 1).shiftRowGroupDepth(-10); // Remove up to 10 levels
        }
      } catch (e) {
        Logger.log(`Note: Cleared existing groups (${e.message})`);
      }

      // Build array of groups to create
      const groupsToCreate = [];
      let currentRow = 2; // Start after header row
      let groupStartRow = null;
      let groupSize = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Check if this is a discount header row
        const isDiscountHeader = row[0] && row[0] !== '' && !row[0].toString().startsWith('→');

        // Check if this is a product detail row
        const isProductRow = !row[0] && row[6] && row[6].toString().startsWith('→');

        if (isDiscountHeader) {
          // Save previous group if it exists
          if (groupStartRow && groupSize > 0) {
            groupsToCreate.push({ start: groupStartRow, size: groupSize });
          }

          // Start tracking a new group
          groupStartRow = currentRow + 1;
          groupSize = 0;
        } else if (isProductRow) {
          groupSize++;
        }

        currentRow++;
      }

      // Don't forget the last group
      if (groupStartRow && groupSize > 0) {
        groupsToCreate.push({ start: groupStartRow, size: groupSize });
      }

      // Limit the number of groups to prevent timeout
      if (groupsToCreate.length > CONFIG.MAX_GROUPS) {
        Logger.log(`⚠️ Too many groups (${groupsToCreate.length}). Limiting to ${CONFIG.MAX_GROUPS} to prevent timeout.`);
        groupsToCreate.splice(CONFIG.MAX_GROUPS);
      }

      // Create all groups in batch
      Logger.log(`Creating ${groupsToCreate.length} row groups...`);
      for (const group of groupsToCreate) {
        try {
          const range = sheet.getRange(group.start, 1, group.size);
          range.shiftRowGroupDepth(1);
          // Collapse the group
          sheet.getRowGroup(group.start, 1).collapse();
        } catch (e) {
          Logger.log(`⚠️ Could not create group at row ${group.start}: ${e.message}`);
        }
      }

      const elapsed = (new Date().getTime() - startTime) / 1000;
      Logger.log(`✓ Applied ${groupsToCreate.length} row groups in ${elapsed.toFixed(1)}s`);

    } catch (error) {
      Logger.log(`⚠️ Could not apply grouping to ${sheet.getName()}: ${error.message}`);
    }
  },

  /**
   * Formats amount for display
   */
  formatAmount(type, amount) {
    if (amount == null || amount === "") return "";

    const t = (type || "").toLowerCase();
    if (t.includes("percent")) {
      return `${(Number(amount) * 100).toFixed(0)}%`;
    }
    return `$${Number(amount).toFixed(2)}`;
  },

  /**
   * Sanitizes location names for display
   */
  sanitizeLocations(locations) {
    return locations.map(loc => {
      loc = loc.trim();
      // Add any location name cleanup logic here
      return loc;
    });
  },

  /**
   * Determines store scope display text
   */
  getStoreScope(locations) {
    const sanitized = this.sanitizeLocations(locations);
    if (locations.length > 1) return 'Both Stores';
    return sanitized.join(', ') || '—';
  }
};
