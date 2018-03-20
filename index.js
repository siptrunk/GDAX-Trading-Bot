/*
 ============================================================================
 Name        : GDAX Trading Bot
 Author      : Kenshiro
 Version     : 4.04
 Copyright   : GNU General Public License (GPLv3)
 Description : Trading bot for GDAX exchange
 ============================================================================
 */

const APP_VERSION = "v4.04";

const GdaxModule = require('gdax');

const PASSPHRASE = process.env.TRADING_BOT_PASSPHRASE;
const KEY = process.env.TRADING_BOT_KEY;
const SECRET = process.env.TRADING_BOT_SECRET;

const GDAX_URI = 'https://api.gdax.com';

const CURRENCY_PAIR = 'BTC-EUR';

const EURO_TICKER = 'EUR';
const BITCOIN_TICKER = 'BTC';

const SLEEP_TIME = 30000;

// The seed is the amount of bitcoins that the program will trade continuously
const SEED_BTC_AMOUNT = 0.03;

// Profit percentage trading a seed
const PROFIT_PERCENTAGE = 0.25; 

const MINIMUM_SELL_PRICE_MULTIPLIER = 99.7 / 100.0;

/* If the difference between the current price of bitcoin and the price of a
 * limit sell order reaches this amount, the limit sell order will be canceled */
const CANCEL_SELL_ORDER_THRESHOLD = 0.01;

let askPrice = null;
let bidPrice = null;
let averagePrice = null;

let lastSellOrderPrice = null;

let eurAvailable = 0;
let eurBalance = 0;

let btcAvailable = 0;
let btcBalance = 0;

let numberOfCyclesCompleted = 0;

let estimatedProfit = 0;
let lastFilledSize = 0;

let authenticatedClient = null;
let publicClient = null;

// Callbacks

const cancelOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    lastSellOrderPrice = null;

    estimatedProfit = estimatedProfit - lastFilledSize;
}

const buyOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        estimatedProfit = estimatedProfit + parseFloat(data.size) - SEED_BTC_AMOUNT;
        averagePrice = lastSellOrderPrice;        
        lastSellOrderPrice = null;
        numberOfCyclesCompleted++;
 	}

    return console.log(data);
}

const sellOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        const sellPrice = parseFloat(data.price);

        if ((lastSellOrderPrice===null) || (sellPrice<lastSellOrderPrice))
            lastSellOrderPrice = sellPrice;
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
            const priceDifference = parseInt(Math.abs(orderPrice - askPrice) * 100) / 100;
      
	        if ((item.product_id===CURRENCY_PAIR) && (item.side==='sell') && (priceDifference>=CANCEL_SELL_ORDER_THRESHOLD))
            {
	            console.log("\n[INFO] Canceling sell order (order price: " + orderPrice.toFixed(2) + " EUR)");
                lastFilledSize = parseFloat(item.filled_size);
		        authenticatedClient.cancelOrder(item.id, cancelOrderCallback);
            }
        }
   
        console.log('');

        const saleAmount = lastSellOrderPrice * SEED_BTC_AMOUNT - 0.01;

        if ((btcAvailable>=SEED_BTC_AMOUNT) && (averagePrice!=null) && (lastSellOrderPrice===null))
            placeSellOrder();
        else if ((eurAvailable>=saleAmount) && (lastSellOrderPrice!=null))
            placeBuyOrder();
         
        if (averagePrice===null)
            averagePrice = askPrice;
        else
            averagePrice = (averagePrice*10 + askPrice) / 11;
    }
}

const getProductTickerCallback = (error, response, data) => 
{
	if (error)
        return console.log(error);

    if (data!=null)
    {
	    askPrice = parseFloat(data.ask);
        bidPrice = parseFloat(data.bid);

        if (averagePrice===null)
            console.log("[BITCOIN TICKER] Now: " + askPrice.toFixed(2) + " EUR, time: " + data.time);
        else
            console.log("[BITCOIN TICKER] Now: " + askPrice.toFixed(2) + " EUR, average: " + averagePrice.toFixed(2) + " EUR, time: " + data.time);

        console.log("\n[INFO] Number of cycles completed: " + numberOfCyclesCompleted + ", estimated profit: " + estimatedProfit.toFixed(8) + " BTC");

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
	        if (item.currency===BITCOIN_TICKER)
            {
		        btcAvailable = parseFloat(item.available);
                btcBalance = parseFloat(item.balance);
            }
            else if (item.currency===EURO_TICKER)
            {
	            eurAvailable = parseFloat(item.available);
	            eurBalance = parseFloat(item.balance);
            }
        }
   
        console.log("[BITCOIN WALLET] Available: " + btcAvailable.toFixed(8) + " BTC, Balance: " + btcBalance.toFixed(8) + " BTC");
        console.log("[EURO WALLET] Available: " + eurAvailable.toFixed(2) + " EUR, Balance: " + eurBalance.toFixed(2) + " EUR\n");

        publicClient.getProductTicker(CURRENCY_PAIR, getProductTickerCallback);
    }
}

// Functions

function placeSellOrder() 
{
    const minimumSellPrice = averagePrice * MINIMUM_SELL_PRICE_MULTIPLIER;

    if (askPrice<=minimumSellPrice)
    {
        const sellPrice = askPrice;
        const sellSize = SEED_BTC_AMOUNT;

        const sellParams = 
	    {
            'price': sellPrice.toFixed(2),
            'size': sellSize.toFixed(8),
            'product_id': CURRENCY_PAIR,
            'post_only': true
		};

        console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(2) + " EUR, size: " + sellSize.toFixed(8) + " BTC");

        authenticatedClient.sell(sellParams, sellOrderCallback);
    }
}

function placeBuyOrder() 
{
    let buyPrice;

    const priceMultiplier = (100.0 - PROFIT_PERCENTAGE) / 100.0;
    
    if (bidPrice<lastSellOrderPrice)
        buyPrice = bidPrice * priceMultiplier;
    else
        buyPrice = lastSellOrderPrice * priceMultiplier;

    const buySize = (eurAvailable - 0.01) / buyPrice;

    const buyParams = 
    {
        'price': buyPrice.toFixed(2),
        'size': buySize.toFixed(8),
        'product_id': CURRENCY_PAIR,
        'post_only': true,
    };

    console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Price: " + buyPrice.toFixed(2) + " EUR, size: " + buySize.toFixed(8) + " BTC"); 

    authenticatedClient.buy(buyParams, buyOrderCallback);
}

// Main logic

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

    askPrice = null;
    bidPrice = null;

    btcAvailable = 0;
    btcBalance = 0;

    eurAvailable = 0;
    eurBalance = 0;

    publicClient = new GdaxModule.PublicClient(GDAX_URI); 
    authenticatedClient = new GdaxModule.AuthenticatedClient(KEY, SECRET, PASSPHRASE, GDAX_URI);

    // Get the balance of the wallets and execute the trading strategy
    authenticatedClient.getAccounts(getAccountsCallback);

}, SLEEP_TIME);


