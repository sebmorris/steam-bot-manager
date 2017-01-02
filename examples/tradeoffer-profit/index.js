//TODO: THIS IS WIP - HAS NOT BEEN TESTED (yet)
'use strict';
//Replace this with `const BotManager = require('steam-bot-manager');`
const BotManager = require('../../index.js');
const defaultBotEvents = [{
	name: 'newOffer',
	cb: (offer) => {
		console.log('Received a new offer');
		botManager.processJob({
			type: 'newOffer',
			multi: false,
			constraints: ['profitCheck'],
			args: {
				offer: offer
			},
			//Get the steamid of the bot, which received the offer and use it to get the appropriate botIndex
			bots: [botManager.botIndexFromSteamid(offer.manager.steamID.getSteamID64())],
			fn: (args, bot) => void args.offer.accept() || 'A new offer was accepted'
		});
	}
}];
const botConstraints = [{
	name: 'profitCheck',
	//This keeps track of accepted offers
	initialValue: () => 0,
	//TODO: Value the items, check the bots items are worth less (use some pricing API)
	//Currently just checks the bot is receiving more items that it is giving
	testConstraint: (bot, val, args) => args.offer.itemsToReceive.length > args.offer.itemsToGive.length;,
	failedChange: (args) => void args.offer.decline(),
	succeededChange: () => 1
}];
const botManager = new BotManager();
botConstraints.forEach((constraint) => botManager.addJobConstraint(constraint));
botManager.addBot({
	accountName: '',
	password: '',
	shared: '',
	identity: ''
}, defaultBotEvents)
.then((loginRes) => {
	console.log(loginRes);
	console.log('Waiting for new tradeoffers');
})
.catch((err) => {
	console.log(err);
});
