/* izy-loadobject nodejs-require */
module.exports = (function() {
  var modtask = function() {};
  modtask.getaudiodevices = function(queryObject, cb) {
    var portAudio = require('naudiodon');
    return cb({ success: true, data: portAudio.getDevices() });
  }
  return modtask;
})();

