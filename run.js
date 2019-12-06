'use strict';

// config
const config = Object.assign({
  oa: { public: null, secret: null },
  locationCompare: {
    geoDistanceThreshold: 100, // Distance from which consider that 2 locations are close enough
    percentSimilarThreshold: 70 // Percentage form which we consider that 2 names are similar enough
  }
}, JSON.parse(process.env.APP_CONFIG));

// npm imports
const _ = require('lodash');
const sa = require('superagent');
var Datastore = require('nedb');

// local imports
const SDK = require('./lib/SDK');
const listOAEvents = require('./lib/listOAEvents');
const getAllDocuments = require('./lib/getAllDocuments');
const locationIsSame = require('./lib/locationIsSame').bind(null, config.locationCompare);

// Local database configuration
const locations = new Datastore({ filename: 'locations.db', autoload: true });

function documentIsLinkedToEvent(document, eventUid, agendaUid) {
  return document.linkedEvents.filter(linkedEvent =>
    linkedEvent.eventUid == eventUid && linkedEvent.agendaUid == agendaUid
  ).length > 0
}

async function generateUniqueLocationId(database) {
  const documents = await getAllDocuments(database);
  return `${config.uniquelocationidPrefix}${documents.length + 1}`
}

(async () => {

  try {

    // Api client
    const client = await SDK(_.pick(config.oa, ['secret']));

    // Get all documents from the local database
    let documents = await getAllDocuments(locations);

    console.log("Phase 1: Iterate over all agendas and events");

    // Loop over all agendas target agendas
    for (const agenda of config.targetAgendas) {

      // For each agenda loop over all public events
      for (const event of await listOAEvents(agenda.uid)) {

        const matchingDocumentGeo = _.first(documents.filter(document => locationIsSame(
          { name: document.name, latitude: document.latitude, longitude: document.longitude },
          { name: event.location.name, latitude: event.location.latitude, longitude: event.location.longitude }
        )));

        const matchingDocumentUniquelocationid = _.first(documents.filter(document =>
          document.uniquelocationid == event.custom.uniquelocationid
        ));

        // Case 1
        if (!event.custom.uniquelocationid && !matchingDocumentGeo) {
          console.log("no uniquelocationid and no matching doc")
          console.log("inserting location in local DB")
          locations.insert({
            uniquelocationid: null,
            name: event.location.name,
            latitude: event.location.latitude,
            longitude: event.location.longitude,
            linkedEvents: [{
              eventUid: event.uid,
              agendaUid: agenda.uid,
              hasUniqueLocationId: false
            }]
          });
          continue;
        }

        // Case 2
        if (!event.custom.uniquelocationid && matchingDocumentGeo) {
          console.log("event has no uniquelocationid")
          console.log("matched doc geo")
          if (!documentIsLinkedToEvent(matchingDocumentGeo, event.uid, agenda.uid))
            locations.update({ '_id': matchingDocumentGeo._id }, { $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniqueLocationId: false } } });
          continue;
        }

        // Case 3
        if (event.custom.uniquelocationid && matchingDocumentUniquelocationid) {
          console.log("matched doc by ID")
          if (!documentIsLinkedToEvent(matchingDocumentUniquelocationid, event.uid, agenda.uid))
            locations.update({ '_id': matchingDocumentUniquelocationid._id }, { $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniqueLocationId: true } } });
          continue;
        }

        // Case 4
        if (event.custom.uniquelocationid && matchingDocumentGeo) {
          console.log("event has uniquelocationid")
          console.log("matched doc geo")
          if (!documentIsLinkedToEvent(matchingDocumentGeo, event.uid, agenda.uid))
            locations.update({ '_id': matchingDocumentGeo._id }, { $set: { uniquelocationid: event.custom.uniquelocationid }, $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniqueLocationId: true } } });
        }

        // Case 5
        if (event.custom.uniquelocationid && !matchingDocumentGeo && !matchingDocumentUniquelocationid) {
          locations.insert({
            uniquelocationid: event.custom.uniquelocationid,
            name: event.location.name,
            latitude: event.location.latitude,
            longitude: event.location.longitude,
            linkedEvents: [{
              eventUid: event.uid,
              agendaUid: agenda.uid,
              hasUniqueLocationId: true
            }]
          });
          continue;
        }
      }
    }

    console.log("Phase 2: Iterate over our local index and create unique ids");

    documents = await getAllDocuments(locations);

    console.log(JSON.stringify(documents, null, 2));

    for (const document of documents) {
      for (const linkedEvent of document.linkedEvents) {
        if (!linkedEvent.hasUniqueLocationId) {
          const res = await client.v2('patch', `/agendas/${linkedEvent.agendaUid}/events/${linkedEvent.eventUid}`, {
            data: {
              "uniquelocationid": "test"
            }
          });

          //locations.update({ '_id': matchingDocumentGeo._id }, { $set: { uniquelocationid: event.custom.uniquelocationid }, $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniqueLocationId: true } } });
        }
      }
    }



    console.log("Phase 3: Generate report of operations");

  } catch (e) {
    console.log('something went wrong');
    console.log(e);
  }

})();