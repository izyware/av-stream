process.argv[5] = `${__dirname}/../../queryObject.${process.argv[2] ? process.argv[2] + '.' : ''}xcast.json`;
process.argv[2] = 'callpretty';
process.argv[3] = 'vatar?service';
process.argv[4] = 'queryObject.queryObjectId';
process.argv[6] = 'queryObject.service';
process.argv[7] = 'workstationaudioout@peer';
require('izy-proxy/cli');
