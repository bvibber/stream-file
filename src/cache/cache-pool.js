"use strict";

const CacheItem = require('./cache-item.js');

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
 * - tail item is always empty/eof
 * - non-empty items are never 0 bytes
 * - adjacent list items are always continguous
 * - empty items are never adjacent to each other
 */
class CachePool {
  constructor({
    cacheSize=0
  }={}) {
    const eof = new CacheItem({eof: true});
    this.head = eof;
    this.tail = eof;
    this.readOffset = 0;
    this.readCursor = eof;
    this.writeOffset = 0;
    this.writeCursor = eof;
    this.cacheSize = cacheSize;
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
    let last = cursor.last((item) => !item.empty && item.start <= offset + max);
    if (last) {
      return Math.min(max, last.end - offset);
    }
    return 0;
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
    }
    let last = cursor.last((item) => item.empty && item.start <= offset + max);
    if (last) {
      return Math.min(max, last.end - offset);
    }
    return 0;
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
   * @param {Uint8Array} dest - destination array to read to
   * @returns {number} - count of bytes actually read
   */
  readBytes(dest) {
    const nbytes = dest.byteLength;
    const len = this.bytesReadable(nbytes);
    const start = this.readOffset;
    const end = start + len;

    let readHead = start;
    let writeHead = 0;
    for (let item = this.readCursor; item; item = item.next) {
      if (item.empty) {
        break;
      }
      if (item.start >= end) {
        break;
      }
      const readTail = Math.min(end, item.end);
      const chunk = dest.subarray(readHead - start, readTail - start);
      item.readBytes(chunk, readHead, readTail);
      readHead = readTail;
    }
    this.readOffset = readHead;
    this.readCursor = this.readCursor.first((item) => item.contains(readHead));

    return len;
  }

  /**
   * Write a data buffer at the write head and advance the write head.
   * The data must fit in the available empty space in the buffer cache.
   * @param {ArrayBuffer|String} buffer
   */
  write(buffer) {
    let item = this.bufferItem(buffer);
    let cursor = this.writeCursor;

    if (!cursor.empty) {
      throw new Error('write cursor not empty');
    }
    if (!cursor.contains(item.end) && cursor.end !== item.end) {
      throw new Error('write cursor too small');
    }

    if (cursor.start < item.start) {
      this.split(cursor, item.start);
      cursor = this.writeCursor;
    }

    if (item.end < cursor.end || cursor.eof) {
      this.split(cursor, item.end);
      cursor = this.writeCursor;
    }

    this.splice(cursor, cursor, item, item);
    this.writeOffset = item.end;
    this.writeCursor = item.next;

    this.gc();
  }

  bufferItem(buffer) {
    if (buffer instanceof ArrayBuffer) {
      return new CacheItem({
        start: this.writeOffset,
        end: this.writeOffset + buffer.byteLength,
        buffer: buffer
      });
    } else if (typeof buffer === 'string') {
      return new CacheItem({
        start: this.writeOffset,
        end: this.writeOffset + buffer.length,
        string: buffer
      });
    } else {
      throw new Error('invalid input to write');
    }
  }

  split(oldItem, offset) {
    const items = oldItem.split(offset);
    this.splice(oldItem, oldItem, items[0], items[1]);
  }

  /**
   * Return an array of arrays of consolidated cached ranges
   */
  ranges() {
    let ranges = [];

    for (let item = this.head; item; item = item.next) {
      if (item.empty) {
        continue;
      }
      const start = item;
      item = item.last((i) => !i.empty);
      ranges.push([start.start, item.end]);
    }

    return ranges;
  }

  gc() {
    // Simple gc: look at anything not between read head and write head,
    // and discard the oldest items until we have room
    let cachedBytes = 0;
    let candidates = [];
    for (let item = this.head; item; item = item.next) {
      if (!item.empty) {
        cachedBytes += item.length;
        if (item.end < this.readOffset || item.start > this.readOffset + this.chunkSize) {
          // Not in the 'hot' readahead range
          candidates.push(item);
        }
      }
    }
    if (cachedBytes > this.cacheSize) {
      candidates.sort((a, b) => {
        return a.timestamp - b.timestamp;
      });

      for (let i = 0; i < candidates.length; i++) {
        let item = candidates[i];
        if (cachedBytes <= this.cacheSize) {
          break;
        }
        this.remove(item);
        cachedBytes -= item.length;
      }
    }
  }

  remove(item) {
    const replacement = new CacheItem({
      start: item.start,
      end: item.end
    });
    this.splice(item, item, replacement, replacement);
    item = replacement;

    // Consolidate adjacent ranges
    if (item.prev && item.prev.empty) {
      item = this.consolidate(item.prev);
    }
    if (item.next && item.next.empty && !item.next.eof) {
      item = this.consolidate(item);
    }
    if (item.start === 0) {
      this.head = item;
    }
  }

  consolidate(first) {
    const last = first.last((item) => item.empty && !item.eof);
    const replacement = new CacheItem({
      start: first.start,
      end: last.end
    });
    this.splice(first, last, replacement, replacement);
    return replacement;
  }

  splice(oldHead, oldTail, newHead, newTail) {
    if (oldHead.start !== newHead.start) {
      throw new Error('invalid splice head');
    }
    if (oldTail.end !== newTail.end) {
      if (oldTail.eof && newTail.eof) {
        // only eof is expandable
      } else {
        throw new Error('invalid splice tail');
      }
    }
    let prev = oldHead.prev;
    let next = oldTail.next;

    oldHead.prev = null;
    oldTail.next = null;

    if (prev) {
      prev.next = newHead;
      newHead.prev = prev;
    }
    if (next) {
      next.prev = newTail;
      newTail.next = next;
    }

    if (oldHead === this.head) {
      this.head = newHead;
    }
    if (oldTail === this.tail) {
      this.tail = newTail;
    }
    this.readCursor = this.head.first((item) => item.contains(this.readOffset));
    this.writeCursor = this.head.first((item) => item.contains(this.writeOffset));
  }

}

module.exports = CachePool;
