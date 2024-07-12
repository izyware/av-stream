/* izy-loadobject nodejs-require */
module.exports = function() {
    var modtask = function() {};
  
    modtask.onConfig = async function(queryObject, cb, context) {
      const { datastreamMonitor } = modtask;
      const { service } = context;
      const { composeConfig, user } = service;

      const { cmd, url, thresholdSeconds, metadataVarName } = composeConfig;
      
      if (service.serviceConfig) return cb({ reason: 'service is not reconfigurable' });


      service.serviceConfig = {
        started: true
      }

      datastreamMonitor.log({ msg: { cmd, url } });
      let cmdTS = 0;
      let firstRun = true;
      while (true) {
        let now = new Date().getTime();
        let ts = now;
        try {
            const { response } = await modtask.newChainAsync([
                ['net.httprequest', {
                    url: url,
                    method: 'POST',
                    body: JSON.stringify({ action: 'get', name: metadataVarName + '.' + user.id }),
                    responseType: 'json'
                }]
            ]);
            ts =  ((response ? response.data : null) || null) || 0;
        } catch(e) {
            datastreamMonitor.log({ level: 2, msg: { errorObject: e }});
        }
        let deltaS = Math.round((now - ts) / 1000, 0);
        let cmdDeltaS = Math.round((now - cmdTS) / 1000, 0);
        const shouldCmd = firstRun || (deltaS > thresholdSeconds) && (cmdDeltaS > thresholdSeconds);
        datastreamMonitor.log({ msg: { deltaS, thresholdSeconds, shouldCmd, cmdDeltaS }});
        if (shouldCmd) {
            cmdTS = now;
            let { data } = await modtask.newChainAsync([
                ['//inline/?shellExec', { cmd }]
            ]);
            datastreamMonitor.log({ msg: { 
                action: 'workstationcmd',
                deltaS,
                cmdDeltaS,
                cmd,
                firstRun
                // dumping data here would screw up the terminal 
                // output: data
            }});
        };
        firstRun = false;
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    };

    modtask.shellExec = function(queryObject, cb, context) {
        require('child_process').exec(queryObject.cmd, {
            maxBuffer: 1024*1024*1024
        }, (error, stdout, stderr) => {
            if (error) {
                return cb({ reason: error.message });
            }
            cb({ success: true, data: String(stdout) + String(stderr) });
        });
    };
  
    return modtask;
  }
  module.exports.forcemodulereload = true;
