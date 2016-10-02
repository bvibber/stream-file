"use strict";

/**
 * Double-linked list cache items
 */
class CacheItem {
  constructor(start, end, buffer) {
    this.start = start;
    this.end = end;
    this.prev = null;
    this.next = null;
    this.eof = false;
    this.empty = false;
  }

  /**
   * True if this cache item contains the given byte offset.
   * False if outside.
   */
  contains(offset) {
    return (offset >= this.start) && (offset < this.end);
  }

  /**
   * Replace this item in the linked list chain with
   * the given single or pair of nodes.
   */
  replace(a, b=a) {
    if (this.start !== a.start) {
      throw new Error('replace a does not match start');
    }
    if (this.end !== b.end && !(this.eof && b.eof)) {
      throw new Error('replace b does not match end');
    }
    if (a !== b && a.end !== b.start) {
      throw new Error('replace a does not match b');
    }

    const prev = this.prev;
    const next = this.next;
    this.prev = null;
    this.next = null;
    if (prev) {
      prev.next = a;
      a.prev = prev;
    }
    if (next) {
      next.prev = b;
      b.next = next;
    }
    if (a !== b) {
      a.next = b;
      b.prev = a;
    }
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
