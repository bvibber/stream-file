"use strict";

const Backend = require('./backend.js');

/**
 * Backend for progressive downloading.
 * Subclasses handle details of strings/buffers.
 */
class DownloadBackend extends Backend {
  /**
   * Trigger further downloads. No-op since progressive download never
   * stops.... don't stop downloaaaaaading...
   * @return {Promise}
   */
  buffer(nbytes, cancelToken) {
    return new Promise((resolve, reject) => {
      const end = this.offset + nbytes;
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
          this.bus.off('buffer', checkBuffer);
          this.bus.off('done', checkDone);
          this.bus.off('error', checkError);
        };

        this.buffering = true;
        this.bus.on('buffer', checkBuffer);
        this.bus.on('done', checkDone);
        this.bus.on('error', checkError);
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

    this.bus.emit('open');
  }

  onXHRProgress() {
    throw new Error('abstract');
  }

  onXHRError() {
    this.bus.emit('error');
  }

  onXHRLoad() {
    this.eof = true;
    this.bus.emit('done');
  }

}

module.exports = DownloadBackend;
