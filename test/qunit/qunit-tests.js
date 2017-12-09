"use strict";

QUnit.test( "hello test", function( assert ) {
  assert.ok( 1 == "1", "Passed!" );
});

function doQuickieTest(assert, url) {
  const done = assert.async();

  var stream = new StreamFile({
    url: url,
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
    assert.equal(stream.headers['content-type'], 'application/ogg', 'headers should come back');
    assert.ok(stream.headers['content-type'].match(/^.*\/.*/), 'headers should come back');
    console.log(stream.headers);
    return stream.seek(1024);
  }).then(function() {
    assert.ok(true, 'seek resolved');
    assert.equal(stream.offset, 1024, 'stream seeked to expected point');
    return stream.read(65536);
  }).then(function(buffer) {
    assert.ok(true, 'read resolved');
    assert.ok(buffer instanceof ArrayBuffer, 'return is ArrayBuffer');
    assert.equal(buffer.byteLength, 65536, 'read expected length in bytes');
    assert.ok(!stream.eof, 'not at eof');
    assert.ok(!stream.buffering, 'not buffering');
    assert.ok(!stream.seeking, 'not seeking');
    return stream.seek(stream.length);
  }).then(function() {
    assert.ok(true, 'seek to end resolved');
    assert.ok(!stream.buffering, 'not buffering');
    assert.ok(!stream.seeking, 'not seeking');
    assert.equal(stream.offset, stream.length, 'at expected read offset');
    assert.ok(stream.eof, 'at eof');
    assert.equal(0, stream.bytesAvailable(), '0 bytes readable');
    return stream.seek(0);
  }).then(function() {
    assert.ok(true, 'seek to start resolved');
    assert.ok(!stream.buffering, 'not buffering');
    assert.ok(!stream.seeking, 'not seeking');
    assert.equal(stream.offset, 0, 'at expected read offset');
    assert.ok(!stream.eof, 'not at eof');
  }).then(function() {
    done();
  }).catch(function(err) {
    assert.ok(false, 'failed out early: ' + err);
    console.log(err);
    throw err;
    done();
  });
}

QUnit.test("quickie test", function(assert) {
  doQuickieTest(assert, 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv');
});

QUnit.test("short file test", function(assert) {
  var done = assert.async();

  var url = 'test-audio.opus';
  var stream = new StreamFile({
    url: url,
    chunkSize: 1 * 1024 * 1024,
    cacheSize: 32 * 1024 * 1024
  });

  stream.load().then(function() {
    assert.ok(true, 'loaded');
    done();
  }).catch(function(err) {
    console.log(err);
    throw err;
    done();
  });
});

QUnit.test("shortish file re-seek test", function(assert) {
  var done = assert.async();

  var url = 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Ja-Godzilla.oga';
  var stream = new StreamFile({
    url: url,
    chunkSize: 1 * 1024 * 1024,
    cacheSize: 32 * 1024 * 1024
  });

  stream.load().then(function() {
    assert.ok(true, 'loaded');
    assert.ok(stream.length > 0, 'stream.length > 0');
    assert.ok(stream.seekable, 'stream.seekable');

    return stream.read(stream.length);
  }).then(function(bytes) {
    assert.ok(true, 'read through to end of file');

    return stream.seek(0);
  }).then(function() {
    assert.ok(true, 'seeked to beginning');

    return stream.read(stream.length);
  }).then(function() {
    assert.ok(true, 'read through to end again');

  }).then(function() {
    done();
  }).catch(function(err) {
    console.log(err);
    throw err;
    done();
  });
});

QUnit.test("longer file re-seek test", function(assert) {
  var done = assert.async();

  var url = 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv';
  var stream = new StreamFile({
    url: url,
    chunkSize: 1 * 1024 * 1024,
    cacheSize: 32 * 1024 * 1024
  });

  stream.load().then(function() {
    assert.ok(true, 'loaded');
    assert.ok(stream.length > 0, 'stream.length > 0');
    assert.ok(stream.seekable, 'stream.seekable');

    return stream.read(stream.length);
  }).then(function(bytes) {
    assert.ok(true, 'read through to end of file');

    return stream.seek(0);
  }).then(function() {
    assert.ok(true, 'seeked to beginning');

    return stream.read(stream.length);
  }).then(function() {
    assert.ok(true, 'read through to end again');

  }).then(function() {
    done();
  }).catch(function(err) {
    console.log(err);
    throw err;
    done();
  });
});

QUnit.test("cancel aborts buffering", function(assert) {
  var done = assert.async();
  var url = 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv';
  var stream = new StreamFile({
    url: url,
    chunkSize: 1 * 1024 * 1024,
    cacheSize: 32 * 1024 * 1024
  });

  stream.load().then(function() {
    assert.ok(true, 'loaded');
    assert.ok(stream.length > 0, 'stream.length > 0');
    assert.ok(stream.seekable, 'stream.seekable');

    stream.read(stream.length);
    assert.ok(stream.buffering, 'stream.buffering true after read start')
    stream.abort();
    assert.ok(!stream.buffering, 'stream.buffering false after read cancel');

  }).then(function() {
    done();
  }).catch(function(err) {
    console.log('nooooo', err);
    throw err;
    done();
  });
});

QUnit.test("load stuff from a blob", function(assert) {
  var url = 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv';
  var x = new XMLHttpRequest();
  x.responseType = 'arraybuffer';
  x.onload = function() {
    var buf = x.response;
    var blob = new Blob([buf], {
      type: 'video/ogg'
    });
    var blobUrl = URL.createObjectURL(blob);

    doQuickieTest(assert, blobUrl);
  };
  x.open('GET', url);
  x.send();
});

function doOverflowTest(assert, url, readpast) {
  var done = assert.async();
  var stream = new StreamFile({
    url: url
  });
  stream.load().then(() => {
    return stream.buffer(readpast);
  }).then((avail) => {
    return stream.seek(readpast);
  }).then((pos) => {
    return stream.buffer(1024 * 1024);
  }).then((avail) => {
    assert.ok('survived reading beyond end of blob');
    done();
  }).catch((err) => {
    throw err;
    done();
  });
}

QUnit.test("https check for over-end", function(assert) {
  var url = 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv';
  doOverflowTest(assert, url, 1024 * 1024 * 4);
});

QUnit.test("blob check for over-end", function(assert) {
  var done = assert.async();
  var url = 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv';
  var x = new XMLHttpRequest();
  x.responseType = 'arraybuffer';
  x.onload = function() {
    done();
    var buf = x.response;
    var blob = new Blob([buf], {
      type: 'video/ogg'
    });
    var blobUrl = URL.createObjectURL(blob);

    doOverflowTest(assert, blobUrl, 1024 * 1024 * 4);
  };
  x.open('GET', url);
  x.send();
});

QUnit.test("https check for short over-end", function(assert) {
  var url = 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Ja-Godzilla.oga';
  doOverflowTest(assert, url, 0);
});

QUnit.test("blob check for short over-end", function(assert) {
  var done = assert.async();
  var url = 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Ja-Godzilla.oga';
  var x = new XMLHttpRequest();
  x.responseType = 'arraybuffer';
  x.onload = function() {
    done();
    var buf = x.response;
    var blob = new Blob([buf], {
      type: 'video/ogg'
    });
    var blobUrl = URL.createObjectURL(blob);

    doOverflowTest(assert, blobUrl, 0);
  };
  x.open('GET', url);
  x.send();
});
