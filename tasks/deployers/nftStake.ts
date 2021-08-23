import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";

import { NftStake, NftStake__factory } from "../../typechain";

task("deploy:NFTStake")
  .addParam("nft", "The NFT Contract Address")
  .addParam("erc20", "The payout ERC20 Token")
  .addParam("dao", "The DAO which governs the contract")
  .addParam("reward", "ERC20 tokens rewarded per block")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const nftStakeFactory: NftStake__factory = await ethers.getContractFactory("NftStake");
    const nftStake: NftStake = <NftStake>(
      await nftStakeFactory.deploy(taskArguments.nft, taskArguments.erc20, taskArguments.dao, taskArguments.reward)
    );
    await nftStake.deployed();
    console.log("NFT Stake deployed to: ", nftStake.address);
  });
