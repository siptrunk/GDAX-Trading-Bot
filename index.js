/*
 ============================================================================
 Name        : GDAX Trading Bot
 Author      : Kenshiro
 Version     : 3.07
 Copyright   : GNU General Public License (GPLv3)
 Description : Trading bot for GDAX exchange
 ============================================================================
 */

const APP_VERSION = "v3.07";

const GdaxModule = require('gdax');

const PASSPHRASE = process.env.TRADING_BOT_PASSPHRASE;
const KEY = process.env.TRADING_BOT_KEY;
const SECRET = process.env.TRADING_BOT_SECRET;

const GDAX_URI = 'https://api.gdax.com';

const CURRENCY_PAIR = 'BTC-EUR';

const EURO_TICKER = 'EUR';
const BITCOIN_TICKER = 'BTC';

const SLEEP_TIME = 30000;

//The seed is the amount of bitcoin that will be bought and sold continuously
const SEED_BTC_AMOUNT = 0.001;

//Minimum increase over the average price to allow a purchase of bitcoin
const MINIMUM_PRICE_INCREMENT = 0.01;

//Profit percentage selling 1 bitcoin
const PROFIT_PERCENTAGE = 0.1; 

/*If the difference between the current price of bitcoin and the price of a
limit buy order reaches this amount, the limit buy order will be canceled*/
const CANCEL_BUY_ORDER_THRESHOLD = 0.01;

let bidPrice = null;
let averagePrice = null;

let lastBuyOrderPrice = null;

let eurAvailable = 0;
let eurBalance = 0;

let btcAvailable = 0;
let btcBalance = 0;

let numberOfCyclesCompleted = 0;

let estimatedProfit = 0;

let authenticatedClient = null;
let publicClient = null;

//Callbacks

const cancelOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    lastBuyOrderPrice = null;
}

const sellPreviousPurchaseCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        estimatedProfit = estimatedProfit + SEED_BTC_AMOUNT * (data.price - lastBuyOrderPrice);
        averagePrice = lastBuyOrderPrice;
        lastBuyOrderPrice = null;
        numberOfCyclesCompleted++;
 	}

    return console.log(data);
}

const buyOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        const buyPrice = parseFloat(data.price);

        if ((lastBuyOrderPrice===null) || (lastBuyOrderPrice<buyPrice))
            lastBuyOrderPrice = buyPrice;
    }

    return console.log(data);
}

const getOrdersCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (Symbol.iterator in Object(data)))
    {
        for(let item of data)
        { 
            const orderPrice = parseFloat(item.price);
            const priceDifference = parseInt(Math.abs(orderPrice - bidPrice) * 100) / 100;
      
	        if ((item.product_id===CURRENCY_PAIR) && (item.side==='buy') && (priceDifference>=CANCEL_BUY_ORDER_THRESHOLD))
            {
	            console.log("\n[INFO] Canceling buy order (order price: " + orderPrice.toFixed(2) + " EUR, bid price: " + bidPrice.toFixed(2) + " EUR)");
		        authenticatedClient.cancelOrder(item.id, cancelOrderCallback);
            }
        }
   
        console.log('');

        const buyPrice = SEED_BTC_AMOUNT * bidPrice;

        if ((eurAvailable>=buyPrice) && (averagePrice!=null) && (lastBuyOrderPrice==null))
            placeBuyOrder();
        else if ((btcAvailable>=SEED_BTC_AMOUNT) && (lastBuyOrderPrice!=null))
            sellPreviousPurchase();
         
        if (averagePrice===null)
            averagePrice = bidPrice;
        else
            averagePrice = (averagePrice*10 + bidPrice) / 11;
    }
}

const getProductTickerCallback = (error, response, data) => 
{
	if (error)
        return console.log(error);

    if (data!=null)
    {
	    bidPrice = parseFloat(data.bid);

        if (averagePrice===null)
            console.log("[BITCOIN TICKER] Now: " + bidPrice.toFixed(2) + " EUR, time: " + data.time);
        else
            console.log("[BITCOIN TICKER] Now: " + bidPrice.toFixed(2) + " EUR, average: " + averagePrice.toFixed(2) + " EUR, time: " + data.time);

        console.log("\n[INFO] Number of cycles completed: " + numberOfCyclesCompleted + ", estimated profit: " + estimatedProfit.toFixed(2) + " EUR");

        authenticatedClient.getOrders(getOrdersCallback);
    }
}

const getAccountsCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (Symbol.iterator in Object(data)))
    {
        for(var item of data)
        {   
	        if (item.currency===EURO_TICKER)
            {
	            eurAvailable = parseInt(item.available);
	            eurBalance = parseInt(item.balance);
            }
	        else if (item.currency===BITCOIN_TICKER)
            {
		        btcAvailable = parseFloat(item.available);
                btcBalance = parseFloat(item.balance);
            }
        }
   
        console.log("[EURO WALLET] Available: " + eurAvailable + " EUR, Balance: " + eurBalance + " EUR");
        console.log("[BITCOIN WALLET] Available: " + btcAvailable.toFixed(8) + " BTC, Balance: " + btcBalance.toFixed(8) + " BTC\n");

        publicClient.getProductTicker(CURRENCY_PAIR, getProductTickerCallback);
    }
}

//Functions

function placeBuyOrder() 
{
    const priceIncrement = bidPrice - averagePrice;

    if (priceIncrement>=MINIMUM_PRICE_INCREMENT)
    {
        const buyPrice = bidPrice;
        const buySize = SEED_BTC_AMOUNT;

        const buyParams = 
	    {
            'price': buyPrice.toFixed(2),
            'size': buySize.toFixed(8),
            'product_id': CURRENCY_PAIR,
            'post_only': true
		};

        console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Price: " + buyPrice.toFixed(2) + " EUR, size: " + buySize.toFixed(8) + " BTC");

        authenticatedClient.buy(buyParams, buyOrderCallback);
    }
}

function sellPreviousPurchase() 
{
    let sellPrice;

    const priceMultiplier = (100.0 + PROFIT_PERCENTAGE) / 100.0;
    
    if (lastBuyOrderPrice<bidPrice)
        sellPrice = bidPrice * priceMultiplier;
    else
        sellPrice = lastBuyOrderPrice * priceMultiplier;

    const sellSize = btcAvailable;

    const sellParams = 
    {
        'price': sellPrice.toFixed(2),
        'size': sellSize.toFixed(8),
        'product_id': CURRENCY_PAIR,
        'post_only': true,
    };

    console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(2) + " EUR, size: " + sellSize.toFixed(8) + " BTC"); 

    authenticatedClient.sell(sellParams, sellPreviousPurchaseCallback);
}

//Main logic

console.log("\n");
console.log("          __________  ___   _  __    ______               ___");
console.log("         / ____/ __ \\/   | | |/ /   /_  __/________ _____/ (_)___  ____ _");
console.log("        / / __/ / / / /| | |   /     / / / ___/ __ `/ __  / / __ \\/ __ `/");
console.log("       / /_/ / /_/ / ___ |/   |     / / / /  / /_/ / /_/ / / / / / /_/ / ");
console.log("       \\____/_____/_/  |_/_/|_|    /_/ /_/   \\__,_/\\__,_/_/_/ /_/\\__, /");
console.log("                                                                /____/");   
console.log("                                  ____        __");
console.log("                                 / __ )____  / /_");
console.log("                                / __  / __ \\/ __/");
console.log("                               / /_/ / /_/ / /_ ");
console.log("                              /_____/\\____/\\__/   " + APP_VERSION);

console.log("\n\n\n\n                    \"The Revolution Will Be Decentralized\"");

console.log("\n\n\n\nConnecting to GDAX in " + parseInt(SLEEP_TIME/1000) + " seconds ..."); 

setInterval(() => 
{
    console.log('\n\n');

    bidPrice = null;

    eurAvailable = 0;
    eurBalance = 0;

    btcAvailable = 0;
    btcBalance = 0;

    publicClient = new GdaxModule.PublicClient(GDAX_URI); 
    authenticatedClient = new GdaxModule.AuthenticatedClient(KEY, SECRET, PASSPHRASE, GDAX_URI);

    //Get the balance of the wallets and execute the trading strategy
    authenticatedClient.getAccounts(getAccountsCallback);

}, SLEEP_TIME);


