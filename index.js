/*
 ============================================================================
 Name        : GDAX Trading Bot
 Author      : Kenshiro
 Version     : 1.00
 Copyright   : GNU General Public License (GPLv3)
 Description : Trading bot for GDAX exchange
 ============================================================================
 */

const GdaxModule = require('gdax');

const PASSPHRASE = process.env.TRADING_BOT_PASSPHRASE;
const KEY = process.env.TRADING_BOT_KEY;
const SECRET = process.env.TRADING_BOT_SECRET;

const GDAX_URI = 'https://api.gdax.com';

const CURRENCY_PAIR = 'ETH-BTC';

const SLEEP_TIME = 30000;

//Minimum balance of the bitcoin wallet to allow a purchase of ethereum
const MINIMUM_BTC_BALANCE = 0.001;

//The seed is the amount of ethereum that will be bought and sold continuously
const SEED_ETH_AMOUNT = 0.5;

//Minimum increase over the average price to allow a purchase of ethereum
const MINIMUM_PRICE_INCREMENT = 0.00001;

//Minimum expected gain of bitcoins selling 1 ethereum
const MINIMUM_SELL_PROFIT = 0.0002; 

/*If the difference between the current price of ethereum and the price of the
purchase order reaches this amount, the purchase order will be canceled*/
const CANCEL_BUY_ORDER_THRESHOLD = 0.00001;

let currentPrice = null;
let averagePrice = null;

let lastBuyOrderPrice = null;

let btcAvailable = 0;
let btcBalance = 0;

let ethAvailable = 0;
let ethBalance = 0;

let numberOfCyclesCompleted = 0;

let authenticatedClient = null;
let publicClient = null;

//Callbacks

const cancelOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    lastBuyOrderPrice = null;
}

const sellOrderCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
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
        if ((lastBuyOrderPrice===null) || (lastBuyOrderPrice<parseFloat(data.price)))
            lastBuyOrderPrice = parseFloat(data.price);
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
            let orderPrice = parseFloat(item.price);
            let priceDifference = Math.abs(orderPrice - currentPrice);
      
	        if ((item.product_id===CURRENCY_PAIR) && (item.side==='buy') && (priceDifference>=CANCEL_BUY_ORDER_THRESHOLD))
            {
	            console.log("\n[INFO] Canceling buy order (order price: " + orderPrice.toFixed(5) + " BTC, current price: " + currentPrice.toFixed(5) + " BTC)");
		        authenticatedClient.cancelOrder(item.id, cancelOrderCallback);
            }
        }
   
        console.log('');

        if ((btcAvailable>=MINIMUM_BTC_BALANCE) && (averagePrice!=null) && (lastBuyOrderPrice==null))
            placeBuyOrder();
        else if ((ethAvailable>=SEED_ETH_AMOUNT) && (lastBuyOrderPrice!=null))
            placeSellOrder();
        
        if (averagePrice===null)
            averagePrice = currentPrice;
        else
            averagePrice = (averagePrice*10 + currentPrice) / 11;
    }
}

const getProductTickerCallback = (error, response, data) => 
{
	if (error)
        return console.log(error);

    if (data!=null)
    {
	    currentPrice = parseFloat(data.bid);

        if (averagePrice===null)
            console.log("[ETHEREUM TICKER] Now: " + currentPrice.toFixed(5) + " BTC, time: " + data.time);
        else
            console.log("[ETHEREUM TICKER] Now: " + currentPrice.toFixed(5) + " BTC, average: " + averagePrice.toFixed(5) + " BTC, time: " + data.time);

        let estimatedProfit = numberOfCyclesCompleted * SEED_ETH_AMOUNT * MINIMUM_SELL_PROFIT;

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
	        if (item.currency=='BTC')
            {
	            btcAvailable = parseFloat(item.available);
	            btcBalance = parseFloat(item.balance);
            }
	        else if (item.currency=='ETH')
            {
		        ethAvailable = parseFloat(item.available);
                ethBalance = parseFloat(item.balance);
            }
        }
   
        console.log("[BITCOIN WALLET] Available: " + btcAvailable.toFixed(8) + " BTC, Balance: " + btcBalance.toFixed(8) + " BTC");
        console.log("[ETHEREUM WALLET] Available: " + ethAvailable.toFixed(8) + " ETH, Balance: " + ethBalance.toFixed(8) + " ETH\n");

        publicClient.getProductTicker(CURRENCY_PAIR, getProductTickerCallback);
    }
}

//Functions

function placeBuyOrder() 
{
    let priceIncrement = currentPrice - averagePrice;

    if (priceIncrement>=MINIMUM_PRICE_INCREMENT)
    {
        let buySize = SEED_ETH_AMOUNT;

        const buyParams = 
	    {
            'price': currentPrice.toFixed(5),
            'size': buySize.toFixed(4),
            'product_id': CURRENCY_PAIR,
		    'post_only': true,
	    };

        console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Price: " + currentPrice.toFixed(5) + " BTC, size: " + buySize.toFixed(4) + " ETH");

        authenticatedClient.buy(buyParams, buyOrderCallback);
    }
}

function placeSellOrder() 
{
    let sellPrice;
    
    if (lastBuyOrderPrice<currentPrice)
        sellPrice = currentPrice + MINIMUM_SELL_PROFIT;
    else
        sellPrice = lastBuyOrderPrice + MINIMUM_SELL_PROFIT;

    const sellSize = Math.floor(ethAvailable*10000) / 10000;

    const sellParams = 
    {
        'price': sellPrice.toFixed(5),
        'size': sellSize.toFixed(4),
        'product_id': CURRENCY_PAIR,
        'post_only': true,
    };

    console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(5) + " BTC, size: " + sellSize.toFixed(4) + " ETH"); 

    authenticatedClient.sell(sellParams, sellOrderCallback);
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
console.log("                              /_____/\\____/\\__/");

console.log("\n\n\n\n                    \"The Revolution Will Be Decentralized\"");

console.log("\n\n\n\nConnecting to GDAX in " + parseInt(SLEEP_TIME/1000) + " seconds ..."); 

setInterval(() => 
{
    console.log('\n\n');

    currentPrice = null;

    btcAvailable = 0;
    btcBalance = 0;

    ethAvailable = 0;
    ethBalance = 0;

    publicClient = new GdaxModule.PublicClient(GDAX_URI); 
    authenticatedClient = new GdaxModule.AuthenticatedClient(KEY, SECRET, PASSPHRASE, GDAX_URI);

    //Get the balance of the wallets and execute the trading strategy
    authenticatedClient.getAccounts(getAccountsCallback);

}, SLEEP_TIME);


