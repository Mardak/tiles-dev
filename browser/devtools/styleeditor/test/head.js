/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const TEST_BASE = "chrome://mochitests/content/browser/browser/devtools/styleeditor/test/";
const TEST_BASE_HTTP = "http://example.com/browser/browser/devtools/styleeditor/test/";
const TEST_BASE_HTTPS = "https://example.com/browser/browser/devtools/styleeditor/test/";
const TEST_HOST = 'mochi.test:8888';

let {devtools} = Cu.import("resource://gre/modules/devtools/Loader.jsm", {});
let TargetFactory = devtools.TargetFactory;
let {console} = Cu.import("resource://gre/modules/devtools/Console.jsm", {});
let {Promise: promise} = Cu.import("resource://gre/modules/Promise.jsm", {});

let gPanelWindow;


// Import the GCLI test helper
let testDir = gTestPath.substr(0, gTestPath.lastIndexOf("/"));
Services.scriptloader.loadSubScript(testDir + "../../../commandline/test/helpers.js", this);

gDevTools.testing = true;
SimpleTest.registerCleanupFunction(() => {
  gDevTools.testing = false;
});

/**
 * Add a new test tab in the browser and load the given url.
 * @param {String} url The url to be loaded in the new tab
 * @param {Window} win The window to add the tab to (default: current window).
 * @return a promise that resolves to the tab object when the url is loaded
 */
function addTab(url, win) {
  info("Adding a new tab with URL: '" + url + "'");
  let def = promise.defer();

  let targetWindow = win || window;
  let targetBrowser = targetWindow.gBrowser;

  let tab = targetBrowser.selectedTab = targetBrowser.addTab(url);
  targetBrowser.selectedBrowser.addEventListener("load", function onload() {
    targetBrowser.selectedBrowser.removeEventListener("load", onload, true);
    info("URL '" + url + "' loading complete");
    def.resolve(tab);
  }, true);

  return def.promise;
}

/**
 * Navigate the currently selected tab to a new URL and wait for it to load.
 * @param {String} url The url to be loaded in the current tab.
 * @return a promise that resolves when the page has fully loaded.
 */
function navigateTo(url) {
  let navigating = promise.defer();
  gBrowser.selectedBrowser.addEventListener("load", function onload() {
    gBrowser.selectedBrowser.removeEventListener("load", onload, true);
    navigating.resolve();
  }, true);
  content.location = url;
  return navigating.promise;
}

function* cleanup()
{
  gPanelWindow = null;
  while (gBrowser.tabs.length > 1) {
    let target = TargetFactory.forTab(gBrowser.selectedTab);
    yield gDevTools.closeToolbox(target);

    gBrowser.removeCurrentTab();
  }
}

/**
 * Creates a new tab in specified window navigates it to the given URL and
 * opens style editor in it.
 */
let openStyleEditorForURL = Task.async(function* (url, win) {
  let tab = yield addTab(url, win);
  let target = TargetFactory.forTab(tab);
  let toolbox = yield gDevTools.showToolbox(target, "styleeditor");
  let panel = toolbox.getPanel("styleeditor");
  let ui = panel.UI;

  return { tab, toolbox, panel, ui };
});

function addTabAndOpenStyleEditors(count, callback, uri) {
  let deferred = promise.defer();
  let currentCount = 0;
  let panel;
  addTabAndCheckOnStyleEditorAdded(p => panel = p, function (editor) {
    currentCount++;
    info(currentCount + " of " + count + " editors opened: "
         + editor.styleSheet.href);
    if (currentCount == count) {
      if (callback) {
        callback(panel);
      }
      deferred.resolve(panel);
    }
  });

  if (uri) {
    content.location = uri;
  }
  return deferred.promise;
}

function addTabAndCheckOnStyleEditorAdded(callbackOnce, callbackOnAdded) {
  gBrowser.selectedTab = gBrowser.addTab();
  gBrowser.selectedBrowser.addEventListener("load", function onLoad() {
    gBrowser.selectedBrowser.removeEventListener("load", onLoad, true);
    openStyleEditorInWindow(window, function (panel) {
      // Execute the individual callback with the panel argument.
      callbackOnce(panel);
      // Report editors that already opened while loading.
      for (let editor of panel.UI.editors) {
        callbackOnAdded(editor);
      }
      // Report new editors added afterwards.
      panel.UI.on("editor-added", (event, editor) => callbackOnAdded(editor));
    });
  }, true);
}

function openStyleEditorInWindow(win, callback) {
  let target = TargetFactory.forTab(win.gBrowser.selectedTab);
  win.gDevTools.showToolbox(target, "styleeditor").then(function(toolbox) {
    let panel = toolbox.getCurrentPanel();
    gPanelWindow = panel._panelWin;

    panel.UI._alwaysDisableAnimations = true;
    callback(panel);
  });
}

registerCleanupFunction(cleanup);
