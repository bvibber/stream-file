"use strict";

const EmptyCacheItem = require('./empty-cache-item.js');

class EofCacheItem extends EmptyCacheItem {
  constructor(start) {
    super(start, start);
    this.eof = true;
  }

  /**
   * The virtual eof section 'contains' any offset after the end of the file.
   */
  contains(offset) {
    if (offset >= this.start) {
      return true;
    }
  }

  split(offset) {
    return [
      new EmptyCacheItem(this.start, offset),
      new EofCacheItem(offset)
    ];
  }
}

module.exports = EofCacheItem;
