"use strict";

const assert = require('assert');

const CachePool = require('../lib/cache/cache-pool.js');
const CacheItem = require('../lib/cache/cache-item.js');
const EofCacheItem = require('../lib/cache/eof-cache-item.js');
const EmptyCacheItem = require('../lib/cache/empty-cache-item.js');
const BufferCacheItem = require('../lib/cache/buffer-cache-item.js');
const StringCacheItem = require('../lib/cache/string-cache-item.js');

function byteBuffer(length) {
  var arr = new Uint8Array(length);
  for (var i = 0; i < length; i++) {
    arr[i] = i % 256;
  }
  return arr.buffer;
}

function stringBuffer(length) {
  var str = '';
  for (var i = 0; i < length; i++) {
    str += String.fromCharCode(i % 256);
  }
  return str;
}

function extractBytes(segment, length) {
  var bytes = new Uint8Array(length);
  segment.writeBytes(bytes, 0, length)
  return bytes;
}

const segmentDataSet = [
  [0, 0, 0, [[0, false], [100, false]]],
  [0, 100, 100, [[0, true], [75, true], [100, false], [200, false]]],
  [100, 200, 100, [[0, false], [75, false], [100, true], [200, false]]]
];

describe('EmptyCacheItem', function() {
  it('should return expected start, end', function() {
    for (let [start, end, length, containsData] of segmentDataSet) {
      const item = new EmptyCacheItem(start, end);
      assert.equal(item.start, start);
      assert.equal(item.end, end);
      for (let [offset, expected] of containsData) {
        assert.equal(item.contains(offset), expected);
      }
    }
  });
  describe('#head', function() {
    it('head, tail should start null', function() {
      const first = new EmptyCacheItem(100, 200);
      assert.strictEqual(first.prev, null);
      assert.strictEqual(first.next, null);
    });
  });
});

describe('EofCacheItem', function() {
  describe('#split()', function() {
    it('should work', function() {
      const item = new EofCacheItem(0);
      const [slice0to100, slice100to200] = item.split(100);
      assert.ok(slice0to100, 'slice 0-100 should exist');
      assert.ok(slice0to100.empty, 'slice 0-100 should be empty');
      assert.ok(!slice0to100.eof, 'slice 0-100 should not be eof');
      assert.equal(slice0to100.start, 0, 'slice 0-100 should start at 0');
      assert.equal(slice0to100.end, 100, 'slice 0-100 should end at 100');
    });
  });
});

function makeChunks() {
  return [
    new BufferCacheItem(100, byteBuffer(100)),
    new BufferCacheItem(200, byteBuffer(100)),
    new BufferCacheItem(300, byteBuffer(100)),
    new BufferCacheItem(400, byteBuffer(100))
  ];
}

describe('BufferCacheItem', function() {
  it('should return expected size, length', function() {
    for (let [start, end, length, containsData] of segmentDataSet) {
      const buffer = byteBuffer(length);
      const item = new BufferCacheItem(start, buffer);
      assert.equal(item.start, start);
      assert.equal(item.end, end);
      for (let [offset, expected] of containsData) {
        assert.equal(item.contains(offset), expected);
      }
    }
  });
  describe('readBytes', function() {
    it('should return the expected bytes', function() {
      const len = 16;
      const buffer = byteBuffer(len);
      const sourceBytes = new Uint8Array(buffer);
      const offsets = [0, 1, 13, 16, 637483];

      for (let offset of offsets) {
        const item = new BufferCacheItem(offset, buffer);
        for (let start = 0; start < len; start++) {
          for (let end = start; end < len; end++) {
            const sublen = end - start;
            const dest = new Uint8Array(sublen);
            item.readBytes(dest, start + offset, end + offset);
            assert.deepEqual(dest,
              sourceBytes.slice(start, end),
              "offset " + offset + "; start " + start + "; end " + end);
          }
        }
      }
    });
  });
});

describe('StringCacheItem', function() {
  it('should return expected size, length', function() {
    for (let [start, end, length, containsData] of segmentDataSet) {
      const buffer = stringBuffer(length);
      const item = new StringCacheItem(start, buffer);
      assert.equal(item.start, start);
      assert.equal(item.end, end);
      for (let [offset, expected] of containsData) {
        assert.equal(item.contains(offset), expected);
      }
    }
  });
  describe('readBytes', function() {
    it('should return the expected bytes', function() {
      const len = 16;
      const buffer = byteBuffer(len);
      const sourceBytes = new Uint8Array(buffer);
      const string = stringBuffer(len);
      const offsets = [0, 1, 13, 16, 637483];

      for (let offset of offsets) {
        const item = new StringCacheItem(offset, string);
        for (let start = 0; start < len; start++) {
          for (let end = start; end < len; end++) {
            const sublen = end - start;
            const dest = new Uint8Array(sublen);
            item.readBytes(dest, start + offset, end + offset);
            assert.deepEqual(dest,
              sourceBytes.slice(start, end),
              "offset " + offset + "; start " + start + "; end " + end);
          }
        }
      }
    });
  });
});

describe('CachePool', function() {

  function checkInvariants(pool) {
    assert.ok(!!pool.head, 'head is present');
    assert.ok(!!pool.tail, 'tail is present');
    assert.equal(pool.head.start, 0, 'start is always 0');
    assert.ok(pool.tail.eof, 'tail is eof');

    assert.ok(!!pool.readCursor, 'readCursor is present');
    assert.ok(pool.readCursor.contains(pool.readOffset), 'readCursor fits offset');
    assert.ok(!!pool.writeCursor, 'writeCursor is present');
    assert.ok(pool.writeCursor.contains(pool.writeOffset), 'writeCursor fits offset');

    let zeroLengthAreEmpty = true;
    for (let item in pool.head) {
      if ((item.end - item.start) == 0 && !item.empty) {
        zeroLengthAreEmpty = false;
      }
    }
    assert.ok(zeroLengthAreEmpty, 'zero length should all be empty');

    let adjacent = true;
    for (let item in pool.head) {
      if (item.prev && item.prev.end !== item.start) {
        adjacent = false;
      }
      if (item.next && item.next.start !== item.end) {
        adjacent = false;
      }
    }
    assert.ok(adjacent, 'all should be adjacent');

    let adjacentNotEmpty = true;
    for (let item in pool.head) {
      if (item.prev && item.prev.empty && item.empty) {
        adjacentNotEmpty = false;
      }
      if (item.next && item.next.empty && item.empty) {
        adjacentNotEmpty = false;
      }
    }
    assert.ok(adjacent, 'adjacent pairs should never both be empty');
  }

  describe('setup', function() {
    it('should start empty', function() {
      const pool = new CachePool();
      checkInvariants(pool);

      assert.equal(pool.head.start, 0, 'start is 0');
      assert.equal(pool.tail.end, 0, 'end is 0');
      assert.equal(pool.bytesReadable(), 0, 'bytesReadable starts 0');
      assert.equal(pool.bytesReadable(1024), 0, 'bytesReadable(1024) starts 0');
    });
  });

  describe('#write()', function() {
    it('should update sensibly on one item', function() {
      const pool = new CachePool();
      pool.write(byteBuffer(256));

      checkInvariants(pool);

      assert.equal(pool.writeOffset, 256, 'writeOffset updated');

      assert.equal(pool.readOffset, 0, 'readOffset still 0');
      assert.equal(pool.bytesReadable(), 256, 'bytesReadable updated');
      assert.equal(pool.bytesReadable(1024), 256, 'bytesReadable(1024) updated');
      assert.equal(pool.bytesReadable(256), 256, 'bytesReadable(256) updated');
      assert.equal(pool.bytesReadable(16), 16, 'bytesReadable(16) updated');

      assert.equal(pool.head.start, 0, 'head.start 0');
      assert.equal(pool.head.end, 256, 'head.end 256');
      assert.equal(pool.readCursor.start, 0, 'readCursor.start 0');
      assert.equal(pool.readCursor.end, 256, 'readCursor.end 256');
      assert.equal(pool.tail.start, 256, 'tail.start 256');
      assert.equal(pool.tail.end, 256, 'tail.end 256');
      assert.equal(pool.writeCursor.start, 256, 'writeCursor.start 256');
      assert.equal(pool.writeCursor.end, 256, 'writeCursor.end 256');
    });

    it('should update sensibly on two items', function() {
      const pool = new CachePool();
      pool.write(byteBuffer(256));
      pool.write(byteBuffer(128));

      checkInvariants(pool);

      assert.equal(pool.writeOffset, 384, 'writeOffset updated');
      assert.equal(pool.readOffset, 0, 'readOffset still 0');
      assert.equal(pool.bytesReadable(), 384, 'bytesReadable updated');

      assert.equal(pool.head.start, 0, 'head.start 0');
      assert.equal(pool.head.end, 256, 'head.end 256');
      assert.equal(pool.readCursor.start, 0, 'readCursor.start 0');
      assert.equal(pool.readCursor.end, 256, 'readCursor.end 256');
      assert.equal(pool.tail.start, 384, 'tail.start 384');
      assert.equal(pool.tail.end, 384, 'tail.end 384');
      assert.equal(pool.writeCursor.start, 384, 'writeCursor.start 384');
      assert.equal(pool.writeCursor.end, 384, 'writeCursor.end 384');
    });
  });

  describe('#read()', function() {
    it('should read sensibly on one item', function() {
      const pool = new CachePool();
      pool.write(byteBuffer(16));
      let data = new Uint8Array(pool.read(16));

      checkInvariants(pool);

      assert.equal(data.length, 16, 'read expected length');
      assert.deepEqual(data, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 'read expected data');
    });

    it('should read sensibly on three items', function() {
      const pool = new CachePool();
      pool.write(byteBuffer(7));
      pool.write(byteBuffer(5));
      pool.write(byteBuffer(6));

      checkInvariants(pool);

      let data = new Uint8Array(pool.read(18));
      assert.equal(data.length, 18, 'read expected length');
      assert.deepEqual(data, [
          0, 1, 2, 3, 4, 5, 6,
          0, 1, 2, 3, 4,
          0, 1, 2, 3, 4, 5],
        'read expected data');
    });
  });

  describe('#seekRead()', function() {
    it('should update read offset even when empty', function() {
      const pool = new CachePool();
      pool.seekRead(1024);

      checkInvariants(pool);

      assert.equal(pool.readOffset, 1024, 'readOffset updated');
      assert.strictEqual(pool.readCursor, pool.head, 'still on the head');
      assert.strictEqual(pool.readCursor, pool.tail, 'still on the tail');
      assert.strictEqual(pool.bytesReadable(), 0, 'still 0 available to read');
    });
  });

  describe('#seekWrite()', function() {
    it('should update write offset even when empty', function() {
      const pool = new CachePool();
      pool.seekWrite(1024);

      checkInvariants(pool);

      assert.equal(pool.writeOffset, 1024, 'writeOffset updated');
      assert.strictEqual(pool.writeCursor, pool.head, 'still on the head');
      assert.strictEqual(pool.writeCursor, pool.tail, 'still on the tail');
    });
  });

  describe('#read() + seekRead()', function() {
    it('should read sensibly on three items, seeked halfway through', function() {
      const pool = new CachePool();
      pool.write(byteBuffer(7));
      pool.write(byteBuffer(5));
      pool.write(byteBuffer(6));

      checkInvariants(pool);

      pool.seekRead(4);
      let data = new Uint8Array(pool.read(14));
      assert.equal(data.length, 14, 'read expected length');
      assert.deepEqual(data, [
          4, 5, 6,
          0, 1, 2, 3, 4,
          0, 1, 2, 3, 4, 5],
        'read expected data');
    });
  });


  describe('#seekWrite() + write() + seekRead() + read()', function() {
    it('should read sensibly on three items, seeked around wackily', function() {
      const pool = new CachePool();

      pool.seekWrite(32);
      pool.write(byteBuffer(7));
      pool.write(byteBuffer(5));
      pool.write(byteBuffer(6));

      checkInvariants(pool);

      pool.seekRead(4);
      let data = new Uint8Array(pool.read(14));
      assert.equal(data.length, 0, 'nothing to read at index 4');

      checkInvariants(pool);

      pool.seekRead(36);
      data = new Uint8Array(pool.read(14));

      checkInvariants(pool);

      assert.equal(data.length, 14, 'read expected length');
      assert.deepEqual(data, [
          4, 5, 6,
          0, 1, 2, 3, 4,
          0, 1, 2, 3, 4, 5],
        'read expected data...');
    });
  });


});
