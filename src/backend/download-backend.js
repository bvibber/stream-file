"use strict";

const XHRBackend = require('./xhr-backend.js');

/**
 * Backend for progressive downloading.
 * Subclasses handle details of strings/buffers.
 */
class DownloadBackend extends XHRBackend {

  initXHR() {
    super.initXHR();
  }

  onXHRStart() {
    // Event handlers to drive output
    this.xhr.addEventListener('progress', () => this.onXHRProgress());
    this.xhr.addEventListener('error', () => this.onXHRError());
    this.xhr.addEventListener('load', () => this.onXHRLoad());

    this.emit('open');
  }

  onXHRProgress() {
    throw new Error('abstract');
  }

  onXHRError() {
    this.emit('error');
  }

  onXHRLoad() {
    this.eof = true;
    this.emit('done');
  }

}

module.exports = DownloadBackend;
