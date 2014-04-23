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
Cu.import("resource://gre/modules/Task.jsm");

do_get_profile();

const DIRECTORY_LINKS_FILE = "directoryLinks.json";
const DIRECTORY_FRECENCY = 1000;
const kSourceData = {"en-US": [{"url":"http://example.com","title":"LocalSource"}]};
const kTestSource = 'data:application/json,' + JSON.stringify(kSourceData);

// DirectoryLinksProvider preferences
const kLocalePref = DirectoryLinksProvider._observedPrefs.prefSelectedLocale;
const kSourceUrlPref = DirectoryLinksProvider._observedPrefs.linksURL;
const kLastDownloadPref = "browser.newtabpage.directory.lastDownload";

// app/profile/firefox.js are not avaialble in xpcshell: hence, preset them
Services.prefs.setCharPref(kLocalePref, "en-US");
Services.prefs.setCharPref(kSourceUrlPref, kTestSource);

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

function getHttpHandler(path) {
  let code = 200;
  let body = JSON.stringify(kHttpHandlerData[path]);
  if (path == kFailPath) {
    code = 204;
  }
  return function(aRequest, aResponse) {
    do_check_eq(aRequest.path, path + DirectoryLinksProvider.locale);
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

function LinksChangeObserver() {
  this.deferred = Promise.defer();
  this.onManyLinksChanged = function() {this.deferred.resolve();}.bind(this);
  this.onDownloadFail = this.onManyLinksChanged;
}

function promiseDirectoryDownloadOnPrefChange(pref, newValue) {
  let oldValue = Services.prefs.getCharPref(pref);
  if (oldValue != newValue) {
    // only if old and new value differ, setup observer
    let observer = new LinksChangeObserver();
    DirectoryLinksProvider.addObserver(observer);
    Services.prefs.setCharPref(pref, newValue);
    return observer.deferred.promise;
  }
  return Promise.resolve();
}

function promiseSetupDirectoryLinksProvider(options = {}) {
  return Task.spawn(function() {
    DirectoryLinksProvider.init();
    yield promiseDirectoryDownloadOnPrefChange(kLocalePref, options.locale || "en-US");
    yield promiseDirectoryDownloadOnPrefChange(kSourceUrlPref, options.linksURL || kTestSource);
    Services.prefs.setIntPref(kLastDownloadPref, options.lastDownload || 0);
  });
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
  let testObserver = new LinksChangeObserver();
  DirectoryLinksProvider.init();
  DirectoryLinksProvider.addObserver(testObserver);
  do_check_eq(DirectoryLinksProvider._observers.length, 1);
  DirectoryLinksProvider._fetchAndCacheLinks(kTestSource);

  yield testObserver.deferred.promise;
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

  yield promiseSetupDirectoryLinksProvider({linksURL: dataURI});
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
  yield promiseSetupDirectoryLinksProvider({linksURL: kTestSource});
  do_check_eq(DirectoryLinksProvider._linksURL, kTestSource);

  let links = yield fetchData();
  do_check_eq(links.length, 1);
  let expectedData =  [{url: "http://example.com", title: "LocalSource", frecency: DIRECTORY_FRECENCY, lastVisitDate: 1}];
  isIdentical(links, expectedData);

  // tests these 2 things:
  // 1. _linksURL is properly set after the pref change
  // 2. invalid source url is correctly handled
  let exampleUrl = 'http://example.com/bad';
  yield promiseDirectoryDownloadOnPrefChange(kSourceUrlPref, exampleUrl);
  do_check_eq(DirectoryLinksProvider._linksURL, exampleUrl);

  let newLinks = yield fetchData();
  isIdentical(newLinks, []);

  cleanDirectoryLinksProvider();
});

add_task(function test_DirectoryLinksProvider_getLinks_noLocaleData() {
  yield promiseSetupDirectoryLinksProvider({locale: 'zh-CN'});
  let links = yield fetchData();
  do_check_eq(links.length, 0);
  cleanDirectoryLinksProvider();
});

add_task(function test_DirectoryLinksProvider_needsDownload() {
  // test timestamping
  Services.prefs.setIntPref(kLastDownloadPref, 0);
  do_check_true(DirectoryLinksProvider._needsDownload());
  Services.prefs.setIntPref(kLastDownloadPref, Date.now()/1000);
  do_check_false(DirectoryLinksProvider._needsDownload());
  Services.prefs.setIntPref(kLastDownloadPref, (Date.now()/1000 - 60*60*24 + 1));
  do_check_true(DirectoryLinksProvider._needsDownload());
  Services.prefs.setIntPref(kLastDownloadPref, 0);
});

add_task(function test_DirectoryLinksProvider_fetchDirectoryContent() {
  yield cleanJsonFile();
  // explicitly change source url to cause the download during setup
  yield promiseSetupDirectoryLinksProvider({linksURL: kTestSource+" "});
  yield DirectoryLinksProvider._fetchDirectoryContent();

  // we should have fetched a new file during setup
  let data = yield readJsonFile();
  isIdentical(data, kSourceData);

  // inspect lastDownload timestamp which should be few seconds less then now()
  let lastDownload = Services.prefs.getIntPref(kLastDownloadPref);
  do_check_true((Date.now()/1000 - lastDownload) < 5);

  // attempt to download again - the timestamp should not change
  yield DirectoryLinksProvider._fetchDirectoryContent();
  do_check_eq(Services.prefs.getIntPref(kLastDownloadPref), lastDownload);

  // clean the file and force the download
  yield cleanJsonFile();
  yield DirectoryLinksProvider._fetchDirectoryContent(true);
  data = yield readJsonFile();
  isIdentical(data, kSourceData);

  // make sure that failed download does not corrupt the file, nor changes lastDownload
  lastDownload = Services.prefs.getIntPref(kLastDownloadPref);
  yield promiseDirectoryDownloadOnPrefChange(kSourceUrlPref, "http://");
  yield DirectoryLinksProvider._fetchDirectoryContent(true);
  data = yield readJsonFile();
  isIdentical(data, kSourceData);
  do_check_eq(Services.prefs.getIntPref(kLastDownloadPref), lastDownload);

  cleanDirectoryLinksProvider();
});

add_task(function test_DirectoryLinksProvider_fetchDirectoryOnPrefChange() {
  DirectoryLinksProvider.init();
  Services.prefs.setIntPref(kLastDownloadPref, Date.now()/1000);

  let testObserver = new LinksChangeObserver();
  DirectoryLinksProvider.addObserver(testObserver);

  yield cleanJsonFile();
  // insure that provider does not think it needs to download
  do_check_false(DirectoryLinksProvider._needsDownload());

  // change the source URL, which should force directory download
  Services.prefs.setCharPref(kSourceUrlPref, kExampleSource);
  // then wait for testObserver to fire and test that json is downloaded
  yield testObserver.deferred.promise;
  let data = yield readJsonFile();
  isIdentical(data, kHttpHandlerData[kExamplePath]);

  cleanDirectoryLinksProvider();
});

add_task(function test_DirectoryLinksProvider_fetchDirectoryOnShowCount() {
  yield promiseSetupDirectoryLinksProvider();

  // set lastdownload to 0 to make DirectoryLinksProvider want to download
  Services.prefs.setIntPref(kLastDownloadPref, 0);
  do_check_true(DirectoryLinksProvider._needsDownload());

  // Tell DirectoryLinksProvider that newtab has no room for sponsored links
  let directoryCount = {sponsored: 0};
  yield DirectoryLinksProvider.reportShownCount(directoryCount);
  // the provider must skip download, hence that lastdownload is still 0
  do_check_eq(Services.prefs.getIntPref(kLastDownloadPref), 0);

  // make room for sponsored links and repeat, download should happen
  directoryCount.sponsored = 1;
  yield DirectoryLinksProvider.reportShownCount(directoryCount);
  do_check_true(Services.prefs.getIntPref(kLastDownloadPref) != 0);

  cleanDirectoryLinksProvider();
});
