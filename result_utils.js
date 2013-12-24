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
	var norm_part_results = calculateNormParticipantResults(config, norm_results);
	var part_group_results = calculateParticipantGroupResults(config, norm_part_results);
	var part_group_names = _.keys(part_group_results);
	var ranking = part_group_names.sort(function(a, b){
		return part_group_results[a].normalized_points - part_group_results[b].normalized_points;
	});
	return ranking;
}

function minMaxPoints(results){
	return _.reduce(results, function(memo, group_map, group){
		var points = _.map(ground_map, function(val){
			return val;
		});
		memo[group] = [_.min(points), _.max(points)];
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
function calculateParticipantGroupResults(config, norm_part_results){
	var part_groups = config.part_groups;
	var group_results = {};
	_.each(config.part_groups, function(member_groups, part_group){
		var rounds = 0;
		var point_sum = 0;
		_.each(member_groups, function(member_group){
			rounds += member_group.counting_rounds;
			point_sum += member_group.normalized_points;
		});
		group_results[part_group] = {
			"counting_rounds": rounds,
			"normalized_points": point_sum / rounds 
		};
		
	});
	if (config.ranking.normalize_overall_points){
		var point_arr = _.map(group_results, function(group_map, part_group){
			return group_map.normalized_points;
		})
		var min_sum = _.min(point_arr);
		var max_sum = _.max(point_arr);
		_.each(group_results, function(group_map, part_group){
			group_results[part_group].normalized_points = calculateNormalizedResult(config,
										min_sum, max_sum, group_map.normalized_points);										
		});
	}
	return group_results
}

/**
returns {
	[part]: {
		counting_rounds: [...],
		normalized_points: [...]
	}
	[...]
}
*/
function calculateNormParticipantResults(config, normalized_results){
	var non_part_zero = config.ranking.non_participation_gives_zero_points;
	var norm_ov_points = config.ranking.normalize_overall_points;
	var part_results = {};
	_.each(config.participants, function(part){
		part_results[part] = {
			counting_rounds: 0,
			normalized_points: 0
		};
	});
	_.each(normalized_results, function(group_map, group_name){
		_.each(config.participants, function(part){
			if (group_map[part] !== undefined){
				part_results[part].counting_rounds++;
				part_results[part].normalized_points
			} else if(non_part_zero){
				part_results[part].counting_rounds++;
			}
		});
	});
	if (norm_ov_points){
		var point_arr = _.map(part_results, function(part_map, part){
			return part_map.normalized_points;
		})
		var min_sum = _.min(point_arr);
		var max_sum = _.max(point_arr);
		_.each(part_results, function(part_map, part){
			part_results[part].normalized_points = calculateNormalizedResult(config,
										min_sum, max_sum, part_map.normalized_points);										
		});
	}
	return part_results;
}

function calculateNormalizedResults(config, min_max_points, results){
	return _.reduce(results, function(memo, group, group_name){
		var min = min_max_points[group_name][0];
		var max = max_min_points[group_name][1];
		memo[group_name] = _.reduce(group, function(memo, points, part){
			memo[part] = calculateNormalizedResult(config, min, max, points);
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