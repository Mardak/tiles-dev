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
    // let NewTabUtils.populateCache continue
    afterLoadProvider.callback([]);
    // terminate the yield
    executeSoon(TestRunner.next);
  }, true);
  // wait for "load" handler to fire
  yield true;
  // if Grid is resized it must have _cellMargin defined
  ok(getGrid()._cellMargin != null);
  // remove afterload provider
  NewTabUtils.links.removeProvider(afterLoadProvider);
  // restore original value of browser.newtab.preload
  Services.prefs.setBoolPref(PRELOAD_PREF,originalPreloadValue);
}
