"use strict";

const TinyEvents = require('../events');

/**
 * Extract the file's total length from the XHR returned headers.
 * @returns {number} - byte length or -1
 * @access private
 */
function getXHRLength(xhr) {
  if (xhr.status == 206) {
    return getXHRRangeTotal(xhr);
  } else {
    const contentLength = xhr.getResponseHeader('Content-Length');
    if (contentLength === null || contentLength === '') {
      // Unknown file length... maybe streaming live?
      return -1;
    } else {
      return parseInt(contentLength, 10);
    }
  }
}

/**
 * Extract the range chunk info from the XHR returned headers.
 * @returns {Array} - byte length or -1
 * @access private
 */
function getXHRRangeMatches(xhr) {
  // Note Content-Range must be whitelisted for CORS requests
  const contentRange = xhr.getResponseHeader('Content-Range');
  return contentRange && contentRange.match(/^bytes (\d+)-(\d+)\/(\d+)/);
}

/**
 * Extract the chunk start position from the XHR returned headers.
 * @returns {number} - byte position or 0
 * @access private
 */
function getXHRRangeStart(xhr) {
  const matches = getXHRRangeMatches(xhr);
  if (matches) {
    return parseInt(matches[1], 10);
  } else {
    return 0;
  }
}

/**
 * Extract the file's total length from the XHR returned headers.
 * @returns {number} - byte length or -1
 * @access private
 */
function getXHRRangeTotal(xhr) {
  const matches = getXHRRangeMatches(xhr);
  if (matches) {
    return parseInt(matches[3], 10);
  } else {
    return -1;
  }
}

/**
 * Record the HTTP headers from the initial request, in case some are useful.
 * @returns {Object} map of headers
 * @access private
 */
function getXHRHeaders(xhr) {
  const headers = {};
  const headerLines = xhr.getAllResponseHeaders().split(/\r?\n/);
  headerLines.forEach(function(line) {
    const bits = line.split(/:\s*/, 2);
    if (bits.length > 1) {
      headers[bits[0].toLowerCase()] = bits[1];
    }
  });
  return headers;
}


/**
 * Represents a single HTTP request pass through part of a URL.
 *
 * Subclasses handle details of chunking/strings/streams and provide
 * a unified internal API.
 *
 * Events sent:
 * - 'open' - called when file metadata ready
 * - 'buffer' - passes a BufferSegment in with some new data
 * - 'done' - called at end of file
 * - 'error' - called in case of error
 * - 'cachever' - triggered when old Safari caching bug found
 */
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
    this.xhr = new XMLHttpRequest();
  }

  load() {
    return new Promise((resolve, reject) => {
      let oncomplete = null;
      this._onAbort = (err) => {
        oncomplete();
        reject(err);
      };
      const checkOpen = () => {
        // There doesn't seem to be a good match for readyState 2 on the XHR2 events model.
        if (this.xhr.readyState == 2) {
          if (this.xhr.status == 206) {
            // Partial content -- we are streamable
            const foundPosition = getXHRRangeStart(this.xhr);
            if (this.offset != foundPosition) {
              //
              // Safari sometimes messes up and gives us the wrong chunk.
              // Seems to be a general problem with Safari and cached XHR ranges.
              //
              // Interestingly, it allows you to request _later_ ranges successfully,
              // but when requesting _earlier_ ranges it returns the latest one retrieved.
              // So we only need to update the cache-buster when we rewind and actually
              // get an incorrect range.
              //
              // https://bugs.webkit.org/show_bug.cgi?id=82672
              //
              console.log('Expected start at ' + this.offset + ' but got ' + foundPosition +
                '; working around Safari range caching bug: https://bugs.webkit.org/show_bug.cgi?id=82672');
              this.cachever++;
              this.emit('cachever');
              this.abort();
              oncomplete();
              this.load().then(resolve).catch(reject);
              return;
            }
            this.seekable = true;
          }
          if (this.xhr.status >= 200 && this.xhr.status < 300) {
            this.length = getXHRLength(this.xhr);
            this.headers = getXHRHeaders(this.xhr);
            this.onXHRStart();
          } else {
            oncomplete();
            reject(new Error('HTTP error ' + this.xhr.status))
          }
        }
      };
      const checkError = () => {
        oncomplete();
        reject(new Error('network error'));
      };
      const checkBackendOpen = () => {
        oncomplete();
        resolve();
      };
      oncomplete = () => {
        this.xhr.removeEventListener('readystatechange', checkOpen);
        this.xhr.removeEventListener('error', checkError);
        this.off('open', checkBackendOpen);
        this._onAbort = null;
      };

      this.initXHR();

      // Events for the open promise
      this.xhr.addEventListener('readystatechange', checkOpen);
      this.xhr.addEventListener('error', checkError);
      this.on('open', checkBackendOpen);

      this.xhr.send();
    });
  }

  /**
   * Wait until we download up to the given offset, reach eof, or error out.
   * Actual data will be returned via 'buffer' events in the meantime.
   *
   * Note that MSStream backend will need this to be called explicitly,
   * while the other backends download progressively even without a call.
   */
  bufferToOffset(end) {
    return Promise.reject(new Error('abstract'));
  }

  abort() {
    this.xhr.abort();

    if (this._onAbort) {
      const onAbort = this._onAbort;
      this._onAbort = null;

      let err = new Error('Aborted');
      err.name = 'AbortError';

      onAbort(err);
    }
  }

  // ---------------
  // Private methods
  // ---------------

  initXHR() {
    let getUrl = this.url;
    if (this.cachever) {
      //
      // Safari sometimes messes up and gives us the wrong chunk.
      // Seems to be a general problem with Safari and cached XHR ranges.
      //
      // Interestingly, it allows you to request _later_ ranges successfully,
      // but when requesting _earlier_ ranges it returns the latest one retrieved.
      // So we only need to update the cache-buster when we rewind.
      //
      // https://bugs.webkit.org/show_bug.cgi?id=82672
      //
      getUrl += '?buggy_cachever=' + this.cachever;
    }

    this.xhr.open("GET", getUrl);

    let range = null;
    if (this.offset || this.length) {
      range = 'bytes=' + this.offset + '-';
    }
    if (this.length) {
      range += (this.offset + this.length) - 1;
    }
    if (range !== null) {
      this.xhr.setRequestHeader('Range', range);
    }
  }

  onXHRStart() {
    throw new Error('abstract');
  }
}

module.exports = Backend;
