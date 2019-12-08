'use strict';

const should = require('should');

const locationIsSame = require('../lib/locationIsSame');

describe('locationIsSame', () => {

  describe('with reasonable thresholds', () => {

    const isSame = locationIsSame.bind(null, {
      geoDistanceThreshold: 30, // meters
      percentSimilarThreshold: 70
    });

    it('locations that are not geographical neighbors do not match', () => {
      isSame({
        name: 'Le Zénith',
        latitude: 43.598264,
        longitude: 1.4070655
      }, {
        name: 'Le Zénith',
        latitude: 50.6335712,
        longitude: 3.0752894
      }).should.equal(false);
    });

    it('locations that are geographical neighbors match', () => {
      isSame({
        name: 'Le Zénith',
        latitude: 43.598264,
        longitude: 1.4070655
      }, {
        name: 'Le Zénith',
        latitude: 43.598,
        longitude: 1.4070655
      }).should.equal(true);
    });

    it('locations that have unsimilar names do not match', () => {
      isSame({
        name: 'Le Zénith',
        latitude: 43.598264,
        longitude: 1.4070655
      }, {
        name: 'Le Zénith Arena',
        latitude: 43.598264,
        longitude: 1.4070655
      }).should.equal(false);
    });

  });

});
