/* izy-loadobject nodejs-require */
module.exports = (function() {
  var modtask = function() {};

  modtask.attachToNode = function(queryObject, cb) {
    const audioLib = modtask.ldmod('rel:../../lib/audiosignal');
    let { path, verbose, startStreamWithWaveHeader } = queryObject;
    /* small chunksize makes it choppy and delay in between */
    var chunkSize = queryObject.chunkSize || 16384*5;
    var muteRanges = queryObject.muteRanges || null;
    var mutePattern = queryObject.mutePattern || null;
    var startMode = queryObject.startMode || 'automatic';

    var audioDeviceObject = global.__audioDevices[queryObject.deviceId];
    const { audioContext } = audioDeviceObject.audioNode;

    audioDeviceObject.inputFifoPipeName = 'ffmpegfilterinput2circus.wav';
    audioDeviceObject.outputFifoPipeName = 'ffmpegfilteroutput2circus.wav';
    audioDeviceObject.onPipeDataCBId = audioDeviceObject.outputFifoPipeName + 'datacb';
    audioDeviceObject.childProcess = null;
    audioDeviceObject.headerRecieved = false;
    audioDeviceObject.write = float32Samples => {};
    audioDeviceObject.streamProperties = null;
    audioDeviceObject.closeRequested = false;
    audioDeviceObject.close = async function(_modtaskContext) {
      audioDeviceObject.closeRequested = true;
    };

    var codec = modtask.ldmod('rel:../../codec/wav');
    path = path.replace('~', process.env.HOME);
    waveBuffer = require('fs').readFileSync(path);
    var outcome = codec.parseAndVerifyWaveBuffer({ waveBuffer, enforceDataSizeLimits: true });
    if (!outcome.success) return cb(outcome);

    var streamProperties = outcome.data.metaData;
    if (streamProperties.numberOfChannels != 1) return cb({ reason: 'only mono files allowed.'});
    if (streamProperties.sampleRate != audioContext.sampleRate) return cb({ reason: 'samplerate mismatch. file has sampleRate: ' + streamProperties.sampleRate });
    if (streamProperties.bitsPerSample != 16) return cb({ reason: 'only 16 bit allowed.'});
    audioDeviceObject.streamProperties = streamProperties;

    var datastreamMonitor = audioDeviceObject.datastreamMonitor;

    function shouldMute(percent, offsetInSeconds) {
      if (muteRanges) {
        for(var i=0; i < muteRanges.length; ++i) {
          var range = muteRanges[i];
          if (percent > range[0] && percent < range[1]) return true;
        }
      }
      if (mutePattern) {
        if (Math.round(offsetInSeconds / mutePattern.durationS) % 2 == 0) {
          return true;
        }
      }
      return false;
    }

    audioDeviceObject.start = function() {
      datastreamMonitor.log({ verbose, key: 'audioInputSample', msg: {
        action: 'start',
        audioSource: audioDeviceObject
      }});
      if (startStreamWithWaveHeader) {
        datastreamMonitor.log({ verbose, key: 'audioInputSample', msg: {
          device: audioDeviceObject.name,
          deviceId: audioDeviceObject.deviceId,
          data: 'send header'
        }});
        audioDeviceObject.audioBuffer = Buffer.from(modtask.ldmod('codec/wav').createWaveHeader({
          numChannels: streamProperties.numberOfChannels,
          sampleRate: streamProperties.sampleRate,
          bitsPerSample: streamProperties.bitsPerSample
        }));
        if (audioDeviceObject.onNewSample) {
          audioDeviceObject.onNewSample();
        }
      }

      modtask.ldmod('lib/stream').loopStreamSamplesArray(
        { samples: outcome.data.samples, streamProperties, chunkSize, bytesPerArrayItem: 1 },
        function(outcome) {
          if (!outcome.success) {
            datastreamMonitor.log({ verbose, level: 2, key: 'audioInputSample', msg: {
              device: audioDeviceObject.name,
              deviceId: audioDeviceObject.deviceId,
              reason: outcome.reason
            }});
            return;
          };
          let { percent, offsetInSeconds, buf } = outcome.data;
          if (shouldMute(percent, offsetInSeconds)) buf = Buffer.alloc(chunkSize);
          audioDeviceObject.audioBuffer = audioLib.convert16BitPCMToFloat32({ pcmSamples: buf }).data;
          if (audioDeviceObject.onNewSample) {
            audioDeviceObject.onNewSample();
          }
          return !audioDeviceObject.closeRequested;
        }
      );
    }

    if (startMode == 'automatic') audioDeviceObject.start();

    return cb({
      success: true,
      data: audioDeviceObject.deviceId
    })
  };

  return modtask;
})();

