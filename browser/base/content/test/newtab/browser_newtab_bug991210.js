/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const PRELOAD_PREF = "browser.newtab.preload";

function runTests() {
  // turn off preload to ensure that a newtab page loads
  Services.prefs.setBoolPref(PRELOAD_PREF, false);

  // add a test provider that waits for load
  let afterLoadProvider = {
    getLinks: function(callback) {
      this.callback = callback;
    },
    addObserver: function() {},
  };
  NewTabUtils.links.addProvider(afterLoadProvider);

  // wait until about:newtab loads before calling provider callback
  addNewTabPageTab();
  let browser = gWindow.gBrowser.selectedTab.linkedBrowser;
  yield browser.addEventListener("load", function onLoad() {
    browser.removeEventListener("load", onLoad, true);
    // afterLoadProvider.callback has to be called asynchronously to make grid
    // initilize after "load" event was handled
    executeSoon(() => afterLoadProvider.callback([]));
  }, true);

  ok(getGrid()._cellMargin != null, "grid has a computed cell margin");
  ok(getGrid()._cellHeight != null, "grid has a computed cell height");
  ok(getGrid()._cellWidth != null, "grid has a computed cell width");

  // restore original state
  NewTabUtils.links.removeProvider(afterLoadProvider);
  Services.prefs.clearUserPref(PRELOAD_PREF);
}
