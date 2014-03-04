/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
"use strict";

/**
 * This file tests the DirectoryTiles singleton in the NewTabUtils.jsm module.
 */

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/NewTabUtils.jsm");
Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");

const console = Cc["@mozilla.org/consoleservice;1"].
  getService(Components.interfaces.nsIConsoleService);

const kDefaultTileSource = "chrome://global/content/directoryTiles.json";

function run_test() {
  run_next_test();
}

add_task(function test_DirectoryTiles__tilesUrl() {
  let provider = NewTabUtils._providers['directoryTiles'];  
  let exampleUrl = 'http://example.com';
  // tilesUrl is obtained from prefs
  Services.prefs.setCharPref(provider._prefs['tilesUrl'], exampleUrl);

  do_check_eq(provider._tilesUrl, exampleUrl);
  provider.clear();
});

add_task(function test_DirectoryTiles_getLinks() {
  let provider = NewTabUtils._providers['directoryTiles'];  
  Services.prefs.setCharPref(provider._prefs['tilesUrl'], kDefaultTileSource);
  
  let links;
  let deferred = Promise.defer();
  provider.getLinks(function(linkData){
    links = linkData;
    deferred.resolve();
  });

  yield deferred.promise;
  do_check_true(links.length > 0);
});
