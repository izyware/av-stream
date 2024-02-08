/* izy-loadobject nodejs-require */
module.exports = function() {
  const Net = require('net');

  var modtask = function() {};
  modtask.setupClient = function(queryObject, cb) {
    let { reconnectDelay, service, serviceConfig, serviceInstance, user, dataBinding } = queryObject;

    let address = serviceConfig.address;
    if (!address) return cb({ reason: 'specify address' });
    if (!reconnectDelay) reconnectDelay = 3000;
    const doNotReconnect = reconnectDelay == -1;

    address = address.split(':');
    const sourceAddress = { port: address[1], host: address[0] };
    var connectionId = global.__connectionId++;

    let timeOutHandleId = null;
    const { datastreamMonitor } = modtask;
    function connectToServer() {
      var socket = new Net.Socket();
      global.__sockets[connectionId] = socket;
      delete global.__connections[connectionId];

      var eventsDisable = false;
      socket.on('end', function() {
        if (eventsDisable) return;
        eventsDisable = true;
        datastreamMonitor.log({ msg: {
          connectionId,
          data: 'peer ended the connection, will reconnect'
        }});
        reConnect(connectionId, service.context);
      });

      socket.on('error', function(err) {
        if (eventsDisable) return;
        eventsDisable = true;
        datastreamMonitor.log({ msg: {
          connectionId,
          data: `connection error: ${err.toString()}`
        }});
        reConnect(connectionId, service.context);
      });

      if (dataBinding == 'manual') {
      } else socket.on('data', function(chunk) {
        global.__dataFrames[connectionId] = chunk;
        modtask.doChain([
          ['newChain', {
            context: 'copy',
            chainItems: [service.invokeString + '?onData', { connectionId }]
          }],
          function(chain) {
            var outcome = chain.get('outcome');
            if (!outcome.success) {
              console.log('error:', outcome.reason);
              socket.close();
            }
          }
        ]);
      });

      datastreamMonitor.log({ msg: {
        connectionId,
        action: 'connectToServer',
        address
      }});

      socket.connect(sourceAddress, function() {
        modtask.ldmod('rel:connection').registerConnection(connectionId, socket, datastreamMonitor, service.context, service.type, user);
        const invokeString = service.invokeString + '?onNewConnection';
        datastreamMonitor.log({ msg: {
          connectionId,
          invokeString
        }});
        modtask.doChain([
          ['newChain', {
            context: 'copy',
            chainItems: [
              [invokeString, { connectionId, serviceInstance }]
            ]
          }],
          function(chain) {
            var outcome = chain.get('outcome');
            if (!outcome.success) {
              datastreamMonitor.log({ level: 2, msg: {
                connectionId,
                invokeString,
                outcome
              }});
              socket.close();
            }
          }
        ]);
      });
    };

    function reConnect(connectionId, context) {
      if (doNotReconnect) return;
      if (timeOutHandleId) return;
      datastreamMonitor.log({ level: 2, msg: {
        connectionId,
        context,
        data: `attempting reconnect in ${reconnectDelay}`,
        address: serviceConfig.address
      }});
      timeOutHandleId = setTimeout(function() {
        clearTimeout(timeOutHandleId);
        timeOutHandleId = null;
        connectToServer();
      }, reconnectDelay);
    }
    connectToServer();
    cb({ success: true });
  };

  modtask.setupServer = function(queryObject, cb, context) {
    const { datastreamMonitor } = modtask;
    const { service, serviceConfig, serviceInstance, handshakeProtocol } = queryObject;
    if (!service) return cb({ reason: 'please specify service' });
    if (!serviceConfig) return cb({ reason: 'please specify serviceConfig' })
    if (!serviceInstance) return cb({ reason: 'please specify serviceInstance' });
    var address = queryObject.address || 'localhost:10001';
    const port = parseInt(address.split(':')[1]);
    const server = new Net.Server();
    datastreamMonitor.log({ msg: {
      action: 'listen',
      address
    }});
    server.on('error', errorObject => {
      datastreamMonitor.log({ level: 2, msg: {
        action: 'listen',
        address,
        errorObject
      }});
      // todo: once the socket server model supports 'onConnectionState' (like websocket) notify with error state
      // for now throw which will just crash the app
      throw errorObject;
    });
    server.listen(port, function() {
      server.on('connection', function(socket) {
        var connectionId = global.__connectionId++;
        datastreamMonitor.log({ msg: {
          connectionId,
          data: `new connection recieved on ${address}`,
          handshakeProtocol
        }});
        global.__sockets[connectionId] = socket;
        modtask.doChain([
          ['newChain', {
            context: 'copy',
            chainItems: ['//inline/net/connection?add', { connectionId, handshakeProtocol, serviceConfig, serviceInstance }]
          }],
          function(chain) {
            var outcome = chain.get('outcome');
            if (!outcome.success) {
              datastreamMonitor.log({ level: 2, msg: {
                connectionId,
                action: 'connection?add',
                outcome
              }});
            }
          }
        ]);
      });
      cb({ success: true });
    });
  };

  return modtask;
};
module.exports.forcemodulereload = true;

