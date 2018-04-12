var services, users;

function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, " "));
}


function toggleFeatures(featuresStr) {
	var features = featuresStr.toLowerCase();
	
	$('.nav .tab').hide();
	
	if ( features.indexOf('a') > -1 ) {
		$('#auth-button').show();
	}
	if ( features.indexOf('i') > -1 ) {
		$('#integrations-button').show();
	}
	if ( features.indexOf('t') > -1 ) {
		$('#trigger-button').show();
	}
	if ( features.indexOf('n') > -1 ) {
		$('#incidents-button').show();
	}
	if ( features.indexOf('u') > -1 ) {
		$('#users-dropdown').show();
	}
	if ( features.indexOf('d') > -1 ) {
		$('#addons-dropdown').show();
	}
}

function PDRequest(endpoint, method, options) {

	var token = $('#token').val();

	var merged = $.extend(true, {}, {
		type: method,
		dataType: "json",
		url: "https://api.pagerduty.com/" + endpoint,
		headers: {
			"Authorization": "Token token=" + token,
			"Accept": "application/vnd.pagerduty+json;version=2"
		},
		error: function(err) {
			$('.busy').hide();
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

function PDEvent(options) {
	
	var token = $('#token').val();

	$.ajax($.extend({}, {
		type: "POST",
		dataType: "json",
		url: "https://events.pagerduty.com/generic/2010-04-15/create_event.json",
	},
	options));

}

function ackOrResolveIncidents(ackOrResolve, ids) {
	if ( ids.length < 1 ) return;
	$('.busy').show();
	var outstanding = 0;
	ids.forEach(function(id) {
		outstanding++;

		var requestData = {
				incident: {
					type: "incident",
					status: ackOrResolve,
					resolution: "PDtool"					}
			};

		var options = {
			headers: { "From": $('#userid').val() },
			data: requestData,
			success: function(data) {
				outstanding--;
				if (outstanding == 0) {
					$('.busy').hide();
					populateIncidentsResult();
				}
			}
		}
		PDRequest("incidents/" + id, "PUT", options);
	});
}

function acknowledgeIncidents(ids) {
	ackOrResolveIncidents("acknowledged", ids);
}

function resolveIncidents(ids) {
	ackOrResolveIncidents("resolved", ids);
}

function populateIntegrationsMenu() {
	$('#integrations-integration-select').html('');
	services[$('#integrations-service-select').val()].integrations.forEach(function(integration) {
		$('#integrations-integration-select').append($('<option/>', {
			value: integration.id,
			text: integration.summary
		}));
	});
	$('#integrations-integration-select').selectpicker('refresh');
	populateIntegrationsResult();
}

function populateIntegrationsResult() {
	$('#integrations-result').html('');
	var serviceID = $('#integrations-service-select').val();
	var integrationID = $('#integrations-integration-select').val();
	var options = {
		success: function(data) {
			$('#integrations-result').JSONView(data);
		}
	}
	PDRequest("/services/" + serviceID + "/integrations/" + integrationID, "GET", options);
}

// find all the generic API integrations, then get the integration keys from those
function populateTriggerSelect(data) {
	var integrationIDs = [];
	async.series([
		function(callback) {
			data.services.forEach(function(service) {
				service.integrations.forEach(function(integration) {
					if ( integration.type.includes("generic_events_api_inbound") || integration.type.includes("nagios_inbound") ) {
						integrationIDs.push([service.id, integration.id]);
					}
				});
			});
			callback(null, integrationIDs);
		},
		
		function(callback) {
			var infoFns = [];
			integrationIDs.forEach(function(integrationID) {
				infoFns.push(function(callback) {
					var options = {
						success: function(integrationInfo) {
							callback(null, integrationInfo);
						}
					}
					PDRequest("services/" + integrationID[0] + "/integrations/" + integrationID[1], "GET", options);
				});
			});
			async.parallel(infoFns, 
				function(err, results) {
					results.forEach(function(result) {
						$('#trigger-dest-select').append($('<option/>', {
							value: result.integration.integration_key,
							text: result.integration.service.summary + ": " + result.integration.name
						}));
					});
					$('#trigger-dest-select').selectpicker('refresh');
					$('.busy').hide();
			});
		}
	]);
}

function populateIncidentsResult() {
	$('#incidents-result').html('');
	$('#incidents-result').append($('<table/>', {
		id: "incidents-result-table"
	}));

	$('#incidents-result-table').on('click', 'td button.resolve-button', function() {
		var incidentID = $(this).attr('id');
		var requestData = {
				incident: {
					type: "incident",
					status: "resolved",
					resolution: "PDtool"					}
			};

		var options = {
			headers: { "From": $('#userid').val() },
			data: requestData,
			success: function(data) {
				populateIncidentsResult();
			}
		}
		PDRequest("incidents/" + incidentID, "PUT", options);

	});
	
	$('#incidents-result-table').on('click', 'td button.ack-button', function() {
		var incidentID = $(this).attr('id');
		var requestData = {
				incident: {
					type: "incident",
					status: "acknowledged",
					resolution: "PDtool"					}
			};

		var options = {
			headers: { "From": $('#userid').val() },
			data: requestData,
			success: function(data) {
				populateIncidentsResult();
			}
		}
		PDRequest("incidents/" + incidentID, "PUT", options);

	});
	
	var options = {
		success: function(data) {
			var tableData = [];
			data.incidents.forEach(function(incident) {
				var actionButtons = '<button class="btn btn-sm resolve-button" id="' + incident.id + '">Resolve</button>';
				if ( incident.status == "triggered" ) {
					actionButtons += ' <button class="btn btn-sm ack-button" id="' + incident.id + '">Ack</button>';
				}
				tableData.push(
					[
						'<a href="' + incident.html_url + '" target="blank">' + incident.incident_number + '</a>',
						(new Date(incident.created_at)).toLocaleString(),
						incident.status,
						incident.service.summary,
						incident.summary,
						actionButtons
						
					]
				);
			});
			$('#incidents-result-table').DataTable({
				select: true,
				dom: 'Btftip',
				buttons: [
					{
						text: 'Acknowledge Selected',
						action: function(e, dt, node, config) {
							var ids = [];
							$('#incidents-result-table tr.selected button.ack-button').each(function() {
								ids.push($(this).attr("id"));
							});
							acknowledgeIncidents(ids);
						}
					},
					{
						text: 'Resolve Selected',
						action: function(e, dt, node, config) {
							var ids = [];
							$('#incidents-result-table tr.selected button.resolve-button').each(function() {
								ids.push($(this).attr("id"));
							});
							resolveIncidents(ids);
						}
					},
					
				],
				data: tableData,
				columns: [
					{ title: "#" },
					{ title: "Created at" },
					{ title: "Status" },
					{ title: "Service Name" },
					{ title: "Summary" },
					{ title: "Actions" }
				]
			});
		},
		data: {
			"statuses[]": ["triggered","acknowledged"]
		}
	}
	PDRequest("incidents", "GET", options);
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
						PDRequest(endpoint, "GET", options);
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
	PDRequest(endpoint, "GET", options);
}


function processUsers(users) {
	var tableData = [];
	users.forEach(function(user) {
		var methods = {
			phone: [],
			email: [],
			sms: [],
			push: []
		}
		
		user.contact_methods.forEach(function(method) {
			switch (method.type) {
				case "email_contact_method":
					methods.email.push(method.address);
					break;
				case "phone_contact_method":
					methods.phone.push(method.address);
					break;
				case "push_notification_contact_method":
					methods.push.push(method.address);
					break;
				case "sms_contact_method":
					methods.sms.push(method.address);
					break;
			}
		});
		
		var teams = [];
		user.teams.forEach(function(team) {
			teams.push(team.summary);
		});
		
		tableData.push(
			[
				user.id,
				user.name,
				user.email,
				user.job_title,
				user.role,
				teams.join(),
				methods.email.join(),
				methods.phone.join(),
				methods.sms.join()
			]
		);
	});

	$('#users-export-result-table').DataTable({
		data: tableData,
		columns: [
			{ title: "PD User ID" },
			{ title: "User Name" },
			{ title: "Login"},
			{ title: "Title"},
			{ title: "PD Role"},
			{ title: "Teams"},
			{ title: "Contact email" },
			{ title: "Contact phone" },
			{ title: "Contact sms" },
		],
		dom: 'Bfrtip',
		buttons: [
			'copy', 'csv', 'excel', 'pdf', 'print'
		]
	});
	$('.busy').hide();
}

function populateUsersResult() {
	$('.busy').show();
	$('#users-export-result').html('');
	$('#users-export-result').append($('<table/>', {
		id: "users-export-result-table"
	}));

	var options = {
		"include[]": "contact_methods",
		"total": "true"
	};
	fetch("users", options, function(users) {
		processUsers(users)
	});
}


function processUsersEdit(tableData, data) {
	data.users.forEach(function(user) {
		var methods = {
			phone: [],
			email: [],
			sms: [],
			push: []
		}
		
		user.contact_methods.forEach(function(method) {
			switch (method.type) {
				case "email_contact_method":
					methods.email.push(method.address);
					break;
				case "phone_contact_method":
					methods.phone.push(method.address);
					break;
				case "push_notification_contact_method":
					methods.push.push(method.address);
					break;
				case "sms_contact_method":
					methods.sms.push(method.address);
					break;
			}
		});
		
		var teams = [];
		user.teams.forEach(function(team) {
			teams.push(team.summary);
		});
		
		tableData.push(
			[
				user.id,
				user.name,
				user.email,
				user.job_title,
				user.role,
				user.time_zone,
				user.color,
				user.description
			]
		);
	});
	if ( data.more == true ) {
		var offset = data.offset + data.limit;
		var progress = Math.round((data.offset / data.total) * 100);
		$('#progressbar').attr("aria-valuenow", "" + progress);
		$('#progressbar').attr("style", "width: " + progress + "%;");
		$('#progressbar').html("" + progress + "%");
		
		var options = {
			data: {
				"include[]": ["contact_methods"],
				"offset": offset,
				"total": "true"
			},
			success: function(data) { processUsersEdit(tableData, data); }
		}
		
		PDRequest("users", "GET", options);
	} else {
		$('#users-edit-result-table').DataTable({
			data: tableData,
			columns: [
				{ title: "ID" },
				{ title: "User Name" },
				{ title: "Login"},
				{ title: "Title"},
				{ title: "PD Role"},
				{ title: "Time Zone"},
				{ title: "Color" },
				{ title: "Description" }
			],
			fnDrawCallback: function() {
				$('#users-edit-result-table').Tabledit({
				    url: '',
				    onAlways: function(action, serialize) {
					    var pairs = serialize.split('&');
					    var id = pairs[0].split('=')[1];
					    var field = pairs[1].split('=')[0];
					    var value = decodeURIComponent(pairs[1].split('=')[1]);
					    modifyUser(id, field, value);
				    },
				    editButton: false,
				    deleteButton: false,
				    hideIdentifier: true,
				    columns: {
				        identifier: [0, 'id'],
				        editable: [[1, 'name'], [2, 'email'], [3, 'job_title'], [4, 'role'], [5, 'time_zone'], [6, 'color'], [7, 'description']]
				    }
				});
    		}
		});
		$('.busy').hide();
		$('#progressbar').attr("aria-valuenow", "0");
		$('#progressbar').attr("style", "width: 0%;");
		$('#progressbar').html("0%");
	}
}

function modifyUser(id, field, value) {
	var options = {
		data: {
			user: {
			}
		},
		error: function(data) {
			alert("Failed to edit " + field + ": " + data.responseJSON.error.message + "\n\n" + data.responseJSON.error.errors.join("\n"));
			populateUsersEdit();
		}
	}
	options.data.user[field] = value;
	
	PDRequest("/users/" + id, "PUT", options);
	
}


function populateUsersEdit() {
	$('.busy').show();
	$('#users-edit-result').html('');
	$('#users-edit-result').append($('<table/>', {
		id: "users-edit-result-table"
	}));
	
	var tableData = [];
	var options = {
		data: {
			"include[]": ["contact_methods"],
			"total": "true"
		},
		success: function(data) { processUsersEdit(tableData, data); }
	}
	
	PDRequest("users", "GET", options);
}

function processAddons(tableData, data) {

	data.addons.forEach(function(addon) {
		var actionButtons = '<button class="btn btn-sm delete-button" id="' + addon.id + '">Delete</button>';
		
		
		var desc = addon.summary;
		if ( addon.html_url ) {
			desc = '<a href="' + addon.html_url + '" target="blank">' + desc + '</a>'
		}

		tableData.push([
			desc,
			addon.type,
			addon.src,
			actionButtons
		]);
	});
	
	if (data.more == true) {
		var offset = data.offset + data.limit;
		var options = {
			data: {
				"offset": offset,
				"total": "true"
			},
			success: function(data) { processAddons(tableData, data); }
		}
		PDRequest("addons", "GET", options);
	} else {
		$('#addons-result-table').DataTable({
			data: tableData,
			columns: [
				{ title: "Description" },
				{ title: "Type"},
				{ title: "URL"},
				{ titls: "Actions"}
			]
		});
		$('.busy').hide();		
		$('#addons-result-table').on('click', 'td button.delete-button', function() {
			var addonID = $(this).attr('id');
	
			var options = {
				success: function(data) {
					populateAddonsResult();
				}
			}
			PDRequest("addons/" + addonID, "DELETE", options);
		});
	}
}

function populateAddonsResult() {
	$('.busy').show();
	$('#addons-result').html('');
	$('#addons-result').append($('<table/>', {
		id: "addons-result-table"
	}));
	
	var tableData = [];
	var options = {
		success: function(data) { processAddons(tableData, data) },
		total: true
	}
	
	PDRequest("addons", "GET", options);
}

function addUsers() {
	$('.busy').show();
	var outstanding = 0;
	users.forEach(function(user) {
		outstanding++;
		var dataObj = $.extend(true, { type: "user" }, user);

		for ( var key in dataObj ) {
			if ( dataObj[key] === null || dataObj[key] === undefined || dataObj[key] === "" ) {
				delete dataObj[key];
			}
		}

		var options = {
			data: {
				user: dataObj
			},
			success: function(data) {
				outstanding--;
				if (outstanding == 0) {
					$('.busy').hide();
				}
			}
		}
		PDRequest("users", "POST", options);
	});
}

function main() {

	// prepopulate token field if it's been saved
	$("#token").val(localStorage.getItem("token"));
	$("#userid").val(localStorage.getItem("userid"));
	
	// silently save the token if the user types something in
	$('#token').change(function() {
		localStorage.setItem('token', $('#token').val());
	});
	$('#userid').change(function() {
		localStorage.setItem('userid', $('#userid').val());
	});
	
	if ( getParameterByName("token") ) {
		$("#token").val(getParameterByName("token"));
	}

	if ( getParameterByName("userid") ) {
		$("#userid").val(getParameterByName("userid"));
	}
	
	if ( getParameterByName("features") ) {
		toggleFeatures(getParameterByName("features"));
	}

	$('.selectpicker').selectpicker();
	
	// when you change the service select, show the integrations for the selected service
	$('#integrations-service-select').change(function() {
		populateIntegrationsMenu();
	});
	
	// when you change the selected integration, get the details of the selected integration
	$('#integrations-integration-select').change(function() {
		populateIntegrationsResult();
	});
	
	// active 'tab' highlight
	$('.nav li').click(function() {
		$('nav li').removeClass("active");
		$(this).addClass("active");
	})

	//show integrations page
	$('#integrations-button').click(function() {
		$('.detail').hide();
		$('#integrations').show();
		
		var options = {
			success: function(data) {
				$('#integrations-service-select').html('');
				services = {};
				data.services.forEach(function(service) {
					services[service.id] = service;
					$('#integrations-service-select').append($('<option/>', {
						value: service.id,
						text: service.name
					}));
				});
				$('#integrations-service-select').selectpicker('refresh');
				populateIntegrationsMenu();
				populateIntegrationsResult();
			}
		};
		PDRequest("services", "GET", options);

	});
	
	// show trigger page
	$('#trigger-button').click(function() {
		$('.detail').hide();
		$('#trigger').show();
		$('.busy').show();
		$('#trigger-dest-select').html('');

		// put pre-canned events into the select in the trigger page
		var keys = Object.keys(PDtoolevents);
		keys.sort();
		keys.forEach(function(event) {
			$('#trigger-event-select').append($('<option/>', {
				value: event,
				text: event
			}));
		});
		$('#trigger-event-select').selectpicker('refresh');

/*
		var options = {
			success: function(data) {
				populateTriggerSelect(data);
			}
		};
*/
		$('.busy').show();
// 		PDRequest("services", "GET", options);
		fetch('services', null, function(data) {
			populateTriggerSelect(data);
		});
	});
	
	$('#incidents-button').click(function() {
		$('.detail').hide();
		$('#incidents').show();
		populateIncidentsResult();
	});

	$('#auth-button').click(function() {
		$('.detail').hide();
		$('#auth').show();
	});

	$('#users-export-button').click(function() {		
		$('.detail').hide();
		$('#users-export').show();
		populateUsersResult();
	});
	
	$('#users-import-button').click(function() {		
		$('.detail').hide();
		$('#users-import').show();
	});

	$('#users-edit-button').click(function() {		
		$('.detail').hide();
		$('#users-edit').show();
		populateUsersEdit();
	});

	$('#addons-view-button').click(function() {
		$('.detail').hide();
		$('#addons').show();
		populateAddonsResult();
	});
	
	$('#addons-add-button').click(function() {
		$('.detail').hide();
		$('#addons-add').show();
	});
	
	$('#csv-file-input').on('change', function(){
		Papa.parse(this.files[0], {
			header: true,
			complete: function(results) {
				users = [];
				var emailregex = '^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$';
				results.data.forEach(function(user) {
					if ( ! user.hasOwnProperty('email') || user.email == "" || ! user.email.match(emailregex) ) {
						return;
					}
					if ( ! user.hasOwnProperty('name') || user.name == "" ) {
						return;
					}
					if ( ! user.hasOwnProperty('role') || user.role == "" ) {
						user.role = "user";
					}
					users.push(user);
				});
				$('#users-import-result').append($('<table/>', {
					id: "users-import-result-table"
				}));
				$('#users-import-result-table').DataTable({
					data: users,
					columns: [
						{ data: 'name', title: 'Name' },
						{ data: 'email', title: 'Login/Email' },
						{ data: 'time_zone', title: 'Time Zone' },
						{ data: 'color', title: 'Color' },
						{ data: 'role', title: 'PD Role' },
						{ data: 'job_title', title: 'Job Title' },
						{ data: 'avatar_url', title: 'Avatar URL' },
						{ data: 'description', title: 'Description' },
					]
				});
				$('#users-import-result').append('<button type="button" id="users-import-submit" class="btn btn-primary">Add ' + users.length + ' users</button>');
				$('#users-import-submit').click(function() {
					addUsers();
				});
			}
		});
	});
	
	$('#addons-install-button').click(function() {
		var options = {
			data: {
				addon: {
					name: $('#addons-name').val(),
					type: $('#addons-type').val(),
					src: $('#addons-url').val()
				}
			},
			success: function() {
				$('#addons-add-result').append('Installed addon "' + $('#addons-name').val() + '" (' + $('#addons-url').val() + ')');
			}
		}
		
		PDRequest("addons", "POST", options);
	});

	// send trigger button
	$('#trigger-send-button').click(function() {
		var eventData = $.extend(PDtoolevents[$('#trigger-event-select').val()].event, { "service_key": $('#trigger-dest-select').val() });
		var options = {
			success: function() {
				$('#trigger-result').append($('#trigger-event-select').val() + " event sent to " + 
								$("#trigger-dest-select option:selected").text() + "<br>");
			},
			data: JSON.stringify(eventData)
		}
		PDEvent(options);
	});
	
	$('.navbar-brand').click(function() {
		if ( $(this).html() == '📟💩🔧') {
			$(this).html('PD Tool');
		} else {
			$(this).html('📟💩🔧');
		}
	});
}

$(document).ready(main);
