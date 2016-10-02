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

  /**
   * Trigger further download of bytes
   * @returns {Promise}
   */
  buffer(nbytes, cancelToken) {
    return new Promise((resolve, reject) => {
      if (!this.stream) {
        throw new Error('cannot trigger read without stream');
      }
      if (this.streamReader) {
        throw new Error('cannot trigger read when reading');
      }
      this.streamReader = new MSStreamReader();
      this.streamReader.onload = (event) => {
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
        reject(new Error('mystery error streaming'));
      };
      if (cancelToken) {
        cancelToken.cancel = (reason) => {
          this.streamReader.abort();
          this.streamReader = null;
          reject(reason);
        };
      }
      this.streamReader.readAsArrayBuffer(this.stream, nbytes);
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
    xhr.responseType = type;
    return (xhr.responseType === type);
  } catch (e) {
    return false;
  }
};

module.exports = MSStreamBackend;
