#!/usr/bin/env node

/*
 ============================================================================
 Name        : GDAX Trading Bot
 Author      : Kenshiro
 Version     : 5.04
 Copyright   : GNU General Public License (GPLv3)
 Description : Trading bot for the Coinbase Pro exchange
 ============================================================================
 */

const APP_VERSION = "v5.04";

const GdaxModule = require('gdax');

const PASSPHRASE = process.env.TRADING_BOT_PASSPHRASE || '';
const KEY = process.env.TRADING_BOT_KEY || '';
const SECRET = process.env.TRADING_BOT_SECRET || '';

const GDAX_URI = 'https://api.pro.coinbase.com';

const CURRENCY_PAIR = 'LTC-BTC';

const BITCOIN_TICKER = 'BTC';
const LITECOIN_TICKER = 'LTC';

const SLEEP_TIME = 30000;

// The seed is the amount of litecoins that the program will trade continuously
const SEED_LTC_AMOUNT = 1.0;

// Profit percentage trading a seed
const PROFIT_PERCENTAGE = 1.0; 

const MINIMUM_BUY_PRICE_MULTIPLIER = 100.3 / 100.0;

const SELL_PRICE_MULTIPLIER = (100.0 + PROFIT_PERCENTAGE) / 100.0;

let askPrice = null;
let bidPrice = null;
let averagePrice = null;

let lastBuyOrderPrice = null;

let btcAvailable = 0;
let btcBalance = 0;

let ltcAvailable = 0;
let ltcBalance = 0;

let numberOfCyclesCompleted = 0;

let estimatedProfit = 0;

let authenticatedClient = null;
let publicClient = null;

// Callbacks

const cancelBuyOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    lastBuyOrderPrice = null;
}

const buyOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        const buyPrice = parseFloat(data.price);

        if ((lastBuyOrderPrice===null) || (buyPrice>lastBuyOrderPrice))
            lastBuyOrderPrice = buyPrice;
    }

    return console.log(data);
}

const sellOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        estimatedProfit = estimatedProfit + SEED_LTC_AMOUNT * (parseFloat(data.price) - lastBuyOrderPrice);
        averagePrice = lastBuyOrderPrice;        
        lastBuyOrderPrice = null;
        numberOfCyclesCompleted++;
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
            
	        if ((item.product_id===CURRENCY_PAIR) && (item.side==='buy') && (orderPrice!=bidPrice))
            {
	            console.log("\n[INFO] Canceling buy order (order price: " + orderPrice.toFixed(6) + " BTC)");
                authenticatedClient.cancelOrder(item.id, cancelBuyOrderCallback);
            }
        }
   
        console.log('');

        const buyPrice = bidPrice * SEED_LTC_AMOUNT;

        if ((btcAvailable>=buyPrice) && (averagePrice!=null) && (lastBuyOrderPrice===null))
            placeBuyOrder();
        else if ((ltcAvailable>=SEED_LTC_AMOUNT) && (lastBuyOrderPrice!=null))
            placeSellOrder();
         
        if (averagePrice===null)
            averagePrice = bidPrice;
        else
            averagePrice = (averagePrice * 1000 + bidPrice) / 1001;
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
            console.log("[LITECOIN TICKER] Now: " + bidPrice.toFixed(6) + " BTC, time: " + data.time);
        else
            console.log("[LITECOIN TICKER] Now: " + bidPrice.toFixed(6) + " BTC, average: " + averagePrice.toFixed(6) + " BTC, time: " + data.time);

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
            else if (item.currency===LITECOIN_TICKER)
            {
	            ltcAvailable = parseFloat(item.available);
	            ltcBalance = parseFloat(item.balance);
            }
        }
   
        console.log("[BITCOIN WALLET] Available: " + btcAvailable.toFixed(8) + " BTC, Balance: " + btcBalance.toFixed(8) + " BTC");
        console.log("[LITECOIN WALLET] Available: " + ltcAvailable.toFixed(8) + " LTC, Balance: " + ltcBalance.toFixed(8) + " LTC\n");

        publicClient.getProductTicker(CURRENCY_PAIR, getProductTickerCallback);
    }
}

// Functions

function placeBuyOrder() 
{
    const minimumBuyPrice = averagePrice * MINIMUM_BUY_PRICE_MULTIPLIER;

    if (bidPrice>=minimumBuyPrice)
    {
        const buyPrice = bidPrice;
        const buySize = SEED_LTC_AMOUNT;

        const buyParams = 
	    {
            'price': buyPrice.toFixed(6),
            'size': buySize.toFixed(8),
            'product_id': CURRENCY_PAIR,
            'post_only': true
		};

        console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Price: " + buyPrice.toFixed(6) + " BTC, size: " + buySize.toFixed(8) + " LTC");

        authenticatedClient.buy(buyParams, buyOrderCallback);
    }
}

function placeSellOrder() 
{
    let sellPrice;

    if (askPrice>lastBuyOrderPrice)
        sellPrice = askPrice * SELL_PRICE_MULTIPLIER;
    else
        sellPrice = lastBuyOrderPrice * SELL_PRICE_MULTIPLIER;

    const sellSize = ltcAvailable - 0.000000001;

    const sellParams = 
    {
        'price': sellPrice.toFixed(6),
        'size': sellSize.toFixed(8),
        'product_id': CURRENCY_PAIR,
        'post_only': true,
    };

    console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(6) + " BTC, size: " + sellSize.toFixed(8) + " LTC"); 

    authenticatedClient.sell(sellParams, sellOrderCallback);
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

console.log("\n\n\n\nConnecting to Coinbase Pro in " + parseInt(SLEEP_TIME/1000) + " seconds ..."); 

setInterval(() => 
{
    console.log('\n\n');

    askPrice = null;
    bidPrice = null;

    btcAvailable = 0;
    btcBalance = 0;

    ltcAvailable = 0;
    ltcBalance = 0;

    publicClient = new GdaxModule.PublicClient(GDAX_URI); 
    authenticatedClient = new GdaxModule.AuthenticatedClient(KEY, SECRET, PASSPHRASE, GDAX_URI);

    // Get the balance of the wallets and execute the trading strategy
    authenticatedClient.getAccounts(getAccountsCallback);

}, SLEEP_TIME);


