import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WalletDB } from './wallet-db';
import type { StoreOutputParams } from './wallet-db.interface';

const TOKEN_A = 'aa'.repeat(32) + '00'.repeat(8);
const TOKEN_B = 'bb'.repeat(32) + '00'.repeat(8);

function output(outputHash: string, overrides: Partial<StoreOutputParams> = {}): StoreOutputParams {
  return {
    outputHash,
    txHash: 'cc'.repeat(32),
    outputIndex: 0,
    blockHeight: 10,
    outputData: '',
    amount: 1_000,
    gamma: '01',
    memo: null,
    tokenId: null,
    blindingKey: '02',
    ephemeralKey: null,
    spendingKey: '03',
    isSpent: false,
    spentTxHash: null,
    spentBlockHeight: null,
    txType: 'received',
    timestamp: 0,
    ...overrides,
  };
}

describe('WalletDB output queries', () => {
  let walletDB: WalletDB;

  beforeEach(async () => {
    walletDB = new WalletDB({ type: 'better-sqlite3' });
    await walletDB.open(':memory:');
  });

  afterEach(async () => {
    await walletDB.close();
  });

  it('binds the token id instead of splicing it into the SQL', async () => {
    await walletDB.storeWalletOutput(output('01'.repeat(32), { tokenId: TOKEN_A, amount: 5 }));
    await walletDB.storeWalletOutput(output('02'.repeat(32), { tokenId: TOKEN_B, amount: 7 }));
    await walletDB.storeWalletOutput(
      output('03'.repeat(32), { tokenId: TOKEN_A, amount: 11, isSpent: true, spentBlockHeight: 0 })
    );

    expect(await walletDB.getBalance(TOKEN_A)).toBe(5n);
    expect((await walletDB.getUnspentOutputs(TOKEN_B)).map(o => o.amount)).toEqual([7n]);
    expect(await walletDB.getPendingSpentAmount(TOKEN_A)).toBe(11n);

    // A quote in the token id must not end the string literal.
    const injected = `x' OR '1'='1`;
    expect(await walletDB.getBalance(injected)).toBe(0n);
    expect(await walletDB.getUnspentOutputs(injected)).toEqual([]);
    expect(await walletDB.getPendingSpentAmount(injected)).toBe(0n);
  });
});
