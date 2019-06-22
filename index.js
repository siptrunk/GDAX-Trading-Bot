#!/usr/bin/env node

/*
 ============================================================================
 Name        : GDAX Trading Bot
 Author      : Kenshiro
 Version     : 7.00
 Copyright   : GNU General Public License (GPLv3)
 Description : Trading bot for the Coinbase Pro exchange
 ============================================================================
 */

const APP_VERSION = "v7.00";

const GdaxModule = require('gdax');

const PASSPHRASE = process.env.TRADING_BOT_PASSPHRASE || '';
const KEY = process.env.TRADING_BOT_KEY || '';
const SECRET = process.env.TRADING_BOT_SECRET || '';

const GDAX_URI = 'https://api.pro.coinbase.com';

const LTC_BTC_CURRENCY_PAIR = 'LTC-BTC';
const ETH_BTC_CURRENCY_PAIR = 'ETH-BTC';

const BITCOIN_TICKER = 'BTC';
const LITECOIN_TICKER = 'LTC';
const ETHEREUM_TICKER = 'ETH';

const SLEEP_TIME = 30000;

// The seed is the amount of coins that the program will trade continuously
const SEED_LTC_AMOUNT = 1.0;
const SEED_ETH_AMOUNT = 1.0;

// Profit percentage trading a seed
const PROFIT_PERCENTAGE = 1.0; 

const MINIMUM_BUY_PRICE_MULTIPLIER = 100.3 / 100.0;

const SELL_PRICE_MULTIPLIER = (100.0 + PROFIT_PERCENTAGE) / 100.0;

let askPriceLTC = null;
let bidPriceLTC = null;
let averagePriceLTC = null;
let lastBuyOrderPriceLTC = null;

let askPriceETH = null;
let bidPriceETH = null;
let averagePriceETH = null;
let lastBuyOrderPriceETH = null;

let btcAvailable = 0;
let btcBalance = 0;

let ltcAvailable = 0;
let ltcBalance = 0;

let ethAvailable = 0;
let ethBalance = 0;

let numberOfCyclesCompleted = 0;

let estimatedProfit = 0;

let authenticatedClient = null;
let publicClient = null;

// Callbacks

const cancelBuyOrderCallbackLTC = (error, response, data) => 
{
    if (error)
        return console.log(error);

    lastBuyOrderPriceLTC = null;
}

const cancelBuyOrderCallbackETH = (error, response, data) => 
{
    if (error)
        return console.log(error);

    lastBuyOrderPriceETH = null;
}

const buyOrderCallbackLTC = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        const buyPrice = parseFloat(data.price);

        if ((lastBuyOrderPriceLTC===null) || (buyPrice>lastBuyOrderPriceLTC))
            lastBuyOrderPriceLTC = buyPrice;
    }

    return console.log(data);
}

const buyOrderCallbackETH = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        const buyPrice = parseFloat(data.price);

        if ((lastBuyOrderPriceETH===null) || (buyPrice>lastBuyOrderPriceETH))
            lastBuyOrderPriceETH = buyPrice;
    }

    return console.log(data);
}


const sellOrderCallbackLTC = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        estimatedProfit = estimatedProfit + SEED_LTC_AMOUNT * (parseFloat(data.price) - lastBuyOrderPriceLTC);
        averagePriceLTC = lastBuyOrderPriceLTC;        
        lastBuyOrderPriceLTC = null;
        numberOfCyclesCompleted++;
 	}

    return console.log(data);
}

const sellOrderCallbackETH = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        estimatedProfit = estimatedProfit + SEED_ETH_AMOUNT * (parseFloat(data.price) - lastBuyOrderPriceETH);
        averagePriceETH = lastBuyOrderPriceETH;        
        lastBuyOrderPriceETH = null;
        numberOfCyclesCompleted++;
 	}

    return console.log(data);
}

const getOrdersCallbackLTC = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (Symbol.iterator in Object(data)))
    {
        for(let item of data)
        { 
            const orderPrice = parseFloat(item.price);
            
	        if ((item.product_id===LTC_BTC_CURRENCY_PAIR) && (item.side==='buy') && (orderPrice!=bidPriceLTC))
            {
	            console.log("\n[INFO] Canceling Litecoin buy order (order price: " + orderPrice.toFixed(6) + " BTC)");
                authenticatedClient.cancelOrder(item.id, cancelBuyOrderCallbackLTC);
            }
		}
   
        const buyPrice = bidPriceLTC * SEED_LTC_AMOUNT;

        if ((btcAvailable>=buyPrice) && (averagePriceLTC!=null) && (lastBuyOrderPriceLTC===null))
            placeBuyOrderLTC();
        else if ((ltcAvailable>=SEED_LTC_AMOUNT) && (lastBuyOrderPriceLTC!=null))
            placeSellOrderLTC();
         
        if (averagePriceLTC===null)
            averagePriceLTC = bidPriceLTC;
        else
            averagePriceLTC = (averagePriceLTC * 1000 + bidPriceLTC) / 1001;
	}
}

const getOrdersCallbackETH = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (Symbol.iterator in Object(data)))
    {
        for(let item of data)
        { 
            const orderPrice = parseFloat(item.price);
            
	        if ((item.product_id===ETH_BTC_CURRENCY_PAIR) && (item.side==='buy') && (orderPrice!=bidPriceETH))
            {
	            console.log("\n[INFO] Canceling Ethereum buy order (order price: " + orderPrice.toFixed(6) + " BTC)");
                authenticatedClient.cancelOrder(item.id, cancelBuyOrderCallbackETH);
            }
        }
   
        const buyPrice = bidPriceETH * SEED_ETH_AMOUNT;

        if ((btcAvailable>=buyPrice) && (averagePriceETH!=null) && (lastBuyOrderPriceETH===null))
            setTimeout(()=>placeBuyOrderETH(), 5000);
        else if ((ethAvailable>=SEED_ETH_AMOUNT) && (lastBuyOrderPriceETH!=null))
            setTimeout(()=>placeSellOrderETH(), 5000);
         
        if (averagePriceETH===null)
            averagePriceETH = bidPriceETH;
        else
            averagePriceETH = (averagePriceETH * 1000 + bidPriceETH) / 1001;
	}
}

const getProductTickerCallbackLTC = (error, response, data) => 
{
	if (error)
        return console.log(error);

    if (data!=null)
    {
	    askPriceLTC = parseFloat(data.ask);
        bidPriceLTC = parseFloat(data.bid);

        if (averagePriceLTC===null)
            console.log("[LITECOIN TICKER] Now: " + bidPriceLTC.toFixed(6) + " BTC, time: " + data.time);
        else
            console.log("[LITECOIN TICKER] Now: " + bidPriceLTC.toFixed(6) + " BTC, average: " + averagePriceLTC.toFixed(6) + " BTC, time: " + data.time);

        authenticatedClient.getOrders(getOrdersCallbackLTC);
    }
}

const getProductTickerCallbackETH= (error, response, data) => 
{
	if (error)
        return console.log(error);

    if (data!=null)
    {
	    askPriceETH = parseFloat(data.ask);
        bidPriceETH = parseFloat(data.bid);

        if (averagePriceETH==null)
            console.log("[ETHEREUM TICKER] Now: " + bidPriceETH.toFixed(6) + " BTC, time: " + data.time);
        else
            console.log("[ETHEREUM TICKER] Now: " + bidPriceETH.toFixed(6) + " BTC, average: " + averagePriceETH.toFixed(6) + " BTC, time: " + data.time);

        authenticatedClient.getOrders(getOrdersCallbackETH);
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
			else if (item.currency===ETHEREUM_TICKER)
            {
	            ethAvailable = parseFloat(item.available);
	            ethBalance = parseFloat(item.balance);
            }
        }
   
        console.log("[BITCOIN  WALLET] Available: " + btcAvailable.toFixed(8) + " BTC, Balance: " + btcBalance.toFixed(8) + " BTC");
        console.log("[LITECOIN WALLET] Available: " + ltcAvailable.toFixed(8) + " LTC, Balance: " + ltcBalance.toFixed(8) + " LTC");
		console.log("[ETHEREUM WALLET] Available: " + ethAvailable.toFixed(8) + " ETH, Balance: " + ethBalance.toFixed(8) + " ETH\n");

        publicClient.getProductTicker(LTC_BTC_CURRENCY_PAIR, getProductTickerCallbackLTC);
		
		publicClient.getProductTicker(ETH_BTC_CURRENCY_PAIR, getProductTickerCallbackETH);

		console.log("\n[INFO] Number of cycles completed: " + numberOfCyclesCompleted + ", estimated profit: " + estimatedProfit.toFixed(8) + " BTC");
    }
}

// Functions

function placeBuyOrderLTC() 
{
    const minimumBuyPrice = averagePriceLTC * MINIMUM_BUY_PRICE_MULTIPLIER;

    if (bidPriceLTC>=minimumBuyPrice)
    {
        const buyPrice = bidPriceLTC;
        const buySize = SEED_LTC_AMOUNT;

        const buyParams = 
	    {
            'price': buyPrice.toFixed(6),
            'size': buySize.toFixed(8),
            'product_id': LTC_BTC_CURRENCY_PAIR,
            'post_only': true
		};

		console.log("\n");
		console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Price: " + buyPrice.toFixed(6) + " BTC, size: " + buySize.toFixed(8) + " LTC");

        authenticatedClient.buy(buyParams, buyOrderCallbackLTC);
    }
}

function placeBuyOrderETH() 
{
    const minimumBuyPrice = averagePriceETH * MINIMUM_BUY_PRICE_MULTIPLIER;

    if (bidPriceETH>=minimumBuyPrice)
    {
        const buyPrice = bidPriceETH;
        const buySize = SEED_ETH_AMOUNT;

        const buyParams = 
	    {
            'price': buyPrice.toFixed(6),
            'size': buySize.toFixed(8),
            'product_id': ETH_BTC_CURRENCY_PAIR,
            'post_only': true
		};

		console.log("\n");
		console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Price: " + buyPrice.toFixed(6) + " BTC, size: " + buySize.toFixed(8) + " ETH");

        authenticatedClient.buy(buyParams, buyOrderCallbackETH);
    }
}

function placeSellOrderLTC() 
{
    let sellPrice;

    if (askPriceLTC>lastBuyOrderPriceLTC)
        sellPrice = askPriceLTC * SELL_PRICE_MULTIPLIER;
    else
        sellPrice = lastBuyOrderPriceLTC * SELL_PRICE_MULTIPLIER;

    const sellSize = ltcAvailable - 0.000000001;

    const sellParams = 
    {
        'price': sellPrice.toFixed(6),
        'size': sellSize.toFixed(8),
        'product_id': LTC_BTC_CURRENCY_PAIR,
        'post_only': true,
    };

	console.log("\n");
	console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(6) + " BTC, size: " + sellSize.toFixed(8) + " LTC"); 

    authenticatedClient.sell(sellParams, sellOrderCallbackLTC);
}

function placeSellOrderETH() 
{
    let sellPrice;

    if (askPriceETH>lastBuyOrderPriceETH)
        sellPrice = askPriceETH * SELL_PRICE_MULTIPLIER;
    else
        sellPrice = lastBuyOrderPriceETH * SELL_PRICE_MULTIPLIER;

    const sellSize = ethAvailable - 0.000000001;

    const sellParams = 
    {
        'price': sellPrice.toFixed(5),
        'size': sellSize.toFixed(8),
        'product_id': ETH_BTC_CURRENCY_PAIR,
        'post_only': true,
    };

	console.log("\n");
	console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(5) + " BTC, size: " + sellSize.toFixed(8) + " ETH"); 

    authenticatedClient.sell(sellParams, sellOrderCallbackETH);
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

    askPriceLTC = null;
    bidPriceLTC = null;

	askPriceETH = null;
    bidPriceETH = null;

    btcAvailable = 0;
    btcBalance = 0;

    ltcAvailable = 0;
    ltcBalance = 0;

    ethAvailable = 0;
    ethBalance = 0;

    publicClient = new GdaxModule.PublicClient(GDAX_URI); 
    authenticatedClient = new GdaxModule.AuthenticatedClient(KEY, SECRET, PASSPHRASE, GDAX_URI);

    // Get the balance of the wallets and execute the trading strategy
    authenticatedClient.getAccounts(getAccountsCallback);

}, SLEEP_TIME);


