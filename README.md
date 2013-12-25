#orgachat.js
This is an organizational channel for the yearly O-Phase O-Lympia game at the KIT for students in mathematics and computer science.
First of all it's base is simple chat build with node.js. Users can login with a password and a group name (resembling the station he/she looks after).
The admin (group "admin") can set a game round and configure in the config file, the station each student team has to play on now. The station persons see this information and are able to enter the points each student team gets.

##Requirements
- Apache web server
- node.js with the following modules
	- socket.io
	- underscore
	- winston

##TODO
- testing
- manual

##License
MIT