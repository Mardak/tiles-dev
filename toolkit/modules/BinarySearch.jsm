/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["BinarySearch"];

this.BinarySearch = {

  /**
   * Returns the index of the given target in the given array or -1 if the
   * target is not found.
   *
   * See search() for a description of this function's parameters.
   *
   * @return The index of `target` in `array` or -1 if `target` is not found.
   */
  indexOf: function (array, target, comparator) {
    let [found, idx] = this.search(array, target, comparator);
    return found ? idx : -1;
  },

  /**
   * Returns the index within the given array where the given target may be
   * inserted to keep the array ordered.
   *
   * See search() for a description of this function's parameters.
   *
   * @return The index in `array` where `target` may be inserted to keep `array`
   *         ordered.
   */
  insertionIndexOf: function (array, target, comparator) {
    return this.search(array, target, comparator)[1];
  },

  /**
   * Searches for the given target in the given array.
   *
   * @param  array
   *         An array whose elements are ordered by `comparator`.
   * @param  target
   *         The value to search for in the array.
   * @param  comparator
   *         A function that takes two arguments and compares them, returning -1
   *         if the first should be ordered before the second, 0 if the first
   *         and second have the same ordering, or 1 if the first should be
   *         ordered after the second.  The first argument is always `target`,
   *         and the second argument is a value from the array.
   * @return An array with two elements.  If `target` is found, the first
   *         element is true, and the second element is its index in the array.
   *         If `target` is not found, the first element is false, and the
   *         second element is the index where it may be inserted to keep the
   *         array ordered.
   */
  search: function (array, target, comparator) {
    let low = 0;
    let high = array.length - 1;
    while (low <= high) {
      let idx = Math.floor((low + high) / 2);
      let cmp = comparator(target, array[idx]);
      if (cmp == 0)
        return [true, idx];
      if (cmp < 0)
        high = idx - 1;
      else
        low = idx + 1;
    }
    return [false, low];
  },
};
