const Backend = require('./backend');

const context = this;

/**
 * Extract the file's total length from the fetch returned headers.
 * @returns {number} - byte length or -1
 * @access private
 */
function getFetchLength(response) {
    if (response.status == 206) {
      return getFetchRangeTotal(response);
    } else {
      const contentLength = response.headers.get('Content-Length');
      if (contentLength === null || contentLength === '') {
        // Unknown file length... maybe streaming live?
        return -1;
      } else {
        return parseInt(contentLength, 10);
      }
    }
  }
  
  /**
   * Extract the range chunk info from the fetch returned headers.
   * @returns {Array} - byte length or -1
   * @access private
   */
  function getFetchRangeMatches(response) {
    // Note Content-Range must be whitelisted for CORS requests
    const contentRange = response.headers.get('Content-Range');
    return contentRange && contentRange.match(/^bytes (\d+)-(\d+)\/(\d+)/);
  }
  
  /**
   * Extract the chunk start position from the XHR returned headers.
   * @returns {number} - byte position or 0
   * @access private
   */
  function getFetchRangeStart(response) {
    const matches = getFetchRangeMatches(response);
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
  function getFetchRangeTotal(response) {
    const matches = getFetchRangeMatches(response);
    if (matches) {
      return parseInt(matches[3], 10);
    } else {
      return -1;
    }
  }
  

class FetchBackend extends Backend {

    constructor(options) {
        super(options);    
    }

    load() { 
            
        const initOptions = { headers: {} }
        const range = this._httpRangeValue();        
        if (range) {
            initOptions.headers['Range'] = range
        }
        const req = new Request(this.url, initOptions);

        return new Promise((resolve, reject) => {

            const abortController = new AbortController();
            const signal = abortController.signal;

            let oncomplete = null;
            this._onAbort = (err) => {
                abortController.abort();
                oncomplete();
                reject(err);
            };

            const checkError = (err) => {
                this.onFetchError(err);
                oncomplete();
                reject(err);
              };
            const checkBackendOpen = () => {
                oncomplete();
                resolve();
            };
                        
            fetch(req, {signal}).then(response => {
                if (response.status == 206) {
                    // Partial content -- we are streamable
                    const foundPosition = getFetchRangeStart(response);
                    if (this.offset != foundPosition) {
                        checkError(new Error("Invalid Offset"));
                    }
                    this.seekable = true;
                }
                if (response.status >= 200 && response.status < 300) {
                    this.length = getFetchLength(response);
                    this.headers = response.headers;
                    this.emit('open');
                    // read the body
                    response.arrayBuffer().then(buffer => {
                        this.bytesRead += buffer.byteLength;
                        this.emit('buffer', buffer);                        
                    }).
                    catch(checkError).
                    finally(() => {
                        this.onFetchLoad();
                        checkBackendOpen();
                    });                            
                } else {                
                    checkError(new Error('HTTP error ' + response.status))
                }
            }).catch(checkError);

            oncomplete = () => {                
                this._onAbort = null;
            };
        
        });
    }
        
    onFetchError(err) {
        this.emit('error', err);
    }
    
    onFetchLoad() {
        this.eof = true;
        this.emit('done');
    }    
}

FetchBackend.supported = function() {    
    try {
        return typeof(globalThis['fetch']) == 'function';
    } catch(e) {
        return false;
    }
};

module.exports = FetchBackend;