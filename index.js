'use strict';

let self = this;
const appconfig = require('./appconfig.json');
const lgtv = require("lgtv2")({
    url: appconfig.TV_URL
});
const firebase = require("firebase-admin");
const wol = require('wake_on_lan');

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
self.event = undefined;
self.setEvent = (event) => {
  this.event = event;
}
self.getEvent = () => {
  return this.event;
}


const lgtvHandler = {
    "off" : (event, resolve, reject)=>{
      lgtv.request('ssap://system/turnOff', function (err, res) {
        resolve();
      });
    },
    "launch_tv" : (event, resolve, reject)=>{
        lgtv.request('ssap://system.launcher/launch', {id: "com.webos.app.livetv"}, function (err, res) {
            resolve();
        });
    },
    "launch_tvguide" : (event, resolve, reject)=>{
        lgtv.request('ssap://system.launcher/launch', {id: "com.webos.app.tvguidejpn"}, function (err, res) {
            resolve();
        });
    },
    "volume" : (event, resolve, reject)=>{
        let vol = event.param;
        // 大きな誤音が出ないように最大20とする
        if( vol > 20 ){
            vol = 20;
        }
        lgtv.request('ssap://audio/setVolume', {volume: vol} , (err,res)=>{
            resolve();
        });
    },
    "channel" : (event, resolve, reject) => {
        const channel = event.param;
        // テレビ以外で呼ばれた場合は、テレビに切り替えてからチャンネル切り替えを行う
        // Promiseがネストしているので要注意
        resolve( new Promise((main_resolve, main_reject) => {
            Promise.resolve().
            then( ()=>{
                return new Promise( (inner_resolve, inner_reject) => {
                    lgtv.request('ssap://com.webos.applicationManager/getForegroundAppInfo', (err,res)=>{
                        let isLivetv = false;
//                        console.log(res);
                        if (!err && res && res.appId === 'com.webos.app.livetv') {
                            isLivetv = true;
                        }
                        inner_resolve(isLivetv);
                    });
                });
            }).then( (isLivetv)=>{
                return new Promise( (inner_resolve, inner_reject) => {
                    if( isLivetv ) {
                        return inner_resolve(0);
                    }
                    lgtv.request('ssap://system.launcher/launch', {id: "com.webos.app.livetv"}, function (err, res) {
                        inner_resolve(500);
                    });
                });
            }).then( (delayTime) => {
                return new Promise( (inner_resolve, inner_reject) => {
                    // テレビに切り替えた後にすぐ呼ばれると、
                    // "handler_broadcast_setPIPon Error"となるので、少し遅れて呼ぶ
                    // それでもエラーが出た場合は以降の処理をしない
                    setTimeout( ()=> {
                        lgtv.request('ssap://tv/getCurrentChannel', (err,res)=>{
    //                        console.log(res);
                            if( res.returnValue == false ){
                                return inner_resolve();
                            }
                            let key = res.channelModeId.toString() + "_" + channel.toString();
                            if (!(key in self.channelHash)) {
                                return inner_resolve();
                            }
                
                            let channelId = self.channelHash[key].channelId;
                            lgtv.request('ssap://tv/openChannel',{channelId:channelId}, (err,res)=>{
                                inner_resolve();
                            });
                        });
                    }, delayTime);
                });
            }).then( ()=>{
                main_resolve();
            }).catch( () =>{
                main_resolve();
            })

        }));
    }
}

function getChannelList( resolve, reject ){
    if( !self.init ){
        lgtv.request('ssap://tv/getChannelList', (err,res)=>{
//            console.log(res);
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
            self.init = true;
            resolve();
        });
    }
    else {
        resolve();
    }
}


lgtv.on('connect', () => {
//    console.log('connected');
    self.connected = true;

    Promise.resolve().
    then( ()=>{
        return new Promise( (resolve, reject) => {
            getChannelList(resolve, reject);
        });
    }).then( ()=>{
        return new Promise( (resolve, reject) => {
            const event = self.getEvent()
            lgtvHandler[event.type]( event, resolve, reject );
        })
    })
    .then( ()=>{
        return new Promise( (resolve, reject) => {
            lgtvActionRef.update({
                "type": "none"
            });
            resolve();
        });            
    })
    .then( ()=>{
        return new Promise( (resolve, reject) => {
            lgtv.disconnect();
            resolve();
        });

    })
    .catch( () =>{
        lgtv.disconnect();
    });

});


lgtv.on('close', function() {
//    console.log('disconnected from TV');
    self.connected = false;
});


lgtvActionRef.on("value", function(snapshot) {
    const event = snapshot.val();
//    console.log(event);
    // 初期化用コードは無視
    if( event.type == "none" ){
        return;
    }

    // wolは接続前に呼ばれる必要があるためここで呼ぶ
    if( event.type == "wol" ){
        wol.wake(appconfig.TV_MAC, (err)=> {
            lgtvActionRef.update({
                // 初期化用
                "type": "none"
            });
        });
        return;
    }

    let delayTime = 0;
    
    // 接続が解除されていないと、イベントが飛ばないので解除する
    if(self.connected){
        lgtv.disconnect();
        delayTime = 1000;
    }
    self.setEvent(event);

    setTimeout( ()=>{
        lgtv.connect(self.tvurl);
    }, delayTime);

}, function (errorObject) {
    console.log("The read failed: " + errorObject.code);
});



lgtv.on('error', function (err) {
  lgtv.disconnect();
//  console.log(err);
});
