'use strict';

// This is just a wrapper to promisify .find() callback
module.exports = function getAllDocuments(database) {
  return new Promise(function (resolve) {
    database.find({}, function (err, docs) {
      resolve(docs);
    });
  })
}