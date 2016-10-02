"use strict";

const CacheItem = require('./cache-item.js');

class EmptyCacheItem extends CacheItem {
  constructor(start, end) {
    super(start, end);
    this.empty = true;
  }

  split(offset) {
    if (!this.contains(offset)) {
      throw new Error('invalid split');
    }
    const a = new EmptyCacheItem(this.start, offset);
    const b = new EmptyCacheItem(offset, this.end);
    a.next = b;
    b.prev = a;
    return [a, b];
  }
}

module.exports = EmptyCacheItem;
