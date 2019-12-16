'use strict';

module.exports = (prefix, array) => {
  const count = array.filter(item => item.uniquelocationid != null);
  return `${prefix}${count + 1}`;
}
