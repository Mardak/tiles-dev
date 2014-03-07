/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Checks that newtab is updated as its links change.
 */

function runTests() {
  // First, start with an empty page.
  yield setLinks([]);

  // Strategy: Add some visits, open a new page, check the grid, repeat.
  fillHistory([link(1)], function () {});
  yield whenPagesUpdated();
  yield addNewTabPageTab();
  checkGrid("1,,,,,,,,");

  fillHistory([link(2)], function () {});
  yield whenPagesUpdated();
  yield addNewTabPageTab();
  checkGrid("2,1,,,,,,,");

  fillHistory([link(1)], function () {});
  yield whenPagesUpdated();
  yield addNewTabPageTab();
  checkGrid("1,2,,,,,,,");

  fillHistory([link(2), link(3), link(4)], function () {});
  yield whenPagesUpdated();
  yield addNewTabPageTab();
  // When links have the same frecency, they're ordered by place ID descending,
  // but fillHistory reverses the list you pass to it, so 3 should come before
  // 4 since it's inserted after 4.
  checkGrid("2,1,3,4,,,,,");
}

function link(id) {
  return { url: "http://example.com/#" + id, title: "site#" + id };
}
