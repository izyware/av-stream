/* izy-loadobject nodejs-require */
module.exports = (function() {
  var modtask = function() {};

  class nonBrowserAudioNode {
    constructor(data) {
      if (!data.deviceId) throw { message: 'specify deviceId' };
      Object.defineProperty(this, 'deviceId', {
        enumerable: true,
        writable: false,
        value: data.deviceId
      });

      if (!data.audioContext) throw { message: 'specify audioContext' };

      /* Standard propery defined by Webaudio API */
      Object.defineProperty(this, 'context', {
        enumerable: true,
        writable: false,
        value: data.audioContext
      });

      /* Todo: remove this. redundant considering the above */
      Object.defineProperty(this, 'audioContext', {
        enumerable: true,
        writable: false,
        value: data.audioContext
      });

      Object.defineProperty(this, 'nativeAudioNode', {
        enumerable: true,
        writable: true,
        value: null
      });

      Object.defineProperty(this, 'outputNodes', {
        enumerable: true,
        writable: false,
        value: {}
      });

      Object.defineProperty(this, 'inputNodes', {
        enumerable: true,
        writable: false,
        value: {}
      });

      Object.defineProperty(this, 'name', {
        enumerable: true,
        writable: true,
        value: data.name || ''
      });

      this.storeLib = modtask.ldmod('rel:globals');
      this.verbose = this.audioContext.verbose || {};

      this.destroyed = false;
      this.context.trackAudioNode(this);
    }

    setName(name) {
      this.name = name;
      const audioDevice = this.getDeviceObject();
      audioDevice.name = name;
      audioDevice.datastreamMonitor.log({ msg: {
        action: 'setName',
        audioSource: this.getDeviceObject(),
        deviceId: audioDevice.deviceId
      }});
    }

    audioDeviceDataExchange(storeLib, audioDeviceObject) {
      return function() {
        let verbose = audioDeviceObject.audioNode.verbose || {};
        if (!audioDeviceObject.audioBuffer) {
          return { reason: 'invalid device state. audioBuffer is not set: ' + audioDeviceObject.name };
        }

        if (!audioDeviceObject.streamProperties) {
          return { reason: 'streamProperties is not set: ' + audioDeviceObject.name };
        }
        let monitorData = audioDeviceObject.datastreamMonitor(audioDeviceObject.audioBuffer.byteLength / 4).data;
        audioDeviceObject.QOSOutputMetrics = monitorData;
        let destinations = [];
        for(let _deviceId in audioDeviceObject.audioNode.outputNodes) {
          let destDeviceObject = {};
          try {
            destDeviceObject = storeLib.get('audioDevices')[_deviceId];
            destDeviceObject.write(audioDeviceObject.audioBuffer);
            destinations.push(destDeviceObject);
          } catch(e) {
            audioDeviceObject.datastreamMonitor.log({ verbose, level: 2, key: 'audioStreamBetweenNodes', msg: {
                name: JSON.stringify(destDeviceObject.name),
                deviceId: destDeviceObject.name ? null : destDeviceObject.deviceId,
                reason: 'destination device failed (see console.log for callstack): ' + e.message
            }});
            console.log(e);
          }
        };

        if ((monitorData.shouldLog || verbose.audioStreamBetweenNodesLogAllStreamData) && destinations.length) {
          const name = JSON.stringify(audioDeviceObject.name || audioDeviceObject.deviceId);
          let shouldLog = true;
          if (verbose.audioStreamBetweenNodesGrepStr) {
            if (name.indexOf(verbose.audioStreamBetweenNodesGrepStr) == -1) shouldLog = false;
          }
          if (shouldLog) {
            const msg = {
              action: 'audioDeviceDataExchange',
              audioSource: audioDeviceObject,
              audioDestinations: destinations,
              total: monitorData.totalFriendly,
              samplesPerSecond: monitorData.samplesPerSecondFriendly
            };
            if (verbose.audioStreamBetweenNodesLogAllStreamData) msg.currentPayloadByteLength = audioDeviceObject.audioBuffer.byteLength;
            audioDeviceObject.datastreamMonitor.log({ msg });
          }
        }
        return { success: true };
      }
    };

    setupStreamingForAudioDevice(audioDeviceObject) {
      const fn = this.audioDeviceDataExchange(this.storeLib, audioDeviceObject);
      audioDeviceObject.onNewSample = () => {
        let outcome = {};
        try {
          outcome = fn();
        } catch(e) {
          outcome = { reason: e.message };
        }
        if (!outcome.success) {
          // use try-catch incase audioDeviceObject.datastreamMonitor is not defined
          try {
            audioDeviceObject.datastreamMonitor.log({ verbose: audioDeviceObject.audioNode.verbose, level: 2, key: 'audioStreamBetweenNodes', msg: {
              action: 'onAudioNodeSample',
              name: audioDeviceObject.name,
              deviceId: audioDeviceObject.deviceId,
              reason: outcome.reason
            }});
          } catch(e) {
            console.log('warning: audioDeviceObject.datastreamMonitor.log failed: ', audioDeviceObject.deviceId, e);
          }
        }
      }
    }

    createAudioDevice(queryObject) {
      if (!queryObject) queryObject = {};
      var verbose = this.audioContext.verbose || {};
      var audioDeviceObject = {
        name: queryObject.name || '',
        deviceId: this.deviceId,
        audioNode: this,
        start: () => console.log('WARNING: start not implemented for ' + audioDeviceObject.deviceId)
      };
      audioDeviceObject.streamProperties = {
        sampleRate: this.audioContext.sampleRate,
        numberOfChannels: queryObject.numberOfChannels || 1,
        bitsPerSample: queryObject.bitsPerSample || 32
      };
      this.storeLib.get('audioDevices')[this.deviceId] = audioDeviceObject;
      let { datastreamMonitor } = this.audioContext._modtaskContext;
      if (datastreamMonitor && datastreamMonitor.createForStreamMonitoring) {
        audioDeviceObject.datastreamMonitor = datastreamMonitor.createForStreamMonitoring({
          intervalSeconds: verbose.audioInputLogginIntervalSeconds,
          streamProperties: audioDeviceObject.streamProperties
        });
        audioDeviceObject.datastreamMonitor.log({ msg: { action: 'createAudioDevice', deviceId: this.deviceId }});
      } else {
        console.log('warning: createAudioDevice being used in legacy mode');
        audioDeviceObject.datastreamMonitor = modtask.ldmod('rel:monitoring').create({
          intervalSeconds: verbose.audioInputLogginIntervalSeconds,
          streamProperties: audioDeviceObject.streamProperties
        });
      }
      this.setupStreamingForAudioDevice(audioDeviceObject);
    }

    destroyAudioDevice() {
      const audioDevice = this.getDeviceObject();
      audioDevice.datastreamMonitor.log({ msg: {
        action: 'destroyAudioDevice',
        audioSource: audioDevice
      }});
      this.destroyed = true;
      delete this.storeLib.get('audioDevices')[this.deviceId];
    }

    getDeviceObject(allowNulls) {
      var deviceId = this.deviceId;
      var audioDeviceObject = this.storeLib.get('audioDevices')[deviceId];
      if (!allowNulls && !audioDeviceObject) throw { message: 'Cannot find deviceObject: ' + deviceId };
      return audioDeviceObject;
    }

    disconnect(destAudioNode) {
      // If no parameters are provided, all outgoing connections are disconnected
      if (!destAudioNode) {
        for(var deviceId in this.outputNodes) {
          this.disconnect(this.outputNodes[deviceId]);
        }
        return;
      }
      const audioDeviceObject = this.getDeviceObject(true);
      try {
        if (!audioDeviceObject) {
          console.log('WARNING: disconnect could not find audioDeviceObject', this.deviceId);
          return;
        }
        if(audioDeviceObject.datastreamMonitor) audioDeviceObject.datastreamMonitor.log({ msg: {
          action: 'disconnect',
          audioSource: audioDeviceObject,
          audioDestinations: [destAudioNode]
        }});
        delete this.outputNodes[destAudioNode.deviceId];
        delete destAudioNode.inputNodes[this.deviceId];
        if (this.nativeAudioNode) { 
          audioDeviceObject.datastreamMonitor.log({ msg: {
            action: 'disconnect',
            audioSource: audioDeviceObject,
            data: 'native: ' + typeof(this.nativeAudioNode.disconnect)
          }});
          if (this.nativeAudioNode.disconnect)
            this.nativeAudioNode.disconnect();
        };
      } catch(e) {
        audioDeviceObject.datastreamMonitor.log({ level:2, msg: {
          action: 'disconnect',
          errorObject: e
        }});
      }
    }

    connect(destAudioNode) {
      const nativeMode = !!this.nativeAudioNode && destAudioNode.nativeAudioNode;
      var audioDeviceObject = this.getDeviceObject();
      if (!destAudioNode.deviceId) {
        throw { message: this.deviceId + ' cannot connect to a device with no id' };
      }
      if(audioDeviceObject.datastreamMonitor) audioDeviceObject.datastreamMonitor.log({ msg: {
        action: 'connect',
        audioSource: audioDeviceObject,
        audioDestinations: [destAudioNode],
        nativeMode
      }});
      if (nativeMode) {
        this.nativeAudioNode.connect(destAudioNode.nativeAudioNode);
        return;
      }
      if (!this.outputNodes) throw { reason: audioDeviceObject.deviceId + ' does not have outputNodes' };
      this.outputNodes[destAudioNode.deviceId] = destAudioNode;
      if (!destAudioNode.inputNodes) throw { reason: destAudioNode.deviceId + ' does not have inputNodes' };
      destAudioNode.inputNodes[this.deviceId] = this;
      return destAudioNode;
    }

    // note: W3C defines this method only for AudioScheduledSourceNode
    start() {
      var audioDeviceObject = this.getDeviceObject();
      audioDeviceObject.start();
    }

    // note: W3C defines this method only for AudioScheduledSourceNode
    // The ended event of the AudioScheduledSourceNode interface is fired when the source node has stopped playing
    stop(whenInSeconds) {
      const audioDeviceObject = this.getDeviceObject(true);
      try {
        if (!audioDeviceObject) {
          console.log('WARNING: stop could not find audioDeviceObject', this.deviceId);
          return;
        }
        audioDeviceObject.datastreamMonitor.log({ msg: {
          action: 'stop',
          audioSource: audioDeviceObject,
          data: 'Shutdown I/O for device'
        }});
        audioDeviceObject.onNewSample = () => {}; // console.log('onNewSample_disabled');
        audioDeviceObject.write = float32Samples => {}; // console.log('write_disabled');

        if (this.nativeAudioNode) { 
          audioDeviceObject.datastreamMonitor.log({ msg: {
            action: 'stop',
            audioSource: audioDeviceObject,
            data: 'native: ' + typeof(this.nativeAudioNode.stop)
          }});
          if (this.nativeAudioNode.stop)
            this.nativeAudioNode.stop();
        }; 
        // TODO: emit a 'ended' event that visualizer can use. for this, we need to implement EventTarget interface
      } catch(e) {
        audioDeviceObject.datastreamMonitor.log({ msg: {
          action: 'stop',
          errorObject: e
        }});
      }
    }

    // audioNode.close
    async close() {
      const audioDeviceObject = this.getDeviceObject(true);
      try {
        if (!audioDeviceObject) {
          console.log('WARNING: close could not find audioDeviceObject', this.deviceId);
          return;
        }
        this.destroyAudioDevice();
        if (this.nativeAudioNode) { 
          audioDeviceObject.datastreamMonitor.log({ msg: {
            action: 'close',
            audioSource: audioDeviceObject,
            data: 'native: ' + typeof(this.nativeAudioNode.close)
          }});
          if (this.nativeAudioNode.close)
            this.nativeAudioNode.close();
        }; 
      } catch(e) {
        audioDeviceObject.datastreamMonitor.log({ msg: {
          action: 'close',
          errorObject: e
        }});
      }
    }
  }

  /*
    non-interleaved IEEE754 32-bit linear PCM with a nominal range between -1 and +1
    that is, a 32-bit floating point buffer, with each sample between -1.0 and 1.0.
    If the AudioBuffer has multiple channels, they are stored in separate buffers.
  */
  class nonBrowserAudioBuffer {
    constructor(options) {
      Object.defineProperty(this, 'length', {
        enumerable: true,
        writable: false,
        value: options.channelData[0].length
      });

      Object.defineProperty(this, 'sampleRate', {
        enumerable: true,
        writable: false,
        value: options.sampleRate
      });

      Object.defineProperty(this, 'duration', {
        enumerable: true,
        writable: false,
        value: options.channelData[0].length / options.sampleRate
      });

      Object.defineProperty(this, 'numberOfChannels', {
        enumerable: true,
        writable: false,
        value: options.channelData.length
      });

      Object.defineProperty(this, 'channelData', {
        enumerable: false,
        writable: false,
        value: options.channelData
      });
    }

    getChannelData(channelNumber) {
      return this.channelData[channelNumber];
    }
  }

  class nonBrowserScriptProcessor extends nonBrowserAudioNode {
    constructor(data) {
      // data: bufferSize, numberOfInputChannels, numberOfOutputChannels
      super(data);
      this.ignoreIncomingStream = false;
      if (data.checkForExternalScriptProcessor) this.ignoreIncomingStream = true;
      this.dataStreamMode = data.dataStreamMode || 'streammodecooked';
      this.newData = new Float32Array(0);
      this.bufferSize = data.bufferSize || 8192;
      this.dynamicResampleRate = data.dynamicResampleRate || null;
      this.createAudioDevice();
      const audioDeviceObject = this.getDeviceObject();
      audioDeviceObject.dynamicResampleRate = this.dynamicResampleRate;
      audioDeviceObject.bytesPerArrayItem = 4;
      this.setupNative();
      this.getDeviceObject().write = float32Samples => {
        if (this.ignoreIncomingStream) {
          this.externalScriptProcessorObject = data.checkForExternalScriptProcessor();
          if (this.externalScriptProcessorObject) {
            this.ignoreIncomingStream = false;
            this.makeInternalBufferAvailableToExternalScriptProcessor();
          }
        }
        var verbose = this.audioContext.verbose || {};
        var reason = null;
        if (this.dataStreamMode == 'streammodecooked') {
          if (!(float32Samples instanceof Float32Array)) {
            reason = 'script processor recieved non Float32Array data';
          }
          if (reason) {
            audioDeviceObject.datastreamMonitor.log({ evel: 2, msg: {
              audioSource: audioDeviceObject,
              reason
            }});
            return ;
          }
          if (this.dynamicResampleRate) {
            float32Samples = this.adjustSampleBufferSizeToNewFrequency({ float32Samples, dynamicResampleRate: this.dynamicResampleRate, verbose });
          }
          this.newData = this.Float32Concat(this.newData, float32Samples);
          if (data.getBufferDepth) data.getBufferDepth(this.newData.length);
          if (this.externalScriptProcessorObject) return;
          var outcome = this.getNextBuffer(this.newData);
          if (!outcome.ready) return;
          float32Samples = outcome.data;
          this.newData = outcome.leftOverData;
        }
        if (this.onaudioprocess) {
          let inputBuffer = new nonBrowserAudioBuffer({ channelData: [float32Samples], sampleRate: this.audioContext.sampleRate }),
          outputBuffer = new nonBrowserAudioBuffer({ channelData: [new Float32Array(float32Samples.length)], sampleRate: this.audioContext.sampleRate });
          this.onaudioprocess({
            inputBuffer,
            outputBuffer
          });
          float32Samples = outputBuffer.getChannelData(0);
        }
        audioDeviceObject.audioBuffer = float32Samples;
        if (audioDeviceObject.onNewSample) {
          audioDeviceObject.onNewSample();
        }
      }
    }

    setupNative(data) {
      if (!this.audioContext.nativeAudioContext) {
        return;
      }
      const audioDeviceObject = this.getDeviceObject();
      audioDeviceObject.datastreamMonitor.log({ msg: {
        action: 'setupNative',
        audioSource: audioDeviceObject
      }});
      const processorBufferSize = this.bufferSize; // 4096 * 2;
      this.nativeAudioNode = this.audioContext.nativeAudioContext.createScriptProcessor(processorBufferSize, 1, 1);

      // without this, the streaming won't start - should we move this into .start()?
      if (this.audioContext.nativeAudioContext.destination)
        this.nativeAudioNode.connect(this.audioContext.nativeAudioContext.destination);

      this.nativeAudioNode.onaudioprocess = function(e) {
        audioDeviceObject.audioBuffer = e.inputBuffer.getChannelData(0);
        if (audioDeviceObject.onNewSample) {
          audioDeviceObject.onNewSample();
        }
      };
      return this.nativeAudioNode;
    }

    adjustSampleBufferSizeToNewFrequency(queryObject) {
      const { float32Samples, verbose, dynamicResampleRate } = queryObject;
      if (float32Samples.length <= 1) return float32Samples;

      verbose.dynamicSamplingAdjustment = false;

      const resizeBufferToSize = Math.round(this.audioContext.sampleRate / dynamicResampleRate * float32Samples.length);
      const resizedSamples = new Float32Array(resizeBufferToSize);
      const factor = Math.round(float32Samples.length / (resizeBufferToSize - float32Samples.length));
      function makePass(additionalInsertsFactor, additionalInserts) {
        if (verbose.dynamicSamplingAdjustment) console.log('makePass', additionalInsertsFactor);
        let j = 0;
        for(let i=0; i < float32Samples.length; ++i) {
          if (j >= resizedSamples.length) break;
          resizedSamples[j++] = float32Samples[i];
          if ((i % factor) == 0) {
            if (j >= resizedSamples.length) break;
            resizedSamples[j++] = (float32Samples[i] + float32Samples[i+1]) / 2;
          }
          if (additionalInsertsFactor) {
            if ((j % additionalInsertsFactor) == 0 && additionalInserts > 0) {
              additionalInserts--;
              if (j >= resizedSamples.length) break;
              resizedSamples[j++] = resizedSamples[j];
            }
          }
        }
        return j;
      }

      let additionalInsertsFactor = 0;
      let deltaFromLastPass = 0;
      let loopCounter = 0;
      do {
        let totalInsertions = makePass(additionalInsertsFactor, deltaFromLastPass);
        deltaFromLastPass = resizeBufferToSize - totalInsertions;
        if (deltaFromLastPass > 0) {
          additionalInsertsFactor = Math.round(resizeBufferToSize / deltaFromLastPass / 2);
        }
        loopCounter++;
        if (verbose.dynamicSamplingAdjustment) console.log('loopCounter', loopCounter, { resizeBufferToSize, totalInsertions, deltaFromLastPass, additionalInsertsFactor });
      } while(deltaFromLastPass && loopCounter < 3);
      if (deltaFromLastPass != 0) {
        console.log('Could not do dynamic adjustment properly', deltaFromLastPass, resizeBufferToSize, float32Samples.length, factor);
        process.exit(0);
      }
      return resizedSamples;
    }

    makeInternalBufferAvailableToExternalScriptProcessor() {
      const audioDeviceObject = this.getDeviceObject();
      audioDeviceObject.datastreamMonitor.log({ msg: {
        action: 'makeInternalBufferAvailableToExternalScriptProcessor',
        audioSource: audioDeviceObject
      }});
      const bufferSize = this.externalScriptProcessorObject.bufferSize;
      this.bufferSize = bufferSize;
      audioDeviceObject.numBufferMisses = 0;
      this.externalScriptProcessorObject.onaudioprocess = audioProcessingEvent => {
        var outputBuffer = audioProcessingEvent.outputBuffer;
        var outputData = outputBuffer.getChannelData(0);
        var outcome = this.getNextBuffer(this.newData);
        if (!outcome.ready) {
          audioDeviceObject.numBufferMisses++;
          return;
        }
        let float32Samples = outcome.data;
        this.newData = outcome.leftOverData;
        if (float32Samples.length != this.bufferSize) console.log('WARNING: float32Samples.length != this.bufferSize');
        for (var sample = 0; sample < float32Samples.length; sample++) {
          outputData[sample] = float32Samples[sample];
        }
      };
    }

    getNextBuffer(currentBuffer) {
      if (currentBuffer.length < this.bufferSize) {
          return { success: true, ready: false };
      }
      var data = currentBuffer.slice(0, this.bufferSize);
      var leftOverData = currentBuffer.slice(this.bufferSize);
      return { success: true, ready: true, data, leftOverData };
    }

    Float32Concat(first, second) {
        var firstLength = first.length,
            result = new Float32Array(firstLength + second.length);
        result.set(first);
        result.set(second, firstLength);
        return result;
    }
  }

  class streamproto1 {
    constructor(data) {
      this.totalElementsInHead = 6;
      if (!data) data = {};
      if (!data.audioDeviceObject) throw { message: 'streamproto1 requires audioDeviceObject' };
      this.audioDeviceObject = data.audioDeviceObject;
      if (!data.datastreamMonitor) throw { message: 'streamproto1 requires datastreamMonitor' };
      this.datastreamMonitor = data.datastreamMonitor;
      this.connectionId = data.connectionId;
      this.dataStreamType = data.dataStreamType;
      this.verbose = data.verbose || {};
      this.audioLib = modtask.ldmod('rel:audiosignal');
      this.storeLib = modtask.ldmod('rel:globals');
      this.sequenceNumber = 0;
      this.enableQOSMetrics = data.enableQOSMetrics;
      this.QOSMetrics = {
        head: null,
        qosTimestamp: null
      };
      this.qosWriter = data.qosWriter;
      this.onMetaDataPacket = data.onMetaDataPacket;
      this.onAudioPacket = data.onAudioPacket;
      this.resetStreamParserState();
    }

    resetStreamParserState(keepLeftoverData) {
      let abChunk;
      if (keepLeftoverData)
        abChunk = this.streamParserState.abChunk;
      else
        abChunk = new ArrayBuffer(0);

      this.streamParserState = {
        handler: 'head',
        scanFor: 'head',
        head: null,
        abChunk
      };
    }

    readNextBytes(ab, len) {
      if (ab.byteLength < len) return {};
      const payload = ab.slice(0, len);
      const remainder = ab.slice(len);
      return { payload, remainder };
    }

    abConcat(buffer1, buffer2) {
      var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
      tmp.set(new Uint8Array(buffer1), 0);
      tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
      return tmp.buffer;
    }

    readIncomingDataStream(abChunk) {
      let outcome = { reason: 'readIncomingDataStream' };
      const verbose = this.verbose;
      if (abChunk.byteLength == 0) {
        outcome = { success: true };
        return outcome;
      }
      if (this.streamParserState.scanFor == 'head') {
        return this.searchForHead(abChunk);
      }
      outcome = this[this.streamParserState.handler](abChunk);
      if (!outcome.success) return outcome;
      if (outcome.status == 'waiting') return outcome;
      this.datastreamMonitor.log({ verbose, key: 'streamProtocol', msg: {
        action: 'readIncomingDataStream',
        connectionId: this.connectionId,
        audioSource: this.audioDeviceObject,
        streamParserState: this.streamParserState,
        byteLength: abChunk.byteLength
      }});
      this.resetStreamParserState(true);
      return outcome;
    }

    searchForHead(abChunk) {
      const headItemLength = 4;
      const headByteLength = headItemLength*this.totalElementsInHead;
      const verbose = this.verbose;

      let headNotFound = true;
      let head = null, remainder, payload;
      let outcome;
      let byteLengthSkipped = 0;
      while(headNotFound) {
        outcome = this.expectData(abChunk, { minByteLength: headByteLength });
        abChunk = null;
        if (outcome.status != 'ready') {
          return outcome;
        }
        remainder = outcome.data.remainder;
        payload = outcome.data.payload;
        const dv = new DataView(payload);
        let headItemIndex = 0;
        const littleEndian = true;
        head = {
          magicNumber: dv.getUint32(headItemLength*headItemIndex++, littleEndian),
          type: dv.getUint32(headItemLength*headItemIndex++, littleEndian),
          byteLength: dv.getUint32(headItemLength*headItemIndex++, littleEndian),
          sequenceNumber: dv.getUint32(headItemLength*headItemIndex++, littleEndian),
          ts: this.uint32ts([dv.getUint32(headItemLength*headItemIndex++, littleEndian), dv.getUint32(headItemLength*headItemIndex++, littleEndian)])
        };

        if (head.magicNumber == 0x01020304) {
          headNotFound = false;
          if (byteLengthSkipped) {
            this.datastreamMonitor.log({ level: 2, key: 'streamProtocol', msg: {
              action: 'badheader',
              connectionId: this.connectionId,
              audioSource: this.audioDeviceObject,
              data: 'resolved',
              byteLengthSkipped
            }});
          }
          break;
        }
        if (!byteLengthSkipped) {
          this.datastreamMonitor.log({ level: 2, key: 'streamProtocol', msg: {
            action: 'badheader',
            connectionId: this.connectionId,
            audioSource: this.audioDeviceObject,
            data: 'skip over until header is found'
          }});
        }
        byteLengthSkipped++;
        this.streamParserState.abChunk = this.streamParserState.abChunk.slice(1);
      }
      this.streamParserState.head = head;
      this.datastreamMonitor.log({ verbose, key: 'streamProtocol', msg: {
        action: 'searchForHead',
        connectionId: this.connectionId,
        audioSource: this.audioDeviceObject,
        streamParserState: this.streamParserState,
        byteLengthSkipped
      }});
      const headTypeMap = {
        1: 'readAudioPacket',
        2: 'readMetadataPacket'
      };
      this.streamParserState.handler = headTypeMap[head.type];
      if (!this.streamParserState.handler) {
        outcome = { reason: 'invalid type ' + head.type };
        this.datastreamMonitor.log({ verbose, level: 2, key: 'streamProtocol', msg: {
          name: this.audioDeviceObject.name,
          connectionId: this.connectionId,
          streamParserState: this.streamParserState,
          outcome
        }});
        return outcome;
      }
      this.streamParserState.scanFor = 'data';
      this.streamParserState.abChunk = new ArrayBuffer(0);
      return this.readIncomingDataStream(remainder);
    }

    tsUint32() {
      const ts = new Float64Array([new Date().getTime()]);
      return new Uint32Array(ts.buffer);
    }

    uint32ts(uint32Arr) {
      return new Float64Array(new Uint32Array([uint32Arr[0], uint32Arr[1]]).buffer)[0];
    }

    writeHead(abChunkWriter, head) {
      head.magicNumber = 0x01020304;
      head.ts = this.tsUint32();
      this.datastreamMonitor.log({ key: 'streamProtocol', msg: {
        action: 'writeHead',
        connectionId: this.connectionId,
        audioSource: this.audioDeviceObject,
        head
      }});
      const head32Array = new Uint32Array([head.magicNumber, head.type, head.byteLength, head.sequenceNumber, head.ts[0], head.ts[1]]);
      if (head32Array.length != this.totalElementsInHead) throw { message: 'update totalElementsInHead to ' + head32Array.length };
      abChunkWriter(head32Array.buffer);
    }

    writeMetadataPacket(abChunkWriter, metaDataStr) {
      const verbose = this.verbose;
      const metaDataUTF16Codes = new Uint16Array(metaDataStr.length);
      for(let i=0; i < metaDataStr.length; ++i)
        metaDataUTF16Codes[i] = metaDataStr.charCodeAt(i);

      this.writeHead(abChunkWriter, {
        type: 2,
        byteLength: metaDataUTF16Codes.byteLength,
        sequenceNumber: this.sequenceNumber
      });

      this.datastreamMonitor.log({ key: 'streamProtocol', msg: {
        action: 'writeMetadataPacket',
        connectionId: this.connectionId,
        audioSource: this.audioDeviceObject,
        byteLength: metaDataUTF16Codes.byteLength
      }});
      abChunkWriter(metaDataUTF16Codes.buffer);
      return { success: true };
    }

    expectData(abChunk, condition) {
      if (abChunk) {
        this.streamParserState.abChunk = this.abConcat(this.streamParserState.abChunk, abChunk);
      }
      let outcome = { success: true, status: 'waiting' };
      if (condition.minByteLength) {
        if (this.streamParserState.abChunk.byteLength < condition.minByteLength) {
          return outcome;
        }
        const { remainder, payload } = this.readNextBytes(this.streamParserState.abChunk, condition.minByteLength);
        outcome = { success: true, status: 'ready', data: { remainder, payload }};
      }
      return outcome;
    }

    readMetadataPacket(abChunk) {
      const outcome = this.expectData(abChunk, { minByteLength: this.streamParserState.head.byteLength });
      if (outcome.status != 'ready') return outcome;
      const { remainder, payload } = outcome.data;
      this.streamParserState.abChunk = remainder;
      const metaDataUTF16Codes = new Uint16Array(payload);
      const metaDataStr = metaDataUTF16Codes.reduce((prev, utf16Code) => prev + String.fromCharCode(utf16Code), '');
      try {
        this.onMetaDataPacket(metaDataStr, this.streamParserState.head);
      } catch(e) {
        console.log('WARNING: onMetaDataPacket', e);
      }
      return { success: true, status: 'ready' };
    }

    writeAudioPacket(float32Samples, abChunkWriter) {
      const verbose = this.verbose;
      let outcome = this.audioLib.convertFloat32toArrayBuffer({ float32Samples, dataStreamType: this.dataStreamType });
      if (!outcome.success) return outcome;
      const abChunk = outcome.data;
      this.writeHead(abChunkWriter, {
        type: 1,
        byteLength: abChunk.byteLength,
        sequenceNumber: this.sequenceNumber++
      });
      this.datastreamMonitor.log({ verbose, key: 'streamProtocol', msg: {
        action: 'writeMetadataPacket',
        connectionId: this.connectionId,
        audioSource: this.audioDeviceObject,
        byteLength: abChunk.byteLength
      }});
      abChunkWriter(abChunk);
      return { success: true };
    }

    readAudioPacket(abChunk) {
      let outcome = this.expectData(abChunk, { minByteLength: this.streamParserState.head.byteLength });
      if (outcome.status != 'ready') return outcome;
      const { remainder, payload } = outcome.data;
      this.streamParserState.abChunk = remainder;
      const audioDeviceObject = this.audioDeviceObject;
      outcome = this.audioLib.convertArrayBufferToFloat32({ abChunk: payload, dataStreamType: this.dataStreamType });
      this.updateQOSMetrics(this.streamParserState.head);
      try {
        this.onAudioPacket(outcome.data, this.streamParserState.head);
      } catch(e) {
        console.log('WARNING: onAudioPacket', e);
      }
      if (outcome.success) {
        function upSample(float32SamplesSource) {
          if (!audioDeviceObject.upsampleRatio) {
            return float32SamplesSource;
          }
          const ratio = audioDeviceObject.upsampleRatio;
          const ret = new Float32Array(float32SamplesSource.length * ratio);
          for(let i=0; i < float32SamplesSource.length; ++i) {
            for(let j=0; j < ratio; ++j) {
              ret[i*ratio+j] = float32SamplesSource[i];
            }
          }
          return ret;
        }
        audioDeviceObject.audioBuffer = upSample(outcome.data);
        if (audioDeviceObject.onNewSample) {
          audioDeviceObject.onNewSample();
        }
        // strip out data
        outcome = { success: true };
      }
      return outcome;
    }

    updateQOSMetrics(head) {
      const verbose = this.verbose || {};
      if (this.enableQOSMetrics) {
        try {
          const audioDeviceObject = this.audioDeviceObject;
          this.QOSMetrics.head = head;
          this.QOSMetrics.qosTimestamp = new Date().getTime();
          this.qosWriter(this.QOSMetrics);
          this.datastreamMonitor.log({ verbose, key: 'QOSMetrics', msg: {
            name: audioDeviceObject.name,
            action: 'qosWriter',
            QOSMetrics: this.QOSMetrics
          }});
        } catch(e) {
          this.datastreamMonitor.log({ verbose, level: 2, key: 'QOSMetrics', msg: {
            name: audioDeviceObject.name,
            errorObject: e
          }});
        }
      }
    }
  }

  class nonBrowserSocketReaderNode extends nonBrowserAudioNode {
    constructor(data) {
      super(data);
      this.connection = this.storeLib.get('connections')[data.connectionId];
      this.connectionId = data.connectionId;
      this.dataStreamMode = data.dataStreamMode || 'streammodecooked';
      this.streamProtocol = data.streamProtocol || 'streamproto0';
      this.socketType = 'ws';
      this.dataStreamType = data.dataStreamType || 'Float32';
      let socket = this.storeLib.get('websockets')[data.connectionId];
      if (!socket) {
        socket = this.storeLib.get('sockets')[data.connectionId];
        this.socketType = 's';
      }
      this.connectionId = data.connectionId;
      if (!socket) throw { message: `could not find a socket for ${data.connectionId}` };
      this.socket = socket;
      this.createAudioDevice({
        bitsPerSample: this.dataStreamType == '16BitPCM' ? 16 : 32
      });
      const audioDeviceObject = this.getDeviceObject();
      this.datastreamMonitor = audioDeviceObject.datastreamMonitor;
      this.onMetaDataPacket = () => {};
      this.onAudioPacket = () => {};
      audioDeviceObject.upsampleRatio = data.upsampleRatio;
      this.protohandler = new streamproto1({
        audioDeviceObject,
        datastreamMonitor: this.datastreamMonitor,
        connectionId: this.connectionId,
        dataStreamType: this.dataStreamType,
        enableQOSMetrics: data.enableQOSMetrics,
        qosWriter: QOSMetrics => this.socket.write(JSON.stringify(QOSMetrics) + '\r\n'),
        onMetaDataPacket: (metaDataStr, head) => this.onMetaDataPacket(metaDataStr, head),
        onAudioPacket: (payload, head) => this.onAudioPacket(payload, head),
        verbose: this.verbose
      });
      this.audioLib = modtask.ldmod('rel:audiosignal');
      const simulateChoppyChunks = false;
      const readAbChunk = (abChunk, _outcome) => {
        let outcome = {};
        if (_outcome) {
          outcome = _outcome;
        } else {
          try {
            if (abChunk instanceof ArrayBuffer) {
              if (simulateChoppyChunks) {
                console.log('simulateChoppyChunks');
                for(let i=0; i < abChunk.byteLength; ++i) {
                  outcome = this.protoReadIncomingDataStream(abChunk.slice(i, i+1));
                  if (!outcome.success) break;
                }
              } else {
                outcome = this.protoReadIncomingDataStream(abChunk);
              }
            } else {
              outcome = { reason: 'Cannot process non ArrayBuffer incoming data. type = ' + typeof(abChunk) };
            }
          } catch(e) {
            outcome = { reason: e.message };
          }
        }
        if (!outcome.success) {
          this.datastreamMonitor.log({ level: 2, msg: {
            action: 'readAbChunk',
            connectionId: this.connectionId,
            audioSource: audioDeviceObject,
            socketType: this.socketType,
            outcome
          }});
          this.connection.outcome = outcome;
          if (this.socketType == 'ws')
            socket.close();
          else
            socket.destroy();
        }
      }
      switch(this.socketType) {
        case 's':
          socket.on('data', data => readAbChunk(data.buffer));
          break;
        case 'ws':
          /* nodejs server side */
          if (socket.on) {
            socket.on('message', message => {
              if (message.type != 'binary') {
                return readAbChunk(null, { reason: 'NON_BINARY_MESSAGE_' + message });
              };
              function toArrayBuffer(buf) {
                const ab = new ArrayBuffer(buf.length);
                const view = new Uint8Array(ab);
                for (let i = 0; i < buf.length; ++i) {
                    view[i] = buf[i];
                }
                return ab;
              }
              const abChunk = toArrayBuffer(message.binaryData);
              readAbChunk(abChunk);
            });
          } else {
            // w3c websocket
            socket.onmessage = event => readAbChunk(event.data);
          }
          break;
      }
    }

    protoHandleStreamTypeAudio(abChunk) {
      const audioDeviceObject = this.getDeviceObject();
      let outcome = this.audioLib.convertArrayBufferToFloat32({ abChunk, dataStreamType: this.dataStreamType });
      if (outcome.success) {
        audioDeviceObject.audioBuffer = outcome.data;
        if (audioDeviceObject.onNewSample) {
          audioDeviceObject.onNewSample();
        }
        // strip out the data
        outcome = { success: true };
      }
      return outcome;
    }

    protoReadIncomingDataStream(abChunk) {
      const audioDeviceObject = this.getDeviceObject();
      const verbose = this.verbose || {};

      if (this.dataStreamMode == 'streammoderaw') {
        audioDeviceObject.audioBuffer = abChunk;
        if (audioDeviceObject.onNewSample) {
          audioDeviceObject.onNewSample();
        }
        return { success: true };
      }

      if (!(abChunk instanceof ArrayBuffer)) {
        let outcome = { reason: 'abChunk is not ArrayBuffer, instead it is: ' + typeof(abChunk) };
        this.datastreamMonitor.log({ level: 2, msg: {
          action: 'protoReadIncomingDataStream',
          connectionId: this.connectionId,
          audioSource: this.audioDeviceObject,
          socketType: this.socketType,
          outcome
        }});
        return outcome;
      }

      this.datastreamMonitor.log({ msg: {
        action: 'protoReadIncomingDataStream',
        connectionId: this.connectionId,
        audioSource: this.audioDeviceObject,
        streamProtocol: this.streamProtocol,
        byteLength: abChunk.byteLength
      }});

      let outcome = { reason: 'streamprotocolerror' };
      if (this.streamProtocol == 'streamproto1') {
        outcome = this.protohandler.readIncomingDataStream(abChunk);
      } else {
        outcome = this.protoHandleStreamTypeAudio(abChunk);
      }
      if (!outcome.success) {
        this.datastreamMonitor.log({ level: 2, msg: {
          audioSource: audioDeviceObject,
          connectionId: this.connectionId,
          action: 'protohandler.readIncomingDataStream',
          streamProtocol: this.streamProtocol,
          outcome
        }});
      }
      return outcome;
    };
  }

  class nonBrowserSocketWriterNode extends nonBrowserAudioNode {
    constructor(data) {
      super(data);
      this.connection = this.storeLib.get('connections')[data.connectionId];
      this.streamProtocol = data.streamProtocol || 'streamproto0';
      this.dataStreamType = data.dataStreamType || 'Float32';
      this.sendKeepAlive = data.sendKeepAlive;
      this.isSilentWhenPowerIsBelow = data.isSilentWhenPowerIsBelow;
      this.stopStreamingWhenSilent = data.stopStreamingWhenSilent;
      this.createAudioDevice();
      const audioDeviceObject = this.getDeviceObject();
      audioDeviceObject.bytesPerArrayItem = 4;
      audioDeviceObject.downsampleRatio = data.downsampleRatio;
      this.datastreamMonitor = audioDeviceObject.datastreamMonitor;
      this.audioLib = modtask.ldmod('rel:audiosignal');
      this.protohandler = new streamproto1({
        audioDeviceObject,
        datastreamMonitor: this.datastreamMonitor,
        connectionId: data.connectionId,
        dataStreamType: this.dataStreamType,
        verbose: this.verbose
      });
      this.getMetaDataStrFunction = () => 'nonBrowserSocketWriterNode ' + new Date().getTime();
      if (this.sendKeepAlive) {
        this.keepAlive();
        this.lastSampleTS = null;
      }
      const howlongShouldPowerStayLowForSilenceDetectionSeconds = 2;
      let howmanySamplesShouldPowerStayLowForSilenceDetection = this.context.sampleRate * howlongShouldPowerStayLowForSilenceDetectionSeconds;
      let totalConsequentiveSilenceSamples = 0;
      audioDeviceObject.write = float32Samples => {
        if (this.sendKeepAlive) this.lastSampleTS = new Date().getTime();
        var verbose = this.audioContext.verbose || {};
        var reason = null;
        if (!(float32Samples instanceof Float32Array)) {
          reason = 'nonBrowserSocketWriterNode recieved non Float32Array data';
        }
        if (reason) {
          audioDeviceObject.datastreamMonitor.log({ level: 2, msg: {
            action: 'audioDeviceDataExchange',
            audioSource: audioDeviceObject,
            reason
          }});
          return ;
        }

        audioDeviceObject.silenceDetected = false;
        if (this.isSilentWhenPowerIsBelow) {
          let avgPower = float32Samples.map(x => x > 0 ? x : -x).reduce((acc, cur) => acc + cur);
          avgPower = 100 * avgPower / float32Samples.length;
          if (avgPower < this.isSilentWhenPowerIsBelow) {
            totalConsequentiveSilenceSamples += float32Samples.length;
            if (totalConsequentiveSilenceSamples > howmanySamplesShouldPowerStayLowForSilenceDetection) {
              audioDeviceObject.silenceDetected = true;
            }
          } else {
            totalConsequentiveSilenceSamples = 0;
          }
          audioDeviceObject.avgPower = avgPower;
        }

        if (audioDeviceObject.silenceDetected && this.stopStreamingWhenSilent) {
          float32Samples = new Float32Array(1);
          audioDeviceObject.datastreamMonitor.log({ msg: {
            action: 'stopStreamingWhenSilent',
            audioSource: audioDeviceObject,
            avgPower: audioDeviceObject.avgPower
          }});
        }

        function downSample(float32SamplesSource) {
          if (!audioDeviceObject.downsampleRatio || float32Samples.length == 1) {
            return float32SamplesSource;
          }
          const ratio = audioDeviceObject.downsampleRatio;
          const ret = new Float32Array(float32SamplesSource.length / ratio);
          for(let i=0; i < ret.length; ++i) {
            ret[i] = 0;
            for(let j=0; j < ratio; ++j) {
              ret[i] += float32SamplesSource[i * ratio + j];
            }
            ret[i] = ret[i] / ratio;
          }
          return ret;
        }

        const outcome = this.protoWriteOutgoingDataStream(downSample(float32Samples), abChunk => {
          const numNewSamplesRecieved = abChunk.byteLength / 4;
          audioDeviceObject.QOSOutputMetrics = audioDeviceObject.datastreamMonitor(numNewSamplesRecieved).data;
          this.connection.writeArrayBuffer(abChunk);
        });
        if (!outcome.success) {
          this.datastreamMonitor.log({ verbose, level: 2, key: 'networking', msg: {
            name: audioDeviceObject.name,
            connectionId: this.connectionId,
            action: 'protoWriteOutgoingDataStream',
            errorObject: outcome
          }});
          this.connection.outcome = outcome;
          this.connection.socket.close();
        }
      }
    }

    keepAlive() {
      const keepAliveIntervalMs = 500;
      const audioDeviceObject = this.getDeviceObject();
      var loopIntervalId = setInterval(() => {
        try {
          const delta = new Date().getTime() - this.lastSampleTS;
          if (!this.lastSampleTS || delta > keepAliveIntervalMs) {
            audioDeviceObject.write(new Float32Array(1));
          }
        } catch (e) {
          clearInterval(loopIntervalId);
        }
      }, keepAliveIntervalMs);
    }

    protoWriteOutgoingDataStream(float32Samples, abChunkWriter) {
      let outcome = { reason: 'protoWriteOutgoingDataStream' };
      if (this.streamProtocol == 'streamproto1') {
        outcome = this.protohandler.writeMetadataPacket(abChunkWriter, this.getMetaDataStrFunction());
        if (!outcome.success) return outcome;
        outcome = this.protohandler.writeAudioPacket(float32Samples, abChunkWriter);
      } else {
        outcome = this.audioLib.convertFloat32toArrayBuffer({ float32Samples, dataStreamType: this.dataStreamType });
        if (outcome.success) {
          abChunkWriter(outcome.data);
        }
      }
      return outcome;
    }

    // nonBrowserSocketWriterNode.close
    async close() {
      super.close();
      for(var id in this.inputNodes) {
        await this.inputNodes[id].close();
      }
    }
  }

  class nonBrowserAnalyserNode extends nonBrowserAudioNode {
    constructor(data) {
      super(data);
      this.createAudioDevice(data);
      const verbose = data.verbose || {};
      const audioDeviceObject = this.getDeviceObject();
      const examineFloat32AudioSignal = modtask.ldmod('lib/audiosignal').examineFloat32AudioSignal;
      this.getDeviceObject().write = float32Samples => {
        const audioMetadata = examineFloat32AudioSignal({
          float32Samples,
          threshold: 5
        }).data;
        if (data.onAudioMetaDataChainItem) {
          var chainItem = data.onAudioMetaDataChainItem;
          chainItem[1].audioMetadata = audioMetadata;
          this.audioContext._modtaskContext.doChain([
            ['newChain', {
              chainItems: [
                chainItem
              ]
            }],
            function(chain) {
              var outcome = chain.get('outcome');
              if (!outcome.success) {
                // use try-catch incase audioDeviceObject.datastreamMonitor is not defined
                try {
                  audioDeviceObject.datastreamMonitor.log({ verbose: audioDeviceObject.audioNode.verbose, level: 2, key: 'analyserNode', msg: {
                    action: 'analyserNode',
                    name: audioDeviceObject.name,
                    deviceId: audioDeviceObject.deviceId,
                    reason: outcome.reason
                  }});
                } catch(e) {
                  console.log('warning: audioDeviceObject.datastreamMonitor.log failed: ', audioDeviceObject.deviceId, e);
                }
              }
            }
          ]);
        }
        var monitorData = audioDeviceObject.datastreamMonitor(float32Samples.length).data;
        if (monitorData.shouldLog) {
          audioDeviceObject.datastreamMonitor.log({ msg: {
            action: 'analyzer',
            audioSource: audioDeviceObject,
            total: monitorData.totalFriendly,
            samplesPerSecond: monitorData.samplesPerSecondFriendly,
            audioMetadata
          }});
        }
      }
    }
  }

  class nonBrowserAudioInputNode extends nonBrowserAudioNode {
    constructor(data) {
      super(data);
      this.deviceNameGrepStr = data.deviceNameGrepStr || 'Defal';
      this.createAudioDevice(data);
      this.started = false;
      if (this.setupNative(data)) return;
      // do not auto start here.
    }

    setupNative(data) {
      if (!this.audioContext.nativeAudioContext) return false;
      const audioDeviceObject = this.getDeviceObject();
      audioDeviceObject.datastreamMonitor.log({ msg: {
        action: 'setupNative',
        audioSource: audioDeviceObject
      }});
      return true;
    }

    async setupNativeAsync() {
      const mediaStream = await this.findMediaStream(this.deviceNameGrepStr);
      this.nativeAudioNode = this.audioContext.nativeAudioContext.createMediaStreamSource(mediaStream);
      return this.nativeAudioNode;
    }

    async findMediaStream(_deviceNameGrepStr) {
      const getAudioInputDeviceId = async () => {
        if (!_deviceNameGrepStr) _deviceNameGrepStr = 'Default';
        if (!navigator.mediaDevices) throw { reason: 'Please enable Web Audio (navigator.mediaDevices is disabled).' };
        return navigator.mediaDevices.enumerateDevices().then(devices => {
            let allAudioInputDevices = devices = devices.filter((d) => d.kind === 'audioinput');
            var device = null;
            for (var i = 0; i < allAudioInputDevices.length; ++i) {
                var d = allAudioInputDevices[i];
                if ( _deviceNameGrepStr == 'Default') {
                  // return the first device found regardless of name. Safari/iOS does not include Default in name
                  device = d;
                  break;
                }
                if (d.label.toLowerCase().indexOf(_deviceNameGrepStr.toLowerCase()) >= 0) {
                    device = d;
                    break;
                }
            }
            if (!device) throw { reason: 'device not found: ' + _deviceNameGrepStr };
            return device.deviceId;
        });
      }
      return getAudioInputDeviceId().then(deviceId => {
        return navigator.mediaDevices.getUserMedia({ audio: { deviceId }, video: false }).then(mediaStream => {
          return mediaStream;
        });
      });
    }

    start() {
      const audioDeviceObject = this.getDeviceObject();
      if (this.started) return audioDeviceObject.datastreamMonitor.log({ level: 2, msg: {
        audioSource: audioDeviceObject,
        outcome: { reason: 'start was called while the device had already been started. ignore' }
      }});
      this.started = true;
      if (this.nativeAudioNode) {
        if (this.nativeAudioNode.start) this.nativeAudioNode.start();
        return;
      };

      const streamProperties = audioDeviceObject.streamProperties;
      const portAudio = require('naudiodon');
      let list = portAudio.getDevices();
      let deviceId = -1;
      for(var i=0; i < list.length; ++i) {
        if (list[i].maxInputChannels < 1) continue;
        if (list[i].name.toLocaleLowerCase().indexOf(this.deviceNameGrepStr.toLowerCase()) >= 0) {
          deviceId = list[i].id;
          break;
        }
      }
      if (deviceId == -1) throw { message: 'could not find audio input device or the device might be busy or you may need ROOT access. deviceNameGrepStr: ' + this.deviceNameGrepStr };
      console.log();
      console.log(`--------- below text comes from create a new portAudio INPUT device from "${this.deviceNameGrepStr}"`);
      console.log('--------- if its blocking here, make sure that the device is NOT set as the default system device.');
      const ai = new portAudio.AudioIO({
        inOptions: {
          channelCount: 1,
          sampleFormat: 1, // SampleFormatFloat32
          sampleRate: streamProperties.sampleRate,
          deviceId,
          closeOnError: false,
        }
      });
      console.log('--------- portAudio was successful!');
      ai.on('data', pcmSamples => {
        audioDeviceObject.audioBuffer = new Float32Array(pcmSamples.buffer);
        if (audioDeviceObject.onNewSample) {
          audioDeviceObject.onNewSample();
        }
      });
      ai.start();
    }

    stop() {
      if (this.nativeAudioNode) {
        const audioDeviceObject = this.getDeviceObject();
        audioDeviceObject.datastreamMonitor.log({ msg: {
          action: 'stopNative',
          audioSource: audioDeviceObject,
          data: 'mediaStream tracks need to be stopped to clear the recording icon in the tab'
        }});
        const mediaStream = this.nativeAudioNode.mediaStream;
        mediaStream.getTracks().forEach(track => track.stop());
      }
      super.stop();
    }
  }

  class nonBrowserDebugNode extends nonBrowserAudioNode {
    constructor(data) {
      super(data);
      this.createAudioDevice(data);
      const cb = data.cb || function() {};
      this.getDeviceObject().write = dataFromInputNode => cb({ dataFromInputNode })
    }
  }

  class nonBrowserSpeakerNode extends nonBrowserAudioNode {
    constructor(data) {
      super(data);
      if (this.setupNative(data)) return;
      for (var p in global.__audioDevices) {
        if (p.indexOf('SpeakerNode') == 0) {
          console.log('Cannot instantiate more than 1 speakernodes');
          process.exit(0);
        }
      }
      this.createAudioDevice(data);
      this.debug = modtask.ldmod('rel:../debug/audio');
      this.start(data.deviceNameGrepStr);
    }

    setupNative(data) {
      if (!this.audioContext.nativeAudioContext) return false;
      this.createAudioDevice(data);
      const audioDeviceObject = this.getDeviceObject();
      audioDeviceObject.datastreamMonitor.log({ msg: {
        action: 'setupNative',
        audioSource: audioDeviceObject
      }});
      this.getDeviceObject().write = float32Samples => console.log('Write disabled for native speaker');
      this.nativeAudioNode = this.audioContext.nativeAudioContext.destination;
      return true;
    }

    start(deviceNameGrepStr) {
      const audioLib = modtask.ldmod('rel:../lib/audiosignal');
      const audioDeviceObject = this.getDeviceObject();
      const streamProperties = audioDeviceObject.streamProperties;

      if (!this.debug.debug({
        action: 'start',
        deviceNameGrepStr,
        streamProperties: {
          sampleRate: streamProperties.sampleRate,
          bitsPerSample: 16,
          numberOfChannels: 1
        }
      })) {
        throw { message: 'could not find audio output device or the device might be busy or you may need ROOT access. deviceNameGrepStr: ' + deviceNameGrepStr };
      };

      this.getDeviceObject().write = float32Samples => {
        var reason = null;

        if (!(float32Samples instanceof Float32Array)) {
          reason = 'Speaker recieved non Float32Array data';
        }
        if (reason) {
          audioDeviceObject.datastreamMonitor.log({ level: 2, msg: {
            device: audioDeviceObject.name,
            deviceId: audioDeviceObject.deviceId,
            outcome: { reason }
          }});
          return ;
        }
        var buf = audioLib.convertFloat32to16BitPCM({ float32Samples }).data;
        this.debug.debug({ action: 'onbuffer', buf: Buffer.from(buf) });
      }
    }
  }

  class nonBrowserOscillatorNode extends nonBrowserAudioNode {
    constructor(data) {
      super(data);
      this.createAudioDevice();
      this.volume = 0.05;
      this.frequencyInHZ = data.frequencyInHZ || 480;
      if (data.volume) this.volume = data.volume;
      this.chunkSize = data.chunkSize || 16384;
      Object.defineProperty(this, 'type', {
        enumerable: true,
        writable: true,
        value: 'sine'
      });
      this.frequency = {
        setValueAtTime: function() {}
      };
    }

    start() {
      this.startWaitStop();
    }

    /* non standard izy extension */
    startWaitStop(stopInMiliSeconds, cb) {
      let verbose = this.audioContext.verbose || {};
      const audioDeviceObject = this.getDeviceObject();
      audioDeviceObject.bytesPerArrayItem = 4;
      const streamProperties = audioDeviceObject.streamProperties;
      const samples = new Float32Array(streamProperties.sampleRate);
      var k = 0;
      var frequencyHZ = streamProperties.sampleRate / Math.round(streamProperties.sampleRate / this.frequencyInHZ);
      var numSamplesPerPeriod = streamProperties.sampleRate / frequencyHZ;
      let periods = 1;
      for(var j=0; j < frequencyHZ; ++j) {
        for(var i=0; i < numSamplesPerPeriod*periods; ++i) {
          samples[k++] = Math.sin(Math.PI * 2 * (i / numSamplesPerPeriod)) * this.volume;
        }
      }

      modtask.ldmod('lib/stream').loopStreamSamplesArray(
        { samples, streamProperties, chunkSize: this.chunkSize, bytesPerArrayItem: 4, intervalTweakMultiplier: 0.99 },
        outcome => {
          if (!outcome.success) {
            audioDeviceObject.datastreamMonitor.log({ verbose, level: 2, key: 'audioStreamBetweenNodes', msg: {
              device: audioDeviceObject.name,
              deviceId: audioDeviceObject.deviceId,
              reason: outcome.reason
            }});
            return;
          };
          if (this.destroyed) return;
          let { percent, offsetInSeconds, totalInSeconds, buf } = outcome.data;
          if (stopInMiliSeconds && totalInSeconds*1000 > stopInMiliSeconds) {
            cb();
            return false;
          }

          audioDeviceObject.audioBuffer = buf;
          if (audioDeviceObject.onNewSample) {
            audioDeviceObject.onNewSample();
          }
          return true;
        }
      );
    }
  }

  class nonBrowserAudioContext {
    constructor(_modtaskContext, options) {
      if (!options) options = {};
      let sampleRate = options.sampleRate || 48000
  
      if (options.useNativeAudioContext) {
        Object.defineProperty(this, 'nativeAudioContext', {
          enumerable: true,
          writable: false,
          value: new AudioContext()
        });
        sampleRate = this.nativeAudioContext.sampleRate;
      }

      if (options.enforceSampleRate) {
        if (sampleRate != options.enforceSampleRate) {
          throw `Cannot create audioContext because the default is ${sampleRate} while enforceSampleRate is: ${options.enforceSampleRate}`;
        }
      }

      Object.defineProperty(this, 'sampleRate', {
        enumerable: true,
        writable: false,
        value: sampleRate
      });

      Object.defineProperty(this, 'verbose', {
        enumerable: true,
        writable: false,
        value: options.verbose || {}
      });

      Object.defineProperty(this, '_modtaskContext', {
        enumerable: true,
        writable: false,
        value: _modtaskContext
      });

      Object.defineProperty(this, 'state', {
        enumerable: true,
        writable: false,
        value: 'stopped'
      });

      Object.defineProperty(this, 'destination', {
        enumerable: true,
        writable: false,
        value: null
      });

      Object.defineProperty(this, 'audioNodes', {
        enumerable: true,
        writable: false,
        value: []
      });
    }

    async createNodeFromXCastConfig(queryObject) {
      const { config, verbose } = queryObject;
      let waveDeviceNode = null;
      switch(config.mode) {
        case 'AnalyserNode':
          waveDeviceNode = this.createAnalyser({
            config,
            verbose
          });
          break;
        case 'OscillatorNode':
          waveDeviceNode = this.createOscillator();
          break;
        case 'IzySpeakerNode':
          waveDeviceNode = this.createIzySpeakerNode({
            deviceNameGrepStr: config.deviceNameGrepStr
          });
          break;
        case 'streamInputDeviceAsWave':
          waveDeviceNode = await this.createIzyNode('audio/stream', {
            verbose,
            systemInputDeviceName: config.systemInputDeviceName
          });
          break;
        case 'streamWaveLoop':
          waveDeviceNode = await this.createIzyNode('audio/file/input', {
            path: config.path || modtask.ldmod('lib/data').getDataFilePath('test-48.0-16-mono.wav'),
            chunkSize: 4096*2, // 24064*2,
            verbose,
            startMode: 'manual',
            startStreamWithWaveHeader: false
          });
          break;
        case 'IzyAudioInputNode':
          waveDeviceNode = this.createIzyAudioInputNode({
            deviceNameGrepStr: config.deviceNameGrepStr
          });
          if (config.useNativeAudioContext) {
            await waveDeviceNode.setupNativeAsync();
          };
          break;
        default:
          throw { message: 'invalid mode: ' + config.mode };
      };
      waveDeviceNode.setName(config.name || config.mode);
      return waveDeviceNode;
    };

    // audioContext.close
    async close() {
      if (this.nativeAudioContext) {
        // Returns a promise. See https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close
        return this.nativeAudioContext.close();
      }
    }

    // todo: emit this when change in state
    onstatechange() {
      console.log(this.state);
    }

    suspend() {
      this.state = 'suspended';
    }

    resume() {
      this.state = 'running';
    }

    createOscillator(queryObject) {
      if (!queryObject) queryObject = {};
      return new nonBrowserOscillatorNode({
        deviceId: 'OscillatorNode-' + (new Date()).getTime(),
        audioContext: this,
        volume: queryObject.volume,
        frequencyInHZ: queryObject.frequencyInHZ,
        chunkSize: queryObject.chunkSize
      });
    }

    createAnalyser(queryObject) {
      if (!queryObject) queryObject = {};
      return new nonBrowserAnalyserNode({
        deviceId: 'AnalyzerNode-' + (new Date()).getTime(),
        name: queryObject.config.name,
        verbose: queryObject.verbose,
        onAudioMetaDataChainItem: queryObject.onAudioMetaDataChainItem,
        audioContext: this
      });
    }

    createScriptProcessor(bufferSize, numberOfInputChannels, numberOfOutputChannels, izyExtensionConfig) {
      if (!izyExtensionConfig) izyExtensionConfig = {};
      return new nonBrowserScriptProcessor({
        bufferSize, numberOfInputChannels, numberOfOutputChannels,
        deviceId: 'ScriptProcessor-' + (new Date()).getTime(),
        dataStreamMode: izyExtensionConfig.dataStreamMode,
        checkForExternalScriptProcessor: izyExtensionConfig.checkForExternalScriptProcessor,
        getBufferDepth: izyExtensionConfig.getBufferDepth,
        dynamicResampleRate: izyExtensionConfig.dynamicResampleRate,
        audioContext: this
      });
    }

    createIzyAudioInputNode(queryObject) {
      queryObject = queryObject || {};
      return new nonBrowserAudioInputNode({
        deviceId: 'MicrophoneNode-' + (new Date()).getTime(),
        audioContext: this,
        deviceNameGrepStr: queryObject.deviceNameGrepStr
      });
    }

    createIzyDebugNode(queryObject) {
      queryObject = queryObject || {};
      return new nonBrowserDebugNode({
        deviceId: 'DebugNode-' + (new Date()).getTime(),
        audioContext: this,
        cb: queryObject.cb
      });
    }

    createIzySpeakerNode(queryObject) {
      queryObject = queryObject || {};
      return new nonBrowserSpeakerNode({
        deviceId: 'SpeakerNode-' + (new Date()).getTime(),
        audioContext: this,
        deviceNameGrepStr: queryObject.deviceNameGrepStr
      });
    }

    createIzySocketReaderNode(queryObject) {
      queryObject = queryObject || {};
      return new nonBrowserSocketReaderNode({
        deviceId: 'SocketReader-' + queryObject.connectionId + '-' + (new Date()).getTime(),
        name: queryObject.name,
        audioContext: this,
        connectionId: queryObject.connectionId,
        dataStreamType: queryObject.dataStreamType,
        dataStreamMode: queryObject.dataStreamMode,
        streamProtocol: queryObject.streamProtocol,
        enableQOSMetrics: queryObject.enableQOSMetrics,
        upsampleRatio: queryObject.upsampleRatio
      });
    }

    createIzySocketWriterNode(queryObject) {
      queryObject = queryObject || {};
      return new nonBrowserSocketWriterNode({
        deviceId: 'SocketWriter-' + queryObject.connectionId + '-' + (new Date()).getTime(),
        name: queryObject.name,
        audioContext: this,
        connectionId: queryObject.connectionId,
        streamProtocol: queryObject.streamProtocol,
        dataStreamType: queryObject.dataStreamType,
        sendKeepAlive: queryObject.sendKeepAlive,
        isSilentWhenPowerIsBelow: queryObject.isSilentWhenPowerIsBelow,
        stopStreamingWhenSilent: queryObject.stopStreamingWhenSilent,
        downsampleRatio: queryObject.downsampleRatio
      });
    }

    async createIzyNode(path, queryObject) {
      return new Promise((resolve, reject) => {
        const deviceId = 'IzyNode-' + path + '-' + (new Date()).getTime();
        const an = new nonBrowserAudioNode({
          deviceId,
          audioContext: this
        });
        an.createAudioDevice();
        queryObject.deviceId = deviceId;
        this._modtaskContext.doChain([
          ['newChain', {
            chainItems: [
              ['//inline/' + path + '?attachToNode', queryObject],
              chain => resolve(an)
            ]
          }],
          chain => {
            var outcome = chain.get('outcome');
            if (!outcome.success) return reject({ message: outcome.reason });
          }
        ]);
      });
    }

    trackAudioNode(_nonBrowserAudioNode) {
      this.audioNodes.push(_nonBrowserAudioNode);
    }
  }

  modtask.newAudioContext = function(_modtaskContext, options) {
    return new nonBrowserAudioContext(_modtaskContext, options);
  };

  return modtask;
})();

