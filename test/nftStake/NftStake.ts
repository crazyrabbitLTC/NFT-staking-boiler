import hre from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { NftStake } from "../../typechain";
import { Signers } from "../types";
// import { shouldBehaveLikeGreeter } from "./Greeter.behavior";

const { deployContract } = hre.waffle;

describe("Unit tests", function () {
  before(async function () {
    this.signers = {} as Signers;

    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers.admin = signers[0];
    this.signers.user1 = signers[1];
    this.signers.user2 = signers[2];
  });

  describe("Greeter", function () {
    beforeEach(async function () {
      const greeting: string = "Hello, world!";
      const greeterArtifact: Artifact = await hre.artifacts.readArtifact("Greeter");
      this.greeter = <Greeter>await deployContract(this.signers.admin, greeterArtifact, [greeting]);
    });

    // shouldBehaveLikeGreeter();
  });
});
