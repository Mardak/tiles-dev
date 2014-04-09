/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const PRELOAD_PREF = "browser.newtab.preload";

function runTests() {
  // turn off preload to ensure that a newtab page loads
  Services.prefs.setBoolPref(PRELOAD_PREF, false);

  // set up a test provider
  let afterLoadProvider = {
    getLinks: function(callback) {
      this.callback = callback;
    },
    addObserver: function() {},
  };
  // add afterload provider
  NewTabUtils.links.addProvider(afterLoadProvider);

  // wait until about:newtab loads before calling provider callback
  let tab = gWindow.gBrowser.selectedTab = gWindow.gBrowser.addTab("about:newtab");
  let browser = tab.linkedBrowser;
  yield browser.addEventListener("load", function onLoad() {
    browser.removeEventListener("load", onLoad, true);
    // afterLoadProvider.callback has to be called asynchronously to make grid
    // initilize after "load" event was handled
    executeSoon(function () {
      afterLoadProvider.callback([]);
      TestRunner.next();
    });
  }, true);

  ok(getGrid()._cellMargin != null, "grid has a computed cell margin");

  // restore original state
  NewTabUtils.links.removeProvider(afterLoadProvider);
  Services.prefs.clearUserPref(PRELOAD_PREF);
}
