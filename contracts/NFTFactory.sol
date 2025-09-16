// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./NFTCollection.sol";

contract NFTFactory is Ownable, Pausable {
    // Creation fee (if needed)
    uint256 public creationFee;
    
    // Events
    event CollectionCreated(
        address indexed creator,
        address indexed collection,
        string name,
        string mediaUrl,
        string thumbnailUrl,
        NFTCollection.MediaType mediaType,
        uint256 maxSupply,
        uint256 mintPrice,
        uint256 mintStartTime,
        uint256 mintEndTime,
        bool whitelistOnly,
        uint256 maxMintsPerWallet
    );
    event FactoryPaused(address indexed operator);
    event FactoryUnpaused(address indexed operator);
    
    constructor() Ownable(msg.sender) {
        creationFee = 0;
    }
    
    // @custom:payable Creation fee must be sent with the transaction
    function createCollection(
        string memory name,
        string memory symbol,
        string memory description,
        uint256 maxSupply,
        uint256 mintPrice,
        string memory mediaUrl,       // Primary media file URL
        string memory thumbnailUrl,   // Thumbnail/cover image URL (optional, can be empty)
        uint8 mediaTypeValue,         // 0=IMAGE, 1=VIDEO, 2=AUDIO, 3=MODEL_3D
        bool whitelistOnly,
        address[] memory initialWhitelist,
        uint256 maxMintsPerWallet,
        uint256 mintStartTime,        // Optional: 0 means no start time restriction,Unix timestamp in seconds
        uint256 mintEndTime           // Optional: 0 means no end time restriction,Unix timestamp in seconds
    ) external payable whenNotPaused returns (address) {
        require(bytes(name).length > 0, "Name is required");
        require(bytes(symbol).length > 0, "Symbol is required");
        require(maxSupply > 0, "Max supply must be positive");
        require(bytes(mediaUrl).length > 0, "Media URL is required");
        require(mediaTypeValue <= 3, "Invalid media type");
        require(msg.value >= creationFee, "Insufficient creation fee");
        require(maxMintsPerWallet > 0, "Max mints per wallet must be positive");
        if (whitelistOnly) {
            require(initialWhitelist.length > 0, "Whitelist is required");
        }
        
        NFTCollection.MediaType mediaType = NFTCollection.MediaType(mediaTypeValue);
        
        NFTCollection newCollection = new NFTCollection(
            name,
            symbol,
            description,
            maxSupply,
            mintPrice,
            msg.sender,    // Collection owner
            mediaUrl,
            thumbnailUrl,
            mediaType,
            whitelistOnly,
            initialWhitelist,
            maxMintsPerWallet,
            mintStartTime,
            mintEndTime
        );
        
        emit CollectionCreated(
            msg.sender,
            address(newCollection),
            name,
            mediaUrl,
            thumbnailUrl,
            mediaType,
            maxSupply,
            mintPrice,
            mintStartTime,
            mintEndTime,
            whitelistOnly,
            maxMintsPerWallet
        );
        
        return address(newCollection);
    }
    
    // Set creation fee (only owner can call)
    function setCreationFee(uint256 _fee) external onlyOwner {
        creationFee = _fee;
    }
    
    // Withdraw ETH from contract (only owner can call)
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    // Pause factory
    function pause() external onlyOwner {
        _pause();
        emit FactoryPaused(msg.sender);
    }
    
    // Unpause factory
    function unpause() external onlyOwner {
        _unpause();
        emit FactoryUnpaused(msg.sender);
    }
} 