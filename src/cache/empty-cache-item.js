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
    return [
      new EmptyCacheItem(this.start, offset),
      new EmptyCacheItem(offset, this.end)
    ];
  }
}

module.exports = EmptyCacheItem;
