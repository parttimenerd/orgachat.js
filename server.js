var   app = require('http').createServer(handler),
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
	logger.add(winston.transports.Console, {colorize: 'true', handleExceptions: true});
if (config.logfile !== undefined && config.logfile !== "")
	logger.add(winston.transports.File, {filename: config.logfile, handleExceptions: true});

io = require('socket.io').listen(app, {
		logger: {
        debug: socketio_logger.debug, 
        info: socketio_logger.info, 
        error: socketio_logger.error, 
        warn: socketio_logger.warn
    }
}),
    
app.listen(8010);
  
var app_sockets = [];
var part_sockets = [];	  
var admin_socket;
var results_changed = false;
var round_data;

logger.info("Ready");

io.sockets.on('connection', function(socket){
	socket.on('login', function(data){
		if (config['pwds'][data['group']] === data['pwd']){
			socket.emit('pwd_okay', 'SERVER', true);
			logger.info("User of group " + data['group'] + " logged in.");
			setTimeout(function(){
				socket.group = data['group'];
				socket.approved = true;
				if (data["show_login_msg"] === undefined || data["show_login_msg"]){
					sendBotMsg(socket, "You're now logged in.", "User of group " + data['group'] + " logged in");
				}
				app_sockets.push(socket);
				app_sockets = _.uniq(app_sockets);
				if (socket.group === "admin")
					admin_socket = socket;
				if (round_data !== undefined)
					emitRoundDataToSocket(socket);
			}, 100);
		}
	});
	socket.on('chatmsg', function(data){
		if (socket.approved){
			if (data.msg === undefined || data.msg.length === 0)
				return;
			data['time'] = new Date().getTime() / 1000;
			data["seconds_p"] = utils.getSecondsPadded(data['time']);
			data["minutes_p"] = utils.getMinutesPadded(data['time']);
			data["hours_p"] = utils.getHoursPadded(data['time']);
			data['group'] = socket.group;
			_.each(app_sockets, function(soc){
				soc.emit('chatmsg', 'SERVER', data);
			});
			if (socket.group === "admin"){
				parseAdminMsg(data["msg"]);
			}
			logMsg(data['time'], 'group ' + data['group'], data['msg']);
		} else {
			socket.disconnect('unauthorized');
		}
	});
	socket.on('disconnect', function(){
		if (socket["part_name"] !== undefined){
			part_sockets = _.without(part_sockets, socket);
			logger.info("Participant of team " + socket.part_name + " left.");
			return;
		}
		if (!socket.approved)
			return;
		app_sockets = _.without(app_sockets, socket);
		sendBotMsg(utils.time(), '', "User of group " + socket.group + " left.");
		logger.info("User of group " + socket.group + " left.");
		if (socket.group === "admin")
			admin_socket = undefined;
	})
	socket.on('result', function(data){
		if (!socket.approved)
			socket.disconnect('unauthorized')
		storeResult(socket.group, data["part_one"], data["part_two"], data["result_one"], data["result_two"]);
	});
	socket.on("register_part", function(part_name){
		if (_.contains(config.participants, part_name)){
			part_sockets.push(socket);
			socket.emit("registered", "SERVER", "");
			util.debug("Registered participant " + part_name);
			socket.part_name = part_name;
			logger.info("Participant of team " + part_name + " registered.");
		}
	});
});

function setRound(round_number){
	if (config["rounds"].length <= round_number){
		adminBotMessage("no such round " + round_number + ", there are only rounds 0, ... , " + (config["rounds"].length - 1));
		logger.info("Failed to set round number to " + round_number + ".");
	}
	round_data = {
		"round_number": round_number
	}
	round_data = _.extend(round_data, config["rounds"][round_number]);
	emitRoundDataToAll();
}

function emitRoundDataToSocket(socket){
	if (round_data === undefined)
		util.error("no round_data");
	if (socket.group === "admin"){
		adminBotMessage("Round " + round_data["round_number"]);
	} else {
		if (round_data[socket.group] !== undefined){
			socket.emit("set_round", "SERVER", round_data[socket.group]);
		} else {
			util.error("group " + socket.group + " has no round data");
		}
	}
}

function emitRoundDataToAll(socket){
	_.each(app_sockets, function(soc){
		emitRoundDataToSocket(soc);
	})
	_.each(part_sockets, function(part_soc){
		var next_station;
		_.each(round_data, function(group_arr, group_name){
			util.debug(JSON.stringify(group_arr));
			util.debug(part_soc.part_name);
			for (i = 0; i < group_arr.length; i++)
				if (group_arr[i] === part_soc.part_name)
					next_station = group_name;
		})
		if (next_station === undefined){
			adminBotMessage("Participant " + part_name + " has no station to go.");
		} else {
			part_soc.emit("set_station", "SERVER", next_station);
		}
	});
}

function emitToAllParticipants(cmd, data){
	_.each(part_sockets, function(part_soc){
		part_soc.emit(cmd, "SERVER", data);
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
		"help_text": "#ranking - shows the current ranking of the participant groups",
		"function": function(args){
			logger.debug("Calculate the current ranking.");
			emitRanking(admin_socket);
		}
	},
	"online_g": {
		"help_text": "#online - shows the groups that are currently only with one or more users",
		"function": function(args){
			emitGroupsOnline(admin_socket);
		}
	},
	"online": {
		"help_text": "#online - shows the groups and participants that are currently only with one or more users",
		"function": function(args){
			emitOnline(admin_socket);
		}
	},
	"ping": {
		"help_text": "#ping [group - optional] [...] - let all other users (or the specified) play a ping sound",
		"function": function(args){
			if (args.length === 0){
				admin_socket.broadcast("ping", "SERVER", "");
			} else {
				_.each(args, function(arg){
					_.each(app_sockets, function(socket){
						if (socket.group === arg)
							socket.emit("ping", "SERVER", "");
					})
				});
			}
		}
	}
}

function parseAdminMsg(msg){
	try {
		if (msg[0] !== "#")
			return;
		var arr = msg.split(" ");
		var cmd = arr[0].substr(1);
		var args = arr.slice(1);
		if (cmd in msg_commands){
			msg_commands[cmd]["function"](args);
			logger.info("Execute command '" + msg + "'");
		} else {
			adminBotMessage("I don't understand: '" + msg + "'");
		}
	} catch (err){
		adminBotMessage("I don't understand: '" + msg + "'");
		logger.error("Error while executing command '" + msg + "': " + err.name + ", " + err.stack);
	}
}

function storeResult(group, part_one, part_two, result_one, result_two){
	if (results[group] === undefined)
		results[group] = {};
	results[group][part_one] = Number(result_one);
	results[group][part_two] = Number(result_two);
	logResult(group, part_one, part_two, result_one, result_two);
	results_changed = true;
}

function saveResultsInFile(){
	if (results_changed){
		fs.writeFile('results.json', JSON.stringify(results));
		results_changed = false;
	}
}

function adminBotMessage(msg){
	if (admin_socket !== undefined){
		sendBotMsg(admin_socket, msg, "");
	}
}

setInterval(saveResultsInFile, 1000);

function logResult(group, part_one, part_two, result_one, result_two){
	var logStr = utils.formatTime(utils.time()) + " | group " +  group + " | part_one: " + part_one 
	+ ", part_two: " + part_two + ", result_one: " + result_one + ", result_two: " + result_two + "\n";
	fs.createWriteStream('logs/result_log.log', {'flags': 'a'}).write(logStr);
	logStr = "group " + group + " submitted result (" + part_one + ": " + result_one + " | "
		+ part_two + ": " + result_two + ")";
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
			"group": "bot"
		};
	if (own_msg !== '' && own_msg !== undefined){
		socket.emit('chatbot', 'SERVER', data);
	}
	if (other_msg !== '' && other_msg !== undefined){
		data["msg"] = other_msg;
		_.each(_.without(app_sockets, socket), function(soc){
			soc.emit('chatbot', 'SERVER', data);
		});
		logMsg(data['time'], 'bot', other_msg);
	}	
}

function logMsg(time, group, msg){
	logStr = utils.formatTime(time) + " | " + group + " | " + msg;
	fs.createWriteStream('message_log.txt', {'flags': 'a'}).write(logStr + "\n");
	logger.info("Message: " + logStr);
}

function emitGroupsOnline(socket){
	var groups = getGroupsOnline();
	var group_strs = _.map(groups, function(group){
		return "Group " + group + "<br/>";
	});
	var str = group_strs.join("\n<br/>");
	sendBotMsg(socket, str, "");
}

function emitOnline(socket){
	var str = _.map(getGroupsOnline(), function(group){
		return "Group " + group + "<br/>";
	}).join("\n<br\>") + _.map(getParticipantsOnline(), function(part_name){
		return "Participant " + part_name;
	}).join("\n<br\>");
	sendBotMsg(socket, str, "");
}

function emitRanking(socket){
	var part_groups = result_utils.ranking(config, results).reverse();
	var list_items = _.map(part_groups, function(part_group){
		return "<li>" + part_group + "</li>";
	});
	var str = "<ol>\n" + list_items.join("\n") + "\n</ol>"
	sendBotMsg(socket, str, "");
}

function getGroupsOnline(){
	return _.uniq(_.map(app_sockets, function(soc){
		return soc.group;
	})).sort();
}

function getParticipantsOnline(){
	return _.uniq(_.map(part_sockets, function(soc){
		return soc.part_name;
	})).sort();
}

var round_timer_interval;
//in seconds
var round_timer_time = 0;

function startRoundTimer(){
	if (round_timer_interval !== undefined)
		clearInterval(round_timer_interval);
	emitToAllAppSockets("round_timer_start", "");
	emitToAllParticipants("round_timer_start", "");
	var timer_func = function(){
		if (round_timer_time + config.round_duration > utils.time()){
			var time_diff = config.round_duration  - (utils.time() - round_timer_time);
			var time_str = "-" + new Date(time_diff * 1000).getMinutes() + ":" + utils.getSecondsPadded(time_diff);
			emitToAllAppSockets("round_timer", time_str);
			emitToAllParticipants("round_timer", time_str); 
		} else {
			clearInterval(round_timer_interval);
			emitToAllAppSockets("round_timer_end", "");
			emitToAllParticipants("round_timer_end", "");
		}
	}
	countdown_start = utils.time();
	countdown_interval = setInterval(function(){
		var diff_seconds = config.round_timer_countdown - (utils.time() - countdown_start);
		if (diff_seconds <= 0){
			clearInterval(countdown_interval);
			io.sockets.emit("ping", "SERVER", "");
			round_timer_time = utils.time();
			round_timer_interval = setInterval(timer_func, config.round_timer_update_span * 1000);
		} else {
			emitToAllAppSockets("round_timer", "New round in " + diff_seconds + "s");
			emitToAllParticipants("round_timer", "New round in " + diff_seconds + "s");
		}
	}, config.round_timer_update_span * 1000);
}

function emitToAllAppSockets(cmd, data){
	_.each(app_sockets, function(soc){
		soc.emit(cmd, "SERVER", data);
	});
}

function clearRoundTimer(){
	clearInterval(round_timer_interval);
	_.each(app_sockets, function(soc){
		soc.emit("round_timer_end", "SERVER", "");
	});
}

function handler(req, res){}