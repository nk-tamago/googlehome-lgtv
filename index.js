'use strict';

let self = this;
const appconfig = require('./appconfig.json');

const lgtv = require("lgtv2")({
    url: appconfig.TV_URL
});

const firebase = require("firebase-admin");

const wol = require('wake_on_lan');
//const tvurl = 'ws://192.168.0.50:3000';

// firebase関係
const firebaseServiceAccount = require(appconfig.FIREBASE_SERVICEACCOUNT_PRIVATEKEY);
firebase.initializeApp({
  credential: firebase.credential.cert(firebaseServiceAccount),
  databaseURL: appconfig.FIREBASE_DATABASE_URL
})
const lgtvActionRef = firebase.database().ref("/lgtv/action");

self.connected = false;
self.retryCount = 0;
self.lgtv = lgtv;
self.tvurl = appconfig.TV_URL;
self.init = false;
self.channelHash = {};
self.event = {};


const lgtvHandler = {
    "won" : (resolve, reject)=>{
        wol.wake(appconfig.TV_MAC, (error)=> {
            if (error) return callback(new Error('webOS3 wake on lan error'));
               // setTimeout(self.lgtvWOLConnect.bind(self), 5000);
          })
    },
    "off" : (resolve, reject)=>{

    },
    "volume" : (volume, resolve, reject)=>{

    },
    "channel" : (channel, resolve, reject) => {
        lgtv.request('ssap://tv/getCurrentChannel', (err,res)=>{
        //console.log(res);
            let key = res.channelModeId.toString() + "_" + channel.toString();
            if (key in self.channelHash) {
                let channelId = self.channelHash[key].channelId;
                lgtv.request('ssap://tv/openChannel',{channelId:channelId}, (err,res)=>{
                    resolve();
                });
            }
            else{
                resolve();
            }
        });
    }
}

function getChannelList( resolve, reject ){
    if( !self.init ){
        lgtv.request('ssap://tv/getChannelList', (err,res)=>{
//                    console.log(res);
            res.channelList.forEach((channel)=>{
                if( channel.Numeric == false && channel.serviceType==1){
                    let key = channel.channelModeId.toString() + "_" +channel.shortCut.toString();
                    self.channelHash[key] = {
                        channelId: channel.channelId,
                        channelName: channel.channelName,
                        channelNumber: channel.channelNumber,
                        channelModeId: channel.channelModeId,
                        channelMode: channel.channelMode,
                        serviceType: channel.serviceType,
                        shortCut: channel.shortCut
                    };
//                            console.log(channel.channelId + "," + channel.channelName + "," + channel.channelNumber + "," + channel.channelModeId + "," + channel.channelMode + "," + channel.serviceType + "," + channel.shortCut);
                }
            })
//            lgtv.disconnect();
            self.init = true;
            resolve();
        });
    }
    else {
        resolve();
    }
}

lgtv.on('connect', () => {
    console.log('connected');
    self.connected = true;

    Promise.resolve().
    then( () => {
        return new Promise( (resolve, reject) => {
            getChannelList(resolve, reject);
        });
    }).then( ()=>{
        return new Promise( (resolve, reject) => {
            lgtvHandler[self.event.type]( self.event.param, resolve, reject );
        })
    })
    .then( ()=>{
        return new Promise( (resolve, reject) => {
            lgtv.disconnect();
            resolve();
        });

    });
    
});


lgtv.on('close', function() {
    console.log('disconnected from TV');
    self.connected = false;
});

    // firebase LINE BOTの受信
lgtvActionRef.on("value", function(snapshot) {
        console.log(snapshot.val());
//        self.event = snapshot.val();
        self.event.type = "channel";
        self.event.param = 3;
        //self.lgtv.disconnect()
        self.lgtv.connect(self.tvurl,"aa");
        /*
        self.lgtvWOLConnect( function(){
            lgtv.request('ssap://tv/getChannelList', function(err,res){
                console.log(res);
                lgtv.disconnect();
            });
        })
        */

            //  console.log(snapshot.val());
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });


self.lgtvWOLConnect = function(callback){
    if( this.connected ){
        this.retryCount = 0;
        return callback();
    }
    else{
        if( this.retryCount < 10 ){
            this.lgtv.connect(this.tvurl);
            this.retryCount++;
            setTimeout(this.lgtvWOLConnect.bind(this,callback), 1000);
        }
        else{
            this.retryCount=0;
            return false;
        }
    }
}



lgtv.on('error', function (err) {
    console.log(err);
});

/*
lgtv.on('connect', function () {
    console.log('connected');

    lgtv.request('ssap://tv/getExternalInputList', function(err,res){
        console.log(res);
    });


    lgtv.request('ssap://system.launcher/launch', {id: 'com.webos.app.livetv'}, function(err,res){
        //res.channelList.forEach( function(a){ console.log(a.channelNumber + "," + a.channelName + ","+ a.channelId); });
        console.log(res);
    });


    // firebase LINE BOTの受信
    lgtvActionRef.on("value", function(snapshot) {
        console.log(snapshot.val());


        //  console.log(snapshot.val());
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });

});
*/
//lgtv.disconnect();

