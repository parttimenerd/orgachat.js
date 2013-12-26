var _ = require('underscore');

/*
	results = {
		[group]: {
			[part]: [points]
			[...]
		}
		[...]
	}
*/

/**
	returns [
		[name of the worsesest partictipant group],
		[name of the second worsesest],
		[...]
		[name of the best]
	]
*/
exports.ranking = function(config, results){
	var min_max_points = minMaxPoints(results);
	var norm_results = calculateNormalizedResults(config, min_max_points, results);
	var norm_team_results = calculateNormTeamResults(config, norm_results);
	var main_team_results = calculateMainTeamResults(config, norm_team_results);
	var main_team_names = _.keys(main_team_results);
	var ranking = main_team_names.sort(function(a, b){
		return main_team_results[a].normalized_points - main_team_results[b].normalized_points;
	});
	return ranking;
}

function minMaxPoints(results){
	return _.reduce(results, function(memo, group_map, station){
		var points = _.map(ground_map, function(val){
			return val;
		});
		memo[station] = [_.min(points), _.max(points)];
	});
}

/**
returns {
	[part group]: {
		counting_rounds: [...],
		normalized_points: [...]
	}
	[...]
}
*/
function calculateMainTeamResults(config, norm_team_results){
	var main_team_results = {};
	_.each(config.main_teams, function(member_teams, main_team){
		var rounds = 0;
		var point_sum = 0;
		_.each(member_teams, function(member_team){
			rounds += member_team.counting_rounds;
			point_sum += member_team.normalized_points;
		});
		main_team_results[main_team] = {
			"counting_rounds": rounds,
			"normalized_points": point_sum / rounds 
		};
		
	});
	if (config.ranking.normalize_overall_points){
		var point_arr = _.map(main_team_results, function(main_team_result, main_team){
			return main_team_result.normalized_points;
		})
		var min_sum = _.min(point_arr);
		var max_sum = _.max(point_arr);
		_.each(main_team_results, function(main_team_result, main_team){
			main_team_results[main_team].normalized_points = calculateNormalizedResult(config,
										min_sum, max_sum, main_team_result.normalized_points);										
		});
	}
	return main_team_results;
}

/**
returns {
	[team]: {
		counting_rounds: [...],
		normalized_points: [...]
	}
	[...]
}
*/
function calculateNormTeamResults(config, normalized_results){
	var non_part_zero = config.ranking.non_participation_gives_zero_points;
	var norm_ov_points = config.ranking.normalize_overall_points;
	var team_results = {};
	_.each(config.teams, function(team){
		team_results[team] = {
			"counting_rounds": 0,
			"normalized_points": 0
		};
	});
	_.each(normalized_results, function(station_map, station_name){
		_.each(config.teams, function(team){
			if (station_map[team] !== undefined){
				team_results[team].counting_rounds++;
				team_results[team].normalized_points
			} else if(non_part_zero){
				team_results[team].counting_rounds++;
			}
		});
	});
	if (norm_ov_points){
		var point_arr = _.map(team_results, function(team_result, team){
			return team_result.normalized_points;
		})
		var min_sum = _.min(point_arr);
		var max_sum = _.max(point_arr);
		_.each(team_results, function(team_result, team){
			team_results[team].normalized_points = calculateNormalizedResult(config,
										min_sum, max_sum, team_result.normalized_points);										
		});
	}
	return team_results;
}

function calculateNormalizedResults(config, min_max_points, results){
	return _.reduce(results, function(memo, group, name){
		var min = min_max_points[name][0];
		var max = max_min_points[name][1];
		memo[name] = _.reduce(station, function(memo, points, team){
			memo[team] = calculateNormalizedResult(config, min, max, points);
		});
	});
}

function calculateNormalizedResult(config, min, max, own_points){
	if (own_points === 0)
		return 0;
	var ov_max = config.ranking.max_points_per_game;
	var norm_diff = (max - min) / (own_points * 1.0);
	var points = norm_diff * (own_points - min + 0.001);
	return points;
}