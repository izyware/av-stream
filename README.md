# izy-av-stream

## Client Side Audio
To pick a device for your service use the following. Make sure to "not" use the pulse devices as they tend to introduce delays and performance issue. Instead use the ALSA devices since they are faster.

    
    npm run getaudiodevices 
    

## Loopback Devices
To stream the device output, you would need a loopback device. Below are our recommendations:

* MacOS: [macos-blackhole], you can use homebrew to install 

        brew install blackhole-2ch


# ChangeLog

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