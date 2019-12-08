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
const generateUniquelocationid = require('./lib/generateUniquelocationid').bind(null, config.localIndex);
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
    console.log("\n")
    console.log("Phase 1: Iterate over all agendas and events");

    // Loop over all agendas target agendas
    for (const agenda of config.targetAgendas) {

      // For each agenda loop over all public events
      for (const event of await listOAEvents(agenda.uid)) {

        console.log("\n")
        console.log("Processing event", event.slug);
        console.log("uniquelocationid:", event.custom.uniquelocationid)

        // The reason why we get documents at each loop iteration is because each event can potentially
        // modify the local index and we need the latest version at every time
        const documents = await getDocuments(locations);

        // Matching document using the levenstein and geocoordinates
        const matchingDocumentLevensteinGeo = _.first(documents.filter(document => locationIsSame(
          { name: document.name, latitude: document.latitude, longitude: document.longitude },
          { name: event.location.name, latitude: event.location.latitude, longitude: event.location.longitude }
        )));

        if (!event.custom.uniquelocationid) {

          console.log("Event has no uniquelocationid");

          if (!matchingDocumentLevensteinGeo) {
            console.log("No matching document using the levenstein+geo method");
            console.log("Creating a new entry in the local index for the location");
            console.log("Adding the event to the linkedEvents, and mark it as hasuniquelocation:false");
            locations.insert({
              uniquelocationid: null,
              name: event.location.name,
              latitude: event.location.latitude,
              longitude: event.location.longitude,
              linkedEvents: [{
                eventUid: event.uid,
                agendaUid: agenda.uid,
                hasUniquelocationid: false
              }]
            });
            continue;
          }

          if (matchingDocumentLevensteinGeo) {
            console.log("Found a match in the local index using the levenstein+geo method");
            if (!documentIsLinkedToEvent(matchingDocumentLevensteinGeo, event.uid, agenda.uid)) {
              console.log("Adding the event to the linkedEvents, and mark it as hasuniquelocation:false");
              locations.update({ '_id': matchingDocumentLevensteinGeo._id }, { $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniquelocationid: false } } });
            }
            continue;
          }
        }

        else {

          console.log("Event already has a uniquelocationid:", event.custom.uniquelocationid);

          // Matching document using the uniquelocationid
          const matchingDocumentUniquelocationid = _.first(documents.filter(document =>
            document.uniquelocationid == event.custom.uniquelocationid
          ));

          if (matchingDocumentUniquelocationid) {
            console.log("Found a match in the local index with the same uniquelocationid");
            if (!documentIsLinkedToEvent(matchingDocumentUniquelocationid, event.uid, agenda.uid)) {
              console.log("Adding the event to the linkedEvents");
              locations.update({ '_id': matchingDocumentUniquelocationid._id }, { $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniquelocationid: true } } });
            }
            continue;
          }

          if (matchingDocumentLevensteinGeo) {
            console.log("Found a match in the local index using the levenstein+geo method");
            if (!documentIsLinkedToEvent(matchingDocumentLevensteinGeo, event.uid, agenda.uid)) {
              console.log("Updating the uniquelocationid of the matched location to:", event.custom.uniquelocationid)
              console.log("Adding the event to the linkedEvents");
              locations.update({ '_id': matchingDocumentLevensteinGeo._id }, { $set: { uniquelocationid: event.custom.uniquelocationid }, $push: { linkedEvents: { eventUid: event.uid, agendaUid: agenda.uid, hasUniquelocationid: true } } });
            }
            continue;
          }

          // @QUESTION: since both cases (matchingDocumentUniquelocationid or matchingDocumentLevensteinGeo) are handled above
          // and since they have `continue`, we could remove the if statement of the following block and leave just
          // what's inside the curly brackets. But I decided to leave it for readability. What do you think is best?
          if (!matchingDocumentLevensteinGeo && !matchingDocumentUniquelocationid) {
            console.log("No match in the local index with the same uniquelocationid, and no match using the levenstein+geo method");
            console.log("Creating a new entry in the local index for the location");
            console.log("Adding the event to the linkedEvents, and mark it as hasuniquelocation:true");
            locations.insert({
              uniquelocationid: event.custom.uniquelocationid,
              name: event.location.name,
              latitude: event.location.latitude,
              longitude: event.location.longitude,
              linkedEvents: [{
                eventUid: event.uid,
                agendaUid: agenda.uid,
                hasUniquelocationid: true
              }]
            });
          }
        }
      }
    }

    console.log("\n")
    console.log("Phase 2: Iterate over our local index and generate unique ids");
    for (const document of await getDocuments(locations, { uniquelocationid: null })) {
      const newid = await generateUniquelocationid(locations);
      console.log('Generated uniquelocationid:', newid)
      locations.update({ '_id': document._id }, { $set: { uniquelocationid: newid } });
    }

    console.log("\n")
    console.log("Phase 3: Update events that have been marked as hasUniquelocationid:false");
    for (const document of await getDocuments(locations)) {
      for (const linkedEvent of document.linkedEvents) {
        if (!linkedEvent.hasUniquelocationid) {

          try {
            console.log("Sending PATCH request to", `/agendas/${linkedEvent.agendaUid}/events/${linkedEvent.eventUid}`);
            // PATCH the event uniquelocationid field on the server
            const res = await client.v2('patch', `/agendas/${linkedEvent.agendaUid}/events/${linkedEvent.eventUid}`, {
              data: {
                "uniquelocationid": document.uniquelocationid
              }
            });

            // Update the local entry, mark it as hasUniquelocationid:true
            // @QUESTION: do you think this is a good way of updating an item in the array of linked events?
            // doing `linkedEvent.hasUniquelocationid = true` works but i'm actually surprised it does.
            // Maybe making a new reference with a copy of the whole linkedEvents variable has less risks of reference issues?
            linkedEvent.hasUniquelocationid = true

            console.log("Updating local index entry as hasUniquelocationid:true");
            locations.update({ '_id': document._id }, { $set: { linkedEvents: document.linkedEvents } });
          }
          catch (e) {
            console.log("Failed patching the event");
            console.log(e);
          }
        }
      }
    }


  } catch (e) {
    console.log("something went wrong");
    console.log(e);
  }

})();