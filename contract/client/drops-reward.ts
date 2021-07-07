import { dropsUnlockedReward, getChannelPoolRewardQueue } from './app_utils';

const registrar = 'FpLS8UeEw9f7gW2XsK6dEY1CoQ7nzWGHafc8VmXdL5gA';
const poolMint = 'Ff1KvJ37pQrS6s9D1A9QUmGB1mPecHRoLesP8yZjKj2p';

async function main() {
  const rewardQ = await getChannelPoolRewardQueue(registrar);
  await dropsUnlockedReward(registrar, rewardQ.toString(), poolMint);
  console.log('success!');
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  },
);
