/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

function run_test() {
  run_next_test();
}

// Each of these tests a path that triggers a frecency update.  Together they
// hit all sites that update a frecency.

// InsertVisitedURIs::UpdateFrecency and History::InsertPlace
add_task(function test_InsertVisitedURIs_UpdateFrecency_and_History_InsertPlace() {
  // InsertPlace is at the end of a path that UpdateFrecency is also on, so kill
  // two birds with one stone and expect two notifications.  Trigger the path by
  // adding a download.
  let uri = NetUtil.newURI("http://example.com/a");
  Cc["@mozilla.org/browser/download-history;1"].
    getService(Ci.nsIDownloadHistory).
    addDownload(uri);
  yield onFrecencyChanged(uri);
  yield onFrecencyChanged(uri);
});

// nsNavHistory::UpdateFrecency
add_task(function test_nsNavHistory_UpdateFrecency() {
  let bm = PlacesUtils.bookmarks;
  let uri = NetUtil.newURI("http://example.com/b");
  bm.insertBookmark(bm.unfiledBookmarksFolder, uri,
                    Ci.nsINavBookmarksService.DEFAULT_INDEX, "test");
  yield onFrecencyChanged(uri);
});

// nsNavHistory::invalidateFrecencies
add_task(function test_nsNavHistory_invalidateFrecencies() {
  PlacesUtils.history.removeAllPages();
  yield onManyFrecenciesChanged();
});

// nsNavHistory::DecayFrecency and nsNavHistory::FixInvalidFrecencies
add_task(function test_nsNavHistory_DecayFrecency_and_nsNavHistory_FixInvalidFrecencies() {
  // FixInvalidFrecencies is at the end of a path that DecayFrecency is also on,
  // so expect two notifications.  Trigger the path by making nsNavHistory
  // observe the idle-daily notification.
  PlacesUtils.history.QueryInterface(Ci.nsIObserver).
    observe(null, "idle-daily", "");
  yield onManyFrecenciesChanged();
  yield onManyFrecenciesChanged();
});

function onFrecencyChanged(expectedURI) {
  let deferred = Promise.defer();
  let obs = new NavHistoryObserver();
  obs.onFrecencyChanged =
    (placeID, uri, newFrecency, guid, hidden, visitDate) => {
      PlacesUtils.history.removeObserver(obs);
      do_check_true(!!uri);
      do_check_true(uri.equals(expectedURI));
      deferred.resolve();
    };
  PlacesUtils.history.addObserver(obs, false);
  return deferred.promise;
}

function onManyFrecenciesChanged() {
  let deferred = Promise.defer();
  let obs = new NavHistoryObserver();
  obs.onManyFrecenciesChanged = () => {
    PlacesUtils.history.removeObserver(obs);
    do_check_true(true);
    deferred.resolve();
  };
  PlacesUtils.history.addObserver(obs, false);
  return deferred.promise;
}
