'use strict';

module.exports = ({ prefix }, database) => {
  return new Promise(function (resolve) {
    database.count({ uniquelocationid: { $ne: null } }, function (err, count) {
      resolve(`${prefix}${count + 1}`)
    });
  })
}