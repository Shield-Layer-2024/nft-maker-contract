// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/interfaces/IERC4906.sol";

contract NFTCollection is ERC721URIStorage, Ownable, Pausable {
    using Strings for uint256;
    
    // Media type enumeration
    enum MediaType { IMAGE, VIDEO, AUDIO, MODEL_3D }
    
    // Media information structure
    struct MediaInfo {
        string mediaUrl;      // Primary media file URL
        string thumbnailUrl;  // Thumbnail/cover image URL (optional)
        MediaType mediaType;  // Media type
    }
    
    uint256 public maxSupply;
    uint256 public totalSupply;
    uint256 public mintPrice;
    string public description;
    MediaInfo public media;
    
    // Minting time control
    uint256 public mintStartTime;
    uint256 public mintEndTime;
    
    // Whitelist mapping
    uint256 public maxMintsPerWallet;  // Maximum number of mints allowed per wallet
    mapping(address => uint256) public mintsPerWallet;  // Track number of mints per wallet
    mapping(address => bool) public whitelist;
    bool public whitelistOnly = false;
    
    // Events
    event NFTMinted(
        address indexed minter,
        uint256 indexed tokenId,
        uint256 mintPrice
    );
    event WhitelistAdded(address[] addresses);
    event WhitelistRemoved(address[] addresses);
    event WhitelistStatusUpdated(bool enabled);
    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event MediaUpdated(string oldMediaUrl, string newMediaUrl, string oldThumbnailUrl, string newThumbnailUrl, MediaType mediaType);
    event ThumbnailUpdated(string oldThumbnailUrl, string newThumbnailUrl);
    
    constructor(
        string memory _name,
        string memory _symbol,
        string memory initDescription,
        uint256 _maxSupply,
        uint256 _mintPrice,
        address initialOwner,
        string memory _mediaUrl,
        string memory _thumbnailUrl,  // Optional: empty string if not needed
        MediaType _mediaType,
        bool _whitelistOnly,
        address[] memory initialWhitelist,
        uint256 _maxMintsPerWallet,
        uint256 _mintStartTime,    // Optional: 0 means no start time restriction
        uint256 _mintEndTime       // Optional: 0 means no end time restriction
    ) ERC721(_name, _symbol) Ownable(initialOwner) Pausable() {
        require(bytes(_mediaUrl).length > 0, "Media URL cannot be empty");
        
        maxSupply = _maxSupply;
        mintPrice = _mintPrice;
        description = initDescription;
        media = MediaInfo({
            mediaUrl: _mediaUrl,
            thumbnailUrl: _thumbnailUrl,
            mediaType: _mediaType
        });
        whitelistOnly = _whitelistOnly;
        maxMintsPerWallet = _maxMintsPerWallet;
        
        // Set minting time window if provided
        if (_mintStartTime > 0) {
            require(_mintStartTime >= block.timestamp, "Start time must be in the future");
            mintStartTime = _mintStartTime;
        }
        if (_mintEndTime > 0) {
            require(_mintEndTime > _mintStartTime, "End time must be after start time");
            mintEndTime = _mintEndTime;
        }
        
        if (initialWhitelist.length > 0) {
            for (uint i = 0; i < initialWhitelist.length; i++) {
                whitelist[initialWhitelist[i]] = true;
            }
            emit WhitelistAdded(initialWhitelist);
        }
    }
        
    // Mint NFT
    function mint() external payable whenNotPaused {
        require(totalSupply < maxSupply, "Max supply reached");
        require(msg.value >= mintPrice, "Insufficient payment");
        require(mintsPerWallet[msg.sender] < maxMintsPerWallet, "Max mints per wallet reached");
        
        if (whitelistOnly) {
            require(whitelist[msg.sender], "Not whitelisted");
        }
        
        if (mintStartTime != 0) {
            require(block.timestamp >= mintStartTime, "Minting not started");
        }
        
        if (mintEndTime != 0) {
            require(block.timestamp <= mintEndTime, "Minting ended");
        }
        
        uint256 tokenId = totalSupply;
        _safeMint(msg.sender, tokenId);
        // Note: We don't set individual tokenURI here to allow dynamic updates

        mintsPerWallet[msg.sender]++;
        totalSupply++;
        
        emit NFTMinted(msg.sender, tokenId, msg.value);
    }

    // Override tokenURI to support dynamic updates
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _generateTokenURI();
    }

    function _generateTokenURI() internal view returns (string memory) {
        string memory imageField;
        string memory animationField = "";
        
        if (media.mediaType == MediaType.IMAGE) {
            // For images, use mediaUrl as image field
            imageField = media.mediaUrl;
        } else {
            // For video/audio/3D models, use thumbnail as image, mediaUrl as animation_url
            imageField = bytes(media.thumbnailUrl).length > 0 
                ? media.thumbnailUrl 
                : media.mediaUrl;  // Fallback to mediaUrl if no thumbnail
            animationField = string(abi.encodePacked(
                '"animation_url": "', media.mediaUrl, '",'
            ));
        }
        
        string memory mediaTypeStr = _getMediaTypeString(media.mediaType);
        
        return string(
            abi.encodePacked(
                'data:application/json;base64,',
                Base64.encode(
                    bytes(
                        string(
                            abi.encodePacked(
                                '{"name": "', name(), '",',
                                '"description": "', description, '",',
                                '"image": "', imageField, '",',
                                animationField,
                                '"external_url": "https://shieldlayer.xyz",',
                                '"attributes": [',
                                    '{"trait_type": "Collection", "value": "', name(), '"},',
                                    '{"trait_type": "Total Supply", "value": ', maxSupply.toString(), '},',
                                    '{"trait_type": "Media Type", "value": "', mediaTypeStr, '"}',
                                ']}'
                            )
                        )
                    )
                )
            )
        );
    }
    
    function _getMediaTypeString(MediaType _mediaType) internal pure returns (string memory) {
        if (_mediaType == MediaType.IMAGE) return "Image";
        if (_mediaType == MediaType.VIDEO) return "Video";
        if (_mediaType == MediaType.AUDIO) return "Audio";
        if (_mediaType == MediaType.MODEL_3D) return "3D Model";
        return "Unknown";
    }



    // Update mint price
    function setMintPrice(uint256 _newPrice) external onlyOwner {
        uint256 oldPrice = mintPrice;
        mintPrice = _newPrice;
        emit MintPriceUpdated(oldPrice, _newPrice);
    }
    
    // Update media URL
    function setMediaUrl(string memory _newMediaUrl) external onlyOwner {
        require(bytes(_newMediaUrl).length > 0, "Media URL cannot be empty");
        string memory oldMediaUrl = media.mediaUrl;
        string memory oldThumbnailUrl = media.thumbnailUrl;
        
        media.mediaUrl = _newMediaUrl;
        
        emit MediaUpdated(oldMediaUrl, _newMediaUrl, oldThumbnailUrl, media.thumbnailUrl, media.mediaType);
        
        // Emit ERC-4906 compliant event to notify marketplaces of metadata update
        if (totalSupply > 0) {
            emit BatchMetadataUpdate(0, totalSupply - 1);
        }
    }
    
    // Update thumbnail URL
    function setThumbnailUrl(string memory _newThumbnailUrl) external onlyOwner {
        string memory oldThumbnailUrl = media.thumbnailUrl;
        media.thumbnailUrl = _newThumbnailUrl;
        
        emit ThumbnailUpdated(oldThumbnailUrl, _newThumbnailUrl);
        
        // Emit ERC-4906 compliant event to notify marketplaces of metadata update
        if (totalSupply > 0) {
            emit BatchMetadataUpdate(0, totalSupply - 1);
        }
    }
    
    // Update both media and thumbnail URLs
    function setMedia(string memory _newMediaUrl, string memory _newThumbnailUrl) external onlyOwner {
        require(bytes(_newMediaUrl).length > 0, "Media URL cannot be empty");
        
        string memory oldMediaUrl = media.mediaUrl;
        string memory oldThumbnailUrl = media.thumbnailUrl;
        
        media.mediaUrl = _newMediaUrl;
        media.thumbnailUrl = _newThumbnailUrl;
        
        emit MediaUpdated(oldMediaUrl, _newMediaUrl, oldThumbnailUrl, _newThumbnailUrl, media.mediaType);
        
        // Emit ERC-4906 compliant event to notify marketplaces of metadata update
        if (totalSupply > 0) {
            emit BatchMetadataUpdate(0, totalSupply - 1);
        }
    }
    
    // Get media information
    function getMediaInfo() external view returns (string memory mediaUrl, string memory thumbnailUrl, MediaType mediaType) {
        return (media.mediaUrl, media.thumbnailUrl, media.mediaType);
    }

    
    // Add addresses to whitelist
    function addToWhitelist(address[] calldata addresses) external onlyOwner {
        for (uint i = 0; i < addresses.length; i++) {
            whitelist[addresses[i]] = true;
        }
        emit WhitelistAdded(addresses);
    }
    
    // Remove addresses from whitelist
    function removeFromWhitelist(address[] calldata addresses) external onlyOwner {
        for (uint i = 0; i < addresses.length; i++) {
            whitelist[addresses[i]] = false;
        }
        emit WhitelistRemoved(addresses);
    }
    
    // Set whitelist mode
    function setWhitelistOnly(bool _whitelistOnly) external onlyOwner {
        whitelistOnly = _whitelistOnly;
        emit WhitelistStatusUpdated(_whitelistOnly);
    }
    
    function remainingMints(address wallet) external view returns (uint256) {
        return maxMintsPerWallet - mintsPerWallet[wallet];
    }
    
    // Pause minting
    function pause() external onlyOwner {
        _pause();
    }
    
    // Unpause minting
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // Withdraw ETH from contract
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    // Override supportsInterface to include ERC4906
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
} 