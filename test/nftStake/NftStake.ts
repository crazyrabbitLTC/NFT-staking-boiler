import hre from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { NftStake } from "../../typechain";
import { MockERC20 } from "../../typechain";
import { MockERC721 } from "../../typechain";

import { Signers } from "../types";

// test cases
import { shouldBehaveLikeNftStake } from "./NftStake.behavior";

const { deployContract } = hre.waffle;

describe("Unit tests", function () {
  before(async function () {
    this.signers = {} as Signers;

    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers.admin = signers[0];
    this.signers.user1 = signers[1];
    this.signers.user2 = signers[2];
    this.signers.dao = signers[3];
  });

  describe("NFTStake", function () {
    beforeEach(async function () {
      this.tokensPerBlock = 2;

      // deploy erc20
      const erc20Artifact: Artifact = await hre.artifacts.readArtifact("MockERC20");
      this.mockERC20 = <MockERC20>await deployContract(this.signers.admin, erc20Artifact, [1000]);

      // deploy erc721
      const erc721Artifact: Artifact = await hre.artifacts.readArtifact("MockERC721");
      this.mockERC721 = <MockERC721>await deployContract(this.signers.admin, erc721Artifact, []);

      // deploy NFTStake
      const nftStakeArtifact: Artifact = await hre.artifacts.readArtifact("NftStake");
      this.nftStake = <NftStake>(
        await deployContract(this.signers.admin, nftStakeArtifact, [
          this.mockERC721.address,
          this.mockERC20.address,
          await this.signers.dao.getAddress(),
          this.tokensPerBlock,
        ])
      );

      // Send erc20 balance to NFTStake
      const adminTokenInstance: MockERC20 = <MockERC20>await this.mockERC20.connect(this.signers.admin);
      await adminTokenInstance.transfer(
        this.nftStake.address,
        await adminTokenInstance.balanceOf(await this.signers.admin.getAddress()),
      );

      // Mint some NFTS
      const adminERC721Instance: MockERC721 = <MockERC721>await this.mockERC721.connect(this.signers.admin);

      // user1 has tokenId 1
      // user2 has tokenId 2
      await adminERC721Instance.mint(await this.signers.user1.getAddress(), "First");
      await adminERC721Instance.mint(await this.signers.user2.getAddress(), "Second");
    });

    shouldBehaveLikeNftStake();
  });
});
