"use strict";

const DownloadBackend = require('./download-backend.js');

class BinaryStringBackend extends DownloadBackend {
  initXHR() {
    super.initXHR();
    this.xhr.responseType = "text";
    this.xhr.overrideMimeType('text/plain; charset=x-user-defined');
  }

  onXHRProgress() {
    const slice = this.xhr.responseText.slice(this.bytesRead);
    if (slice.length > 0) {
      this.bytesRead += slice.length;
      this.emit('buffer', slice);
    }
  }

  onXHRLoad() {
    // We may or may not get that final event
    this.onXHRProgress();
    super.onXHRLoad();
  }
}

BinaryStringBackend.supported = function() {
  try {
    const xhr = new XMLHttpRequest();
    return !!xhr.overrideMimeType;
  } catch (e) {
    return false;
  }
};

module.exports = BinaryStringBackend;
