StreamFile
==========

Handy class / XHR wrapper for streaming large files from the web.
Supports chunking and seeking within large files using the HTTP 'Range' header.

Copyright 2013-2017 by Brion Vibber <brion@pobox.com>. Provided under MIT license.

https://github.com/brion/stream-file

0.1.3 - 2017-03-01
* fixes for stream.buffering prop with cancelToken usage

0.1.2 - 2017-01-27
* fix for end-of-file edge cases

0.1.1 - 2017-01-26
* fix for failure on very short files

0.1.0 - 2016-10-02
* initial npm release

todo:
* add Fetch backend
* add node CLI/server backend
* track down some bugs with end of file and buffering

# Requirements

stream-file depends on the ES6 Promise class; you can use a polyfill such as [es6-promise](https://www.npmjs.com/package/es6-promise) when deploying to older browsers. A prebuilt copy of es6-promise is included in the dist directory for the browser distribution, or may be included in your application code for webpack/browserify users.

# Usage

## Example

```
var StreamFile = require('stream-file');

var stream = new StreamFile({
  url: 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv',
  chunkSize: 1 * 1024 * 1024,
  cacheSize: 32 * 1024 * 1024
});

// load() opens up an HTTP request and gets some state info.
stream.load().then(function() {
  console.log(stream.seekable ? 'stream is seekable' : 'stream is not seekable');
  console.log('stream length',  stream.length);
  console.log('stream headers', stream.headers);

  // seek() moves the input point to a new position, if stream is seekable
  return stream.seek(1024);
}).then(function() {

  // read() waits until given byte count is available (or eof) and returns buffer
  return stream.read(65536);
}).then(function(buffer) {
  console.log('read buffer with ' + buffer.byteLength + ' bytes');
  console.log(stream.eof ? 'at eof' : 'not at eof');
  console.log(stream.buffered); // buffered ranges

  // All done!
  stream.close();

}).catch(function(err) {
  // Any error conditions chain through the Promises to the final catch().
  console.log('failed', err)
});
```

## Cancelation

Methods that return Promises accept a "cancelation token" argument, an object which can be used to cancel an in-progress event. Since cancelable Promises are not yet standardized, this is done in an ad-hoc fashion: caller passes in an object, and the async function adds a 'cancel' method to it that can be called to abort the operation.

This can be used to implement a timeout, or otherwise cancel something:

```
var cancelToken = {};
var timeout = setTimeout(function() {
  // Cancel read if didn't succeed within 5 seconds
  cancelToken.cancel(new Error('timeout'));
}, 5000)
stream.read(65536, cancelToken).then(function(buffer) {
  // Success!
  clearTimeout(timeout);
  doSomething(buffer);
}).catch(function(err) {
  // Cancelation will trigger the error path.
  console.log(err);
});
```

# API

## Constructor options

Pass the constructor an object with various properties:

**url**: String
* the URL to load

**chunkSize**: number?
* optional size to chunk loads in, in bytes
* defaults to 1MB

**cacheSize** number?
* optional max size for in-memory buffer
* defaults to 32MB
* @TODO not yet implemented

## Properties

**seekable**: boolean
* is underlying stream seekable?

**length**: number
* total byte length of file/buffer, or -1 for unknown

**offset**: number
* current byte offset of reader

**eof**: boolean
* true if reading reached end of file

**loaded**: boolean
* did load() complete?

**loading**: boolean
* is load() running?

**buffering**: boolean
* is buffer() or read() running?

**seeking**: boolean
* is seek() running?

## Methods

**load**(cancelToken: Object?): Promise
* start loading the URL and buffering data
* on completion, loaded will be true
* while running, loading will be true

**bytesAvailable**(max:number?): number
* count of available buffered bytes that can be read synchronously from the current position
* may be 0!
* pass optional 'max' parameter to reduce search time within cache if you only care about hitting a certain number

**seek**(offset, cancelToken: Object?): Promise
* seek to the target offset from the beginning of the file
* invalid if stream not seekable
* invalid if currently loading, seeking, or buffering
* may change offset, eof state

**buffer**(nbytes:number, cancelToken: Object?): Promise
* wait until at least nbytes are available in the buffer or eof

**read**(nbytes, cancelToken: Object?): Promise<ArrayBuffer>
* wait until nbytes are available or eof, read the data, then return a buffer via Promise
* if eof is reached, will return fewer -- even 0

**readSync**(nbytes): ArrayBuffer
* read up to nbytes from buffer and return immediately
* if less than nbytes are available due to eof or limited buffer, will return fewer -- even 0
* may change offset, eof state

**close**()
* close resources and cancel all operations

# Deployment

## getting the module

```
npm install stream-file
```

## browserify and webpack

The stream-file package is meant to be used in web client code via a package bundler such as [browserify](http://browserify.org/) or [webpack](http://webpack.github.io/).

Although compiled to ES5, a few ECMAScript 2015 features are used such as the Promise class. If you're targeting older browser versions, you will need to convert the code to ES5 and add a Promise polyfill.

Pre-built bundles of the StreamFile class and the es6-promise shim are available in the dist subdirectory.

## node

CLI/server-side node will be supported in a future release.

# Backends

Backend selection is automatic and cannot yet be overridden or plugged.
There are currently three XMLHttpRequest-based backends for in-browser usage:

* 'ms-stream' for IE and Edge: reads on demand via MSStream & MSStreamReader
* 'moz-chunked-arraybuffer' for Firefox: progressive download via ArrayBuffer chunks
* 'binary string' for Safari, Chrome: progressive download via string chunks

The binary string backend uses more memory to buffer data.

Currently the ms-stream backend may be slightly buggier than the others.

# License

Copyright (c) 2013-2016 Brion Vibber and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
