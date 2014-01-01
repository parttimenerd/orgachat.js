

##Synopnis
This project tries to simplify the task of organizing olympia like games. In these games teams play games against each other at several different stations. Teams can be split into subteams, so you're able to mix teams.

It's based on a chat and can be configured via the `config.json` file. 

##Requirements
- Apache web server
- node.js (>= 0.9)
   - socket.io
   - underscore.js
   - winston
- (Of course) A device with Internet connection (at least) for each station.

##Usage
1. Download the package and place in into a browser accesible folder of you apache web server. (I assume in the following, that you've choses `orgachat.js`.)
2. Install the node.js required modules via npm.
3. Configure the application via its `config.json` file.
4. Distribute the passwords and station/team names.
5. Login as admin at `orgachat.js`.
6. At least one person of each station should login at `orgachat.js` and at least one member of each team should register at `orgachat.js/team`.
7. To tell all others that a new round will begin soon, type `#set_round N` in to the chat, with `N` being the number of the round (round numbers start at zero).
Team members see then, the station they've to play on next and station people see the next to teams that play against each other in this round.
8. Start the round (specifically its timer) by typing `#start_round_timer`. A timer will now show everyone logged in/registered in the application the count down till the start of the round and after the countdown the time live left in this round.
9. The station crew no enters the points each team achieved at their station and send it to the admin by clicking the `Store` button.
10. Return to 7. if the last round wasn't the final.
11. Show the group ranking by typing `#ranking`.

And of course, this application, based on a chat, can be used as a chat, type in `#help` to see the avaible commands.

##Configuration
Configurations are done via editing the `config.json` file.


The following is an explanation of the config file by a (constructed) example.

```Javascript
   {
	//Stations with their name and password.
	//Station names shouldn't contain any whitespace and be short.
	"stations": {
		"1": {
			"password": "efa43"
		},
		"2": {
			"password": "drtz23"
		},
		//An admin station (or user) is required.
		"admin": {
			"password": "aawer024"
		}
	},
	//The teams participating in the game.
	//Their shouldn't also contain any whitespace and shouldn't be longer than 8 characters.
	"teams": ["Team1", "Team2", "Team3", "Team4"],
	//The main teams consist of a group of teams. This allows splitting teams.
	"main_teams": {
		"Ratefuechse": ["Team1", "Team3"],
		"Ratewoelfe":  ["Team4", "Team4"]
	},
        //The different rounds. The array index ressembles the round number.
	"rounds": [
		{
			"1": ["Team1", "Team3"], //team1 plays in the first round (number 0)
									 //against team3 at station 1 
			"2": ["Team2", "Team4"]
		},
                {
			"1": ["Team2", "Team3"], //team1 plays in the second round (number 1)
									 //against team3 at station 1 
			"2": ["Team1", "Team4"]
		}
	],
	"round_duration": 60,			  //The duration of a round in seconds
	"round_timer_update_span": 4,	  //The time between to timer updates in seconds
	"round_timer_countdown": 20,	  //The length of the countdown in seconds 
									  //before the actual round starts
	//Settings concerning the ranking calculation
	"ranking": { 
		"max_points_per_game": 100,	  //Maximum number of points a team can achieve at one station
		"non_participation_gives_zero_points": false, //Does it count as zero points if a team
													  //doesn't play at a station?
		"normalize_overall_points": true			  //Normalize the points each main group gained
	},
	//Some logging specific settings
	"socketio_logfile": "logs/socketio.log",
	"log_socketio_to_console": false,
	"log_to_console": true,
	"logfile": "logs/log.log",
	"log_level":{
		"console": "info",
		"file": "info"
	}
   }
```

##License
MIT
