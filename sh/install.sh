#!/usr/bin/env bash
{ # this ensures the entire script is downloaded #
echo installing ...
mkdir ~/izyware;
cd ~/izyware;
rm master.zip;
curl -LO https://github.com/izyware/av-stream/archive/refs/heads/master.zip;
unzip master.zip;
mv av-stream-master av-stream;
rm master.zip;
cd av-stream;
npm install;
sudo npm link;
echo izy.av-stream installed
} # this ensures the entire script is downloaded #
