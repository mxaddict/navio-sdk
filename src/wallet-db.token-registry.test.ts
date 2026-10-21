import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WalletDB } from './wallet-db';
import type { TokenRegistryEntry } from './wallet-db.interface';

const ENTRY: TokenRegistryEntry = {
  publicTokenId: 'ab'.repeat(32),
  kind: 'nft',
  metadata: { name: 'Collection' },
  totalSupply: '18446744073709551615',
  mintedNft: { '1': { name: 'First' } },
  fetchedAt: 1_700_000_000_000,
};

describe('WalletDB token registry cache', () => {
  let walletDB: WalletDB;

  beforeEach(async () => {
    walletDB = new WalletDB({ type: 'better-sqlite3' });
    await walletDB.open(':memory:');
  });

  afterEach(async () => {
    await walletDB.close();
  });

  it('stores an entry and replaces it by public token id', async () => {
    expect(await walletDB.getTokenRegistryEntry(ENTRY.publicTokenId)).toBeNull();

    await walletDB.saveTokenRegistryEntry(ENTRY);
    expect(await walletDB.getTokenRegistryEntry(ENTRY.publicTokenId)).toEqual(ENTRY);

    const updated = { ...ENTRY, mintedNft: { ...ENTRY.mintedNft, '2': { name: 'Second' } } };
    await walletDB.saveTokenRegistryEntry(updated);
    expect(await walletDB.getTokenRegistryEntry(ENTRY.publicTokenId)).toEqual(updated);
    expect(await walletDB.getTokenRegistryEntry('cd'.repeat(32))).toBeNull();
  });
});
