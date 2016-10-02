"use strict";

const CacheItem = require('./cache-item.js');

class StringCacheItem extends CacheItem {
  constructor(start, string) {
    super(start, start + string.length);
    this.string = string;
  }

  readBytes(dest, start, end) {
    const chunk = this.string;
    const len = end - start;
    const readHead = start - this.start;
    for (let i = 0; i < len; i++) {
      dest[i] = chunk.charCodeAt(readHead + i);
    }
    this.timestamp = Date.now();
  }
}

module.exports = StringCacheItem;
