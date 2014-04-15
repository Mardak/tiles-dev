/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["DirectoryLinksProvider"];

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/osfile.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
  "resource://gre/modules/NetUtil.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Promise",
  "resource://gre/modules/Promise.jsm");

const XMLHttpRequest = Components.Constructor("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");

// The filename where directory links are stored locally
const DIRECTORY_LINKS_FILE = "directoryLinks.json";

XPCOMUtils.defineLazyGetter(this, "gTextDecoder", () => {
  return new TextDecoder();
});

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

// The preference that tells where to obtain directory links
const PREF_DIRECTORY_SOURCE = "browser.newtabpage.directorySource";

// The frecency of a directory link
const DIRECTORY_FRECENCY = 1000;

const LINK_TYPES = Object.freeze([
  "sponsored",
  "affiliate",
  "organic",
]);

// The filename where directory links are stored locally
const DIRECTORY_LINKS_FILE = "directoryLinks.json";

/**
 * Singleton that serves as the provider of directory links.
 * Directory links are a hard-coded set of links shown if a user's link
 * inventory is empty.
 */
let DirectoryLinksProvider = {

  __linksURL: null,

  _observers: [],

  get _prefs() Object.freeze({
    linksURL: PREF_DIRECTORY_SOURCE,
    matchOSLocale: PREF_MATCH_OS_LOCALE,
    prefSelectedLocale: PREF_SELECTED_LOCALE,
  }),

  get _linksURL() {
    if (!this.__linksURL) {
      try {
        this.__linksURL = Services.prefs.getCharPref(this._prefs["linksURL"]);
      }
      catch (e) {
        Cu.reportError("Error fetching directory links url from prefs: " + e);
      }
    }
    return this.__linksURL;
  },

  get linkTypes() LINK_TYPES,

  observe: function DirectoryLinksProvider_observe(aSubject, aTopic, aData) {
    if (aTopic == "nsPref:changed") {
      if (aData == this._prefs["linksURL"]) {
        delete this.__linksURL;
      }
      this._callObservers("onManyLinksChanged");
    }
  },

  _addPrefsObserver: function DirectoryLinksProvider_addObserver() {
    for (let pref in this._prefs) {
      let prefName = this._prefs[pref];
      Services.prefs.addObserver(prefName, this, false);
    }
  },

  _removePrefsObserver: function DirectoryLinksProvider_removeObserver() {
    for (let pref in this._prefs) {
      let prefName = this._prefs[pref];
      Services.prefs.removeObserver(prefName, this);
    }
  },

  /**
   * Fetches the current set of directory links.
   * @param aCallback a callback that is provided a set of links.
   */
  _fetchLinks: function DirectoryLinksProvider_fetchLinks(aCallback) {
    try {
      NetUtil.asyncFetch(this._linksURL, (aInputStream, aResult, aRequest) => {
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
          Cu.reportError(new Error("the fetch of " + this._linksURL + "was unsuccessful"));
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
   * fetches the current set of directory links from a url and stores in a cache file
   * @return promise resolved upon file write completion
   */
  _requestRemoteDirectoryContent: function(url) {
    let deferred = Promise.defer();
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.overrideMimeType("application/json");

    let self = this;
    xmlHttp.onload = function(aResponse) {
      Task.spawn(function() {
        try {
          let directoryLinksFilePath = OS.Path.join(OS.Constants.Path.profileDir, DIRECTORY_LINKS_FILE);
          yield OS.File.writeAtomic(directoryLinksFilePath, this.responseText);
          deferred.resolve();
        } catch(e) {
          Cu.reportError("Error writing server response to " + self._remoteTilesURL + ": " + e);
          deferred.reject("Error writing server response");
        }
      }.bind(this));
    };

    xmlHttp.onerror = function(e) {
      Cu.reportError("Error " + e.target.status + " occurred while requesting directory content.");
      deferred.reject("Error downloading directory request");
    };

    xmlHttp.open('GET', url);
    xmlHttp.setRequestHeader("Connection", "close");
    xmlHttp.send();
    return deferred.promise;
  },

  /**
   * Reads directory links file and parses its content
   * @param retruns a promise resolved to valid json or []
   */
  _readDirectoryLinksFile: function DirectoryLinksProvider_readDirectoryLinksFile(aCallback) {
    let directoryLinksFilePath = OS.Path.join(OS.Constants.Path.profileDir, DIRECTORY_LINKS_FILE);
    try {
      OS.File.read(directoryLinksFilePath).then(binaryData => {
        let output;
        try {
          let locale = getLocale();
          let json = gTextDecoder.decode(binaryData);
          output = JSON.parse(json)[locale];
        }
        catch (e) {
          Cu.reportError(e);
        }
        aCallback(output || []);
      },
      error => {
        Cu.reportError(error);
        aCallback([]);
      });
    }
    catch (e) {
      Cu.reportError(new Error("failed to read " + directoryLinksFile));
      aCallback([]);
    }
  },

  /**
   * Gets the current set of directory links.
   * @param aCallback The function that the array of links is passed to.
   */
  getLinks: function DirectoryLinksProvider_getLinks(aCallback) {
    this._readDirectoryLinksFile(rawLinks => {
      // all directory links have a frecency of DIRECTORY_FRECENCY
      aCallback(rawLinks.map((link, position) => {
        link.frecency = DIRECTORY_FRECENCY;
        link.lastVisitDate = rawLinks.length - position;
        return link;
      }));
    });
  },

  init: function DirectoryLinksProvider_init() {
    this._addPrefsObserver();
  },

  /**
   * Return the object to its pre-init state
   */
  reset: function DirectoryLinksProvider_reset() {
    delete this.__linksURL;
    this._removePrefsObserver();
    this._removeObservers();
  },

  addObserver: function DirectoryLinksProvider_addObserver(aObserver) {
    this._observers.push(aObserver);
  },

  _callObservers: function DirectoryLinksProvider__callObservers(aMethodName, aArg) {
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
