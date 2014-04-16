/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
"use strict";

/**
 * This file tests the DirectoryLinksProvider singleton in the DirectoryLinksProvider.jsm module.
 */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/DirectoryLinksProvider.jsm");
Cu.import("resource://gre/modules/Promise.jsm");
Cu.import("resource://gre/modules/Http.jsm");
Cu.import("resource://testing-common/httpd.js");
Cu.import("resource://gre/modules/osfile.jsm")

do_get_profile();

const DIRECTORY_LINKS_FILE = "directoryLinks.json";
const DIRECTORY_FRECENCY = 1000;
const kTestSource = 'data:application/json,{"en-US": [{"url":"http://example.com","title":"TestSource"}]}';

// httpd settings
var server;
const kDefaultServerPort = 9000;
const kBaseUrl = "http://localhost:" + kDefaultServerPort;
const kExamplePath = "/exampleTest";
const kExampleSource = kBaseUrl + kExamplePath;

const kHttpHandlerData = {};
kHttpHandlerData[kExamplePath] = {"en-US": [{"url":"http://example.com","title":"TestSource"}]};

function getHttpHandler(path) {
  return function(aRequest, aResponse) {
    aResponse.setStatusLine(null, 200, "OK");
    aResponse.setHeader("Content-Type", "application/json");
    aResponse.write("" + JSON.stringify(kHttpHandlerData[path]));
  };
}

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

function readJsonFile(jsonFile = DIRECTORY_LINKS_FILE) {
  let decoder = new TextDecoder();
  let directoryLinksFilePath = OS.Path.join(OS.Constants.Path.profileDir, jsonFile);
  return OS.File.read(directoryLinksFilePath).then(array => {
    let json = decoder.decode(array);
    return JSON.parse(json);
  });
}

function cleanJsonFile(jsonFile = DIRECTORY_LINKS_FILE) {
  let directoryLinksFilePath = OS.Path.join(OS.Constants.Path.profileDir, jsonFile);
  return OS.File.remove(directoryLinksFilePath);
}

function run_test() {
  // Set up a mock HTTP server to serve a directory page
  server = new HttpServer();
  server.registerPathHandler(kExamplePath, getHttpHandler(kExamplePath));
  server.start(kDefaultServerPort);

  run_next_test();

  // Teardown.
  do_register_cleanup(function() {
    server.stop(function() { });
  });
}

add_task(function test_DirectoryLinksProvider_requestRemoteDirectoryContent() {
  yield cleanJsonFile();
  // this must trigger directory links json download and save it to cache file
  yield DirectoryLinksProvider._requestRemoteDirectoryContent(kExampleSource);
  let fileObject = yield readJsonFile();
  isIdentical(fileObject, kHttpHandlerData[kExamplePath]);
});

add_task(function test_DirectoryLinksProvider__linkObservers() {
  let deferred = Promise.defer();
  let testObserver = {
    onManyLinksChanged: function() {
      deferred.resolve();
    }
  }

  let provider = DirectoryLinksProvider;
  provider.init();
  provider.addObserver(testObserver);
  do_check_eq(provider._observers.length, 1);
  Services.prefs.setCharPref(provider._prefs['linksURL'], kTestSource);

  yield deferred.promise;
  provider._removeObservers();
  do_check_eq(provider._observers.length, 0);

  provider.reset();
  Services.prefs.clearUserPref(provider._prefs['linksURL']);
});

add_task(function test_DirectoryLinksProvider__linksURL_locale() {
  let data = {
    "en-US": [{url: "http://example.com", title: "US"}],
    "zh-CN": [
              {url: "http://example.net", title: "CN"},
              {url:"http://example.net/2", title: "CN2"}
    ],
  };
  let dataURI = 'data:application/json,' + JSON.stringify(data);

  let provider = DirectoryLinksProvider;
  Services.prefs.setCharPref(provider._prefs['linksURL'], dataURI);
  Services.prefs.setCharPref('general.useragent.locale', 'en-US');

  // set up the observer
  provider.init();
  do_check_eq(provider._linksURL, dataURI);

  let links;
  let expected_data;

  links = yield fetchData(provider);
  do_check_eq(links.length, 1);
  expected_data = [{url: "http://example.com", title: "US", frecency: DIRECTORY_FRECENCY, lastVisitDate: 1}];
  isIdentical(links, expected_data);

  Services.prefs.setCharPref('general.useragent.locale', 'zh-CN');

  links = yield fetchData(provider);
  do_check_eq(links.length, 2)
  expected_data = [
    {url: "http://example.net", title: "CN", frecency: DIRECTORY_FRECENCY, lastVisitDate: 2},
    {url: "http://example.net/2", title: "CN2", frecency: DIRECTORY_FRECENCY, lastVisitDate: 1}
  ];
  isIdentical(links, expected_data);

  provider.reset();
  Services.prefs.clearUserPref('general.useragent.locale');
  Services.prefs.clearUserPref(provider._prefs['linksURL']);
});

add_task(function test_DirectoryLinksProvider__prefObserver_url() {
  let provider = DirectoryLinksProvider;
  Services.prefs.setCharPref('general.useragent.locale', 'en-US');
  Services.prefs.setCharPref(provider._prefs['linksURL'], kTestSource);

  // set up the observer
  provider.init();
  do_check_eq(provider._linksURL, kTestSource);

  let links = yield fetchData(provider);
  do_check_eq(links.length, 1);
  let expectedData =  [{url: "http://example.com", title: "TestSource", frecency: DIRECTORY_FRECENCY, lastVisitDate: 1}];
  isIdentical(links, expectedData);

  // tests these 2 things:
  // 1. observer trigger on pref change
  // 2. invalid source url
  let exampleUrl = 'http://example.com/bad';
  Services.prefs.setCharPref(provider._prefs['linksURL'], exampleUrl);

  do_check_eq(provider._linksURL, exampleUrl);

  let newLinks = yield fetchData(provider);
  isIdentical(newLinks, []);

  provider.reset();
  Services.prefs.clearUserPref('general.useragent.locale')
  Services.prefs.clearUserPref(provider._prefs['linksURL']);
});

add_task(function test_DirectoryLinksProvider_getLinks_noLocaleData() {
  let provider = DirectoryLinksProvider;
  Services.prefs.setCharPref('general.useragent.locale', 'zh-CN');
  Services.prefs.setCharPref(provider._prefs['linksURL'], kTestSource);

  let links = yield fetchData(provider);
  do_check_eq(links.length, 0);
  provider.reset();
  Services.prefs.clearUserPref('general.useragent.locale')
  Services.prefs.clearUserPref(provider._prefs['linksURL']);
});
