import { setProvider, Provider, workspace } from '@project-serum/anchor';

describe('e', () => {

  // Configure the client to use the local cluster.
  setProvider(Provider.env());

  it('Is initialized!', async () => {
    // Add your test here.
    const program = workspace.circlepodprotocol;
    const tx = await program.rpc.initialize();
    console.log("Your transaction signature", tx);
  });
});
