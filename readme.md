StreamFile
==========

Handy class / XHR wrapper for streaming large files from the web.
Supports chunking and seeking within large files using the HTTP 'Range' header.

Copyright 2013-2019 by Brion Vibber <brion@pobox.com>. Provided under MIT license.

https://github.com/brion/stream-file

0.2.4 - 2019-02-15
* Allow non-progressive download path if `progressive: false` passed in options.
    * This works around rare data corruption issues with binary string, but won't return data until each chunk is complete.

0.2.3 - 2017-12-08
* Fix for reading last chunk of blob URLs in Safari.

0.2.2 - 2017-12-05
* Fixed incorrect whitespace scrubbing on headers

0.2.1 - 2017-11-09
* Fixed incorrect variable name in abort handling.

0.2.0 - 2017-04-23
* Added `readBytes()` method allowing copying directly into a byte array such as an emscripten heap subarray.
* Breaking API changes:
    * Drop `cancelToken` scheme in favor of `abort()` method.

0.1.5 - 2017-03-17
* prefer binary string over MSStream on IE 11 for now (MSStream backend does not maintain readahead buffer across boundaries)

0.1.4 - 2017-03-16
* fixes for MSStream detection on IE

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

Module setup and constructor:

```js
var StreamFile = require('stream-file');

var stream = new StreamFile({
  url: 'https://upload.wikimedia.org/wikipedia/commons/9/94/Folgers.ogv',

  // Optional; max size of each download chunk
  chunkSize: 1 * 1024 * 1024,

  // Optional; total amount of in-memory cache
  cacheSize: 32 * 1024 * 1024
});
```

ES5 with Promises:
```js
function demo(stream) {
  // load() opens up an HTTP request and gets some state info.
  return stream.load().then(function() {
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
}
```

ES7 async syntax:
```js
async function demo(stream) {
  try {
    // load() opens up an HTTP request and gets some state info.
    await stream.load();
    console.log(stream.seekable ? 'stream is seekable' : 'stream is not seekable');
    console.log('stream length',  stream.length);
    console.log('stream headers', stream.headers);

    // seek() moves the input point to a new position, if stream is seekable
    await stream.seek(1024);

    // read() waits until given byte count is available (or eof) and returns buffer
    let buffer = await stream.read(65536);
    console.log('read buffer with ' + buffer.byteLength + ' bytes');
    console.log(stream.eof ? 'at eof' : 'not at eof');
    console.log(stream.buffered); // buffered ranges

    // All done!
    stream.close();

  } catch (err) {
    // Any error conditions chain through the Promises to the final catch().
    console.log('failed', err)
  }
}
```

## Reading asynchronously

The `read()` method waits for the requested amount of data to be available, or end-of-file to be reached, and passes back an ArrayBuffer.

ES5 syntax with Promises:
```js
function readAsArrayBufferAsync(stream) {
  // Wait for eof or available byte range
  return stream.read(1024).then(function(buffer) {
    // ... do something with buffer ...
    console.log('read ' + buffer.byteLength + ' bytes');
  })
}
```

ES7 async syntax:
```js
async function readAsArrayBufferAsync(stream) {
  // Wait for eof or available byte range
  let buffer = await stream.read(1024);

  // ... do something with buffer ...
  console.log('read ' + buffer.byteLength + ' bytes');
}
```

## Buffering ahead

To ensure data is buffered and available without reading it yet, call `buffer()`:

ES5 syntax with Promises:
```js
function doBufferAsync(stream) {
  // Wait for eof or available byte range
  return stream.buffer(1024).then(function(nbytes) {
    // ... do some sync stuff
    console.log(nbytes + ' bytes ready to read');
  });
}
```

ES7 async syntax:
```js
async function doBufferAsync(stream) {
  // Wait for eof or available byte range
  let nbytes = await stream.buffer(1024);

  // ... do some sync stuff
  console.log(nbytes + ' bytes ready to read');
}
```

## Reading synchronously

If you already have enough data buffered, you can work synchronously with that data by reading chunks of data with `readSync()`:

```js
function readAsArrayBufferSync(stream) {
  // Wait for eof or available byte range
  var available = stream.buffer(1024);

  // May return 1024 bytes
  var buffer = stream.readSync(available);
  // ... do something with buffer ...
  console.log('read ' + buffer.byteLength + ' bytes');
}
```

If you're going to copy the result directly into a larger byte array such as an emscripten heap or WebAssembly memory, you can avoid an intermediate copy with `readBytes()` by reading from the StreamFile's buffers directly into the target array.

ES5 syntax with Promises:

```js
function readIntoByteArray(stream) {
  // Allocate a sub-buffer
  var buflen = 1024;
  var bufptr = Module._malloc(buflen);
  var data = Module.HEAPU8.subarray(ptr, ptr + buflen);

  // Copy the bytes directly into the aliased subarray...
  var nbytes = stream.readBytes(data);
  console.log('read ' + nbytes + ' bytes');

  // Have the asm.js or wasm module process...
  Module._process_my_data(bufptr, nbytes);

  // Free the sub-buffer
  Module._free(bufptr);
}
```


## Cancellation

The `load()`, `buffer()`, `read()`, and `seek()` calls may be canceled by calling `abort()`. Further reads or seeks may then be triggered at will.

Note that earlier versions used a per-call "cancellation token" argument, which has been dropped as of 0.2.0 since cancelable Promises have not been standardized and the use cases are actually simple enough not to need it.

This can be used to implement a timeout, or otherwise cancel something:

ES5 with Promises:
```js
function readWithTimeout(stream) {
  var timeout = setTimeout(function() {
    // Cancel read if didn't succeed within 5 seconds
    stream.abort();
  }, 5000);

  return stream.read(65536).then(function(buffer) {
    // Success!
    clearTimeout(timeout);
    doSomething(buffer);
  }).catch(function(err) {
    // Cancelation will trigger the error path.
    if (err.name === 'AbortError') {
      console.log('Timeout!');
    } else {
      console.log(err);
    }
  });
}
```

ES7 async syntax:
```js
async function readWithTimeout(stream) {
  let timeout = setTimeout(() => {
    // Cancel read if didn't succeed within 5 seconds
    stream.abort();
  }, 5000);

  try {
    let buffer = await stream.read(65536);
    // Success!
    clearTimeout(timeout);
    doSomething(buffer);
  } catch(err) {
    // Cancelation will trigger the error path.
    if (err.name === 'AbortError') {
      console.log('Timeout!');
    } else {
      console.log(err);
    }
  }
}
```
# API

## Constructor options

Pass the constructor an object with various properties:

**url**: string (required)
* the URL to load

**chunkSize**: number
* optional size to chunk loads in, in bytes
* defaults to 1MB

**cacheSize**: number
* optional max size for in-memory buffer
* defaults to 32MB

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

**load**(): Promise
* start loading the URL and buffering data
* while running, `loading` will be true
* on completion, `loaded` will be true

**bytesAvailable**(max:number=Infinity): number
* count of available buffered bytes that can be read synchronously from the current position
* may be 0!
* pass optional 'max' parameter to reduce search time within cache if you only care about hitting a certain number

**seek**(offset): Promise
* seek to the target offset from the beginning of the file
* invalid if stream not seekable
* invalid if currently loading, seeking, or buffering
* may change `offset`, `eof` state

**buffer**(nbytes:number): Promise
* wait until at least nbytes are available in the buffer or eof
* while running, `buffering` will be true

**read**(nbytes): Promise<ArrayBuffer>
* wait until nbytes are available or eof, read the data, then return a buffer via Promise
* if eof is reached, will return fewer -- even 0

**readSync**(nbytes): ArrayBuffer
* read up to nbytes from buffer and return immediately
* if less than nbytes are available due to eof or limited buffer, will return fewer -- even 0
* may change offset, eof state

**readBytes**(dest:Uint8Array): Promise&lt;number>
* wait until up to dest.byteLength bytes are available or eof, read the data, and return the number of bytes actually read via Promise
* if less than nbytes are available due to eof or limited buffer, will return fewer -- even 0
* may change offset, eof state

**readBytesSync**(dest:Uint8Array): number
* read up to dest.byteLength bytes into a bytes array and return immediately
* returns the number of bytes actually read
* if less than nbytes are available due to eof or limited buffer, will return fewer -- even 0
* may change offset, eof state

**abort**()
* cancel any active network operations but keep state live

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

Copyright (c) 2013-2017 Brion Vibber and other contributors

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
