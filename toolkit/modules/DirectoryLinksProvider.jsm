/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["DirectoryProvider"];

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
  "resource://gre/modules/NetUtil.jsm");

/**
 * Gets the currently selected locale for display.
 * @return  the selected locale or "en-US" if none is selected
 */
function getLocale() {
  let matchOS;
  try {
    matchOS = Services.prefs.getBoolPref(PREF_MATCH_OS_LOCALE);
  }
  catch (e) {}

  if (matchOS) {
    return Services.locale.getLocaleComponentForUserAgent();
  }

  try {
    let locale = Services.prefs.getComplexValue(PREF_SELECTED_LOCALE,
                                                Ci.nsIPrefLocalizedString);
    if (locale) {
      return locale.data;
    }
  }
  catch (e) {}

  try {
    return Services.prefs.getCharPref(PREF_SELECTED_LOCALE);
  }
  catch (e) {}

  return "en-US";
}

// The preference that tells whether to match the OS locale
const PREF_MATCH_OS_LOCALE = "intl.locale.matchOS";

// The preference that tells what locale the user selected
const PREF_SELECTED_LOCALE = "general.useragent.locale";

// The preference that tells where to obtain directory tiles
const PREF_DIRECTORY_SOURCE = "browser.newtabpage.directorySource";

// The threshold when a Places link becomes a history tile and pushes out a
// directory tile.
const DIRECTORY_FRECENCY = 1000;

/**
 * Singleton that serves as the provider of directory tiles.
 * Directory Tiles are a hard-coded set of links shown if a user's tile
 * inventory is empty.
 */
let DirectoryProvider = {

  __tilesURL: null,

  _observers: [],

  get _prefs() Object.freeze({
    tilesURL: PREF_DIRECTORY_SOURCE,
    matchOSLocale: PREF_MATCH_OS_LOCALE,
    prefSelectedLocale: PREF_SELECTED_LOCALE,
  }),

  get _tilesURL() {
    if (!this.__tilesURL) {
      try {
        this.__tilesURL = Services.prefs.getCharPref(this._prefs["tilesURL"]);
      }
      catch (e) {
        Cu.reportError("Error fetching directory tiles url from prefs: " + e);
      }
    }
    return this.__tilesURL;
  },

  observe: function DirectoryProvider_observe(aSubject, aTopic, aData) {
    if (aTopic == "nsPref:changed") {
      if (aData == this._prefs["tilesURL"]) {
        delete this.__tilesURL;
      }
      this._callObservers("onManyLinksChanged");
    }
  },

  _addPrefsObserver: function DirectoryProvider_addObserver() {
    for (let pref in this._prefs) {
      let prefName = this._prefs[pref];
      Services.prefs.addObserver(prefName, this, false);
    }
  },

  _removePrefsObserver: function DirectoryProvider_removeObserver() {
    for (let pref in this._prefs) {
      let prefName = this._prefs[pref];
      Services.prefs.removeObserver(prefName, this);
    }
  },

  /**
   * Fetches the current set of directory links.
   * @param aCallback a callback that is provided a set of links.
   */
  _fetchLinks: function DirectoryProvider_fetchLinks(aCallback) {
    try {
      NetUtil.asyncFetch(this._tilesURL, (aInputStream, aResult, aRequest) => {
        let output;
        if (Components.isSuccessCode(aResult)) {
          try {
            let json = NetUtil.readInputStreamToString(aInputStream,
                                                       aInputStream.available(),
                                                       {charset: "UTF-8"});
            let locale = getLocale();
            output = JSON.parse(json)[locale];
          }
          catch (e) {
            Cu.reportError(e);
          }
        }
        else {
          Cu.reportError(new Error("the fetch of " + this._tilesURL + "was unsuccessful"));
        }
        aCallback(output || []);
      });
    }
    catch (e) {
      Cu.reportError(e);
      aCallback([]);
    }
  },

  /**
   * Gets the current set of directory links.
   * @param aCallback The function that the array of links is passed to.
   */
  getLinks: function DirectoryProvider_getLinks(aCallback) {
    this._fetchLinks(rawLinks => {
      // Set a rank to the tiles so that when DIRECTORY_FRECENCY is
      // reached by a history tile, the last tile is pushed out
      aCallback(rawLinks.map((link, position) => {
        link.frecency = DIRECTORY_FRECENCY;
        link.lastVisitDate = rawLinks.length - position;
        return link;
      }));
    });
  },

  init: function DirectoryProvider_init() {
    this._addPrefsObserver();
  },

  /**
   * Return the object to its pre-init state
   */
  reset: function DirectoryProvider_reset() {
    delete this.__tilesURL;
    this._removePrefsObserver();
    this._removeObservers();
  },

  addObserver: function DirectoryProvider_addObserver(aObserver) {
    this._observers.push(aObserver);
  },

  _callObservers: function DirectoryProvider__callObservers(aMethodName, aArg) {
    for (let obs of this._observers) {
      if (typeof(obs[aMethodName]) == "function") {
        try {
          obs[aMethodName](this, aArg);
        } catch (err) {
          Cu.reportError(err);
        }
      }
    }
  },

  _removeObservers: function() {
    while (this._observers.length) {
      this._observers.pop();
    }
  }
};
