/* izy-loadobject nodejs-require */
module.exports = function() {
  var modtask = function() {};

  modtask.processorBufferSize = 16384;

  modtask.setupNetwork = function(queryObject, cb) {
    const { service, serviceConfig, serviceInstance, user }  = queryObject;
    modtask.doChain([
      ['//inline/net/socket?setupClient', { 
        service, serviceConfig, serviceInstance, user,
        dataBinding: 'manual'
      }]
    ]);
  };

  modtask.onNewConnection = function(queryObject, cb, context) {
    const { service } = context;
    const { datastreamMonitor } = modtask;
    const { connectionId, serviceInstance } = queryObject;
    const { composeConfig } = service;

    modtask.checkIfAudoCrashIsEnabled(serviceInstance);
    const destinationNode = global.__audioDevices[serviceInstance.socketDestinationNodeId].audioNode;
    // destinationNode.disconnect();
    var socketWriterNode = destinationNode.audioContext.createIzySocketWriterNode({
      connectionId,
      streamProtocol: 'streamproto1',
      // dataStreamType: '16BitPCM', // composeConfig.dataStreamType
      isSilentWhenPowerIsBelow: composeConfig.isSilentWhenPowerIsBelow,
      stopStreamingWhenSilent: composeConfig.stopStreamingWhenSilent,
      downsampleRatio: composeConfig.downsampleRatio
    });
    socketWriterNode.getMetaDataStrFunction = () => '__nothing__'
    socketWriterNode.setName('socketWriter');
    destinationNode.connect(socketWriterNode);

    modtask.doChain([
      ['//inline/net/connection?handshake', {
        connectionId,
        type: 'audioinput'
      }],
      ['outcome', { success: true }]
    ]);
  };

  modtask.checkIfAudoCrashIsEnabled = function(serviceInstance) {
    const crashAfterTimeSeconds = serviceInstance.crashAfterTimeSeconds;
    let totalUpTimeSeconds = 0;
    if (crashAfterTimeSeconds) {
      console.log('**************** AUTOCRASH IN ' + crashAfterTimeSeconds);
      setInterval(function() {
        totalUpTimeSeconds++;
        if (totalUpTimeSeconds > crashAfterTimeSeconds) {
          console.log(new Date() + 'crashing: totalUpTimeSeconds', totalUpTimeSeconds);
          process.exit(0);
        }
      }, 1000);
    }
  }

  modtask.useAudioCopy = function(queryObject, cb) {
    const { user } = queryObject;
    const { address, deviceNameGrepStr } = queryObject.serviceConfig;
    if (!deviceNameGrepStr) return cb({ reason: 'specify deviceNameGrepStr' });
    if (!user) return cb({ reason: 'specify user' });

    const portAudio = require('naudiodon');
    let namesChecked = [];
    const inputDeviceId = portAudio.getDevices().reduce((p,c) => ((namesChecked.push(c.name) || c.maxInputChannels) > 0 && c.name.toLowerCase().indexOf(deviceNameGrepStr.toLowerCase()) >= 0) ? c.id: p, -1);
    if (inputDeviceId == -1) return cb({ reason: 'useAudioCopy - cannot find input device: ' + deviceNameGrepStr + '. checked: ' + namesChecked.join('\n') });

    const cmd = `node tools/acp.js ${inputDeviceId} ${address} 0.5 1 ${user.id}`;
    console.log(`${(new Date()).toLocaleString()}: ${cmd}`);
    modtask.doChain([
      ['//inline/lib/shell?exec', {
        cmd
      }],
      chain => {
        console.log(new Date(), 'stop here');
      }
    ]);
  }


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
      socketDestinationNodeId: null,
      dataStreamType: serviceConfig.dataStreamType,
      crashAfterTimeSeconds: serviceConfig.crashAfterTimeSeconds
    };

    if (serviceConfig.mode == 'useAudioCopy') {
      if (serviceConfig.dataStreamType != '16BitPCM') return cb({ reason: 'pick dataStreamType 16BitPCM for useAudioCopy mode.' });
      return modtask.doChain([
        ['//inline/?useAudioCopy', {
          user,
          serviceConfig
        }]
      ]);
    };
    return modtask.doChain([
      ['//inline/?speakerAudioContext', {
        serviceConfig
      }],
      function(chain) {
        serviceInstance.socketDestinationNodeId = chain.get('outcome').data;
        chain(['continue']);
      },
      ['//inline/?setupNetwork', { service, serviceConfig, serviceInstance, user, verbose }],
      ['outcome', { success: true }]
    ]);
  };

  modtask.speakerAudioContext = function(queryObject, cb, context) {
    const { serviceConfig } = queryObject;
    let socketDestinationNodeId = null;

    const perform = async () => {
      const sampleRate = serviceConfig.sampleRate || 48000;
      var verbose = context.monitoringConfig || {};
      const audioContext = modtask.ldmod('lib/webAudio').newAudioContext(modtask, {
        verbose,
        sampleRate
      });

      let postStreamDestinationNode = null;
      if (serviceConfig.ffmpegFilterNode) {
        // Since everyone uses ffmpeg (streamInputDeviceAsWave) just throw the filters in there
        // no additional nodes required.
        console.log('NOT SUPPORTE YET');process.exit(0);return;
      } else {
        var audioInputNode = await audioContext.createNodeFromXCastConfig({ config: serviceConfig, verbose });
        audioInputNode.start();
        postStreamDestinationNode = audioInputNode;
      }
      socketDestinationNodeId = postStreamDestinationNode.deviceId;
    };
    perform().then(() => {
        cb({ success: true, data: socketDestinationNodeId });
    }).catch(e => cb({ reason: e.message }));
  };

  return modtask;
}
module.exports.forcemodulereload = true;

