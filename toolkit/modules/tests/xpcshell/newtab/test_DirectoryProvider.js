/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
"use strict";

/**
 * This file tests the DirectoryProvider singleton in the NewTabUtils.jsm module.
 */

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/NewTabUtils.jsm");
Cu.import("resource://gre/modules/Promise.jsm");

const console = Cc["@mozilla.org/consoleservice;1"].
  getService(Components.interfaces.nsIConsoleService);

const kDefaultTileSource = "chrome://global/content/directoryTiles.json";

function fetchData(provider) {
  let deferred = Promise.defer();

  provider.getLinks(linkData => {
    deferred.resolve(linkData);
  });
  return deferred.promise;
}

function run_test() {
  run_next_test();
}

add_task(function test_DirectoryProvider__linkObservers() {
  let deferred = Promise.defer();
  let testObserver = {
    onManyLinksChanged: function() {
      deferred.resolve();
    }
  }

  let provider = NewTabUtils._providers.directory;
  provider.init();
  provider.addObserver(testObserver);
  do_check_eq(provider._observers.length, 1);
  Services.prefs.setCharPref(provider._prefs['tilesURL'], kDefaultTileSource);

  yield deferred.promise;
  provider._removeObservers();
  do_check_eq(provider._observers.length, 0);

  provider.reset();
});

add_task(function test_DirectoryProvider__tilesURL() {
  let provider = NewTabUtils._providers.directory;
  let exampleUrl = 'http://example.com';
  // tilesURL is obtained from prefs
  Services.prefs.setCharPref(provider._prefs['tilesURL'], exampleUrl);

  do_check_eq(provider._tilesURL, exampleUrl);

  provider.reset();
});

add_task(function test_DirectoryProvider__tilesURL_data_copy() {
  let dataURI = 'data:application/json,{"en-US":[{"url":"http://example.com","title":"example"}]}';

  let provider = NewTabUtils._providers.directory;
  Services.prefs.setCharPref(provider._prefs['tilesURL'], dataURI);
  do_check_eq(provider._tilesURL, dataURI);

  let links;

  links = yield fetchData(provider);
  do_check_eq(links.length, 1);

  links.push([{"url":"http://example2.com","title":"example 2"}]);

  links = yield fetchData(provider);

  // results should be unchanged
  do_check_true(links.length == 1);

  provider.reset();
});

add_task(function test_DirectoryProvider__tilesURL_locale() {
  let data = {
    "en-US": [{"url":"http://example.com","title":"US"}],
    "cn-ZH": [
              {"url":"http://example.net","title":"CN"},
              {"url":"http://example.net/2","title":"CN2"}
    ],
  };
  let dataURI = 'data:application/json,' + JSON.stringify(data);

  let provider = NewTabUtils._providers.directory;
  Services.prefs.setCharPref(provider._prefs['tilesURL'], dataURI);
  Services.prefs.setCharPref('general.useragent.locale', 'en-US');

  // set up the observer
  provider.init();
  do_check_eq(provider._tilesURL, dataURI);

  let links;

  links = yield fetchData(provider);
  do_check_eq(links.length, 1)

  Services.prefs.setCharPref('general.useragent.locale', 'cn-ZH');

  links = yield fetchData(provider);
  do_check_eq(links.length, 2)

  Services.prefs.setCharPref('general.useragent.locale', 'en-US');
  provider.reset();
});

add_task(function test_DirectoryProvider__prefObserver_url() {
  let provider = NewTabUtils._providers.directory;
  Services.prefs.setCharPref(provider._prefs['tilesURL'], kDefaultTileSource);

  // set up the observer
  provider.init();
  do_check_eq(provider._tilesURL, kDefaultTileSource);

  let links = yield fetchData(provider);
  do_check_true(links.length > 0);

  let exampleUrl = 'http://example.com';
  Services.prefs.setCharPref(provider._prefs['tilesURL'], exampleUrl);

  do_check_eq(provider._tilesURL, exampleUrl);

  let newLinks = yield fetchData(provider);
  isIdentical(newLinks, []);

  provider.reset();
});

add_task(function test_DirectoryProvider_getLinks() {
  let provider = NewTabUtils._providers.directory;
  Services.prefs.setCharPref(provider._prefs['tilesURL'], kDefaultTileSource);

  let links = yield fetchData(provider);
  do_check_true(links.length > 0);
  provider.reset();
});

add_task(function test_DirectoryProvider_getLinks_invalid() {
  let provider = NewTabUtils._providers.directory;
  Services.prefs.setCharPref(provider._prefs['tilesURL'], "http://example.com");

  let links = yield fetchData(provider);
  do_check_eq(links.length, 0);
  provider.reset();
});

add_task(function test_DirectoryProvider_getLinks_noLocaleData() {
  let provider = NewTabUtils._providers.directory;
  Services.prefs.setCharPref('general.useragent.locale', 'cn-ZH');
  let dataURI = 'data:application/json,{"en-US":[{"url":"http://example.com","title":"example"}]}';
  Services.prefs.setCharPref(provider._prefs['tilesURL'], dataURI);

  let links = yield fetchData(provider);
  do_check_eq(links.length, 0);
  provider.reset();
});
