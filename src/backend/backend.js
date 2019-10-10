"use strict";

const TinyEvents = require('../events');

class Backend extends TinyEvents {

  constructor({url, offset, length, cachever=0}) {
    super();

    this.url = url;
    this.offset = offset;
    this.length = length;
    this.cachever = cachever;

    this.loaded = false;
    this.seekable = false;
    this.headers = {};
    this.eof = false;
    this.bytesRead = 0;    
  }

  load() {
    return Promise.reject(new Error('abstract'));
  }

  /**
   * Wait until we download up to the given offset, reach eof, or error out.
   * Actual data will be returned via 'buffer' events in the meantime.
   *
   * Note that MSStream backend will need this to be called explicitly,
   * while the other backends download progressively even without a call.
   */
  
  bufferToOffset(end) {
    return new Promise((resolve, reject) => {
      if (this.eof || this.offset >= end) {
        resolve();
      } else {
        let oncomplete = null;
        this._onAbort = (err) => {
          oncomplete();
          reject(err);
        };

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
          this._onAbort = null;
        };

        this.buffering = true;
        this.on('buffer', checkBuffer);
        this.on('done', checkDone);
        this.on('error', checkError);
      }
    });
  }
  
  abort() {

    if (this._onAbort) {
      const onAbort = this._onAbort;
      this._onAbort = null;

      let err = new Error('Aborted');
      err.name = 'AbortError';

      onAbort(err);
    }

  }

  _httpRangeValue() {
    let range = null;
    if (this.offset || this.length) {
      range = 'bytes=' + this.offset + '-';
    }
    if (this.length) {
      range += (this.offset + this.length) - 1;
    }
    return range;
  }

}

module.exports = Backend;