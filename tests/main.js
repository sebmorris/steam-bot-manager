'use strict';

const BotManager = require('../index.js');
let botManager = new BotManager();

const defaultBotEvents = [
	{
		name: 'newOffer',
		cb: (offer) => {
			console.log('Received a new offer');
			offer.decline();
		}
	}
];

botManager.addBot({
   accountName: '',
   password: '',
   shared: '',
   identity: ''
}, defaultBotEvents)
.then((loginRes) => {
   console.log(loginRes);
   return botManager.loadInventories(730, 2, true);
})
.then((items) => {
   console.log(items.length + ' items found in the bot\'s inventories');
	console.log('Setup complete');
})
.catch((err) => {
	console.log(err);
});
