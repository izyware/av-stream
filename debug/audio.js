/* izy-loadobject nodejs-require */
module.exports = (function() {
  var modtask = function() {};

  var debug = {
    ao: null
  };


  var probe = function(buf) {
    var debug = probe.debug;
    if (!debug) {
      probe.debug = modtask.ldmod('debug/audio');
      debug = probe.debug;
      debug.debug({
        action: 'start',
        streamProperties: {
          sampleRate: 48000,
          bitsPerSample: 16,
          numberOfChannels: 1
        }
      });
    };
    debug.debug({ action: 'onbuffer', buf });
  }

  modtask.probePCM16 = probe;
  modtask.probeFloat32 = float32Samples => {
    const audioLib = modtask.ldmod('lib/audiosignal');
    var test = audioLib.convertFloat32to16BitPCM({ float32Samples });
    modtask.probePCM16(Buffer.from(test.data));
  }

  modtask.debug = function(queryObject, cb) {
    var action = queryObject.action;
    switch(action) {
      case 'start':
        var streamProperties = queryObject.streamProperties;
        const deviceNameGrepStr = queryObject.deviceNameGrepStr || 'speaker';
        const portAudio = require('naudiodon');
        var list = portAudio.getDevices();
        var deviceId = null;
        for(var i=0; i < list.length; ++i) {
          if (list[i].maxOutputChannels < 1) continue;
          if (list[i].name.toLocaleLowerCase().indexOf(deviceNameGrepStr.toLowerCase()) >= 0) {
            deviceId = list[i].id;
            break;
          }
        }
        if (deviceId === null) return false;

        console.log();
        console.log(`--------- below text comes from create a new portAudio OUTPUT device from "${deviceNameGrepStr}"`);
        console.log('--------- if its blocking here, make sure that the device is NOT set as the default system device.');

        debug.ao = new portAudio.AudioIO({
          outOptions: {
            channelCount: 1,
            sampleFormat: streamProperties.bitsPerSample,
            sampleRate: streamProperties.sampleRate,
            deviceId,
            closeOnError: false
          }
        });
        console.log('--------- portAudio was successful!');
        debug.ao.start();
        break;
      case 'onbuffer':
        debug.ao.write(queryObject.buf);
        break;
    }
    return true;
  }

  return modtask;
})();
