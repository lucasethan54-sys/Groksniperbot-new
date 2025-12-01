require('dotenv').config();
const { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } = require('@solana/web3.js');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const OpenAI = require('openai');

const bot = new Telegraf(process.env.BOT_TOKEN);
const connection = new Connection(process.env.RPC_URL || "https://api.mainnet-beta.solana.com");
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.WALLET_SECRET)));

const openai = new OpenAI({
  apiKey: process.env.XAI_KEY,
  baseURL: 'https://api.x.ai/v1'
});

async function askGrok(token) {
  try {
    const completion = await openai.chat.completions.create({
      model: "grok-beta",
      messages: [{ role: "user", content: `Solana token ${token} — rug or moon? Check X buzz, dev wallet, narrative. JSON only: {"safe":true/false,"score":1-10,"reason":"12 words max"}` }]
    });
    return JSON.parse(completion.choices[0].message.content.trim());
  } catch (e) {
    return { safe: false, score: 0, reason: "Grok error" };
  }
}

bot.command('snipe', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Usage: /snipe <token> <amount>\nEx: /snipe 7xK... 0.05');

  const token = args[1];
  const amount = parseFloat(args[2]) || 0.05;

  ctx.reply('Grok scanning...');
  const grok = await askGrok(token);
  if (!grok.safe) return ctx.reply(`Grok NOPE — ${grok.score}/10\n${grok.reason}`);

  ctx.reply(`Grok YES ${grok.score}/10 — ${grok.reason}\nSniping ${amount} SOL...`);

  try {
    const quote = await axios.get(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${token}&amount=${amount*LAMPORTS_PER_SOL}&slippageBps=5000`);
    const swap = await axios.post('https://quote-api.jup.ag/v6/swap', {
      quoteResponse: quote.data,
      userPublicKey: wallet.publicKey.toString(),
      wrapAndUnwrapSol: true
    });
    const tx = VersionedTransaction.deserialize(Buffer.from(swap.data.swapTransaction, 'base64'));
    tx.sign([wallet]);
    const sig = await connection.sendTransaction(tx, { skipPreflight: true });
    ctx.reply(`SNIPED!\nhttps://solscan.io/tx/${sig}`);
  } catch (e) {
    ctx.reply(`Failed: ${e.message.split('\n')[0]}`);
  }
});

bot.launch();
console.log('GrokSniper ALIVE!');
