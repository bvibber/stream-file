"use strict"

/**
 * Double-linked list of cache items
 */
class CacheItem {
  constructor(start, end) {
    if (end < start) {
      throw new Error('end point too early');
    }
    this.start = start;
    this.end = end;
    this.prev = null;
    this.next = null;
    this.eof = false;
    this.empty = false;
  }

  /**
   * Length of the slice
   */
  get length() {
    return this.end - this.start;
  }

  /**
   * True if this cache item contains the given byte offset.
   * False if outside.
   */
  contains(offset) {
    return (offset >= this.start) && (offset < this.end);
  }

  /**
   * Copy a slice of bytes from this cache item into the target array.
   * @param {Uint8Array} dest - target byte array to write to
   * @param {number} start - offset into the virtual file to start from
   * @param {number} end - offset into the virtual file to end at (exclusive)
   */
  readBytes(dest, start, end) {
    throw new Error('abstract');
  }

  /**
   * Replace this item in the linked list chain with
   * the given single or pair of nodes, which may include this one.
   */
  replace(a, b=a) {
    const prev = this.prev;
    const next = this.next;

    if (prev && prev.end !== a.start) {
      throw new Error('replace a does not match prev');
    }
    if (next && next.start !== b.end) {
      throw new Error('replace b does not match next');
    }
    if (a !== b && a.end !== b.start) {
      throw new Error('replace a does not match b');
    }

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
   * Split an empty range into two smaller subranges
   */
  split(offset) {
    throw new Error('abstract');
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
        return last;
      }
      last = item;
    }
  }
}

module.exports = CacheItem;
