var   app = require('http').createServer(function(){}),
      fs = require('fs'),
      _ = require('underscore'),
	  utils = require('./utils.js'),
	  result_utils = require('./result_utils.js'),
	  util = require("util"),
	  winston = require("winston");
	  results = {};

var config = JSON.parse(fs.readFileSync('config.json'));
try {
	results = JSON.parse(fs.readFileSync('results.json'));
} catch(err){}

//Set up loggers
var socketio_logger = new (winston.Logger)({exitOnError: false});
if (config.log_socketio_to_console)
	socketio_logger.add(winston.transports.Console, {colorize: 'true'});
if (config.socketio_logfile !== undefined && config.socketio_logfile !== "")
	socketio_logger.add(winston.transports.File, {filename: config.socketio_logfile});
var logger = new (winston.Logger)();
if (config.log_to_console)
	logger.add(winston.transports.Console, {colorize: 'true', handleExceptions: true, level: config.log_level.console});
if (config.logfile !== undefined && config.logfile !== "")
	logger.add(winston.transports.File, {filename: config.logfile, handleExceptions: true, level: config.log_level.file});

io = require('socket.io').listen(app, {
		logger: {
        debug: socketio_logger.debug, 
        info: socketio_logger.info, 
        error: socketio_logger.error, 
        warn: socketio_logger.warn
    }
}),
    
app.listen(8010);
  
var station_sockets = [];
var team_sockets = [];	  
var admin_socket;
var results_changed = false;
var round_data;

logger.info("Ready");

io.sockets.on('connection', function(socket){
	socket.on('login', function(data){
		if (data.station !== undefined && config.stations[data['station']].password === data.pwd){
			socket.emit('pwd_okay', 'SERVER', true);
			setTimeout(function(){
				socket.station = data.station;
				socket.approved = true;
				if (data.show_login_msg === undefined || data.show_login_msg){
					sendBotMsg(socket, "You're now logged in.", "User of station " + data.station + " logged in");
				}
				station_sockets.push(socket);
				station_sockets = _.uniq(station_sockets);
				if (socket.station === "admin")
					admin_socket = socket;
				if (round_data !== undefined){
					logger.info("Send round data to user of group " + socket.station);
					emitRoundDataToSocket(socket);
				}
			}, 100);
		} else {
			debug.info("Login failed: " + JSON.stringify(data));
		}
	});
	socket.on('chatmsg', function(data){
		if (socket.approved){
			if (data.msg === undefined || data.msg.length === 0)
				return;
			data['time'] = new Date().getTime() / 1000;
			data["seconds_p"] = utils.getSecondsPadded(data.time);
			data["minutes_p"] = utils.getMinutesPadded(data.time);
			data["hours_p"] = utils.getHoursPadded(data.time);
			data['station'] = socket.station;
			emitToAllStations("chatmsg", data);
			if (socket.station === "admin"){
				parseAdminMsg(data.msg);
			}
			logMsg(data.time, 'station ' + data.station, data.msg);
		} else {
			socket.disconnect('unauthorized');
		}
	});
	socket.on('disconnect', function(){
		if (socket.team !== undefined){
			team_sockets = _.without(team_sockets, socket);
			logger.info("Member of team " + socket.team + " left.");
			return;
		}
		if (!socket.approved)
			return;
		station_sockets = _.without(station_sockets, socket);
		sendBotMsg(utils.time(), '', "User of station " + socket.station + " left.");
		logger.info("User of station " + socket.station + " left.");
		if (socket.station === "admin")
			admin_socket = undefined;
	})
	socket.on('result', function(data){
		if (!socket.approved)
			socket.disconnect('unauthorized')
		storeResult(socket.station, data.team_one, data.team_two, data.result_one, data.result_two);
	});
	socket.on("register_part", function(team_name){
		if (_.contains(config.teams, team_name)){
			part_sockets.push(socket);
			socket.emit("registered", "SERVER", "");
			logger.debug("Registered member of team " + team_name);
			socket.team = team_name;
			logger.info("Member of team " + team_name + " registered.");
			if (round_data !== undefined){
				logger.info("Send round data to member of team " + socket.team);
				emitRoundDataToSocket(socket);
			}
		}
	});
});

function setRound(round_number){
	if (config.rounds.length <= round_number){
		adminBotMessage("no such round " + round_number + ", there are only rounds 0, ... , " + (config.rounds.length - 1));
		logger.info("Failed to set round number to " + round_number + ".");
	}
	round_data = {
		"round_number": round_number
	}
	round_data = _.extend(round_data, config.rounds[round_number]);
	emitRoundDataToAll();
}

function emitRoundDataToSocket(socket){
	if (socket.station !== undefined){
		if (round_data === undefined)
			logger.error("No round_data");
		if (socket.station === "admin"){
			adminBotMessage("Round " + round_data.round_number);
		} else {
			if (round_data[socket.station] !== undefined){
				socket.emit("set_round", "SERVER", round_data[socket.station]);
			} else {
				logger.error("Station " + socket.station + " has no round data");
			}
		}
	} else if(socket.team !== undefined){
		var next_station;
		_.each(round_data, function(team_arr, station_name){
			for (i = 0; i < team_arr.length; i++)
				if (team_arr[i] === socket.team)
					next_station = station_name;
		})
		if (next_station === undefined){
			adminBotMessage("Team " + socket.team + " has no station play on.");
		} else {
			socket.emit("set_station", "SERVER", next_station);
		}
	}
}

function emitRoundDataToAll(socket){
	_.each(station_sockets.concat(team_sockets), function(soc){
		emitRoundDataToSocket(soc);
	})
}

function emitToAllTeams(cmd, data){
	_.each(team_sockets, function(team_socket){
		team_socket.emit(cmd, "SERVER", data);
	});
}

function emitToAllStations(cmd, data){
	_.each(station_sockets, function(station_socket){
		station_socket.emit(cmd, "SERVER", data);
	});
}

var msg_commands = {
	"set_round": {
		"help_text": "#set_round [round] - sets the round (round numbers start at zero)",
		"function": function(args){
			logger.info("Set round number to " + args[0] + ".");
			setRound(Number(args[0]));
		}
	},
	"start_round_timer": {
		"help_text": "#start_round_timer - starts the round timer, counting down from the round_duration to zero",
		"function": function(){
			logger.info("Start round timer.");
			startRoundTimer();
		}
	},
	"end_round_timer": {
		"help_text": "#end_round_timer - kills the round timer",
		"function": function(){
			logger.info("Clear round timer.");
			clearRoundTimer()
		}
	},
	"help": {
		"help_text": "#help - shows this help",
		"function": function(args){
			logger.debug("Show help.");
			var help_text = _.map(msg_commands, function(options, cmd){
				return options.help_text;
			}).sort().join("\n<br/>");
			adminBotMessage(help_text);
		}
	},
	"ranking": {
		"help_text": "#ranking - shows the current ranking of the main teams",
		"function": function(args){
			logger.debug("Calculate the current ranking.");
			emitRanking(admin_socket);
		}
	},
	"online_g": {
		"help_text": "#online_g - shows the stations that are currently online with one or more users",
		"function": function(args){
			emitGroupsOnline(admin_socket);
		}
	},
	"online": {
		"help_text": "#online - shows the stations and teams that are currently online with one or more users",
		"function": function(args){
			emitOnline(admin_socket);
		}
	},
	"ping": {
		"help_text": "#ping [station - optional] [...] - let all other users (or of the specified station) play a ping sound",
		"function": function(args){
			if (args.length === 0){
				emitToAllStations("ping", "");
			} else {
				_.each(args, function(arg){
					_.each(station_sockets, function(socket){
						if (socket.station === arg)
							socket.emit("ping", "SERVER", "");
					})
				});
			}
		}
	}
}

function parseAdminMsg(msg){
	var arr = msg.trim().split("#");
	if (msg[0] === "#")
		execCommand(arr[0]);
	for (i = 1; i < arr.length; i++)
		execCommand(arr[i]);
}

function execCommand(text){
	if (text.length === 0)
		return;
	var cmd_and_args = text.split(" ");
	var cmd = cmd_and_args[0];
	cmd_and_args.shift();
	var args = cmd_and_args;
	if (cmd === "" || cmd === undefined)
		return;
	try {
		if (cmd in msg_commands){
			msg_commands[cmd]["function"](args);
			logger.info("Execute command '" + text + "'");
		} else {
			adminBotMessage("I don't understand: '" + text + "'");
		}
	} catch (err){
		adminBotMessage("I don't understand: '" + text + "'");
		logger.error("Error while executing command '" + text + "': " + err.name + ", " + err.stack);
	}
}

function storeResult(station, team_one, part_two, result_one, result_two){
	if (results.station === undefined)
		results.station = {};
	results.station.team_one = Number(result_one);
	results.station.team_two = Number(result_two);
	logResult(station, team_one, team_two, result_one, result_two);
	results_changed = true;
}

function saveResultsInFile(){
	if (results_changed){
		fs.writeFile('results.json', JSON.stringify(results));
		results_changed = false;
	}
}

setInterval(saveResultsInFile, 1000);

function adminBotMessage(msg){
	if (admin_socket !== undefined){
		sendBotMsg(admin_socket, msg, "");
	}
}

function logResult(station, team_one, team_two, result_one, result_two){
	var logStr = utils.formatTime(utils.time()) + " | station " +  station + " | team_one: " + team_one 
	+ ", team_two: " + team_two + ", result_one: " + result_one + ", result_two: " + result_two + "\n";
	fs.createWriteStream('logs/result_log.log', {'flags': 'a'}).write(logStr);
	logStr = "station " + station + " submitted result (" + team_one + ": " + result_one + " | "
		+ team_two + ": " + result_two + ")";
	adminBotMessage(logStr);
	logger.info(logStr);
}

function sendBotMsg(socket, own_msg, other_msg){
	if (socket === undefined)
		return;
		var time = new Date().getTime() / 1000;
		var data = {
			'time': time,
			'msg': own_msg,
			"seconds_p": utils.getSecondsPadded(time),
			"minutes_p": utils.getMinutesPadded(time),
			"hours_p": utils.getHoursPadded(time),
			"station": "bot"
		};
	if (own_msg !== '' && own_msg !== undefined){
		socket.emit('chatbot', 'SERVER', data);
	}
	if (other_msg !== '' && other_msg !== undefined){
		data["msg"] = other_msg;
		_.each(_.without(station_sockets, socket), function(soc){
			soc.emit('chatbot', 'SERVER', data);
		});
		logMsg(data.time, 'bot', other_msg);
	}	
}

function logMsg(time, station, msg){
	logStr = utils.formatTime(time) + " | " + station + " | " + msg;
	fs.createWriteStream('message_log.txt', {'flags': 'a'}).write(logStr + "\n");
	logger.info("Message: " + logStr);
}

function emitStationsOnline(socket){
	var stations = getStationsOnline();
	var str = _.map(station, function(station){
		return "Station " + station + "<br/>";
	}).join("\n<br/>");
	sendBotMsg(socket, str, "");
}

function emitOnline(socket){
	var str = _.map(getStationsOnline(), function(station){
		return "Station " + station + "<br/>";
	}).join("\n<br\>") + _.map(getTeamsOnline(), function(team){
		return "Team " + team;
	}).join("\n<br\>");
	sendBotMsg(socket, str, "");
}

function emitRanking(socket){
	var main_teams = result_utils.ranking(config, results).reverse();
	var list_items = _.map(main_teams, function(main_team){
		return "<li>" + main_team + "</li>";
	});
	var str = "<ol>\n" + list_items.join("\n") + "\n</ol>"
	sendBotMsg(socket, str, "");
}

function getStationsOnline(){
	return _.uniq(_.map(station_sockets, function(soc){
		return soc.group;
	})).sort();
}

function getTeamsOnline(){
	return _.uniq(_.map(team_sockets, function(soc){
		return soc.team;
	})).sort();
}

var round_timer_interval;
//in seconds
var round_timer_time = 0;

function startRoundTimer(){
	if (round_timer_interval !== undefined)
		clearInterval(round_timer_interval);
	emitToAllStations("round_timer_start", "");
	emitToAllTeams("round_timer_start", "");
	var timer_func = function(){
		if (round_timer_time + config.round_duration > utils.time()){
			var time_diff = config.round_duration  - (utils.time() - round_timer_time);
			var time_str = "-" + new Date(time_diff * 1000).getMinutes() + ":" + utils.getSecondsPadded(time_diff);
			emitToAllStations("round_timer", time_str);
			emitToAllTeams("round_timer", time_str); 
		} else {
			clearInterval(round_timer_interval);
			emitToAllStations("round_timer_end", "");
			emitToAllTeams("round_timer_end", "");
		}
	}
	countdown_start = utils.time();
	countdown_interval = setInterval(function(){
		var diff_seconds = config.round_timer_countdown - (utils.time() - countdown_start);
		if (diff_seconds <= 0){
			clearInterval(countdown_interval);
			emitToAllStations("ping", "");
			emitToAllTeams("ping", "");
			round_timer_time = utils.time();
			round_timer_interval = setInterval(timer_func, config.round_timer_update_span * 1000);
		} else {
			emitToAllStations("round_timer", "New round in " + diff_seconds + "s");
			emitToAllTeams("round_timer", "New round in " + diff_seconds + "s");
		}
	}, config.round_timer_update_span * 1000);
}

function clearRoundTimer(){
	clearInterval(round_timer_interval);
	emitToAllStations("round_timer_end", "");
	emitToAllTeams("round_timer_end", "");
}