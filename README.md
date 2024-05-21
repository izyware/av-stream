# izy-av-stream

## Client Side Audio
To pick a device for your service use the following. Make sure to "not" use the pulse devices as they tend to introduce delays and performance issue. Instead use the ALSA devices since they are faster.

    
    npm run getaudiodevices 
    

## Loopback Devices
To stream the device output, you would need a loopback device. Below are our recommendations:

* MacOS: [macos-blackhole], you can use homebrew to install 

        brew install blackhole-2ch

## mixeradminclient Service and QOS Client
A typical setup is like this

* peer:audioinput audioNode -> onNewConnection.socketWriterNode(streamproto1)
    * xcast: streamToMixerBackend.socketReaderNode(streamproto1)
        * mixerNode 
        * onAudioPacket -> mixeradminSharedState[userId] = audioInputMetadata
        * xcast:mixeradmin aggregatorAudioOutputNode -> aggregatorOutputToClient.socketWriterNode(streamproto1)
            * getMetaDataStrFunction: mixeradminSharedState
            * peer:xcastSourceMonitor -> hubToSpeakerContext.socketReaderNode(streamproto1)
                * adminSpeakerInput
                * onMetaDataPacket -> aggregatedStatesSnapshot
        
mixeradminclient service provides the service APIs the QOS client uses to monitor the mixer quality. `//service/mixeradminclient?getMetrics` will be polled by QOS which will provide the aggregated metrics to the QOS dashboard using `aggregatedStatesSnapshot` variable. 


`aggregatedStatesSnapshot` contains:

* currentSpeakerBufferDepthInFloat32Samples
* currentSpeakerSampleRate
* protocol level metadata for each connection



### end to end 

Use the streamproto1 with the socketReader/Writer nodes to enable QOS monitoring.

As the first step, setting the `enableQOSMetrics` flag to true for the streamproto1 object, will trigger a call to the qosWriter method everytime an audio packet is recieved. A `QOSMetrics` object will be generated and passed on to the the `qosWriter` method. The object will have the following properties:

* head: the header that was immediately preceding the audio packet
* qosTimestamp: unix timestamp

A typical implementation may be found in `service/audiooutput`:


    (xcast) audio source => IzySocketWriterNode => metadata packet(getMetaDataStrFunction) + audio packet => (peer) => IzySocketReaderNode => audio sink
    (xcast) updateQOSForUser <= socket.on('data') <= Stringify(QOSMetrics) (peer) <= enableQOS?qosWriter


* peer: qosWriter method serialize the `QOSMetrics`, and write it back to the xcast
* xcast: the connection.client.QOSMetrics property will be populated by JSON.parsing the incoming data from the socket, and will be aggregated based on user.id into the `mixeradminSharedState` storeLib variable.

Eventually, `service/mixeradmin` will push the `mixeradminSharedState` back to the admin using `socketWriterNode.getMetaDataStrFunction`:
* xcast: socketWriterNode.getMetaDataStrFunction will pick up the `mixeradminSharedState` alongside other xcast state objects and serialize them.
* peer: socketReaderNode.readMetadataPacket will set `storeLib.set('readMetadataPacket')` value which is then consumed by `dashboard/userinput/qos/api` to populate the QOS dashboard.







# ChangeLog

## V7.3
* 73000008: implement downsampleRatio and upsampleRatio
    * specify downsampleRatio and upsampleRatio at config
* 73000007: implement outgoingAudioTracks and fix mic red 
* 73000006: reset speakerScriptProcessorIncomingBufferMisses when speakerSilenceDetected or aggregator input is stopped
* 73000005: ingestor break apart the fields and introduce speakerScriptProcessorLatencyMS and speakerScriptProcessorIncomingBufferMisses
* 73000004: add data-izy-circus-inner-html-status tag for aggregatorStatus
* 73000003: implement metric for is incomingAudioTrack connected
    * either empty incoming audio tracks or when channel sequence number is stuck and we cross the latency threshold 
* 73000002: implement incomingAudioTracks metric.
* 73000001: add dev_mode to spin off mixerhub+workstationaudioout inside the terminal app

## V7.2
* 7200016: migrate net/connection
* 7200015: add support for riff and wav file format
* 7200014: migrate file audio streaming from xcast
* 7200013: migrate audio and networking libraries
* 7200012: update service compose
* 7200011: update service app to use service apis
* 7200010: migration of workstationaudioout
* 7100010: initial migration from izy-idman-tools


[macos-blackhole]: https://github.com/ExistentialAudio/BlackHole