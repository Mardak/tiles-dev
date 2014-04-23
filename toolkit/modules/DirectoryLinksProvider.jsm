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
Cu.import("resource://gre/modules/osfile.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
  "resource://gre/modules/NetUtil.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Promise",
  "resource://gre/modules/Promise.jsm");

// The filename where directory links are stored locally
const DIRECTORY_LINKS_FILE = "directoryLinks.json";

// The preference that tells whether to match the OS locale
const PREF_MATCH_OS_LOCALE = "intl.locale.matchOS";

// The preference that tells what locale the user selected
const PREF_SELECTED_LOCALE = "general.useragent.locale";

// The preference that tells where to obtain directory links
const PREF_DIRECTORY_SOURCE = "browser.newtabpage.directory.source";

// last directory download time in seconds
const PREF_DIRECTORY_LASTDOWNLOAD = "browser.newtabpage.directory.lastDownload";

// The frecency of a directory link
const DIRECTORY_FRECENCY = 1000;

const LINK_TYPES = Object.freeze([
  "sponsored",
  "affiliate",
  "organic",
]);

/**
 * Singleton that serves as the provider of directory links.
 * Directory links are a hard-coded set of links shown if a user's link
 * inventory is empty.
 */
let DirectoryLinksProvider = {

  __linksURL: null,

  _observers: [],

  // links download promise, resolved upon download completion
  _downloadPromise: null,

  // download default interval is 24 hours
  _downloadInterval: 86400,

  get _observedPrefs() Object.freeze({
    linksURL: PREF_DIRECTORY_SOURCE,
    matchOSLocale: PREF_MATCH_OS_LOCALE,
    prefSelectedLocale: PREF_SELECTED_LOCALE,
  }),

  get _linksURL() {
    if (!this.__linksURL) {
      try {
        this.__linksURL = Services.prefs.getCharPref(this._observedPrefs["linksURL"]);
      }
      catch (e) {
        Cu.reportError("Error fetching directory links url from prefs: " + e);
      }
    }
    return this.__linksURL;
  },

  /**
   * Gets the currently selected locale for display.
   * @return  the selected locale or "en-US" if none is selected
   */
  get locale() {
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
  },

  get linkTypes() LINK_TYPES,

  observe: function DirectoryLinksProvider_observe(aSubject, aTopic, aData) {
    if (aTopic == "nsPref:changed" && aData == this._observedPrefs["linksURL"]) {
        delete this.__linksURL;
    }
    // force directory download on changes to any of the observed prefs
    this._fetchDirectoryContent(true);
  },

  _addPrefsObserver: function DirectoryLinksProvider_addObserver() {
    for (let pref in this._observedPrefs) {
      let prefName = this._observedPrefs[pref];
      Services.prefs.addObserver(prefName, this, false);
    }
  },

  _removePrefsObserver: function DirectoryLinksProvider_removeObserver() {
    for (let pref in this._observedPrefs) {
      let prefName = this._observedPrefs[pref];
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
            let locale = this.locale;
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

  _fetchAndCacheLinks: function DirectoryLinksProvider_fetchAndCacheLinks(uri) {
    let deferred = Promise.defer();
    try {
      let channel = NetUtil.newChannel(uri);
      if (channel instanceof Ci.nsIHttpChannel) {
        channel = NetUtil.newChannel(uri + this.locale);
      }
      NetUtil.asyncFetch(channel, (inputStream, result, request) => {
        if (Components.isSuccessCode(result)) {
          let json = "{}";
          if (!(channel instanceof Ci.nsIHttpChannel) || channel.responseStatus == 200) {
            json = NetUtil.readInputStreamToString(inputStream,
                                                   inputStream.available(),
                                                   {charset: "UTF-8"});
          }
          let directoryLinksFilePath = OS.Path.join(OS.Constants.Path.profileDir, DIRECTORY_LINKS_FILE);
          OS.File.writeAtomic(directoryLinksFilePath, json, {tmpPath: directoryLinksFilePath + ".tmp"})
            .then(() => {
              deferred.resolve();
              this._callObservers("onManyLinksChanged");
            },
            () => {
              deferred.reject("Error writing uri data in profD.");
              this._callObservers("onDownloadFail");
            }
          );
        }
        else {
          deferred.reject("Fetching " + uri + " results in error code: " + result);
          this._callObservers("onDownloadFail");
        }
      });
    }
    catch (e) {
      deferred.reject("Error fetching " + uri);
      this._callObservers("onDownloadFail");
      Cu.reportError(e);
    }
    return deferred.promise;
  },

  /**
   * Downloads directory links if needed
   * @return promise resolved immediately if no download needed, or upon completion
   */
  _fetchDirectoryContent: function(forceDoanload=false) {
    if( this._downloadPromise != null) {
      // fetching links already - just return the promise
      return this._downloadPromise;
    }

    if (forceDoanload || this._needsDownload()) {
      this._downloadPromise = Promise.defer();
      this._fetchAndCacheLinks(this._linksURL).then(() => {
        // the new file was successfully downloaded and cached, so update a timestamp
        Services.prefs.setIntPref(PREF_DIRECTORY_LASTDOWNLOAD, Date.now() / 1000);
        this._downloadPromise.resolve();
        this._downloadPromise = null;
      },
      (error) => {
        this._downloadPromise.resolve();
        this._downloadPromise = null;
      });
      return this._downloadPromise.promise;
    }

    // download is not needed
    return Promise.resolve();
  },

  /**
   * @return true if download is needed, false otherwise
   */
  _needsDownload: function() {
    // fail if last download occured less then 24 hours ago
    let lastDownloaded = Services.prefs.getIntPref(PREF_DIRECTORY_LASTDOWNLOAD) * 1000;
    if ((Date.now() - lastDownloaded) > this._downloadInterval) {
      return true;
    }
    return false;
  },

  /**
   * Gets the current set of directory links.
   * @param aCallback The function that the array of links is passed to.
   */
  getLinks: function DirectoryLinksProvider_getLinks(aCallback) {
    this._fetchLinks(rawLinks => {
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
