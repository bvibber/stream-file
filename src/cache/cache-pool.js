"use strict";

const EofCacheItem = require('./eof-cache-item.js');
const EmptyCacheItem = require('./empty-cache-item.js');
const BufferCacheItem = require('./buffer-cache-item.js');
const StringCacheItem = require('./string-cache-item.js');

/**
 * Seekable, readable, writable buffer cache to represent a file.
 * @todo add max cache size and LRU cache expiration
 *
 * Internally, will always contain entries from 0 to some given out point.
 * Each item may either contain data, or be empty.
 * Empty ranges cannot be copied out via read(), non-empty ranges can.
 * Empty ranges can be filled up with write(), non-empty ranges cannot.
 *
 * Internal invariants:
 * - head and tail are always present, may be same for empty
 * - tail item is always an EofCacheItem
 * - non-empty items are never 0 bytes
 * - adjacent list items are always continguous
 * - empty items are never adjacent to each other
 */
class CachePool {
  constructor() {
    const eof = new EofCacheItem(0);
    this.head = eof;
    this.tail = eof;
    this.readOffset = 0;
    this.readCursor = eof;
    this.writeOffset = 0;
    this.writeCursor = eof;
  }

  /**
   * Is the read cursor at the end of the file?
   */
  get eof() {
    return this.readCursor.eof;
  }

  /**
   * Count how many bytes are available from the given offset.
   * @param {number} max - optional maximum to read
   * @returns {number} 0 or more
   */
  bytesReadable(max=Infinity) {
    const offset = this.readOffset;
    const cursor = this.readCursor;
    if (cursor.empty) {
      return 0;
    } else {
      let last = cursor.last((item) => !item.empty && item.start <= offset + max);
      return Math.min(max, last.end - offset);
    }
  }

  /**
   * Count how many bytes are available to write.
   * @param {number} max - optional maximum to write
   * @returns {number} 0 or more, or +Infinity
   */
  bytesWritable(max=Infinity) {
    const offset = this.writeOffset;
    const cursor = this.writeCursor;
    if (cursor.eof) {
      return max;
    } else if (cursor.empty) {
      let last = cursor.last((item) => item.empty && item.start <= offset + max);
      return Math.min(max, last.end - offset);
    } else {
      return 0;
    }
  }

  /**
   * Move the read head to a given offset. The read head can move beyond the
   * currently known end of the file, but cannot move before 0.
   * @param {number} offset - bytes from beginning of virtual file to read from
   */
  seekRead(offset) {
    let target = this.head.first((item) => item.contains(offset));
    if (!target) {
      throw new Error('read seek out of range');
    }
    this.readOffset = offset;
    this.readCursor = target;
  }

  /**
   * Move the write head to a given offset. The write head can move beyond the
   * currently known end of the file, but cannot move before 0.
   * @param {number} offset - bytes from beginning of virtual file to write to
   */
  seekWrite(offset) {
    let target = this.head.first((item) => item.contains(offset));
    if (!target) {
      throw new Error('write seek out of range');
    }
    this.writeOffset = offset;
    this.writeCursor = target;
  }

  /**
   * Read up to the requested number of bytes, or however much is available
   * in the buffer until the next empty segment, and advance the read head.
   *
   * Returns immediately.
   *
   * @param {number} nbytes - max number of bytes to read
   * @returns {ArrayBuffer} - between 0 and nbytes of data, inclusive
   */
  read(nbytes) {
    const len = this.bytesReadable(nbytes);
    const dest = new Uint8Array(len);
    const start = this.readOffset;
    const end = start + len;

    let readHead = start;
    let writeHead = 0;
    for (let item = this.readCursor; item; item = item.next) {
      if (item.empty) {
        break;
      }
      if (item.start >= end) {
        this.readOffset = readHead;
        this.readCursor = item;
        break;
      }
      let readTail = Math.min(end, item.end);
      let chunkLen = readTail - readHead;
      let writeTail = writeHead + chunkLen;
      let chunk = dest.subarray(writeHead, writeTail);
      item.readBytes(chunk, readHead, readTail);
      readHead = readTail;
      writeHead = writeTail;
    }
    return dest.buffer;
  }

  /**
   * Write a data buffer at the write head and advance the write head.
   * The data must fit in the available empty space in the buffer cache.
   * @param {ArrayBuffer|String} buffer
   */
  write(buffer) {
    let item = this.bufferItem(buffer);
    let cursor = this.writeCursor;

    if (!cursor.empty || !cursor.contains(item.end)) {
      throw new Error('no space to write');
    }

    if (cursor.start < item.start) {
      this.split(cursor, item.start);
      cursor = this.writeCursor;
    }

    if (cursor.end <= item.end || cursor.eof) {
      this.split(cursor, item.end);
      cursor = this.writeCursor;
    }

    this.replace(cursor, item);
    this.writeOffset = item.end;
    this.writeCursor = item.next;
  }

  bufferItem(buffer) {
    if (buffer instanceof ArrayBuffer) {
      return new BufferCacheItem(this.writeOffset, buffer);
    } else if (typeof buffer === 'string') {
      return new StringCacheItem(this.writeOffset, buffer);
    } else {
      throw new Error('invalid input to write');
    }
  }

  split(oldItem, offset) {
    const items = oldItem.split(offset);
    this.replace(oldItem, items[0], items[1]);
  }

  replace(oldItem, a, b=a) {
    oldItem.replace(a, b);
    if (this.head === oldItem) {
      this.head = a;
    }
    if (this.tail === oldItem) {
      this.tail = b;
    }
    if (oldItem.contains(this.readOffset)) {
      this.readCursor = a.contains(this.readOffset) ? a : b;
    }
    if (oldItem.contains(this.writeOffset)) {
      this.writeCursor = a.contains(this.writeOffset) ? a : b;
    }
  }

  /**
   * Return an array of arrays of consolidated cached ranges
   */
  ranges() {
    let ranges = [];
    const notEmpty = (item) => !item.empty;

    // Skip any empty ranges
    let head = this.head.first(notEmpty);
    while (head) {
      // Consolidate any non-empty ranges
      let tail = head.last(notEmpty);
      ranges.push([head.start, tail.start]);
      head = tail.first(notEmpty);
    }

    return ranges;
  }
}

module.exports = CachePool;
