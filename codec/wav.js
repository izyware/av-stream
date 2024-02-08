/* izy-loadobject nodejs-require */
module.exports = (function() {
  var modtask = function() {};

  modtask.parseAndVerifyWaveBuffer = function(queryObject) {
    var buffer = queryObject.waveBuffer;
    var outcome = modtask.parseAndVerifyWaveHeader(queryObject);
    if (!outcome.success) return outcome;
    var metaData = outcome.data;
    return {
        success: true,
        data: {
            header: buffer.slice(0, metaData.headerSize),
            samples: buffer.slice(metaData.headerSize),
            fullBuffer: buffer,
            metaData: metaData
        }
    }
  }

  /* usage:
    modtask.createWaveHeader({
      numChannels: 1,
      sampleRate: 48000,
      bitsPerSample: 16,
      totalSamples: 0 // use zero for inifinite
    });
  */
  modtask.createWaveHeader = function(queryObject) {
    const totalLengthInSeconds = 0; // 60*10;
    var totalSamples = queryObject.totalSamples || (queryObject.numChannels * queryObject.bitsPerSample / 8) * queryObject.sampleRate * totalLengthInSeconds; // NumSamples * NumChannels * BitsPerSample/8
    let lenInMinutes = totalSamples / (queryObject.numChannels * queryObject.bitsPerSample / 8);
    lenInMinutes = lenInMinutes / queryObject.sampleRate / 60;
    // console.log('------------------- length in minutes', lenInMinutes);
    var waveHeader = new ArrayBuffer(44);
    var view = new DataView(waveHeader);
    var offset = 0;
    view.setUint32(offset, 0x52494646);offset+=4; // RIFF
    view.setUint32(offset, totalSamples + 44 - 8, true);offset += 4;
    view.setUint32(offset, 0x57415645);offset+=4; // WAVE
    view.setUint32(offset, 0x666d7420);offset+=4; // fmt
    view.setUint32(offset, 16, true);offset+=4; // subchunk1Size
    view.setInt16(offset, 1, true);offset+=2; // PCM audio format
    view.setInt16(offset, queryObject.numChannels, true);offset+=2;
    view.setUint32(offset, queryObject.sampleRate, true);offset+=4;
    view.setUint32(offset, queryObject.sampleRate*queryObject.numChannels*queryObject.bitsPerSample / 8, true);offset+=4; // byteRate
    view.setUint16(offset, queryObject.numChannels*queryObject.bitsPerSample / 8, true);offset+=2; // blockAlign
    view.setUint16(offset, queryObject.bitsPerSample, true);offset+=2;
    view.setUint32(offset, 0x64617461);offset+=4; // data block
    view.setUint32(offset, totalSamples);offset+=4; // samples size
    return waveHeader;
  }

  modtask.parseAndVerifyWaveHeader = function(queryObject) {
    var buffer = queryObject.waveBuffer;
    var enforceDataSizeLimits = queryObject.enforceDataSizeLimits;
    var allowExperimentalWaveParser = queryObject.allowExperimentalWaveParser;
    var totalWaveBufferSize = buffer.length;
    var i = 0;
    var metaData = {};
    metaData.subchunk2 = [];
    metaData.offsets = {};
    // http://soundfile.sapp.org/doc/WaveFormat/ 
    // https://www.recordingblogs.com/wiki/list-chunk-of-a-wave-file
    metaData.chunkId = buffer.slice(i, i + 4).toString('ascii');i+=4;
    if (metaData.chunkId != 'RIFF') return { reason: 'metaData.chunkId: ' + metaData.chunkId };
    
    // Total file size minus 8
    metaData.totalFileSize = buffer.slice(i, i + 4).readUInt32LE();i+=4;
    metaData.offsets.totalFileSize = i-4;
    if (enforceDataSizeLimits) {
        if (metaData.totalFileSize != totalWaveBufferSize-8) return {
            reason: `metaData.totalFileSize: ${metaData.totalFileSize} <> ${totalWaveBufferSize-8}`
        };
    }
    
    metaData.format = buffer.slice(i, i + 4).toString('ascii');i+=4;
    if (metaData.format != 'WAVE') return { reason: 'metaData.format: ' + metaData.format };
    
    // The "WAVE" format consists of two subchunks: "fmt " and "data":
    metaData.subchunk1ID = buffer.slice(i, i + 4).toString('ascii');i+=4;
    if (metaData.subchunk1ID != 'fmt ') return { reason: 'metaData.subchunk1ID: ' + metaData.subchunk1ID };
    
    // 16 for PCM.  This is the size of the rest of the Subchunk which follows this number.
    metaData.subchunk1Size = buffer.slice(i, i + 4).readUInt32LE();i+=4;
  
    metaData.audioFormat = buffer.slice(i, i + 2).readUInt16LE();i+=2;

    /*
        Integer PCM at 8, 16, 24, or 32 bits per sample (format code 1)
        Floating point PCM at 32 or 64 bits per sample (format code 3)
        WAVE_FORMAT_EXTENSIBLE container (format code 65534)
    */
    if (metaData.audioFormat != 1 && !allowExperimentalWaveParser) return { reason: 'audioFormat is not Integer PCM. Consider passing in allowExperimentalWaveParser.' };
    if (metaData.audioFormat != 1 && metaData.audioFormat != 65534) return { reason: 'audioFormat is not recognized' };

    if (metaData.audioFormat != 1) console.log('WARNING: advance WAVE format');
  
    metaData.numChannels = buffer.slice(i, i + 2).readUInt16LE();i+=2;
    metaData.numberOfChannels = metaData.numChannels;
    metaData.sampleRate = buffer.slice(i, i + 4).readUInt32LE();i+=4;
    /* == SampleRate * NumChannels * BitsPerSample/8 */
    metaData.byteRate = buffer.slice(i, i + 4).readUInt32LE();i+=4;
    /* == NumChannels * BitsPerSample/8 */
    metaData.blockAlign = buffer.slice(i, i + 2).readUInt16LE();i+=2;
    metaData.bitsPerSample = buffer.slice(i, i + 2).readUInt16LE();i+=2;
  
    if (metaData.blockAlign != metaData.numChannels * metaData.bitsPerSample / 8) return { 
        reason: 'invalid blockAlign'
    };
  
    if (metaData.byteRate != metaData.sampleRate * metaData.numChannels * metaData.bitsPerSample / 8) return { 
        reason: 'invalid byteRate'
    };

    var keepScanning = true;
    do {
        var obj = {};
        obj.id = buffer.slice(i, i + 4).toString('ascii');i+=4;
        obj.size = buffer.slice(i, i + 4).readUInt32LE();i+=4;
        switch(obj.id) {
            case 'data':
                metaData.offsets.dataChunkSize = i-4;
                if (enforceDataSizeLimits) {
                    if (obj.size != totalWaveBufferSize - i) return {
                        reason: 'invalid data chunk size ' + obj.size
                    };
                }
                keepScanning = false;
                break;
            case 'LIST':
                obj.listTypeId = buffer.slice(i, i + 4).toString('ascii');i+=4;
                i += obj.size - 12 + 8;
                break;
            default:
                if (allowExperimentalWaveParser) break;
                return { reason: 'unrecognized subchunk2 block: ' + obj.id };
        }
        metaData.subchunk2.push(obj);
    } while(keepScanning);
    metaData.headerSize = i;
    return { success: true, data: metaData };
  }
  
  modtask.resizeWave = function(buffer, factor) {
    if (!factor) factor = 1;
    var outcome = modtask.parseAndVerifyWaveHeader({ waveBuffer: buffer });
    if (!outcome.success) return outcome;
    var metaData = outcome.data;
    var headerSize = metaData.headerSize;
    var data = buffer.slice(headerSize);
    var header = buffer.slice(0, headerSize);
  
    var newDataSize = data.length * factor;
    var newTotalSize = headerSize + newDataSize;
    var finalBuf = [header];
    for(var i=0; i < factor; ++i) {
        finalBuf.push(data);
    }
    header.writeUInt32LE(newTotalSize-8, metaData.offsets.totalFileSize);
    header.writeUInt32LE(newDataSize, metaData.offsets.dataChunkSize);
    return { success: true, data: Buffer.concat(finalBuf) };
  }

  return modtask;
})();

