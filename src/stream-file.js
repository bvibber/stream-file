"use strict";

const EventEmitter = require('./events');
const CachePool = require('./cache');
const Backend = require('./backend');

/**
 * @typedef {Object} StreamFileOptions
 * @property {string} url - the URL to fetch
 * @property {number} chunkSize - max size of each chunked HTTP request / readahead target
 * @property {number} cacheSize - max amount of data to keep buffered in memory for seeks
 */

/**
 * Utility class for chunked streaming of large files via XMLHttpRequest.
 * Provides an abstraction of a seekable input stream, backed by in-memory
 * caching, and some convenient promise-based i/o methods.
 * @param {StreamFileOptions} options
 * @constructor
 */
class StreamFile {
  constructor({
    url='',
    chunkSize=1 * 1024 * 1024,
    cacheSize=0,
  }) {
    // InputStream public API
    this.length = -1;
    this.loaded = false;
    this.loading = false;
    this.seekable = false;
    this.buffering = false;
    this.seeking = false;

    Object.defineProperties(this, {
      /**
       * Byte offset of the read head
       */
      offset: {
        get: function() {
          return this._cache.readOffset;
        }
      },

      /**
       * Is the read head at the end of the file?
       */
      eof: {
        get: function() {
          return this.length === this._cache.readOffset;
        }
      }
    });

    // StreamFile public API
    this.url = url;
    this.headers = {};

    // Private
    this._cache = new CachePool({
      cacheSize
    });

    this._backend = null;
    this._cachever = 0;
    this._chunkSize = chunkSize;
  }

  /**
   * Open the file, get metadata, and start buffering some data.
   * On success, loaded will become true, headers may be filled out,
   * and length may be available.
   *
   * @param {CancelToken?} cancelToken - optional cancellation token
   * @returns {Promise}
   */
  load(cancelToken) {
    return new Promise((resolve, reject) => {
      if (this.loading) {
        throw new Error('cannot load when loading');
      }
      if (this.loaded) {
        throw new Error('cannot load when loaded');
      }
      this.loading = true;
      this._openBackend(cancelToken).then((backend) => {
        // Save metadata from the first set...
        // Beware this._backend may be null already,
        // if the first segment was very short!
        this.seekable = backend.seekable;
        this.headers = backend.headers;
        this.length = backend.length;
        this.loaded = true;
        this.loading = false;
        resolve();
      }).catch((err) => {
        this.loading = false;
        reject(err);
      });
    });
  }

  /**
   * Create a backend and wait for it to load.
   * The returned 'backend' object may be null if there is no data to read.
   *
   * @returns {Promise}
   */
  _openBackend(cancelToken) {
    return new Promise((resolve, reject) => {
      if (cancelToken) {
        cancelToken.cancel = (err) => {};
      }
      if (this._backend) {
        resolve(this._backend);
      } else if (this.eof) {
        reject(new Error('cannot open at end of file'));
      } else {
        const cache = this._cache;
        const max = this._chunkSize;

        // Seek forward to the next unread point, up to chunk size
        const readable = cache.bytesReadable(max);
        const readTail = cache.readOffset + readable;
        cache.seekWrite(readTail);

        // Did we already cache the entire file?
        if (this.length >= 0 && readTail >= this.length) {
          resolve(null);
          return;
        }

        // Do we have space to write within that chunk?
        const writable = cache.bytesWritable(max);
        if (writable === 0) {
          // Nothing to read/write within the current readahead area.
          resolve(null);
        } else {
          const backend = this._backend = new Backend({
            url: this.url,
            offset: this._cache.writeOffset,
            length: writable,
            cachever: this._cachever
          });

          let oncomplete = null;
          if (cancelToken) {
            cancelToken.cancel = (err) => {
              this._backend = null;
              backend.abort();
              reject(err);
            }
          }

          const checkOpen = () => {
            if (backend !== this._backend) {
              oncomplete();
              reject(new Error('invalid state'));
            } else {
              backend.on('buffer', (buffer) => {
                if (backend === this._backend) {
                  this._cache.write(buffer);
                }
              });
              backend.on('done', () => {
                if (backend === this._backend) {
                  if (this.length === -1) {
                    // save length on those final thingies
                    this.length = this._backend.offset + this._backend.bytesRead;
                  }
                  this._backend = null;
                }
              });
              resolve(backend);
            }
          };

          const checkError = (err) => {
            if (backend !== this._backend) {
              reject(new Error('invalid state'));
            } else {
              this._backend = null;
              reject(err);
            }
          };

          oncomplete = () => {
            backend.off('open', checkOpen);
            backend.off('error', checkError);
            if (cancelToken) {
              cancelToken.cancel = () => {};
            }
          };
          backend.on('open', checkOpen);
          backend.on('error', checkError);
          backend.on('cachever', () => {
            this._cachever++;
          });

          backend.load();
        }
      }
    });
  }

  /**
   * If we have empty space within the readahead area and there is not already
   * a download backend in place, create one and start it loading in background.
   * @returns {Promise}
   */
  _readAhead(cancelToken) {
    return new Promise((resolve, reject) => {
      if (this._backend || this.eof) {
        // do nothing
        resolve();
      } else {
        this._openBackend(cancelToken).then(() => {
          resolve();
        }).catch((err) => {
          reject(err)
        });
      }
    });
  }

  /**
   * Seek the read position to a new location in the file, asynchronously.
   * After succesful completion, reads will continue at the new offset.
   * May fail due to network problems, invalid input, or bad state.
   * @param {number} offset - target byte offset from beginning of file
   * @param {CancelToken?} cancelToken - optional cancellation token
   * @returns {Promise} - resolved when ready to read at the new position
   */
  seek(offset, cancelToken) {
    return new Promise((resolve, reject) => {
      if (!this.loaded || this.buffering || this.seeking) {
        throw new Error('invalid state');
      } else if (offset !== (offset | 0) || offset < 0) {
        throw new Error('invalid input');
      } else if (this.length >= 0 && offset > this.length) {
        throw new Error('seek past end of file');
      } else if (!this.seekable) {
        throw new Error('seek on non-seekable stream');
      } else {
        if (this._backend) {
          // @todo if a short seek forward, just keep reading?
          this.abort();
        }
        this._cache.seekRead(offset);
        this._cache.seekWrite(offset);

        // Fire off a download if necessary.
        this._readAhead(cancelToken).then(resolve).catch(reject);
      }
    });
  }

  /**
   * Read up to the requested number of bytes, or until end of file is reached,
   * and advance the read head.
   *
   * May wait on network activity if data is not yet available.
   *
   * @param {number} nbytes - max number of bytes to read
   * @returns {ArrayBuffer} - between 0 and nbytes of data, inclusive
   */
  read(nbytes, cancelToken) {
    return this.buffer(nbytes, cancelToken).then(() => {
      return this.readSync(nbytes);
    });
  }

  /**
   * Read up to the requested number of bytes, or however much is available
   * in the buffer until the next empty segment, and advance the read head.
   *
   * Returns immediately.
   *
   * @param {number} nbytes - max number of bytes to read
   * @returns {ArrayBuffer} - between 0 and nbytes of data, inclusive
   */
  readSync(nbytes) {
    if (!this.loaded || this.buffering || this.seeking) {
      throw new Error('invalid state');
    } else if (nbytes !== (nbytes | 0) || nbytes < 0) {
      throw new Error('invalid input');
    }
    const buffer = this._cache.read(nbytes);

    // Trigger readahead if necessary.
    this._readAhead();

    return buffer;
  }

  /**
   * Wait until the given number of bytes are available to read, or end of file.
   * @param {number} nbytes - max bytes to wait for
   * @param {Object?} cancelToken - optional cancellation token
   */
  buffer(nbytes, cancelToken) {
    return new Promise((resolve, reject) => {
      if (!this.loaded || this.buffering || this.seeking) {
        throw new Error('invalid state');
      } else if (nbytes !== (nbytes | 0) || nbytes < 0) {
        throw new Error('invalid input');
      }
      const end = this._clampToLength(this.offset + nbytes);
      const readable = end - this.offset;

      let canceled = false;
      if (cancelToken) {
        cancelToken.cancel = (err) => {};
      }

      if (this.bytesAvailable(readable) >= readable) {
        // Requested data is immediately available.
        resolve();
      } else {
        this.buffering = true;

        let subCancelToken = {};
        if (cancelToken) {
          cancelToken.cancel = (err) => {
            canceled = true;
            subCancelToken.cancel(err);

            this.buffering = false;
            reject(err);
          };
        }
        // If we don't already have a backend open, start downloading.
        this._openBackend(subCancelToken).then((backend) => {
          if (backend) {
            return backend.bufferToOffset(end, subCancelToken).then(() => {
              // We might have to roll over to another download,
              // so loop back around!
              this.buffering = false;
              return this.buffer(nbytes, subCancelToken);
            });
          } else {
            // No more data to read.
            return Promise.resolve();
          }
        }).then(() => {
          this.buffering = false;
          if (cancelToken) {
            cancelToken.cancel = (err) => {};
          }
          resolve();
        }).catch((err) => {
          if (!canceled) {
            this.buffering = false;
            reject(err);
          }
        })
      }
    });
  }

  /**
   * Number of bytes available to read immediately from the current offset.
   * This is the max number of bytes that can be returned from a read() call.
   * @returns {boolean}
   */
  bytesAvailable(max=Infinity) {
    return this._cache.bytesReadable(max);
  }

  /**
   * Abort any currently running downloads.
   */
  abort() {
    if (this._backend) {
      this._backend.abort();
      this._backend = null;
    }
  }

  /**
   * Return an array of byte ranges that are buffered.
   * Each range is a two-element array of start and end.
   * @returns {Array<Array<number>>}
   */
  getBufferedRanges() {
    return this._cache.ranges();
  }

  // ------
  // private methods
  // ------

  _clampToLength(offset) {
    if (this.length < 0) {
      return offset;
    } else {
      return Math.min(this.length, offset);
    }
  }
}

module.exports = StreamFile;
