var approved = false,
	part_name,
	showConsoleLog = false;

var socket = io.connect(window.location.protocol + "//" + window.location.host + ":8010");

$("#register_modal").modal("show");

(function(){
	var url_arr = document.URL.split("?");
	if (url_arr.length > 1 && url_arr[url_arr.length - 1] !== "") {	
		part_name = url_arr[url_arr.length - 1];
	}
})();

socket.on("connect", function(){
	if (part_name !== undefined){
		socket.emit("register_part", part_name);
	}
	socket.on('registered', function(){
		$("#register_modal").modal("hide");
	});
	socket.on('set_station', function(type, station){
		$("#station_number").text(station);
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
		$("#header").text("");
		pingNTimes(3);
	});
});

$("#register_modal_btn").click(function(){
	part_name = $("#part_input").val();
	socket.emit("register_part", part_name);
	location.href += "?" + part_name;
});


$.mbAudio.sounds = {
	soundSprite: {
		id: "soundSprite",
		ogg: "audio/ping.ogg",
		mp3: "audio/ping.mp3",
		sprite:{
			ping: {id: "ping", start: 0, end: 2, loop: false},
		}
	}
};

$(document).on("initAudio", function () {
	$.mbAudio.pause('soundSprite', audioIsReady);
});

function pingNTimes(n){
	for (i = 0; i < n; i++){
		$.mbAudio.queue.add('soundSprite', 'ping');
	}
}
