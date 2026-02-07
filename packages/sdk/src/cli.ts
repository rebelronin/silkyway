#!/usr/bin/env node
import { Command } from 'commander';
import { walletCreate, walletList, walletFund } from './commands/wallet.js';
import { balance } from './commands/balance.js';
import { pay } from './commands/pay.js';
import { claim } from './commands/claim.js';
import { cancel } from './commands/cancel.js';
import { paymentsList, paymentsGet } from './commands/payments.js';

const program = new Command();
program
  .name('handshake')
  .description('Handshake Protocol SDK — Agent payments on Solana')
  .version('0.1.0');

// wallet commands
const wallet = program.command('wallet');
wallet
  .command('create')
  .argument('[label]', 'wallet label', 'main')
  .description('Create a new wallet')
  .action(walletCreate);
wallet
  .command('list')
  .description('List all wallets')
  .action(walletList);
wallet
  .command('fund')
  .option('--sol', 'Request SOL only')
  .option('--usdc', 'Request USDC only')
  .option('--wallet <label>', 'Wallet to fund')
  .description('Fund wallet from devnet faucet')
  .action(walletFund);

// balance
program
  .command('balance')
  .option('--wallet <label>', 'Wallet to check')
  .description('Check wallet balances')
  .action(balance);

// pay
program
  .command('pay')
  .argument('<recipient>', 'Recipient wallet address')
  .argument('<amount>', 'Amount in USDC')
  .option('--memo <text>', 'Payment memo')
  .option('--wallet <label>', 'Sender wallet')
  .description('Send a USDC payment')
  .action(pay);

// claim
program
  .command('claim')
  .argument('<transferPda>', 'Transfer PDA to claim')
  .option('--wallet <label>', 'Wallet to claim with')
  .description('Claim a received payment')
  .action(claim);

// cancel
program
  .command('cancel')
  .argument('<transferPda>', 'Transfer PDA to cancel')
  .option('--wallet <label>', 'Wallet to cancel with')
  .description('Cancel a sent payment')
  .action(cancel);

// payments
const payments = program.command('payments');
payments
  .command('list')
  .option('--wallet <label>', 'Wallet to query')
  .description('List transfers')
  .action(paymentsList);
payments
  .command('get')
  .argument('<transferPda>', 'Transfer PDA')
  .description('Get transfer details')
  .action(paymentsGet);

program.parse();
