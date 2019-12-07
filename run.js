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
var Datastore = require('nedb');

// local imports
const SDK = require('./lib/SDK');
const listOAEvents = require('./lib/listOAEvents');
const getDocuments = require('./lib/getDocuments');
const generateUniqueLocationId = require('./lib/generateUniqueLocationId').bind(null, config.localIndex);
const locationIsSame = require('./lib/locationIsSame').bind(null, config.locationCompare);

// Local database configuration
const locations = new Datastore({ filename: config.localIndex.filename, autoload: true });

function documentIsLinkedToEvent(document, eventUid, agendaUid) {
  return document.linkedEvents.filter(linkedEvent =>
    linkedEvent.eventUid == eventUid && linkedEvent.agendaUid == agendaUid
  ).length > 0
}

(async () => {

  try {

    // Api client
    const client = await SDK(_.pick(config.oa, ['secret']));

    console.log("Phase 1: Iterate over all agendas and events");

    // Loop over all agendas target agendas
    for (const agenda of config.targetAgendas) {

      // For each agenda loop over all public events
      for (const event of await listOAEvents(agenda.uid)) {

        // The reason why we get documents at each loop iteration is because each event can potentially
        // update the local index and we need the latest version at every time
        const documents = await getDocuments(locations);

        // Matching document using the levenstein and geocoordinates
        const matchingDocumentGeo = _.first(documents.filter(document => locationIsSame(
          { name: document.name, latitude: document.latitude, longitude: document.longitude },
          { name: event.location.name, latitude: event.location.latitude, longitude: event.location.longitude }
        )));

        // Matching document using the uniquelocation
        const matchingDocumentUniquelocationid = _.first(documents.filter(document =>
          document.uniquelocationid == event.custom.uniquelocationid
        ));

        // Case 1
        if (!event.custom.uniquelocationid && !matchingDocumentGeo) {
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
          if (!documentIsLinkedToEvent(matchingDocumentGeo, event.uid, agenda.uid))
            locations.update({ '_id': matchingDocumentGeo._id }, { $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniqueLocationId: false } } });
          continue;
        }

        // Case 3
        if (event.custom.uniquelocationid && matchingDocumentUniquelocationid) {
          if (!documentIsLinkedToEvent(matchingDocumentUniquelocationid, event.uid, agenda.uid))
            locations.update({ '_id': matchingDocumentUniquelocationid._id }, { $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniqueLocationId: true } } });
          continue;
        }

        // Case 4
        if (event.custom.uniquelocationid && matchingDocumentGeo) {
          if (!documentIsLinkedToEvent(matchingDocumentGeo, event.uid, agenda.uid))
            locations.update({ '_id': matchingDocumentGeo._id }, { $set: { uniquelocationid: event.custom.uniquelocationid }, $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniqueLocationId: true } } });
          continue;
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

    console.log("Phase 2: Iterate over our local index and generate unique ids");
    for (const document of await getDocuments(locations, { uniquelocationid: null })) {
      const newid = await generateUniqueLocationId(locations);
      console.log('generated', newid)
      locations.update({ '_id': document._id }, { $set: { uniquelocationid: newid } });
    }

    console.log("Phase 3: Update events that have to be updated on the server");
    for (const document of await getDocuments(locations)) {
      for (const linkedEvent of document.linkedEvents) {
        if (!linkedEvent.hasUniqueLocationId) {

          // PATCH the event uniquelocationid field on the server
          const res = await client.v2('patch', `/agendas/${linkedEvent.agendaUid}/events/${linkedEvent.eventUid}`, {
            data: {
              "uniquelocationid": document.uniquelocationid
            }
          });

          // Update the local entry, mark it as hasUniqueLocationId: true
          linkedEvent.hasUniqueLocationId = true
          locations.update({ '_id': document._id }, { $set: { linkedEvents: document.linkedEvents } });
        }
      }
    }


  } catch (e) {
    console.log('something went wrong');
    console.log(e);
  }

})();