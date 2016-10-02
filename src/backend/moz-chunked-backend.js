"use strict";

const DownloadBackend = require('./download-backend.js');

const type = 'moz-chunked-arraybuffer';

class MozChunkedBackend extends DownloadBackend {
  initXHR() {
    super.initXHR();
    this.xhr.responseType = type;
  }

  onXHRProgress() {
    const buffer = this.xhr.response;
    this.bytesRead += buffer.byteLength;
    this.emit('buffer', buffer);
  }
}

MozChunkedBackend.supported = function() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.responseType = type;
    return (xhr.responseType === type);
  } catch (e) {
    return false;
  }
};

module.exports = MozChunkedBackend;