'use strict';

// npm imports
const _ = require('lodash');
const sa = require('superagent');

// local imports
const SDK = require('./lib/SDK');
const listOAEvents = require('./lib/listOAEvents');

const config = Object.assign({
  oa: { public: null, secret: null },
  locationCompare: {
    geoDistanceThreshold: 100, // Distance from which consider that 2 locations are close enough
    percentSimilarThreshold: 70 // Percentage form which we consider that 2 names are similar enough
  }
}, JSON.parse(process.env.APP_CONFIG));

(async () => {

  // Get all events from agenda
  try {
    const client = await SDK(_.pick(config.oa, ['secret']));

    // Loop over all agendas
    for (const agenda of config.targetAgendas) {

      // For each agenda get the list of public events
      const events = await listOAEvents(agenda.uid);

    }

  } catch (e) {
    console.log('something went wrong');
    console.log(e);
  }

  process.exit();
})();