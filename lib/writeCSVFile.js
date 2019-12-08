'use strict';

const csv = require('fast-csv');
const fs = require('fs');

module.exports = function(filepath, rows, options = {}) {
  return new Promise((rs, rj) => {
    const file = fs.createWriteStream(filepath);
    csv.write(rows, {
      headers: true,
      delimiter: ','
    }).pipe(file)
      .on( 'error', rj)
      .on('finish', () => rs(filepath));
  });
}
