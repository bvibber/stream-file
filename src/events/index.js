"use strict"

// just the bits we need
class TinyEvents {
  constructor() {
    this._e = {};
  }

  on(name, handler) {
    (this._e[name] || (this._e[name] = [])).push(handler);
  }

  off(name, handler) {
    const l = (this._e[name] || []);
    const i = l.indexOf(handler);
    if (handler >= 0) {
      l.splice(i, 1);
    }
  }

  emit(name, arg) {
    (this._e[name] || []).slice().forEach((f) => f(arg));
  }
}

module.exports = TinyEvents;
