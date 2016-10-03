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
    if (!this.contains(offset)) {
      throw new Error('invalid split');
    }
    const a = new EmptyCacheItem(this.start, offset);
    const b = new EofCacheItem(offset);
    a.next = b;
    b.prev = a;
    return [a, b];
  }
}

module.exports = EofCacheItem;
