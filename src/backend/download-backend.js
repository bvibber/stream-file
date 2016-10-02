"use strict";

const Backend = require('./backend.js');

/**
 * Backend for progressive downloading.
 * Subclasses handle details of strings/buffers.
 */
class DownloadBackend extends Backend {

  bufferToOffset(end, cancelToken) {
    return new Promise((resolve, reject) => {
      if (this.eof || this.offset >= end) {
        resolve();
      } else {
        let oncomplete = null;
        if (cancelToken) {
          cancelToken.cancel = (reason) => {
            this.abort();
            oncomplete();
            reject(reason);
          };
        }

        const checkBuffer = () => {
          if (this.offset >= end && !this.eof) {
            oncomplete();
            resolve();
          }
        };
        const checkDone = () => {
          oncomplete();
          resolve();
        };
        const checkError = () => {
          oncomplete();
          reject(new Error('error streaming'));
        };

        oncomplete = () => {
          this.buffering = false;
          this.off('buffer', checkBuffer);
          this.off('done', checkDone);
          this.off('error', checkError);
        };

        this.buffering = true;
        this.on('buffer', checkBuffer);
        this.on('done', checkDone);
        this.on('error', checkError);
      }
    });
  }

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
