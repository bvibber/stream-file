"use strict";

const CacheItem = require('./cache-item.js');

class BufferCacheItem extends CacheItem {
  constructor(start, buffer) {
    super(start, start + buffer.byteLength);
    this.buffer = buffer;
  }

  readBytes(dest, start, end) {
    const chunk = this.string;
    const len = end - start;
    const readHead = start - this.start;
    const sourceBytes = new Uint8Array(this.buffer, readHead, len);
    dest.set(sourceBytes);
  }
}

module.exports = BufferCacheItem;
