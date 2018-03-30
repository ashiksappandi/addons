var token;
var table;
var servicesState;

function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function PDRequest(token, endpoint, method, options) {

	var merged = $.extend(true, {}, {
		type: method,
		dataType: "json",
		url: "https://api.pagerduty.com/" + endpoint,
		headers: {
			"Authorization": "Token token=" + token,
			"Accept": "application/vnd.pagerduty+json;version=2"
		},
		error: function(err) {
			var alertStr = "Error '" + err.status + " - " + err.statusText + "' while attempting " + method + " request to '" + endpoint + "'";
			try {
				alertStr += ": " + err.responseJSON.error.message;
			} catch (e) {
				alertStr += ".";
			}
			
			try {
				alertStr += "\n\n" + err.responseJSON.error.errors.join("\n");
			} catch (e) {}

			alert(alertStr);
		}
	},
	options);

	$.ajax(merged);
}

function fetch(endpoint, params, callback, progressCallback) {
	var limit = 100;
	var infoFns = [];
	var fetchedData = [];

	var commonParams = {
			total: true,
			limit: limit
	};

	var getParams = $.extend(true, {}, params, commonParams);

	var options = {
		data: getParams,
		success: function(data) {
			var total = data.total;
			Array.prototype.push.apply(fetchedData, data[endpoint]);

			if ( data.more == true ) {
				var indexes = [];
				for ( i = limit; i < total; i += limit ) {
					indexes.push(Number(i));
				}
				indexes.forEach(function(i) {
					var offset = i;
					infoFns.push(function(callback) {
						var options = {
							data: $.extend(true, { offset: offset }, getParams),
							success: function(data) {
								Array.prototype.push.apply(fetchedData, data[endpoint]);
								if (progressCallback) {
									progressCallback(data.total, fetchedData.length);
								}
								callback(null, data);
							}
						}
						PDRequest(getParameterByName('token'), endpoint, "GET", options);
					});
				});

				async.parallel(infoFns, function(err, results) {
					callback(fetchedData);
				});
			} else {
				callback(fetchedData);
			}
		}
	}
	PDRequest(getParameterByName('token'), endpoint, "GET", options);
}

function fetchServices(callback) {
	fetch("services", null, callback);
}

function setServiceEnabled(serviceID, serviceName, enabled) {
	var params = {
		data: {
			service: {
				status: (enabled ? "active" : "disabled")
			}
		},
		success: function() {
			servicesState[serviceID].pdState = enabled;
			$('#results').append('Service ' + serviceName + ' was ' + (enabled ? "enabled" : "disabled") + '<br>\n');
		}
	};
	PDRequest(getParameterByName('token'), 'services/' + serviceID, 'put', params);
}

function main() {
	token = getParameterByName('token');
	$('#result').html('');
	
	$('.busy').show();
	fetchServices(function(services) {
		$('#details').html($('<table/>', {
			id: "details-table",
			class: "display"
		}));

		var tableData = [];
		servicesState = {};

		services.forEach(function(service) {
			var isEnabled = (service.status == 'disabled' ? false : true);
			servicesState[service.id] = { name: service.summary, pdState: isEnabled, uiState: isEnabled };
			tableData.push([
				'<input type="checkbox" value="' + service.summary + '" id="' + service.id + '"' + (isEnabled ? ' checked' : '') + '>',
				service.summary
			]);
		});

		var columnTitles = [
				{ title: "Enabled" },
				{ title: "Service Name" }
			];
		table = $('#details-table').DataTable({
			data: tableData,
			columns: columnTitles,
			dom: 'Bfrtip',
			searching: false,
			buttons: [
				{
					text: "Select All",
					action: function () {
						$('input[type="checkbox"]').prop('checked', true);
						Object.keys(servicesState).forEach(function(key) {
							servicesState[key].uiState = true;
						});
					}
				},
				{
					text: "Deselect All",
					action: function () {
						$('input[type="checkbox"]').prop('checked', false);
						Object.keys(servicesState).forEach(function(key) {
							servicesState[key].uiState = false;
						});
					}
				},
				{
					text: "Apply",
					action: function (e, dt, node, config) {
						Object.keys(servicesState).forEach(function(key) {
							if ( servicesState[key].uiState != servicesState[key].pdState ) {
								setServiceEnabled(key, servicesState[key].name, servicesState[key].uiState);
							}
						});
					}
				}
			],
			order: [[1, 'asc']],
			pageLength: 50
		});

		$('input[type="checkbox"]').change(function () {
			servicesState[this.id].uiState = this.checked;
		});

		$('.busy').hide();
	});
}

$(document).ready(main);
