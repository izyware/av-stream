# izy-av-stream

# Install
To install the tools for global access to `izy.avstream` command, use:

    curl -o- https://raw.githubusercontent.com/izyware/av-stream/master/sh/install.sh | bash



# Basic Setup    
To pick a device (on all platforms) for your service use the following. 
    
    npm run getaudiodevices 



# Routing audio across systems
You need to "add" two audio devices, one source and one sink that can route (loopback) the audio output and input from and to the workstation. If you are using a host system, you can physically connect the host system's devices to the workstation and configure the services to use the host system's source and sink.

If you are not using a host system, you would need to use virtual devices and software loopback. Below different workstation platforms are discussed.

## MacOS
Use [macos-blackhole], you can use homebrew to install 

    brew install blackhole-2ch

If you need to run multiple side by side blackhole drivers refer to: [Running-Multiple-BlackHole-Drivers].

Always set your default system microphone and speaker to the virtual device. 

## Linux
Note that NaudioDon leverages ALSA (Advanced Linux Sound Architecture) for low-level audio input/output on Linux-based systems like Ubuntu which means that pulseAudio will not work with the node environment. On the other hand, most applications (Chrome, etc.) will, by default, try to communicate with PulseAudio to handle audio streams (e.g., media playback in the browser, sound notifications, etc.). You can verify whether your app uses ALSA by doing:

    sudo lsof /dev/snd/*

To manage the lifecycle of the virtual devices use the following commands (Notice that the ALSA virtual device would use `hw:device X,0` for the sink and `hw:device X,1` for the source):

    /* setup the sampleRate both for alsa and pulseaudio */
    sudo vim /etc/pulse/daemon.conf
    
    /* add the following */
    sudo vim /etc/modprobe.d/alsa-base.conf
    options snd-aloop index=10,11 enable=1,1
    
    /* add snd-aloop to load at boot time */
    sudo vim /etc/modules
    
    /* set the default sink and source (speaker and microphone) */
    /etc/pulse/default.pa
    
Optionally, if you prefer to perform these task manually 
    
    /* load */
    sudo modprobe snd-aloop
    /* set sink and source manually */
    pactl list short sinks
    pactl set-default-sink 
    /* To see the current defaults */
    pactl info
    /* unload */
    sudo modprobe -r snd-aloop 
    
You can test the ALSA device

    /* test */
    aplay -D plughw:3,1 ./data/test-44.1-16-mono.wav 

    
The device will show up as "Built-in-Audio Stero" in Chrome as it is percieved by pulseAudio. 

If you need to test that the virtual device sink is recieving audio from Chrome, you can use pulseAudio to route its source to the hardware sink (speaker) device:

    pactl list short sources | grep monitor
    pactl load-module module-loopback source=alsa_output.platform-snd_aloop.0.analog-stereo.monitor sink=alsa_output.usb-ASUSTeK_COMPUTER_INC._C-Media_R__Audio-00.analog-stereo
    
    pactl unload-module module-loopback
  

# Routing Video

## Using a virtual camera for the front-end
It is recommended to use OBS studio virtual camera in conjuctions with an X server running on the machine. On MacOS, XQuarz may be used. 

Steps to configure XQuartz:
* Settings > Security: Enable "Allow connection from clients" and disable "Authenticate connections"
* Xterm: run the following
        
        service/virtualcamera/macos/xquartz.sh

## Linux
Use 
    
    chrome://media-internals/

  
# Misc Topics 
      
## Audio forwarding
On ubuntu you may use
        
        sudo nano /etc/pulse/default.pa
        load-module module-native-protocol-tcp
        pulseaudio -k
        pulseaudio --start  
        export PULSE_SERVER=localhost
        pactl info
        


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

## V7.5
* 75000012: update XQuartz setup instructions
* 75000011: update keyboard command interface
* 75000010: create setfastkeyboard script to allow for manual setup
    * icewm may have another process overwriting keyboard settings post start up
* 75000009: admin improve remotedesktop ui
* 75000008: kinesis allow execInteractiveNonblocking for commands
    * some command might fail when not running in interactive shell
    * improve logging for command stdio
* 75000007: componentize the virtualcamera stages and allow multi camera config sections
    * improves flexibility for different icewm and workstation setups
* 75000006: allow single string input for lib/shell 
* 75000005: implement amplifierGain for IzyAudioInputNode and organize into nodeConfig
* 75000004: update audioAggregator and support mixWorkstationAudio acceptOnlyOutputWorkstationAudio acceptOnlyInputWorkstationAudio modes
* 75000003: prevent double starts on nonBrowserSpeakerNode
    * on MacOS systems it would freeze the process 
* 75000002: implement interactiveShell feature for lib/shell
    * on Linux interactive shell might need to be explicitly specified
* 75000001: implement apps/generic.js for converting shell commands into services
    * use `pm2 start apps/generic.js --name service -- service` syntax
    
## V7.4
* 74000013: add debug/audio module for audioinput
    * this will be removed and functionality integrated ino the webAudio library
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