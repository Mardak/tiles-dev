/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Appends a div to the document body.
 *
 * @param t  The testharness.js Test object. If provided, this will be used
 *           to register a cleanup callback to remove the div when the test
 *           finishes.
 *
 * @param attrs  A dictionary object with attribute names and values to set on
 *               the div.
 */
function addDiv(t, attrs) {
  var div = document.createElement('div');
  if (attrs) {
    for (var attrName in attrs) {
      div.setAttribute(attrName, attrs[attrName]);
    }
  }
  document.body.appendChild(div);
  if (t && typeof t.add_cleanup === 'function') {
    t.add_cleanup(function() {
      if (div.parentNode) {
        div.parentNode.removeChild(div);
      }
    });
  }
  return div;
}

/**
 * Promise wrapper for requestAnimationFrame.
 */
function waitForFrame() {
  return new Promise(function(resolve, reject) {
    window.requestAnimationFrame(resolve);
  });
}

/**
 * Wrapper that takes a sequence of N players and returns:
 *
 *   Promise.all([players[0].ready, players[1].ready, ... players[N-1].ready]);
 */
function waitForAllPlayers(players) {
  return Promise.all(players.map(function(player) { return player.ready; }));
}

/**
 * Returns a Promise that is resolved after the next two animation frames have
 * occured (that is, after two consecutive requestAnimationFrame callbacks
 * have been called).
 */
function waitForTwoAnimationFrames() {
   return new Promise(function(resolve, reject) {
     window.requestAnimationFrame(function() {
       window.requestAnimationFrame(function() {
         resolve();
       });
     });
   });
}

/**
 * Flush the computed style for the given element. This is useful, for example,
 * when we are testing a transition and need the initial value of a property
 * to be computed so that when we synchronouslyet set it to a different value
 * we actually get a transition instead of that being the initial value.
 */
function flushComputedStyle(elem) {
  var cs = window.getComputedStyle(elem);
  cs.marginLeft;
}

