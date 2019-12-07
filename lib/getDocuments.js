'use strict';

// This is a wrapper to promisify .find() callback
module.exports = function getAllDocuments(database, searchQuery) {
  return new Promise(function (resolve) {
    database.find(searchQuery || {}, function (err, docs) {
      resolve(docs);
    });
  })
}