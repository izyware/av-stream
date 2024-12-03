# izy-av-stream

# Install
To install the tools for global access to `izy.avstream` command, use:

    curl -o- https://raw.githubusercontent.com/izyware/av-stream/master/sh/install.sh | bash


## Client Side Audio
To pick a device for your service use the following. Make sure to "not" use the pulse devices as they tend to introduce delays and performance issue. Instead use the ALSA devices since they are faster.

    
    npm run getaudiodevices 
    

## Loopback Devices
To stream the device output, you would need a loopback device. Below are our recommendations:

* MacOS: [macos-blackhole], you can use homebrew to install 

        brew install blackhole-2ch

If you need to run multiple side by side blackhole drivers refer to: [Running-Multiple-BlackHole-Drivers]

* Ubuntu: You should use ALSA as opposed to pulseAudio. pulseAudio will not work with the node environment. The loopback device will show up as "Built-in-Audio Stero" in Chrome. Notice that hw:SND_CARD_COUNT,0 for the output and hw:SND_CARD_COUNT,1 for the input.

        /* setup the sampleRate both for alsa and pulseaudio */
        sudo vim /etc/modprobe.d/alsa-base.conf
        sudo vim /etc/pulse/daemon.conf
        
        /* load */
        sudo modprobe snd-aloop 
        /* test */
        aplay -D plughw:3,1 ./data/test-44.1-16-mono.wav 
        /* unload */
        sudo modprobe -r snd-aloop 

## Screenrecording for Kinesis Stream
Make sure you have the correct ffmpeg version. 


    wget https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz
    tar -xvf ffmpeg-git-amd64-static.tar.xz;
    
Then

    BUCKETID=YOUR_BUCKET_ID;
    export DISPLAY=1;
    VIDEO_SIZE=WxH;
    clear;
    DATE=$(date +"%Y-%m-%d-%H-%M");
    ~/ffmpeg-git-20240629-amd64-static/ffmpeg -video_size $VIDEO_SIZE -framerate 25 -f x11grab -i :$DISPLAY+0,0 -vcodec libx264 -pix_fmt yuv420p ~/Downloads/screen-$BUCKETID-$DISPLAY-$DATE.mp4;


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


# Hardware 
Audio devices may not work properly on Apple's ARM-based system-on-a-chip (SoC) processors (M1, ...). You should use Rosetta to install node and the dependencies:

    arch -x86_64 zsh
    nvm uninstall <version>
    nvm install <version>
    nvm use <version>
    rm -rf node_modules
    npm install 
    
For Kinesis hosts that use X11 (any window manager gnome, icewm, ...) customizing cut/paste keys for Mac platforms can be achieved by swapping Alt with Ctrl (or any other keys. use xev to figure out the mapping):
    
Edit Xmodmap

    vim ~/.Xmodmap        
    
Define the codes

    keycode  37 = Alt_L
    keycode  64 = Control_L
    
Apply the changes

    xmodmap ~/.Xmodmap
    




# ChangeLog

## V7.4
* 74000012: implement workstationaudioin
* 74000011: implement self installer
* 74000010: workstationaudioin - upgrade and implement silenceDetector
* 74000009: datacaptureui - implement service
* 74000008: selenium - upgrade components to the nano-services model 
* 74000007: kinesis user - add xmodmap to enable correct key mappings at startup 
* 74000006: make kinesis service client app agnostic and implement thunderbird nano desktop
* 74000005: upgrade selenium services to the service-compose model
* 74000004: add mic power metadata to the mic status
    * more consistent with the speaker view
* 74000003: update mixer admin xcast to allow simultaneous speaker. implement incomingAudioTrackMixer and add the non-focus
    * ChannelMergerNode does not solve the issue. We had to implement proprietry incomingAudioTrackMixer
    * Update the QOS status calculator
* 74000002: implement autoReconnectOnConnectionError for the dashboard app
* 74000001: use email for facetime calling ID since phone numbers will not work when airplane mode is enabled

## V7.3
* 73000022: implement slow feature
    * slow feature would only refresh on user action. This should allow reasonable user experience in slow networking environment (1.5K for audio status, 50K per desktop)
* 73000021: implement kinesis/workstation
* 73000020: add isSilentWhenPowerIsBelow to the mixeradminclient.microphone module to enable power measurement
    * bug was reported where mic power was always zero
* 73000019: remotedesktopclient nano service improvements
    * remove waitForUIUpdateMS
    * imrprove refresh mechanism such that it will remember last refresh time to avoid collision
    * move config values into composeConfig
    * use standard status/statusCode vs. connectionFailure flag
    * improve logging
* 73000018: implement remotedesktopclient nano service
    * consolidate JSONIO calls and wrap whithin the service
    * remove waitForUIUpdateMS and improve image sync by routing everything throughthe service
* 73000017: implement 503 and 504 status codes for metrics
    * for remote, when the metrics creation timestamp gets too old we report a 504
    * when xcast server stops report a 503
* 73000016: include displayState for speaker and microphone in the metrics to allow remote visualization
* 73000015: turn callJSONIO into a service end-point
    * xcastSourceServerJSONIOUrl is included within the service context
* 73000014: implement apps/adminlocalaudioclient
* 73000013: implement the ability to initiate voice audio calls
* 73000012: implement dropAllZeroAudioPacket for nonBrowserSpeakerNode
    * addresses delays encountered when using portAudio interface
* 73000011: use abort - outcome pattern for calling JSONIO service
* 73000010: decouple admin client audio speaker and mic from the metrics monitoring
    * implement publishMetrics option for mixeradminclient service
    * implement consumeMetricsOnly option for mixeradminclient service
    * disable speaker, mic and socket connect for web client
* 73000009: reset samplerate monitoring window every 10seconds. rearrange UI
* 73000009: do not downSample when sending silence packets
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


[Running-Multiple-BlackHole-Drivers]: https://github.com/ExistentialAudio/BlackHole/wiki/Running-Multiple-BlackHole-Drivers
[macos-blackhole]: https://github.com/ExistentialAudio/BlackHole