# Bot manager
Allows you to manage many Steam bots with ease.  
`npm install --save steam-bot-manager`
```
const BotManager = require('steam-bot-manager');
const botManager = new BotManager();
```
## Adding bots
#### addBot
Logs a bot into Steam. Returns a promise.

1. loginDetails: an object with
   * *accountName*: the account username
   * *password*: the account password
   * *shared*: the account's shared secret
   * *identity*: the account's identity secret
2. botEvents: an array of objects containing bot events. The objects have:
   * *name*: name of the event (same as node-tradeoffer-manager event names)
   * *cb*: the function to be called when the event triggers

## Bot settings
#### addJobConstraint
Adds a test which is run every time the bot is considered for a job.

1. jobConstraint:  an object with:
   * *name*: the name of the job constraint
   * *initialValue*: a function, which should return a number
   * *testConstraint*: a function, which should return true or false, depending on whether a bot is permitted to perform the job it is called with. Called with:
     1. bot object
     2. current constraint value
     3. args for the job
   * *failedChange*: a function, which should return a number to increment the internally stored constraint value upon job failure. Called with:
     1. the args parameter passed to addJob
   * *succeededChange*: a function, which should return a number to increment the internally stored constraint value upon job success. Called with:
     1. the args parameter passed to addJob

## Bot job processing
#### addJob
Adds a job to the bots' job queue.

1. job: an object with:
  * *type*: the job type (for logging)
  * *args*: an object. Arguments for the job, passed to the job process function
  * *multi*: if false, one bot object is sent to the job process function. If true, all permitted bots are passed as an array to the job process function
  * *bots*: optional. An array of bot indexes, if passed, bots to complete the job are selected from only the bots in this array. Otherwise, bots to complete the job are selected from all logged in bots
  * *constraints*: an array. Constraints which will be tested for each bot selected
  * *fn*: the function, which completes the job. Can return a value or a promise. Called with:
    1. the args parameter passed to addJob
    2. (depending on multi) an array of bot objects, or a single bot object

#### processJobs
Processes a job(s) from the queue. First in first out system. Returns an array of job process promises.

1. number of jobs to process

#### processJob
Can be called directly with a job object. Returns a single promise for the job completing.

1. job: an object with:
  * *type*: the job type (for logging)
  * *args*: an object. Arguments for the job, passed to the job process function
  * *multi*: if false, one bot object is sent to the job process function. If true, all permitted bots are passed as an array to the job process function
  * *bots*: optional. An array of bot indexes, if passed, bots to complete the job are selected from only the bots in this array. Otherwise, bots to complete the job are selected from all logged in bots
  * *constraints*: an array. Constraints which will be tested for each bot selected
  * *fn*: the function, which completes the job. Can return a value or a promise. Called with:
    1. the args parameter passed to addJob
    2. (depending on multi) an array of bot objects, or a single bot object

#### setConstraintValues
Set all of the constraint values for a job constraint. Useful for resetting bot recent requests or similar.

1. name of the job constraint
2. value of the job constraint

#### testConstraint
Test whether specified bots would be able to perform the specified job. Returns either a true/false value if bot index is defined, or an array of permitted bot indexes otherwise.

1. constraint name
2. job args to be tested
3. bot index. If not provided an array of permitted bot indexes is returned

## Misc
#### botIndexFromSteamid
Get the botIndex of a bot from its Steam id. Returns a botIndex.

1. Steam id 64

#### numberOfBotsLoggedIn
Returns the number of logged in bots.

#### openJobs
Returns the number of jobs in the queue.

#### botObjectFromIndex
Takes a botIndex. Returns a bot object with:

* *client*: a Steam client object
* *manager*: a Steam manager object
* *community*: a Steam community object
* *loginInfo*: the bot's login info
* *apiKey*: the bot's API key
* *steamid*: the bot's Steam 64 id
* *botIndex*: the bot's index
