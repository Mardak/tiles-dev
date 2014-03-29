/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// See also browser/base/content/test/newtab/.

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;
Cu.import("resource://gre/modules/NewTabUtils.jsm");

function run_test() {
  run_next_test();
}

add_test(function multipleProviders() {
  // Make each provider generate NewTabUtils.links.maxNumLinks links to check
  // that no more than maxNumLinks are actually returned in the merged list.
  let evenFrecencyProvider = new TestProvider(function (done) {
    let links = [];
    for (let i = NewTabUtils.links.maxNumLinks * 2 - 2; i >= 0; i -= 2) {
      links.push({
        url: "http://example.com/" + i,
        frecency: i,
        lastVisitDate: 0,
      });
    }
    done(links);
  });
  let oddFrecencyProvider = new TestProvider(function (done) {
    let links = [];
    for (let i = NewTabUtils.links.maxNumLinks * 2 - 1; i >= 1; i -= 2) {
      links.push({
        url: "http://example.com/" + i,
        frecency: i,
        lastVisitDate: 0,
      });
    }
    done(links);
  });

  NewTabUtils.initWithoutProviders();
  NewTabUtils.links.addProvider(evenFrecencyProvider);
  NewTabUtils.links.addProvider(oddFrecencyProvider);

  // This is sync since the providers' getLinks are sync.
  NewTabUtils.links.populateCache(function () {}, false);

  let links = NewTabUtils.links.getLinks();
  do_check_true(Array.isArray(links));
  do_check_eq(links.length, NewTabUtils.links.maxNumLinks);
  for (let i = 0; i < links.length; i++) {
    let link = links[i];
    let frecency = NewTabUtils.links.maxNumLinks * 2 - i - 1;
    do_check_eq(link.url, "http://example.com/" + frecency);
    do_check_eq(link.frecency, frecency);
  }

  NewTabUtils.links.removeProvider(evenFrecencyProvider);
  NewTabUtils.links.removeProvider(oddFrecencyProvider);
  run_next_test();
});

add_test(function changeLinks() {
  let expectedLinks = [];
  for (let i = 10; i > 0; i--) {
    let frecency = 2 * i;
    expectedLinks.push({
      url: "http://example.com/" + frecency,
      title: "My frecency is " + frecency,
      frecency: frecency,
      lastVisitDate: 0,
    });
  }

  let provider = new TestProvider(done => done(expectedLinks));

  NewTabUtils.initWithoutProviders();
  NewTabUtils.links.addProvider(provider);

  // This is sync since the provider's getLinks is sync.
  NewTabUtils.links.populateCache(function () {}, false);

  do_check_links(NewTabUtils.links.getLinks(), expectedLinks);

  // Notify of a new link.
  let newLink = {
    url: "http://example.com/19",
    title: "My frecency is 19",
    frecency: 19,
    lastVisitDate: 0,
  };
  expectedLinks.splice(1, 0, newLink);
  provider.notifyLinkChanged(newLink);
  do_check_links(NewTabUtils.links.getLinks(), expectedLinks);

  // Notify of a link that's changed sort criteria.
  newLink.frecency = 17;
  expectedLinks.splice(1, 1);
  expectedLinks.splice(2, 0, newLink);
  provider.notifyLinkChanged({
    url: newLink.url,
    frecency: 17,
  });
  do_check_links(NewTabUtils.links.getLinks(), expectedLinks);

  // Notify of a link that's changed title.
  newLink.title = "My frecency is now 17";
  provider.notifyLinkChanged({
    url: newLink.url,
    title: newLink.title,
  });
  do_check_links(NewTabUtils.links.getLinks(), expectedLinks);

  // Notify of a new link again, but this time make it overflow maxNumLinks.
  provider.maxNumLinks = expectedLinks.length;
  newLink = {
    url: "http://example.com/21",
    frecency: 21,
    lastVisitDate: 0,
  };
  expectedLinks.unshift(newLink);
  expectedLinks.pop();
  do_check_eq(expectedLinks.length, provider.maxNumLinks); // Sanity check.
  provider.notifyLinkChanged(newLink);
  do_check_links(NewTabUtils.links.getLinks(), expectedLinks);

  // Notify of many links changed.
  expectedLinks = [];
  for (let i = 3; i > 0; i--) {
    expectedLinks.push({
      url: "http://example.com/" + i,
      frecency: i,
      lastVisitDate: i,
    });
  }
  provider.notifyManyLinksChanged();
  // NewTabUtils.links will now repopulate its cache, which is sync since
  // the provider's getLinks is sync.
  do_check_links(NewTabUtils.links.getLinks(), expectedLinks);

  NewTabUtils.links.removeProvider(provider);
  run_next_test();
});

function TestProvider(getLinksFn) {
  this.getLinks = getLinksFn;
  this._observers = new Set();
}

TestProvider.prototype = {
  addObserver: function (observer) {
    this._observers.add(observer);
  },
  notifyLinkChanged: function (link) {
    this._notifyObservers("onLinkChanged", link);
  },
  notifyManyLinksChanged: function () {
    this._notifyObservers("onManyLinksChanged");
  },
  _notifyObservers: function (observerMethodName, arg) {
    for (let obs of this._observers) {
      if (obs[observerMethodName])
        obs[observerMethodName](this, arg);
    }
  },
};

function do_check_links(actualLinks, expectedLinks) {
  do_check_true(Array.isArray(actualLinks));
  do_check_eq(actualLinks.length, expectedLinks.length);
  for (let i = 0; i < expectedLinks.length; i++) {
    let expected = expectedLinks[i];
    let actual = actualLinks[i];
    do_check_eq(actual.url, expected.url);
    do_check_eq(actual.title, expected.title);
    do_check_eq(actual.frecency, expected.frecency);
    do_check_eq(actual.lastVisitDate, expected.lastVisitDate);
  }
}
