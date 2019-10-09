"use strict";

const FetchBackend = require('./fetch-backend.js');
const MozChunkedBackend = require('./moz-chunked-backend.js');
const MSStreamBackend = require('./msstream-backend.js');
const BinaryStringBackend = require('./binary-string-backend.js');
const ArrayBufferBackend = require('./arraybuffer-backend.js');

function autoselect() {
  // Only include progressive-capable for now
  if (FetchBackend.supported()) {
    return FetchBackend;
  } else if (MozChunkedBackend.supported()) {
    return MozChunkedBackend;
  } else if (BinaryStringBackend.supported()) {
    return BinaryStringBackend;
  } else if (MSStreamBackend.supported()) {
    return MSStreamBackend;
  } else {
    return null;
  }
}

let backendClass = null;

function instantiate(options) {
  if (options.progressive === false) {
    return new ArrayBufferBackend(options);
  }
  if (!backendClass) {
    backendClass = autoselect();
  }
  if (!backendClass) {
    throw new Error('No supported backend class');
  }
  return new backendClass(options);
}

module.exports = instantiate;
