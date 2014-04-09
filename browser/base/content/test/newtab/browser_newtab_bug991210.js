/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const PRELOAD_PREF = "browser.newtab.preload";

function runTests() {
  // store original value of browser.newtab.preload
  let originalPreloadValue = Services.prefs.getBoolPref(PRELOAD_PREF);
  // turn off preload to insure that a newtab page loads
  Services.prefs.setBoolPref(PRELOAD_PREF,false);
  // note that addNewTabPageTab() calls populateCache upon newtab
  // "load" event. Since preload is disabled, newtab is loaded anew
  // and it should cause grid resizing
  yield addNewTabPageTab();
  // if Grid is resized it must have _cellMargin defined
  ok(getGrid()._cellMargin != null);
  // restore original value of browser.newtab.preload
  Services.prefs.setBoolPref(PRELOAD_PREF,originalPreloadValue);
}
