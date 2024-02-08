/* izy-loadobject nodejs-require */
module.exports = (function() {
  var modtask = function() {};

  modtask.loopStreamSamplesArray = function(queryObject, cb) {
    var samples = queryObject.samples;
    var streamProperties = queryObject.streamProperties;
    var bytesPerArrayItem = queryObject.bytesPerArrayItem;
    var chunkSize = queryObject.chunkSize;
    const intervalTweakMultiplier = queryObject.intervalTweakMultiplier || 0.95;

    if (!bytesPerArrayItem) return cb({ reason: 'Please specify bytesPerArrayItem' });
    var bytesPerSecond = streamProperties.bitsPerSample / 8 * streamProperties.sampleRate;
    var dataSendIntervalMs = Math.floor((1000 * bytesPerArrayItem / (bytesPerSecond / chunkSize)) * intervalTweakMultiplier);
    var offset = 0;
    let totalInSeconds = 0;

    var loopIntervalId = setInterval(function() {
        try {
            var offsetInSeconds = +((offset * bytesPerArrayItem / bytesPerSecond).toFixed(4));
            totalInSeconds += offsetInSeconds;
            var buf = null;
            var endIndex = offset + chunkSize;
            if (endIndex <= samples.length) {
                buf = samples.slice(offset, endIndex);
                offset += chunkSize;
            } else {
                buf = samples.slice(0, chunkSize);
                var part = samples.slice(offset, samples.length);
                var k = 0;
                for (var i = 0; i < part.length; ++i) {
                    buf[k++] = part[i];
                }
                offset = chunkSize - (samples.length - offset);
                part = samples.slice(0, offset);
                for (var i = 0; i < part.length; ++i) {
                    buf[k++] = part[i];
                }
            }
            var percent = Math.round(offset * 100 / samples.length);
            if (!cb({
                    success: true,
                    data: {
                        percent,
                        offsetInSeconds,
                        totalInSeconds,
                        buf
                    }
                })) {
                clearInterval(loopIntervalId);
            }
        } catch (e) {
            clearInterval(loopIntervalId);
            return cb({ reason: e.message })
        }
    }, dataSendIntervalMs);
  };

  return modtask;
})();

