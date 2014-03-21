/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
"use strict";

/**
 * This file tests the DirectoryProvider singleton in the DirectoryLinksProvider.jsm module.
 */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/DirectoryLinksProvider.jsm");
Cu.import("resource://gre/modules/Promise.jsm");

const console = Cc["@mozilla.org/consoleservice;1"].
  getService(Components.interfaces.nsIConsoleService);

const kTestSource = 'data:application/json,{"en-US": [{"url":"http://example.com","title":"TestSource"}]}'

function isIdentical(actual, expected) {
  if (expected == null) {
    do_check_eq(actual, expected);
  }
  else if (typeof expected == "object") {
    // Make sure all the keys match up
    do_check_eq(Object.keys(actual).sort() + "", Object.keys(expected).sort());

    // Recursively check each value individually
    Object.keys(expected).forEach(key => {
      isIdentical(actual[key], expected[key]);
    });
  }
  else {
    do_check_eq(actual, expected);
  }
}

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

  let provider = DirectoryProvider;
  provider.init();
  provider.addObserver(testObserver);
  do_check_eq(provider._observers.length, 1);
  Services.prefs.setCharPref(provider._prefs['tilesURL'], kTestSource);

  yield deferred.promise;
  provider._removeObservers();
  do_check_eq(provider._observers.length, 0);

  provider.reset();
  Services.prefs.clearUserPref(provider._prefs['tilesURL']);
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

  let provider = DirectoryProvider;
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

  provider.reset();
  Services.prefs.clearUserPref('general.useragent.locale')
  Services.prefs.clearUserPref(provider._prefs['tilesURL']);
});

add_task(function test_DirectoryProvider__prefObserver_url() {
  let provider = DirectoryProvider;
  Services.prefs.setCharPref('general.useragent.locale', 'en-US');
  Services.prefs.setCharPref(provider._prefs['tilesURL'], kTestSource);

  // set up the observer
  provider.init();
  do_check_eq(provider._tilesURL, kTestSource);

  let links = yield fetchData(provider);
  do_check_eq(links.length, 1);
  do_check_eq(links[0].title, "TestSource");

  // tests these 2 things:
  // 1. observer trigger on pref change
  // 2. invalid source url
  let exampleUrl = 'http://example.com/bad';
  Services.prefs.setCharPref(provider._prefs['tilesURL'], exampleUrl);

  do_check_eq(provider._tilesURL, exampleUrl);

  let newLinks = yield fetchData(provider);
  isIdentical(newLinks, []);

  provider.reset();
  Services.prefs.clearUserPref('general.useragent.locale')
  Services.prefs.clearUserPref(provider._prefs['tilesURL']);
});

add_task(function test_DirectoryProvider_getLinks_noLocaleData() {
  let provider = DirectoryProvider;
  Services.prefs.setCharPref('general.useragent.locale', 'cn-ZH');
  let dataURI = 'data:application/json,{"en-US":[{"url":"http://example.com","title":"example"}]}';
  Services.prefs.setCharPref(provider._prefs['tilesURL'], dataURI);

  let links = yield fetchData(provider);
  do_check_eq(links.length, 0);
  provider.reset();
  Services.prefs.clearUserPref('general.useragent.locale')
  Services.prefs.clearUserPref(provider._prefs['tilesURL']);
});
