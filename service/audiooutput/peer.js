/* izy-loadobject nodejs-require */
module.exports = function() {
  var modtask = function() {};

  modtask.processorBufferSize = 16384;

  modtask.setupNetwork = function(queryObject, cb) {
    const { service, serviceConfig, serviceInstance, user, verbose }  = queryObject;
    modtask.doChain([
      ['//inline/net/socket?setupClient', { 
        service, serviceConfig, serviceInstance, user, verbose,
        dataBinding: 'manual'
      }]
    ]);
  };

  modtask.onNewConnection = function(queryObject, cb) {
    const { datastreamMonitor } = modtask;
    const { connectionId, serviceInstance, verbose } = queryObject;

    const destinationNode = global.__audioDevices[serviceInstance.socketDestinationNodeId].audioNode;
    var socketReaderNode = destinationNode.audioContext.createIzySocketReaderNode({
        verbose,
        connectionId,
        dataStreamMode: 'streammodecooked',
        streamProtocol: 'streamproto1',
        dataStreamType: '16BitPCM',
        enableQOSMetrics: true
    });
    socketReaderNode.setName('socketReader');
    socketReaderNode.connect(destinationNode);

    modtask.doChain([
      ['//inline/net/connection?handshake', {
        connectionId,
        type: 'audiooutput'
      }],
      ['outcome', { success: true }]
    ]);
  };

  modtask.onConfig = function(queryObject, cb, context) {
    const { datastreamMonitor } = modtask;
    const { service, monitoringConfig } = context;
    const serviceConfig = service.composeConfig;

    // Obsolete variables. Need to stop passing these, since they are available in context
    const verbose = monitoringConfig;
    const user = service.user;

    if (service.serviceConfig) return cb({ reason: 'service is not reconfigurable' });
    service.serviceConfig = serviceConfig;

    var serviceInstance = {
      socketDestinationNodeId: null
    };

    return modtask.doChain([
      ['//inline/?setupAudioContext', {
        verbose,
        serviceConfig
      }],
      function(chain) {
        serviceInstance.socketDestinationNodeId = chain.get('outcome').data;
        chain(['continue']);
      },
      ['//inline/?setupNetwork', { service, serviceConfig, serviceInstance, user, verbose }],
      ['outcome', { success: true, data: serviceInstance }]
    ]);
  };

  modtask.setupAudioContext = async function(queryObject, cb) {
    const { datastreamMonitor } = modtask;
    const { serviceConfig } = queryObject;
    let socketDestinationNodeId = null;

    const sampleRate = 48000;
    var verbose = queryObject.verbose || {};
    const audioContext = modtask.ldmod('lib/webAudio').newAudioContext(modtask, {
      verbose,
      sampleRate
    });

    let postStreamDestinationNode = null;
    if (serviceConfig.ffmpegFilterNode) {
      const { outputDirectlyViaFFPlay } = serviceConfig.ffmpegFilterNode;
      let waveFilterNode = await audioContext.createIzyNode('audio/stream', {
          verbose,
          ffmpegFilterNode: serviceConfig.ffmpegFilterNode,
          outputDirectlyViaFFPlay
      });
      waveFilterNode.setName('ffmpeg filter');
      if (outputDirectlyViaFFPlay) {
      } else {
        console.log('WARNING: ffmpegFilterNode will always output in 16 bit. Make sure your speaker destination is configured accordingly');
        let speakerNode = await audioContext.createNodeFromXCastConfig({ config: serviceConfig, verbose });
        waveFilterNode.connect(speakerNode);
      }
      postStreamDestinationNode = waveFilterNode;
    } else {
      var speakerNode = await audioContext.createNodeFromXCastConfig({ config: serviceConfig, verbose });
      postStreamDestinationNode = speakerNode;
    }

    if (serviceConfig.beepAndPauseOnAudioInit) {
      datastreamMonitor.log({ key: 'audioNotification', msg: {
        action: 'beepAndPauseOnAudioInit'
      }});
      const oscilator = audioContext.createOscillator({
        volume: serviceConfig.beepAndPauseOnAudioInit.volume || 1,
        chunkSize: modtask.processorBufferSizem,
        frequencyInHZ: serviceConfig.beepAndPauseOnAudioInit.frequencyInHZ || 480
      });
      oscilator.connect(postStreamDestinationNode);
      await new Promise(resolve => oscilator.startWaitStop(serviceConfig.beepAndPauseOnAudioInit.timeInMilliseconds, () => resolve()));
      oscilator.disconnect();
      oscilator.destroyAudioDevice();
    }
    socketDestinationNodeId = postStreamDestinationNode.deviceId;
    return { success: true, data: socketDestinationNodeId };
  };

  return modtask;
};

module.exports.forcemodulereload = true;
