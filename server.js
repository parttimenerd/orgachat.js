var app = require('http').createServer(handler),
      io = require('socket.io').listen(app),
      fs = require('fs'),
      _ = require('underscore'),
	  utils = require('./utils.js'),
	  result_utils = require('./result_utils.js'),
	  results = {};
      
app.listen(8010);

var config = JSON.parse(fs.readFileSync('config.json'));
try {
	results = JSON.parse(fs.readFileSync('results.json'));
} catch(err){}

var app_sockets = [];	  
var admin_socket;
var results_changed = false;
var round_data;

io.sockets.on('connection', function(socket){
	socket.on('login', function(data){
		//data = JSON.parse(data);
		console.log(data);
		if (config['pwds'][data['group']] === data['pwd']){
			socket.emit('pwd_okay', 'SERVER', true);
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
		if (!socket.approved)
			return;
		app_sockets = _.without(app_sockets, socket);
		sendBotMsg(utils.time(), '', "User of group " + socket.group + " left.");
		if (socket.group === "admin")
				admin_socket = undefined;
	})
	socket.on('result', function(data){
		if (!socket.approved)
			socket.disconnect('unauthorized')
		storeResult(socket.group, data["part_one"], data["part_two"], data["result_one"], data["result_two"]);
	});
});

function setRound(round_number){
	if (config["rounds"].length <= round_number)
		adminBotMessage("no such round " + round_number + ", there are only rounds 0, ... , " + (config["rounds"].length - 1));
	round_data = {
		"round_number": round_number
	}
	round_data = _.extend(round_data, config["rounds"][round_number]);
	emitRoundDataToAll();
}

function emitRoundDataToSocket(socket){
	if (round_data === undefined)
		console.error("no round_data");
	if (socket.group === "admin"){
		adminBotMessage("Round " + round_data["round_number"]);
	} else {
		if (round_data[socket.group] !== undefined){
			console.log(socket.group);
			socket.emit("set_round", "SERVER", round_data[socket.group]);
		} else {
			console.error("group " + socket.group + " has no round data");
		}
	}
}

function emitRoundDataToAll(socket){
	_.each(app_sockets, function(soc){
		emitRoundDataToSocket(soc);
	})
}

var msg_commands = {
	"set_round": {
		"help_text": "#set_round [round] - sets the round (round numbers start at zero)",
		"function": function(args){
			setRound(Number(args[0]));
		}
	},
	"help": {
		"help_text": "#help - shows this help",
		"function": function(args){
			var help_text = _.map(msg_commands, function(options, cmd){
				return options.help_text;
			}).sort().join("\n<br/>");
			adminBotMessage(help_text);
		}
	},
	"ranking": {
		"help_text": "#ranking - shows the current ranking of the participant groups",
		"function": function(args){
			emitRanking(admin_socket);
		}
	},
	"online": {
		"help_text": "#online - shows the groups that are currently only with one or more users",
		"function": function(args){
			emitGroupsOnline(admin_socket);
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
		msg_commands[cmd]["function"](args);
	} catch (err){
		adminBotMessage("I don't understand: '" + msg + "'");
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
	logStr = utils.formatTime(utils.time()) + " | group " +  group + " | part_one: " + part_one 
	+ ", part_two: " + part_two + ", result_one: " + result_one + ", result_two: " + result_two + "\n";
	fs.createWriteStream('result_log.txt', {'flags': 'a'}).write(logStr);
	adminBotMessage("group " + group + " submitted result (" + part_one + ": " + result_one + " | "
		+ part_two + ": " + result_two + ")");
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
		logMsg(data['time'], 'chatbot', other_msg);
	}	
	
}

function logMsg(time, group, msg){
	logStr = utils.formatTime(time) + " | " + group + " | " + msg + "\n";
	fs.createWriteStream('log.txt', {'flags': 'a'}).write(logStr);
}

function emitGroupsOnline(socket){
	var groups = getGroupsOnline();
	var group_strs = _.map(groups, function(group){
		return "Group " + group + "<br/>";
	});
	var str = group_strs.join("\n<br/>");
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

function handler(req, res){}