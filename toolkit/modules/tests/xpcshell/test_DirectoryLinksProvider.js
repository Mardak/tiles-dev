/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
"use strict";

/**
 * This file tests the DirectoryLinksProvider singleton in the DirectoryLinksProvider.jsm module.
 */

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu, Constructor: CC } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/DirectoryLinksProvider.jsm");
Cu.import("resource://gre/modules/Promise.jsm");
Cu.import("resource://gre/modules/Http.jsm");
Cu.import("resource://testing-common/httpd.js");
Cu.import("resource://gre/modules/osfile.jsm")
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NetUtil",
  "resource://gre/modules/NetUtil.jsm");

do_get_profile();

const DIRECTORY_LINKS_FILE = "directoryLinks.json";
const DIRECTORY_FRECENCY = 1000;
const kSourceData = {"en-US": [{"url":"http://example.com","title":"LocalSource"}]};
const kTestSource = 'data:application/json,' + JSON.stringify(kSourceData);

// DirectoryLinksProvider preferences
const kLocalePref = DirectoryLinksProvider._observedPrefs.prefSelectedLocale;
const kSourceUrlPref = DirectoryLinksProvider._observedPrefs.linksURL;

// httpd settings
var server;
const kDefaultServerPort = 9000;
const kBaseUrl = "http://localhost:" + kDefaultServerPort;
const kExamplePath = "/exampleTest/";
const kFailPath = "/fail/";
const kExampleSource = kBaseUrl + kExamplePath;
const kFailSource = kBaseUrl + kFailPath;

const kHttpHandlerData = {};
kHttpHandlerData[kExamplePath] = {"en-US": [{"url":"http://example.com","title":"RemoteSource"}]};

const bodyData = JSON.stringify({ locale: DirectoryLinksProvider.locale });
const BinaryInputStream = CC("@mozilla.org/binaryinputstream;1",
                              "nsIBinaryInputStream",
                              "setInputStream");

function getHttpHandler(path) {
  let code = 200;
  let body = JSON.stringify(kHttpHandlerData[path]);
  if (path == kFailPath) {
    code = 204;
  }
  return function(aRequest, aResponse) {
    let bodyStream = new BinaryInputStream(aRequest.bodyInputStream);
    do_check_eq(NetUtil.readInputStreamToString(bodyStream, bodyStream.available()), bodyData);

    aResponse.setStatusLine(null, code);
    aResponse.setHeader("Content-Type", "application/json");
    aResponse.write(body);
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

function fetchData() {
  let deferred = Promise.defer();

  DirectoryLinksProvider.getLinks(linkData => {
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

function setupDirectoryLinksProvider(options = {}) {
  DirectoryLinksProvider.init();
  Services.prefs.setCharPref(kLocalePref, options.locale || "en-US");
  Services.prefs.setCharPref(kSourceUrlPref, options.linksURL || kTestSource);
}

function cleanDirectoryLinksProvider() {
  DirectoryLinksProvider.reset();
}

function run_test() {
  // Set up a mock HTTP server to serve a directory page
  server = new HttpServer();
  server.registerPrefixHandler(kExamplePath, getHttpHandler(kExamplePath));
  server.registerPrefixHandler(kFailPath, getHttpHandler(kFailPath));
  server.start(kDefaultServerPort);

  run_next_test();

  // Teardown.
  do_register_cleanup(function() {
    server.stop(function() { });
  });
}

add_task(function test_DirectoryLinksProvider_fetchAndCacheLinks_local() {
  yield cleanJsonFile();
  // Trigger cache of data or chrome uri files in profD
  yield DirectoryLinksProvider._fetchAndCacheLinks(kTestSource);
  let fileObject = yield readJsonFile();
  isIdentical(fileObject, kSourceData);
});

add_task(function test_DirectoryLinksProvider_fetchAndCacheLinks_remote() {
  yield cleanJsonFile();
  // this must trigger directory links json download and save it to cache file
  yield DirectoryLinksProvider._fetchAndCacheLinks(kExampleSource);
  let fileObject = yield readJsonFile();
  isIdentical(fileObject, kHttpHandlerData[kExamplePath]);
});

add_task(function test_DirectoryLinksProvider_fetchAndCacheLinks_malformedURI() {
  let someJunk = "some junk";
  DirectoryLinksProvider._fetchAndCacheLinks(someJunk)
    .then(() => do_throw("Malformed URIs should fail"),
          (e) => { do_check_eq(e, "Error fetching " + someJunk) });
});

add_task(function test_DirectoryLinksProvider_fetchAndCacheLinks_unknownHost() {
  let nonExistentServer = "http://nosuchhost";
  DirectoryLinksProvider._fetchAndCacheLinks(nonExistentServer)
    .then(() => do_throw("BAD URIs should fail"),
          (e) => do_check_true(e.startsWith("Fetching " + nonExistentServer + " results in error code: ")));
});

add_task(function test_DirectoryLinksProvider_fetchAndCacheLinks_non200Status() {
  yield cleanJsonFile();
  yield DirectoryLinksProvider._fetchAndCacheLinks(kFailSource);
  let fileObject = yield readJsonFile();
  isIdentical(fileObject, {});
});

// To test onManyLinksChanged observer, trigger a fetch
add_task(function test_DirectoryLinksProvider__linkObservers() {
  let deferred = Promise.defer();
  let testObserver = {
    onManyLinksChanged: function() {
      deferred.resolve();
    }
  }

  DirectoryLinksProvider.init();
  DirectoryLinksProvider.addObserver(testObserver);
  do_check_eq(DirectoryLinksProvider._observers.length, 1);
  DirectoryLinksProvider._fetchAndCacheLinks(kTestSource);

  yield deferred.promise;
  DirectoryLinksProvider._removeObservers();
  do_check_eq(DirectoryLinksProvider._observers.length, 0);

  cleanDirectoryLinksProvider();
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

  setupDirectoryLinksProvider({linksURL: dataURI});
  do_check_eq(DirectoryLinksProvider._linksURL, dataURI);

  let links;
  let expected_data;

  links = yield fetchData();
  do_check_eq(links.length, 1);
  expected_data = [{url: "http://example.com", title: "US", frecency: DIRECTORY_FRECENCY, lastVisitDate: 1}];
  isIdentical(links, expected_data);

  Services.prefs.setCharPref('general.useragent.locale', 'zh-CN');

  links = yield fetchData();
  do_check_eq(links.length, 2)
  expected_data = [
    {url: "http://example.net", title: "CN", frecency: DIRECTORY_FRECENCY, lastVisitDate: 2},
    {url: "http://example.net/2", title: "CN2", frecency: DIRECTORY_FRECENCY, lastVisitDate: 1}
  ];
  isIdentical(links, expected_data);

  cleanDirectoryLinksProvider();
});

add_task(function test_DirectoryLinksProvider__prefObserver_url() {
  setupDirectoryLinksProvider({linksURL: kTestSource});
  do_check_eq(DirectoryLinksProvider._linksURL, kTestSource);

  let links = yield fetchData();
  do_check_eq(links.length, 1);
  let expectedData =  [{url: "http://example.com", title: "LocalSource", frecency: DIRECTORY_FRECENCY, lastVisitDate: 1}];
  isIdentical(links, expectedData);

  // tests these 2 things:
  // 1. _linksURL is properly set after the pref change
  // 2. invalid source url is correctly handled
  let exampleUrl = 'http://nosuchhost/bad';
  Services.prefs.setCharPref(kSourceUrlPref, exampleUrl);
  do_check_eq(DirectoryLinksProvider._linksURL, exampleUrl);

  let newLinks = yield fetchData();
  isIdentical(newLinks, []);

  cleanDirectoryLinksProvider();
});

add_task(function test_DirectoryLinksProvider_getLinks_noLocaleData() {
  setupDirectoryLinksProvider({locale: 'zh-CN'});
  let links = yield fetchData();
  do_check_eq(links.length, 0);
  cleanDirectoryLinksProvider();
});
