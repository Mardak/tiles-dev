/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

function runTests() {
  yield setLinks("0");
  yield addNewTabPageTab();
  let site = getCell(0).node.querySelector(".newtab-site");
  let sponsoredPanel = getContentDocument().getElementById("sponsored-panel");
  let sponsoredButton = site.querySelector(".newtab-control-sponsored");
  site.setAttribute("type", "sponsored");
  is(sponsoredPanel.state, "closed", "Sponsed panel must be closed");

  function continueOnceOn(event) {
    sponsoredPanel.addEventListener(event, function listener() {
      sponsoredPanel.removeEventListener(event, listener);
      executeSoon(TestRunner.next);
    });
  }

  // test sponsoredPanel appearing upon a click
  continueOnceOn("popupshown");
  yield synthesizeNativeMouseClick(sponsoredButton);
  is(sponsoredPanel.state, "open", "Sponsored panel opens on click");
  ok(sponsoredButton.hasAttribute("panelShown"), "Sponsored button has panelShown attribute");

  // test sponsoredPanel hiding after a lick
  continueOnceOn("popuphidden");
  yield synthesizeNativeMouseClick(sponsoredButton);
  is(sponsoredPanel.state, "closed", "Sponsed panel hides on click");
  ok(!sponsoredButton.hasAttribute("panelShown"), "Sponsored button does not have panelShown attribute");
}
