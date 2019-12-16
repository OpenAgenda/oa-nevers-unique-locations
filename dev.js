'use strict';

const config = require('./config.dev');

process.env.APP_CONFIG = JSON.stringify({
  locationCompare: {
    geoDistanceThreshold: 100, // Distance from which consider that 2 locations are close enough
    percentSimilarThreshold: 70 // Percentage form which we consider that 2 names are similar enough
  },
  oa: {
    secret: config.secretKey
  },
  idPrefix: "nevers-",
  targetAgendas: [
    { "slug": "agenda-de-test-lieux-uniques", "uid": 5316770, "title": "Agenda de test lieux uniques" }
  ]
});

require('./run');
