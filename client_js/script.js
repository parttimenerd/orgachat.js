var approved = false,
	group,
	pwd,
	header_text,
	debug = false,
	showConsoleLog = false;
	
var currentReconnectCounter = 0;

var socket = io.connect(window.location.protocol + "//" + window.location.host + ":8010");

var ping = AudioFX("audio/ping", { formats: ['ogg', 'mp3'], volume: 0.5});

onconnect = function(){
	if (pwd !== undefined){
		socket.emit("login", {'pwd': pwd, 'group': group, 'show_login_msg': false});
	}
	socket.on('pwd_okay', function(data){
		$("#login_modal").modal('hide');
		$("#header").html('Group <span class="group_name">' + group + '</span>');
		header_text = $("#header").html();
		approved = true;
	});
	socket.on('chatmsg', function(type, data){
		data["css_class"] = data["group"] == "admin" ? "success" : "";
		msg_table.append(msg_template(data));
		scrollChat();
		if (showConsoleLog)
			console.log(data);
	});
	socket.on('chatbot', function(type, data){
		data["css_class"] = "active";
		msg_table.append(msg_template(data));
		scrollChat();
		if (showConsoleLog)
			console.log(data);
	});
	socket.on('set_round', function(type, data){
		$(".result_input span.part_one").text(data[0]);
		$(".result_input span.part_two").text(data[1]);
		$(".result_input button").attr("disabled", false);
	});
	socket.on('ping', function(){
		pingNTimes(1);
	});
	socket.on("round_timer_start", function(){
		$("#header").text("New round begins soon");
		pingNTimes(3);
	});
	socket.on("round_timer", function(_, time_str){
		$("#header").text(time_str)
	});
	socket.on("round_timer_end", function(){
		$("#header").html(header_text);
		pingNTimes(3);
	});
	/*socket.on("disconnect", function(){
		if (approved){
			if (showConsoleLog)
				console.log("reconnecting...");
			timeout = setTimeout(function(){
				socket = io.connect(window.location.protocol + "//" + window.location.host + ":8010");
				currentReconnectCounter++;
				socket.on('connect', function(){ 
					if (showConsoleLog)
						console.log("reconnected");
					onconnect();
				});
				socket.emit("login", {'pwd': pwd, 'group': group, 'show_login_msg': false});
			}, 2000);
		}
	});*/
	if (showConsoleLog)
		console.log(socket);
	trimSocketEvents(socket);
}

socket.on('connect', onconnect);

function pingNTimes(n){
	for (i = 0; i < 3; i++){
		setTimeout(function(){
			try {
				ping.stop();
			} catch(err){}
			ping.play();
		}, i * 1500);
	}
}

function trimSocketEvents(soc){
	for (eventName in soc.$events){
		var soc_ev_arr = soc.$events[eventName];
		if (soc_ev_arr.length > 0){
			for (i = 0; i < soc_ev_arr.length; i++){
				if (soc_ev_arr[i] !== undefined){
					soc.$events[eventName] = [soc.$events[eventName][i]];
					break;
				}
			}
		}
	}
	return soc;
}

function scrollChat(){
	//$('html, body').animate({scrollTop: $('body')[0].scrollHeight - $(window).height()}, 200);
	document.getElementById('bottom').scrollIntoView();
}

var chat_input_line = $("#chat .msg_input input");
var chat_input_line_btn = $("#send_button");
var msg_table = $("#chat .messages table");

var msg_template = doT.template($("#chat_msg_template").html());

chat_input_line.inputHistory({
	enter: function(){
		 sendChatMessage(chat_input_line.val());
	}
});

chat_input_line_btn.click(function(){
	sendChatMessage(chat_input_line.val());
	chat_input_line.val("");
});

$("#loginModalBtn").click(function(){
	pwd = $("#passwordInput").val();
	group = $("#groupInput").val();
	socket.emit("login", {'pwd': pwd, 'group': group});
});

function sendResult(){
	var data = {
		"part_one": $(".result_input span.part_one").text(),
		"part_two": $(".result_input span.part_two").text(),
		"result_one": $(".result_input input.part_one").val(),
		"result_two": $(".result_input input.part_two").val()
	}
	socket.emit("result", data);
}

$(".result_input button").click(sendResult);

if (debug){
	socket.emit("login", {'pwd': "abc", 'group': "1"});
	pwd = "abc";
	group = "1";
}

function sendChatMessage(msg){
	if (msg != ""){
		socket.emit("chatmsg", {"msg": msg});
	}
}

if (!debug){
	$("#login_modal").modal('show');
}