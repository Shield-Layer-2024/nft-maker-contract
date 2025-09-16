const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NFTCollection", function () {
    let NFTCollection;
    let nftCollection;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    const name = "Test NFT";
    const symbol = "TNFT";
    const description = "Test Description";
    const maxSupply = 1000;
    const mintPrice = ethers.parseEther("0.1");
    const mediaUrl = "https://example.com/video.mp4";
    const thumbnailUrl = "https://example.com/thumbnail.png";
    const mediaType = 1; // VIDEO
    const whitelistOnly = false;
    const maxMintsPerWallet = 3;
    const mintStartTime = 0;  // No restriction by default
    const mintEndTime = 0;    // No restriction by default

    beforeEach(async function () {
        NFTCollection = await ethers.getContractFactory("NFTCollection");
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        const initialWhitelist = [addr1.address];
        nftCollection = await NFTCollection.deploy(
            name,
            symbol,
            description,
            maxSupply,
            mintPrice,
            owner.address,
            mediaUrl,
            thumbnailUrl,
            mediaType,
            whitelistOnly,
            initialWhitelist,
            maxMintsPerWallet,
            mintStartTime,
            mintEndTime
        );
        await nftCollection.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the correct initial values", async function () {
            expect(await nftCollection.name()).to.equal(name);
            expect(await nftCollection.symbol()).to.equal(symbol);
            expect(await nftCollection.description()).to.equal(description);
            expect(await nftCollection.maxSupply()).to.equal(maxSupply);
            expect(await nftCollection.mintPrice()).to.equal(mintPrice);
            // Verify media information
            const mediaInfo = await nftCollection.getMediaInfo();
            expect(mediaInfo.mediaUrl).to.equal(mediaUrl);
            expect(mediaInfo.thumbnailUrl).to.equal(thumbnailUrl);
            expect(mediaInfo.mediaType).to.equal(mediaType);
            expect(await nftCollection.owner()).to.equal(owner.address);
            expect(await nftCollection.totalSupply()).to.equal(0);
            expect(await nftCollection.whitelistOnly()).to.equal(whitelistOnly);
            expect(await nftCollection.maxMintsPerWallet()).to.equal(maxMintsPerWallet);
        });

        it("Should initialize whitelist correctly", async function () {
            expect(await nftCollection.whitelist(addr1.address)).to.be.true;
            expect(await nftCollection.whitelist(addr2.address)).to.be.false;
            expect(await nftCollection.whitelistOnly()).to.be.false;
        });
    });

    describe("Minting", function () {
        it("Should allow minting with correct payment", async function () {
            await nftCollection.connect(addr1).mint({ value: mintPrice });
            expect(await nftCollection.totalSupply()).to.equal(1);
            expect(await nftCollection.ownerOf(0)).to.equal(addr1.address);
            expect(await nftCollection.mintsPerWallet(addr1.address)).to.equal(1);
        });

        it("Should fail when minting with insufficient payment", async function () {
            const lowPrice = ethers.parseEther("0.05");
            await expect(
                nftCollection.connect(addr1).mint({ value: lowPrice })
            ).to.be.revertedWith("Insufficient payment");
        });

        it("Should fail when max supply is reached", async function () {
            const smallMaxSupply = 2;
            const collection = await NFTCollection.deploy(
                name, symbol, description, smallMaxSupply, mintPrice,
                owner.address, mediaUrl, thumbnailUrl, mediaType, whitelistOnly, [], maxMintsPerWallet,
                0, 0  // No time restrictions
            );

            await collection.connect(addr1).mint({ value: mintPrice });
            await collection.connect(addr1).mint({ value: mintPrice });

            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWith("Max supply reached");
        });

        it("Should respect max mints per wallet", async function () {
            const smallMaxMints = 2;
            const collection = await NFTCollection.deploy(
                name, symbol, description, maxSupply, mintPrice,
                owner.address, mediaUrl, thumbnailUrl, mediaType, whitelistOnly, [], smallMaxMints,
                0, 0  // No time restrictions
            );

            await collection.connect(addr1).mint({ value: mintPrice });
            await collection.connect(addr1).mint({ value: mintPrice });

            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWith("Max mints per wallet reached");

            expect(await collection.mintsPerWallet(addr1.address)).to.equal(2);
            expect(await collection.remainingMints(addr1.address)).to.equal(0);
        });

        it("Should respect whitelist when enabled", async function () {
            await nftCollection.setWhitelistOnly(true);

            // addr1 is whitelisted, should succeed
            await expect(
                nftCollection.connect(addr1).mint({ value: mintPrice })
            ).to.not.be.reverted;

            // addr2 is not whitelisted, should fail
            await expect(
                nftCollection.connect(addr2).mint({ value: mintPrice })
            ).to.be.revertedWith("Not whitelisted");
        });
    });

    describe("Whitelist Management", function () {
        it("Should allow owner to add addresses to whitelist", async function () {
            const newAddresses = [addr2.address, addrs[0].address];
            await nftCollection.addToWhitelist(newAddresses);

            expect(await nftCollection.whitelist(addr2.address)).to.be.true;
            expect(await nftCollection.whitelist(addrs[0].address)).to.be.true;
        });

        it("Should allow owner to remove addresses from whitelist", async function () {
            const addresses = [addr1.address];
            await nftCollection.removeFromWhitelist(addresses);

            expect(await nftCollection.whitelist(addr1.address)).to.be.false;
        });

        it("Should emit events when modifying whitelist", async function () {
            const addresses = [addr2.address];

            await expect(nftCollection.addToWhitelist(addresses))
                .to.emit(nftCollection, "WhitelistAdded")
                .withArgs(addresses);

            await expect(nftCollection.removeFromWhitelist(addresses))
                .to.emit(nftCollection, "WhitelistRemoved")
                .withArgs(addresses);
        });

        it("Should not allow non-owner to modify whitelist", async function () {
            const addresses = [addr2.address];

            await expect(
                nftCollection.connect(addr1).addToWhitelist(addresses)
            ).to.be.revertedWithCustomError(nftCollection, "OwnableUnauthorizedAccount");

            await expect(
                nftCollection.connect(addr1).removeFromWhitelist(addresses)
            ).to.be.revertedWithCustomError(nftCollection, "OwnableUnauthorizedAccount");
        });
    });

    describe("Token URI", function () {
        it("Should generate correct token URI", async function () {
            await nftCollection.connect(addr1).mint({ value: mintPrice });
            const tokenURI = await nftCollection.tokenURI(0);

            expect(tokenURI).to.include("data:application/json;base64,");
            
            // Decode base64 and parse JSON
            const base64Data = tokenURI.split(",")[1];
            const jsonData = JSON.parse(
                Buffer.from(base64Data, "base64").toString()
            );
            expect(jsonData.name).to.equal(name);
            expect(jsonData.description).to.equal(description);
            expect(jsonData.image).to.equal(thumbnailUrl); // For VIDEO type, image should be thumbnail
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to update mint price", async function () {
            const newPrice = ethers.parseEther("0.2");
            await expect(nftCollection.setMintPrice(newPrice))
                .to.emit(nftCollection, "MintPriceUpdated")
                .withArgs(mintPrice, newPrice);

            expect(await nftCollection.mintPrice()).to.equal(newPrice);
        });

        it("Should allow owner to withdraw funds", async function () {
            // First mint an NFT to add funds to contract
            await nftCollection.connect(addr1).mint({ value: mintPrice });

            const initialBalance = await ethers.provider.getBalance(owner.address);
            await nftCollection.withdraw();
            const finalBalance = await ethers.provider.getBalance(owner.address);

            expect(finalBalance).to.be.gt(initialBalance);
        });

        it("Should allow owner to pause and unpause", async function () {
            await nftCollection.pause();
            
            await expect(
                nftCollection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWithCustomError(nftCollection, "EnforcedPause");

            await nftCollection.unpause();

            await expect(
                nftCollection.connect(addr1).mint({ value: mintPrice })
            ).to.not.be.reverted;
        });
    });

    describe("Minting Time Control", function () {
        it("Should respect start time restriction", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600; // 1 hour from now
            const endTime = startTime + 7200;     // 2 hours from start

            const collection = await NFTCollection.deploy(
                name, symbol, description, maxSupply, mintPrice,
                owner.address, mediaUrl, thumbnailUrl, mediaType, whitelistOnly, [], maxMintsPerWallet,
                startTime, endTime
            );

            // Try minting before start time
            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWith("Minting not started");

            // Move time forward to after start time
            await time.increaseTo(startTime + 1);

            // Should be able to mint now
            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.not.be.reverted;
        });

        it("Should respect end time restriction", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;  // 1 hour from now
            const endTime = startTime + 7200;      // 2 hours from start

            const collection = await NFTCollection.deploy(
                name, symbol, description, maxSupply, mintPrice,
                owner.address, mediaUrl, thumbnailUrl, mediaType, whitelistOnly, [], maxMintsPerWallet,
                startTime, endTime
            );

            // Move time to active period
            await time.increaseTo(startTime + 1);
            await collection.connect(addr1).mint({ value: mintPrice });

            // Move time to after end time
            await time.increaseTo(endTime + 1);

            // Should not be able to mint after end time
            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWith("Minting ended");
        });

        it("Should allow minting with no time restrictions", async function () {
            const collection = await NFTCollection.deploy(
                name, symbol, description, maxSupply, mintPrice,
                owner.address, mediaUrl, thumbnailUrl, mediaType, whitelistOnly, [], maxMintsPerWallet,
                0, 0  // No time restrictions
            );

            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.not.be.reverted;
        });

        it("Should fail deployment with invalid time window", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;
            const endTime = startTime - 1;  // End time before start time

            await expect(
                NFTCollection.deploy(
                    name, symbol, description, maxSupply, mintPrice,
                    owner.address, mediaUrl, thumbnailUrl, mediaType, whitelistOnly, [], maxMintsPerWallet,
                    startTime, endTime
                )
            ).to.be.revertedWith("End time must be after start time");
        });

        it("Should fail deployment with past start time", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime - 3600;  // 1 hour ago
            const endTime = currentTime + 3600;    // 1 hour from now

            await expect(
                NFTCollection.deploy(
                    name, symbol, description, maxSupply, mintPrice,
                    owner.address, mediaUrl, thumbnailUrl, mediaType, whitelistOnly, [], maxMintsPerWallet,
                    startTime, endTime
                )
            ).to.be.revertedWith("Start time must be in the future");
        });
    });

    describe("Media Update", function () {
        it("Should allow owner to update media URL", async function () {
            const newMediaUrl = "https://yellow-advanced-tapir-566.mypinata.cloud/ipfs/bafkreihm66otwb66msutwb5opa2vgdsbnicb6cndwzh7mhprmrziu5qevm";
            const oldMediaInfo = await nftCollection.getMediaInfo();
            
            await expect(nftCollection.setMediaUrl(newMediaUrl))
                .to.emit(nftCollection, "MediaUpdated")
                .withArgs(oldMediaInfo.mediaUrl, newMediaUrl, oldMediaInfo.thumbnailUrl, oldMediaInfo.thumbnailUrl, oldMediaInfo.mediaType);
                
            const updatedMediaInfo = await nftCollection.getMediaInfo();
            expect(updatedMediaInfo.mediaUrl).to.equal(newMediaUrl);
        });

        it("Should allow owner to update thumbnail URL", async function () {
            const newThumbnailUrl = "https://example.com/new-thumbnail.png";
            const oldMediaInfo = await nftCollection.getMediaInfo();
            
            await expect(nftCollection.setThumbnailUrl(newThumbnailUrl))
                .to.emit(nftCollection, "ThumbnailUpdated")
                .withArgs(oldMediaInfo.thumbnailUrl, newThumbnailUrl);
                
            const updatedMediaInfo = await nftCollection.getMediaInfo();
            expect(updatedMediaInfo.thumbnailUrl).to.equal(newThumbnailUrl);
        });

        it("Should allow owner to update both media and thumbnail URLs", async function () {
            const newMediaUrl = "https://example.com/new-video.mp4";
            const newThumbnailUrl = "https://example.com/new-thumbnail.png";
            const oldMediaInfo = await nftCollection.getMediaInfo();
            
            await expect(nftCollection.setMedia(newMediaUrl, newThumbnailUrl))
                .to.emit(nftCollection, "MediaUpdated")
                .withArgs(oldMediaInfo.mediaUrl, newMediaUrl, oldMediaInfo.thumbnailUrl, newThumbnailUrl, oldMediaInfo.mediaType);
                
            const updatedMediaInfo = await nftCollection.getMediaInfo();
            expect(updatedMediaInfo.mediaUrl).to.equal(newMediaUrl);
            expect(updatedMediaInfo.thumbnailUrl).to.equal(newThumbnailUrl);
        });

        it("Should not allow non-owner to update media", async function () {
            const newMediaUrl = "https://example.com/new-video.mp4";
            
            await expect(
                nftCollection.connect(addr1).setMediaUrl(newMediaUrl)
            ).to.be.revertedWithCustomError(nftCollection, "OwnableUnauthorizedAccount");
        });

        it("Should reject empty media URL", async function () {
            await expect(
                nftCollection.setMediaUrl("")
            ).to.be.revertedWith("Media URL cannot be empty");
        });

        it("Should update tokenURI after media change", async function () {
            // First mint an NFT
            await nftCollection.connect(addr1).mint({ value: mintPrice });
            const originalTokenURI = await nftCollection.tokenURI(0);
            
            // Update media
            const newMediaUrl = "https://yellow-advanced-tapir-566.mypinata.cloud/ipfs/bafkreihm66otwb66msutwb5opa2vgdsbnicb6cndwzh7mhprmrziu5qevm";
            await nftCollection.setMediaUrl(newMediaUrl);
            
            // Check that tokenURI reflects new media
            const updatedTokenURI = await nftCollection.tokenURI(0);
            expect(updatedTokenURI).to.not.equal(originalTokenURI);
            
            // Decode and verify new media in metadata
            const base64Data = updatedTokenURI.split(",")[1];
            const jsonData = JSON.parse(
                Buffer.from(base64Data, "base64").toString()
            );
            expect(jsonData.animation_url).to.equal(newMediaUrl); // For VIDEO type, check animation_url
            expect(jsonData.external_url).to.equal("https://shieldlayer.xyz");
            expect(jsonData.attributes).to.be.an('array');
        });

        it("Should emit BatchMetadataUpdate event when image is updated", async function () {
            // First mint an NFT
            await nftCollection.connect(addr1).mint({ value: mintPrice });
            
            // Update media and check for BatchMetadataUpdate event
            const newMediaUrl = "https://yellow-advanced-tapir-566.mypinata.cloud/ipfs/bafkreihm66otwb66msutwb5opa2vgdsbnicb6cndwzh7mhprmrziu5qevm";
            const oldMediaInfo = await nftCollection.getMediaInfo();
            await expect(nftCollection.setMediaUrl(newMediaUrl))
                .to.emit(nftCollection, "MediaUpdated")
                .withArgs(oldMediaInfo.mediaUrl, newMediaUrl, oldMediaInfo.thumbnailUrl, oldMediaInfo.thumbnailUrl, oldMediaInfo.mediaType)
                .and.to.emit(nftCollection, "BatchMetadataUpdate")
                .withArgs(0, 0);
        });

        it("Should support ERC4906 interface", async function () {
            // ERC4906 interface ID is 0x49064906
            expect(await nftCollection.supportsInterface("0x49064906")).to.be.true;
        });
    });

    describe("Metadata Generation", function () {
        beforeEach(async function () {
            // Mint a token for testing
            await nftCollection.connect(addr1).mint({ value: mintPrice });
        });

        it("Should generate correct metadata for VIDEO type", async function () {
            const tokenURI = await nftCollection.tokenURI(0);
            
            // Decode base64 and parse JSON
            const base64Data = tokenURI.split(',')[1];
            const jsonString = Buffer.from(base64Data, 'base64').toString();
            const metadata = JSON.parse(jsonString);
            
            expect(metadata.name).to.equal(name);
            expect(metadata.description).to.equal(description);
            expect(metadata.image).to.equal(thumbnailUrl); // For VIDEO, image should be thumbnail
            expect(metadata.animation_url).to.equal(mediaUrl); // animation_url should be the video
            expect(metadata.attributes).to.be.an('array');
            
            // Check for media type attribute
            const mediaTypeAttr = metadata.attributes.find(attr => attr.trait_type === "Media Type");
            expect(mediaTypeAttr.value).to.equal("Video");
        });

        it("Should generate correct metadata for IMAGE type", async function () {
            // Deploy a new collection with IMAGE type
            const imageCollection = await NFTCollection.deploy(
                "Image NFT",
                "IMG",
                "Image Description",
                maxSupply,
                mintPrice,
                owner.address,
                "https://example.com/image.png",
                "", // No thumbnail for image
                0, // IMAGE type
                whitelistOnly,
                [addr1.address],
                maxMintsPerWallet,
                mintStartTime,
                mintEndTime
            );
            await imageCollection.waitForDeployment();
            
            // Mint a token
            await imageCollection.connect(addr1).mint({ value: mintPrice });
            
            const tokenURI = await imageCollection.tokenURI(0);
            
            // Decode base64 and parse JSON
            const base64Data = tokenURI.split(',')[1];
            const jsonString = Buffer.from(base64Data, 'base64').toString();
            const metadata = JSON.parse(jsonString);
            
            expect(metadata.name).to.equal("Image NFT");
            expect(metadata.image).to.equal("https://example.com/image.png"); // For IMAGE, image should be the media URL
            expect(metadata.animation_url).to.be.undefined; // No animation_url for images
            
            // Check for media type attribute
            const mediaTypeAttr = metadata.attributes.find(attr => attr.trait_type === "Media Type");
            expect(mediaTypeAttr.value).to.equal("Image");
        });

        it("Should generate correct metadata for AUDIO type", async function () {
            // Deploy a new collection with AUDIO type
            const audioCollection = await NFTCollection.deploy(
                "Audio NFT",
                "AUD",
                "Audio Description",
                maxSupply,
                mintPrice,
                owner.address,
                "https://example.com/audio.mp3",
                "https://example.com/cover.png",
                2, // AUDIO type
                whitelistOnly,
                [addr1.address],
                maxMintsPerWallet,
                mintStartTime,
                mintEndTime
            );
            await audioCollection.waitForDeployment();
            
            // Mint a token
            await audioCollection.connect(addr1).mint({ value: mintPrice });
            
            const tokenURI = await audioCollection.tokenURI(0);
            
            // Decode base64 and parse JSON
            const base64Data = tokenURI.split(',')[1];
            const jsonString = Buffer.from(base64Data, 'base64').toString();
            const metadata = JSON.parse(jsonString);
            
            expect(metadata.name).to.equal("Audio NFT");
            expect(metadata.image).to.equal("https://example.com/cover.png"); // For AUDIO, image should be cover
            expect(metadata.animation_url).to.equal("https://example.com/audio.mp3"); // animation_url should be the audio
            
            // Check for media type attribute
            const mediaTypeAttr = metadata.attributes.find(attr => attr.trait_type === "Media Type");
            expect(mediaTypeAttr.value).to.equal("Audio");
        });

        it("Should generate correct metadata for MODEL_3D type", async function () {
            // Deploy a new collection with MODEL_3D type
            const modelCollection = await NFTCollection.deploy(
                "3D Model NFT",
                "3D",
                "3D Model Description",
                maxSupply,
                mintPrice,
                owner.address,
                "https://example.com/model.glb",
                "https://example.com/model-preview.png",
                3, // MODEL_3D type
                whitelistOnly,
                [addr1.address],
                maxMintsPerWallet,
                mintStartTime,
                mintEndTime
            );
            await modelCollection.waitForDeployment();
            
            // Mint a token
            await modelCollection.connect(addr1).mint({ value: mintPrice });
            
            const tokenURI = await modelCollection.tokenURI(0);
            
            // Decode base64 and parse JSON
            const base64Data = tokenURI.split(',')[1];
            const jsonString = Buffer.from(base64Data, 'base64').toString();
            const metadata = JSON.parse(jsonString);
            
            expect(metadata.name).to.equal("3D Model NFT");
            expect(metadata.image).to.equal("https://example.com/model-preview.png"); // For 3D, image should be preview
            expect(metadata.animation_url).to.equal("https://example.com/model.glb"); // animation_url should be the model
            
            // Check for media type attribute
            const mediaTypeAttr = metadata.attributes.find(attr => attr.trait_type === "Media Type");
            expect(mediaTypeAttr.value).to.equal("3D Model");
        });
    });
});