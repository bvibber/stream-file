"use strict";

const MozChunkedBackend = require('./moz-chunked-backend.js');
const MSStreamBackend = require('./msstream-backend.js');
const BinaryStringBackend = require('./binary-string-backend.js');

function autoselect() {
  if (MozChunkedBackend.supported()) {
    return MozChunkedBackend;
  } else if (MSStreamBackend.supported()) {
    return MSStreamBackend;
  } else if (BinaryStringBackend.supported()) {
    return BinaryStringBackend;
  } else {
    return null;
  }
}

let backendClass = null;

function instantiate(options) {
  if (!backendClass) {
    backendClass = autoselect();
  }
  if (!backendClass) {
    throw new Error('No supported backend class');
  }
  return new backendClass(options);
}

module.exports = instantiate;
