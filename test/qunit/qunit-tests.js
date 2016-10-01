"use strict";

QUnit.test( "hello test", function( assert ) {
  assert.ok( 1 == "1", "Passed!" );
});

QUnit.test("quickie test", function(assert) {
  const done = assert.async();

  var stream = new StreamFile({
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv',
    chunkSize: 1 * 1024 * 1024,
    cacheSize: 32 * 1024 * 1024
  });
  assert.ok(!stream.loading, 'not loading before load');
  assert.ok(!stream.loaded, 'not loaded before load');
  assert.ok(!stream.seekable, 'not seekable before load');
  assert.ok(!stream.seeking, 'not seeking before load');
  assert.ok(!stream.buffering, 'not buffering before load');
  stream.load().then(function() {
    assert.ok(!stream.loading, 'not loading after load');
    assert.ok(stream.loaded, 'loaded after load');
    assert.ok(stream.seekable, 'stream should be seekable');
    assert.equal(stream.length, 4775695, 'Folgers.ogv should be 4775695 bytes');
    //assert.equal(stream.headers['content-type'], 'application/ogg', 'headers should come back');
    assert.ok(stream.headers['content-type'].match(/^.*\/.*/), 'headers should come back');
    console.log(stream.headers);
    return stream.seek(1024);
  }).then(function() {
    assert.ok('seek resolved');
    assert.equal(stream.offset, 1024, 'stream seeked to expected point');
    return stream.read(65536);
  }).then(function(buffer) {
    assert.ok('read resolved');
    assert.ok(buffer instanceof ArrayBuffer, 'return is ArrayBuffer');
    assert.equal(buffer.byteLength, 65536, 'read expected length in bytes');
    assert.ok(!stream.eof, 'not at eof');
    assert.ok(!stream.buffering, 'not buffering');
    done();
  }).catch(function(err) {
    assert.ok(false, 'failed out early: ' + err);
    console.log(err);
    throw err;
    done();
  });
});
