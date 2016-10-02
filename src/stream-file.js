"use strict";

const EventEmitter = require('./events');
const CachePool = require('./cache');
const Backend = require('./backend');

/**
 * @typedef {Object} StreamFileOptions
 * @property {string} url - the URL to fetch
 * @property {number} bufferSize - internal buffer size
 * @property {number} chunkSize - max size of each chunked HTTP request
 * @property {number} cacheSize - max amount of data to keep buffered in memory
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
    cacheSize=32 * 1024 * 1024,
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

    this._bus = new EventEmitter();
    this._bus.on('buffer', (buffer) => {
      this._cache.write(buffer);
    });
    this._bus.on('done', () => {
      if (this.length === -1) {
        // save length on those final thingies
        this.length = this._backend.offset + this._backend.bytesRead;
      }
      this._backend = null;
    });
    this._bus.on('error', () => {
      this._backend = null;
    });
    this._bus.on('cachever', () => {
      this._cachever++;
    });
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
      this._openBackend(cancelToken).then(() => {
        // Save metadata from the first set
        this.seekable = this._backend.seekable;
        this.headers = this._backend.headers;
        this.length = this._backend.length;
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
   * If there is not already a download backend in place, create one
   * and start it loading before resolving.
   * @returns {Promise}
   */
  _openBackend(cancelToken) {
    return new Promise((resolve, reject) => {
      if (this._backend) {
        resolve();
      } else {
        const cache = this._cache;
        const max = this._chunkSize;

        // Seek forward to the next unread point, up to chunk size
        const readable = cache.bytesReadable(max);
        const readTail = cache.readOffset + readable;
        cache.seekWrite(readTail);

        // Do we have space to write within that chunk?
        const writable = cache.bytesWritable(max);
        if (writable == 0) {
          // Nothing to read/write within the current readahead area.
          resolve();
        } else {
          this._backend = new Backend({
            bus: this._bus,
            url: this.url,
            offset: this._cache.writeOffset,
            length: writable,
            cachever: this._cachever
          });
          this._backend.load(cancelToken).then(resolve).catch(reject);
        }
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
      } else if (this.length >= 0 && offset >= this.length) {
        throw new Error('seek past end of file');
      } else if (!this.seekable) {
        throw new Error('seek on non-seekable stream');
      } else {
        if (this._backend) {
          // @todo if a short seek forward, just keep reading?
          this.abort();
        }
        this._cache.seekRead(offset);
        this.seeking = true;
        this._openBackend(cancelToken).then(() => {
          this.seeking = false;
          resolve();
        }).catch((err) => {
          this.seeking = false;
          reject(err);
        });
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
    return this._cache.read(nbytes);
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

      if (this.bytesAvailable(readable) >= readable) {
        // Requested data is immediately available.
        resolve();
      } else {
        this.buffering = true;

        // If we don't already have a backend open, start downloading.
        this._openBackend(cancelToken).then(() => {
          const remainder = end - this._cache.writeOffset;
          if (remainder > 0) {
            return this._backend.buffer(remainder, cancelToken);
          } else {
            return Promise.resolve();
          }
        }).then(() => {
          this.buffering = false;
          resolve();
        }).catch((err) => {
          this.buffering = false;
          reject(err);
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
