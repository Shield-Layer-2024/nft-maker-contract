const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NFTFactory", function () {
    let NFTFactory;
    let nftFactory;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    beforeEach(async function () {
        // Get the ContractFactory and Signers here.
        NFTFactory = await ethers.getContractFactory("NFTFactory");
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        // Deploy NFTFactory contract
        nftFactory = await NFTFactory.deploy();
        await nftFactory.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await nftFactory.owner()).to.equal(owner.address);
        });

        it("Should set initial creation fee to 0", async function () {
            expect(await nftFactory.creationFee()).to.equal(0);
        });
    });

    describe("Collection Creation", function () {
        const collectionName = "Test Collection";
        const collectionSymbol = "TC";
        const description = "Test Description";
        const maxSupply = 1000;
        const mintPrice = ethers.parseEther("0.1");
        const mediaUrl = "https://example.com/video.mp4";
        const thumbnailUrl = "https://example.com/thumbnail.png";
        const mediaType = 1; // VIDEO
        const whitelistOnly = true;
        const maxMintsPerWallet = 3;
        let mintStartTime;
        let mintEndTime;
        let initialWhitelist;

        beforeEach(async function() {
            initialWhitelist = [addr1.address, addr2.address];
            const currentTime = await time.latest();
            mintStartTime = currentTime + 3600;  // 1 hour from now
            mintEndTime = mintStartTime + 7200;  // 2 hours after start
        });

        it("Should create a new collection with correct parameters", async function () {
            const tx = await nftFactory.createCollection(
                collectionName,
                collectionSymbol,
                description,
                maxSupply,
                mintPrice,
                mediaUrl,
                thumbnailUrl,
                mediaType,
                whitelistOnly,
                initialWhitelist,
                maxMintsPerWallet,
                mintStartTime,
                mintEndTime
            );

            const receipt = await tx.wait();
            
            // Find the CollectionCreated event
            const collectionCreatedEvent = receipt.logs.find(log => {
                try {
                    const decoded = nftFactory.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return decoded.name === "CollectionCreated";
                } catch {
                    return false;
                }
            });
            
            expect(collectionCreatedEvent).to.not.be.undefined;
            
            // Get the decoded event data
            const decodedEvent = nftFactory.interface.parseLog({
                topics: collectionCreatedEvent.topics,
                data: collectionCreatedEvent.data
            });

            const { creator, collection, name, mediaUrl: media, thumbnailUrl: thumbnail, mediaType: type, maxSupply: supply, mintPrice: price, mintStartTime: start, mintEndTime: end } = decodedEvent.args;
            
            expect(creator).to.equal(owner.address);
            expect(collection).to.match(/^0x[a-fA-F0-9]{40}$/);
            expect(name).to.equal(collectionName);
            expect(media).to.equal(mediaUrl);
            expect(thumbnail).to.equal(thumbnailUrl);
            expect(type).to.equal(mediaType);
            expect(supply).to.equal(maxSupply);
            expect(price).to.equal(mintPrice);
            expect(start).to.equal(mintStartTime);
            expect(end).to.equal(mintEndTime);

            // Verify the deployed collection's parameters
            const NFTCollection = await ethers.getContractFactory("NFTCollection");
            const deployedCollection = NFTCollection.attach(collection);
            expect(await deployedCollection.description()).to.equal(description);
            expect(await deployedCollection.whitelistOnly()).to.equal(whitelistOnly);
            expect(await deployedCollection.maxMintsPerWallet()).to.equal(maxMintsPerWallet);
            expect(await deployedCollection.mintStartTime()).to.equal(mintStartTime);
            expect(await deployedCollection.mintEndTime()).to.equal(mintEndTime);
            expect(await deployedCollection.whitelist(addr1.address)).to.be.true;
            expect(await deployedCollection.whitelist(addr2.address)).to.be.true;
            
            // Verify media information
            const mediaInfo = await deployedCollection.getMediaInfo();
            expect(mediaInfo.mediaUrl).to.equal(mediaUrl);
            expect(mediaInfo.thumbnailUrl).to.equal(thumbnailUrl);
            expect(mediaInfo.mediaType).to.equal(mediaType);
        });

        it("Should create collection with no time restrictions", async function () {
            const tx = await nftFactory.createCollection(
                collectionName,
                collectionSymbol,
                description,
                maxSupply,
                mintPrice,
                mediaUrl,
                thumbnailUrl,
                mediaType,
                whitelistOnly,
                initialWhitelist,
                maxMintsPerWallet,
                0,  // No start time
                0   // No end time
            );

            const receipt = await tx.wait();
            const NFTCollection = await ethers.getContractFactory("NFTCollection");
            const collection = NFTCollection.attach(
                receipt.logs.find(log => {
                    try {
                        return nftFactory.interface.parseLog({
                            topics: log.topics,
                            data: log.data
                        }).name === "CollectionCreated";
                    } catch {
                        return false;
                    }
                }).args.collection
            );

            expect(await collection.mintStartTime()).to.equal(0);
            expect(await collection.mintEndTime()).to.equal(0);

            // Should be able to mint immediately
            await collection.connect(addr1).mint({ value: mintPrice });
        });

        it("Should fail when creation fee is insufficient", async function () {
            await nftFactory.setCreationFee(ethers.parseEther("1.0"));

            await expect(
                nftFactory.createCollection(
                    collectionName,
                    collectionSymbol,
                    description,
                    maxSupply,
                    mintPrice,
                    mediaUrl,
                    thumbnailUrl,
                    mediaType,
                    whitelistOnly,
                    initialWhitelist,
                    maxMintsPerWallet,
                    mintStartTime,
                    mintEndTime,
                    { value: ethers.parseEther("0.5") }
                )
            ).to.be.revertedWith("Insufficient creation fee");
        });

        it("Should fail with empty name", async function () {
            await expect(
                nftFactory.createCollection(
                    "",
                    collectionSymbol,
                    description,
                    maxSupply,
                    mintPrice,
                    mediaUrl,
                    thumbnailUrl,
                    mediaType,
                    whitelistOnly,
                    initialWhitelist,
                    maxMintsPerWallet,
                    mintStartTime,
                    mintEndTime
                )
            ).to.be.revertedWith("Name is required");
        });

        it("Should fail with empty symbol", async function () {
            await expect(
                nftFactory.createCollection(
                    collectionName,
                    "",
                    description,
                    maxSupply,
                    mintPrice,
                    mediaUrl,
                    thumbnailUrl,
                    mediaType,
                    whitelistOnly,
                    initialWhitelist,
                    maxMintsPerWallet,
                    mintStartTime,
                    mintEndTime
                )
            ).to.be.revertedWith("Symbol is required");
        });

        it("Should fail with zero max supply", async function () {
            await expect(
                nftFactory.createCollection(
                    collectionName,
                    collectionSymbol,
                    description,
                    0,
                    mintPrice,
                    mediaUrl,
                    thumbnailUrl,
                    mediaType,
                    whitelistOnly,
                    initialWhitelist,
                    maxMintsPerWallet,
                    mintStartTime,
                    mintEndTime
                )
            ).to.be.revertedWith("Max supply must be positive");
        });

        it("Should fail with zero max mints per wallet", async function () {
            await expect(
                nftFactory.createCollection(
                    collectionName,
                    collectionSymbol,
                    description,
                    maxSupply,
                    mintPrice,
                    mediaUrl,
                    thumbnailUrl,
                    mediaType,
                    whitelistOnly,
                    initialWhitelist,
                    0,
                    mintStartTime,
                    mintEndTime
                )
            ).to.be.revertedWith("Max mints per wallet must be positive");
        });

        it("Should fail with empty whitelist when whitelist only is true", async function () {
            await expect(
                nftFactory.createCollection(
                    collectionName,
                    collectionSymbol,
                    description,
                    maxSupply,
                    mintPrice,
                    mediaUrl,
                    thumbnailUrl,
                    mediaType,
                    true,
                    [],
                    maxMintsPerWallet,
                    mintStartTime,
                    mintEndTime
                )
            ).to.be.revertedWith("Whitelist is required");
        });
    });

    describe("Admin Functions", function () {
        let mintStartTime;
        let mintEndTime;

        beforeEach(async function() {
            const currentTime = await time.latest();
            mintStartTime = currentTime + 3600;  // 1 hour from now
            mintEndTime = mintStartTime + 7200;  // 2 hours after start
        });

        it("Should allow owner to set creation fee", async function () {
            const newFee = ethers.parseEther("1.0");
            await nftFactory.setCreationFee(newFee);
            expect(await nftFactory.creationFee()).to.equal(newFee);
        });

        it("Should not allow non-owner to set creation fee", async function () {
            const newFee = ethers.parseEther("1.0");
            await expect(
                nftFactory.connect(addr1).setCreationFee(newFee)
            ).to.be.revertedWithCustomError(nftFactory, "OwnableUnauthorizedAccount");
        });

        it("Should allow owner to withdraw funds", async function () {
            const fee = ethers.parseEther("1.0");
            await nftFactory.setCreationFee(fee);

            await nftFactory.createCollection(
                "Test",
                "TEST",
                "Test Collection",
                1000,
                ethers.parseEther("0.1"),
                "https://example.com/video.mp4",
                "https://example.com/thumbnail.png",
                1, // VIDEO
                false,
                [],
                3,
                mintStartTime,
                mintEndTime,
                { value: fee }
            );

            const initialBalance = await ethers.provider.getBalance(owner.address);
            await nftFactory.withdraw();
            const finalBalance = await ethers.provider.getBalance(owner.address);

            expect(finalBalance).to.be.gt(initialBalance);
        });

        it("Should not allow non-owner to withdraw", async function () {
            await expect(
                nftFactory.connect(addr1).withdraw()
            ).to.be.revertedWithCustomError(nftFactory, "OwnableUnauthorizedAccount");
        });

        it("Should allow owner to pause and unpause", async function () {
            await nftFactory.pause();
            
            await expect(
                nftFactory.createCollection(
                    "Test",
                    "TEST",
                    "Test Collection",
                    1000,
                    ethers.parseEther("0.1"),
                    "https://example.com/video.mp4",
                    "https://example.com/thumbnail.png",
                    1, // VIDEO
                    false,
                    [],
                    3,
                    mintStartTime,
                    mintEndTime
                )
            ).to.be.revertedWithCustomError(nftFactory, "EnforcedPause");

            await nftFactory.unpause();

            await expect(
                nftFactory.createCollection(
                    "Test",
                    "TEST",
                    "Test Collection",
                    1000,
                    ethers.parseEther("0.1"),
                    "https://example.com/video.mp4",
                    "https://example.com/thumbnail.png",
                    1, // VIDEO
                    false,
                    [],
                    3,
                    mintStartTime,
                    mintEndTime
                )
            ).to.not.be.reverted;
        });
    });

    describe("Media Type Support", function () {
        const collectionName = "Media Test Collection";
        const collectionSymbol = "MTC";
        const description = "Test media types";
        const maxSupply = 100;
        const mintPrice = ethers.parseEther("0.05");
        const whitelistOnly = false;
        const initialWhitelist = [];
        const maxMintsPerWallet = 5;
        let mintStartTime;
        let mintEndTime;

        beforeEach(async function() {
            const currentTime = await time.latest();
            mintStartTime = currentTime + 3600;
            mintEndTime = mintStartTime + 7200;
        });

        it("Should create IMAGE type collection", async function () {
            const imageUrl = "https://example.com/image.png";
            const thumbnailUrl = ""; // Empty for image type
            const mediaType = 0; // IMAGE

            const tx = await nftFactory.createCollection(
                collectionName,
                collectionSymbol,
                description,
                maxSupply,
                mintPrice,
                imageUrl,
                thumbnailUrl,
                mediaType,
                whitelistOnly,
                initialWhitelist,
                maxMintsPerWallet,
                mintStartTime,
                mintEndTime
            );

            const receipt = await tx.wait();
            const collectionCreatedEvent = receipt.logs.find(log => {
                try {
                    const decoded = nftFactory.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return decoded.name === "CollectionCreated";
                } catch {
                    return false;
                }
            });

            const decodedEvent = nftFactory.interface.parseLog({
                topics: collectionCreatedEvent.topics,
                data: collectionCreatedEvent.data
            });

            expect(decodedEvent.args.mediaType).to.equal(0); // IMAGE
        });

        it("Should create VIDEO type collection", async function () {
            const videoUrl = "https://example.com/video.mp4";
            const thumbnailUrl = "https://example.com/thumbnail.png";
            const mediaType = 1; // VIDEO

            const tx = await nftFactory.createCollection(
                collectionName,
                collectionSymbol,
                description,
                maxSupply,
                mintPrice,
                videoUrl,
                thumbnailUrl,
                mediaType,
                whitelistOnly,
                initialWhitelist,
                maxMintsPerWallet,
                mintStartTime,
                mintEndTime
            );

            const receipt = await tx.wait();
            const collectionCreatedEvent = receipt.logs.find(log => {
                try {
                    const decoded = nftFactory.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return decoded.name === "CollectionCreated";
                } catch {
                    return false;
                }
            });

            const decodedEvent = nftFactory.interface.parseLog({
                topics: collectionCreatedEvent.topics,
                data: collectionCreatedEvent.data
            });

            expect(decodedEvent.args.mediaType).to.equal(1); // VIDEO
        });

        it("Should create AUDIO type collection", async function () {
            const audioUrl = "https://example.com/audio.mp3";
            const thumbnailUrl = "https://example.com/cover.png";
            const mediaType = 2; // AUDIO

            const tx = await nftFactory.createCollection(
                collectionName,
                collectionSymbol,
                description,
                maxSupply,
                mintPrice,
                audioUrl,
                thumbnailUrl,
                mediaType,
                whitelistOnly,
                initialWhitelist,
                maxMintsPerWallet,
                mintStartTime,
                mintEndTime
            );

            const receipt = await tx.wait();
            const collectionCreatedEvent = receipt.logs.find(log => {
                try {
                    const decoded = nftFactory.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return decoded.name === "CollectionCreated";
                } catch {
                    return false;
                }
            });

            const decodedEvent = nftFactory.interface.parseLog({
                topics: collectionCreatedEvent.topics,
                data: collectionCreatedEvent.data
            });

            expect(decodedEvent.args.mediaType).to.equal(2); // AUDIO
        });

        it("Should create MODEL_3D type collection", async function () {
            const modelUrl = "https://example.com/model.glb";
            const thumbnailUrl = "https://example.com/model-preview.png";
            const mediaType = 3; // MODEL_3D

            const tx = await nftFactory.createCollection(
                collectionName,
                collectionSymbol,
                description,
                maxSupply,
                mintPrice,
                modelUrl,
                thumbnailUrl,
                mediaType,
                whitelistOnly,
                initialWhitelist,
                maxMintsPerWallet,
                mintStartTime,
                mintEndTime
            );

            const receipt = await tx.wait();
            const collectionCreatedEvent = receipt.logs.find(log => {
                try {
                    const decoded = nftFactory.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return decoded.name === "CollectionCreated";
                } catch {
                    return false;
                }
            });

            const decodedEvent = nftFactory.interface.parseLog({
                topics: collectionCreatedEvent.topics,
                data: collectionCreatedEvent.data
            });

            expect(decodedEvent.args.mediaType).to.equal(3); // MODEL_3D
        });

        it("Should fail with invalid media type", async function () {
            const mediaUrl = "https://example.com/file.unknown";
            const thumbnailUrl = "https://example.com/thumb.png";
            const invalidMediaType = 99; // Invalid

            await expect(
                nftFactory.createCollection(
                    collectionName,
                    collectionSymbol,
                    description,
                    maxSupply,
                    mintPrice,
                    mediaUrl,
                    thumbnailUrl,
                    invalidMediaType,
                    whitelistOnly,
                    initialWhitelist,
                    maxMintsPerWallet,
                    mintStartTime,
                    mintEndTime
                )
            ).to.be.revertedWith("Invalid media type");
        });

        it("Should fail with empty media URL", async function () {
            const mediaUrl = ""; // Empty
            const thumbnailUrl = "https://example.com/thumb.png";
            const mediaType = 1; // VIDEO

            await expect(
                nftFactory.createCollection(
                    collectionName,
                    collectionSymbol,
                    description,
                    maxSupply,
                    mintPrice,
                    mediaUrl,
                    thumbnailUrl,
                    mediaType,
                    whitelistOnly,
                    initialWhitelist,
                    maxMintsPerWallet,
                    mintStartTime,
                    mintEndTime
                )
            ).to.be.revertedWith("Media URL is required");
        });
    });
});