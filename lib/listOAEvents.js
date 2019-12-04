const sa = require('superagent');

module.exports = async function listOAEvents(agendaUid) {
  let result = [];

  let events;
  let offset = 0;
  const limit = 100;

  while (({ events } = await listEvents(agendaUid, offset, limit)) && events && events.length) {
    result = [...result, ...events];
    offset += limit;
  }

  return result;
};

async function listEvents(agendaUid, offset, limit) {
  const res = await sa.get(`https://openagenda.com/agendas/${agendaUid}/events.json?offset=${offset}&limit=${limit}`);
  return res.body;
}