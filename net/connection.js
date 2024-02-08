/* izy-loadobject nodejs-require */
module.exports = function() {
  var modtask = function() {};

  modtask.destroyConnection = function(connection, reason) {
    const { connectionId } = connection;
    try {
      modtask.datastreamMonitor.log({ key: 'networking', msg: {
        connectionId,
        action: 'destroyConnection',
        reason
      }});
      connection.socket.destroy();
      delete global.__connections[connectionId];
      delete global.__sockets[connectionId];
    } catch(e) {
      modtask.datastreamMonitor.log({ key: 'networking', level: 2, msg: {
        connectionId,
        action: 'destroyConnection failed',
        reason: e.message
      }});
    }
  }

  modtask.registerConnection = function(connectionId, _socket, datastreamMonitor, context, type, user) {
    var connections = global.__connections;
    let formatArrayBufferForWriting = abChunk => abChunk;
    if (typeof(window) == 'object') {
    } else {
      // in the nodeJs non browser environment (serverside) writing the arrayBuffer to socket.write
      // would result in string on the other-end. this is true for both ws and socket
      // setting the binarytype didnt help either
      // below will fix it
      formatArrayBufferForWriting = data => new Buffer.from(data)
    };

    if (!user) user = { id: null };

    var connection = {
      type: 'socket',
      socket: _socket,
      connectionId: connectionId,
      destroy: function(c) {
        modtask.destroyConnection(c, 'manual');
      },
      writeArrayBuffer: abChunk => _socket.write(formatArrayBufferForWriting(abChunk)),
      // legacy -- use user.id object instead
      id: user.id,
      user,
      stopProcessingSocketData: false,
      client: {
        context,
        type,
        buffer: '',
        postDataLength: -1,
        postData: ''
      },
      outcome: { success: true }
    };
    connection.datastreamMonitor = datastreamMonitor;
    connections[connectionId] = connection;
    return connection;
  }

  modtask.add = function(queryObject, cb, context) {
    var { datastreamMonitor } = modtask;
    const { service } = context;
    const { connectionId, serviceInstance, serviceConfig, handshakeProtocol } = queryObject;
    if (!connectionId) return cb({ reason: 'invalid connectionId' });
    if (!serviceInstance) return cb({ reason: 'specify serviceInstance' });
    if (!serviceConfig) return cb({ reason: 'specify serviceConfig' });

    
    var connections = global.__connections;
    var _socket = global.__sockets[connectionId];
    var connection = modtask.registerConnection(connectionId, _socket, datastreamMonitor, 'xcast', 'unknown');
    global.__dataFrames[connectionId] = null;

    let invokeString = null;
    if (handshakeProtocol == 'manual') {
      return modtask.doChain([
        ['//inline/?onConnectionStateUpdate', {
          connectionId,
          serviceConfig,
          serviceInstance,
          invokeString: service.invokeString,
          shouldCallonNewConnection: true,
          shouldCallonData: false
        }]
      ]);
      return;
    };

    _socket.on('data', function(chunk) {
      if (connection.stopProcessingSocketData) return;
      /* all of these use the buffer. TODO: get rid of this */
      var shouldCallonNewConnection = false;
      var shouldCallonData = true;
      var isLegacy = (
        connection.client.type == 'unknown'
        || connection.client.type == 'jsonio'
        || connection.client.type == 'partialcontent'
        || connection.client.type == 'audio'
      );

      if (isLegacy) {
        connection.client.buffer += chunk.toString();
        if (connection.client.type == 'unknown') {
          /* we could also have an OPTION request from the browser */
          if (connection.client.buffer.toLowerCase().indexOf('jsonio http/') > 0) {
            connection.client.type = 'jsonio';
          } else if (connection.client.buffer.toLowerCase().indexOf('get /partialcontent') == 0) {
            connection.client.type = 'partialcontent';
          } else if (connection.client.buffer.indexOf('{') == 0) {
            var peerHandshake = connection.client.buffer;
            if (peerHandshake.indexOf('\r\n') > -1) {
              chunk = chunk.slice(peerHandshake.indexOf('\r\n') + 2);
              peerHandshake = JSON.parse(peerHandshake.split('\r\n')[0]);
              connection.peerHandshake = peerHandshake;
              connection.client.type = peerHandshake.type;
              connection.id = peerHandshake.id;
              connection.user.id = peerHandshake.id;
              connection.client.buffer = '';
              datastreamMonitor.log({ key: 'networking', msg: {
                connectionId,
                client: connection.client,
                data: 'peerHandshake processed successfully'
              }});
              isLegacy = false;
              shouldCallonNewConnection = true;
            }
          } else {
            connection.client.type = 'audio';
          }
        }
        datastreamMonitor.log({ key: 'networking', msg: {
          connectionId,
          type: connection.client.type,
          data: 'type resolved'
        }});
      }

      if (!isLegacy) {
        if (!chunk.length) shouldCallonData = false;
        global.__dataFrames[connectionId] = chunk;
      }

      if (!invokeString) {
        invokeString = '//inline/service/' + connection.client.type + '/net';
        switch(connection.client.type) {
          case 'portforwarding':
          case 'kinesis':
          case 'audiooutput':
          case 'jsonio':
          case 'virtualcamera':
          case 'audioinput':
            invokeString = '//inline/service/' + connection.client.type + '/xcast';
            break;
        };
      };
      modtask.doChain([
        ['//inline/?onConnectionStateUpdate', {
          connectionId,
          serviceConfig,
          serviceInstance,
          invokeString,
          shouldCallonNewConnection,
          shouldCallonData
        }]
      ]);
    });
    _socket.on('end', function() {
      datastreamMonitor.log({ key: 'networking', msg: {
        connectionId,
        reason: 'ended connection'
      }});
      delete connections[connectionId];
      delete global.__sockets[connectionId];
    });

    _socket.on('error', function(err) {
      datastreamMonitor.log({ key: 'networking', level: 2, msg: {
        connectionId,
        action: 'socket.on.error',
        errorObject: err
      }});
      _socket.destroy();
      delete connections[connectionId];
      delete global.__sockets[connectionId];
    });

    datastreamMonitor.log({ key: 'networking', msg: {
      connectionId,
      data: 'event handlers attached, waiting for peer handshake'
    }});

    return cb({ success: true });
  };

  modtask.handshake = async (queryObject, cb, context) => {
    const { datastreamMonitor } = modtask;
    const { service } = context;
    const { type, connectionId } = queryObject;

    var connection = global.__connections[connectionId];
    var socket = connection.socket;

    var peerHandshake = JSON.stringify({
      name: service.name,
      type,
      id: connection.user.id
    });

    socket.write(peerHandshake + '\r\n');
    datastreamMonitor.log({ key: 'networking', msg: {
      connectionId,
      peerHandshake
    }});

    return { success : true };
  }

  modtask.onConnectionStateUpdate = function(queryObject, cb, context) {
    const { datastreamMonitor } = modtask;
    const { service } = context;
    let { connectionId, serviceConfig, serviceInstance, invokeString, shouldCallonNewConnection, shouldCallonData } = queryObject;
    
    const connection = global.__connections[connectionId];
    const peerHandshake = connection.peerHandshake || {};

    datastreamMonitor.log({ key: 'networking', msg: {
      connectionId,
      invokeString,
      shouldCallonData,
      shouldCallonNewConnection,
      id: connection.user.id,
      client: connection.client,
      peerHandshake
    }});

    modtask.doChain([
      ['newChain', {
        context: { 
          spawnChildService: {
            name: service.name + '.' + (peerHandshake.name || 'child'),
            invokeString
          }
        },
        chainItems: [
          shouldCallonNewConnection ? [invokeString + '?onNewConnection', {
            connectionId,
            serviceConfig: serviceConfig[connection.client.type] || serviceConfig,
            serviceInstance
          }] : ['continue'],
          chain => {
            if (!shouldCallonNewConnection) return chain(['continue']);
            shouldCallonNewConnection = false;
            const dataBinding = (chain.get('outcome').data || {}).dataBinding || 'default';
            datastreamMonitor.log({ key: 'networking', msg: {
              connectionId,
              data: 'data binding determined',
              dataBinding
            }});
            if (dataBinding == 'manual') {
              connection.stopProcessingSocketData = true;
              datastreamMonitor.log({ key: 'networking', msg: {
                connectionId,
                stopProcessingSocketData: connection.stopProcessingSocketData
              }});
              return;
            }
            chain(['continue']);
          },
          chain => chain(shouldCallonData ? [invokeString + '?onData', {
            connectionId,
            serviceConfig: serviceConfig[connection.client.type] || serviceConfig,
            serviceInstance
          }] : ['continue']),
          ['set', 'outcome', { success: true }]
        ]
      }],
      function(chain) {
        var outcome = chain.get('outcome');
        connection.outcome = outcome;
        if (!outcome.success) {
          datastreamMonitor.log({ level: 2, key: 'networking', msg: {
            connectionId,
            invokeString,
            outcome
          }});
          // will send a FIN packet and will trigger an 'end' event -- as opposed to socket.destroy
          connection.socket.end();
        }
      }
    ]);
  }

  return modtask;
};
module.exports.forcemodulereload = true;

