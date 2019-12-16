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

// local imports
const SDK = require('./lib/SDK');
const listOAEvents = require('./lib/listOAEvents');
const generateUniqueLocationId = require('./lib/generateUniqueLocationId').bind(null, config.idPrefix);
const locationIsSame = require('./lib/locationIsSame').bind(null, config.locationCompare);
const writeCSVFile = require('./lib/writeCSVFile');

// Local database configuration
// const locations = new Datastore({ filename: config.localIndex.filename, autoload: true });

function locationIsLinkedToEvent(location, eventUid, agendaUid) {
  return location.linkedEvents.filter(linkedEvent =>
    linkedEvent.eventUid == eventUid && linkedEvent.agendaUid == agendaUid
  ).length > 0
}

function _filename(dir) {
  const now = new Date();
  const _fZ = n => (n < 10 ? '0' : '') + n;
  return `${dir}oa-nevers-unique-locations-${now.getFullYear()}-${_fZ(now.getMonth() + 1)}-${_fZ(now.getDate())}T${_fZ(now.getHours())}:${_fZ(now.getMinutes())}.csv`;
}

(async () => {

  try {

    // Api client
    const client = await SDK(_.pick(config.oa, ['secret']));
    console.log("\n");
    console.log("Phase 1: Iterate over all agendas and events");

    const locations = [];

    // Loop over all agendas target agendas
    for (const agenda of config.targetAgendas) {

      // For each agenda loop over all public events
      for (const event of await listOAEvents(agenda.uid)) {

        console.log("\n");
        console.log("Processing event", event.slug);
        console.log("uniquelocationid:", event.custom.uniquelocationid)

        // Matching location using the levenstein and geocoordinates
        const matchingLocationLevensteinGeo = _.first(locations.filter(location => locationIsSame(
          { name: location.name, latitude: location.latitude, longitude: location.longitude },
          { name: event.location.name, latitude: event.location.latitude, longitude: event.location.longitude }
        )));

        if (!event.custom.uniquelocationid) {

          console.log('Event has no uniquelocationid');

          if (!matchingLocationLevensteinGeo) {
            console.log(
              '1.1: %s, %s, %s',
              'No matching location using the levenstein+geo method',
              'No matching location using the levenstein+geo method',
              'Creating a new entry in the local index for the location',
              'Adding the event to the linkedEvents, and mark it as hasuniquelocation:false'
            );
            locations.push({
              uniquelocationid: null,
              name: event.location.name,
              latitude: event.location.latitude,
              longitude: event.location.longitude,
              linkedEvents: [{
                eventUid: event.uid,
                agendaUid: agenda.uid,
                hasUniquelocationid: false,
                patched: false
              }]
            });
            continue;
          }

          if (matchingLocationLevensteinGeo) {
            console.log(
              '1.2: %s',
              'Found a match in the local index using the levenstein+geo method'
            );
            if (!locationIsLinkedToEvent(matchingLocationLevensteinGeo, event.uid, agenda.uid)) {
              console.log("Adding the event to the linkedEvents, and mark it as hasuniquelocation:false");
              matchingLocationLevensteinGeo.linkedEvents.push({
                eventUid: event.uid,
                agendaUid: agenda.uid,
                hasUniquelocationid: false,
                patched: false
              })
            }
            continue;
          }
        }

        else {

          // Matching location using the uniquelocationid
          const matchingLocationUniquelocationid = _.first(locations.filter(location =>
            location.uniquelocationid == event.custom.uniquelocationid
          ));

          if (matchingLocationUniquelocationid) {
            console.log(
              '2.1: %s: %s, %s',
              'Event already has a uniquelocationid',
              event.custom.uniquelocationid,
              'Found a match in the local index with the same uniquelocationid'
            );
            if (!locationIsLinkedToEvent(matchingLocationUniquelocationid, event.uid, agenda.uid)) {
              console.log('Adding the event to the linkedEvents');
              matchingLocationUniquelocationid.linkedEvents.push({
                eventUid: event.uid,
                agendaUid: agenda.uid,
                hasUniquelocationid: true,
                patched: false
              });
            }
            continue;
          }

          if (matchingLocationLevensteinGeo) {
            console.log(
              '2.2: %s: %s, %s',
              'Event already has a uniquelocationid',
              event.custom.uniquelocationid,
              'Found a match in the local index using the levenstein+geo method'
            );
            if (!locationIsLinkedToEvent(matchingLocationLevensteinGeo, event.uid, agenda.uid)) {
              console.log("Updating the uniquelocationid of the matched location to:", event.custom.uniquelocationid)
              console.log("Adding the event to the linkedEvents");
              matchingLocationLevensteinGeo.uniquelocationid = event.custom.uniquelocationid;
              matchingLocationLevensteinGeo.linkedEvents.push({
                eventUid: event.uid,
                agendaUid: agenda.uid,
                hasUniquelocationid: true,
                patched: false
              });
            }
            continue;
          }

          if (!matchingLocationLevensteinGeo && !matchingLocationUniquelocationid) {
            console.log(
              '2.3: %s, %s, %s',
              'No match in the local index with the same uniquelocationid, and no match using the levenstein+geo method',
              'Creating a new entry in the local index for the location',
              'Adding the event to the linkedEvents, and mark it as hasuniquelocation:true'
            );
            locations.push({
              uniquelocationid: event.custom.uniquelocationid,
              name: event.location.name,
              latitude: event.location.latitude,
              longitude: event.location.longitude,
              linkedEvents: [{
                eventUid: event.uid,
                agendaUid: agenda.uid,
                hasUniquelocationid: true,
                patched: false
              }]
            })
          }
        }
      }
    }

    console.log("\n");
    console.log("Phase 2: Iterate over the local index and generate unique ids");
    for (const location of locations.filter(location => location.uniquelocationid == null)) {
      const newid = await generateUniqueLocationId(locations);
      console.log('Generated uniquelocationid:', newid)
      location.uniquelocationid = newid;
    }

    console.log("\n");
    console.log("Phase 3: Update events that have been marked as hasUniquelocationid:false");
    for (const location of locations) {
      for (const linkedEvent of location.linkedEvents) {
        if (!linkedEvent.hasUniquelocationid) {

          try {
            console.log("Sending PATCH request to", `/agendas/${linkedEvent.agendaUid}/events/${linkedEvent.eventUid}`);
            // PATCH the event uniquelocationid field on the server
            const res = await client.v2('patch', `/agendas/${linkedEvent.agendaUid}/events/${linkedEvent.eventUid}`, {
              data: {
                "uniquelocationid": location.uniquelocationid
              }
            });

            if (res.statusCode == 200) {
              console.log("Updating local index entry to hasUniquelocationid:true");
              linkedEvent.hasUniquelocationid = true;
              linkedEvent.patched = true;
            }
          }
          catch (e) {
            console.log("Failed patching the event");
            console.log(e);
          }
        }
      }
    }

    console.log("\n");
    console.log("Phase 4: Export the local index into a CSV file");

    const rows = [];
    for (const location of locations) {
      rows.push({
        'uniquelocationid': location.uniquelocationid,
        'name': location.name,
        'latitude': location.latitude,
        'longitude': location.longitude,
        'linkedEvents': location.linkedEvents.map(linkedEvent => linkedEvent.eventUid).join(','),
        'patchedEvents': location.linkedEvents.filter(linkedEvent => linkedEvent.patched == true).map(linkedEvent => linkedEvent.eventUid).join(',')
      });
    }

    const writtenFilepath = await writeCSVFile(_filename('./'), rows);
    console.log("Created CSV file at:", writtenFilepath);

    process.exit();

  } catch (e) {
    console.log("something went wrong");
    console.log(e);
  }

})();
