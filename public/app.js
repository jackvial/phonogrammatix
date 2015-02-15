var PgApp = PgApp || {};

;(function($, PgApp){
    'use strict';

/**
 * All the code relevant to Socket.PgApp.IO is collected in the PgApp.IO namespace.
 *
 * @type {{init: Function, bindEvents: Function, onConnected: Function, onNewGameCreated: Function, playerJoinedRoom: Function, beginNewGame: Function, onNewWordData: Function, hostCheckAnswer: Function, gameOver: Function, error: Function}}
 */

PgApp.IO = {

    /**
     * This is called when the page is displayed. It connects the Socket.IO client
     * to the Socket.IO server
     */
    init: function() {
        PgApp.IO.socket = io.connect();
        PgApp.IO.bindEvents();
    },

    /**
     * While connected, Socket.PgApp.IO will listen to the following events emitted
     * by the Socket.PgApp.IO server, then run the appropriate function.
     */
    bindEvents : function() {
        PgApp.IO.socket.on('connected', PgApp.IO.onConnected );
        PgApp.IO.socket.on('newGameCreated', PgApp.IO.onNewGameCreated );
        PgApp.IO.socket.on('playerJoinedRoom', PgApp.IO.playerJoinedRoom );
        PgApp.IO.socket.on('beginNewGame', PgApp.IO.beginNewGame );
        PgApp.IO.socket.on('newWordData', PgApp.IO.onNewWordData);
        PgApp.IO.socket.on('hostCheckAnswer', PgApp.IO.hostCheckAnswer);
        PgApp.IO.socket.on('gameOver', PgApp.IO.gameOver);
        PgApp.IO.socket.on('error', PgApp.IO.error );
    },

    /**
     * The client is successfully connected!
     */
    onConnected : function() {
        // Cache a copy of the client's socket.PgApp.IO session ID on the PgApp.Game
        PgApp.Game.mySocketId = PgApp.IO.socket.socket.sessionid;
        // console.log(data.message);
    },

    /**
     * A new game has been created and a random game ID has been generated.
     * @param data {{ gameId: int, mySocketId: * }}
     */
    onNewGameCreated : function(data) {
        PgApp.Game.Host.gameInit(data);
    },

    /**
     * A player has successfully joined the game.
     * @param data {{playerName: string, gameId: int, mySocketId: int}}
     */
    playerJoinedRoom : function(data) {
        // When a player joins a room, do the updateWaitingScreen funciton.
        // There are two versions of this function: one for the 'host' and
        // another for the 'player'.
        //
        // So on the 'host' browser window, the PgApp.Game.Host.updateWiatingScreen function is called.
        // And on the player's browser, PgApp.Game.Player.updateWaitingScreen is called.
        PgApp.Game[PgApp.Game.myRole].updateWaitingScreen(data);
    },

    /**
     * Both players have joined the game.
     * @param data
     */
    beginNewGame : function(data) {
        PgApp.Game[PgApp.Game.myRole].gameCountdown(data);
    },

    /**
     * A new set of words for the round is returned from the server.
     * @param data
     */
    onNewWordData : function(data) {
        // Update the current round
        PgApp.Game.currentRound = data.round;

        // Change the word for the Host and Player
        PgApp.Game[PgApp.Game.myRole].newWord(data);
    },

    /**
     * A player answered. If this is the host, check the answer.
     * @param data
     */
    hostCheckAnswer : function(data) {
        if(PgApp.Game.myRole === 'Host') {
            PgApp.Game.Host.checkAnswer(data);
        }
    },

    /**
     * Let everyone know the game has ended.
     * @param data
     */
    gameOver : function(data) {
        PgApp.Game[PgApp.Game.myRole].endGame(data);
    },

    /**
     * An error has occurred.
     * @param data
     */
    error : function(data) {
        alert(data.message);
    }

};


PgApp.Game = {

    /**
     * Keep track of the gameId, which is identical to the ID
     * of the Socket.PgApp.IO Room used for the players and host to communicate
     *
     */
    gameId: 0,

    /**
     * This is used to differentiate between 'Host' and 'Player' browsers.
     */
    myRole: '',   // 'Player' or 'Host'

    /**
     * The Socket.PgApp.IO socket object identifier. This is unique for
     * each player and host. It is generated when the browser initially
     * connects to the server when the page loads for the first time.
     */
    mySocketId: '',

    /**
     * Identifies the current round. Starts at 0 because it corresponds
     * to the array of word data stored on the server.
     */
    currentRound: 0,

    /* *************************************
     *                Setup                *
     * *********************************** */

    /**
     * This runs when the page initially loads.
     */
    init: function () {
        PgApp.Game.cacheElements();
        PgApp.Game.showInitScreen();
        PgApp.Game.bindEvents();

        // Initialize the fastclick library
        FastClick.attach(document.body);
    },

    /**
     * Create references to on-screen elements used throughout the game.
     */
    cacheElements: function () {
        PgApp.Game.$doc = $(document);

        // Templates
        PgApp.Game.$gameArea = $('#gameArea');
        PgApp.Game.$templateIntroScreen = $('#intro-screen-template').html();
        PgApp.Game.$templateNewGame = $('#create-game-template').html();
        PgApp.Game.$templateJoinGame = $('#join-game-template').html();
        PgApp.Game.$hostGame = $('#host-game-template').html();
    },

    /**
     * Create some click handlers for the various buttons that appear on-screen.
     */
    bindEvents: function () {
        // Host
        PgApp.Game.$doc.on('click', '#btnCreateGame', PgApp.Game.Host.onCreateClick);

        // Player
        PgApp.Game.$doc.on('click', '#btnJoinGame', PgApp.Game.Player.onJoinClick);
        PgApp.Game.$doc.on('click', '#btnStart',PgApp.Game.Player.onPlayerStartClick);
        PgApp.Game.$doc.on('click', '.btnAnswer',PgApp.Game.Player.onPlayerAnswerClick);
        PgApp.Game.$doc.on('click', '#btnPlayerRestart', PgApp.Game.Player.onPlayerRestart);
    },

    /* *************************************
     *             Game Logic              *
     * *********************************** */

    /**
     * Show the initial Anagrammatix Title Screen
     * (with Start and Join buttons)
     */
    showInitScreen: function() {
        PgApp.Game.$gameArea.html(PgApp.Game.$templateIntroScreen);
        PgApp.Game.doTextFit('.title');
    },


    /* *******************************
       *         HOST CODE           *
       ******************************* */
    Host : {

        /**
         * Contains references to player data
         */
        players : [],

        /**
         * Flag to indicate if a new game is starting.
         * This is used after the first game ends, and players initiate a new game
         * without refreshing the browser windows.
         */
        isNewGame : false,

        /**
         * Keep track of the number of players that have joined the game.
         */
        numPlayersInRoom: 0,

        /**
         * A reference to the correct answer for the current round.
         */
        currentCorrectAnswer: '',

        /**
         * Handler for the "Start" button on the Title Screen.
         */
        onCreateClick: function () {
            // console.log('Clicked "Create A Game"');
            PgApp.IO.socket.emit('hostCreateNewGame');
        },

        /**
         * The Host screen is displayed for the first time.
         * @param data{{ gameId: int, mySocketId: * }}
         */
        gameInit: function (data) {
            PgApp.Game.gameId = data.gameId;
            PgApp.Game.mySocketId = data.mySocketId;
            PgApp.Game.myRole = 'Host';
            PgApp.Game.Host.numPlayersInRoom = 0;

            PgApp.Game.Host.displayNewGameScreen();
            // console.log("Game started with ID: " + PgApp.Game.gameId + ' by host: ' + PgApp.Game.mySocketId);
        },

        /**
         * Show the Host screen containing the game URL and unique game ID
         */
        displayNewGameScreen : function() {
            // Fill the game screen with the appropriate HTML
            PgApp.Game.$gameArea.html(PgApp.Game.$templateNewGame);

            // Display the URL on screen
            $('#gameURL').text(window.location.href);
            PgApp.Game.doTextFit('#gameURL');

            // Show the gameId / room id on screen
            $('#spanNewGameCode').text(PgApp.Game.gameId);
        },

        /**
         * Update the Host screen when the first player joins
         * @param data{{playerName: string}}
         */
        updateWaitingScreen: function(data) {
            // If this is a restarted game, show the screen.
            if ( PgApp.Game.Host.isNewGame ) {
                PgApp.Game.Host.displayNewGameScreen();
            }
            // Update host screen
            $('#playersWaiting')
                .append('<p/>')
                .text('Player ' + data.playerName + ' joined the game.');

            // Store the new player's data on the Host.
            PgApp.Game.Host.players.push(data);

            // Increment the number of players in the room
            PgApp.Game.Host.numPlayersInRoom += 1;

            // If two players have joined, start the game!
            if (PgApp.Game.Host.numPlayersInRoom === 2) {
                // console.log('Room is full. Almost ready!');

                // Let the server know that two players are present.
                PgApp.IO.socket.emit('hostRoomFull',PgApp.Game.gameId);
            }
        },

        /**
         * Show the countdown screen
         */
        gameCountdown : function() {

            // Prepare the game screen with new HTML
            PgApp.Game.$gameArea.html(PgApp.Game.$hostGame);
            PgApp.Game.doTextFit('#hostWord');

            // Begin the on-screen countdown timer
            var $secondsLeft = $('#hostWord');
            PgApp.Game.countDown( $secondsLeft, 5, function(){
                PgApp.IO.socket.emit('hostCountdownFinished', PgApp.Game.gameId);
            });

            // Display the players' names on screen
            $('#player1Score')
                .find('.playerName')
                .html(PgApp.Game.Host.players[0].playerName);

            $('#player2Score')
                .find('.playerName')
                .html(PgApp.Game.Host.players[1].playerName);

            // Set the Score section on screen to 0 for each player.
            $('#player1Score').find('.score').attr('id',PgApp.Game.Host.players[0].mySocketId);
            $('#player2Score').find('.score').attr('id',PgApp.Game.Host.players[1].mySocketId);
        },

        /**
         * Show the word for the current round on screen.
         * @param data{{round: *, word: *, answer: *, list: Array}}
         */
        newWord : function(data) {
            // Insert the new word into the DOM
            $('#hostWord').text(data.word);
            PgApp.Game.doTextFit('#hostWord');

            // Update the data for the current round
            PgApp.Game.Host.currentCorrectAnswer = data.answer;
            PgApp.Game.Host.currentRound = data.round;
        },

        /**
         * Check the answer clicked by a player.
         * @param data{{round: *, playerId: *, answer: *, gameId: *}}
         */
        checkAnswer : function(data) {
            // Verify that the answer clicked is from the current round.
            // This prevents a 'late entry' from a player whos screen has not
            // yet updated to the current round.
            if (data.round === PgApp.Game.currentRound){

                // Get the player's score
                var $pScore = $('#' + data.playerId);

                // Advance player's score if it is correct
                if( PgApp.Game.Host.currentCorrectAnswer === data.answer ) {
                    // Add 5 to the player's score
                    $pScore.text( +$pScore.text() + 5 );

                    // Play the success sound
                    PgApp.Game.$doc.trigger('playSuccessSound');

                    // Advance the round
                    PgApp.Game.currentRound += 1;

                    // Prepare data to send to the server
                    var data = {
                        gameId : PgApp.Game.gameId,
                        round : PgApp.Game.currentRound
                    }

                    // Notify the server to start the next round.
                    PgApp.IO.socket.emit('hostNextRound',data);

                } else {
                    
                    // Play the fail sound
                    PgApp.Game.$doc.trigger('playFailSound');

                    // A wrong answer was submitted, so decrement the player's score.
                    $pScore.text( +$pScore.text() - 3 );
                }
            }
        },


        /**
         * All 10 rounds have played out. End the game.
         * @param data
         */
        endGame : function(data) {
            // Get the data for player 1 from the host screen
            var $p1 = $('#player1Score');
            var p1Score = +$p1.find('.score').text();
            var p1Name = $p1.find('.playerName').text();

            // Get the data for player 2 from the host screen
            var $p2 = $('#player2Score');
            var p2Score = +$p2.find('.score').text();
            var p2Name = $p2.find('.playerName').text();

            // Find the winner based on the scores
            var winner = (p1Score < p2Score) ? p2Name : p1Name;
            var tie = (p1Score === p2Score);

            // Display the winner (or tie game message)
            if(tie){
                $('#hostWord').text("It's a Tie!");
            } else {
                $('#hostWord').text( winner + ' Wins!!' );
            }
            PgApp.Game.doTextFit('#hostWord');

            // Reset game data
            PgApp.Game.Host.numPlayersInRoom = 0;
            PgApp.Game.Host.isNewGame = true;
        },

        /**
         * A player hit the 'Start Again' button after the end of a game.
         */
        restartGame : function() {
            PgApp.Game.$gameArea.html(PgApp.Game.$templateNewGame);
            $('#spanNewGameCode').text(PgApp.Game.gameId);
        }
    },


    /* *****************************
       *        PLAYER CODE        *
       ***************************** */

    Player : {

        /**
         * A reference to the socket ID of the Host
         */
        hostSocketId: '',

        /**
         * The player's name entered on the 'Join' screen.
         */
        myName: '',

        /**
         * Click handler for the 'JOIN' button
         */
        onJoinClick: function () {
            // console.log('Clicked "Join A Game"');

            // Display the Join Game HTML on the player's screen.
            PgApp.Game.$gameArea.html(PgApp.Game.$templateJoinGame);
        },

        /**
         * The player entered their name and gameId (hopefully)
         * and clicked Start.
         */
        onPlayerStartClick: function() {
            // console.log('Player clicked "Start"');

            // collect data to send to the server
            var data = {
                gameId : +($('#inputGameId').val()),
                playerName : $('#inputPlayerName').val() || 'anon'
            };

            // Send the gameId and playerName to the server
            PgApp.IO.socket.emit('playerJoinGame', data);

            // Set the appropriate properties for the current player.
            PgApp.Game.myRole = 'Player';
            PgApp.Game.Player.myName = data.playerName;
        },

        /**
         *  Click handler for the Player hitting a word in the word list.
         */
        onPlayerAnswerClick: function() {
            // console.log('Clicked Answer Button');
            var $btn = $(this);      // the tapped button
            var answer = $btn.val(); // The tapped word

            // Send the player info and tapped word to the server so
            // the host can check the answer.
            var data = {
                gameId: PgApp.Game.gameId,
                playerId: PgApp.Game.mySocketId,
                answer: answer,
                round: PgApp.Game.currentRound
            }
            PgApp.IO.socket.emit('playerAnswer',data);
        },

        /**
         *  Click handler for the "Start Again" button that appears
         *  when a game is over.
         */
        onPlayerRestart : function() {
            var data = {
                gameId : PgApp.Game.gameId,
                playerName : PgApp.Game.Player.myName
            }
            PgApp.IO.socket.emit('playerRestart',data);
            PgApp.Game.currentRound = 0;
            $('#gameArea').html("<h3>Waiting on host to start new game.</h3>");
        },

        /**
         * Display the waiting screen for player 1
         * @param data
         */
        updateWaitingScreen : function(data) {
            if(PgApp.IO.socket.socket.sessionid === data.mySocketId){
                PgApp.Game.myRole = 'Player';
                PgApp.Game.gameId = data.gameId;

                $('#playerWaitingMessage')
                    .append('<p/>')
                    .text('Joined Game ' + data.gameId + '. Please wait for game to begin.');
            }
        },

        /**
         * Display 'Get Ready' while the countdown timer ticks down.
         * @param hostData
         */
        gameCountdown : function(hostData) {
            PgApp.Game.Player.hostSocketId = hostData.mySocketId;
            $('#gameArea')
                .html('<div class="gameOver">Get Ready!</div>');
        },

        /**
         * Show the list of words for the current round.
         * @param data{{round: *, word: *, answer: *, list: Array}}
         */
        newWord : function(data) {
            // Create an unordered list element
            var $list = $('<ul class="list-group"></ul>').attr('id','ulAnswers');

            // Insert a list item for each word in the word list
            // received from the server.
            $.each(data.list, function(){
                $list                                //  <ul> </ul>
                    .append( $('<li class="list-group-item"></li>')              //  <ul> <li> </li> </ul>
                        .append( $('<button class="btn-full-width"></button>')      //  <ul> <li> <button> </button> </li> </ul>
                            .addClass('btnAnswer')   //  <ul> <li> <button class='btnAnswer'> </button> </li> </ul>
                            .addClass('btn')         //  <ul> <li> <button class='btnAnswer'> </button> </li> </ul>
                            .val(this)               //  <ul> <li> <button class='btnAnswer' value='word'> </button> </li> </ul>
                            .html(this)              //  <ul> <li> <button class='btnAnswer' value='word'>word</button> </li> </ul>
                        )
                    )
            });

            // Insert the list onto the screen.
            $('#gameArea').html($list);
        },

        /**
         * Show the "Game Over" screen.
         */
        endGame : function() {
            $('#gameArea')
                .html('<div class="gameOver">Game Over!</div>')
                .append(
                    // Create a button to start a new game.
                    $('<button>Start Again</button>')
                        .attr('id','btnPlayerRestart')
                        .addClass('btn')
                        .addClass('btnGameOver')
                );
        }
    },


    /* **************************
              UTILITY CODE
       ************************** */

    /**
     * Display the countdown timer on the Host screen
     *
     * @param $el The container element for the countdown timer
     * @param startTime
     * @param callback The function to call when the timer ends.
     */
    countDown : function( $el, startTime, callback) {

        // Display the starting time on the screen.
        $el.text(startTime);
        PgApp.Game.doTextFit('#hostWord');

        // console.log('Starting Countdown...');

        // Start a 1 second timer
        var timer = setInterval(countItDown,1000);

        // Decrement the displayed timer value on each 'tick'
        function countItDown(){
            startTime -= 1
            $el.text(startTime);
            PgApp.Game.doTextFit('#hostWord');

            if( startTime <= 0 ){
                // console.log('Countdown Finished.');

                // Stop the timer and do the callback.
                clearInterval(timer);
                callback();
                return;
            }
        }

    },

    /**
     * Make the text inside the given element as big as possible
     * See: https://github.com/STRML/textFit
     *
     * @param el The parent element of some text
     */
    doTextFit : function(el) {
        textFit(
            $(el)[0],
            {
                alignHoriz:true,
                alignVert:false,
                widthOnly:true,
                reProcess:true,
                maxFontSize:300
            }
        );
    }

};

    

})($, PgApp);

// Initialize the modules
$(document).ready(function(){
    PgApp.Audio.init();
    PgApp.IO.init();
    PgApp.Game.init();
});