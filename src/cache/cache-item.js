"use strict";

/**
 * Double-linked list cache items
 */
class CacheItem {
  constructor({
    buffer=undefined,
    string=undefined,
    start=0,
    end=start + (buffer ? buffer.byteLength : (string ? string.length : 0)),
    prev=null,
    next=null,
    eof=false,
    empty=!(buffer||string),
    timestamp=Date.now()
  }={}) {
    this.start = start;
    this.end = end;
    this.prev = prev;
    this.next = next;
    this.eof = eof;
    this.empty = empty;
    this.timestamp = timestamp;
    this.buffer = buffer;
    this.string = string;
    Object.defineProperty(this, 'length', {
      get: function() {
        return this.end - this.start;
      }
    });
  }

  /**
   * True if this cache item contains the given byte offset.
   * False if outside.
   */
  contains(offset) {
    return (offset >= this.start) && (offset < this.end || this.eof);
  }

  readBytes(dest, start, end) {
    const readHead = start - this.start;
    const len = end - start;
    if (this.buffer) {
      const sourceBytes = new Uint8Array(this.buffer, readHead, len);
      dest.set(sourceBytes);
    } else if (this.string) {
      const chunk = this.string;
      for (let i = 0; i < len; i++) {
        dest[i] = chunk.charCodeAt(readHead + i);
      }
    } else {
      throw new Error('invalid state');
    }
    this.timestamp = Date.now();
  }

  split(offset) {
    if (!this.empty || !this.contains(offset)) {
      throw new Error('invalid split');
    }
    const a = new CacheItem({
      start: this.start,
      end: offset
    });
    const b = new CacheItem({
      start: offset,
      end: this.eof ? offset : this.end,
      eof: this.eof
    });
    a.next = b;
    b.prev = a;
    return [a, b];
  }

  /**
   * Iterate forwards, returning the first element matching the callback.
   * @param {function} callback - return true for a match on item
   * @returns {CacheItem|null} - matching item or null if none found
   */
  first(callback) {
    for (let item = this; item; item = item.next) {
      if (callback(item)) {
        return item;
      }
    }
    return null;
  }

  /**
   * Iterate forwards, returning the last element matching the callback before
   * reaching one that doesn't match or we find the end.
   * @param {function} callback - return true for a match on item
   * @returns {CacheItem|null} - matching item or null if none found
   */
  last(callback) {
    let last = null;
    for (let item = this; item; item = item.next) {
      if (!callback(item)) {
        break;
      }
      last = item;
    }
    return last;
  }
}

module.exports = CacheItem;
