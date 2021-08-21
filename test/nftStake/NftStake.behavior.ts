import { expect } from "chai";
import { BigNumber } from "ethers";
import { network } from "hardhat";

export function shouldBehaveLikeNftStake(): void {
  it("should let user stake NFT", async function () {
    // Need to approve the token first
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT(BigNumber.from(1))).to.be.revertedWith(
      "ERC721: transfer caller is not owner nor approved",
    );
    // Approve nftStake to take the token
    await this.mockERC721.connect(this.signers.user1).approve(this.nftStake.address, BigNumber.from(1));
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT(BigNumber.from(1))).to.not.be.reverted;
  });

  it("should not let a user stake twice", async function () {
    // Approve nftStake to take the token
    await this.mockERC721.connect(this.signers.user1).approve(this.nftStake.address, BigNumber.from(1));
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT(BigNumber.from(1))).to.not.be.reverted;
    // Try to stake again
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT(BigNumber.from(1))).to.be.revertedWith(
      "Stake: Token is already staked",
    );
  });

  it("should not let you stake a token you don't own", async function () {
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user2).stakeNFT(BigNumber.from(1))).to.be.reverted;
  });

  it("should let user unstake", async function () {
    const tokenId = BigNumber.from(1);
    // Approve nftStake to take the token
    await this.mockERC721.connect(this.signers.user1).approve(this.nftStake.address, tokenId);
    // Try to stake it
    await expect(this.nftStake.connect(this.signers.user1).stakeNFT(tokenId)).to.not.be.reverted;

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

  xit("_getTimeStaked should return zero when not staked");
}
