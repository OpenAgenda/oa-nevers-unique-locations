'use strict';

const _ = require('lodash');
const geolib = require('geolib');
const levenshtein = require('fast-levenshtein');

module.exports = ({ geoDistanceThreshold, percentSimilarThreshold }, location1, location2) => {
  const levensteinDistance = levenshtein.get(location1.name, location2.name);

  const geoDistance = geolib.getDistance(
    _.pick(location1, ['latitude', 'longitude']),
    _.pick(location2, ['latitude', 'longitude'])
  );

  const percentSimilar = 100 - levensteinDistance * 100 / Math.max(location1.name.length, location2.name.length);

  return geoDistance < geoDistanceThreshold && percentSimilar > percentSimilarThreshold;
}
