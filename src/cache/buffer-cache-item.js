"use strict";

const CacheItem = require('./cache-item.js');

class BufferCacheItem extends CacheItem {
  constructor(start, buffer) {
    super(start, start + buffer.byteLength);
    this.buffer = buffer;
  }

  readBytes(dest, start, end) {
    const readHead = start - this.start;
    const sourceBytes = new Uint8Array(this.buffer, readHead, end - start);
    dest.set(sourceBytes);
    this.timestamp = Date.now();
  }
}

module.exports = BufferCacheItem;
