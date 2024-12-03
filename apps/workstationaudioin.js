process.argv[5] = process.argv[2] ? process.argv[2] : `${__dirname}/../container-config/service-compose.json`;
process.argv[2] = 'callpretty';
process.argv[3] = 'service?start';
process.argv[4] = 'queryObject.serviceComposeId';
process.argv[6] = 'queryObject.service';
process.argv[7] = 'workstationaudioinpeer';
require('izy-proxy/cli');