"use strict"

const Backend = require('./backend.js');

const type = 'ms-stream';

class MSStreamBackend extends Backend {

  constructor(options) {
    super(options);
    this.stream = null;
    this.streamReader = null;
  }

  initXHR() {
    super.initXHR();
    this.xhr.responseType = type;
  }

  onXHRStart() {
    const checkProgress = () => {
      if (this.xhr.readyState === 3) {
        // We don't get the stream until readyState 3, and it's gone after load.
        this.stream = this.xhr.response;
        this.xhr.removeEventListener('readystatechange', checkProgress);
        this.emit('open');
      }
    };
    this.xhr.addEventListener('readystatechange', checkProgress);
  }

  waitForStream() {
    return new Promise((resolve, reject) => {
      if (this.stream) {
        resolve(this.stream);
      } else {
        let oncomplete = null;
        this._onAbort = (err) => {
          oncomplete();
          reject(err);
        };
        const checkStart = () => {
          resolve(this.stream);
        };
        oncomplete = () => {
          this.off('open', checkStart);
          this._onAbort = null;
        }
        this.on('open', checkStart);
      }
    });
  }

  /**
   * Trigger further download of bytes
   * @returns {Promise}
   */
  bufferToOffset(end) {
    return this.waitForStream().then((stream) => {
      return new Promise((resolve, reject) => {
        if (this.streamReader) {
          throw new Error('cannot trigger read when reading');
        }
        if (this.offset >= end || this.eof) {
          resolve();
        } else {
          const nbytes = end - this.offset;
          this.streamReader = new MSStreamReader();
          this.streamReader.onload = (event) => {
            this.streamReader = null;
            const buffer = event.target.result;
            if (buffer.byteLength > 0) {
              this.bytesRead += buffer.byteLength;
              this.emit('buffer', buffer);
            } else {
              // Zero length means end of stream.
              this.eof = true;
              this.emit('done');
            }
            resolve();
          };
          this.streamReader.onerror = () => {
            this.streamReader = null;
            this.stream = null;
            this.emit('error');
            reject(new Error('mystery error streaming'));
          };
          this._onAbort = (err) => {
            this.streamReader.abort();
            this.streamReader = null;
            this.stream = null;
            this.emit('error');
            reject(reason);
          };
          this.streamReader.readAsArrayBuffer(stream, nbytes);
        }
      });
    });
  }

  abort() {
    if (this.streamReader) {
      this.streamReader.abort();
      this.streamReader = null;
    }
    if (this.stream) {
      this.stream.msClose();
      this.stream = null;
    }
    super.abort();
  }
}

MSStreamBackend.supported = function() {
  try {
    const xhr = new XMLHttpRequest();
    // IE demands that open() be called before we can set xhr.responseType
    xhr.open("GET", "/robots.txt");
    xhr.responseType = type;
    return (xhr.responseType === type);
  } catch (e) {
    return false;
  }
};

module.exports = MSStreamBackend;
