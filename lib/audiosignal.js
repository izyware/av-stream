/* izy-loadobject nodejs-require */
module.exports = (function() {
  var modtask = function() {};

  modtask.examineFloat32AudioSignal = function(queryObject) {
    const { float32Samples, threshold } = queryObject;
    var sum = 0;
    var totalSamples = 0;
    const normalizationFactor = 500;
    for (var i = 0; i < float32Samples.length; i++) {
      var sampleValue = Math.abs(float32Samples[i]*normalizationFactor);
      sum += sampleValue;
      totalSamples++;
    }
    var avg = Math.round(sum / totalSamples);
    var data =  {
      audioOn: 'no',
      audioVolume: avg
    };
    if (avg > threshold) {
      data.audioOn = 'yes';
    }
    return { success: true, data };
  }

  modtask.examineAudioSignal = function(queryObject) {
    const { pcmSamples, threshold, streamProperties } = queryObject;
    var bytesPerInputSample = streamProperties.bitsPerSample / 8;
    var sum = 0;
    var totalSamples = 0;
    var fn = 'readInt' + streamProperties.bitsPerSample + 'LE';
    if (!pcmSamples[fn]) return { reason: 'unsupported audio bitsPerSample: '  + fn };
    var divFactor = 1;
    if (streamProperties.bitsPerSample == 32) divFactor = 1000000;
    for (var i = 0; i < pcmSamples.length; i+=bytesPerInputSample) {
      var sampleValue = Math.abs(pcmSamples[fn](i) / divFactor);
      sum += sampleValue;
      totalSamples++;
    }
    var avg = Math.round(sum / totalSamples);
    var data =  {
      audioOn: 'no',
      audioVolume: avg
    };
    if (avg > threshold) {
      data.audioOn = 'yes';
    }
    return { success: true, data };
  }

  // obsolete: use convertFloat32toArrayBuffer
  /* will return an ArrayBuffer */
  modtask.convertFloat32to16BitPCM = function(queryObject) {
    var float32Samples = queryObject.float32Samples;
    function floatTo16BitPCM(output, offset, input) {
        for (var i = 0; i < input.length; i++, offset += 2) {
          var s = Math.max(-1, Math.min(1, input[i]))
          output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
        }
    };
    bytesPerSample = 2; // we are converting the 4 byte floats to 16Bit PCM Samples
    var totalSize = float32Samples.length * bytesPerSample
    var buffer = new ArrayBuffer(totalSize);
    var view = new DataView(buffer);
    floatTo16BitPCM(view, 0, float32Samples);
    return { success: true, data: buffer };
  }

  modtask.convert16BitPCMToFloat32 = function(queryObject) {
    var pcmSamples = queryObject.pcmSamples;
    if (!pcmSamples.readInt16LE) return { reason: 'pcmSamples is not a valid data structure' };
    var bytesPerSample = 4;
    var bytesPerInputSample = 2;
    var buffer = new ArrayBuffer(pcmSamples.length * bytesPerSample / bytesPerInputSample);
    var output = new DataView(buffer);
    for (var i = 0, byteOffset = 0; i < pcmSamples.length; i+=bytesPerInputSample, byteOffset += bytesPerSample) {
      var sampleValue = pcmSamples.readInt16LE(i) / 32768;
      // true indicates littleEndian
      output.setFloat32(byteOffset, sampleValue, true);
    }
    return { success: true, data: new Float32Array(buffer) };
  };

  modtask.convertUint8ArrayToFloat32 = function(queryObject) {
    const { uint8Array } = queryObject;
    if (!uint8Array) return { reason: 'please specify uint8Array' };
    if (uint8Array.length % 4 !== 0) console.log('WARNING: We must add buffering to socket reader. you will get an error because of convertUint8ArrayToFloat32: ' + uint8Array.length);
    // convert the Buffer back to ArrayBuffer
    const ab = new ArrayBuffer(uint8Array.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < uint8Array.length; ++i) {
        view[i] = uint8Array[i];
    }
    // convert ArrayBuffer to float32Samples
    const float32Samples = new Float32Array(ab);
    return { success: true, data: float32Samples };
  }

  modtask.convertFloat32toArrayBuffer = function(queryObject) {
    const { float32Samples, dataStreamType } = queryObject;
    let outcome = { reason: 'invalid dataStreamType: ' + dataStreamType };
    switch(dataStreamType) {
      case 'Float32':
        outcome = { success: true, data: float32Samples.buffer };
        break;
      case '16BitPCM':
        function floatTo16BitPCM(output, offset, input) {
            for (var i = 0; i < input.length; i++, offset += 2) {
              var s = Math.max(-1, Math.min(1, input[i]))
              output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
            }
        };
        let bytesPerSample = 2; // we are converting the 4 byte floats to 16Bit PCM Samples
        let totalSize = float32Samples.length * bytesPerSample
        let buffer = new ArrayBuffer(totalSize);
        let view = new DataView(buffer);
        floatTo16BitPCM(view, 0, float32Samples);
        outcome = { success: true, data: buffer };
        break;
    }
    return outcome;
  }

  modtask.convertArrayBufferToFloat32 = function(queryObject) {
    const { abChunk, dataStreamType } = queryObject;
    if (!abChunk) return { reason: 'please specify abChunk' };
    let outcome = { success: true };
    let input = {};
    let output = {};
    const bytesPerSample = 4;
    let divisor = 1;
    const littleEndian = true;
    switch(dataStreamType) {
      case 'Float32':
        if (abChunk.byteLength % 4 !== 0) return { reason: 'convertArrayBufferToFloat32 input length must be a multiple of 4 bytes' };
        outcome.data = new Float32Array(abChunk);
        break;
      case '16BitPCM':
      case '32BitPCM':
        var bytesPerInputSample = dataStreamType == '16BitPCM' ? 2 : 4;
        const fn = dataStreamType == '16BitPCM' ? 'getInt16' : 'getInt32';
        input.buffer = abChunk;
        input.view = new DataView(input.buffer);
        output.buffer = new ArrayBuffer(abChunk.byteLength * bytesPerSample / bytesPerInputSample);
        output.view = new DataView(output.buffer);
        divisor = Math.pow(2, bytesPerInputSample*8-1);
        for (var i = 0, byteOffset = 0; i < input.view.byteLength; i+=bytesPerInputSample, byteOffset += bytesPerSample) {
          var sampleValue = input.view[fn](i, littleEndian) / divisor;
          output.view.setFloat32(byteOffset, sampleValue, littleEndian);
        }
        outcome.data = new Float32Array(output.buffer);
        break;
      default:
        outcome = { reason: 'uknown dataStreamType' };
        break;
    };
    return outcome;
  }

  // obsolete: use convertArrayBufferToFloat32 instead
  modtask.convert16BitPCMToFloat32 = function(queryObject) {
    var pcmSamples = queryObject.pcmSamples;
    if (!pcmSamples.readInt16LE) return { reason: 'pcmSamples is not a valid data structure' };
    var bytesPerSample = 4;
    var bytesPerInputSample = 2;
    var buffer = new ArrayBuffer(pcmSamples.length * bytesPerSample / bytesPerInputSample);
    var output = new DataView(buffer);
    for (var i = 0, byteOffset = 0; i < pcmSamples.length; i+=bytesPerInputSample, byteOffset += bytesPerSample) {
      var sampleValue = pcmSamples.readInt16LE(i) / 32768;
      // true indicates littleEndian
      output.setFloat32(byteOffset, sampleValue, true);
    }
    return { success: true, data: new Float32Array(buffer) };
  };

  return modtask;
})();

