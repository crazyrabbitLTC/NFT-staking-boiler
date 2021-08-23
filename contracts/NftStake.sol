// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "hardhat/console.sol";

contract NftStake is IERC721Receiver, ReentrancyGuard {
    using SafeMath for uint256;

    IERC721 public nftToken;
    IERC20 public erc20Token;

    address public daoAdmin;
    uint256 public tokensPerBlock;

    struct stake {
        uint256 tokenId;
        uint256 stakedFromBlock;
        address owner;
    }

    // TokenID => Stake
    mapping(uint256 => stake) public receipt;

    event NftStaked(address indexed staker, uint256 tokenId, uint256 blockNumber);
    event NftUnStaked(address indexed staker, uint256 tokenId, uint256 blockNumber);
    event StakePayout(address indexed staker, uint256 tokenId, uint256 stakeAmount, uint256 fromBlock, uint256 toBlock);
    event StakeRewardUpdated(uint256 rewardPerBlock);

    modifier onlyStaker(uint256 tokenId) {
        // require that this contract has the NFT
        require(nftToken.ownerOf(tokenId) == address(this), "onlyStaker: Contract is not owner of this NFT");

        // require that this token is staked
        require(receipt[tokenId].stakedFromBlock != 0, "onlyStaker: Token is not staked");

        // require that msg.sender is the owner of this nft
        require(receipt[tokenId].owner == msg.sender, "onlyStaker: Caller is not NFT stake owner");

        _;
    }

    modifier requireTimeElapsed(uint256 tokenId) {
        // require that some time has elapsed (IE you can not stake and unstake in the same block)
        require(
            receipt[tokenId].stakedFromBlock < block.number,
            "requireTimeElapsed: Can not stake/unStake/harvest in same block"
        );
        _;
    }

    modifier onlyDao() {
        require(msg.sender == daoAdmin, "reclaimTokens: Caller is not the DAO");
        _;
    }

    constructor(
        IERC721 _nftToken,
        IERC20 _erc20Token,
        address _daoAdmin,
        uint256 _tokensPerBlock
    ) {
        nftToken = _nftToken;
        erc20Token = _erc20Token;
        daoAdmin = _daoAdmin;
        tokensPerBlock = _tokensPerBlock;

        emit StakeRewardUpdated(tokensPerBlock);
    }

    /**
     * Always returns `IERC721Receiver.onERC721Received.selector`.
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    //User must give this contract permission to take ownership of it.
    function stakeNFT(uint256[] calldata tokenId) public nonReentrant returns (bool) {
        // allow for staking multiple NFTS at one time.
        for (uint256 i = 0; i < tokenId.length; i++) {
            _stakeNFT(tokenId[i]);
        }

        return true;
    }

    function getStakeContractBalance() public view returns (uint256) {
        return erc20Token.balanceOf(address(this));
    }

    function getCurrentStakeEarned(uint256 tokenId) public view returns (uint256) {
        return _getTimeStaked(tokenId).mul(tokensPerBlock);
    }

    function unStakeNFT(uint256 tokenId) public nonReentrant returns (bool) {
        return _unStakeNFT(tokenId);
    }

    function _unStakeNFT(uint256 tokenId) internal onlyStaker(tokenId) requireTimeElapsed(tokenId) returns (bool) {
        // payout stake, this should be safe as the function is non-reentrant
        _payoutStake(tokenId);

        // delete stake record, effectively unstaking it
        delete receipt[tokenId];

        // return token
        nftToken.safeTransferFrom(address(this), msg.sender, tokenId);

        emit NftUnStaked(msg.sender, tokenId, block.number);

        return true;
    }

    function harvest(uint256 tokenId) public nonReentrant onlyStaker(tokenId) requireTimeElapsed(tokenId) {
        // This 'payout first' should be safe as the function is nonReentrant
        _payoutStake(tokenId);

        // update receipt with a new block number
        receipt[tokenId].stakedFromBlock = block.number;
    }

    function changeTokensPerblock(uint256 _tokensPerBlock) public onlyDao {
        tokensPerBlock = _tokensPerBlock;

        emit StakeRewardUpdated(tokensPerBlock);
    }

    function reclaimTokens() external onlyDao {
        erc20Token.transfer(daoAdmin, erc20Token.balanceOf(address(this)));
    }

    function updateStakingReward(uint256 _tokensPerBlock) external onlyDao {
        tokensPerBlock = _tokensPerBlock;

        emit StakeRewardUpdated(tokensPerBlock);
    }

    function _stakeNFT(uint256 tokenId) internal returns (bool) {
        // require this token is not already staked
        require(receipt[tokenId].stakedFromBlock == 0, "Stake: Token is already staked");

        // require this token is not already owned by this contract
        require(nftToken.ownerOf(tokenId) != address(this), "Stake: Token is already staked in this contract");

        // take possession of the NFT
        nftToken.safeTransferFrom(msg.sender, address(this), tokenId);

        // check that this contract is the owner
        require(nftToken.ownerOf(tokenId) == address(this), "Stake: Failed to take possession of NFT");

        // start the staking from this block.
        receipt[tokenId].tokenId = tokenId;
        receipt[tokenId].stakedFromBlock = block.number;
        receipt[tokenId].owner = msg.sender;

        emit NftStaked(msg.sender, tokenId, block.number);

        return true;
    }

    function _payoutStake(uint256 tokenId) internal {
        /* NOTE : Must be called from non-reentrant function to be safe!*/

        // double check that the receipt exists and we're not staking from block 0
        require(receipt[tokenId].stakedFromBlock > 0, "_payoutStake: Can not stake from block 0");

        // earned amount is difference between the stake start block, current block multiplied by stake amount
        uint256 timeStaked = _getTimeStaked(tokenId).sub(1); // don't pay for the tx block of withdrawl
        uint256 payout = timeStaked.mul(tokensPerBlock);

        // If contract does not have enough tokens to pay out, return the NFT without payment
        // This prevent a NFT being locked in the contract when empty
        if (erc20Token.balanceOf(address(this)) < payout) {
            emit StakePayout(msg.sender, tokenId, 0, receipt[tokenId].stakedFromBlock, block.number);
            return;
        }

        // payout stake
        erc20Token.transfer(receipt[tokenId].owner, payout);

        emit StakePayout(msg.sender, tokenId, payout, receipt[tokenId].stakedFromBlock, block.number);
    }

    function _getTimeStaked(uint256 tokenId) internal view returns (uint256) {
        if (receipt[tokenId].stakedFromBlock == 0) {
            return 0;
        }

        return block.number.sub(receipt[tokenId].stakedFromBlock);
    }

    /** Add Function to allow the DAO to forcibly unstake an NFT and return it to the owner */
}
