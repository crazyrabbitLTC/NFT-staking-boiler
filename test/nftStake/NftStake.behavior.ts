import { expect } from "chai";
import { BigNumber, utils } from "ethers";
import { network } from "hardhat";

export function shouldBehaveLikeNftStake(): void {
  it("should tell you a number", async function () {
    const value = utils.formatEther(BigNumber.from(1));
    // const value2 = utils.formatUnits(BigNumber.from(1), "wei")
    const divisor = (24 * 60 * 60) / 15;
    const value2 = utils.parseEther("3").div(BigNumber.from(divisor)).toString();
    console.log(value2);
  });
  it("should let user stake NFT", async function () {
    // Need to approve the token first
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT([BigNumber.from(1)])).to.be.revertedWith(
      "ERC721: transfer caller is not owner nor approved",
    );
    // Approve nftStake to take the token
    await this.mockERC721.connect(this.signers.user1).approve(this.nftStake.address, BigNumber.from(1));
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT([BigNumber.from(1)])).to.not.be.reverted;
  });

  it("should not let a user stake twice", async function () {
    // Approve nftStake to take the token
    await this.mockERC721.connect(this.signers.user1).approve(this.nftStake.address, BigNumber.from(1));
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT([BigNumber.from(1)])).to.not.be.reverted;
    // Try to stake again
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT([BigNumber.from(1)])).to.be.revertedWith(
      "Stake: Token is already staked",
    );
  });

  it("should not let you stake a token you don't own", async function () {
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user2).stakeNFT([BigNumber.from(1)])).to.be.reverted;
  });

  it("should let user unstake", async function () {
    const tokenId = BigNumber.from(1);
    // Approve nftStake to take the token
    await this.mockERC721.connect(this.signers.user1).approve(this.nftStake.address, tokenId);
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT([tokenId])).to.not.be.reverted;

    // confirm nftStake owns token
    expect(await this.mockERC721.connect(this.signers.admin).ownerOf(tokenId)).to.eql(this.nftStake.address);

    // let some time pass
    await network.provider.send("evm_mine");

    // get blocknumber user staked
    const startStake = (await this.nftStake.connect(this.signers.admin).receipt(tokenId)).stakedFromBlock.toNumber();

    // get current blockNumer
    const currentBlock = parseInt(await network.provider.send("eth_blockNumber"), 16);

    // estimate stake
    const estimatedPayout =
      (currentBlock - startStake) *
      (await (await this.nftStake.connect(this.signers.user1).tokensPerBlock()).toNumber());

    // check if estimated stake matches contract
    expect(await (await this.nftStake.connect(this.signers.user1).getCurrentStakeEarned(tokenId)).toNumber()).to.eql(
      estimatedPayout,
    );

    // try to unstake
    await expect(this.nftStake.connect(this.signers.user1).unStakeNFT(tokenId)).to.not.be.reverted;

    // confirm user1 owns the token again
    expect(await this.mockERC721.connect(this.signers.user1).ownerOf(tokenId)).to.eql(
      await this.signers.user1.getAddress(),
    );

    // check if user1 has been paid the estimated stake
    expect(
      await (
        await this.mockERC20.connect(this.signers.user1).balanceOf(await this.signers.user1.getAddress())
      ).toNumber(),
    ).to.eql(estimatedPayout);
  });

  it("getCurrentStakeEarned should return zero when not staked", async function () {
    const tokenId = BigNumber.from(9999);
    expect((await this.nftStake.connect(this.signers.user1).getCurrentStakeEarned(tokenId)).toNumber()).to.eql(0);
  });

  it("getCurrentStake should return correct stake amount currently", async function () {
    const tokenId = BigNumber.from(1);

    // Approve nftStake to take the token
    await this.mockERC721.connect(this.signers.user1).approve(this.nftStake.address, tokenId);
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT([tokenId])).to.not.be.reverted;

    // Wait 4 blocks
    await network.provider.send("evm_mine");
    await network.provider.send("evm_mine");
    await network.provider.send("evm_mine");
    await network.provider.send("evm_mine");

    expect((await this.nftStake.connect(this.signers.user1).getCurrentStakeEarned(tokenId)).toNumber()).to.eq(
      4 * this.tokensPerBlock,
    );
  });

  it("should allow harvesting without withdrawl", async function () {
    const tokenId = BigNumber.from(1);
    // Approve nftStake to take the token
    await this.mockERC721.connect(this.signers.user1).approve(this.nftStake.address, tokenId);
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT([tokenId])).to.not.be.reverted;

    // Wait 4 blocks
    await network.provider.send("evm_mine");
    await network.provider.send("evm_mine");
    await network.provider.send("evm_mine");
    await network.provider.send("evm_mine");

    // get current earned stake
    const currentEarnedStake = (
      await this.nftStake.connect(this.signers.user1).getCurrentStakeEarned(tokenId)
    ).toNumber();

    // get current token balance of user
    const balanceBeforeHarvest = (
      await this.mockERC20.connect(this.signers.user1).balanceOf(await this.signers.user1.getAddress())
    ).toNumber();

    // get the staked receipt
    const stakedAtOriginal = (
      await this.nftStake.connect(this.signers.user1).receipt(tokenId)
    ).stakedFromBlock.toNumber();

    // get current blockNumer
    let currentBlock = parseInt(await network.provider.send("eth_blockNumber"), 16);

    // check the staked receipt is 4 blocks ago
    expect(currentBlock - stakedAtOriginal).to.eq(4);

    // should have no tokens
    expect(balanceBeforeHarvest).to.eq(0);

    // should not let you harvest tokens you did not stake
    await expect(this.nftStake.connect(this.signers.user2).harvest(tokenId)).to.be.revertedWith(
      "onlyStaker: Caller is not NFT stake owner",
    );

    // harvest Stake
    await this.nftStake.connect(this.signers.user1).harvest(tokenId);

    // should have harvested the tokens
    expect(
      (await this.mockERC20.connect(this.signers.user1).balanceOf(await this.signers.user1.getAddress())).toNumber(),
    ).to.eq(currentEarnedStake);

    // check the new receipt
    const updatedStakeDate = (
      await this.nftStake.connect(this.signers.user1).receipt(tokenId)
    ).stakedFromBlock.toNumber();
    currentBlock = parseInt(await network.provider.send("eth_blockNumber"), 16);

    // check the staked receipt has been updated to current blocktime
    expect(currentBlock).to.eq(updatedStakeDate);

    // check that there is no pending payout availible
    expect((await this.nftStake.connect(this.signers.user1).getCurrentStakeEarned(tokenId)).toNumber()).to.eq(0);

    // check that nftStake still owns the token
    expect(await this.mockERC721.connect(this.signers.user1).ownerOf(tokenId)).to.eq(this.nftStake.address);

    // wait one block
    await network.provider.send("evm_mine");

    // check that there is now a pending payout availible again
    expect((await this.nftStake.connect(this.signers.user1).getCurrentStakeEarned(tokenId)).toNumber()).to.eq(
      1 * this.tokensPerBlock,
    );
  });

  xit("only allows DAO to update tokens per block");
  xit("can not do reentrancy");
}
