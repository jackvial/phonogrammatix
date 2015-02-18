var PgApp = PgApp || {};

;(function($, PgApp){

'use strict';

/**
 *
 * Game Audio Engine
 *
 */

PgApp.Audio = {

    init: function() {
        try {

            // Fix up for prefixing
            window.AudioContext = window.AudioContext || window.webkitAudioContext;

            // Create the Audio context
            var context = new AudioContext();

            // Gain node for the master volume control
            var masterGain = context.createGain();
            masterGain.gain.value = 0.5;
            masterGain.connect(context.destination);

            this.masterVolume(masterGain);
            this.audioQueues(context, masterGain);
        }
        catch(e) {
            alert('Web Audio API is not supported in this browser');
        }
    },
    loadSound: function(url, context, callback) {
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';

        // Decode asynchronously
        request.onload = function() {
            context.decodeAudioData(request.response, function(buffer) {
                callback(buffer);
            }, function(){
                console.log('an error occured');
            });
        }
        request.send();
    },
    playSound: function(context, masterVolume, buffer, time) {
        var _time = time || 0;

        // creates a sound source
        var source = context.createBufferSource();

        // tell the source which sound to play 
        source.buffer = buffer;

        // connect the source to the context's destination (the speakers)                    
        source.connect(masterVolume);

        // play the source now
        // note: on older systems, may have to use deprecated noteOn(time);       
        source.start(_time);                       
    },
    masterVolume: function(masterGain){
        $('#volume-control').on('change', function(e){
            console.log(+$(this).val());

            // Update the master gain, plus sign converts to numeric
            masterGain.gain.value = +$(this).val();
        });
    },
    muteOff: false,
    muteSwitch: function(context, masterGain) {
        if(!this.muteOff){
            masterGain.disconnect();
            this.muteOff = true;
        } else {
            masterGain.connect(context.destination);
            this.muteOff = false;
        }
        
    },
    audioQueues: function(context, masterGain){
        var _this = this;

        /** 
         *
         *  Main background music: J Miller - Won't Be Long (Internet Archive)
         *  Maybe add support for multiple tracks
         *
         */

        // Main track plays on page load
        this.loadSound('sounds/jimiller20140913t-01.ogg', context, function(buffer){
                console.log('Main track begins...');
               _this.playSound(context, masterGain, buffer);
        });
        
        this.loadSound('sounds/brass-funk-punches.wav', context, function(buffer){

            // Listen for the success event to fire
            $(document).on('playSuccessSound', function(){
                console.log('success sound should play');
               _this.playSound(context, masterGain, buffer);
            });
        });

        this.loadSound('sounds/short-sigh.wav', context, function(buffer){

            // Listen for the success event to fire
            $(document).on('playFailSound', function(){
                console.log('fail sound should play');
               _this.playSound(context, masterGain, buffer);
            });
        });

        this.loadSound('sounds/button5.wav', context, function(buffer){

            // Listen for a button click
            $(document).on('click', 'button', function(){
                console.log('button click sound should play');
               _this.playSound(context, masterGain, buffer);
            });
        });

        $('#mute-btn').on('click', function(){
            _this.muteSwitch(context, masterGain);
        });

    }
};
})($, PgApp);