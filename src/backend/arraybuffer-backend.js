"use strict";

const DownloadBackend = require('./download-backend.js');

const type = 'arraybuffer';

class ArrayBufferBackend extends DownloadBackend {
  initXHR() {
    super.initXHR();
    this.xhr.responseType = type;
  }

  onXHRProgress() {
    // no progressive download available. wait until the end.
  }

  onXHRLoad() {
    const buf = this.xhr.response;
    this.bytesRead += buf.byteLength;
    this.emit('buffer', buf);

    super.onXHRLoad();
  }
}

ArrayBufferBackend.supported = function() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.responseType = type;
    return (xhr.responseType === type);
  } catch (e) {
    return false;
  }
};

module.exports = ArrayBufferBackend;
