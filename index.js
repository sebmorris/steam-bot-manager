'use strict';

let SteamUser = require('steam-user');
let SteamCommunity = require('steamcommunity');
let SteamTotp = require('steam-totp');
let TradeOfferManager = require('steam-tradeoffer-manager');
let SteamInventoryAPI = require('steam-inventory-api');

let BotManager = function(options) {
	if (!options) options = {};

	this.domain = options.domain || 'localhost';
	this.language = options.language || 'en';
	this.cancelTime = options.cancelTime || 180000;

   this.bots = [];
   this.botJobs = [];
   this.jobConstraints = {};
};

BotManager.prototype.addBot = function(loginDetails, managerEvents, retries) {
	//Create instances
	let client = new SteamUser();
	let manager = new TradeOfferManager({
		steam: client,
		domain: this.domain,
		language: this.language,
		cancelTime: this.cancelTime
	});
	let community = new SteamCommunity();
   return new Promise((resolve, reject) => {
		if (managerEvents) {
         managerEvents.forEach((event) => { manager.on(event.name, event.cb); });
      }

      loginDetails.twoFactorCode = SteamTotp.getAuthCode(loginDetails.shared);

      client.logOn(loginDetails);
      client.on('loggedOn', (details) => { if (details.eresult !== 1) return reject(details); });

		client.on('webSession', function(sessionID, cookies) {
			community.startConfirmationChecker(30000, loginDetails.identity);
			community.setCookies(cookies);
			resolve(cookies);
		});
	}).then((cookies) => {
		return new Promise((resolve, reject) => {
			manager.setCookies(cookies, (err) => {
				if (err) reject(err);
				this.bots.push({
					client: client,
					manager: manager,
					community: community,
					loginInfo: loginDetails,
					keysOwned: 0,
					recentRequests: 0,
					apiKey: manager.apiKey,
					steamid: client.steamID.getSteamID64(),
					botIndex: this.bots.length
				});
				resolve('A bot ('+client.steamID.getSteamID64()+') has been completely logged in');
			});
		});
	});
};

BotManager.prototype.loadInventories = function(appid, contextid, tradableOnly, botIndex) {
	return Promise.all(this.bots.map((bot, i) => {
		if (!botIndex || i === botIndex) {
			return SteamInventoryAPI.getInventory(bot.steamid, appid, contextid, tradableOnly)
			.then((inventory) => {
				inventory.forEach((item) => item.botIndex = i);
				return inventory;
			});
		}
		return [];
	}))
	.then((inventories) => {
		return inventories.concat.apply([], inventories);
	});
};

BotManager.prototype.addJob = function(job) {
	if (job.length > 0) job.forEach(function(job) { this.botJobs.push(job) });
	else this.botJobs.push(job);
};

BotManager.prototype.processJobs = function(jobsToProcess) {
   if (!jobsToProcess) jobsToProcess = 1;
   for (let i = 0; i < jobsToProcess; i++) {
      return this.processJob(this.botJobs.shift());
   }
};

BotManager.prototype.processJob = function(options) {
	let	type = options.type,
			multi = options.multi,
			constraints = options.constraints,
			args = options.args,
			fn = options.fn,
			bots = options.bots;

	//let {type, multi, constraints, args, fn, bots} = options;

	return new Promise((resolve, reject) => {
		if (!options) reject('Job options not set');

		console.log('New job:\n\t-', type, bots, multi, constraints);

		//Get an array of bots, which can do the job
		if (!bots) bots = this.bots.map((bot) => bot.botIndex);
		else if (typeof bots === number) bots = [bots];
		else if (!Array.isArray(bots)) throw 'options.bots is not in a valid format';

		if (constraints) {
			bots = bots.filter((botIndex) => {
				return constraints.reduce((prev, constraintName) => {
					return this.testConstraint(constraintName, args, botIndex) && prev;
				}, true);
			});
		}

		console.log('Bots (of selected) which pass all job constraints', bots);

		if (bots.length < 1) return reject('No bots meet all the criteria');

		let botObjects;
		if (!multi) botObjects = this.bots[bots[0]];
		else botObjects = bots.map((botIndex) => { this.bots[botIndex] });
		resolve(botObjects);
	})
	.then((botObjects) => fn(args, botObjects))
	.then((res) => {
		console.log('A job of type: ' + type + ' just completed\n\t- ' + res);
		if (bots && constraints) {
			bots.forEach((botIndex) => {
	 			constraints.forEach((constraintName) => {
	 				let constraint = this.jobConstraints[constraintName];
	 				if (constraint) {
	 					if (constraint.jobSucceededChange(args) !== undefined)
	 						constraint.botConstraintValues[botIndex] += constraint.jobSucceededChange(args);
	 				}
				});
			});
		}
	})
	.catch((err) => {
		console.log('There was an error completing a job of type: ' + type + '\n\t- ' + err);
		botArray.forEach((botIndex) => {
 			constraints.forEach((constraintName) => {
 				let constraint = this.jobConstraints[constraintName];
 				if (constraint) {
 					if (constraint.jobFailedChange(args) !== undefined)
 						constraint.botConstraintValues[botIndex] += constraint.jobFailedChange(args);
 				}
			});
		});
		throw err;
	});
};

BotManager.prototype.addJobConstraint = function(options) {
	let	name = options.name,
			initialConstraintValue = options.initialConstraintValue,
			jobFailedChange = options.jobFailedChange,
			jobSucceededChange = options.jobSucceededChange,
			testConstraint = options.testConstraint;
			if (!name) throw 'options.name not set';

	if (!testConstraint) throw 'options.testConstraint not set';
	if (!jobSucceededChange && !jobFailedChange) throw 'neither options.jobSucceededChange or options.jobFailedChange are defined';
	if (!initialConstraintValue) throw 'options.initialConstraintValue not set';

	this.jobConstraints[name] = {
		initialConstraintValue: initialConstraintValue,
		jobFailedChange: jobFailedChange,
		jobSucceededChange: jobSucceededChange,
		testConstraint: testConstraint,
		botConstraintValues: []
	};
	return 'constraint has been added';
};

BotManager.prototype.testConstraint = function(constraintName, args, botIndex) {
	if (!this.jobConstraints[constraintName]) return;
	const constraintTest = this.jobConstraints[constraintName].testConstraint;

	let botConstraintValues = this.jobConstraints[constraintName].botConstraintValues;
	if (botIndex && botConstraintValues[botIndex]) {
		return constraintTest(this.bots[botIndex], botConstraintValues[botIndex], args);
	} else if (botIndex) {
		botConstraintValues[botIndex] = this.jobConstraints[constraintName].initialConstraintValue(bot);
		console.log(botConstraintValues[botIndex]);
		return constraintTest(this.bots[botIndex], botConstraintValues[botIndex], args);
	} else {
		return this.bots.map((bot, i) => {
			if (!botConstraintValues[i]) {
				botConstraintValues[botIndex] = this.jobConstraints[constraintName].initialConstraintValue(bot);
			}
			return constraintTest(bot, botConstraintValues[i], args);
		});
	}
};

BotManager.prototype.botIndexFromSteamid = function(steamid) {
	return this.bots.reduce((prev, curr, i) => {
	  if (curr.steamid === steamid) return i;
	}, undefined);
};

BotManager.prototype.openJobs = function() {
	return this.botJobs.length;
};

BotManager.prototype.setConstraintValues = function(name, value) {
	if (this.jobConstraints[name]) {
		this.jobConstraints[name].botConstraintValues = this.jobConstraints[name].botConstraintValues.map(() => value);
   }
};

BotManager.prototype.numberOfBotsLoggedIn = function() {
	return this.bots.length;
};

module.exports = BotManager;
