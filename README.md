# GDAX Trading Bot

This program is an automated trading system that can autonomously trade the LTC / BTC pair in the GDAX exchange. 

Keep in mind that trading is a risky activity that can involve a loss of money. You should only invest the amount you can afford to lose.

## Trading strategy

The trading strategy consists of issuing a large number of low value orders. The program continuously monitors the price of litecoin and issues a limit buy order when the price begins to rise above the weighted average of the previous prices. Once the buy order is filled, the program issues a limit sell order at a higher price.

### The seed

The seed is the amount of litecoins that the program will trade continuously to earn bitcoins. The greater the seed, the greater the benefit. The seed value must be set in the program variable SEED_LTC_AMOUNT.

It is recommended that the seed does not exceed one hundredth of the amount of litecoins you can buy.

Example:

- If your current bitcoin balance is 0.1 btc and the price of litecoin is 0.01 btc you can buy 10 litecoins
- If you can buy 10 litecoins the recommended seed is 0.1 ltc

## Quick guide

### Registration

- Register in Coinbase (https://www.coinbase.com)
- Use the Coinbase account to login to the Gdax exchange (https://www.gdax.com)
- Deposit the amount of bitcoins you want

### API Key generation

Generate an API Key only with trade permission (https://www.gdax.com/settings/api)

### Environment variables

Save the three values of the API key in the following environment variables of the operating system:

- TRADING_BOT_PASSPHRASE
- TRADING_BOT_KEY
- TRADING_BOT_SECRET

### Installation

- Install Node.js (https://nodejs.org)
- Download this repository
- Open a system console
- Run "npm install" in the root folder to install the required modules

### Configuration

- Open the file "index.js" with a text editor
- Set the seed in the variable SEED_LTC_AMOUNT

### Execution

- Open a system console
- Run "node index.js" in the root folder to start the execution of the program
- Press Ctrl + C to exit 

## Donations

Please consider making a donation to the following bitcoin address (BTC):

1KNcZ1z3yuEK1hF27y53MyjJSZsPUYz3Ty
