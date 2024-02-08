/* izy-loadobject nodejs-require */
module.exports = (function() {
  var modtask = function() {};
  modtask.getDataFilePath = function(fileName) {
    return __dirname + '/../data/' + fileName;
  };

  modtask.readFile = function(queryObject) {
    var filePath = modtask.getDataFilePath(queryObject.fileName);
    var outcome;
    try {
      outcome = {
        success: true,
        data: require('fs').readFileSync(filePath)
      };
    } catch(e) {
      outcome = { reason: e.toString() }
    }
    return outcome;
  }
  return modtask;
})();
