#!/usr/bin/env node

/*
 ============================================================================
 Name        : GDAX Trading Bot
 Author      : Kenshiro
 Version     : 7.05
 Copyright   : GNU General Public License (GPLv3)
 Description : Trading bot for the Coinbase Pro exchange
 ============================================================================
 */

const APP_VERSION = "v7.05";

const GdaxModule = require('coinbase-pro');

const PASSPHRASE = process.env.TRADING_BOT_PASSPHRASE || '';
const KEY = process.env.TRADING_BOT_KEY || '';
const SECRET = process.env.TRADING_BOT_SECRET || '';

const GDAX_URI = 'https://api.pro.coinbase.com';

const XTZ_BTC_CURRENCY_PAIR = 'XTZ-BTC';
const ETH_BTC_CURRENCY_PAIR = 'ETH-BTC';

const BITCOIN_TICKER = 'BTC';
const TEZOS_TICKER = 'XTZ';
const ETHEREUM_TICKER = 'ETH';

const SLEEP_TIME = 30000;

// The seed is the amount of coins that the program will trade continuously
const SEED_TEZOS_AMOUNT = 1.0;
const SEED_ETH_AMOUNT = 1.0;

// Profit percentage trading a seed
const PROFIT_PERCENTAGE = 2.0; 

const MINIMUM_BUY_PRICE_MULTIPLIER = 100.5 / 100.0;

const SELL_PRICE_MULTIPLIER = (100.0 + PROFIT_PERCENTAGE) / 100.0;

let askPriceTEZOS = null;
let averagePriceTEZOS = null;
let lastBuyOrderIdTEZOS = null;
let lastBuyOrderPriceTEZOS = null;

let askPriceETH = null;
let averagePriceETH = null;
let lastBuyOrderIdETH = null;
let lastBuyOrderPriceETH = null;

let btcAvailable = 0;
let btcBalance = 0;

let tezosAvailable = 0;
let tezosBalance = 0;

let ethAvailable = 0;
let ethBalance = 0;

let numberOfCyclesCompleted = 0;

let estimatedProfit = 0;

let authenticatedClient = null;
let publicClient = null;

// Callbacks

const buyOrderCallbackTEZOS = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
		lastBuyOrderIdTEZOS = data.id;

    return console.log(data);
}

const buyOrderCallbackETH = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
		lastBuyOrderIdETH = data.id;

    return console.log(data);
}


const sellOrderCallbackTEZOS = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        estimatedProfit = estimatedProfit + SEED_TEZOS_AMOUNT * (parseFloat(data.price) - lastBuyOrderPriceTEZOS);
		averagePriceTEZOS = lastBuyOrderPriceTEZOS;          
		lastBuyOrderPriceTEZOS = null;
		lastBuyOrderIdTEZOS = null;
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
		lastBuyOrderIdETH = null;
        numberOfCyclesCompleted++;
 	}

    return console.log(data);
}

const getProductTickerCallbackTEZOS = (error, response, data) => 
{
	if (error)
        return console.log(error);

    if ((data!=null) && (data.ask!=null) && (data.time!=null))
    {
	    askPriceTEZOS = parseFloat(data.ask);
        
        if (averagePriceTEZOS===null)
            console.log("[TEZOS TICKER] Now: " + askPriceTEZOS.toFixed(6) + " BTC, time: " + data.time);
        else
            console.log("[TEZOS TICKER] Now: " + askPriceTEZOS.toFixed(6) + " BTC, average: " + averagePriceTEZOS.toFixed(6) + " BTC, time: " + data.time);

		const buyPrice = askPriceTEZOS * SEED_TEZOS_AMOUNT;

        if ((btcAvailable>=buyPrice) && (averagePriceTEZOS!=null) && (lastBuyOrderIdTEZOS===null))
            placeBuyOrderTEZOS();
        else if ((tezosAvailable>=SEED_TEZOS_AMOUNT) && (lastBuyOrderIdTEZOS!=null))
            placeSellOrderTEZOS();
         
        if (averagePriceTEZOS===null)
            averagePriceTEZOS = askPriceTEZOS;
        else
            averagePriceTEZOS = (averagePriceTEZOS * 1000 + askPriceTEZOS) / 1001;
	
		setTimeout(()=>publicClient.getProductTicker(ETH_BTC_CURRENCY_PAIR, getProductTickerCallbackETH), 10000);
    }
}

const getProductTickerCallbackETH= (error, response, data) => 
{
	if (error)
        return console.log(error);

    if ((data!=null) && (data.ask!=null) && (data.time!=null))
    {
	    askPriceETH = parseFloat(data.ask);
       
        if (averagePriceETH==null)
            console.log("\n[ETHER TICKER] Now: " + askPriceETH.toFixed(6) + " BTC, time: " + data.time);
        else
            console.log("\n[ETHER TICKER] Now: " + askPriceETH.toFixed(6) + " BTC, average: " + averagePriceETH.toFixed(6) + " BTC, time: " + data.time);
		
		const buyPrice = askPriceETH * SEED_ETH_AMOUNT;

        if ((btcAvailable>=buyPrice) && (averagePriceETH!=null) && (lastBuyOrderIdETH===null))
            placeBuyOrderETH();
        else if ((ethAvailable>=SEED_ETH_AMOUNT) && (lastBuyOrderIdETH!=null))
            placeSellOrderETH();
         
        if (averagePriceETH===null)
            averagePriceETH = askPriceETH;
        else
            averagePriceETH = (averagePriceETH * 1000 + askPriceETH) / 1001;
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
            else if (item.currency===TEZOS_TICKER)
            {
	            tezosAvailable = parseFloat(item.available);
	            tezosBalance = parseFloat(item.balance);
            }
			else if (item.currency===ETHEREUM_TICKER)
            {
	            ethAvailable = parseFloat(item.available);
	            ethBalance = parseFloat(item.balance);
            }
        }
   
        console.log("[BITCOIN WALLET] Available: " + btcAvailable.toFixed(8) + " BTC,  Balance: " + btcBalance.toFixed(8) + " BTC");
        console.log("[TEZOS WALLET] Available: " + tezosAvailable.toFixed(8) + " XTZ, Balance: " + tezosBalance.toFixed(8) + " XTZ");
		console.log("[ETHER   WALLET] Available: " + ethAvailable.toFixed(8) + " ETH,  Balance: " + ethBalance.toFixed(8) + " ETH\n");

		console.log("[INFO] Number of cycles completed: " + numberOfCyclesCompleted + ", estimated profit: " + estimatedProfit.toFixed(8) + " BTC\n");

        publicClient.getProductTicker(XTZ_BTC_CURRENCY_PAIR, getProductTickerCallbackTEZOS);
    }
}

const getFilledPriceCallbackTEZOS = (error, response, data) =>  
{
	if (error)
        return console.log(error);

	if ((Array.isArray(data)) && (data.length >= 1))
	{
		lastBuyOrderPriceTEZOS = parseFloat(data[0].price);

		let highestPrice;
	
		if (askPriceTEZOS>lastBuyOrderPriceTEZOS)
		    highestPrice = askPriceTEZOS;
		else
		    highestPrice = lastBuyOrderPriceTEZOS;

		const sellPrice = highestPrice * SELL_PRICE_MULTIPLIER;

		const sellSize = tezosAvailable - 0.005;

		const sellParams = 
		{
		    'price': sellPrice.toFixed(6),
		    'size': sellSize.toFixed(3),
		    'product_id': XTZ_BTC_CURRENCY_PAIR,
		    'post_only': true,
		};

		console.log("");
		console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(6) + " BTC, size: " + sellSize.toFixed(2) + " XTZ"); 

		setTimeout(()=>authenticatedClient.sell(sellParams, sellOrderCallbackTEZOS), 3000);
	}

	return console.log(data);
}

const getFilledPriceCallbackETH = (error, response, data) =>  
{
	if (error)
        return console.log(error);

	if ((Array.isArray(data)) && (data.length >= 1))
	{
		lastBuyOrderPriceETH = parseFloat(data[0].price);

		let highestPrice;
	
		if (askPriceETH>lastBuyOrderPriceETH)
		    highestPrice = askPriceETH;
		else
		    highestPrice = lastBuyOrderPriceETH;

		const sellPrice = highestPrice * SELL_PRICE_MULTIPLIER;

		const sellSize = ethAvailable - 0.000000001;

		const sellParams = 
		{
		    'price': sellPrice.toFixed(5),
		    'size': sellSize.toFixed(8),
		    'product_id': ETH_BTC_CURRENCY_PAIR,
		    'post_only': true,
		};

		console.log("");
		console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(6) + " BTC, size: " + sellSize.toFixed(2) + " ETH"); 

		setTimeout(()=>authenticatedClient.sell(sellParams, sellOrderCallbackETH), 3000);
	}

	return console.log(data);
}

// Functions

function placeBuyOrderTEZOS() 
{
    const minimumBuyPrice = averagePriceTEZOS * MINIMUM_BUY_PRICE_MULTIPLIER;

    if (askPriceTEZOS>=minimumBuyPrice)
    {
        const buySize = SEED_TEZOS_AMOUNT;

        const buyParams = 
	    {
            'size': buySize.toFixed(2),
            'product_id': XTZ_BTC_CURRENCY_PAIR,
            'type': 'market'
		};

		console.log("");
		console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Size: " + buySize.toFixed(2) + " XTZ");

        authenticatedClient.buy(buyParams, buyOrderCallbackTEZOS);
    }
}

function placeBuyOrderETH() 
{
    const minimumBuyPrice = averagePriceETH * MINIMUM_BUY_PRICE_MULTIPLIER;

    if (askPriceETH>=minimumBuyPrice)
    {
        const buySize = SEED_ETH_AMOUNT;

        const buyParams = 
	    {
            'size': buySize.toFixed(8),
            'product_id': ETH_BTC_CURRENCY_PAIR,
            'type': 'market'
		};

		console.log("");
		console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Size: " + buySize.toFixed(2) + " ETH");

        authenticatedClient.buy(buyParams, buyOrderCallbackETH);
    }
}

function placeSellOrderTEZOS()
{
	const params = 
	{
    	order_id: lastBuyOrderIdTEZOS
	};

	authenticatedClient.getFills(params, getFilledPriceCallbackTEZOS);
}

function placeSellOrderETH()
{
	const params = 
	{
    	order_id: lastBuyOrderIdETH
	};

	authenticatedClient.getFills(params, getFilledPriceCallbackETH);
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

    askPriceTEZOS = null;
	askPriceETH = null;
    
    btcAvailable = 0;
    btcBalance = 0;

    tezosAvailable = 0;
    tezosBalance = 0;

    ethAvailable = 0;
    ethBalance = 0;

    publicClient = new GdaxModule.PublicClient(GDAX_URI); 
    authenticatedClient = new GdaxModule.AuthenticatedClient(KEY, SECRET, PASSPHRASE, GDAX_URI);

    // Get the balance of the wallets and execute the trading strategy
    authenticatedClient.getAccounts(getAccountsCallback);

}, SLEEP_TIME);


