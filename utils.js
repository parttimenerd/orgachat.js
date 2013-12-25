exports.formatTime = function(unix_seconds){
	return new Date(unix_seconds * 1000).toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1");
}

exports.time = function(){
	return Math.round(new Date().getTime() / 1000);
}

exports.pad = function(n) {
	return ("0" + n).slice(-2);
}

exports.getSecondsPadded = function(unix_seconds){
	return exports.pad(new Date(unix_seconds * 1000).getSeconds());
}

exports.getMinutesPadded = function(unix_seconds){
	return exports.pad(new Date(unix_seconds * 1000).getMinutes());
}

exports.getHoursPadded = function(unix_seconds){
	return exports.pad(new Date(unix_seconds * 1000).getHours());
}