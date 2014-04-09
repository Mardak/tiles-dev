/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const PRELOAD_PREF = "browser.newtab.preload";

function runTests() {
  // store original value of browser.newtab.preload
  let originalPreloadValue = Services.prefs.getBoolPref(PRELOAD_PREF);
  // turn off preload to insure that a newtab page loads
  Services.prefs.setBoolPref(PRELOAD_PREF,false);
  // set up a test provider
  let afterLoadProvider = {
    getLinks: function(callback) {
      this.callback = callback;
    },
    addObserver: function() {},
  };
  // add afterload provider
  NewTabUtils.links.addProvider(afterLoadProvider);
  // open a newtab
  let tab = gWindow.gBrowser.selectedTab = gWindow.gBrowser.addTab("about:newtab");
  let browser = tab.linkedBrowser;
  // call provider callback on "load" and insure grid is resized
  browser.addEventListener("load", function onLoad() {
    browser.removeEventListener("load", onLoad, true);
    // afterLoadProvider.callback has to be called asynchronously
    // to make grid initilize after "load" event was handled
    executeSoon(function () {
      afterLoadProvider.callback([]);
      TestRunner.next();
    });
  }, true);
  // wait until afterLoadProvider.callback() fires
  yield true;
  // if Grid is properly resized it must have _cellMargin defined
  ok(getGrid()._cellMargin != null);
  // remove afterload provider
  NewTabUtils.links.removeProvider(afterLoadProvider);
  // restore original value of browser.newtab.preload
  Services.prefs.setBoolPref(PRELOAD_PREF,originalPreloadValue);
}
