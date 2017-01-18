'use strict';

var SteamUser = require('steam-user');
var SteamCommunity = require('steamcommunity');
var SteamTotp = require('steam-totp');
var TradeOfferManager = require('steam-tradeoffer-manager');
var SteamInventoryAPI = require('steam-inventory-api');

var BotManager = function BotManager(options) {
	if (!options) options = {};

	this.domain = options.domain || 'localhost';
	this.language = options.language || 'en';
	this.cancelTime = options.cancelTime || 180000;

	this.bots = [];
	this.botJobs = [];
	this.jobConstraints = {};
};

BotManager.prototype.addBot = function (loginDetails, managerEvents, type) {
	var _this = this;

	//Create instances
	var client = new SteamUser();
	var manager = new TradeOfferManager({
		steam: client,
		domain: this.domain,
		language: this.language,
		cancelTime: this.cancelTime
	});
	var community = new SteamCommunity();
	return new Promise(function (resolve, reject) {
		if (managerEvents) {
			managerEvents.forEach(function (event) {
				return manager.on(event.name, event.cb);
			});
			console.log('Set manager events:\n\t- ' + managerEvents.map(function (event) {
				return event.name;
			}));
		}

		loginDetails.twoFactorCode = SteamTotp.getAuthCode(loginDetails.shared);

		client.logOn(loginDetails);
		client.on('loggedOn', function (details) {
			if (details.eresult !== 1) return reject(details);
		});

		client.on('webSession', function (sessionID, cookies) {
			community.startConfirmationChecker(30000, loginDetails.identity);
			community.setCookies(cookies);
			resolve(cookies);
		});
	}).then(function (cookies) {
		return new Promise(function (resolve, reject) {
			manager.setCookies(cookies, function (err) {
				if (err) reject(err);
				var botArrayLength = _this.bots.push({
					client: client,
					manager: manager,
					community: community,
					loginInfo: loginDetails,
					apiKey: manager.apiKey,
					steamid: client.steamID.getSteamID64(),
					botIndex: _this.bots.length,
					type: type
				});
				resolve(_this.bots[botArrayLength - 1]);
			});
		});
	});
};

BotManager.prototype.loadInventories = function (appid, contextid, tradableOnly) {
	return Promise.all(this.bots.map(function (bot, i) {
		return SteamInventoryAPI.getInventory(bot.steamid, appid, contextid, tradableOnly).then(function (inventory) {
			inventory.forEach(function (item) {
				return item.botIndex = i;
			});
			return inventory;
		});
	})).then(function (inventories) {
		return inventories.concat.apply([], inventories);
	});
};

BotManager.prototype.addJob = function (job) {
	if (job.length > 0) job.forEach(function (job) {
		this.botJobs.push(job);
	});else this.botJobs.push(job);
};

BotManager.prototype.processJobs = function (jobsToProcess) {
	if (!jobsToProcess) jobsToProcess = 1;
	var jobProcesses = [];
	for (var i = 0; i < jobsToProcess; i++) {
		jobProcesses.push(this.processJob(this.botJobs.shift()));
	}
	return jobProcesses;
};

BotManager.prototype.processJob = function (_ref) {
	var _this2 = this;

	var type = _ref.type,
	    multi = _ref.multi,
	    constraints = _ref.constraints,
	    args = _ref.args,
	    fn = _ref.fn,
	    bots = _ref.bots;

	return new Promise(function (resolve, reject) {
		console.log('New job:\n\t-', type, bots, multi, constraints);

		//Get an array of bot indexes, which are permitted to do the job
		if (!bots) bots = _this2.bots.map(function (bot) {
			return bot.botIndex;
		});else if (typeof bots == 'number') bots = [bots];else if (!Array.isArray(bots)) throw 'options.bots is not in a valid format';
		//Test constraints for bots permitted
		if (constraints) {
			bots = bots.filter(function (botIndex) {
				return constraints.reduce(function (prev, constraintName) {
					console.log('Testing', constraintName + '. The result was:', _this2.testConstraint(constraintName, args, botIndex));
					return _this2.testConstraint(constraintName, args, botIndex) && prev;
				}, true);
			});
		}

		console.log('Bots (of selected) which pass all job constraints', bots);

		if (bots.length < 1) return reject('No bots meet all the criteria');

		var botObjects = void 0;
		if (!multi) botObjects = _this2.bots[bots[0]];else botObjects = bots.map(function (botIndex) {
			return _this2.bots[botIndex];
		});
		resolve(botObjects);
	}).then(function (botObjects) {
		return Promise.resolve(fn(args, botObjects));
	}).then(function (res) {
		console.log('A job of type: ' + type + ' just completed\n\t- ' + res);
		if (bots && constraints) {
			bots.forEach(function (botIndex) {
				constraints.forEach(function (constraintName) {
					var constraint = _this2.jobConstraints[constraintName];
					if (constraint) {
						if (constraint.succeededChange(args) !== undefined) constraint.botConstraintValues[botIndex] += constraint.succeededChange(args);
					}
				});
			});
		}
	}).catch(function (err) {
		console.log('There was an error completing a job of type: ' + type + '\n\t- ' + err);
		bots.forEach(function (botIndex) {
			constraints.forEach(function (constraintName) {
				var constraint = _this2.jobConstraints[constraintName];
				if (constraint) {
					if (constraint.failedChange(args) !== undefined) constraint.botConstraintValues[botIndex] += constraint.failedChange(args);
				}
			});
		});
		throw err;
	});
};

BotManager.prototype.addJobConstraint = function (_ref2) {
	var name = _ref2.name,
	    initialValue = _ref2.initialValue,
	    failedChange = _ref2.failedChange,
	    succeededChange = _ref2.succeededChange,
	    testConstraint = _ref2.testConstraint;

	if (!name) throw 'options.name not set';
	if (!testConstraint) throw 'options.testConstraint not set';
	if (!succeededChange && !failedChange) throw 'neither options.succeededChange or options.failedChange are defined';
	if (!initialValue) throw 'options.initialValue not set';

	this.jobConstraints[name] = {
		initialValue: initialValue,
		failedChange: failedChange,
		succeededChange: succeededChange,
		testConstraint: testConstraint,
		botConstraintValues: []
	};
	return 'constraint has been added';
};

BotManager.prototype.testConstraint = function (constraintName, args, botIndex) {
	var _this3 = this;

	if (!this.jobConstraints[constraintName]) return;
	var constraintTest = this.jobConstraints[constraintName].testConstraint;

	var botConstraintValues = this.jobConstraints[constraintName].botConstraintValues;
	if (botIndex && botConstraintValues[botIndex]) {
		return constraintTest(this.bots[botIndex], botConstraintValues[botIndex], args);
	} else if (botIndex !== undefined) {
		botConstraintValues[botIndex] = this.jobConstraints[constraintName].initialValue(botIndex);
		return constraintTest(this.bots[botIndex], botConstraintValues[botIndex], args);
	} else {
		return this.bots.map(function (bot, i) {
			if (!botConstraintValues[i]) {
				botConstraintValues[botIndex] = _this3.jobConstraints[constraintName].initialValue(botIndex);
			}
			return constraintTest(bot, botConstraintValues[i], args) ? i : undefined;
		}).filter(function (val) {
			return val !== undefined;
		});
	}
};

BotManager.prototype.botIndexFromSteamid = function (steamid) {
	return this.bots.reduce(function (prev, curr, i) {
		if (curr.steamid === steamid) return i;
	}, undefined);
};

BotManager.prototype.botSteamidFromIndex = function (botIndex) {
	return this.bots[botIndex].steamid;
};

BotManager.prototype.openJobs = function () {
	return this.botJobs.length;
};

BotManager.prototype.setConstraintValues = function (name, value) {
	if (this.jobConstraints[name]) {
		this.jobConstraints[name].botConstraintValues = this.jobConstraints[name].botConstraintValues.map(function () {
			return value;
		});
	}
};

BotManager.prototype.numberOfBotsLoggedIn = function () {
	return this.bots.length;
};

BotManager.prototype.botObjectFromIndex = function (botIndex) {
	return this.bots[botIndex];
};

module.exports = BotManager;