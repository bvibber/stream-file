"use strict";

var StreamFile = require('./index.js');

var stream = new StreamFile({
  url: 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv',
  chunkSize: 1 * 1024 * 1024,
  cacheSize: 32 * 1024 * 1024
});
stream.load().then(function() {
  console.log(stream.seekable ? 'stream is seekable' : 'stream is not seekable');
  console.log('stream length: ' + stream.length);
  console.log(stream.headers);
  return stream.seek(1024);
}).then(function() {
  return stream.read(65536);
}).then(function(buffer) {
  console.log('read buffer with ' + buffer.byteLength + ' bytes');
  console.log(stream.eof ? 'at eof' : 'not at eof');
  console.log(stream.buffered); // buffered ranges
}).catch(function(err) {
  console.log('failed', err)
});
